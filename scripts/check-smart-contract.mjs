import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import ts from "typescript";
const modules = new Map();
async function compiled(name) {
  if (modules.has(name)) return modules.get(name);
  let source = ts.transpileModule(await readFile(`src/${name}.ts`, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  for (const match of [...source.matchAll(/from ["']\.\/([^"']+)["']/g)])
    source = source.replace(match[0], `from '${await compiled(match[1])}'`);
  const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  modules.set(name, url);
  return url;
}
const {
  parseSmartQuery,
  parseFolder,
  matchesSmart,
  projectFolders,
  SmartInvalid,
} = await import(await compiled("smart-folders"));
const { folderDraft, draftQuery, addDraftRule } = await import(
  await compiled("smart-draft")
);
const corpus = JSON.parse(
  await readFile("docs/fixtures/smart-projection09.json", "utf8"),
);
const results = [];
function test(name, fn) {
  fn();
  results.push({ name, passed: true });
}
for (const row of corpus.cases)
  test(`truth:${row.name}`, () => {
    const query = parseSmartQuery(row.query);
    assert.deepEqual(
      corpus.notes
        .filter((f) =>
          matchesSmart(query, {
            pinned: f.pinned,
            tags: f.tags,
            eligible: !f.deleted && !f.suspended,
          }),
        )
        .map((n) => n.id),
      row.expected,
    );
  });
for (const [i, row] of corpus.invalid.entries())
  test(`closed-invalid:${i}`, () =>
    assert.throws(() => parseSmartQuery(row), SmartInvalid));
const physical = {
  id: "default",
  name: "备忘录",
  parentId: null,
  kind: "default",
  sortOrder: 0,
  createdAt: 0,
};
const smart = {
  id: "smart",
  name: "A",
  parentId: null,
  kind: "smart",
  sortOrder: 2,
  createdAt: 2,
  query: corpus.cases[0].query,
  definitionRevision: 1,
};
test("strict-physical-smart-entity-branches", () => {
  assert.equal(parseFolder(smart).kind, "smart");
  assert.equal(parseFolder(physical).kind, "default");
  for (const f of [
    { ...physical, query: null },
    { ...physical, kind: "smart" },
    { ...smart, parentId: "default" },
    { ...smart, definitionRevision: 0 },
    { ...smart, definitionRevision: 9007199254740992 },
    { ...physical, id: "all" },
    { ...smart, unknown: 1 },
  ])
    assert.throws(() => parseFolder(f), SmartInvalid);
});
test("draft-cache-cancel-and-unsupported-insertion", () => {
  const d = folderDraft();
  assert.equal(d.rules[0].type, "tags");
  assert.throws(() => draftQuery({ ...d, smart: true }));
  const selected = {
    ...d,
    smart: true,
    rules: [{ ...d.rules[0], names: ["A"] }],
  };
  assert.deepEqual(draftQuery(selected).rules[0].names, ["A"]);
  const presence = {
    ...selected,
    rules: [{ ...selected.rules[0], mode: "anyTag" }],
  };
  assert.deepEqual(draftQuery(presence).rules, [
    { type: "tags", mode: "anyTag" },
  ]);
  assert.deepEqual(presence.rules[0].names, ["A"]);
  const added = addDraftRule(selected, selected.rules[0].key);
  assert.equal(added.rules[1].type, "creationDate");
  assert.equal(added.rules[1].period, "today");
  assert.throws(() => draftQuery(added), /尚未接入/);
  assert.equal(selected.rules.length, 1);
  const existing = folderDraft(smart);
  existing.name = "cancelled";
  existing.rules[0].names.push("B");
  assert.deepEqual(smart.query.rules[0].names, ["A"]);
});
test("unified-projection-count-first-sorted-legal-mark-only", () => {
  const make = (id, pinned, document, plainText) => ({
    id,
    folderId: "default",
    title: id,
    pinned,
    document,
    plainText,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    locked: false,
  });
  const doc = (text, marked) => ({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text,
            ...(marked
              ? { marks: [{ type: "noteTag", attrs: { name: "A" } }] }
              : {}),
          },
        ],
      },
    ],
  });
  const ws = {
    folders: [physical, smart],
    notes: [
      make("z", false, doc("#A", true), "misleading"),
      make("a", true, doc("#A", false), "#A"),
      make("b", false, doc("#wrong", true), "#A"),
    ],
    settings: {},
  };
  const p = projectFolders(ws, [], "title").get("smart");
  assert.deepEqual(p, {
    ids: ["z"],
    count: 1,
    firstId: "z",
    definitionRevision: 1,
  });
  ws.notes[0].document = doc("#A", false);
  assert.deepEqual(projectFolders(ws).get("smart").ids, []);
});
if (process.argv[2])
  await writeFile(process.argv[2], JSON.stringify({ results }, null, 2) + "\n");
console.log(
  `${results.length} production smart query/entity/draft/projection contract cases passed.`,
);
