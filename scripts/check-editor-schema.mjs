import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import ts from "typescript";
import { getSchema } from "@tiptap/core";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, "artifacts/editor-schema");
await mkdir(output, { recursive: true });
// Transpile the single DOM-free production factory. Package imports resolve to
// the installed lockfile versions from artifacts/; no copied extension config.
const factoryPath = resolve(output, "editor-schema.mjs");
const factorySource = await readFile(
  resolve(root, "src/editor-schema.ts"),
  "utf8",
);
await writeFile(
  factoryPath,
  ts.transpileModule(factorySource, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText,
);
const { createEditorExtensions } = await import(pathToFileURL(factoryPath));
const nodeView = () => {
  throw new Error("Schema crosscheck must never instantiate DOM node views");
};
const schema = getSchema(
  createEditorExtensions({ attachment: nodeView, drawing: nodeView }),
);
const attrs = (type) =>
  Object.fromEntries(
    Object.entries(type.attrs).map(([key, attr]) => [
      key,
      {
        required: !attr.hasDefault,
        ...(attr.hasDefault ? { default: attr.default } : {}),
      },
    ]),
  );
const manifest = {
  version: 1,
  nodes: Object.fromEntries(
    Object.entries(schema.nodes).map(([name, type]) => [
      name,
      {
        content: type.spec.content || "",
        groups: (type.spec.group || "").split(" ").filter(Boolean),
        marks: Object.values(schema.marks)
          .filter((mark) => type.allowsMarkType(mark))
          .map((mark) => mark.name),
        attrs: attrs(type),
      },
    ]),
  ),
  marks: Object.fromEntries(
    Object.entries(schema.marks).map(([name, type]) => [
      name,
      {
        rank: type.rank,
        excludes: Object.values(schema.marks)
          .filter((other) => type.excludes(other))
          .map((other) => other.name),
        attrs: attrs(type),
      },
    ]),
  ),
};
const manifestPath = resolve(
  root,
  "src-tauri/src/store/archive/document-schema.json",
);
if (process.argv.includes("--write-manifest")) {
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}
assert.deepEqual(
  JSON.parse(await readFile(manifestPath, "utf8")),
  manifest,
  "Editor schema changed; review the Rust content/attribute rules and regenerate its manifest explicitly.",
);
const corpus = JSON.parse(
  await readFile(
    resolve(root, "src-tauri/src/store/archive/document-cases.json"),
    "utf8",
  ),
);
const results = corpus.map((test) => {
  let accepted = true,
    error = null;
  try {
    schema.nodeFromJSON(test.document).check();
  } catch (e) {
    accepted = false;
    error = e.message;
  }
  assert.equal(
    accepted,
    test.schemaAccepted,
    `Actual frontend schema mismatch for ${test.name}`,
  );
  return {
    name: test.name,
    schemaAccepted: accepted,
    importExpected: test.importAccepted,
    error,
  };
});
const result = {
  factory: "src/editor-schema.ts",
  nodes: Object.keys(schema.nodes).length,
  marks: Object.keys(schema.marks).length,
  manifestEqual: true,
  cases: results,
};
const archivesArg = process.argv.indexOf("--reject-archives");
if (archivesArg >= 0) {
  const directory = resolve(process.argv[archivesArg + 1]);
  result.archives = [];
  for (const name of (await readdir(directory))
    .filter((name) => name.endsWith(".notesbackup"))
    .sort()) {
    const bytes = await readFile(resolve(directory, name));
    const archive = JSON.parse(bytes);
    let accepted = true,
      error = null;
    try {
      schema.nodeFromJSON(archive.notes[0].document).check();
    } catch (e) {
      accepted = false;
      error = e.message;
    }
    assert.equal(
      accepted,
      false,
      `Independent bad fixture unexpectedly accepted: ${name}`,
    );
    result.archives.push({
      name,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      schemaAccepted: accepted,
      error,
    });
  }
}
const resultArg = process.argv.indexOf("--output");
const resultPath =
  resultArg >= 0
    ? resolve(process.argv[resultArg + 1])
    : resolve(output, "result.json");
await mkdir(dirname(resultPath), { recursive: true });
await writeFile(resultPath, JSON.stringify(result, null, 2) + "\n");
console.log(
  `Actual Editor schema matches embedded manifest; ${results.length} document cases checked. Result: ${resultPath}`,
);
