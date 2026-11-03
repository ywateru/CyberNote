import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// Execute the actual startup effect and new presentation predicate, with only
// subscription I/O and React host setters controlled. No copied zero-state rule.
const source = await readFile("src/App.tsx", "utf8");
const ast = ts.createSourceFile("App.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes = [];
function visit(node) { nodes.push(node); ts.forEachChild(node, visit); }
visit(ast);
const effect = nodes.find(node => ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect" && node.arguments[0]?.getText(ast).includes("unlisten = await subscribeAccess"));
assert.ok(effect);
function declaration(name) {
  const matches = nodes.filter(node => ts.isVariableDeclaration(node) && node.name.getText(ast) === name);
  assert.equal(matches.length, 1);
  return `const ${name} = ${matches[0].initializer.getText(ast)};`;
}
function compile(body, dependencies) {
  const output = ts.transpileModule(body, { compilerOptions: {target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext} }).outputText;
  return Function(...Object.keys(dependencies),output)(...Object.values(dependencies));
}
const state = { loading: true, synchronizing: false, syncError: "", accessSuspended: [], errors: [], syncCalls: 0 };
const cleanup = compile(`return (${effect.arguments[0].getText(ast)})();`, {
  subscribeAccess: async () => { throw Error("subscription unavailable"); },
  accessHandler: {current: () => {}},
  synchronizeRef: {current: async () => { state.syncCalls++; return {success:true}; }},
  fail: error => state.errors.push(error.message),
  setLoading: value => { state.loading = value; },
});
for (let i=0; i<30 && state.loading; i++) await Promise.resolve();
assert.equal(state.loading, false);
assert.equal(state.syncCalls, 0);
assert.deepEqual(state.errors, ["subscription unavailable"]);
const displayed = compile([
  ...["desktopSearch", "desktopSearchZero", "listTitle", "listSubtitle"].map(declaration),
  "return {desktopSearchZero,listTitle,listSubtitle};",
].join("\n"), {
  mobile:false, separate:null, query:"unloaded-query", view:"list",
  loading:state.loading, synchronizing:state.synchronizing, syncError:state.syncError,
  accessSuspended:state.accessSuspended, accessGate:{state:null}, listed:[], folderLabel:"备忘录",
});
assert.deepEqual(displayed,{desktopSearchZero:true,listTitle:"搜索",listSubtitle:"无结果"});
cleanup();
console.log(JSON.stringify({
  candidate:"e7a2b8c8831b0ff48686970f4f985210f3d8e765", status:"REPRODUCED",
  execution:"AST-extracted actual App startup effect and presentation declarations; controlled subscribeAccess rejection and React host setters; no GUI, actual Tauri subscription or native rendering",
  afterStartup:state, displayed,
  observation:"No trusted synchronization was called, but finally cleared loading and the new confirmed-zero presentation was selected for a later nonempty query.",
  sourceSha256:createHash("sha256").update(source).digest("hex"),
},null,2));
