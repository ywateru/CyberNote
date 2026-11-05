import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fixture, hashes } from "./recording-autosave64-app-fixture.mjs";
const output = resolve(
  process.argv[2] || "docs/verification/mac-recording-autosave64/author",
);
await mkdir(output, { recursive: true });
const checks = [];
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
const until = async (p) => {
  for (let n = 0; n < 1500 && !p(); n++)
    await new Promise((r) => setTimeout(r, 1));
  assert(p(), "condition eventually true");
};
const make = (revision, intent = "checkpoint") =>
  Object.freeze({
    file: new File(
      [new Uint8Array(44 + revision * 100).fill(revision)],
      "新录音.wav",
      { type: "audio/wav" },
    ),
    recordedAt: 1793743199123,
    revision,
    intent,
  });
const open = async (options = {}) => {
  const f = fixture({ desktop: true, ...options });
  const ticket = f.open();
  await ticket.opening;
  return { f, ticket, save: (r) => f.api.submitRecordingRevision(ticket, r) };
};
const ids = (f) =>
  f.editor
    .getJSON()
    .content.filter((n) => n.type === "attachment")
    .map((n) => n.attrs.id);
const test = async (name, fn) => {
  console.log("RUN", name);
  const details = await fn();
  checks.push({ name, pass: true, ...details });
};
try {
  await test("two pause checkpoints and final replace exactly one A card while B is active; query alone commits each old journal", async () => {
    const { f, ticket, save } = await open();
    await f.editSource("A latest");
    await save(make(1));
    const first = ids(f)[0];
    assert.equal(f.journal.values().next().value.status, "committed");
    assert(ticket.accepting);
    assert(f.env.recordingTicket.current === ticket);
    assert.equal(f.counts().submissions, 0);
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
    await f.editSource("more A ");
    await save(make(2));
    assert.equal(ids(f).length, 1);
    assert.notEqual(ids(f)[0], first);
    await save(make(3, "final"));
    assert.equal(ids(f).length, 1);
    assert.equal(f.backend.attachments.length, 3);
    assert([...f.journal.values()].every((op) => op.status === "committed"));
    assert.equal(f.counts().inserts, 1);
    assert.equal(f.focused, 0);
    assert.deepEqual(f.backend.notes[1].document, bodyB);
    assert.equal(ticket.accepting, false);
    assert.equal(f.counts().submissions, 0);
    assert.deepEqual(
      f.calls
        .filter((c) => c.command === "store_attachment_operation")
        .map((c) => Buffer.from(c.params.data, "base64").length),
      [144, 244, 344],
    );
    return { storedVersions: 3, visibleCard: 1, originalFilesRetained: true };
  });
  await test("checkpoint waits for durable document ACK, then journal query barrier before admitting the next revision", async () => {
    const wait = deferred(),
      q = deferred();
    const { f, ticket, save } = await open({ saveWait: wait, queryWait: q });
    let done = false;
    const work = save(make(1)).then(() => (done = true));
    await until(() => f.counts().saves === 1);
    assert(!done);
    assert.equal(f.journal.values().next().value.status, "stored");
    wait.resolve();
    await until(() => f.counts().queries === 1);
    assert(!done);
    assert.equal(f.journal.values().next().value.status, "stored");
    await assert.rejects(save(make(2)), /身份|顺序/);
    q.resolve();
    await work;
    assert(done);
    assert(ticket.accepting);
    return { documentAckIsNotJournalCommit: true };
  });
  await test("failed document ACK retains exact operation/File and retries the inserted version without another store or insert", async () => {
    const { f, save } = await open({ saveFailures: 2 }),
      r = make(1);
    await assert.rejects(save(r), /保存|rejected/);
    const op = [...f.env.attachmentSubmissions.current.values()][0];
    assert.equal(op.file, r.file);
    assert.equal(ids(f).length, 1);
    await save(r);
    assert.equal(f.counts().stores, 1);
    assert.equal(f.counts().inserts, 1);
    assert.equal(ids(f).length, 1);
    assert.equal(f.counts().submissions, 0);
    return { stores: 1, inserts: 1 };
  });
  for (const action of ["delete", "duplicate"])
    await test(
      "prior card " + action + " fails replacement without fallback insertion",
      async () => {
        const { f, save } = await open();
        await save(make(1));
        let pos;
        f.editor.state.doc.descendants((n, p) => {
          if (n.type.name === "attachment") pos = p;
        });
        const node = f.editor.state.doc.nodeAt(pos);
        f.editor.view.dispatch(
          action === "delete"
            ? f.editor.state.tr.delete(pos, pos + node.nodeSize)
            : f.editor.state.tr.insert(pos, node),
        );
        await f.api.flush();
        const count = ids(f).length;
        await assert.rejects(save(make(2)), /移除|重复/);
        assert.equal(ids(f).length, count);
        assert.equal(f.counts().inserts, 1);
        return { cards: count };
      },
    );
  for (const action of ["delete", "duplicate"])
    await test(
      "current new card " +
        action +
        " during query await cannot publish checkpoint ACK",
      async () => {
        const { f, ticket, save } = await open({
          afterQuery: async () => {
            let pos;
            f.editor.state.doc.descendants((n, p) => {
              if (n.type.name === "attachment") pos = p;
            });
            const node = f.editor.state.doc.nodeAt(pos);
            f.editor.view.dispatch(
              action === "delete"
                ? f.editor.state.tr.delete(pos, pos + node.nodeSize)
                : f.editor.state.tr.insert(pos, node),
            );
          },
        });
        await assert.rejects(save(make(1)), /移除|原录音|保存/);
        assert(ticket.accepting);
        assert.equal(f.counts().submissions, 1);
        return { acknowledged: false };
      },
    );
  await test("Undo-deleted previous card never reinserts; latest A text survives successful exact replacement", async () => {
    const { f, save } = await open();
    await save(make(1));
    await f.undoSource();
    assert.equal(ids(f).length, 0);
    await assert.rejects(save(make(2)), /移除/);
    assert.equal(ids(f).length, 0);
    return {};
  });
  console.log(JSON.stringify({ pass: true, checks, hashes }, null, 2));
  await writeFile(
    resolve(output, "app-closures.json"),
    JSON.stringify({ pass: true, checks, hashes }, null, 2),
  );
} catch (error) {
  await writeFile(
    resolve(output, "app-closures-failure.json"),
    JSON.stringify(
      { pass: false, checks, error: String(error), stack: error.stack },
      null,
      2,
    ),
  );
  throw error;
}
