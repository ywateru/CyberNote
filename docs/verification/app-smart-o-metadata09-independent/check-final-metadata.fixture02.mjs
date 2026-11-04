// Production bridge/App/Editor, persistent production Rust Session/Store.
// Only native transport delivery and test-only App observation are controlled.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";

const out = resolve(process.argv[2]),
  binary = resolve("src-tauri/target/debug/notes-o-session-transport");
await mkdir(out, { recursive: false });
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH)
);
const records = [],
  results = [],
  errors = [];
let processHandle,
  activePage,
  browser,
  context,
  origin,
  sessionDirectory,
  requestId = 0;
const waiting = new Map();
async function start(name) {
  await context?.close();
  processHandle?.stdin.end();
  const directory = resolve(out, name);
  await mkdir(directory);
  connect(directory);
}
function connect(directory) {
  sessionDirectory = directory;
  processHandle = spawn(binary, [directory], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  processHandle.stderr.on("data", (bytes) => errors.push(String(bytes)));
  createInterface({ input: processHandle.stdout }).on("line", (line) => {
    const row = JSON.parse(line),
      pending = waiting.get(row.requestId);
    waiting.delete(row.requestId);
    records.push(row);
    pending.resolve(row);
  });
  processHandle.on("exit", (code) => {
    if (code) errors.push(`Rust transport exited ${code}`);
  });
}
function call(command, args = {}, window = "second") {
  const row = { requestId: ++requestId, command, args, window };
  records.push(row);
  return new Promise((resolve, reject) => {
    waiting.set(row.requestId, { resolve, reject });
    processHandle.stdin.write(JSON.stringify(row) + "\n");
  });
}
async function must(command, args, window) {
  const row = await call(command, args, window);
  assert.equal(row.ok, true, JSON.stringify(row));
  return row;
}
async function external(action) {
  const workspace = (await must("load_workspace")).value;
  const access = workspace.access;
  return must("workspace_action", {
    action,
    expected: { sessionId: access.sessionId, epoch: access.epoch },
  });
}
const doc = (text) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
async function externalSave(id, text) {
  const access = (await must("load_workspace")).value.access;
  const token = {
    sessionId: access.sessionId,
    epoch: access.epoch,
    noteEpoch: access.notes[id].epoch,
  };
  const intent = `external-${++requestId}`;
  await must("register_save_intent", { noteId: id, intent, expected: token });
  const note = (await must("load_workspace")).value.notes.find(
    (n) => n.id === id,
  );
  return must("workspace_action", {
    action: {
      type: "saveNote",
      id,
      revision: note.revision,
      document: doc(text),
      saveIntent: intent,
    },
    expected: token,
  });
}
async function seed() {
  const n = (await external({ type: "createNote" })).value;
  await externalSave(n.id, "base body");
  const folder = (
    await external({ type: "createFolder", name: "local folder" })
  ).value;
  await external({
    type: "settings",
    settings: {
      selectedNote: n.id,
      selectedFolder: "default",
      theme: "light",
      sort: "title",
    },
  });
  return { n, folder };
}
const entry = `import React from'react';import{createRoot}from'react-dom/client';import App from'/src/App.tsx';import * as bridge from'/src/bridge.ts';import{undoDepth,redoDepth}from'@tiptap/pm/history';import'/src/style.css';window.bridge=bridge;window.historyDepth={undoDepth,redoDepth};window.mount=()=>createRoot(document.getElementById('root')).render(React.createElement(App));`;
let observedApp = false;
const vite = await createViteServer({
  configFile: false,
  plugins: [
    {
      name: "observe-real-app",
      resolveId(id) {
        if (id === "/__metadata.tsx") return id;
      },
      load(id) {
        if (id === "/__metadata.tsx") return entry;
      },
      transform(code, id) {
        if (id === resolve("src/App.tsx")) {
          const needle =
            "  const newNote = useCallback(() => createNote(), [createNote]);";
          assert.equal(code.split(needle).length, 2);
          observedApp = true;
          return {
            code: code.replace(
              needle,
              `  window.__app={editor, saveDoc, createNote, updateSettings, openFormat, closeFormat, formatTarget, paperTarget, ws:()=>wsRef.current, pending:pendingDocs.current, revisions:revisions.current, refresh:()=>metadataRefreshRef.current(), sync:()=>synchronizeRef.current(), synchronizing:()=>synchronizingRef.current};\n` +
                needle,
            ),
            map: null,
          };
        }
      },
    },
    react(),
  ],
  server: { middlewareMode: true, hmr: { host: "127.0.0.1", port: 0 } },
  appType: "custom",
});
const server = createServer(async (req, res) => {
  try {
    if (req.url === "/__ipc") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const row = JSON.parse(body),
        result = await call(row.command, row.args, row.window);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(result));
    } else if (req.url === "/__check") {
      res.setHeader("content-type", "text/html");
      res.end(
        await vite.transformIndexHtml(
          req.url,
          '<!doctype html><div id="root"></div><script type="module" src="/__metadata.tsx"></script>',
        ),
      );
    } else vite.middlewares(req, res);
  } catch (error) {
    res.statusCode = 500;
    res.end(String(error));
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
origin = `http://127.0.0.1:${server.address().port}`;
async function page(mount = false) {
  context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  activePage = page;
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.route("**/*", (route) =>
    route.request().url().startsWith(origin) ||
    route.request().url().startsWith("data:")
      ? route.continue()
      : route.abort(),
  );
  await page.addInitScript(() => {
    let callbackId = 0;
    const callbacks = new Map(),
      listeners = new Map();
    const control = (window.__control = {
      mute: false,
      events: [],
      held: [],
      requests: [],
      hold: null,
    });
    window.isTauri = true;
    window.__emit = (name, payload) => {
      for (const id of listeners.get(name) || [])
        callbacks.get(id)?.({ event: name, id, payload });
    };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { label: "main" },
      },
      transformCallback(callback) {
        const id = ++callbackId;
        callbacks.set(id, callback);
        return id;
      },
      convertFileSrc: (path) => path,
      async invoke(command, args = {}) {
        control.requests.push({ command, args });
        if (command === "plugin:event|listen") {
          const list = listeners.get(args.event) || [];
          list.push(args.handler);
          listeners.set(args.event, list);
          return args.handler;
        }
        if (command === "plugin:event|unlisten") return;
        if (
          command.startsWith("plugin:") &&
          !command.startsWith("plugin:notes")
        )
          return null;
        const result = await fetch("/__ipc", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ command, args, window: "main" }),
        }).then((r) => r.json());
        control.events.push(...result.events);
        if (!control.mute)
          for (const event of result.events)
            window.__emit(event.name, event.payload);
        const rule = control.hold;
        if (
          rule &&
          rule.command === command &&
          (!rule.type || rule.type === args.action?.type)
        ) {
          control.hold = null;
          await new Promise((resolve) =>
            control.held.push({ result, args, command, release: resolve }),
          );
        }
        if (!result.ok) throw result.error;
        return result.value;
      },
    };
  });
  await page.goto(origin + "/__check");
  await page.waitForFunction(() => window.bridge);
  if (mount) {
    await page.evaluate(() => window.mount());
    await page.waitForFunction(
      () => window.__app?.editor && !window.__app.synchronizing(),
    );
  }
  return page;
}
async function emit(page, events) {
  await page.evaluate(
    (events) => events.forEach((e) => window.__emit(e.name, e.payload)),
    events,
  );
}
async function run(name, work) {
  if (process.argv[3] && !name.includes(process.argv[3])) return;
  const record = { name };
  results.push(record);
  try {
    await start(name);
    await work(record);
    record.passed = true;
  } catch (error) {
    record.passed = false;
    record.error = String(error);
    throw error;
  } finally {
    await writeFile(
      resolve(out, "results.json"),
      JSON.stringify(
        {
          binaryHash: createHash("sha256")
            .update(await readFile(binary))
            .digest("hex"),
          observedApp,
          results,
          errors,
        },
        null,
        2,
      ) + "\n",
    );
    await writeFile(
      resolve(out, "transport.jsonl"),
      records.map((r) => JSON.stringify(r)).join("\n") + "\n",
    );
  }
}
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
    args: ["--disk-cache-size=1048576", "--media-cache-size=1048576"],
  });
  await run("observed-ack-does-not-consume-equal-event", async (r) => {
    const { n } = await seed(),
      p = await page();
    r.result = await p.evaluate(async (id) => {
      const b = window.bridge;
      window.__control.mute = true;
      b.markWorkspaceApplied(await b.loadWorkspace(true));
      const before = b.metadataGate.applied;
      const intent = await b.registerSaveIntent(id);
      const delivery = await b.action({
        type: "saveNote",
        id,
        revision: 1,
        saveIntent: intent,
        document: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "ACK first" }],
            },
          ],
        },
      });
      const observed = b.metadataGate.observed,
        applied = b.metadataGate.applied;
      let needed;
      const unlisten = await b.subscribeMetadata(() => {
        needed = b.metadataGate.needsRefresh;
      });
      const event = window.__control.events.find(
        (e) => e.name === "notes-metadata",
      );
      window.__emit(event.name, event.payload);
      unlisten();
      b.markWorkspaceApplied(await b.loadWorkspace());
      return {
        before,
        observed,
        applied,
        needed,
        after: b.metadataGate.applied,
        revision: delivery.value.revision,
      };
    }, n.id);
    assert.equal(r.result.applied, r.result.before);
    assert.ok(r.result.observed > r.result.applied);
    assert.equal(r.result.needed, true);
    assert.equal(r.result.after, r.result.observed);
    assert.equal(r.result.revision, 2);
  });
  await run(
    "old-workspace-cannot-remove-created-access-before-save-ack",
    async (r) => {
      await seed();
      const p = await page();
      await p.evaluate(async () => {
        const b = window.bridge;
        b.markWorkspaceApplied(await b.loadWorkspace(true));
        await b.subscribeMetadata(() => {});
        window.__control.hold = { command: "load_workspace" };
        window.oldRead = b.loadWorkspace().then(
          () => "published",
          (e) => e.code,
        );
      });
      await p.waitForFunction(() => window.__control.held.length === 1);
      r.result = await p.evaluate(async () => {
        const b = window.bridge,
          created = await b.action({ type: "createNote" }),
          id = created.receipt.createdId;
        const before = b.accessGate.state.notes[id];
        window.__control.held.shift().release();
        const old = await window.oldRead;
        const after = b.accessGate.state.notes[id];
        const intent = await b.registerSaveIntent(id);
        const saved = await b.action({
          type: "saveNote",
          id,
          revision: 0,
          saveIntent: intent,
          document: { type: "doc", content: [{ type: "paragraph" }] },
        });
        return {
          id,
          before,
          after,
          old,
          accepted: saved.accessAccepted,
          revision: saved.value?.revision,
        };
      });
      assert.equal(r.result.old, "metadata_stale");
      assert.deepEqual(r.result.before, r.result.after);
      assert.equal(r.result.accepted, true);
      assert.equal(r.result.revision, 1);
    },
  );
  await run("successful-create-id-survives-newer-access", async (r) => {
    await seed();
    const p = await page();
    await p.evaluate(async () => {
      const b = window.bridge;
      b.markWorkspaceApplied(await b.loadWorkspace(true));
      await b.subscribeAccess(() => {});
      await b.subscribeMetadata(() => {});
      window.__control.hold = {
        command: "workspace_action",
        type: "createNote",
      };
      window.creation = b.action({ type: "createNote" });
    });
    await p.waitForFunction(() => window.__control.held.length === 1);
    const id = await p.evaluate(
      () => window.__control.held[0].result.value.receipt.createdId,
    );
    const deleted = await external({ type: "deleteNote", id });
    await emit(p, deleted.events);
    r.result = await p.evaluate(async () => {
      window.__control.held.shift().release();
      const delivery = await window.creation;
      return {
        id: delivery.receipt.createdId,
        accessAccepted: delivery.accessAccepted,
        hasValue: !!delivery.value,
        creates: window.__control.requests.filter(
          (r) => r.args.action?.type === "createNote",
        ).length,
      };
    });
    assert.equal(r.result.id, id);
    assert.equal(r.result.accessAccepted, false);
    assert.equal(r.result.hasValue, false);
    assert.equal(r.result.creates, 1);
  });
  await run(
    "mounted-metadata-keeps-editor-composition-undo-bookmarks-pending",
    async (r) => {
      const { n, folder } = await seed(),
        p = await page(true);
      await p.evaluate(() => {
        const a = window.__app,
          e = a.editor;
        window.retainedEditor = e;
        window.retainedDom = e.view.dom;
        window.__control.hold = {
          command: "workspace_action",
          type: "saveNote",
        };
        e.commands.setTextSelection(4);
        e.commands.insertContent(" local");
        e.view.dom.dispatchEvent(
          new CompositionEvent("compositionstart", { bubbles: true, data: "" }),
        );
        a.openFormat();
        window.retainedBookmark = window.__app.formatTarget.current.bookmark;
        window.beforeState = {
          undo: window.historyDepth.undoDepth(e.state),
          baseline: a.revisions.expected(a.ws().notes[0].id),
        };
      });
      await p.waitForFunction(() => window.__control.held.length === 1);
      const changed = await external({
        type: "renameFolder",
        id: folder.id,
        name: "remote folder",
      });
      await external({
        type: "settings",
        settings: { theme: "dark", sort: "updated", selectedFolder: folder.id },
      });
      await emit(p, changed.events);
      await p.waitForFunction(
        (seq) => window.bridge.metadataGate.applied === seq,
        changed.value.metadata.sequence,
      );
      r.result = await p.evaluate((id) => {
        const a = window.__app,
          e = a.editor;
        return {
          same: e === window.retainedEditor,
          sameDom: e.view.dom === window.retainedDom,
          composing: e.view.composing,
          editable: e.isEditable,
          undo: window.historyDepth.undoDepth(e.state),
          beforeUndo: window.beforeState.undo,
          bookmark: a.formatTarget.current.bookmark === window.retainedBookmark,
          pending: a.pending.has(id),
          baseline: a.revisions.expected(id),
          beforeBaseline: window.beforeState.baseline,
          settings: a.ws().settings,
          synchronizing: a.synchronizing(),
        };
      }, n.id);
      for (const key of [
        "same",
        "sameDom",
        "composing",
        "editable",
        "bookmark",
        "pending",
      ])
        assert.equal(r.result[key], true, key);
      assert.equal(r.result.undo, r.result.beforeUndo);
      assert.equal(r.result.baseline, r.result.beforeBaseline);
      assert.equal(r.result.settings.theme, "light");
      assert.equal(r.result.settings.sort, "title");
      assert.equal(r.result.settings.selectedFolder, "default");
      assert.equal(r.result.synchronizing, false);
      await p.evaluate(() => {
        window.retainedEditor.view.dom.dispatchEvent(
          new CompositionEvent("compositionend", { bubbles: true, data: "" }),
        );
        window.__control.held.shift().release();
      });
      await p.waitForFunction(() => window.__app.pending.size === 0);
    },
  );
  await run(
    "mounted-newer-hydrate-overlay-then-older-save-ack-reveals-authority",
    async (r) => {
      const { n } = await seed(),
        p = await page(true);
      await p.evaluate((id) => {
        window.__control.hold = {
          command: "workspace_action",
          type: "saveNote",
        };
        window.ownSave = window.__app.saveDoc(id, {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "local pending" }],
            },
          ],
        });
      }, n.id);
      await p.waitForFunction(() => window.__control.held.length === 1);
      const remote = await externalSave(n.id, "newer remote authoritative");
      await emit(p, remote.events);
      await p.waitForFunction(
        (seq) => window.bridge.metadataGate.applied === seq,
        remote.value.metadata.sequence,
      );
      r.before = await p.evaluate(
        (id) => ({
          pending: window.__app.pending.has(id),
          text: window.__app.ws().notes.find((n) => n.id === id).plainText,
          baseline: window.__app.revisions.expected(id),
        }),
        n.id,
      );
      assert.equal(r.before.pending, true);
      assert.equal(r.before.text, "local pending");
      assert.equal(r.before.baseline, 1);
      await p.evaluate(() => window.__control.held.shift().release());
      await p.waitForFunction(
        (id) =>
          !window.__app.pending.has(id) &&
          window.__app.ws().notes.find((n) => n.id === id).plainText ===
            "newer remote authoritative",
        n.id,
      );
      r.after = await p.evaluate(
        async (id) => ({
          saved: await window.ownSave,
          baseline: window.__app.revisions.expected(id),
          revision: window.__app.ws().notes.find((n) => n.id === id).revision,
          applied: window.bridge.metadataGate.applied,
          observed: window.bridge.metadataGate.observed,
        }),
        n.id,
      );
      assert.equal(r.after.saved.saved, true);
      assert.equal(r.after.baseline, 3);
      assert.equal(r.after.revision, 3);
      assert.equal(r.after.applied, r.after.observed);
    },
  );
  await run("mounted-lost-event-focus-recovery-preserves-editor", async (r) => {
    const { folder } = await seed(),
      p = await page(true);
    await p.evaluate(() => {
      window.retainedEditor = window.__app.editor;
    });
    const changed = await external({
      type: "renameFolder",
      id: folder.id,
      name: "lost event recovered",
    });
    await p.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await p.waitForFunction(
      (seq) => window.bridge.metadataGate.applied === seq,
      changed.value.metadata.sequence,
    );
    r.result = await p.evaluate(() => ({
      same: window.__app.editor === window.retainedEditor,
      folder: window.__app.ws().folders.find((f) => f.kind === "normal").name,
      synchronizing: window.__app.synchronizing(),
    }));
    assert.equal(r.result.same, true);
    assert.equal(r.result.folder, "lost event recovered");
    assert.equal(r.result.synchronizing, false);
  });
  await run(
    "mounted-new-process-requires-trusted-sync-before-publishing",
    async (r) => {
      const { n, folder } = await seed(),
        p = await page(true);
      const old = await p.evaluate(() => window.bridge.accessGate.expected());
      const closing = processHandle;
      await new Promise((resolve) => {
        closing.once("exit", resolve);
        closing.stdin.end();
      });
      connect(sessionDirectory);
      const changed = await external({
        type: "renameFolder",
        id: folder.id,
        name: "new process folder",
      });
      assert.notEqual(changed.value.access.sessionId, old.sessionId);
      await p.evaluate(() => {
        window.__control.hold = { command: "load_workspace" };
        window.oldEditor = window.__app.editor;
      });
      await emit(p, changed.events);
      await p.waitForFunction(() => window.__control.held.length === 1);
      r.before = await p.evaluate(() => ({
        covered: window.__app.synchronizing(),
        session: window.bridge.accessGate.state.sessionId,
      }));
      assert.equal(r.before.covered, true);
      assert.equal(r.before.session, old.sessionId);
      const stale = await call(
        "register_save_intent",
        {
          noteId: n.id,
          intent: "old-process",
          expected: { ...old, noteEpoch: 0 },
        },
        "main",
      );
      assert.equal(stale.ok, false);
      assert.equal(stale.error.code, "access_changed");
      await p.evaluate(() => window.__control.held.shift().release());
      await p.waitForFunction(
        (session) =>
          !window.__app.synchronizing() &&
          window.bridge.accessGate.state.sessionId === session,
        changed.value.access.sessionId,
      );
      r.after = await p.evaluate(() => ({
        session: window.bridge.accessGate.state.sessionId,
        metadata: window.__app.ws().metadata,
        folder: window.__app.ws().folders.find((f) => f.kind === "normal").name,
      }));
      assert.equal(r.after.metadata.sessionId, r.after.session);
      assert.equal(r.after.folder, "new process folder");
    },
  );
  await run("independent-mounted-save-ack-after-lock-commit-cannot-publish-body", async (r) => {
    const { n } = await seed(), p = await page(true);
    await p.evaluate((id) => {
      window.oldEditor = window.__app.editor;
      window.__control.hold = {command:"workspace_action", type:"saveNote"};
      window.lateSave = window.__app.saveDoc(id, {
        type:"doc", content:[{type:"heading",attrs:{level:1},content:[{type:"text",text:"PUBLIC ORDERING TITLE"}]},{type:"paragraph",content:[{type:"text",text:"PRIVATE ORDERING MARKER"}]}]
      });
    }, n.id);
    await p.waitForFunction(() => window.__control.held.length === 1);
    const locked = await external({type:"lockNote",id:n.id,password:"abcdef"});
    assert.equal(locked.value.receipt.changes[0].kind,"note");
    assert.equal(locked.events[0].name,"notes-access");
    assert.equal(locked.events[0].payload.phase,"commit");
    assert.equal(locked.events[1].name,"notes-metadata");
    assert.ok(!JSON.stringify(locked).includes("PRIVATE ORDERING MARKER"));
    await emit(p,locked.events);
    await p.waitForFunction((sequence) => !window.__app.synchronizing() &&
      window.bridge.metadataGate.applied >= sequence, locked.value.metadata.sequence);
    r.before = await p.evaluate((id) => ({
      oldDestroyed:window.oldEditor.isDestroyed,
      authorized:window.bridge.accessGate.state.notes[id].authorized,
      body:JSON.stringify(window.__app.ws().notes.find(n=>n.id===id).document),
      pending:window.__app.pending.has(id),
      applied:window.bridge.metadataGate.applied
    }),n.id);
    assert.equal(r.before.oldDestroyed,true);
    assert.equal(r.before.authorized,false);
    assert.equal(r.before.pending,false);
    assert.ok(!r.before.body.includes("PRIVATE ORDERING MARKER"));
    await p.evaluate(() => window.__control.held.shift().release());
    r.after = await p.evaluate(async (id) => {
      const outcome=await window.lateSave;
      return {
        saved:outcome.saved,error:outcome.error?.code,
        authorized:window.bridge.accessGate.state.notes[id].authorized,
        body:JSON.stringify(window.__app.ws().notes.find(n=>n.id===id).document),
        pending:window.__app.pending.has(id),applied:window.bridge.metadataGate.applied,
        saves:window.__control.requests.filter(r=>r.args.action?.type==="saveNote").length
      };
    },n.id);
    assert.equal(r.after.saved,false);
    assert.equal(r.after.error,"access_changed");
    assert.equal(r.after.authorized,false);
    assert.equal(r.after.pending,false);
    assert.ok(!r.after.body.includes("PRIVATE ORDERING MARKER"));
    assert.ok(r.after.applied >= r.before.applied);
    assert.equal(r.after.saves,1);
  });
  assert.ok(observedApp);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      passed: results.length,
      failed: 0,
      browser: await browser.version(),
    }),
  );
} finally {
  await context?.close();
  await browser?.close();
  processHandle?.stdin.end();
  await vite.close();
  await new Promise((resolve) => server.close(resolve));
}
