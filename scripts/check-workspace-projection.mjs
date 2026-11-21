import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const output = resolve("artifacts/workspace-projection");
await mkdir(output, { recursive: true });
const transpile = async (name, replacements = {}) => {
  let code = ts.transpileModule(
    await readFile(`src/${name}.ts`, "utf8"),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    },
  ).outputText;
  for (const [from, to] of Object.entries(replacements))
    code = code.replaceAll(from, to);
  await writeFile(resolve(output, `${name}.mjs`), code);
};

await writeFile(
  resolve(output, "appearance-stub.mjs"),
  "export const normalizeAppearanceSettings = (value) => value;\n",
);
await transpile("types");
await transpile("note-tags", { '"./types"': '"./types.mjs"' });
await transpile("smart-folders", {
  '"./themes/appearance"': '"./appearance-stub.mjs"',
  '"./note-tags"': '"./note-tags.mjs"',
  '"./types"': '"./types.mjs"',
});
await transpile("workspace-projection", {
  '"./note-tags"': '"./note-tags.mjs"',
  '"./smart-folders"': '"./smart-folders.mjs"',
  '"./types"': '"./types.mjs"',
});

const { projectTags } = await import(
  pathToFileURL(resolve(output, "note-tags.mjs"))
);
const { projectFolders, sortNotes } = await import(
  pathToFileURL(resolve(output, "smart-folders.mjs"))
);
const { projectWorkspace } = await import(
  pathToFileURL(resolve(output, "workspace-projection.mjs"))
);

const paragraph = (text) => ({
  type: "paragraph",
  content: text ? [{ type: "text", text }] : undefined,
});
const tagged = (text, name) => ({
  type: "paragraph",
  content: [
    {
      type: "text",
      text,
      marks: [{ type: "noteTag", attrs: { name } }],
    },
  ],
});
const note = (id, overrides = {}) => ({
  id,
  folderId: "default",
  document: { type: "doc", content: [paragraph(id)] },
  title: id,
  plainText: id,
  createdAt: 1,
  updatedAt: 1,
  pinned: false,
  deletedAt: null,
  originalFolderId: null,
  locked: false,
  paperStyle: "plain",
  revision: 0,
  ...overrides,
});

const workspace = {
  folders: [
    { id: "default", name: "默认", kind: "default", parentId: null, sortOrder: 0, createdAt: 1 },
    { id: "normal", name: "普通", kind: "normal", parentId: null, sortOrder: 1, createdAt: 1 },
    {
      id: "smart",
      name: "智能",
      kind: "smart",
      parentId: null,
      sortOrder: 2,
      createdAt: 1,
      definitionRevision: 4,
      query: {
        version: 1,
        combine: "all",
        rules: [
          { type: "tags", mode: "allSelected", names: ["alpha"] },
          { type: "pinned", value: true },
        ],
      },
    },
  ],
  notes: [
    note("alpha", {
      document: { type: "doc", content: [tagged("#alpha", "alpha")] },
      pinned: true,
      updatedAt: 40,
    }),
    note("beta", {
      folderId: "normal",
      document: { type: "doc", content: [tagged("#beta", "beta")] },
      updatedAt: 30,
    }),
    note("locked", {
      locked: true,
      document: { type: "doc", content: [tagged("#alpha", "alpha")] },
      updatedAt: 20,
    }),
    note("deleted", {
      deletedAt: 10,
      document: { type: "doc", content: [tagged("#alpha", "alpha")] },
      updatedAt: 10,
    }),
    note("blocked", {
      document: { type: "doc", content: [tagged("#alpha", "alpha")] },
      updatedAt: 50,
    }),
    note("epoch", {
      deletedAt: 0,
      document: { type: "doc", content: [tagged("#alpha", "alpha")] },
      updatedAt: 5,
    }),
    note("plain", { updatedAt: 60 }),
  ],
  attachments: [],
  settings: {},
  access: {
    sessionId: "session",
    epoch: 1,
    notes: {},
    suspended: ["blocked"],
    operationId: null,
  },
};

const cases = [
  { suspended: [], sort: "updated" },
  { suspended: ["beta"], sort: "created" },
  { suspended: [], sort: "title" },
];
for (const { suspended, sort } of cases) {
  const actual = projectWorkspace(workspace, suspended, sort);
  assert.deepEqual(actual.ordered, sortNotes(workspace.notes, sort));
  assert.deepEqual(actual.tags, projectTags(workspace, suspended));
  assert.deepEqual(actual.folders, projectFolders(workspace, suspended, sort));
}

const projection = projectWorkspace(workspace, [], "updated");
assert.deepEqual(projection.tags.catalog, [["alpha", 2], ["beta", 1]]);
assert.equal(projection.tags.notes.has("locked"), false);
assert.equal(projection.tags.notes.has("blocked"), false);
assert.equal(projection.tags.notes.has("epoch"), true);
assert.equal(projection.folders.get("smart").firstId, "alpha");
assert.equal(projection.folders.get("all").count, 5);
assert.equal(projection.folders.get("all").ids.includes("epoch"), false);
assert.equal(projection.folders.get("normal").count, 1);

await writeFile(
  resolve(output, "result.json"),
  JSON.stringify(
    {
      cases: cases.length,
      orderedMatches: true,
      tagsMatch: true,
      foldersMatch: true,
      smartFolderRevision: projection.folders.get("smart").definitionRevision,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Workspace projection: ${cases.length} sort/suspension cases match the existing views.`,
);
