import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const output = resolve("artifacts/editor-hot-path");
await mkdir(output, { recursive: true });
const transpile = async (name, replacements = {}) => {
  const path = resolve(output, `${name}.mjs`);
  let code = ts.transpileModule(await readFile(`src/${name}.ts`, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  for (const [from, to] of Object.entries(replacements))
    code = code.replaceAll(from, to);
  await writeFile(path, code);
  return path;
};
const tagsPath = await transpile("note-tags");
const snapshotPath = await transpile("editor-save-snapshot", {
  '"./note-tags"': '"./note-tags.mjs"',
});
const typesPath = await transpile("types");
const { documentTags } = await import(pathToFileURL(tagsPath));
const { editorSaveSnapshot } = await import(pathToFileURL(snapshotPath));
const { documentText } = await import(pathToFileURL(typesPath));

const tag = (name) => ({ type: "noteTag", attrs: { name } });
const text = (value, marks) => ({
  type: "text",
  text: value,
  ...(marks ? { marks } : {}),
});
const paragraph = (...content) => ({ type: "paragraph", content });
const legal = {
  type: "doc",
  content: [
    paragraph(text("#Keep", [tag("Keep")]), text(" ")),
    paragraph(text("ordinary")),
  ],
};
const invalid = {
  type: "doc",
  content: [
    paragraph(text("#Broken", [tag("Other")]), text(" ")),
    paragraph(text("ordinary")),
  ],
};

assert.equal(editorSaveSnapshot(legal), legal, "legal snapshot must not clone");
const repaired = editorSaveSnapshot(invalid);
assert.notEqual(repaired, invalid);
assert.equal(repaired.content[0].content[0].marks, undefined);
assert.deepEqual(invalid.content[0].content[0].marks, [tag("Other")]);
assert.equal(documentTags(legal), documentTags(legal), "tags are reused by document identity");
assert.deepEqual(documentTags(legal), ["Keep"]);
assert.equal(documentText(legal), documentText(legal), "plain text is reused by document identity");
assert.equal(documentText(legal), "#Keep \nordinary");

await writeFile(
  resolve(output, "result.json"),
  JSON.stringify(
    {
      legalSnapshotIdentity: true,
      invalidSnapshotCloneAndRepair: true,
      originalInvalidDocumentUnchanged: true,
      documentTagCacheIdentity: true,
      documentTextCacheIdentity: true,
    },
    null,
    2,
  ) + "\n",
);
console.log("Editor hot path: snapshot fast path and document caches passed.");
