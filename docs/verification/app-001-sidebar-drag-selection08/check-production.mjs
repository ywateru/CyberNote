import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import ts from "typescript";
import React, { useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Reuse the existing AST/execution approach from check-search-zero-ui.mjs.
// Execute the entire production declaration and both actual App JSX call sites.
// React owns useRef; only host pointer capture and settings I/O are controlled.
const baseline = process.argv.includes("--baseline");
const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const source = baseline
  ? execFileSync("git", ["show", `${head}:src/App.tsx`], { encoding: "utf8" })
  : readFileSync("src/App.tsx", "utf8");
const tree = ts.createSourceFile("App.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes = [];
function visit(node) {
  nodes.push(node);
  ts.forEachChild(node, visit);
}
visit(tree);
const declarations = nodes.filter((n) => ts.isFunctionDeclaration(n) && n.name?.text === "ResizeHandle");
assert.equal(declarations.length, 1);
const sites = nodes.filter((n) => ts.isJsxSelfClosingElement(n) && n.tagName.getText(tree) === "ResizeHandle");
assert.equal(sites.length, 2);
const compile = (body) => ts.transpileModule(body, {
  fileName: "actual-production.tsx",
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText;
const ResizeHandle = Function("React", "useRef", compile(`${declarations[0].getText(tree)}\nreturn ResizeHandle;`))(React, useRef);
const results = [];
for (const site of sites) {
  let settings = { sidebarWidth: 228, listWidth: 280, unrelated: "retained" };
  const changes = [], ends = [], capture = [], order = [];
  const env = {
    React, ResizeHandle, settings,
    setSettings: (update) => { settings = update(settings); changes.push({ ...settings }); },
    updateSettings: (patch) => { ends.push(patch); },
  };
  const actualSite = Function(...Object.keys(env), compile(`return ${site.getText(tree)};`))(...Object.values(env));
  let element;
  function MountedInServerRender() {
    element = actualSite.type(actualSite.props);
    return element;
  }
  const markup = renderToStaticMarkup(React.createElement(MountedInServerRender));
  const name = actualSite.props.className;
  const key = name === "sidebar-resize" ? "sidebarWidth" : "listWidth";
  const values = name === "sidebar-resize"
    ? { start: 228, positive: 248, negative: 213, min: 180, max: 360 }
    : { start: 280, positive: 300, negative: 265, min: 220, max: 440 };
  assert.equal(actualSite.props.width, values.start);
  assert.equal(actualSite.props.min, values.min);
  assert.equal(actualSite.props.max, values.max);
  assert.equal(element.props.role, "separator");
  assert.equal(element.props["aria-valuenow"], values.start);
  const host = { setPointerCapture: (id) => { capture.push(id); order.push("capture"); } };
  function event(type, clientX, pointerId = 19) {
    const e = new Event(type, { cancelable: true });
    Object.defineProperties(e, {
      clientX: { value: clientX }, pointerId: { value: pointerId }, currentTarget: { value: host },
    });
    const prevent = e.preventDefault.bind(e);
    e.preventDefault = () => { order.push("preventDefault"); prevent(); };
    return e;
  }
  // Inactive events are ignored by the unchanged production drag state.
  element.props.onPointerMove(event("pointermove", 600));
  element.props.onPointerUp(event("pointerup", 600));
  assert.deepEqual(changes, []); assert.deepEqual(ends, []);
  const down = event("pointerdown", 400);
  element.props.onPointerDown(down);
  assert.equal(down.defaultPrevented, !baseline);
  assert.deepEqual(capture, [19]);
  assert.deepEqual(order, baseline ? ["capture"] : ["preventDefault", "capture"]);
  assert.deepEqual(changes, []); assert.deepEqual(ends, []);
  for (const [x, expected] of [[420, values.positive], [385, values.negative], [-1000, values.min], [2000, values.max]]) {
    const move = event("pointermove", x);
    element.props.onPointerMove(move);
    assert.equal(move.defaultPrevented, false);
    assert.equal(settings[key], expected);
    assert.equal(settings.unrelated, "retained");
    assert.equal(settings[key === "sidebarWidth" ? "listWidth" : "sidebarWidth"], key === "sidebarWidth" ? 280 : 228);
  }
  const up = event("pointerup", 420);
  element.props.onPointerUp(up);
  assert.equal(up.defaultPrevented, false);
  assert.deepEqual(ends, [{ [key]: values.positive }]);
  const afterEnd = changes.length;
  element.props.onPointerMove(event("pointermove", 700));
  element.props.onPointerUp(event("pointerup", 700));
  assert.equal(changes.length, afterEnd);
  assert.equal(ends.length, 1);
  // A fresh drag still starts from the current props supplied to this render.
  element.props.onPointerDown(event("pointerdown", 500, 20));
  element.props.onPointerUp(event("pointerup", -1000, 20));
  element.props.onPointerDown(event("pointerdown", 500, 21));
  element.props.onPointerUp(event("pointerup", 2000, 21));
  assert.deepEqual(ends, [{ [key]: values.positive }, { [key]: values.min }, { [key]: values.max }]);
  assert.deepEqual(capture, [19, 20, 21]);
  results.push({
    name, pass: true, markup, downDefaultPrevented: down.defaultPrevented,
    capture, changedWidths: changes.map((s) => s[key]), endWidths: ends.map((s) => s[key]),
    checks: ["inactive ignored", "cancelable start", "capture order", "positive delta", "negative delta", "lower clamp", "upper clamp", "existing settings retained", "end callback", "post-end ignored", "next drag lower end", "next drag upper end"],
  });
}
console.log(JSON.stringify({
  mode: baseline ? "baseline" : "candidate", sourceHead: head,
  sourceSha256: createHash("sha256").update(source).digest("hex"),
  declarationSha256: createHash("sha256").update(declarations[0].getText(tree)).digest("hex"),
  actualProductionCallSites: sites.length, results,
  limits: "Real production function and JSX props executed in React server render. Node cancelable Event and host capture/settings boundaries are controlled; no browser DOM, native window, existing editor selection, or default text-selection gesture is exercised. Root exact-package Computer Use remains required.",
}, null, 2));
