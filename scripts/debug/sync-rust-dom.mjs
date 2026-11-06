#!/usr/bin/env node
// Two actual App/Tiptap DOM pages, each with its own real Rust Session, SQLite
// Store and socket. Only browser/OS/media boundaries are synthetic.
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { mkdir, readFile, writeFile, copyFile, chmod } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { openRuntime, api, state, idle } from "./runtime.mjs";
import { tinyPNG, refs, readerBoundary } from "./mobile-attachments.mjs";
import { sourceFingerprint } from "./source-identity.mjs";

const [buildDirectory, outputDirectory, backendRootArgument] =
  process.argv.slice(2);
if (!buildDirectory || !outputDirectory)
  throw Error(
    "Usage: node scripts/debug/sync-rust-dom.mjs BUILD_DIR FRESH_OUTPUT [BACKEND_SOURCE_ROOT]",
  );
const root = process.cwd(),
  output = resolve(outputDirectory),
  backendRoot = resolve(backendRootArgument || root);
assert(
  !output.startsWith(root + sep),
  "Live evidence must be outside the watched source tree",
);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const git = (directory, ...args) =>
  execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim();
const build = JSON.parse(
  await readFile(resolve(buildDirectory, "build.json"), "utf8"),
);
assert.equal(
  build.sourcesUnchanged,
  true,
  "Backend build inputs stayed unchanged",
);
const verifyBackend = async () => {
  for (const [file, digest] of Object.entries(build.sources)) {
    assert(
      !relative(backendRoot, resolve(backendRoot, file)).startsWith(".."),
      "Confined source path",
    );
    assert.equal(
      hash(await readFile(resolve(backendRoot, file))),
      digest,
      "Exact backend source " + file,
    );
  }
};
await verifyBackend();
assert.equal(
  hash(await readFile(build.binary.path)),
  build.binary.sha256,
  "Exact built binary",
);
await mkdir(output);
// A later author build may reuse its Cargo target. This owned snapshot cannot
// be replaced underneath the long-running browser evidence.
const binary = resolve(output, "notes-sync-dom-transport");
await copyFile(build.binary.path, binary);
await chmod(binary, 0o700);
assert.equal(hash(await readFile(binary)), build.binary.sha256);
const sourceBefore = await sourceFingerprint(root),
  sourceHead = git(root, "rev-parse", "HEAD");
const backendHead = git(backendRoot, "rev-parse", "HEAD"),
  backendDirty = git(backendRoot, "status", "--porcelain");
const started = performance.now(),
  checks = [],
  devices = [],
  observations = [],
  limitations = [];
await writeFile(
  resolve(output, "inputs.json"),
  JSON.stringify(
    {
      sourceHead,
      sourceBefore,
      backendHead,
      backendDirty: !!backendDirty,
      buildSourceHead: build.sourceHead,
      backendSources: build.sources,
      binarySha256: build.binary.sha256,
      frontend: {
        mode: "static-debug-bundle",
        DEV: true,
        VITE_NOTES_DEBUG: "1",
        NODE_ENV: "development",
      },
    },
    null,
    2,
  ) + "\n",
);
await mkdir(resolve(output, "input-scripts"));
for (const name of ["runtime.mjs", "rust-backend.mjs", "sync-rust-dom.mjs"])
  await copyFile(
    resolve(root, "scripts/debug", name),
    resolve(output, "input-scripts", name),
  );
let failure;
const check = (name, value) => {
  assert(value, name);
  checks.push(name);
  console.log("PASS " + name);
};
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const until = async (name, predicate, timeout = 20000) => {
  let timer,
    expired = false;
  const work = (async () => {
    while (!expired) {
      if (await predicate()) return;
      await delay(35);
    }
  })();
  try {
    await Promise.race([
      work,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          expired = true;
          reject(Error("Timed out: " + name));
        }, timeout);
      }),
    ]);
  } finally {
    expired = true;
    clearTimeout(timer);
  }
};
const token = (s, id) => ({
  sessionId: s.workspace.access.sessionId,
  epoch: s.workspace.access.epoch,
  ...(id ? { noteEpoch: s.workspace.access.notes[id].epoch } : {}),
});
class Device {
  async open(name, store) {
    this.name = name;
    this.store = store;
    this.runtime = await openRuntime({
      root,
      transport: binary,
      storeDirectory: store,
      rustEvents: true,
      bundleDebug: true,
      transportOptions: { closeTimeoutMs: 10000, recordPolls: false },
      beforeRustEvent: (event) => this.beforeEvent?.(event),
    });
    this.page = this.runtime.page;
    this.backend = this.runtime.backend;
    devices.push(this);
    return this;
  }
  async command(id, args = {}) {
    console.log("RUN " + this.name + " " + id);
    const result = await api(this.page, id, args);
    await idle(this.page);
    return result.result;
  }
  async inspect() {
    return state(this.page);
  }
  async workspace() {
    const r = await this.backend.call("load_workspace");
    assert(r.ok, r.error?.message);
    return r.value;
  }
  async note(id) {
    return (await this.workspace()).notes.find((n) => n.id === id);
  }
  async create(text) {
    await this.command("note.create");
    await this.command("editor.insertText", { text });
    return (await this.inspect()).selection.noteId;
  }
  async select(id) {
    await this.command("note.select", { id });
  }
  async edit(id, text) {
    await this.select(id);
    await this.command("editor.setContent", {
      document: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text }] }],
      },
    });
  }
  async sync(id, args = {}) {
    await this.command("data.open");
    const value = await this.command(id, args);
    await this.command("app.back");
    return value;
  }
  async conflict(id) {
    const r = await this.backend.call("sync_command", {
      command: { type: "conflicts" },
      expected: token(await this.inspect()),
    });
    if (!r.ok) {
      // Authority may advance between the real DOM state read and the query.
      // Retry only this documented stale snapshot; other errors are failures.
      assert.equal(r.error?.code, "sync_plan_stale", r.error?.message);
      observations.push({ name: "actual-conflict-query-retry", device: this.name, error: r.error.code });
      return undefined;
    }
    return r.value.conflicts.find((c) => c.entityId === id);
  }
  async keepAll(id, choose) {
    let conflict;
    await until("actual conflict before explicit keep-all", async () => {
      conflict = await this.conflict(id);
      return conflict?.variants.length >= 2;
    });
    const version = conflict.variants.find(choose);
    assert(version, "Expected original media branch retained");
    await this.command("data.open");
    await this.command("sync.resolve", {
      kind: "note",
      entityId: id,
      digest: version.digest,
      keepAll: true,
    });
    await this.page
      .getByRole("button", { name: "确认全部另存", exact: true })
      .click();
    await idle(this.page);
    await this.command("app.back");
    await until("actual keep-all operation completed", async () => {
      const r = await this.backend.call("sync_command", {
        command: { type: "conflicts" },
        expected: token(await this.inspect()),
      });
      return r.ok && !r.value.conflicts.some((c) => c.entityId === id);
    });
    return conflict;
  }
  async close() {
    if (this.closed) return;
    this.closed = true;
    await this.runtime.cleanup();
    check(
      this.name + " owned process exited naturally",
      this.backend.lifecycle.exit?.code === 0 &&
        this.backend.lifecycle.exit?.signal === null,
    );
  }
  async capture(name) {
    // Settings are closed before every capture; invitation inputs never enter
    // screenshots/HTML. No full debug command arguments are serialized.
    assert.equal(
      await this.page.locator('[data-sensitive="invitation"]').count(),
      0,
    );
    const s = await this.inspect();
    observations.push({
      name: this.name + ":" + name,
      selection: s.selection,
      save: s.save,
      quietWindow: s.quietWindow,
      recording: s.recording,
      access: s.workspace.access,
    });
    await writeFile(
      resolve(output, this.name + "-" + name + ".html"),
      await this.page.locator(".app").evaluate((n) => n.outerHTML),
    );
    await this.page.screenshot({
      path: resolve(output, this.name + "-" + name + ".png"),
    });
  }
}
try {
  const a = await new Device().open("A", resolve(output, "store-A"));
  const b = await new Device().open("B", resolve(output, "store-B"));
  const localA = await a.create("A preexisting local"),
    localB = await b.create("B preexisting local");
  // UI intentionally rejects port 0. Reserve a free loopback port then let
  // the actual host handler bind it; a bind race is a surfaced test failure.
  const port = await new Promise((done, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const value = server.address().port;
      server.close((error) => (error ? reject(error) : done(value)));
    });
  });
  await a.command("data.open");
  await a.command("sync.host.start", {
    deviceName: "Synthetic DOM A",
    port,
  });
  const statusA = await a.command("sync.status");
  const endpoint = statusA.status.listenAddress.replace("0.0.0.0", "127.0.0.1");
  await a.command("sync.invite", { endpoint });
  let invitation = await a.page
    .getByRole("textbox", { name: "生成的配对串" })
    .inputValue();
  assert(invitation.startsWith("notes-sync-v1:"));
  await b.command("data.open");
  await b.command("sync.pair", { invitation, deviceName: "Synthetic DOM B" });
  invitation = undefined;
  await a.command("app.back");
  await b.command("app.back");
  await until(
    "preexisting notes in both real pages",
    async () =>
      (await a.inspect()).workspace.notes.some((n) => n.id === localB) &&
      (await b.inspect()).workspace.notes.some((n) => n.id === localA),
  );
  check(
    "Two real App pages pair over authenticated sockets and retain both preexisting SQLite records",
    a.backend.pid !== b.backend.pid &&
      (await a.note(localB))?.plainText === "B preexisting local" &&
      (await b.note(localA))?.plainText === "A preexisting local",
  );

  await a.command("folder.open");
  await a.command("folder.updateDraft", {
    draft: { name: "DOM ordinary", smart: false },
  });
  await a.command("folder.submit");
  const folder = (await a.inspect()).workspace.folders.find(
    (f) => f.name === "DOM ordinary",
  );
  await a.command("folder.open");
  await a.command("folder.updateDraft", {
    draft: {
      name: "DOM pinned",
      smart: true,
      combine: "all",
      rules: [
        {
          key: 0,
          type: "pinned",
          mode: "allSelected",
          names: [],
          pinned: true,
        },
      ],
    },
  });
  await a.command("folder.submit");
  await a.command("folder.select", { id: folder.id });
  const id = await a.create("A created from actual editor");
  await a.command("note.patch", { pinned: true });
  await until("ordinary/smart folders and note arrive", async () => {
    const s = await b.inspect();
    return (
      s.workspace.notes.some(
        (n) => n.id === id && n.pinned && n.folderId === folder.id,
      ) &&
      s.workspace.folders.some(
        (f) => f.name === "DOM pinned" && f.kind === "smart",
      )
    );
  });
  check(
    "Actual folder forms, smart query, note creation and pin project to peer DOM and Store",
    (await b.note(id)).plainText === "A created from actual editor",
  );
  await b.edit(id, "B actual reverse edit");
  await until(
    "B edit in A App",
    async () =>
      (await a.inspect()).workspace.notes.find((n) => n.id === id)
        ?.plainText === "B actual reverse edit",
  );
  check(
    "Reverse actual Tiptap edit converges through independent Rust sockets",
    (await a.note(id)).plainText === "B actual reverse edit",
  );
  await a.select(localA);
  await a.page.locator(".tiptap:visible").focus();
  await a.page.evaluate(() => {
    const dom = document.querySelector('.tiptap[contenteditable="true"]');
    window.syncDOM = { dom, editor: dom.editor };
  });
  await a.command("editor.insertText", { text: " undo-local" });
  await b.edit(id, "B unrelated update");
  await until(
    "unrelated update",
    async () =>
      (await a.inspect()).workspace.notes.find((n) => n.id === id)
        ?.plainText === "B unrelated update",
  );
  check(
    "Unrelated remote metadata preserves actual editor DOM, editor identity and focus",
    await a.page.evaluate(
      () =>
        window.syncDOM.dom.isConnected &&
        window.syncDOM.dom === document.activeElement &&
        window.syncDOM.dom.editor === window.syncDOM.editor,
    ),
  );
  await a.command("editor.undo");
  check(
    "Unrelated network apply preserves actual local Undo history",
    !(await a.note(localA)).plainText.includes("undo-local"),
  );

  // Hold only local IPC delivery. Every operation and receipt is still generated
  // by the real Session/Runtime and the actual App quiet coordinator.
  const pendingNote = await a.create("Pending-save base");
  await until("pending owner on B", async () => !!(await b.note(pendingNote)));
  let saveHeld = false,
    unblockSave;
  const saveGate = new Promise((done) => {
    unblockSave = done;
  });
  let baseCall = a.backend.call.bind(a.backend);
  a.backend.call = async (command, args = {}) => {
    if (
      !saveHeld &&
      command === "workspace_action" &&
      args.action?.type === "saveNote" &&
      args.action.id === pendingNote
    ) {
      saveHeld = true;
      await saveGate;
    }
    return baseCall(command, args);
  };
  try {
    await api(a.page, "editor.insertText", { text: " local pending input" });
    await until(
      "actual save request held before Rust ACK",
      async () => saveHeld,
    );
    await b.edit(pendingNote, "Remote during pending local save");
    await until(
      "real prepare freezes while save ACK pending",
      async () => {
        const q = await a.inspect();
        return q.quietWindow.frozen && q.save.pending > 0;
      },
      4000,
    );
    check(
      "Real target prepare freezes and waits for actual local pending save ACK",
      !(await a.inspect()).quietWindow.editors.find((e) => e.id === pendingNote)
        .editable,
    );
  } finally {
    unblockSave();
  }
  await idle(a.page);
  a.backend.call = baseCall;
  let pendingConflict;
  await until("pending save retains concurrent heads", async () => {
    pendingConflict = await a.conflict(pendingNote);
    return pendingConflict?.variants.length >= 2;
  });
  check(
    "Pending local body and remote version both survive prepare flush",
    pendingConflict.variants.some((v) =>
      v.title.includes("local pending input"),
    ) &&
      pendingConflict.variants.some(
        (v) => v.title === "Remote during pending local save",
      ),
  );
  observations.push({
    name: "actual-pending-save-heads",
    noteId: pendingNote,
    variants: pendingConflict.variants,
  });

  // Delay a real ready request so the user can cancel a still-pending prepare.
  // Drop one actual abort receipt and hold release delivery: retry must use the
  // same retained operation rather than inventing a successful local abort.
  const navNote = await a.create("Navigation cancellation base");
  await until("navigation note on B", async () => !!(await b.note(navNote)));
  let readyOperation, unblockReady, unblockCancel, unblockTerminalEvent;
  let cancelResponses = 0,
    cancellationHeld = false,
    readyReturned = false;
  const readyGate = new Promise((done) => {
    unblockReady = done;
  });
  const cancelGate = new Promise((done) => {
    unblockCancel = done;
  });
  const terminalEventGate = new Promise((done) => {
    unblockTerminalEvent = done;
  });
  baseCall = a.backend.call.bind(a.backend);
  a.beforeEvent = async (event) => {
    if (
      event.name === "notes-sync" &&
      event.payload.phase === "release" &&
      event.payload.operationId === readyOperation
    )
      await terminalEventGate;
  };
  a.backend.call = async (command, args = {}) => {
    if (
      command === "sync_window_reply" &&
      args.reply.phase === "prepare" &&
      args.reply.ready &&
      !readyOperation
    ) {
      readyOperation = args.reply.operationId;
      await readyGate;
    }
    const result = await baseCall(command, args);
    if (command === 'sync_window_reply' && args.reply.phase === 'prepare' && args.reply.ready && args.reply.operationId === readyOperation) { assert.equal(result.value.outcome, 'abort'); readyReturned = true; }
    if (
      command === "sync_window_reply" &&
      args.reply.phase === "prepare" &&
      !args.reply.ready &&
      args.reply.operationId === readyOperation
    ) {
      cancelResponses++;
      assert.equal(
        result.value.outcome,
        "abort",
        "Real Session retained terminal abort",
      );
      if (cancelResponses === 1)
        return {
          ok: false,
          error: {
            code: "test_response_lost",
            message:
              "Explicit synthetic local IPC delivery drops first actual terminal receipt",
          },
          events: [],
        };
      cancellationHeld = true;
      await cancelGate;
    }
    return result;
  };
  try {
    await b.edit(navNote, "Remote navigation target");
    await until(
      "actual ready request held",
      async () => !!readyOperation,
      4000,
    );
    const search = a.page.getByRole("textbox", { name: "搜索备忘录" });
    await search.fill("preexisting");
    await until(
      "same-operation cancellation retry held",
      async () => cancellationHeld,
      4000,
    );
    let s = await a.inspect();
    check(
      "Actual HTML search waits for terminal abort despite a lost first receipt",
      s.selection.noteId === navNote &&
        s.selection.query === "" &&
        s.quietWindow.frozen &&
        cancelResponses === 2,
    );
    await search.fill("preexisting local");
    s = await a.inspect();
    check(
      "Latest HTML search draft remains visible while original owner stays frozen",
      (await search.inputValue()) === "preexisting local" &&
        s.selection.noteId === navNote &&
        s.selection.query === "",
    );
    unblockCancel();
    await until("search after real abort receipt", async () => {
      const s = await a.inspect();
      return s.selection.query === "preexisting local" && !s.quietWindow.frozen;
    });
    check(
      "Actual retained abort receipt releases navigation to its final draft query",
      (await a.inspect()).selection.query === "preexisting local",
    );
    check(
      "Terminal abort does not steal deliberate HTML search focus",
      await search.evaluate((node) => node === document.activeElement),
    );
  } finally {
    unblockCancel();
    unblockReady();
    unblockTerminalEvent();
    a.beforeEvent = undefined;
  }
  await until('delayed ready request returns same retained terminal abort', async () => readyReturned);
  a.backend.call = baseCall;
  await a.page.keyboard.press("Escape");
  await idle(a.page);
  await a.command("search.set", { query: "" });

  const focusNote = await a.create("Focus abort unchanged owner");
  await until("focus note on B", async () => !!(await b.note(focusNote)));
  await a.page.evaluate(() => {
    const dom = document.querySelector('.tiptap[contenteditable="true"]'),
      editor = dom.editor;
    editor.commands.setTextSelection({ from: 2, to: 6 });
    editor.view.focus();
    window.syncAbortFocus = {
      dom,
      editor,
      selection: editor.state.selection.toJSON(),
    };
  });
  let focusOperation, unblockFocusReady, unblockNextProbe;
  const focusReadyGate = new Promise((done) => {
    unblockFocusReady = done;
  });
  const nextProbeGate = new Promise((done) => {
    unblockNextProbe = done;
  });
  baseCall = a.backend.call.bind(a.backend);
  a.beforeEvent = async (event) => {
    if (
      focusOperation &&
      event.name === "notes-sync" &&
      event.payload.phase === "probe" &&
      event.payload.operationId !== focusOperation
    )
      await nextProbeGate;
  };
  a.backend.call = async (command, args = {}) => {
    if (
      command === "sync_window_reply" &&
      args.reply.phase === "prepare" &&
      args.reply.ready &&
      !focusOperation
    ) {
      focusOperation = args.reply.operationId;
      await focusReadyGate;
    }
    return baseCall(command, args);
  };
  try {
    await b.edit(focusNote, "Remote focus candidate");
    await until(
      "focused owner real prepare held",
      async () => !!focusOperation,
      4000,
    );
    await api(a.page, "note.select", { id: focusNote });
    check(
      "Real same-owner navigation abort restores same DOM, selection and editor focus",
      await a.page.evaluate(() => {
        const f = window.syncAbortFocus;
        return (
          f.dom.isConnected &&
          f.dom === document.activeElement &&
          f.dom.editor === f.editor &&
          f.editor.isEditable &&
          JSON.stringify(f.editor.state.selection.toJSON()) ===
            JSON.stringify(f.selection)
        );
      }),
    );
  } finally {
    unblockFocusReady();
    unblockNextProbe();
    a.beforeEvent = undefined;
  }
  a.backend.call = baseCall;
  await idle(a.page);

  await a.select(id);
  await a.page.locator(".tiptap:visible").focus();
  const cdp = await a.page.context().newCDPSession(a.page);
  await cdp.send("Input.imeSetComposition", {
    text: "bian",
    selectionStart: 4,
    selectionEnd: 4,
  });
  await until("PM real composing", async () =>
    (await a.inspect()).quietWindow.editors.some(
      (e) => e.id === id && e.composing && e.pendingComposition,
    ),
  );
  await b.edit(id, "B remote while composing");
  await until("durable pending during composition", async () => {
    const r = await a.backend.call("sync_command", {
      command: { type: "status" },
      expected: token(await a.inspect()),
    });
    return r.ok && r.value.status.pendingCount > 0;
  });
  check(
    "Actual CDP IME and TagComposition keep owner update in real durable inbox",
    (await a.note(id)).plainText !== "B remote while composing" &&
      (await a.inspect()).quietWindow.editors.some(
        (e) => e.id === id && e.composing,
      ),
  );
  await cdp.send("Input.insertText", { text: "最终组字" });
  await until(
    "composition naturally settles",
    async () =>
      !(await a.inspect()).quietWindow.editors.find((e) => e.id === id)
        ?.pendingComposition,
  );
  await idle(a.page);
  await cdp.detach();
  // Concurrent same-note heads may intentionally remain a conflict rather than
  // overwriting local IME input. This scenario checks retention, not last-write wins.
  let imeConflict;
  await until("both actual concurrent IME heads retained", async () => {
    imeConflict = await a.conflict(id);
    return (
      imeConflict?.variants.length >= 2 &&
      imeConflict.variants.some((v) => v.title.includes("最终组字"))
    );
  });
  check(
    "Actual IME final transaction saves without a forced composition end",
    imeConflict.variants.some((v) => v.title.includes("最终组字")),
  );
  check(
    "Both concurrent text heads survive naturally settled local composition",
    imeConflict.variants.length >= 2 &&
      imeConflict.variants.some((v) => v.title === "B remote while composing"),
  );

  // Use a clean note for picker/media; the composition conflict is left intact.
  await a.command("folder.select", { id: "default" });
  const imageNote = await a.create("DOM image target");
  await until("image owner arrives B", async () => !!(await b.note(imageNote)));
  const chooserWait = a.page.waitForEvent("filechooser");
  await api(a.page, "attachment.choose", { kind: "file" });
  const chooser = await chooserWait;
  await b.edit(imageNote, "B pending during picker");
  await until("picker owner pending", async () => {
    const r = await a.backend.call("sync_command", {
      command: { type: "status" },
      expected: token(await a.inspect()),
    });
    return r.ok && r.value.status.pendingCount > 0;
  });
  check(
    "Actual FileChooser retains captured owner while remote update waits durably",
    (await a.note(imageNote)).plainText === "DOM image target" &&
      (await a.inspect()).quietWindow.protectedNoteIds.includes(imageNote),
  );
  await b.edit(localB, "B unrelated while picker");
  await until(
    "unrelated during picker",
    async () =>
      (await a.note(localB))?.plainText === "B unrelated while picker",
  );
  await readerBoundary(a.page, { delay: 350 });
  await chooser.setFiles([
    { name: "sync-dom.png", mimeType: "image/png", buffer: tinyPNG },
  ]);
  await until("attachment storage ACK", async () =>
    (await a.workspace()).attachments.some((x) => x.noteId === imageNote),
  );
  await idle(a.page);
  await a.keepAll(imageNote, (v) => v.attachmentCount === 1);
  check(
    "Actual confirmed keep-all retains image branch and concurrent remote text copy",
    (await a.workspace()).notes.some(
      (n) => n.plainText === "B pending during picker",
    ),
  );
  const ws = await a.workspace(),
    attachment = ws.attachments.find((x) => x.noteId === imageNote);
  check(
    "Actual chooser/FileReader/journal/body ACK stores one original image reference",
    refs(ws.notes.find((n) => n.id === imageNote).document).includes(
      attachment.id,
    ),
  );
  const bytes = await a.backend.call("read_attachment", {
    id: attachment.id,
    expected: token(await a.inspect(), imageNote),
  });
  check(
    "Actual Rust attachment read preserves original image bytes",
    bytes.ok && Buffer.from(bytes.value.data, "base64").equals(tinyPNG),
  );
  await until("resolved original image arrives peer App", async () =>
    (await b.inspect()).workspace.attachments.some(
      (x) => x.id === attachment.id,
    ),
  );
  const peerImage = await b.backend.call("read_attachment", {
    id: attachment.id,
    expected: token(await b.inspect(), imageNote),
  });
  check(
    "Actual remote App and SQLite expose same original immutable image bytes after resolution",
    peerImage.ok &&
      hash(Buffer.from(peerImage.value.data, "base64")) === hash(tinyPNG),
  );
  await a.page.waitForFunction(() =>
    [...document.querySelectorAll(".attachment-node img")].some(
      (i) => i.naturalWidth > 0,
    ),
  );
  const exportPath = resolve(output, "exported-original.png");
  await a.page.evaluate(
    (path) => window.__DEBUG_PLATFORM__.configure({ dialog: { save: [path] } }),
    exportPath,
  );
  await a.command("image.preview", { id: attachment.id });
  await a.command("image.save", { id: attachment.id });
  await until("export original exists", async () => {
    try {
      return hash(await readFile(exportPath)) === hash(tinyPNG);
    } catch {
      return false;
    }
  });
  await a.command("image.close");
  check(
    "Actual image preview save uses Rust original-byte export",
    hash(await readFile(exportPath)) === hash(tinyPNG),
  );
  const recordingNote = await a.create("DOM recording owner");
  const lockNote = await b.create("DOM unrelated lock");
  const deleteNote = await b.create("DOM unrelated delete");
  await until(
    "recording setup replicated",
    async () =>
      (await b.note(recordingNote)) &&
      (await a.note(lockNote)) &&
      (await a.note(deleteNote)),
  );
  await a.select(recordingNote);
  await a.command("recording.open");
  await a.command("recording.action", { action: "toggle" });
  await a.page.evaluate(() => window.__DEBUG_PLATFORM__.advance(650));
  await a.command("recording.action", { action: "toggle" });
  let recording = await a.inspect();
  const ownerEpoch = recording.workspace.access.notes[recordingNote].epoch;
  const initialGlobal = recording.workspace.access.epoch;
  check(
    "Actual desktop checkpoint ACK retains full recording ticket owner",
    recording.recording.active &&
      recording.quietWindow.protectedNoteIds.includes(recordingNote) &&
      recording.workspace.attachments.some(
        (x) => x.noteId === recordingNote && x.kind === "audio",
      ),
  );
  await b.edit(recordingNote, "Remote update waits full recording ticket");
  await until("recording owner update durably pending", async () => {
    const r = await a.backend.call("sync_command", {
      command: { type: "status" },
      expected: token(await a.inspect()),
    });
    return r.ok && r.value.status.pendingCount > 0;
  });
  await b.edit(localB, "B text continues while A recording");
  await until(
    "unrelated text during actual recording",
    async () =>
      (await a.note(localB))?.plainText ===
      "B text continues while A recording",
  );
  await b.select(lockNote);
  await b.command("modal.open", { type: "lock" });
  await b.page
    .getByRole("textbox", { name: "密码", exact: true })
    .fill("synthetic-dom-password");
  await b.command("modal.submit");
  await until("real remote lock global epoch", async () => {
    const r = await a.inspect();
    return (
      r.workspace.notes.find((n) => n.id === lockNote)?.locked &&
      !r.workspace.access.notes[lockNote]?.authorized &&
      r.workspace.access.epoch > initialGlobal
    );
  });
  await b.select(deleteNote);
  await b.command("note.delete");
  await until(
    "real remote delete",
    async () => !!(await a.note(deleteNote))?.deletedAt,
  );
  recording = await a.inspect();
  check(
    "Actual unrelated lock/delete advance global authority without invalidating recording owner",
    recording.recording.active &&
      recording.quietWindow.protectedNoteIds.includes(recordingNote) &&
      recording.workspace.access.notes[recordingNote].epoch === ownerEpoch &&
      recording.workspace.access.epoch > initialGlobal,
  );
  await a.command("recording.action", { action: "toggle" });
  await a.page.evaluate(() => window.__DEBUG_PLATFORM__.advance(750));
  await a.command("recording.action", { action: "toggle" });
  check(
    "Actual recording rebinds trusted global epoch and checkpoints again to original owner",
    (await a.inspect()).recording.active &&
      a.backend.calls.filter((c) => c.command === "recording_local_revision")
        .length >= 2,
  );
  const originalCall = a.backend.call.bind(a.backend);
  let releaseStarted = false,
    unblockRelease;
  const releaseGate = new Promise((done) => {
    unblockRelease = done;
  });
  a.backend.call = async (command, args) => {
    if (command === "recording_local_release") {
      releaseStarted = true;
      await releaseGate;
    }
    return originalCall(command, args);
  };
  const closingRecording = api(a.page, "recording.action", { action: "close" });
  try {
    await until(
      "actual final recording release boundary",
      async () => releaseStarted,
    );
    recording = await a.inspect();
    check(
      "Full ticket remains protected after final journal/body ACK before actual release",
      recording.recording.active &&
        recording.quietWindow.protectedNoteIds.includes(recordingNote) &&
        a.backend.calls.some(
          (c) =>
            c.command === "recording_local_revision" && c.finalIntent === true,
        ),
    );
  } finally {
    unblockRelease();
  }
  await closingRecording;
  await idle(a.page);
  a.backend.call = originalCall;
  recording = await a.inspect();
  check(
    "Only actual Rust local release ACK ends original recording protection",
    !recording.recording.active &&
      !recording.quietWindow.protectedNoteIds.includes(recordingNote),
  );
  await a.keepAll(recordingNote, (v) => v.attachmentCount === 1);
  const recordedWorkspace = await a.workspace();
  const recordedReference = refs(
    recordedWorkspace.notes.find((n) => n.id === recordingNote).document,
  )[0];
  const audio = recordedWorkspace.attachments.find(
    (x) => x.id === recordedReference && x.kind === "audio",
  );
  assert(audio, "Final saved recording card references its original audio");
  const audioRead = await a.backend.call("read_attachment", {
    id: audio.id,
    expected: token(await a.inspect(), recordingNote),
  });
  assert(audioRead.ok);
  const audioBytes = Buffer.from(audioRead.value.data, "base64");
  const audioPath = resolve(output, "synthetic-recording.wav");
  await writeFile(audioPath, audioBytes);
  const decoded = await a.page.evaluate(async (data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const context = new AudioContext();
    try {
      const audio = await context.decodeAudioData(bytes.buffer);
      const samples = audio.getChannelData(0);
      return {
        duration: audio.duration,
        length: samples.length,
        tailPeak: Math.max(
          ...samples.slice(Math.floor(samples.length * 0.75)).map(Math.abs),
        ),
      };
    } finally {
      await context.close();
    }
  }, audioRead.value.data);
  check(
    "Recorded original bytes persist outside SQLite and independently decode with nonzero late samples",
    audioBytes.length > 1000 &&
      decoded.duration > 1 &&
      decoded.tailPeak > 0.01 &&
      hash(
        await readFile(resolve(a.store, "attachments", audio.relativePath)),
      ) === hash(audioBytes),
  );
  await until("resolved final audio arrives peer App", async () =>
    (await b.inspect()).workspace.attachments.some((x) => x.id === audio.id),
  );
  const peerAudio = await b.backend.call("read_attachment", {
    id: audio.id,
    expected: token(await b.inspect(), recordingNote),
  });
  check(
    "Actual remote audio bytes equal final saved original recording",
    peerAudio.ok &&
      hash(Buffer.from(peerAudio.value.data, "base64")) === hash(audioBytes),
  );
  observations.push({
    name: "recording-original-bytes",
    noteId: recordingNote,
    attachmentId: audio.id,
    bytes: audioBytes.length,
    sha256: hash(audioBytes),
    decoded,
  });
  await until("recording pending owner consumed after release", async () => {
    const r = await a.backend.call("sync_command", {
      command: { type: "status" },
      expected: token(await a.inspect()),
    });
    return r.ok && r.value.status.pendingCount === 0;
  });
  await a.select(imageNote);
  const revokedNote = await b.create("Actual selected target revoke");
  await until(
    "target revoke note arrives A",
    async () => !!(await a.note(revokedNote)),
  );
  await a.select(revokedNote);
  await a.page.locator(".tiptap:visible").focus();
  const priorToken = token(await a.inspect(), revokedNote);
  await b.select(revokedNote);
  await b.command("modal.open", { type: "lock" });
  await b.page
    .getByRole("textbox", { name: "密码", exact: true })
    .fill("synthetic-dom-revoke");
  await b.command("modal.submit");
  await until("selected remote lock revokes actual editor", async () => {
    const s = await a.inspect();
    return (
      s.workspace.notes.find((n) => n.id === revokedNote)?.locked &&
      !s.workspace.access.notes[revokedNote]?.authorized &&
      !s.quietWindow.frozen
    );
  });
  check(
    "Selected target remote lock never restores stale editable DOM after release",
    (await a.page.locator(".locked-state").count()) === 1 &&
      (await a.page
        .locator('.tiptap:visible[contenteditable="true"]')
        .count()) === 0,
  );
  const staleRead = await a.backend.call("read_note_text", {
    id: revokedNote,
    expected: priorToken,
  });
  check(
    "Actual Session rejects pre-lock token after target authority changes",
    !staleRead.ok && staleRead.error.code === "access_changed",
  );
  const session = token(await a.inspect());
  const priorOperation = a.runtime.rustEvents.history.findLast(
    (e) => e.name === "notes-sync" && e.payload.phase === "release",
  ).payload.operationId;
  const badReply = await a.backend.call("sync_window_reply", {
    reply: {
      phase: "prepare",
      operationId: priorOperation,
      ready: true,
      unknown: true,
    },
    expected: session,
  });
  check(
    "Actual Rust IPC rejects unknown reply fields on a retained terminal operation",
    !badReply.ok,
  );
  const wrongToken = await a.backend.call("sync_window_reply", {
    reply: { phase: "prepare", operationId: priorOperation, ready: true },
    expected: { ...session, sessionId: "foreign-session" },
  });
  check(
    "Actual Session rejects foreign expected Session without restoring target editor",
    !wrongToken.ok &&
      (await a.page
        .locator('.tiptap:visible[contenteditable="true"]')
        .count()) === 0,
  );
  await a.select(imageNote);
  await a.capture("after-media");
  await b.capture("after-media");

  limitations.push(
    "This runner uses synthetic browser audio and file chooser boundaries; it proves no Android provider, OS microphone, physical-device or original Apple pixel parity.",
  );
  // Persist stop across a true process+page restart; never replace the data root.
  await a.sync("sync.stop");
  await b.sync("sync.stop");
  const identityA = (await a.sync("sync.status")).status.deviceId;
  await a.edit(localA, "Persisted dirty while stopped");
  const oldPid = a.backend.pid;
  await a.close();
  const a2 = await new Device().open("A-restart", a.store);
  const restarted = await a2.sync("sync.status");
  check(
    "Same-directory new Rust process preserves paused state and device identity",
    a2.backend.pid !== oldPid &&
      restarted.status.state === "paused" &&
      restarted.status.deviceId === identityA,
  );
  await a2.select(imageNote);
  const recoveredBytes = await a2.backend.call("read_attachment", {
    id: attachment.id,
    expected: token(await a2.inspect(), imageNote),
  });
  check(
    "New App and Session restore actual body and original attachment bytes",
    refs((await a2.note(imageNote)).document).includes(attachment.id) &&
      recoveredBytes.ok &&
      hash(Buffer.from(recoveredBytes.value.data, "base64")) === hash(tinyPNG),
  );
  await b.sync("sync.resume");
  await a2.sync("sync.resume");
  await until(
    "persisted dirty resumes to peer",
    async () =>
      (await b.inspect()).workspace.notes.find((n) => n.id === localA)
        ?.plainText === "Persisted dirty while stopped",
  );
  check(
    "Paused local dirty survives restart and converges after actual resume",
    (await b.note(localA)).plainText === "Persisted dirty while stopped",
  );
  check(
    "Real delivered event chain contains probe, prepare and terminal commit",
    devices.some((d) =>
      d.runtime.rustEvents.history.some(
        (e) => e.name === "notes-sync" && e.payload.phase === "probe",
      ),
    ) &&
      devices.some((d) =>
        d.runtime.rustEvents.history.some(
          (e) => e.name === "notes-sync" && e.payload.phase === "prepare",
        ),
      ) &&
      devices.some((d) =>
        d.runtime.rustEvents.history.some(
          (e) => e.name === "notes-sync" && e.payload.outcome === "commit",
        ),
      ),
  );
} catch (error) {
  failure = { message: error.message, stack: error.stack };
  console.error(error.stack);
} finally {
  for (const device of devices) {
    try {
      await device.close();
    } catch (error) {
      failure ||= { message: error.message, stack: error.stack };
    }
  }
  let backendSourcesUnchanged = false;
  try {
    await verifyBackend();
    backendSourcesUnchanged = true;
  } catch (error) {
    failure ||= { message: error.message, stack: error.stack };
  }
  const sourceAfter = await sourceFingerprint(root);
  if (sourceBefore.sha256 !== sourceAfter.sha256)
    failure ||= { message: "Frontend source changed during run" };
  if (devices.some((d) => d.runtime.errors.length))
    failure ||= { message: "Page/event-delivery errors" };
  const databaseEvidence = [];
  for (const directory of new Set(devices.map((d) => d.store))) {
    try {
      assert(devices.every(d => d.backend.lifecycle.exit &&
        d.runtime.rustEvents.resourceClosures.some(event =>
          event.event === "browser-process-exit" && event.terminal)),
      "Every owned Rust and browser process must exit before immutable SQLite evidence");
      const sql = `import sqlite3,json,sys,hashlib,os
p=sys.argv[1]
wal=p+'-wal'
wal_size=os.path.getsize(wal) if os.path.exists(wal) else 0
assert wal_size==0, 'Nonempty WAL after all owned processes exited'
before=hashlib.sha256(open(p,'rb').read()).hexdigest()
c=sqlite3.connect('file:'+p+'?mode=ro&immutable=1',uri=True)
tables=['notes','attachments','sync_heads','sync_inbox','sync_dirty','sync_projection']
r={'integrity':c.execute('pragma integrity_check').fetchone()[0],'counts':{t:c.execute('select count(*) from '+t).fetchone()[0] for t in tables},'identity':c.execute('select workspace_id,device_id from sync_identity').fetchall(),'projection':c.execute('select kind,entity_id,digest from sync_projection order by kind,entity_id').fetchall(),'heads':[{'digest':d,'kind':k,'entityId':i,'payloadSha256':hashlib.sha256(p.encode()).hexdigest() if p else None} for d,k,i,p in c.execute('select digest,kind,entity_id,payload from sync_heads order by digest')]}
r['immutableReadOnly']=True
r['walBytes']=wal_size
r['databaseSha256']=before
r['unchanged']=hashlib.sha256(open(p,'rb').read()).hexdigest()==before
assert r['unchanged']
print(json.dumps(r))`;
      databaseEvidence.push({
        directory,
        ...JSON.parse(
          execFileSync(
            "python3",
            ["-c", sql, resolve(directory, "notes.sqlite3")],
            { encoding: "utf8" },
          ),
        ),
      });
    } catch (error) {
      failure ||= {
        message: "Read-only SQLite evidence failed: " + error.message,
      };
    }
  }
  const report = {
    sourceHead,
    sourceBefore,
    sourceAfter,
    sourceChanged: sourceBefore.sha256 !== sourceAfter.sha256,
    backend: {
      root: backendRoot,
      sourceHead: backendHead,
      gitDirty: !!backendDirty,
      buildSourceHead: build.sourceHead,
      binary: { path: binary, sha256: build.binary.sha256 },
      sources: build.sources,
      sourcesUnchanged: backendSourcesUnchanged,
    },
    checks,
    databaseEvidence,
    limitations,
    observations,
    processes: devices.map((d) => ({
      name: d.name,
      directory: d.store,
      lifecycle: d.backend.lifecycle,
      pageErrors: d.runtime.errors,
      calls: d.backend.calls,
      events: d.runtime.rustEvents.history,
      polling: d.runtime.rustEvents.polling,
      resourceClosures: d.runtime.rustEvents.resourceClosures,
      frontendTransport: d.runtime.metadata.frontendTransport,
    })),
    wallMs: Math.round(performance.now() - started),
    failure,
  };
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
}
if (failure) process.exitCode = 1;
