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
  binary = resolve("src-tauri/target/debug/notes-u-session-transport");
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
      document: typeof text === "string" ? doc(text) : text,
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
              `  window.__app={editor, saveDoc, createNote, updateSettings, openFormat, closeFormat, chooseFolder, chooseNote, openFolder:(id)=>setFolderForm({folder:wsRef.current.folders.find(f=>f.id===id)}), backForm:()=>folderFormHandle.current?.cancel(), patch:(a)=>patch(a), archive:(mode)=>archive(mode), folder:()=>folderId, note:()=>noteId, listed:()=>listed.map(n=>n.id), query:()=>query, setQuery, setSearching, setSearchNoteId, formatTarget, paperTarget, ws:()=>wsRef.current, pending:pendingDocs.current, revisions:revisions.current, refresh:()=>metadataRefreshRef.current(), sync:()=>synchronizeRef.current(), synchronizing:()=>synchronizingRef.current};\n` +
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
async function page(mount = false, mobile = false) {
  context = await browser.newContext({
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1280, height: 900 },
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
    Object.defineProperty(navigator, "platform", { value: "Linux" });
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
        if (command === "plugin:dialog|open") return control.openPath;
        if (command === "plugin:dialog|save") return control.savePath;
        if (command === "load_workspace" && control.failLoads > 0) {
          control.failLoads--;
          throw { code: "test_read_failure", message: "受控读取失败" };
        }
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
const tagDoc = (names, text = "") => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        ...(text ? [{ type: "text", text: text + " " }] : []),
        ...names.flatMap((name) => [
          {
            type: "text",
            text: "#" + name,
            marks: [{ type: "noteTag", attrs: { name } }],
          },
          { type: "text", text: " " },
        ]),
      ],
    },
  ],
});
const q = (rules, combine = "all") => ({ version: 1, combine, rules });
async function seedTagged() {
  const { n, folder } = await seed();
  await externalSave(n.id, tagDoc(["A"], "tagged"));
  return { n, folder };
}
async function smart(name, rules) {
  return (
    await external({
      type: "createSmartFolder",
      input: { name, query: q(rules) },
    })
  ).value;
}
async function selectFolder(p, id) {
  await p.evaluate((id) => window.__app.chooseFolder(id), id);
  await p.waitForFunction((id) => window.__app.folder() === id, id);
}
async function edit(p, id) {
  await p
    .locator(".folder-row")
    .filter({
      hasText: (await must("load_workspace")).value.folders.find(
        (f) => f.id === id,
      ).name,
    })
    .click({ button: "right" });
  await p.getByRole("button", { name: "编辑智能文件夹", exact: true }).click();
  await p
    .getByRole("dialog", { name: "编辑智能文件夹", exact: true })
    .waitFor();
}
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
    args: ["--disk-cache-size=1048576", "--media-cache-size=1048576"],
  });
  await run(
    "draft-third-type-insertion-disabled-and-unsupported-recovery",
    async (r) => {
      await seedTagged();
      const p = await page(true);
      await p.getByRole("button", { name: "新建文件夹", exact: true }).click();
      await p.getByRole("checkbox", { name: "制作智能文件夹" }).check();
      await p
        .getByRole("textbox", { name: "名称", exact: true })
        .fill("三条草稿边界");
      await p.getByRole("textbox", { name: "标签", exact: true }).fill("A");
      await p.getByRole("option", { name: "#A", exact: true }).click();
      const types = () =>
        p
          .getByLabel("过滤条件类型")
          .evaluateAll((els) => els.map((e) => e.value));
      const plusDisabled = () =>
        p
          .getByRole("button", { name: "添加过滤条件" })
          .evaluateAll((els) => els.map((e) => e.disabled));
      await p.getByRole("button", { name: "添加过滤条件" }).click();
      assert.deepEqual(await types(), ["tags", "creationDate"]);
      assert.deepEqual(await plusDisabled(), [false, false]);
      await p.getByRole("button", { name: "添加过滤条件" }).first().click();
      assert.deepEqual(await types(), ["tags", "pinned", "creationDate"]);
      assert.deepEqual(await plusDisabled(), [true, true, true]);
      assert.equal(await p.getByLabel("创建日期模式").inputValue(), "today");
      assert.equal(await p.getByLabel("置顶模式").inputValue(), "true");
      assert.equal(await p.locator(".smart-token").textContent(), "#A×");
      for (let i = 0; i < 3; i++) {
        const options = await p
          .getByLabel("过滤条件类型")
          .nth(i)
          .locator("option")
          .evaluateAll((els) =>
            els.map((e) => ({ value: e.value, disabled: e.disabled })),
          );
        for (const value of ["tags", "pinned", "creationDate"])
          if (value !== (await types())[i])
            assert.equal(options.find((o) => o.value === value).disabled, true);
      }
      await p.getByRole("button", { name: "好", exact: true }).click();
      await p
        .getByRole("alert")
        .filter({ hasText: "尚未接入本地规则" })
        .waitFor();
      assert.deepEqual(await types(), ["tags", "pinned", "creationDate"]);
      assert.equal(
        await p
          .getByRole("textbox", { name: "名称", exact: true })
          .inputValue(),
        "三条草稿边界",
      );
      assert.equal(await p.locator(".smart-token").textContent(), "#A×");
      assert.equal(
        (await must("load_workspace")).value.folders.filter(
          (f) => f.kind === "smart",
        ).length,
        0,
      );
      assert.equal(
        await p.evaluate(
          () =>
            window.__control.requests.filter(
              (r) => r.args.action?.type === "createSmartFolder",
            ).length,
        ),
        0,
      );
      await p.screenshot({
        path: resolve(out, "three-draft-rules-rejected-preserved.png"),
      });
      await p.getByRole("button", { name: "移除过滤条件" }).nth(2).click();
      assert.deepEqual(await types(), ["tags", "pinned"]);
      assert.deepEqual(await plusDisabled(), [false, false]);
      await p.getByRole("button", { name: "添加过滤条件" }).first().click();
      assert.deepEqual(await types(), ["tags", "creationDate", "pinned"]);
      await p.getByRole("button", { name: "移除过滤条件" }).nth(2).click();
      assert.deepEqual(await types(), ["tags", "creationDate"]);
      assert.deepEqual(await plusDisabled(), [false, false]);
      await p.getByRole("button", { name: "添加过滤条件" }).nth(1).click();
      assert.deepEqual(await types(), ["tags", "creationDate", "pinned"]);
      assert.deepEqual(await plusDisabled(), [true, true, true]);
      assert.equal(await p.locator(".smart-token").textContent(), "#A×");
      await p.getByRole("button", { name: "移除过滤条件" }).nth(1).click();
      await p.getByRole("button", { name: "好", exact: true }).click();
      await p.waitForFunction(() => !document.querySelector(".smart-form"));
      const saved = (await must("load_workspace")).value.folders.find(
        (f) => f.name === "三条草稿边界",
      );
      assert.deepEqual(saved.query.rules, [
        { type: "tags", mode: "allSelected", names: ["A"] },
        { type: "pinned", value: true },
      ]);
      r.saved = { id: saved.id, rules: saved.query.rules };
    },
  );
  await run("mac-default-warning-cancel-addrow-real-create-once", async (r) => {
    const { n } = await seedTagged(),
      p = await page(true);
    await p.getByRole("button", { name: "新建文件夹", exact: true }).click();
    await p.getByRole("checkbox", { name: "制作智能文件夹" }).check();
    await p
      .getByRole("textbox", { name: "名称", exact: true })
      .fill("标签视图");
    await p.screenshot({ path: resolve(out, "mac-default-form.png") });
    await p.getByRole("button", { name: "好", exact: true }).click();
    await p.getByRole("alertdialog").waitFor();
    assert.equal(
      (await must("load_workspace")).value.folders.filter(
        (f) => f.kind === "smart",
      ).length,
      0,
    );
    await p.screenshot({ path: resolve(out, "mac-empty-warning.png") });
    await p
      .getByRole("alertdialog")
      .getByRole("button", { name: "好" })
      .click();
    await p.getByRole("button", { name: "取消", exact: true }).click();
    assert.equal(
      (await must("load_workspace")).value.folders.filter(
        (f) => f.kind === "smart",
      ).length,
      0,
    );
    await p.getByRole("button", { name: "新建文件夹", exact: true }).click();
    await p.getByRole("checkbox", { name: "制作智能文件夹" }).check();
    await p
      .getByRole("textbox", { name: "名称", exact: true })
      .fill("标签视图");
    await p.getByRole("textbox", { name: "标签", exact: true }).fill("A");
    await p.getByRole("option", { name: "#A", exact: true }).click();
    await p.getByLabel("标签模式").selectOption("anyTag");
    assert.equal(
      await p.getByRole("textbox", { name: "标签", exact: true }).count(),
      0,
    );
    await p.getByLabel("标签模式").selectOption("allSelected");
    assert.equal(await p.locator(".smart-token").textContent(), "#A×");
    await p.getByRole("button", { name: "添加过滤条件" }).click();
    assert.equal(
      await p.getByLabel("过滤条件类型").nth(1).inputValue(),
      "creationDate",
    );
    assert.equal(await p.getByLabel("创建日期模式").inputValue(), "today");
    await p.getByRole("button", { name: "好", exact: true }).click();
    await p
      .getByRole("alert")
      .filter({ hasText: "尚未接入本地规则" })
      .waitFor();
    await p.getByLabel("过滤条件类型").nth(1).selectOption("pinned");
    assert.equal(await p.locator(".smart-error").count(), 0);
    r.geometry = await p.evaluate(() => {
      const box = (selector) => {
        const { x, y, width, height } = document
          .querySelector(selector)
          .getBoundingClientRect();
        return { x, y, width, height };
      };
      return {
        viewport: { width: innerWidth, height: innerHeight },
        dialog: box(".smart-form"),
        title: box(".smart-mac h2"),
        name: box(".smart-name input"),
        checkbox: box(".smart-make input"),
        description: box(".smart-make p"),
        combination: box(".smart-combine select"),
        rules: [
          ...document.querySelectorAll(".smart-rule > select:first-child"),
        ].map((el) => {
          const { x, y, width, height } = el.getBoundingClientRect();
          return { x, y, width, height };
        }),
      };
    });
    await p.screenshot({ path: resolve(out, "mac-tags-pinned-form.png") });
    await p.evaluate(() => {
      window.__control.hold = {
        command: "workspace_action",
        type: "createSmartFolder",
      };
    });
    await p.getByRole("button", { name: "好", exact: true }).dblclick();
    await p.waitForFunction(() => window.__control.held.length === 1);
    assert.equal(
      await p.evaluate(
        () =>
          window.__control.requests.filter(
            (r) => r.args.action?.type === "createSmartFolder",
          ).length,
      ),
      1,
    );
    await p.evaluate(() => window.__control.held.shift().release());
    await p.waitForFunction(() => !document.querySelector(".smart-form"));
    const saved = (await must("load_workspace")).value.folders.find(
      (f) => f.name === "标签视图",
    );
    assert.equal(saved.kind, "smart");
    assert.equal(saved.query.rules.length, 2);
    assert.equal(await p.evaluate(() => window.__app.folder()), saved.id);
    assert.deepEqual(await p.evaluate(() => window.__app.listed()), []);
    await p.evaluate((id) => {
      window.__app.patch({ type: "patchNote", id, pinned: true });
    }, n.id);
    await p.waitForFunction((id) => window.__app.listed().includes(id), n.id);
    assert.equal(
      await p.locator(".folder-row.selected .count").textContent(),
      "1",
    );
    r.saved = {
      id: saved.id,
      revision: saved.definitionRevision,
      count: 1,
      creates: 1,
    };
  });
  await run("mac-edit-cas-cancel-zero-and-same-editor-undo", async (r) => {
    const { n } = await seedTagged(),
      f = await smart("可编辑", [{ type: "tags", mode: "anyTag" }]),
      p = await page(true);
    await selectFolder(p, f.id);
    await p.evaluate(() => {
      window.kept = window.__app.editor;
      window.kept.commands.insertContent(" history");
      window.undoBefore = window.historyDepth.undoDepth(window.kept.state);
    });
    await p.waitForFunction(() => window.__app.pending.size === 0);
    await edit(p, f.id);
    await p
      .getByRole("textbox", { name: "名称", exact: true })
      .fill("本窗旧草稿");
    const remote = await external({
      type: "updateSmartFolder",
      input: {
        id: f.id,
        name: "别窗新定义",
        query: q([{ type: "tags", mode: "anyTag" }]),
        expectedDefinitionRevision: 1,
      },
    });
    await emit(p, remote.events);
    await p.getByRole("button", { name: "好", exact: true }).click();
    await p.getByRole("button", { name: "载入最新定义" }).waitFor();
    assert.equal(
      await p.getByRole("textbox", { name: "名称", exact: true }).inputValue(),
      "本窗旧草稿",
    );
    assert.equal(
      (await must("load_workspace")).value.folders.find((x) => x.id === f.id)
        .name,
      "别窗新定义",
    );
    await p.getByRole("button", { name: "载入最新定义" }).click();
    await p.waitForFunction(
      () =>
        document.querySelector('input[aria-label="名称"]').value ===
        "别窗新定义",
    );
    await p.getByRole("button", { name: "取消", exact: true }).click();
    await edit(p, f.id);
    await p.getByLabel("标签模式").selectOption("noTags");
    await p.getByRole("button", { name: "好", exact: true }).click();
    await p.waitForFunction(() => !document.querySelector(".smart-form"));
    assert.deepEqual(await p.evaluate(() => window.__app.listed()), []);
    assert.equal(await p.evaluate(() => window.kept.isDestroyed), false);
    assert.equal(await p.evaluate(() => window.__app.note()), null);
    await edit(p, f.id);
    await p.getByLabel("标签模式").selectOption("anyTag");
    await p.getByRole("button", { name: "好", exact: true }).click();
    await p.waitForFunction(() => window.__app.editor === window.kept);
    r.editor = await p.evaluate(() => ({
      same: window.__app.editor === window.kept,
      undo: window.historyDepth.undoDepth(window.kept.state),
      before: window.undoBefore,
    }));
    assert.equal(r.editor.same, true);
    assert.equal(r.editor.undo, r.editor.before);
  });
  await run(
    "smart-search-cancel-newnote-default-move-and-definition-delete",
    async (r) => {
      const { n, folder } = await seedTagged();
      await external({ type: "patchNote", id: n.id, folderId: folder.id });
      const other = (
        await external({ type: "createNote", folderId: "default" })
      ).value;
      await externalSave(other.id, "unique global result");
      const f = await smart("标签A", [
          { type: "tags", mode: "allSelected", names: ["A"] },
        ]),
        p = await page(true);
      await selectFolder(p, f.id);
      await p.evaluate(() => {
        window.originalEditor = window.__app.editor;
        window.__app.setQuery("unique global");
      });
      await p.waitForFunction((id) => window.__app.note() === id, other.id);
      await p.evaluate(() => window.__app.setQuery(""));
      await p.waitForFunction((id) => window.__app.note() === id, n.id);
      assert.equal(
        await p.evaluate(() => window.__app.editor === window.originalEditor),
        true,
      );
      await p.getByRole("button", { name: "更多", exact: true }).click();
      await p.getByRole("button", { name: "移动备忘录", exact: true }).click();
      assert.equal(
        await p
          .locator(".move-list")
          .getByText("标签A", { exact: true })
          .count(),
        0,
      );
      await p.getByRole("button", { name: "取消", exact: true }).click();
      const removed = await external({
        type: "deleteSmartFolder",
        input: { id: f.id, expectedDefinitionRevision: 1 },
      });
      await emit(p, removed.events);
      await p.waitForFunction((id) => window.__app.folder() === id, folder.id);
      assert.equal(
        await p.evaluate(() => window.__app.editor === window.originalEditor),
        true,
      );
      const fresh = await smart("创建去向", [{ type: "tags", mode: "anyTag" }]);
      await emit(
        p,
        (await external({ type: "settings", settings: {} })).events,
      );
      await p.evaluate(() => window.__app.refresh());
      await selectFolder(p, fresh.id);
      await p.evaluate(() => window.__app.createNote());
      await p.waitForFunction(
        () =>
          window.__app.folder() === "default" &&
          window.__app.ws().notes.length === 3,
      );
      const selected = await p.evaluate(() =>
        window.__app.ws().notes.find((n) => n.id === window.__app.note()),
      );
      assert.equal(selected.folderId, "default");
      assert.equal(selected.pinned, false);
      assert.equal(selected.plainText, "");
      r.created = selected.id;
    },
  );
  await run(
    "mobile-two-stage-confirm-panel-back-cancel-and-real-save",
    async (r) => {
      await seedTagged();
      const p = await page(true, true);
      await p.getByRole("button", { name: "新建文件夹", exact: true }).click();
      await p
        .getByRole("textbox", { name: "名称", exact: true })
        .fill("手机智能");
      await p.getByRole("button", { name: /^过滤条件/ }).click();
      assert.equal(await p.locator(".smart-rule").count(), 0);
      await p.getByLabel("标签模式").selectOption("anyTag");
      await p.evaluate(() => window.__app.backForm());
      await p.getByRole("button", { name: /^过滤条件/ }).click();
      assert.equal(await p.getByLabel("标签模式").inputValue(), "allSelected");
      await p
        .getByRole("dialog", { name: "过滤条件", exact: true })
        .getByRole("button", { name: "#A", exact: true })
        .click();
      await p.screenshot({ path: resolve(out, "mobile-filter-tags.png") });
      await p
        .getByRole("button", { name: "确认过滤条件", exact: true })
        .click();
      assert.equal(
        (await must("load_workspace")).value.folders.filter(
          (f) => f.kind === "smart",
        ).length,
        0,
      );
      await p
        .getByRole("button", { name: "保存文件夹", exact: true })
        .dblclick();
      await p.waitForFunction(() => !document.querySelector(".smart-form"));
      const saved = (await must("load_workspace")).value.folders.find(
        (f) => f.name === "手机智能",
      );
      assert.equal(saved.kind, "smart");
      assert.deepEqual(saved.query.rules, [
        { type: "tags", mode: "allSelected", names: ["A"] },
      ]);
      assert.equal(
        await p.evaluate(
          () =>
            window.__control.requests.filter(
              (r) => r.args.action?.type === "createSmartFolder",
            ).length,
        ),
        1,
      );
      r.id = saved.id;
    },
  );
  await run(
    "smart-ime-loses-tag-keeps-original-owner-until-real-end",
    async (r) => {
      const { n } = await seedTagged(),
        f = await smart("组字标签", [{ type: "tags", mode: "anyTag" }]),
        p = await page(true);
      await selectFolder(p, f.id);
      await p.evaluate(() => {
        const e = window.__app.editor;
        window.kept = e;
        window.dom = e.view.dom;
        window.__control.hold = {
          command: "workspace_action",
          type: "saveNote",
        };
        e.view.dom.focus();
        e.commands.setTextSelection({ from: 9, to: 10 });
        e.view.dom.dispatchEvent(
          new CompositionEvent("compositionstart", { bubbles: true, data: "" }),
        );
        e.view.dispatch(e.state.tr.insertText("字", 9, 10));
      });
      await p.waitForFunction(() => window.__control.held.length === 1);
      r.during = await p.evaluate(
        (id) => ({
          same: window.__app.editor === window.kept,
          dom: window.__app.editor?.view.dom === window.dom,
          composing: window.kept.view.composing,
          editable: window.kept.isEditable,
          pending: window.__app.pending.has(id),
          ids: window.__app.listed(),
          owner: window.__app.ws().notes.find((n) => n.id === id).folderId,
        }),
        n.id,
      );
      assert.equal(r.during.same, true);
      assert.equal(r.during.dom, true);
      assert.equal(r.during.composing, true);
      assert.equal(r.during.editable, true);
      assert.equal(r.during.pending, true);
      assert.deepEqual(r.during.ids, []);
      assert.equal(r.during.owner, "default");
      assert.equal(
        await p.locator(".folder-row.selected .count").textContent(),
        "0",
      );
      await p.evaluate(() => {
        const e = window.kept;
        e.commands.setTextSelection(1);
        e.view.dom.dispatchEvent(
          new CompositionEvent("compositionend", { bubbles: true, data: "字" }),
        );
        e.view.dispatch(e.state.tr.setMeta("qa-final-transaction", true));
      });
      await p.waitForFunction(() => window.__app.editor === null);
      assert.equal(await p.evaluate(() => window.kept.isDestroyed), false);
      assert.equal(
        await p.evaluate((id) => window.__app.pending.has(id), n.id),
        true,
      );
      await p.evaluate(() => window.__control.held.shift().release());
      await p.waitForFunction(() => window.__app.pending.size === 0);
      const authoritative = (await must("load_workspace")).value.notes.find(
        (x) => x.id === n.id,
      );
      assert.equal(authoritative.folderId, "default");
      assert.equal(
        JSON.stringify(authoritative.document).includes("noteTag"),
        false,
      );
    },
  );
  await run(
    "peer-definition-change-keeps-preference-pending-composition-and-undo",
    async (r) => {
      const { n } = await seedTagged(),
        f = await smart("别窗规则", [{ type: "tags", mode: "anyTag" }]),
        p = await page(true);
      await selectFolder(p, f.id);
      await p.evaluate(() => {
        const e = window.__app.editor;
        window.kept = e;
        window.__control.hold = {
          command: "workspace_action",
          type: "saveNote",
        };
        e.view.dom.focus();
        e.commands.setTextSelection(1);
        e.commands.insertContent("本窗");
        e.commands.setTextSelection(1);
        e.view.dom.dispatchEvent(
          new CompositionEvent("compositionstart", { bubbles: true, data: "" }),
        );
        window.beforeUndo = window.historyDepth.undoDepth(e.state);
        window.beforeSettings = JSON.stringify(window.__app.ws().settings);
      });
      await p.waitForFunction(() => window.__control.held.length === 1);
      const changed = await external({
        type: "updateSmartFolder",
        input: {
          id: f.id,
          name: "新规则",
          query: q([{ type: "tags", mode: "noTags" }]),
          expectedDefinitionRevision: 1,
        },
      });
      await emit(p, changed.events);
      await p.waitForFunction(
        (seq) => window.bridge.metadataGate.applied === seq,
        changed.value.metadata.sequence,
      );
      r.during = await p.evaluate(() => ({
        same: window.__app.editor === window.kept,
        composing: window.kept.view.composing,
        undo: window.historyDepth.undoDepth(window.kept.state),
        beforeUndo: window.beforeUndo,
        settings: JSON.stringify(window.__app.ws().settings),
        beforeSettings: window.beforeSettings,
        ids: window.__app.listed(),
        pending: window.__app.pending.size,
      }));
      assert.equal(r.during.same, true);
      assert.equal(r.during.composing, true);
      assert.equal(r.during.undo, r.during.beforeUndo);
      assert.equal(r.during.settings, r.during.beforeSettings);
      assert.deepEqual(r.during.ids, []);
      assert.equal(r.during.pending, 1);
      await p.evaluate(() => {
        const e = window.kept;
        e.view.dom.dispatchEvent(
          new CompositionEvent("compositionend", { bubbles: true, data: "" }),
        );
        e.view.dispatch(e.state.tr.setMeta("qa-final-transaction", true));
      });
      await p.waitForFunction(() => window.__app.editor === null);
      await p.evaluate(() => window.__control.held.shift().release());
      await p.waitForFunction(() => window.__app.pending.size === 0);
      assert.equal(await p.evaluate(() => window.kept.isDestroyed), false);
    },
  );
  await run(
    "created-definition-receipt-retries-sync-without-second-create",
    async (r) => {
      await seedTagged();
      const p = await page(true);
      await p.getByRole("button", { name: "新建文件夹", exact: true }).click();
      await p.getByRole("checkbox", { name: "制作智能文件夹" }).check();
      await p
        .getByRole("textbox", { name: "名称", exact: true })
        .fill("只建一次");
      await p.getByLabel("标签模式").selectOption("anyTag");
      await p.evaluate(() => {
        window.__control.mute = true;
        window.__control.failLoads = 1;
      });
      await p.getByRole("button", { name: "好", exact: true }).click();
      await p
        .getByRole("dialog", { name: "同步文件夹", exact: true })
        .waitFor();
      assert.equal(
        await p.getByRole("textbox", { name: "名称", exact: true }).count(),
        0,
      );
      await p.getByRole("button", { name: "重试同步", exact: true }).click();
      await p.waitForFunction(() => !document.querySelector(".smart-form"));
      const rows = (await must("load_workspace")).value.folders.filter(
        (f) => f.name === "只建一次",
      );
      assert.equal(rows.length, 1);
      assert.equal(
        await p.evaluate(
          () =>
            window.__control.requests.filter(
              (r) => r.args.action?.type === "createSmartFolder",
            ).length,
        ),
        1,
      );
      r.id = rows[0].id;
    },
  );
  await run("cold-and-explicit-archive-restore-smart-selection", async (r) => {
    const { n } = await seedTagged();
    const f = await smart("恢复的智能目录", [{ type: "tags", mode: "anyTag" }]);
    await external({
      type: "settings",
      settings: { selectedFolder: f.id, selectedNote: n.id },
    });
    let p = await page(true);
    assert.equal(await p.evaluate(() => window.__app.folder()), f.id);
    assert.equal(await p.evaluate(() => window.__app.note()), n.id);
    assert.deepEqual(await p.evaluate(() => window.__app.listed()), [n.id]);
    const archivePath = resolve(sessionDirectory, "selection.notesbackup");
    const access = (await must("load_workspace")).value.access;
    await must("export_archive", {
      path: archivePath,
      expected: { sessionId: access.sessionId, epoch: access.epoch },
    });
    await selectFolder(p, "default");
    await p.waitForFunction(() => window.__app.pending.size === 0);
    await p.evaluate(async (path) => {
      window.__control.openPath = path;
      await window.__app.archive("import");
    }, archivePath);
    const imported = (await must("load_workspace")).value;
    const restoredFolder = imported.settings.selectedFolder;
    const restoredNote = imported.settings.selectedNote;
    assert.notEqual(restoredFolder, f.id); // Existing archive transaction remaps duplicate IDs.
    assert.notEqual(restoredNote, n.id);
    await p.waitForFunction(
      (id) => window.__app.folder() === id && !window.__app.synchronizing(),
      restoredFolder,
    );
    assert.equal(await p.evaluate(() => window.__app.note()), restoredNote);
    assert.ok(
      (await p.evaluate(() => window.__app.listed())).includes(restoredNote),
    );
    await p.evaluate(
      async (path) => {
        window.__control.openPath = path;
        await window.__app.archive("import");
      },
      resolve(sessionDirectory, "missing.notesbackup"),
    );
    assert.equal(await p.evaluate(() => window.__app.folder()), restoredFolder);
    assert.equal(await p.evaluate(() => window.__app.note()), restoredNote);
    assert.equal(await p.evaluate(() => window.__app.pending.size), 0);
    await context.close();
    context = null;
    await external({
      type: "settings",
      settings: {
        selectedFolder: "missing-smart-definition",
        selectedNote: n.id,
      },
    });
    p = await page(true);
    assert.equal(await p.evaluate(() => window.__app.folder()), "default");
    assert.equal(await p.evaluate(() => window.__app.note()), n.id);
    r.restored = {
      folder: restoredFolder,
      note: restoredNote,
      unknownFallback: "default",
    };
  });
  await run(
    "only-pinned-unpin-and-delete-definition-keep-pending-owner",
    async (r) => {
      const { n, folder } = await seedTagged();
      await external({
        type: "patchNote",
        id: n.id,
        folderId: folder.id,
        pinned: true,
      });
      const pinned = await smart("仅置顶", [{ type: "pinned", value: true }]);
      const tagged = await smart("保全待存", [
        { type: "tags", mode: "anyTag" },
      ]);
      const p = await page(true);
      await selectFolder(p, pinned.id);
      await p.evaluate(
        async (id) =>
          window.__app.patch({ type: "patchNote", id, pinned: false }),
        n.id,
      );
      await p.waitForFunction((id) => window.__app.folder() === id, folder.id);
      assert.equal(await p.evaluate(() => window.__app.note()), n.id);
      await selectFolder(p, tagged.id);
      await p.evaluate(() => {
        window.kept = window.__app.editor;
        window.__control.hold = {
          command: "workspace_action",
          type: "saveNote",
        };
        window.kept.view.dom.focus();
        window.kept.commands.setTextSelection(1);
        window.kept.commands.insertContent("尚未ACK");
      });
      await p.waitForFunction(() => window.__control.held.length === 1);
      const removed = await external({
        type: "deleteSmartFolder",
        input: { id: tagged.id, expectedDefinitionRevision: 1 },
      });
      await emit(p, removed.events);
      await p.waitForFunction((id) => window.__app.folder() === id, folder.id);
      assert.equal(await p.evaluate(() => window.__app.note()), n.id);
      assert.equal(
        await p.evaluate(() => window.__app.editor === window.kept),
        true,
      );
      assert.equal(
        await p.evaluate((id) => window.__app.pending.has(id), n.id),
        true,
      );
      assert.equal(
        await p.evaluate(
          (id) => window.__app.ws().notes.find((n) => n.id === id).folderId,
          n.id,
        ),
        folder.id,
      );
      await p.evaluate(() => window.__control.held.shift().release());
      await p.waitForFunction(() => window.__app.pending.size === 0);
      const saved = (await must("load_workspace")).value.notes.find(
        (x) => x.id === n.id,
      );
      assert.equal(saved.folderId, folder.id);
      assert.ok(saved.plainText.includes("尚未ACK"));
      r.owner = saved.folderId;
    },
  );
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
