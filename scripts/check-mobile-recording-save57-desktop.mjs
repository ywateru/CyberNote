// Narrow desktop owner A/B regression using the existing production App-closure
// fixture. The mobile commit boundary itself is tested with mounted React App.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fixture, hashes } from "./check-recording-submit.mjs";
const output = resolve(
  process.argv[2] || "docs/verification/mobile-recording-save57/desktop",
);
await mkdir(output, { recursive: true });
const checks = [];
const previousReader = globalThis.FileReader;
try {
  const f = fixture({ desktop: true }),
    ticket = f.open();
  await ticket.opening;
  assert(ticket.remote);
  assert.equal(f.env.record, false);
  await f.editSource("A latest");
  await f.undoSource();
  await f.redoSource();
  f.env.noteId = "note-b";
  f.env.current = f.backend.notes[1];
  f.env.nativeScope = "scope-b";
  f.editor.isEditable = false;
  f.env.editor = { isDestroyed: false, isEditable: true };
  f.render();
  f.targetChanged();
  const bodyB = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "B working" }] },
    ],
  };
  await f.api.saveDoc("note-b", bodyB);
  const closing = ticket.remote.owner.close();
  const receive = (message, extra = {}) =>
    ticket.remote.owner.receive({
      ...ticket.remote.identity,
      from: "child",
      message,
      ...extra,
    });
  await receive({
    kind: "submit",
    transfer: {
      name: "新录音.webm",
      mime: "audio/webm",
      size: 6,
      lastModified: 1793743200000,
      recordedAt: 1793743199123,
      data: Buffer.from("audio1").toString("base64"),
    },
  });
  assert.equal(f.counts().stores, 1);
  assert.equal(f.counts().inserts, 1);
  assert.equal(f.focused, 0);
  assert.equal(f.env.noteId, "note-b");
  assert.deepEqual(f.backend.notes[1].document, bodyB);
  assert.match(JSON.stringify(f.backend.notes[0].document), /A latest/);
  assert.equal(
    f.backend.notes[0].document.content.filter((n) => n.type === "attachment")
      .length,
    1,
  );
  assert.equal(f.recordingMessages.at(-1).status, "saved");
  const original = ticket.file;
  await receive({ kind: "submit" });
  assert.equal(ticket.file, original);
  assert.equal(f.counts().stores, 1);
  assert.equal(f.counts().inserts, 1);
  await receive({ kind: "child-closed" }, { from: "host" });
  await closing;
  assert.equal(f.env.recordingTicket.current, null);
  checks.push(
    "desktop independent owner A retains mapped latest edits/Undo/Redo while B edits, saves once to A without focusing A, retains original File for retransmission and releases only after child closes",
  );
  const result = {
    status: "pass",
    checks,
    counts: f.counts(),
    hashes,
    limits: [
      "Existing AST-extracted actual App parent closures with production PM bookmarks/Submission/bridge/SaveQueue; platform/host I/O controlled.",
      "No mounted desktop UI, actual native windows, device, database or encoded playback claim. Mounted React mobile boundary is verified separately.",
    ],
  };
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
} catch (error) {
  await writeFile(
    resolve(output, "failure.json"),
    JSON.stringify(
      { error: String(error), stack: error.stack, checks },
      null,
      2,
    ) + "\n",
  );
  throw error;
} finally {
  globalThis.FileReader = previousReader;
  delete globalThis.__attachmentBridgeBoundary;
}
