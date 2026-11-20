import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Execute the actual App presentation declarations, header, empty-list expression and
// toolbar projection. The nonempty note rows are a controlled rendering boundary.
const appSource = await readFile("src/App.tsx", "utf8");
const tree = ts.createSourceFile(
  "App.tsx",
  appSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const nodes = [];
function visit(node) {
  nodes.push(node);
  ts.forEachChild(node, visit);
}
visit(tree);
const declaration = (name) => {
  const found = nodes.filter(
    (node) =>
      ts.isVariableDeclaration(node) && node.name.getText(tree) === name,
  );
  assert.equal(found.length, 1, `unambiguous production declaration: ${name}`);
  return `const ${name} = ${found[0].initializer.getText(tree)};`;
};
const hasClass = (node, name) =>
  ts.isJsxElement(node) &&
  node.openingElement.attributes.properties.some(
    (attr) =>
      ts.isJsxAttribute(attr) &&
      attr.name.getText(tree) === "className" &&
      attr.initializer?.getText(tree) === JSON.stringify(name),
  );
const heading = nodes.find((node) => hasClass(node, "folder-heading"));
const list = nodes.find(
  (node) =>
    ts.isJsxElement(node) &&
    node.openingElement.attributes.properties.some(
      (attr) =>
        ts.isJsxAttribute(attr) &&
        attr.name.getText(tree) === "className" &&
        attr.initializer?.getText(tree).includes("notes-scroll"),
    ),
);
assert(heading && list);
const content = list.children.find(
  (node) => ts.isJsxExpression(node) && node.expression,
)?.expression;
assert(content);
const compiled = ts.transpileModule(
  [
    ...[
      "collectionEmptyKind",
      "desktopSearch",
      "desktopSearchZero",
      "confirmedEmptyQuery",
      "folderLabel",
      "listTitle",
      "listSubtitle",
    ].map(declaration),
    `return { desktopSearchZero, header: ${heading.getText(tree)}, list: ${content.getText(tree)} };`,
  ].join("\n"),
  {
    fileName: "production-zero.tsx",
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  },
).outputText;
const results = [];
function run(name, change, expected) {
  const context = {
    React,
    Search: (props) => React.createElement("span", { ...props, "data-fixture-icon": "search" }),
    NotebookPen: (props) => React.createElement("span", { ...props, "data-fixture-icon": "notebook" }),
    mobile: false,
    separate: null,
    query: "不存在的查询",
    filter: "",
    contentSearch: true,
    smartFolder: null,
    tagFilter: undefined,
    view: "list",
    loading: false,
    workspaceLoaded: true,
    synchronizing: false,
    syncError: "",
    accessSuspended: [],
    accessGate: { state: null },
    folderId: "default",
    currentFolder: { name: "备忘录" },
    sidebar: true,
    settings: {},
    galleryEditor: false,
    nativeSearchAck: 2,
    available: true,
    editable: false,
    creatingNote: false,
    newNote: () => {},
    current: undefined,
    liveEditor: null,
    ...change,
  };
  const listed = Array.from({ length: change.resultCount || 0 });
  listed.map = () => [
    React.createElement(
      "div",
      { className: "existing-result-rows", key: "fixture" },
      "原结果行",
    ),
  ];
  context.listed = listed;
  const before = structuredClone({
    query: context.query,
    currentFolder: context.currentFolder,
    settings: context.settings,
    accessSuspended: context.accessSuspended,
  });
  const actual = Function(
    ...Object.keys(context),
    compiled,
  )(...Object.values(context));
  const header = renderToStaticMarkup(actual.header);
  const body = renderToStaticMarkup(actual.list);
  assert.equal(actual.desktopSearchZero, expected.zero, name);
  assert(header.includes(`<strong>${expected.title}</strong>`), header);
  assert(header.includes(`<span>${expected.subtitle}</span>`), header);
  assert(body.includes(expected.body), body);
  assert.equal(body.includes("search-zero-section"), expected.zero, body);
  if (expected.zero) {
    assert(body.includes("没有找到匹配的备忘录"), body);
    assert(body.includes(context.query), body);
    assert(body.includes("清除搜索"), body);
  }
  if (expected.firstUse) {
    assert(body.includes("collection-empty is-first-use"), body);
    assert(body.includes("新建备忘录") === !context.mobile, body);
  }
  if (expected.filteredEmpty) {
    assert(body.includes("collection-empty is-search-empty"), body);
    assert(body.includes("清除筛选"), body);
  }
  if (expected.searchCopy) {
    assert(body.includes(context.query), body);
    assert(body.includes("清除搜索"), body);
    assert(body.includes("已在“"), body);
  }
  assert.deepEqual(
    {
      query: context.query,
      currentFolder: context.currentFolder,
      settings: context.settings,
      accessSuspended: context.accessSuspended,
    },
    before,
  );
  results.push({
    name,
    pass: true,
    header,
    body,
  });
}
const zero = {
  zero: true,
  title: "搜索",
  subtitle: "无结果",
  body: '<div class="search-zero-section" role="status">',
};
const oldSearch = {
  zero: false,
  title: "搜索结果",
  subtitle: "0个备忘录",
  body: "没有符合筛选条件的备忘录",
};
run(
  "trusted desktop list zero uses the confirmed header and section without central hint",
  {},
  zero,
);
run(
  "a real folder named 搜索 with an empty query stays an ordinary empty folder",
  { query: "", currentFolder: { name: "搜索" } },
  { zero: false, title: "搜索", subtitle: "0个备忘录", body: "这个文件夹还没有备忘录", firstUse: true },
);
run(
  "initial workspace without a successful load does not claim confirmed no results",
  { workspaceLoaded: false },
  oldSearch,
);
run(
  "an unrelated error after successful load does not hide confirmed no results",
  { error: "unrelated action failed" },
  zero,
);
run(
  "loading does not claim confirmed no results",
  { loading: true },
  { ...oldSearch, body: "正在打开备忘录…" },
);
run(
  "active trusted synchronization retains the old presentation",
  { synchronizing: true },
  oldSearch,
);
run(
  "failed synchronization does not claim confirmed no results",
  { syncError: "offline" },
  oldSearch,
);
run(
  "access shielding does not claim confirmed no results",
  { accessSuspended: ["A"] },
  oldSearch,
);
run(
  "an active access operation does not claim confirmed no results",
  { accessGate: { state: { operationId: "active" } } },
  oldSearch,
);
run(
  "mobile query zero explains the scoped search and offers clear search",
  { mobile: true },
  {
    zero: false,
    title: "搜索结果",
    subtitle: "0个备忘录",
    body: "没有找到匹配的备忘录",
    searchCopy: true,
  },
);
run(
  "mobile filter zero keeps filter wording and clear-filter action",
  { mobile: true, query: "", filter: "audio" },
  {
    zero: false,
    title: "备忘录",
    subtitle: "0个备忘录",
    body: "没有符合筛选条件的备忘录",
    filteredEmpty: true,
  },
);
run("independent note presentation is unchanged", { separate: "A" }, oldSearch);
run(
  "gallery query zero uses the same scoped search copy",
  { view: "gallery" },
  {
    zero: false,
    title: "搜索结果",
    subtitle: "0个备忘录",
    body: "没有找到匹配的备忘录",
    searchCopy: true,
  },
);
run(
  "unique result preserves existing title count and result branch",
  { resultCount: 1 },
  {
    zero: false,
    title: "搜索结果",
    subtitle: "1个备忘录",
    body: "existing-result-rows",
  },
);
run(
  "multiple results preserve existing title count and result branch",
  { resultCount: 3 },
  {
    zero: false,
    title: "搜索结果",
    subtitle: "3个备忘录",
    body: "existing-result-rows",
  },
);
run(
  "clearing the query restores the ordinary folder title and empty state",
  { query: "" },
  { zero: false, title: "备忘录", subtitle: "0个备忘录", body: "这个文件夹还没有备忘录", firstUse: true },
);
run(
  "filter-only empty results explain the filter and provide a clear action",
  { query: "", filter: "audio" },
  { zero: false, title: "备忘录", subtitle: "0个备忘录", body: "没有符合筛选条件的备忘录", filteredEmpty: true },
);
run(
  "tag-only empty results use the filter empty state instead of claiming the folder is empty",
  { query: "", filter: "", tagFilter: "A" },
  { zero: false, title: "#A", subtitle: "0个备忘录", body: "没有符合筛选条件的备忘录", filteredEmpty: true },
);
run(
  "query plus tag filter does not claim a pure search or an ordinary empty folder",
  { query: "不存在的查询", tagFilter: "A" },
  { zero: false, title: "搜索结果", subtitle: "0个备忘录", body: "没有符合筛选条件的备忘录", filteredEmpty: true },
);
console.log(
  JSON.stringify(
    {
      tests: results.length,
      results,
      limitations: [
        "Actual App presentation AST and empty-list branches execute in Node/React static rendering.",
        "Nonempty note rows are controlled; no DOM mount, native AppKit layout, pixel acceptance or runtime focus assertion.",
      ],
    },
    null,
    2,
  ),
);
