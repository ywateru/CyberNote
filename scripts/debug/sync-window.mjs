#!/usr/bin/env node
// Explicit local-event/IPC fixture around the production React App and Tiptap.
// This is not a Rust, socket, merge, microphone, or Android device test.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  openRuntime,
  api,
  idle,
  state,
  saveJSON,
  snapshot,
} from "./runtime.mjs";
import { sourceFingerprint } from "./source-identity.mjs";

const output = resolve(
  process.argv[2] || "docs/verification/sync86-frontend/develop",
);
const checks = [],
  replies = [],
  operations = new Map();
let runtime,
  failure,
  holdCancellation = false,
  cancelRelease,
  readyRelease,
  holdReady = false,
  dropCancellation = 0,
  holdRelease,
  holdReleaseStarted;
const before = await sourceFingerprint(process.cwd());
const started = performance.now();
const check = (name, condition) => {
  assert(condition, name);
  checks.push(name);
};
const until = async (predicate, name) => {
  const deadline = performance.now() + 10000;
  while (!(await predicate())) {
    if (performance.now() > deadline) throw Error("Timed out: " + name);
    await new Promise((done) => setTimeout(done, 12));
  }
};
try {
  await mkdir(output, { recursive: true });
  runtime = await openRuntime({ keep: false });
  const { page, backend } = runtime;
  const original = backend.call.bind(backend);
  backend.call = async (command, args) => {
    if (command === "recording_local_release" && holdRelease) {
      holdReleaseStarted?.();
      await new Promise((done) => {
        holdRelease = done;
      });
    }
    if (command !== "sync_window_reply") return original(command, args);
    const reply = args.reply;
    assert.equal(
      args.expected.sessionId,
      backend.sessionId,
      "fixture checks real bridge expected Session",
    );
    assert.equal(
      args.expected.epoch,
      backend.accessEpoch,
      "fixture checks real bridge expected epoch",
    );
    const operation = operations.get(reply.operationId);
    assert(operation, "fixture only accepts registered local operations");
    replies.push(structuredClone(reply));
    if (reply.phase === "prepare" && !reply.ready) {
      if (holdCancellation)
        await new Promise((done) => {
          cancelRelease = done;
        });
      operation.outcome = operation.outcome === "commit" ? "commit" : "abort";
      if (dropCancellation > 0) {
        dropCancellation--;
        return {
          ok: false,
          error: {
            code: "fixture_reply_lost",
            message: "Explicit fixture drops terminal cancellation receipt",
          },
        };
      }
    }
    if (reply.phase === "prepare" && reply.ready && holdReady)
      await new Promise((done) => {
        readyRelease = done;
      });
    return {
      ok: true,
      value: { operationId: reply.operationId, outcome: operation.outcome },
      events: [],
    };
  };
  const emit = (event) =>
    page.evaluate(
      (event) => window.__DEBUG_PLATFORM__.emit("notes-sync", event),
      event,
    );
  const operation = () => {
    const id = randomUUID();
    operations.set(id, { outcome: "pending" });
    return id;
  };
  const probe = async () => {
    const id = operation();
    await emit({
      phase: "probe",
      operationId: id,
      sessionId: backend.sessionId,
    });
    await until(() => replies.some((r) => r.operationId === id), "probe reply");
    return replies.find((r) => r.operationId === id);
  };
  const prepare = async (ids, wait = true) => {
    const id = operation();
    await emit({
      phase: "prepare",
      operationId: id,
      sessionId: backend.sessionId,
      noteIds: ids,
    });
    if (wait)
      await until(
        () =>
          replies.some((r) => r.operationId === id && r.phase === "prepare"),
        "prepare reply",
      );
    return id;
  };
  const release = async (id, outcome = "abort") => {
    operations.get(id).outcome = outcome;
    await emit({
      phase: "release",
      operationId: id,
      sessionId: backend.sessionId,
      outcome,
    });
    await idle(page);
  };
  const command = async (id, args = {}) => {
    const result = await api(page, id, args);
    await idle(page);
    return result.result;
  };
  const quiet = async () => (await state(page)).quietWindow;
  const editorDOM = () =>
    page.locator('[data-mobile-editor-note="note-a"] .tiptap');
  await editorDOM().focus();
  await page.evaluate(() => {
    window.sync86DOM = document.querySelector(
      '[data-mobile-editor-note="note-a"] .tiptap',
    );
  });
  const initial = await state(page);
  const p = await probe();
  check(
    "Probe reads real App protection without freeze, access transition, remount or focus change",
    !p.blocked &&
      !p.protectedNoteIds.length &&
      !(await quiet()).frozen &&
      (await page.evaluate(
        () =>
          window.sync86DOM === document.activeElement &&
          window.sync86DOM.isConnected,
      )) &&
      (await state(page)).workspace.access.operationId ===
        initial.workspace.access.operationId,
  );

  backend.configure({ delay: { save: 300 } });
  await api(page, "editor.insertText", { text: " local-before-quiet" });
  const pendingId = await prepare(["note-a"], false);
  await until(
    async () => (await quiet()).frozen,
    "freeze starts before save ACK",
  );
  check(
    "Prepare freezes the target before draining its existing save queue",
    !(await quiet()).editors.find((e) => e.id === "note-a").editable &&
      !replies.some((r) => r.operationId === pendingId && r.ready),
  );
  await until(
    () => replies.some((r) => r.operationId === pendingId && r.ready),
    "target save ACK then ready",
  );
  check(
    "Ready follows real save queue ACK and leaves no pending or failed target body",
    (await state(page)).save.pending === 0 &&
      (await state(page)).save.failed === 0 &&
      backend.workspace.notes
        .find((n) => n.id === "note-a")
        .plainText.includes("local-before-quiet"),
  );
  await release(pendingId);
  check(
    "Abort preserves the same target DOM and restores original editability",
    (await page.evaluate(
      () =>
        window.sync86DOM ===
        document.querySelector('[data-mobile-editor-note="note-a"] .tiptap'),
    )) && (await quiet()).editors.find((e) => e.id === "note-a").editable,
  );
  backend.configure({ delay: { save: 0 } });
  await command("editor.undo");
  check(
    "Prepare and abort retain the actual Tiptap Undo history",
    !backend.workspace.notes
      .find((n) => n.id === "note-a")
      .plainText.includes("local-before-quiet"),
  );

  const independent = await prepare(["note-b"]);
  await command("editor.insertText", { text: " independent-A" });
  check(
    "An unrelated active editor remains writable and saves while B is frozen",
    (await quiet()).editors.find((e) => e.id === "note-a").editable &&
      backend.workspace.notes
        .find((n) => n.id === "note-a")
        .plainText.includes("independent-A"),
  );
  await release(independent, "commit");

  // CDP drives Chromium's actual composition machinery; no synthesized end.
  await editorDOM().focus();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.imeSetComposition", {
    text: "bian",
    selectionStart: 4,
    selectionEnd: 4,
  });
  await until(
    async () =>
      (await quiet()).editors.some(
        (e) => e.id === "note-a" && e.composing && e.pendingComposition,
      ),
    "real PM composing and TagComposition.pending",
  );
  const imeProbe = await probe();
  const imePrepare = await prepare(["note-a"]);
  check(
    "Real PM composition and TagComposition protect the owner and defer prepare without forcing an end",
    imeProbe.protectedNoteIds.includes("note-a") &&
      replies.some((r) => r.operationId === imePrepare && r.ready === false) &&
      (await quiet()).editors.find((e) => e.id === "note-a").composing &&
      !(await quiet()).frozen,
  );
  await cdp.send("Input.insertText", { text: "最终" });
  await until(
    async () =>
      (await quiet()).editors.some(
        (e) => e.id === "note-a" && !e.composing && !e.pendingComposition,
      ),
    "real IME final transaction settles",
  );
  await idle(page);
  check(
    "The real final IME body saves through the ordinary App handler",
    backend.workspace.notes
      .find((n) => n.id === "note-a")
      .plainText.includes("最终") &&
      !(await probe()).protectedNoteIds.includes("note-a"),
  );

  const navigationId = await prepare(["note-a"]);
  holdCancellation = true;
  await page.locator('.note-row[data-note-id="note-b"]').click();
  await until(() => !!cancelRelease, "navigation cancellation sent");
  check(
    "Navigation waits for a linearized terminal receipt while the target remains frozen",
    (await state(page)).selection.noteId === "note-a" &&
      (await quiet()).frozen &&
      !(await quiet()).editors.find((e) => e.id === "note-a").editable,
  );
  let rejected = false;
  try {
    await api(page, "editor.insertText", { text: "must-not-write" });
  } catch {
    rejected = true;
  }
  const filtered = await page.evaluate(() => {
    const editor = window.sync86DOM.editor;
    const before = JSON.stringify(editor.getJSON());
    editor.commands.insertContent("programmatic-must-not-write");
    return JSON.stringify(editor.getJSON()) === before;
  });
  check(
    "The real native/debug guard and PM transaction filter both reject target writes during cancellation",
    rejected && filtered,
  );
  holdCancellation = false;
  cancelRelease();
  cancelRelease = undefined;
  await until(
    async () => (await state(page)).selection.noteId === "note-b",
    "navigation resumes after terminal receipt",
  );
  check(
    "The original navigation continues after the terminal cancellation receipt",
    !(await quiet()).frozen,
  );
  const newer = await prepare(["note-b"]);
  await release(navigationId);
  check(
    "An old release cannot thaw a newer operation",
    (await quiet()).frozen &&
      (await quiet()).editors.find((e) => e.id === "note-b").frozen,
  );
  await release(newer);

  await command("note.select", { id: "note-a" });
  holdReady = true;
  const late = await prepare(["note-a"]);
  await until(() => !!readyRelease, "held ready receipt");
  await page.locator('.note-row[data-note-id="note-b"]').click();
  await until(
    async () => (await state(page)).selection.noteId === "note-b",
    "cancel while ready response in flight",
  );
  holdReady = false;
  readyRelease();
  readyRelease = undefined;
  await idle(page);
  check(
    "A late pending ready receipt cannot recreate a finished freeze",
    !(await quiet()).frozen,
  );
  await release(late);
  await command("note.select", { id: "note-a" });
  const lost = await prepare(["note-a"]);
  dropCancellation = 1;
  await page.locator('.note-row[data-note-id="note-b"]').click();
  await until(
    () =>
      replies.filter((r) => r.operationId === lost && r.ready === false)
        .length >= 2,
    "idempotent terminal receipt retry",
  );
  await until(
    async () => (await state(page)).selection.noteId === "note-b",
    "lost cancellation receipt recovered",
  );
  check(
    "A lost cancellation reply is recovered using the same operation and backend terminal receipt",
    !(await quiet()).frozen &&
      replies.filter((r) => r.operationId === lost && r.ready === false)
        .length >= 2,
  );

  await command("note.select", { id: "note-a" });
  const timed = await prepare(["note-a"]);
  holdCancellation = true;
  await until(
    () => !!cancelRelease,
    "watchdog requests cancellation after missed release",
  );
  check(
    "The bounded quiet watchdog requests backend termination and keeps the target frozen while its receipt is pending",
    (await quiet()).frozen &&
      replies.some((r) => r.operationId === timed && r.ready === false),
  );
  holdCancellation = false;
  cancelRelease();
  cancelRelease = undefined;
  await until(
    async () => !(await quiet()).frozen,
    "watchdog backend terminal receipt",
  );
  const foreign = operation();
  await emit({
    phase: "prepare",
    operationId: foreign,
    sessionId: "foreign-session",
    noteIds: ["note-a"],
  });
  check(
    "An event from another Session cannot freeze or receive a reply",
    !(await quiet()).frozen && !replies.some((r) => r.operationId === foreign),
  );

  await command("note.select", { id: "note-a" });
  const chooserEvent = page.waitForEvent("filechooser");
  await command("attachment.choose", { kind: "file" });
  const chooser = await chooserEvent;
  check(
    "An open picker protects its exact captured note owner",
    (await probe()).protectedNoteIds.includes("note-a"),
  );
  await chooser.setFiles([]);
  await idle(page);
  check(
    "A cancelled picker releases protection without an attachment write",
    !(await probe()).protectedNoteIds.includes("note-a"),
  );
  backend.configure({ delay: { storeResponse: 250, save: 250 } });
  const attaching = api(page, "attachment.submit", {
    files: [
      {
        name: "sync86.txt",
        mime: "text/plain",
        text: "Explicit attachment fixture bytes",
      },
    ],
  });
  await until(
    () =>
      backend.calls.some(
        (call) => call.command === "store_attachment_operation",
      ),
    "real attachment storage admission",
  );
  check(
    "An attachment in storage/document ACK protects the original owner",
    (await probe()).protectedNoteIds.includes("note-a"),
  );
  await attaching;
  await idle(page);
  backend.configure({ delay: { storeResponse: 0, save: 0 } });
  check(
    "Attachment protection ends only after the real App completes its journal/document ACK path",
    !(await probe()).protectedNoteIds.includes("note-a") &&
      backend.workspace.attachments.some(
        (a) => a.noteId === "note-a" && a.displayName === "sync86.txt",
      ),
  );

  await command("recording.open");
  await command("recording.action", { action: "toggle" });
  await page.evaluate(() => window.__DEBUG_PLATFORM__.advance(600));
  await command("recording.action", { action: "toggle" });
  check(
    "A paused checkpoint retains recording ticket protection after document ACK",
    (await probe()).protectedNoteIds.includes("note-a") &&
      (await state(page)).recording.active,
  );
  // An unrelated trusted global epoch moves, while A's complete proof remains.
  backend.accessEpoch++;
  backend.noteEpochs["note-b"] = 1;
  backend.workspace.notes.find((n) => n.id === "note-b").locked = true;
  backend.sequence++;
  await page.evaluate(
    (payload) => window.__DEBUG_PLATFORM__.emit("notes-metadata", {changes:[],...payload}),
    { metadata: backend.state().metadata },
  );
  await idle(page);
  await command("recording.action", { action: "toggle" });
  await page.evaluate(() => window.__DEBUG_PLATFORM__.advance(700));
  await command("recording.action", { action: "toggle" });
  check(
    "Recording A checkpoints after trusted B lock/global epoch change and stays owned by A",
    (await state(page)).recording.active &&
      backend.workspace.attachments
        .filter((a) => a.kind === "audio")
        .every((a) => a.noteId === "note-a") &&
      !(await state(page)).error,
  );
  holdRelease = true;
  const released = new Promise((done) => {
    holdReleaseStarted = done;
  });
  const closing = api(page, "recording.action", { action: "close" });
  await released;
  check(
    "Recording protection remains through final document/journal ACK until release ACK",
    (await probe()).protectedNoteIds.includes("note-a") &&
      (await state(page)).recording.active,
  );
  const completeRelease = holdRelease;
  holdRelease = false;
  completeRelease();
  await closing;
  await idle(page);
  check(
    "Only final recording release removes owner protection",
    !(await probe()).protectedNoteIds.includes("note-a") &&
      !(await state(page)).recording.active,
  );

  backend.configure({ delay: { create: 250 } });
  const creating = api(page, "note.create");
  await until(
    () =>
      backend.calls.some(
        (call) =>
          call.command === "workspace_action" && call.type === "createNote",
      ),
    "real create admission",
  );
  check(
    "A real in-flight creation blocks probe before any quiet freeze",
    (await probe()).blocked && !(await quiet()).frozen,
  );
  await creating;
  await idle(page);
  backend.configure({ delay: { create: 0 } });
  await command("note.select", { id: "note-a" });

  // The fixture publishes a real access event to the real existing handler.
  backend.operationId = randomUUID();
  backend.suspended = ["note-b"];
  await page.evaluate(
    (payload) => window.__DEBUG_PLATFORM__.emit("notes-access", payload),
    {
      phase: "prepare",
      operationId: backend.operationId,
      noteIds: ["note-b"],
      access: backend.state().access,
    },
  );
  check(
    "The existing access prepare barrier blocks an independent sync probe",
    (await probe()).blocked,
  );
  backend.operationId = null;
  backend.suspended = [];
  await page.evaluate(
    (payload) => window.__DEBUG_PLATFORM__.emit("notes-access", payload),
    {
      phase: "abort",
      operationId: "fixture-access",
      noteIds: ["note-b"],
      access: backend.state().access,
    },
  );
  await api(page, "app.dismissError");
  await idle(page);

  const metadataDOM = await editorDOM().elementHandle();
  backend.workspace.notes.find((n) => n.id === "note-a").pinned = true;
  backend.workspace.notes.find((n) => n.id === "note-a").revision++;
  backend.sequence++;
  await page.evaluate(
    (payload) => window.__DEBUG_PLATFORM__.emit("notes-metadata", {changes:[],...payload}),
    { metadata: backend.state().metadata },
  );
  await idle(page);
  check(
    "Ordinary metadata/revision change with equal body retains the same DOM",
    await metadataDOM.evaluate(
      (node) =>
        node ===
        document.querySelector('[data-mobile-editor-note="note-a"] .tiptap'),
    ),
  );
  const refreshing = await prepare(["note-a"]);
  const changed = backend.workspace.notes.find((n) => n.id === "note-a");
  changed.document = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Remote body fixture after safe prepare" },
        ],
      },
    ],
  };
  changed.plainText = changed.title = "Remote body fixture after safe prepare";
  changed.revision++;
  backend.sequence++;
  operations.get(refreshing).outcome = "commit";
  backend.configure({ delay: { load: 250 } });
  await page.evaluate(
    (payload) => window.__DEBUG_PLATFORM__.emit("notes-metadata", {changes:[],...payload}),
    { metadata: backend.state().metadata },
  );
  await emit({
    phase: "release",
    operationId: refreshing,
    sessionId: backend.sessionId,
    outcome: "commit",
  });
  check(
    "Commit release retains freeze while the actual trusted metadata/body read is in flight",
    (await quiet()).frozen,
  );
  await until(
    async () => !(await quiet()).frozen,
    "committed trusted body rendered before thaw",
  );
  backend.configure({ delay: { load: 0 } });
  check(
    "Commit admits writes only after the committed projection reached the real editor host",
    (await state(page)).editorJSON.content[0].content[0].text ===
      "Remote body fixture after safe prepare" &&
      (await quiet()).editors.find((e) => e.id === "note-a").editable,
  );

  const revoked = await prepare(["note-a"]);
  operations.get(revoked).outcome = "commit";
  backend.accessEpoch++;
  backend.noteEpochs["note-a"] = 1;
  backend.workspace.notes.find((n) => n.id === "note-a").locked = true;
  backend.sequence++;
  await page.evaluate(
    (payload) => window.__DEBUG_PLATFORM__.emit("notes-metadata", {changes:[],...payload}),
    { metadata: backend.state().metadata },
  );
  await release(revoked, "commit");
  check(
    "Release never restores old editable=true after trusted note authorization was revoked",
    !(await quiet()).editors.some((e) => e.id === "note-a" && e.editable) &&
      (await page.locator(".locked-state").count()) === 1,
  );

  const cleanup = await page.evaluate(async () => {
    const { NetworkSyncCoordinator } = await import("/src/network-sync.ts");
    let sessionId = "one",
      releases = 0,
      frozen = false;
    const errors = [];
    const host = {
      snapshot: () => ({ sessionId, protectedNoteIds: [], blocked: false }),
      freeze: () => {
        frozen = true;
        return {
          flush: async () => {},
          current: () => true,
          release: () => {
            frozen = false;
            releases++;
          },
        };
      },
      reply: async (reply) =>
        reply.ready === false
          ? new Promise(() => {})
          : { operationId: reply.operationId, outcome: "pending" },
      committed: async () => {},
      error: (error) => errors.push(String(error)),
    };
    const coordinator = new NetworkSyncCoordinator(host);
    await coordinator.receive({
      phase: "prepare",
      operationId: "old",
      sessionId: "one",
      noteIds: ["A"],
    });
    const pendingCancel = coordinator.cancel();
    coordinator.dispose();
    await pendingCancel;
    coordinator.mount();
    await coordinator.receive({
      phase: "prepare",
      operationId: "new",
      sessionId: "one",
      noteIds: ["B"],
    });
    await coordinator.receive({
      phase: "release",
      operationId: "old",
      sessionId: "one",
      outcome: "abort",
    });
    const oldReleaseSafe = frozen && coordinator.frozen("B");
    const sessionCancellation = coordinator.cancel();
    sessionId = "two";
    coordinator.check();
    await sessionCancellation;
    const replaced = !frozen && !coordinator.frozen();
    host.freeze = () => ({
      flush: () => new Promise(() => {}),
      current: () => true,
      release: () => {
        releases++;
      },
    });
    const stuckFlush = coordinator.receive({
      phase: "prepare",
      operationId: "flush-hang",
      sessionId: "two",
      noteIds: ["C"],
    });
    coordinator.dispose();
    await stuckFlush;
    return { releases, oldReleaseSafe, replaced, errors };
  });
  check(
    "The production coordinator cleans up a hung cancellation on dispose/StrictMode remount, rejects old release, and ends old trusted Session leases",
    cleanup.releases === 3 &&
      cleanup.oldReleaseSafe &&
      cleanup.replaced &&
      !cleanup.errors.length,
  );

  const invalid = await page.evaluate(async () => {
    const { parseSyncWindowEvent, parseSyncWindowReceipt } =
      await import("/src/network-sync.ts");
    const cases = [
      () =>
        parseSyncWindowEvent({
          phase: "prepare",
          operationId: "x",
          sessionId: "s",
          noteIds: ["a", "a"],
        }),
      () =>
        parseSyncWindowEvent({
          phase: "probe",
          operationId: "x",
          sessionId: "s",
          arbitrary: true,
        }),
      () =>
        parseSyncWindowReceipt({ operationId: "old", outcome: "abort" }, "new"),
      () => parseSyncWindowReceipt({ operationId: "x", outcome: "ready" }, "x"),
      () =>
        parseSyncWindowReceipt({ operationId: "x", outcome: ["abort"] }, "x"),
    ];
    return cases.filter((test) => {
      try {
        test();
        return false;
      } catch {
        return true;
      }
    }).length;
  });
  check(
    "Strict event/receipt validation rejects unknown fields, duplicate targets, stale IDs and non-string/unknown outcomes",
    invalid === 5,
  );
  const targetProof = await page.evaluate(async () => {
    const { rebindAttachmentTarget } =
      await import("/src/attachment-target.ts");
    const document = { type: "doc", content: [{ type: "paragraph" }] };
    const editor = {},
      stamp = {
        generation: 1,
        sessionId: "trusted-session",
        epoch: 4,
        noteId: "A",
        noteEpoch: 2,
      };
    const target = {
      noteId: "A",
      scope: "scope",
      stamp,
      editor,
      owner: "A",
      bookmark: {},
      documentVersion: 8,
      externalVersion: 3,
      document,
      trustedDocument: document,
      invalidated: false,
    };
    const live = {
      noteId: "A",
      scope: "scope",
      stamp: { ...stamp, generation: 2, epoch: 5 },
      editor,
      owner: "A",
      documentVersion: 8,
      externalVersion: 3,
      editorDocument: document,
      trustedDocument: document,
      trustedSynchronization: true,
      available: true,
    };
    const result = rebindAttachmentTarget(target, live);
    const changes = [
      { trustedSynchronization: false },
      { available: false },
      { noteId: "B" },
      { scope: "different" },
      { editor: {} },
      { owner: "B" },
      { documentVersion: 9 },
      { externalVersion: 4 },
      { editorDocument: { type: "doc", content: [] } },
      { trustedDocument: { type: "doc", content: [] } },
      { stamp: { ...live.stamp, sessionId: "other" } },
      { stamp: { ...live.stamp, noteEpoch: 3 } },
      { stamp: { ...live.stamp, epoch: 3 } },
      { stamp: { ...live.stamp, epoch: undefined } },
    ];
    const refused = changes.filter((change) => {
      try {
        rebindAttachmentTarget(target, { ...live, ...change });
        return false;
      } catch {
        return true;
      }
    }).length;
    return {
      epoch: result.epoch,
      originalEpoch: target.stamp.epoch,
      refused,
      cases: changes.length,
    };
  });
  check(
    "Trusted global epoch rebinding preserves every Session/noteEpoch/editor/owner/document/version check and rejects epoch regression or absence",
    targetProof.epoch === 5 &&
      targetProof.originalEpoch === 4 &&
      targetProof.refused === targetProof.cases,
  );
  await saveJSON(
    resolve(output, "snapshot.json"),
    await snapshot(page, { selector: ".app", maxChars: 32000, maxNodes: 180 }),
  );
  await writeFile(
    resolve(output, "final.html"),
    await page.locator(".app").evaluate((node) => node.outerHTML),
  );
  check(
    "No React or browser page errors occurred",
    runtime.errors.length === 0,
  );
} catch (error) {
  failure = { message: error.message, stack: error.stack };
  process.exitCode = 1;
  if (runtime) {
    await saveJSON(
      resolve(output, "failure-state.json"),
      await state(runtime.page).catch((error) => ({ error: error.message })),
    );
    await writeFile(
      resolve(output, "failure.html"),
      await runtime.page.locator(".app").evaluate((node) => node.outerHTML),
    );
  }
  console.error(error);
} finally {
  cancelRelease?.();
  readyRelease?.();
  if (typeof holdRelease === "function") holdRelease();
  const after = await sourceFingerprint(process.cwd());
  const report = {
    sourceHead: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    before,
    after,
    sourceChanged: before.sha256 !== after.sha256,
    checks,
    replies,
    failure,
    naturalExit: failure ? 1 : 0,
    elapsedMs: Math.round(performance.now() - started),
    scope:
      "Production React/Tiptap/App handlers and real Chromium CDP IME; notes-sync/sync_window_reply plus local storage/device IPC are explicit JS fixture. No Rust/network/Android device or real microphone proof.",
    pageErrors: runtime?.errors,
  };
  await saveJSON(resolve(output, "report.json"), report);
  console.log(JSON.stringify(report, null, 2));
  await runtime?.cleanup();
}
