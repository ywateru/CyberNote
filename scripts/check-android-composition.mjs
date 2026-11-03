// Deterministic recovery-contract checks against the installed, patched PM code.
// The views below are test doubles, not browser/IME evidence. Real candidate
// acceptance is tested separately on the installed Android app with native taps.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
const rootRequire = createRequire(import.meta.url);
const pmRequire = createRequire(rootRequire.resolve("@tiptap/pm/view"));
const actual = pmRequire.resolve("prosemirror-view");
const esmPath = resolve(dirname(actual), "index.js");
let source = await readFile(esmPath, "utf8");
for (const name of [
  "prosemirror-model",
  "prosemirror-state",
  "prosemirror-transform",
])
  source = source.replaceAll(
    `from '${name}'`,
    `from ${JSON.stringify(pathToFileURL(pmRequire.resolve(name)).href)}`,
  );
source +=
  "\nexport {scheduleComposeEnd as testSchedule, clearComposition as testClear, editHandlers as testEditHandlers, handlers as testHandlers, initInput as testInit, destroyInput as testDestroy};\n";
const output = resolve("artifacts/android-ime-unit");
await mkdir(output, { recursive: true });
const underTest = resolve(output, "installed-pm-under-test.mjs");
await writeFile(underTest, source);
const originalNavigator = Object.getOwnPropertyDescriptor(
  globalThis,
  "navigator",
);
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    userAgent:
      "Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 Chrome/91.0.4472.114 Mobile Safari/537.36",
    vendor: "Google Inc.",
    platform: "Linux aarch64",
  },
});
const pm = await import(pathToFileURL(underTest));
const originalSet = globalThis.setTimeout,
  originalClear = globalThis.clearTimeout;
let timerId = 0;
const timers = new Map();
globalThis.setTimeout = (fn, delay) => {
  let id = ++timerId;
  timers.set(id, { fn, delay });
  return id;
};
globalThis.clearTimeout = (id) => timers.delete(id);
const target = () => {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, fn) {
      let a = listeners.get(type) || [];
      a.push(fn);
      listeners.set(type, a);
    },
    removeEventListener(type, fn) {
      listeners.set(
        type,
        (listeners.get(type) || []).filter((f) => f !== fn),
      );
    },
  };
};
function fixture(options = {}) {
  const text = { isConnected: options.connected !== false };
  const win = target(),
    doc = { ...target(), defaultView: win, visibilityState: "visible" };
  const view = {
    input: {
      composing: true,
      nativeCompositionActive: true,
      compositionNode: text,
      compositionNodes: [],
      composingTimeout: -1,
      eventHandlers: {},
      lastIOSEnterFallbackTimeout: -1,
    },
    get composing() {
      return this.input.composing;
    },
    focused: false,
    editable: true,
    hasFocus: () => options.focus !== false,
    someProp(name) {
      if (name === "androidPreserveComposition")
        return options.enabled !== false;
    },
    dom: { ...target(), ownerDocument: doc, contains: (n) => n === text },
    domSelectionRange: () => ({ focusNode: options.otherFocus ? {} : text }),
    domObserver: {
      flushingSoon: -1,
      forceFlush() {
        view.flushes++;
      },
      stop() {},
    },
    docView: { dirty: false },
    flushes: 0,
  };
  if (options.noNode) view.input.compositionNode = null;
  return { view, text, win, doc };
}
function tick(view, delay) {
  const t = timers.get(view.input.composingTimeout);
  assert(t, "scheduled callback missing");
  assert.equal(t.delay, delay);
  timers.delete(view.input.composingTimeout);
  t.fn();
}
const results = [];
const test = (name, fn) => {
  timers.clear();
  fn();
  results.push({ name, status: "pass" });
};
try {
  test("live trusted session keeps same connected preedit past the original 5000ms callback", () => {
    const { view, text } = fixture();
    pm.testSchedule(view, 5000);
    tick(view, 5000);
    assert.equal(view.composing, true);
    assert.equal(view.input.compositionNode, text);
    assert.equal(view.flushes, 0);
    assert.equal(timers.size, 0);
  });
  for (const [name, options] of [
    ["opt-in disabled", { enabled: false }],
    ["focus lost", { focus: false }],
    ["node detached", { connected: false }],
    ["no composition node", { noNode: true }],
    ["DOM focus left composition node", { otherFocus: true }],
  ])
    test(`upstream watchdog still clears when ${name}`, () => {
      const { view } = fixture(options);
      pm.testSchedule(view, 5000);
      tick(view, 5000);
      assert.equal(view.composing, false);
      assert.equal(view.input.nativeCompositionActive, false);
      assert.equal(view.flushes, 1);
    });
  test("idle recovery remains for a session with no real active native signal", () => {
    const { view } = fixture();
    view.input.nativeCompositionActive = false;
    pm.testSchedule(view, 5000);
    tick(view, 5000);
    assert.equal(view.composing, false);
  });
  test("explicit programmatic clear remains effective for a valid live span", () => {
    const { view } = fixture();
    pm.testClear(view);
    assert.equal(view.composing, false);
    assert.equal(view.input.nativeCompositionActive, false);
  });
  test("trusted non-composition beforeinput releases missing-end state", () => {
    const { view } = fixture();
    pm.testHandlers.beforeinput(view, {
      isTrusted: true,
      isComposing: false,
      inputType: "insertText",
    });
    assert.equal(view.composing, false);
    tick(view, 20);
    assert.equal(view.input.nativeCompositionActive, false);
  });
  test("composing input and untrusted input do not manufacture a boundary", () => {
    for (const e of [
      {
        isTrusted: true,
        isComposing: true,
        inputType: "insertCompositionText",
      },
      { isTrusted: false, isComposing: false, inputType: "insertText" },
    ]) {
      const { view } = fixture();
      pm.testHandlers.beforeinput(view, e);
      assert.equal(view.composing, true);
      assert.equal(view.input.nativeCompositionActive, true);
    }
  });
  test("IME key 229 stays live; genuine non-composing Enter releases before Android key handling", () => {
    const a = fixture().view;
    pm.testEditHandlers.keydown(a, {
      isTrusted: true,
      isComposing: true,
      keyCode: 229,
      key: "Unidentified",
    });
    assert.equal(a.composing, true);
    const b = fixture().view;
    pm.testEditHandlers.keydown(b, {
      isTrusted: true,
      isComposing: false,
      keyCode: 13,
      key: "Enter",
    });
    assert.equal(b.composing, false);
  });
  test("blur recovery keeps original 20ms commit opportunity", () => {
    const { view } = fixture();
    pm.testHandlers.blur(view, {});
    assert.equal(view.composing, true);
    assert.equal(view.input.nativeCompositionActive, false);
    tick(view, 20);
    assert.equal(view.composing, false);
  });
  test("real end uses existing end cleanup and clears the retained node", () => {
    const { view } = fixture();
    view.domObserver.pendingRecords = () => [];
    pm.testEditHandlers.compositionend(view, { isTrusted: true });
    assert.equal(view.composing, false);
    assert.equal(view.input.compositionNode, null);
    tick(view, 20);
  });
  test("window/document boundary listeners are removed on destroy", () => {
    const { view, win, doc } = fixture();
    pm.testInit(view);
    assert.equal(win.listeners.get("blur").length, 1);
    assert.equal(doc.listeners.get("visibilitychange").length, 1);
    doc.visibilityState = "hidden";
    doc.listeners.get("visibilitychange")[0]();
    assert.equal(view.input.nativeCompositionActive, false);
    assert.equal(timers.size, 1);
    pm.testDestroy(view);
    assert.equal(win.listeners.get("blur").length, 0);
    assert.equal(doc.listeners.get("visibilitychange").length, 0);
    assert.equal(timers.size, 0);
  });
  test("default-disabled views register no background hooks", () => {
    const { view, win, doc } = fixture({ enabled: false });
    pm.testInit(view);
    assert.equal(win.listeners.size, 0);
    assert.equal(doc.listeners.size, 0);
    pm.testDestroy(view);
  });
  const result = {
    kind: "deterministic recovery contract; test doubles, not real IME acceptance",
    installedEsm: esmPath,
    tests: results.length,
    results,
  };
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  globalThis.setTimeout = originalSet;
  globalThis.clearTimeout = originalClear;
  if (originalNavigator)
    Object.defineProperty(globalThis, "navigator", originalNavigator);
  else delete globalThis.navigator;
}
