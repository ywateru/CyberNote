// Production React/ProseMirror/save queues, synthetic notes-agent/native replies.
// No native host, real user Store, WebView, microphone, device or socket claim.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { openRuntime, api, idle, state } from "./runtime.mjs";
import { sourceFingerprint } from "./source-identity.mjs";
const before = await sourceFingerprint(process.cwd());
const out = resolve(process.argv[2] || "artifacts/evolve111-window");
await mkdir(out, { recursive: true });
const checks = [],
  replies = [],
  syncReplies = [],
  operations = new Map();
const check = (name, value) => {
  assert.ok(value, name);
  checks.push(name);
};
const until = async (fn, name) => {
  const end = performance.now() + 7000;
  while (!(await fn())) {
    if (performance.now() > end) throw Error("Timed out: " + name);
    await new Promise((r) => setTimeout(r, 12));
  }
};
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
let runtime, failure, heldCancel, heldReady, heldRecording;
try {
  runtime = await openRuntime();
  const { page: p, backend: b } = runtime,
    original = b.call.bind(b);
  b.call = async (command, args) => {
    if (command === "recording_local_release" && heldRecording) {
      heldRecording.started = true;
      await heldRecording.promise;
    }
    if (command === "sync_window_reply") {
      syncReplies.push(structuredClone(args.reply));
      return {
        ok: true,
        value: {
          operationId: args.reply.operationId,
          outcome: args.reply.ready === false ? "abort" : "pending",
        },
        events: [],
      };
    }
    if (command !== "agent_window_reply") return original(command, args);
    const r = args.reply,
      op = operations.get(r.operationId);
    assert.ok(op);
    assert.deepEqual(Object.keys(args).sort(), ["expected", "reply"]);
    assert.equal(args.expected.sessionId, b.sessionId);
    assert.equal(args.expected.epoch, b.accessEpoch);
    replies.push(structuredClone(r));
    if (r.phase === "prepare" && r.ready && heldReady) {
      heldReady.started = true;
      await heldReady.promise;
    }
    if (r.phase === "prepare" && !r.ready) {
      if (heldCancel) {
        heldCancel.started = true;
        await heldCancel.promise;
      }
      if (op.outcome !== "commit") op.outcome = "abort";
    }
    return {
      ok: true,
      value: { operationId: r.operationId, outcome: op.outcome },
      events: [],
    };
  };
  const emit = (e) =>
    p.evaluate((e) => window.__DEBUG_PLATFORM__.emit("notes-agent", e), e);
  const start = (ids = ["note-a"]) => {
    const id = randomUUID();
    operations.set(id, { ids, outcome: "pending" });
    return id;
  };
  const event = (phase, id, extra = {}) => ({
    phase,
    operationId: id,
    sessionId: b.sessionId,
    noteIds: operations.get(id).ids,
    ...extra,
  });
  const probe = async (ids = ["note-a"]) => {
    const id = start(ids);
    await emit(event("probe", id));
    await until(() => replies.some((r) => r.operationId === id), "probe");
    return replies.find((r) => r.operationId === id);
  };
  const prepare = async (ids = ["note-a"]) => {
    const id = start(ids);
    await emit(event("prepare", id));
    await until(
      () => replies.some((r) => r.operationId === id && r.phase === "prepare"),
      "prepare",
    );
    return id;
  };
  const release = async (id, outcome = "abort") => {
    operations.get(id).outcome = outcome;
    await emit(event("release", id, { outcome }));
  };
  const agent = async () => (await state(p)).agentWindow;
  const command = async (id, args = {}) => {
    const result = await api(p, id, args);
    await idle(p);
    return result;
  };
  const browse = async () => {
    await command("editor.done");
    await p
      .locator(".search input")
      .first()
      .count()
      .then(async (count) => {
        if (count) await p.locator(".search input").first().focus();
        else await p.locator("body").click({ position: { x: 2, y: 2 } });
      });
    await idle(p);
  };
  const dom = () => p.locator('[data-mobile-editor-note="note-a"] .tiptap');
  await dom().focus();
  check(
    "active real editor is protected without changing DOM or editability",
    (await probe()).protectedNoteIds.includes("note-a"),
  );
  const busy = await prepare();
  check(
    "prepare refuses active editing",
    replies.some((r) => r.operationId === busy && r.ready === false) &&
      !(await agent().then((v) => v.frozen)),
  );
  // Chromium IME drives actual ProseMirror and TagComposition, not mocked flags.
  const cdp = await p.context().newCDPSession(p);
  await cdp.send("Input.imeSetComposition", {
    text: "bian",
    selectionStart: 4,
    selectionEnd: 4,
  });
  await until(
    async () =>
      (await state(p)).quietWindow.editors.some(
        (e) => e.composing && e.pendingComposition,
      ),
    "PM + Tag composition",
  );
  check(
    "real PM and Tag composition remain protected",
    (await probe()).protectedNoteIds.includes("note-a"),
  );
  await cdp.send("Input.insertText", { text: "最终" });
  await idle(p);
  check(
    "final IME saves through ordinary App queues",
    b.workspace.notes[0].plainText.includes("最终"),
  );
  b.configure({ delay: { save: 300 } });
  await api(p, "editor.insertText", { text: " unsaved" });
  check(
    "inflight save and pending document reported separately from editing",
    (await probe()).unsavedNoteIds.includes("note-a"),
  );
  await command("app.flush");
  b.configure({ delay: { save: 0 } });
  await browse();
  check(
    "confirmed queue history is not falsely classified unsaved",
    !(await probe()).unsavedNoteIds.includes("note-a"),
  );
  // Target now browsing: freeze preserves original instances and undo/selection.
  await p.evaluate(
    () =>
      (window.agentDOM = document.querySelector(
        '[data-mobile-editor-note="note-a"] .tiptap',
      )),
  );
  const selection = (await state(p)).editorSelection;
  const abort = await prepare();
  check(
    "safe prepare freezes actual Editor",
    (await agent()).frozen &&
      !(await state(p)).quietWindow.editors.find((e) => e.id === "note-a")
        .editable,
  );
  const beforeLoads = b.calls.filter(
    (c) => c.command === "load_workspace",
  ).length;
  await release(abort);
  await until(async () => !(await agent()).frozen, "abort thaw");
  check(
    "abort retains DOM and selection without fake metadata read",
    (await p.evaluate(
      () =>
        window.agentDOM ===
        document.querySelector('[data-mobile-editor-note="note-a"] .tiptap'),
    )) &&
      JSON.stringify((await state(p)).editorSelection) ===
        JSON.stringify(selection) &&
      b.calls.filter((c) => c.command === "load_workspace").length ===
        beforeLoads,
  );
  await command("editor.undo");
  check(
    "original undo history survives abort",
    !b.workspace.notes
      .find((n) => n.id === "note-a")
      .plainText.includes("unsaved"),
  );
  await browse();
  const unrelated = await prepare(["note-b"]);
  await command("editor.insertText", { text: " unrelated-local" });
  check(
    "unrelated active editor keeps its real save path while B is frozen",
    b.workspace.notes
      .find((n) => n.id === "note-a")
      .plainText.includes("unrelated-local") && (await agent()).frozen,
  );
  await release(unrelated);
  await until(async () => !(await agent()).frozen, "unrelated terminal");
  await browse();
  // PM transaction filter, retained freeze on cancellation, navigation waits.
  const frozen = await prepare();
  heldCancel = deferred();
  const body = JSON.stringify((await state(p)).editorJSON),
    saveCalls = b.calls.filter((c) => c.type === "saveNote").length;
  await assert.rejects(
    api(p, "editor.insertText", { text: " must not enter" }),
  );
  await p.evaluate(() =>
    window.agentDOM.editor.commands.insertContent(
      "programmatic must not enter",
    ),
  );
  await until(() => heldCancel.started, "cancel request");
  check(
    "frozen PM transaction never changes document or registers save",
    JSON.stringify((await state(p)).editorJSON) === body &&
      b.calls.filter((c) => c.type === "saveNote").length === saveCalls &&
      (await agent()).frozen,
  );
  const navigating = api(p, "note.select", { id: "note-b" });
  await new Promise((r) => setTimeout(r, 70));
  check(
    "navigation awaits real terminal and keeps frozen owner",
    (await state(p)).selection.noteId === "note-a" && (await agent()).frozen,
  );
  heldCancel.resolve();
  heldCancel = undefined;
  await navigating;
  await idle(p);
  check(
    "terminal receipt admits navigation",
    (await state(p)).selection.noteId === "note-b" && !(await agent()).frozen,
  );
  await command("note.select", { id: "note-a" });
  await browse();
  // A release may precede the IPC ready ACK. Its late ACK cannot touch a successor.
  heldReady = deferred();
  const late = await prepare();
  await release(late);
  await until(async () => !(await agent()).frozen, "release before ready ACK");
  const readyHold = heldReady;
  heldReady = undefined;
  const newer = await prepare();
  readyHold.resolve();
  await idle(p);
  await release(late);
  check(
    "late ready ACK and old release cannot thaw successor",
    (await agent()).frozen,
  );
  await release(newer);
  await until(async () => !(await agent()).frozen, "newer abort");
  // Commit follows actual metadata hydration and a real parent/Editor layout ACK.
  const committed = await prepare(),
    note = b.workspace.notes.find((n) => n.id === "note-a");
  note.document = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "External committed fixture" }],
      },
    ],
  };
  note.plainText = note.title = "External committed fixture";
  note.revision++;
  b.sequence++;
  b.configure({ delay: { load: 250 } });
  await p.evaluate(
    (payload) =>
      window.__DEBUG_PLATFORM__.emit("notes-metadata", {
        metadata: payload,
        changes: [],
      }),
    b.state().metadata,
  );
  await release(committed, "commit");
  check(
    "commit stays frozen while trusted read is pending",
    (await agent()).frozen &&
      !replies.some((r) => r.operationId === committed && r.refreshed === true),
  );
  await until(
    () =>
      replies.some((r) => r.operationId === committed && r.refreshed === true),
    "committed refresh ACK",
  );
  check(
    "positive refresh ACK follows actual editor projection",
    (await state(p)).editorJSON.content[0].content[0].text ===
      "External committed fixture" && !(await agent()).frozen,
  );
  b.configure({ delay: { load: 0 } });
  // Read failure produces a negative ACK and retains the actual target gate.
  const failed = await prepare();
  b.configure({ fail: { load: 1 } });
  await release(failed, "commit");
  await until(
    () =>
      replies.some((r) => r.operationId === failed && r.refreshed === false),
    "negative refresh ACK",
  );
  check(
    "failed trusted refresh retains write freeze",
    (await agent()).frozen &&
      !(await state(p)).quietWindow.editors.find((e) => e.id === "note-a")
        .editable,
  );
  await release(failed, "commit");
  await until(
    () => replies.some((r) => r.operationId === failed && r.refreshed === true),
    "trusted retry ACK",
  );
  await command("app.dismissError");
  await browse();
  // Both coordinators share one freeze owner and cannot overwrite each other.
  const external = await prepare(),
    syncId = randomUUID();
  const emitSync = (e) =>
    p.evaluate((e) => window.__DEBUG_PLATFORM__.emit("notes-sync", e), e);
  await emitSync({
    phase: "prepare",
    operationId: syncId,
    sessionId: b.sessionId,
    noteIds: ["note-a"],
  });
  await until(
    () => syncReplies.some((r) => r.operationId === syncId),
    "sync rejection",
  );
  check(
    "agent lease excludes a competing sync freeze",
    syncReplies.some((r) => r.operationId === syncId && r.ready === false) &&
      (await agent()).frozen,
  );
  await release(external);
  await until(async () => !(await agent()).frozen, "external terminal");
  const syncActive = randomUUID();
  await emitSync({
    phase: "prepare",
    operationId: syncActive,
    sessionId: b.sessionId,
    noteIds: ["note-a"],
  });
  await until(
    () =>
      syncReplies.some((r) => r.operationId === syncActive && r.ready === true),
    "sync ready",
  );
  check(
    "sync lease blocks agent probe including empty targets",
    (await probe([])).blocked,
  );
  const competing = await prepare();
  check(
    "sync lease rejects competing agent prepare",
    replies.some((r) => r.operationId === competing && r.ready === false) &&
      !(await agent()).frozen,
  );
  await emitSync({
    phase: "release",
    operationId: syncActive,
    sessionId: b.sessionId,
    outcome: "abort",
  });
  await idle(p);
  // Existing attachment owner and journal/document ACK path, no fake save intents.
  const chooserEvent = p.waitForEvent("filechooser");
  await command("attachment.choose", { kind: "file" });
  const chooser = await chooserEvent;
  check(
    "picker protects captured owner",
    (await probe()).protectedNoteIds.includes("note-a"),
  );
  await chooser.setFiles([]);
  await idle(p);
  b.configure({ delay: { storeResponse: 200, save: 200 } });
  const attaching = api(p, "attachment.submit", {
    files: [
      {
        name: "agent111.txt",
        mime: "text/plain",
        text: "synthetic attachment fixture",
      },
    ],
  });
  await until(
    () => b.calls.some((c) => c.command === "store_attachment_operation"),
    "attachment storage",
  );
  check(
    "attachment protects owner through storage and document ACK",
    (await probe()).protectedNoteIds.includes("note-a"),
  );
  await attaching;
  await idle(p);
  b.configure({ delay: { storeResponse: 0, save: 0 } });
  await browse();
  check(
    "attachment owner released after actual App ACK path",
    !(await probe()).protectedNoteIds.includes("note-a"),
  );
  await command("recording.open");
  await command("recording.action", { action: "toggle" });
  await p.evaluate(() => window.__DEBUG_PLATFORM__.advance(700));
  await command("recording.action", { action: "toggle" });
  check(
    "paused recording ticket remains protected",
    (await probe()).protectedNoteIds.includes("note-a") &&
      (await state(p)).recording.active,
  );
  heldRecording = deferred();
  const closing = api(p, "recording.action", { action: "close" });
  await until(() => heldRecording.started, "recording release");
  check(
    "recording owner lasts through final release ACK",
    (await probe()).protectedNoteIds.includes("note-a"),
  );
  heldRecording.resolve();
  heldRecording = undefined;
  await closing;
  await idle(p);
  await browse();
  check(
    "recording protection ends after real release ACK",
    !(await probe()).protectedNoteIds.includes("note-a"),
  );
  await command("ocr.open");
  check(
    "OCR session protects the original owner",
    (await probe()).protectedNoteIds.includes("note-a"),
  );
  await command("ocr.cancel");
  await browse();
  // The real existing access handler remains the only authorization owner.
  const accessId = randomUUID();
  b.operationId = accessId;
  b.suspended = ["note-b"];
  await p.evaluate(
    (payload) => window.__DEBUG_PLATFORM__.emit("notes-access", payload),
    {
      phase: "prepare",
      operationId: accessId,
      noteIds: ["note-b"],
      access: b.state().access,
    },
  );
  check(
    "actual access barrier blocks empty-target external create",
    (await probe([])).blocked,
  );
  b.operationId = null;
  b.suspended = [];
  await p.evaluate(
    (payload) => window.__DEBUG_PLATFORM__.emit("notes-access", payload),
    {
      phase: "abort",
      operationId: accessId,
      noteIds: ["note-b"],
      access: b.state().access,
    },
  );
  await api(p, "app.dismissError");
  await idle(p);
  await browse();
  // Create targets are empty but still observe the global owner/barrier.
  b.configure({ delay: { create: 250 } });
  const creating = api(p, "note.create");
  await until(
    () => b.calls.some((c) => c.type === "createNote"),
    "create admission",
  );
  check(
    "inflight local create globally blocks empty target probe",
    (await probe([])).blocked,
  );
  const create = await prepare([]);
  check(
    "empty target prepare respects create owner",
    replies.some((r) => r.operationId === create && r.ready === false),
  );
  await creating;
  await idle(p);
  b.configure({ delay: { create: 0 } });
  await command("note.select", { id: "note-a" });
  await browse();
  const empty = await prepare([]);
  check(
    "safe empty-target create still acquires a global lease",
    (await agent()).frozen &&
      replies.some((r) => r.operationId === empty && r.ready === true),
  );
  await release(empty);
  await until(async () => !(await agent()).frozen, "create abort");
  // Deliver a native probe in the same JS task as real navigation, before
  // React can publish its next owner/DOM. Empty create still sees the barrier.
  const duringNavigation = start([]);
  await p.evaluate(
    async (payload) => {
      const moving = window.__NOTES_DEBUG__.execute("note.select", {
        id: "note-b",
      });
      await window.__DEBUG_PLATFORM__.emit("notes-agent", payload);
      await moving;
    },
    event("probe", duringNavigation),
  );
  await until(
    () => replies.some((r) => r.operationId === duringNavigation),
    "pre-layout navigation probe",
  );
  check(
    "navigation remains globally blocked until the real layout commit",
    replies.find((r) => r.operationId === duringNavigation).blocked,
  );
  await idle(p);
  await command("note.select", { id: "note-a" });
  await browse();
  // A native window/owner replacement invalidates the captured lease.
  heldCancel = deferred();
  const changed = await prepare();
  await p.setViewportSize({ width: 390, height: 800 });
  await until(() => heldCancel.started, "window layout cancellation");
  check(
    "window/layout change cancels without early thaw",
    (await agent()).frozen,
  );
  heldCancel.resolve();
  heldCancel = undefined;
  await until(async () => !(await agent()).frozen, "window change terminal");
  // Invalid event and foreign Session do not enter either coordinator.
  const invalid = start();
  await emit({ ...event("prepare", invalid), extra: true });
  await emit({ ...event("prepare", invalid), sessionId: "foreign" });
  await idle(p);
  check(
    "invalid and foreign events never reply or freeze",
    !replies.some((r) => r.operationId === invalid) && !(await agent()).frozen,
  );
  // Save failure persists independently of current focus/queue settlement.
  await p.setViewportSize({ width: 1280, height: 800 });
  await idle(p);
  await command("note.select", { id: "note-a" });
  b.configure({ fail: { save: 1 } });
  // Debug execution can return before or after the asynchronous save ACK.
  await api(p, "editor.insertText", { text: " retained-failure" }).catch(
    (error) => {
      assert.match(error.message, /Controlled save failure/);
    },
  );
  await until(async () => {
    const value = await state(p).catch((error) => {
      assert.match(error.message, /Controlled save failure/);
      return null;
    });
    return value?.save.failed > 0;
  }, "save failure");
  check(
    "failed save is unsaved and prevents target prepare",
    (await probe()).unsavedNoteIds.includes("note-a"),
  );
  const failedSave = await prepare();
  check(
    "failed saved body cannot be externally overwritten",
    replies.some((r) => r.operationId === failedSave && r.ready === false),
  );
  check(
    "runtime has no React or browser exceptions",
    runtime.errors.length === 0,
  );
  const after = await sourceFingerprint(process.cwd());
  check("tested source stayed unchanged", before.sha256 === after.sha256);
  await writeFile(
    resolve(out, "observations.json"),
    JSON.stringify(
      {
        checks,
        replies,
        before,
        after,
        sourceChanged: before.sha256 !== after.sha256,
        boundary:
          "real React/PM/save queues; synthetic native/event/device transport",
      },
      null,
      2,
    ),
  );
  console.log(`agent-window browser: ${checks.length} checks passed`);
} catch (error) {
  failure = error;
  if (runtime) {
    await writeFile(
      resolve(out, "failure-state.json"),
      JSON.stringify(await state(runtime.page).catch(() => null), null, 2),
    );
  }
  console.error(error);
} finally {
  heldCancel?.resolve();
  heldReady?.resolve();
  heldRecording?.resolve();
  await runtime?.cleanup();
}
if (failure) process.exitCode = 1;
