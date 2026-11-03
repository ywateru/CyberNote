import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile("src/native-toolbar-controller.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const { NativeToolbar } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
const info = (revision = 1, searchSequence = 0) => ({
  windowLabel: "main",
  bindingId: "current",
  stateRevision: revision,
  native: { reservedTop: 52, active: true, searchSequence },
});
const projection = (key = "A", value = "", ack = 0, context = { id: key }) => ({
  key,
  context,
  state: {
    layout: "threeColumn",
    columns: { sidebarVisible: true, sidebarWidth: 228, listWidth: 280 },
    folderTitle: "folder",
    folderCount: 1,
    tableFocused: false,
    actions: [],
    menus: [],
    search: { enabled: true, value, acknowledgedEvent: ack },
    glassStyle: "regular",
  },
});
function harness(overrides = {}) {
  const calls = [],
    events = [],
    errors = [],
    infos = [];
  let listener,
    unlistened = 0;
  const transport = {
    windowLabel: "main",
    listen: async (fn) => {
      calls.push("listen");
      listener = fn;
      return () => unlistened++;
    },
    bind: async (state) => {
      calls.push(["bind", state]);
      return info(state.revision);
    },
    update: async (state) => {
      calls.push(["update", state]);
      return info(state.revision);
    },
    inspect: async () => info(),
    focusSearch: async () => info(),
    unbind: async () => {
      calls.push("unbind");
    },
    ...overrides,
  };
  const controller = new NativeToolbar(
    transport,
    (...args) => events.push(args),
    (i) => infos.push(i),
    (e) => errors.push(e),
  );
  return {
    controller,
    calls,
    events,
    errors,
    infos,
    emit: (
      sequence,
      intent,
      revision = 1,
      bindingId = "current",
      windowLabel = "main",
    ) =>
      listener({
        sequence,
        intent,
        stateRevision: revision,
        bindingId,
        windowLabel,
      }),
    get unlistened() {
      return unlistened;
    },
  };
}
const results = [];
async function test(name, run) {
  await run();
  results.push({ name, status: "pass" });
}
await test("listen precedes bind; only own binding early events replay", async () => {
  const bound = deferred(),
    h = harness({ bind: async () => bound.promise });
  h.controller.set(projection());
  await settle();
  h.emit(1, { kind: "search", value: "旧", phase: "change" }, 1, "old");
  h.emit(2, { kind: "search", value: "中文", phase: "commit" });
  bound.resolve(info());
  await settle();
  assert.equal(h.calls[0], "listen");
  assert.equal(h.events.length, 1);
  assert.equal(h.events[0][0].value, "中文");
  assert.equal(
    h.calls.find((c) => c[0] === "update")[1].search.acknowledgedEvent,
    2,
  );
  h.controller.stop();
  await settle();
});
await test("caret context refresh does not update controls or close a menu", async () => {
  const h = harness();
  h.controller.set(projection());
  await settle();
  h.controller.set(projection("A", "", 0, { id: "new bookmark" }));
  await settle();
  assert.equal(h.calls.filter((c) => c[0] === "update").length, 0);
  h.emit(1, { kind: "action", action: "newNote" });
  assert.equal(h.events[0][1].id, "new bookmark");
  h.controller.stop();
});
await test("one update in flight coalesces latest desired state", async () => {
  const pending = deferred();
  let count = 0,
    active = 0,
    max = 0;
  const updates = [];
  const h = harness({
    update: async (state) => {
      updates.push(state);
      max = Math.max(max, ++active);
      if (++count === 1) await pending.promise;
      active--;
      return info(state.revision);
    },
  });
  h.controller.set(projection());
  await settle();
  h.controller.set(projection("B"));
  h.controller.set(projection("C"));
  assert.equal(updates.length, 1);
  pending.resolve();
  await settle();
  assert.equal(max, 1);
  assert.equal(updates.length, 2);
  assert.equal(h.infos.at(-1).stateRevision, 3);
  h.controller.stop();
});
await test("native query arriving during update wins over stale React query", async () => {
  const pending = deferred(),
    updates = [];
  const h = harness({
    update: async (state) => {
      updates.push(state);
      if (updates.length === 1) return pending.promise;
      return info(state.revision);
    },
  });
  h.controller.set(projection());
  await settle();
  h.controller.set(projection("B", "old"));
  h.emit(4, { kind: "search", value: "组合完成", phase: "commit" });
  pending.reject({ code: "stale_search" });
  await settle();
  assert.equal(updates.at(-1).search.value, "组合完成");
  assert.equal(updates.at(-1).search.acknowledgedEvent, 4);
  assert.equal(h.errors.length, 0);
  h.controller.stop();
});
await test("missing native search event waits, then resumes with exact acknowledgment", async () => {
  let count = 0;
  const updates = [];
  const h = harness({
    update: async (state) => {
      updates.push(state);
      if (++count === 1) throw { code: "stale_search" };
      return info(state.revision);
    },
    inspect: async () => info(1, 9),
  });
  h.controller.set(projection());
  await settle();
  h.controller.set(projection("B"));
  await settle();
  assert.equal(updates.length, 1);
  h.emit(9, { kind: "search", value: "实际输入", phase: "change" });
  await settle();
  assert.equal(updates.length, 2);
  assert.equal(updates[1].search.acknowledgedEvent, 9);
  h.controller.stop();
});
await test("composition preserves pending state until actual committed search event", async () => {
  let count = 0;
  const updates = [];
  const h = harness({
    update: async (state) => {
      updates.push(state);
      if (++count === 1) throw { code: "search_composition" };
      return info(state.revision);
    },
  });
  h.controller.set(projection());
  await settle();
  h.controller.set(projection("B", "programmatic"));
  await settle();
  h.controller.set(projection("C", "another"));
  await settle();
  assert.equal(updates.length, 1);
  h.emit(2, { kind: "search", value: "中文", phase: "commit" });
  await settle();
  assert.equal(updates.length, 2);
  assert.equal(updates[1].search.value, "中文");
  h.controller.stop();
});
await test("old note revision, duplicate sequence, and wrong window are rejected", async () => {
  const h = harness();
  h.controller.set(projection());
  await settle();
  h.controller.set(projection("B"));
  await settle();
  h.emit(1, { kind: "action", action: "newNote" });
  h.emit(2, { kind: "action", action: "newNote" }, 2, "current", "note-other");
  h.emit(3, { kind: "action", action: "newNote" }, 2);
  h.emit(3, { kind: "action", action: "newNote" }, 2);
  assert.equal(h.events.length, 1);
  h.controller.stop();
});
await test("dispose during bind releases the eventual binding and listener", async () => {
  const bound = deferred(),
    h = harness({ bind: async () => bound.promise });
  h.controller.set(projection());
  await settle();
  h.controller.stop();
  bound.resolve(info());
  await settle();
  assert.equal(h.calls.filter((c) => c === "unbind").length, 1);
  assert.equal(h.unlistened, 1);
  assert.equal(h.infos.length, 0);
});
await test("unbind rejection still releases listener and rejects late events", async () => {
  const h = harness({
    unbind: async () => {
      throw Error("window gone");
    },
  });
  h.controller.set(projection());
  await settle();
  h.controller.stop();
  await settle();
  assert.equal(h.unlistened, 1);
  h.emit(1, { kind: "action", action: "newNote" });
  assert.equal(h.events.length, 0);
});
await test("invalidation clears retained editor targets and refuses old events", async () => {
  const context = { editor: {}, bookmark: {} };
  const h = harness();
  h.controller.set(projection("A", "", 0, context));
  await settle();
  h.controller.invalidate((c) => {
    c.editor = null;
    c.bookmark = null;
  });
  h.emit(1, { kind: "action", action: "newNote" });
  assert.equal(context.editor, null);
  assert.equal(context.bookmark, null);
  assert.equal(h.events.length, 0);
  h.controller.set(projection("B"));
  await settle();
  h.controller.stop();
});
await test("inconsistent stale search cannot spin forever", async () => {
  let count = 0;
  const h = harness({
    update: async () => {
      count++;
      throw { code: "stale_search" };
    },
    inspect: async () => info(1, 0),
  });
  h.controller.set(projection());
  await settle();
  h.controller.set(projection("B"));
  await settle();
  assert.equal(count, 2);
  assert.equal(h.errors.length, 1);
  h.controller.stop();
});
const stateSource = await readFile("src/native-toolbar-state.ts", "utf8");
const { toolbarState } = await import(
  `data:text/javascript;base64,${Buffer.from(ts.transpileModule(stateSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString("base64")}`
);
await test("host projections distinguish browse, open, focused table, and independent window", async () => {
  const input = {
    sidebar: true,
    settings: { sidebarWidth: 245, listWidth: 301 },
    folderTitle: "folder",
    folderCount: 1,
    query: "",
    searchAck: 0,
    available: true,
    editable: true,
    editor: { isActive: (name) => name === "table" },
  };
  const browse = toolbarState({ ...input, layout: "galleryBrowse" });
  assert.deepEqual(
    browse.actions.map((a) => a.action),
    ["newFolder", "toggleSidebar", "viewOptions", "newNote"],
  );
  const open = toolbarState({ ...input, layout: "galleryExpanded" });
  assert(open.actions.some((a) => a.action === "backToGallery"));
  assert(!open.actions.some((a) => a.action === "viewOptions"));
  assert(!open.menus.some((m) => m.owner === "viewOptions"));
  assert.equal(open.tableFocused, true);
  assert.equal(open.columns.sidebarWidth, 245);
  assert.equal(open.columns.listWidth, 301);
  const independent = toolbarState({ ...input, layout: "independentNote" });
  assert.equal(independent.search, null);
  assert.equal(independent.columns.sidebarVisible, false);
  assert(
    !independent.actions.some(
      (a) => a.action === "toggleSidebar" || a.action === "backToGallery",
    ),
  );
});
await test("local OCR has its own typed native command; Continuity stays disabled and unavailable targets cannot recognize", async () => {
  const input = {
    layout: "threeColumn",
    sidebar: true,
    settings: {},
    folderTitle: "folder",
    folderCount: 1,
    query: "",
    searchAck: 0,
    available: true,
    editable: true,
    editor: { isActive: () => false },
  };
  const entries = (state) =>
    state.menus
      .find((menu) => menu.owner === "attachment")
      .items.filter((item) => item.kind === "item");
  const enabled = entries(toolbarState(input));
  assert.equal(
    enabled.find((item) => item.command === "recognizeImageText").label,
    "从图片识别文本…",
  );
  assert.equal(
    enabled.find((item) => item.command === "recognizeImageText").enabled,
    true,
  );
  for (const command of ["takePhoto", "scanDocument", "addSketch"])
    assert.equal(
      enabled.find((item) => item.command === command).enabled,
      false,
    );
  const disabled = entries(
    toolbarState({ ...input, available: false, editable: false }),
  );
  assert.equal(
    disabled.find((item) => item.command === "recognizeImageText").enabled,
    false,
  );
  const guest = await readFile(
    "plugins/tauri-plugin-notes-ui/guest-js/index.ts",
    "utf8",
  );
  const native = await readFile(
    "plugins/tauri-plugin-notes-ui/src/model.rs",
    "utf8",
  );
  assert.match(guest, /'recognizeImageText'/);
  assert.match(native, /RecognizeImageText,/);
});
console.log(JSON.stringify({ tests: results.length, results }, null, 2));
