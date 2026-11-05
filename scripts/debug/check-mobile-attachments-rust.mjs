#!/usr/bin/env node
// Opt-in current-source binary only; synthetic data in a fresh directory.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  openRuntime,
  api,
  idle,
  state,
  snapshot,
  saveJSON,
} from "./runtime.mjs";
import { chooseFiles, tinyPNG, refs } from "./mobile-attachments.mjs";
import { sourceFingerprint } from "./source-identity.mjs";
const [buildDir, output] = process.argv.slice(2);
if (!buildDir || !output)
  throw Error(
    "Usage: node scripts/debug/check-mobile-attachments-rust.mjs CURRENT_BUILD_DIR FRESH_OUTPUT",
  );
const root = process.cwd(),
  out = resolve(output),
  build = JSON.parse(await readFile(resolve(buildDir, "build.json"), "utf8"));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
assert(build.sourcesUnchanged);
for (const [file, digest] of Object.entries(build.sources))
  assert.equal(
    hash(await readFile(resolve(root, file))),
    digest,
    "Current source identity " + file,
  );
assert.equal(
  hash(await readFile(build.binary.path)),
  build.binary.sha256,
  "Current binary identity",
);
await mkdir(out);
const storeDirectory = resolve(out, "synthetic-store");
const start = await sourceFingerprint(root);
const sourceHead = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
let runtime;
const checks = [],
  stages = [];
const check = (label, value) => {
  assert(value, label);
  checks.push(label);
};
const expected = (workspace, noteId) => ({
  sessionId: workspace.access.sessionId,
  epoch: workspace.access.epoch,
  noteEpoch: workspace.access.notes[noteId].epoch,
});
const content = Buffer.from(
  "Synthetic actual Rust attachment 75\nNo user data.",
);
try {
  runtime = await openRuntime({
    transport: build.binary.path,
    storeDirectory,
    mobile: true,
  });
  const firstPID = runtime.backend.pid;
  await api(runtime.page, "note.create");
  await idle(runtime.page);
  await api(runtime.page, "editor.insertText", {
    text: "Synthetic attachment target 75",
  });
  await api(runtime.page, "app.flush");
  await idle(runtime.page);
  let s = await state(runtime.page);
  const noteId = s.selection.noteId;
  check(
    "Fresh real Rust workspace creates actual note through Session ordinary action",
    !!noteId,
  );
  await chooseFiles(
    runtime.page,
    [{ name: "actual-session.png", mimeType: "image/png", buffer: tinyPNG }],
    { menu: true },
  );
  await idle(runtime.page);
  await runtime.page.waitForFunction(
    () => document.querySelector(".attachment-node img")?.naturalWidth > 0,
  );
  await chooseFiles(runtime.page, [
    { name: "actual-session.txt", mimeType: "text/plain", buffer: content },
  ]);
  await idle(runtime.page);
  s = await state(runtime.page);
  const note = s.workspace.notes.find((n) => n.id === noteId),
    attachments = s.workspace.attachments.filter((a) => a.noteId === noteId);
  check(
    "Mobile actual FileList stores image and generic file through Session and body save ACK",
    attachments.length === 2 &&
      refs(note.document).length === 2 &&
      new Set(refs(note.document)).size === 2 &&
      s.save.pending === 0 &&
      s.save.failed === 0,
  );
  const operations = runtime.backend.calls
    .filter((c) => c.command === "store_attachment_operation")
    .map((c) => c.operationId);
  const persisted = [];
  for (const item of attachments) {
    const response = await runtime.backend.call("read_attachment", {
      id: item.id,
      expected: expected(s.workspace, noteId),
    });
    check(
      "Store owner→Session.sensitive→tagged read " + item.displayName,
      response.ok &&
        Buffer.from(response.value.data, "base64").equals(
          item.kind === "image" ? tinyPNG : content,
        ),
    );
    const file = resolve(storeDirectory, "attachments", item.relativePath);
    assert(file.startsWith(storeDirectory + "/"));
    const bytes = await readFile(file);
    persisted.push({
      id: item.id,
      name: item.displayName,
      relativePath: item.relativePath,
      sha256: hash(bytes),
      size: bytes.length,
    });
    check(
      "Actual filesystem bytes match synthetic File " + item.displayName,
      bytes.equals(item.kind === "image" ? tinyPNG : content),
    );
  }
  for (const operationId of operations) {
    const q = await runtime.backend.call("query_attachment_operation", {
      operationId,
      noteId,
      expected: expected(s.workspace, noteId),
    });
    check(
      "Original owned operation is authoritatively committed after body ACK",
      q.ok && q.value.status === "committed",
    );
  }
  await saveJSON(
    resolve(out, "first.snapshot.json"),
    await snapshot(runtime.page, {
      selector: ".app",
      maxChars: 24000,
      maxNodes: 120,
    }),
  );
  await runtime.page.screenshot({ path: resolve(out, "first.png") });
  stages.push({
    pid: firstPID,
    sessionId: s.workspace.access.sessionId,
    workspace: s.workspace,
    operations,
    persisted,
    calls: runtime.backend.calls,
    pageErrors: runtime.errors,
  });
  check(
    "First mobile Rust path has no page errors",
    runtime.errors.length === 0,
  );
  const firstBackend = runtime.backend;
  await runtime.cleanup();
  runtime = null;
  check(
    "Owned first child fully exits naturally before new process opens directory",
    firstBackend.lifecycle.exit?.code === 0 &&
      firstBackend.lifecycle.pending === 0,
  );
  stages[0].lifecycle = firstBackend.lifecycle;
  runtime = await openRuntime({
    transport: build.binary.path,
    storeDirectory,
    mobile: true,
  });
  const secondPID = runtime.backend.pid;
  await api(runtime.page, "note.select", { id: noteId });
  await idle(runtime.page);
  const recovered = await state(runtime.page);
  const restored = recovered.workspace.notes.find((n) => n.id === noteId);
  check(
    "New PID and new Session recover persisted body with two unique original references",
    secondPID !== firstPID &&
      recovered.workspace.access.sessionId !== s.workspace.access.sessionId &&
      JSON.stringify(restored.document) === JSON.stringify(note.document) &&
      JSON.stringify(refs(restored.document)) ===
        JSON.stringify(refs(note.document)),
  );
  for (const item of attachments) {
    const response = await runtime.backend.call("read_attachment", {
      id: item.id,
      expected: expected(recovered.workspace, noteId),
    });
    check(
      "New Session owner checked read recovers original bytes " +
        item.displayName,
      response.ok &&
        hash(Buffer.from(response.value.data, "base64")) ===
          persisted.find((p) => p.id === item.id).sha256,
    );
  }
  const old = await runtime.backend.call("query_attachment_operation", {
    operationId: operations[0],
    noteId,
    expected: expected(recovered.workspace, noteId),
  });
  check(
    "New Session cannot adopt old operation with fresh current token",
    !old.ok && old.error.code === "attachment_operation_conflict",
  );
  const tokenRejected = await runtime.backend.call("read_attachment", {
    id: attachments[0].id,
    expected: expected(s.workspace, noteId),
  });
  check(
    "Old Session token cannot read recovered attachment",
    !tokenRejected.ok && tokenRejected.error.code === "access_changed",
  );
  for (const action of [
    { type: "lockNote", id: noteId, password: "synthetic" },
    { type: "deleteNote", id: noteId },
    { type: "importArchive" },
  ]) {
    const response = await runtime.backend.call("workspace_action", {
      action,
      expected: expected(recovered.workspace, noteId),
    });
    check(
      "Unsupported barrier is explicit and never empty-ACKs " + action.type,
      !response.ok && response.error.code === "transport_unsupported",
    );
  }
  await saveJSON(
    resolve(out, "recovered.snapshot.json"),
    await snapshot(runtime.page, {
      selector: ".app",
      maxChars: 24000,
      maxNodes: 120,
    }),
  );
  await runtime.page.screenshot({ path: resolve(out, "recovered.png") });
  check(
    "Recovered mobile Rust path has no page errors",
    runtime.errors.length === 0,
  );
  const secondBackend = runtime.backend;
  stages.push({
    pid: secondPID,
    sessionId: recovered.workspace.access.sessionId,
    calls: secondBackend.calls,
    pageErrors: runtime.errors,
  });
  await runtime.cleanup();
  runtime = null;
  check(
    "Owned second child exits naturally with no pending requests",
    secondBackend.lifecycle.exit?.code === 0 &&
      secondBackend.lifecycle.pending === 0,
  );
  stages[1].lifecycle = secondBackend.lifecycle;
  const end = await sourceFingerprint(root);
  check(
    "Frontend/debug source identity remains unchanged across both owned processes",
    start.sha256 === end.sha256,
  );
  await saveJSON(resolve(out, "result.json"), {
    status: "PASS",
    sourceHead,
    sourceInputsAtStart: start,
    sourceInputs: end,
    buildIdentity: build.binary,
    checks: checks.length,
    labels: checks,
    stages,
    boundaries: {
      real: "Current Rust Session/Store, SQLite, files, register_save/save, FileReader, original picker target, actual body ACK, new PID recovery",
      fake: "Browser mobile viewport, OS window/dialog/lifecycle, synthetic File content",
      notTested:
        "Android native WebView/chooser/URI/IME, original phone issue, Apple Notes PDF preview",
    },
  });
  console.log(
    JSON.stringify({
      status: "PASS",
      checks: checks.length,
      pids: stages.map((s) => s.pid),
      out,
    }),
  );
} catch (error) {
  await saveJSON(resolve(out, "failure.json"), {
    error: error.message,
    stack: error.stack,
    checks,
    stages,
    ...(runtime
      ? {
          lifecycle: runtime.backend.lifecycle,
          state: await state(runtime.page).catch(() => null),
          pageErrors: runtime.errors,
        }
      : {}),
  });
  throw error;
} finally {
  await runtime?.cleanup();
}
