import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { Schema } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";

// Execute production modules. Platform I/O is controlled here; queue outcomes,
// operation stages, authority gates and document comparisons are never copied.
const hashes = {};
const modules = new Map();
async function production(name) {
  if (modules.has(name)) return modules.get(name).exports;
  const source = await readFile(`src/${name}.ts`, "utf8");
  hashes[name] = createHash("sha256").update(source).digest("hex");
  let output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  for (const dependency of ["recording-metadata", "audio-playback"]) {
    if (!output.includes(`"./${dependency}"`)) continue;
    await production(dependency);
    output = output.replaceAll(
      `"./${dependency}"`,
      JSON.stringify(modules.get(dependency).url),
    );
  }
  if (name === "bridge" || name === "proof-access") {
    for (const dependency of [
      "access-client",
      "secure-id",
      "proof-access",
      "types",
    ]) {
      if (!output.includes(`"./${dependency}"`)) continue;
      await production(dependency);
      output = output.replaceAll(
        `"./${dependency}"`,
        JSON.stringify(modules.get(dependency).url),
      );
    }
    output = output.replaceAll(
      "import.meta.env.VITE_ACCESS_BOUNDARY_PROOF",
      '"0"',
    );
    const core = `export const isTauri = () => true; export const invoke = (...args) => globalThis.__attachmentBridgeBoundary.invoke(...args);`;
    const event = `export const listen = async () => () => {};`;
    for (const [specifier, code] of [
      ["@tauri-apps/api/core", core],
      ["@tauri-apps/api/event", event],
    ])
      output = output.replaceAll(
        JSON.stringify(specifier),
        JSON.stringify(
          `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`,
        ),
      );
  }
  if (name === "attachment-target") {
    await production("document-equality");
    output = output.replace(
      '"./document-equality"',
      JSON.stringify(modules.get("document-equality").url),
    );
  }
  const url = `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`;
  const exports = await import(url);
  modules.set(name, { url, exports });
  return exports;
}
const { AttachmentSubmission, documentReferencesAttachment } = await production(
  "attachment-submission",
);
const { enqueueSave } = await production("save-queue");
const { TrustedSynchronization } = await production("trusted-synchronization");
const { rebindAttachmentTarget } = await production("attachment-target");
const { AccessGate } = await production("access-client");
const results = [];
const test = async (name, run) => {
  await run();
  results.push(name);
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const turn = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
const attachment = {
  id: "attachment-a",
  noteId: "note-a",
  kind: "file",
  displayName: "a.pdf",
};
const body = (a = attachment) => ({
  type: "doc",
  content: [
    { type: "paragraph" },
    { type: "attachment", attrs: { id: a.id, kind: a.kind } },
  ],
});
const stored = {
  operationId: "op-a",
  noteId: "note-a",
  status: "stored",
  attachment,
};
function fixture() {
  const op = new AttachmentSubmission("op-a", "note-a", {}, { type: "" });
  const counts = {
    validate: 0,
    store: 0,
    query: 0,
    insert: 0,
    save: 0,
    refresh: 0,
  };
  let local = { type: "doc", content: [{ type: "paragraph" }] };
  let queue,
    rejectSave = false,
    rejectRefresh = false;
  const errors = [];
  const ports = {
    validate: async () => {
      counts.validate++;
    },
    storage: {
      kind: "journal",
      store: async () => {
        counts.store++;
        return stored;
      },
      query: async () => {
        counts.query++;
        return stored;
      },
    },
    insert: (a) => {
      counts.insert++;
      local = body(a);
    },
    references: (a) => documentReferencesAttachment(local, a),
    awaitDocumentAck: async () => {
      queue = enqueueSave(
        queue,
        async () => {
          counts.save++;
          if (rejectSave) throw Error("actual save failed");
          op.acknowledge("note-a", local);
        },
        (error) => errors.push(error),
        () => {},
      );
      const result = await queue;
      if (!result.saved) throw result.error;
    },
    refresh: async () => {
      counts.refresh++;
      if (rejectRefresh) throw Error("refresh failed");
    },
  };
  return {
    op,
    ports,
    counts,
    errors,
    get local() {
      return local;
    },
    set rejectSave(v) {
      rejectSave = v;
    },
    set rejectRefresh(v) {
      rejectRefresh = v;
    },
  };
}
await test("actual submission refuses changed/unknown/invalid response date before insertion", async () => {
  for (const date of [
    undefined,
    null,
    1793743199124,
    "bad",
    1.5,
    -1,
    253402300800000,
  ]) {
    const f = fixture(),
      op = new AttachmentSubmission(
        "op-a",
        "note-a",
        {},
        { type: "audio/webm" },
        1793743199123,
      );
    const reply = {
      ...stored,
      attachment: { ...attachment, kind: "audio", recordedAt: date },
    };
    f.ports.storage.store = async () => reply;
    f.ports.storage.query = async () => reply;
    await assert.rejects(op.run(f.ports));
    assert.equal(f.counts.insert, 0);
    assert.equal(op.attachment, undefined);
  }
  const f = fixture();
  f.ports.storage.store = async () => ({
    ...stored,
    attachment: { ...attachment, kind: "audio", recordedAt: 1793743199123 },
  });
  f.ports.storage.query = f.ports.storage.store;
  await assert.rejects(f.op.run(f.ports));
  assert.equal(f.counts.insert, 0);
});
await test("normal journal -> real queue ACK -> refresh", async () => {
  const f = fixture();
  await f.op.run(f.ports);
  assert.deepEqual(
    [f.op.storageAttempted, f.op.inserted, f.op.documentAck, f.op.refreshed],
    [true, true, true, true],
  );
  assert.deepEqual(f.counts, {
    validate: 2,
    store: 1,
    query: 0,
    insert: 1,
    save: 1,
    refresh: 1,
  });
});
await test("resolved failed queue is not a save ACK; same node retries", async () => {
  const f = fixture();
  f.rejectSave = true;
  await assert.rejects(f.op.run(f.ports), /actual save failed/);
  assert.equal(f.op.documentAck, false);
  assert.equal(f.op.inserted, true);
  assert.equal(f.counts.refresh, 0);
  f.rejectSave = false;
  await f.op.run(f.ports);
  assert.equal(f.counts.store, 1);
  assert.equal(f.counts.insert, 1);
  assert.equal(f.counts.save, 2);
  assert.equal(f.op.documentAck, true);
});
await test("completion waits for actual asynchronous queue ACK", async () => {
  const f = fixture(),
    ack = deferred();
  f.ports.awaitDocumentAck = async () => {
    const result = await enqueueSave(
      undefined,
      async () => {
        await ack.promise;
        f.op.acknowledge("note-a", f.local);
      },
      () => {},
      () => {},
    );
    assert.equal(result.saved, true);
  };
  const running = f.op.run(f.ports);
  await turn();
  assert.equal(f.op.inserted, true);
  assert.equal(f.op.documentAck, false);
  assert.equal(f.counts.refresh, 0);
  ack.resolve();
  await running;
  assert.equal(f.op.refreshed, true);
});
await test("lost store response queries same actual operation before insert", async () => {
  const f = fixture();
  f.ports.storage.store = async () => {
    f.counts.store++;
    throw Error("response rejected after write");
  };
  await f.op.run(f.ports);
  assert.equal(f.counts.store, 1);
  assert.equal(f.counts.query, 1);
  assert.equal(f.counts.insert, 1);
});
await test("rejected recovery query never means notPersisted", async () => {
  const f = fixture();
  f.ports.storage.store = async () => {
    f.counts.store++;
    throw Error("lost");
  };
  f.ports.storage.query = async () => {
    f.counts.query++;
    throw Error("query rejected");
  };
  await assert.rejects(f.op.run(f.ports), /query rejected/);
  assert.equal(f.counts.insert, 0);
  f.ports.storage.query = async () => {
    f.counts.query++;
    return stored;
  };
  await f.op.run(f.ports);
  assert.equal(f.counts.store, 1);
  assert.equal(f.counts.insert, 1);
  assert.equal(f.counts.query, 2);
});
await test("only accepted notPersisted permits same-op storage retry", async () => {
  const f = fixture();
  f.ports.storage.store = async () => {
    f.counts.store++;
    if (f.counts.store === 1) throw Error("not written");
    return stored;
  };
  f.ports.storage.query = async () => {
    f.counts.query++;
    return { operationId: "op-a", noteId: "note-a", status: "notPersisted" };
  };
  await assert.rejects(f.op.run(f.ports), /not written/);
  await f.op.run(f.ports);
  assert.equal(f.counts.store, 2);
  assert.equal(f.counts.insert, 1);
});
await test("stored bytes do not authorize changed original target", async () => {
  const f = fixture();
  f.ports.validate = async () => {
    if (++f.counts.validate === 2) throw Error("target changed");
  };
  await assert.rejects(f.op.run(f.ports), /target changed/);
  assert.equal(f.op.attachment.id, attachment.id);
  assert.equal(f.counts.insert, 0);
});
await test("clear/cancel invalidation seals admission before late store response", async () => {
  const f = fixture(),
    response = deferred();
  f.ports.storage.store = () => response.promise;
  const running = f.op.run(f.ports);
  await turn();
  f.op.invalidate();
  response.resolve(stored);
  await assert.rejects(running, /失效/);
  assert.equal(f.counts.insert, 0);
  assert.equal(f.op.documentAck, false);
});
await test("insert false/no dispatch retains identity for one later insertion", async () => {
  const f = fixture(),
    insert = f.ports.insert;
  f.ports.insert = () => {
    throw Error("command returned false");
  };
  await assert.rejects(f.op.run(f.ports), /returned false/);
  assert.equal(f.op.inserted, false);
  assert.equal(f.counts.save, 0);
  f.ports.insert = insert;
  await f.op.run(f.ports);
  assert.equal(f.counts.store, 1);
  assert.equal(f.counts.insert, 1);
});
await test("throw after controlled local document change never duplicates node", async () => {
  const f = fixture(),
    insert = f.ports.insert;
  f.ports.insert = (a) => {
    insert(a);
    throw Error("after dispatch");
  };
  await assert.rejects(f.op.run(f.ports), /after dispatch/);
  assert.equal(f.op.inserted, true);
  await f.op.run(f.ports);
  assert.equal(f.counts.insert, 1);
  assert.equal(f.counts.store, 1);
  assert.equal(f.op.documentAck, true);
});
await test("ACK plus refresh failure retries refresh without store/insert/save", async () => {
  const f = fixture();
  f.rejectRefresh = true;
  await assert.rejects(f.op.run(f.ports), /refresh failed/);
  assert.equal(f.op.documentAck, true);
  assert.equal(f.op.refreshed, false);
  f.rejectRefresh = false;
  f.ports.validate = async () => {
    throw Error("old cursor has since changed");
  };
  await f.op.run(f.ports);
  assert.deepEqual(
    [f.counts.store, f.counts.insert, f.counts.save, f.counts.refresh],
    [1, 1, 1, 2],
  );
});
await test("ACK requires matching actual note, node type, id and kind", async () => {
  const f = fixture();
  f.ports.awaitDocumentAck = async () => {
    f.op.acknowledge("note-b", body());
    f.op.acknowledge("note-a", body({ ...attachment, id: "other" }));
    f.op.acknowledge("note-a", body({ ...attachment, kind: "audio" }));
    f.op.acknowledge("note-a", {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { id: attachment.id, kind: attachment.kind },
        },
      ],
    });
  };
  await assert.rejects(f.op.run(f.ports), /尚未确认保存/);
  assert.equal(f.op.documentAck, false);
  assert.equal(f.counts.refresh, 0);
});
await test("concurrent retry joins existing operation", async () => {
  const f = fixture(),
    response = deferred();
  f.ports.storage.store = () => {
    f.counts.store++;
    return response.promise;
  };
  const a = f.op.run(f.ports),
    b = f.op.run(f.ports);
  assert.equal(a, b);
  response.resolve(stored);
  await a;
  assert.equal(f.counts.insert, 1);
  assert.equal(f.counts.store, 1);
});
await test("deferred/aborted journal result preserves explicit incomplete state", async () => {
  for (const status of ["deferred", "aborted"]) {
    const f = fixture();
    f.ports.storage.store = async () => ({
      ...stored,
      status,
      attachment: undefined,
      reason: "save_pending",
    });
    f.ports.storage.query = f.ports.storage.store;
    await assert.rejects(f.op.run(f.ports), /save_pending/);
    assert.equal(f.counts.insert, 0);
    assert.equal(f.op.refreshed, false);
  }
});
await test("wrong operation or note cannot lend attachment identity", async () => {
  for (const patch of [
    { operationId: "other" },
    { noteId: "other" },
    { attachment: { ...attachment, noteId: "other" } },
  ]) {
    const f = fixture();
    f.ports.storage.store = async () => ({ ...stored, ...patch });
    f.ports.storage.query = f.ports.storage.store;
    await assert.rejects(f.op.run(f.ports));
    assert.equal(f.counts.insert, 0);
  }
});
await test("browser demo uses separate storage, same target/insert/ACK stages", async () => {
  const f = fixture();
  f.ports.storage = {
    kind: "preview",
    store: async () => {
      f.counts.store++;
      return attachment;
    },
  };
  f.rejectRefresh = true;
  await assert.rejects(f.op.run(f.ports));
  f.rejectRefresh = false;
  await f.op.run(f.ports);
  assert.equal(f.counts.query, 0);
  assert.equal(f.counts.store, 1);
  assert.equal(f.counts.insert, 1);
  assert.equal(f.op.documentAck, true);
});
await test("real queue drains after failure and reports individual outcomes", async () => {
  const errors = [],
    order = [];
  const first = enqueueSave(
    undefined,
    async () => {
      order.push("first");
      throw Error("first failed");
    },
    (e) => errors.push(e.message),
    () => order.push("first settled"),
  );
  const second = enqueueSave(
    first,
    async () => {
      order.push("second");
    },
    () => {},
    () => order.push("second settled"),
  );
  assert.equal((await first).saved, false);
  assert.equal((await second).saved, true);
  assert.deepEqual(errors, ["first failed"]);
  assert.deepEqual(order, [
    "first",
    "first settled",
    "second",
    "second settled",
  ]);
});
await test("trusted synchronization exposes failure despite resolved promise", async () => {
  const sync = new TrustedSynchronization(),
    errors = [],
    published = [];
  const result = await sync.request(
    () => {},
    async () => {
      throw Error("load failed");
    },
    (x) => published.push(x),
    (e) => errors.push(e.message),
  );
  assert.equal(result.success, false);
  assert.equal(sync.current(result), false);
  assert.deepEqual(published, []);
  assert.deepEqual(errors, ["load failed"]);
  const next = await sync.request(
    () => {},
    async () => ({ value: "trusted" }),
    (x) => published.push(x),
    () => {},
  );
  assert.equal(next.success, true);
  assert.equal(sync.current(next), true);
  sync.invalidate();
  assert.equal(sync.current(next), false);
});
await test("superseded sync coalesces but discards stale snapshot and reloads", async () => {
  const sync = new TrustedSynchronization(),
    first = deferred(),
    published = [];
  let loads = 0,
    begins = 0;
  const load = async () => {
    loads++;
    return loads === 1 ? first.promise : "new";
  };
  const a = sync.request(
    () => begins++,
    load,
    (x) => published.push(x),
    () => {},
  );
  await turn();
  const b = sync.request(
    () => begins++,
    load,
    (x) => published.push(x),
    () => {},
  );
  assert.equal(a, b);
  first.resolve("old");
  const result = await b;
  assert.deepEqual(published, ["new"]);
  assert.equal(loads, 2);
  assert.equal(begins, 2);
  assert.equal(sync.current(result), true);
});
await test("publication-time invalidation cannot certify older synchronization", async () => {
  const sync = new TrustedSynchronization();
  let loads = 0;
  const result = await sync.request(
    () => {},
    async () => ++loads,
    () => {
      if (loads === 1) sync.invalidate();
    },
    () => {},
  );
  assert.equal(result.snapshot, 2);
  assert.equal(sync.current(result), true);
});
await test("actual AccessGate remains strict while original target rebinds generation", async () => {
  const gate = new AccessGate();
  gate.state = {
    sessionId: "session",
    epoch: 2,
    notes: { "note-a": { epoch: 3, authorized: true } },
    suspended: [],
    operationId: null,
  };
  const schema = new Schema({
    nodes: {
      doc: { content: "paragraph+" },
      paragraph: { content: "text*" },
      text: {},
    },
  });
  const state = EditorState.create({
    schema,
    doc: schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("Original")]),
    ]),
  });
  const editor = {},
    document = state.doc.toJSON();
  const target = {
    noteId: "note-a",
    scope: "original",
    stamp: gate.stamp("note-a"),
    editor,
    owner: "note-a",
    bookmark: TextSelection.create(state.doc, 3).getBookmark(),
    documentVersion: 8,
    externalVersion: 4,
    document,
    trustedDocument: document,
    invalidated: false,
  };
  gate.invalidate();
  assert.throws(() => gate.accept(gate.state, target.stamp));
  const live = {
    noteId: "note-a",
    scope: "original",
    stamp: gate.stamp("note-a"),
    editor,
    owner: "note-a",
    documentVersion: 8,
    externalVersion: 4,
    editorDocument: structuredClone(document),
    trustedDocument: structuredClone(document),
    trustedSynchronization: true,
    available: true,
  };
  const rebound = rebindAttachmentTarget(target, live);
  assert.equal(rebound.generation, 1);
  assert.equal(target.stamp.generation, 0);
  gate.accept(gate.state, rebound);
  assert.equal(target.bookmark.resolve(state.doc).from, 3);
  assert.equal(rebindAttachmentTarget(target, { ...live, stamp: { ...live.stamp, epoch: live.stamp.epoch + 1 } }).epoch, live.stamp.epoch + 1);
  for (const change of [
    { noteId: "note-b" },
    { scope: "another" },
    { editor: {} },
    { owner: "note-b" },
    { documentVersion: 9 },
    { externalVersion: 5 },
    { trustedSynchronization: false },
    { available: false },
    { editorDocument: { ...document, extra: 1 } },
    { trustedDocument: { ...document, extra: 1 } },
    { stamp: { ...live.stamp, sessionId: "new" } },
    { stamp: { ...live.stamp, epoch: live.stamp.epoch - 1 } },
    { stamp: { ...live.stamp, epoch: undefined } },
    { stamp: { ...live.stamp, noteEpoch: 4 } },
    { stamp: { ...live.stamp, noteId: "note-b" } },
  ])
    assert.throws(() => rebindAttachmentTarget(target, { ...live, ...change }));
  const rawWithoutOptionalDefaults = {
    type: "doc",
    content: [{ type: "paragraph" }],
  };
  const editorWithOptionalDefaults = {
    type: "doc",
    content: [{ type: "paragraph", attrs: { optional: null } }],
  };
  const separateRepresentations = {
    ...target,
    document: editorWithOptionalDefaults,
    trustedDocument: rawWithoutOptionalDefaults,
  };
  assert.doesNotThrow(() =>
    rebindAttachmentTarget(separateRepresentations, {
      ...live,
      editorDocument: editorWithOptionalDefaults,
      trustedDocument: rawWithoutOptionalDefaults,
    }),
  );
  assert.throws(() =>
    rebindAttachmentTarget(separateRepresentations, {
      ...live,
      editorDocument: editorWithOptionalDefaults,
      trustedDocument: editorWithOptionalDefaults,
    }),
  );
  assert.throws(() =>
    rebindAttachmentTarget({ ...target, invalidated: true }, live),
  );
  assert.throws(() =>
    rebindAttachmentTarget(
      { ...target, stamp: { ...target.stamp, sessionId: undefined } },
      live,
    ),
  );
});
const bridge = await production("bridge");
const readerQueue = [];
const previousReader = globalThis.FileReader;
class BoundaryFileReader {
  constructor() {
    readerQueue.push(this);
  }
  readAsDataURL(file) {
    this.file = file;
  }
  complete(data) {
    this.result = `data:application/pdf;base64,${data}`;
    this.onload();
  }
}
globalThis.FileReader = BoundaryFileReader;
try {
  await test("external audio File.lastModified never becomes recordedAt", async () => {
    const state = {
      sessionId: "mtime-test",
      epoch: 1,
      notes: { "note-a": { epoch: 0, authorized: true } },
      suspended: [],
      operationId: null,
    };
    bridge.accessGate.state = state;
    let request;
    globalThis.__attachmentBridgeBoundary = {
      invoke: async (command, params) => {
        request = { command, params };
        return {
          ...stored,
          attachment: {
            ...attachment,
            kind: "audio",
            displayName: "external.webm",
            mime: "audio/webm",
          },
          access: state,
        };
      },
    };
    const file = new File(["synthetic-external-only"], "external.webm", {
      type: "audio/webm",
      lastModified: 1793743199123,
    });
    const pending = bridge.storeAttachmentOperation("op-a", "note-a", file);
    readerQueue.shift().complete("c3ludGhldGljLWV4dGVybmFsLW9ubHk=");
    const result = await pending;
    assert.equal(file.lastModified, 1793743199123);
    assert.equal(Object.hasOwn(request.params, "recordedAt"), false);
    assert.equal(result.attachment.recordedAt, undefined);
    assert.equal(
      new AttachmentSubmission("op-a", "note-a", {}, file).recordedAt,
      undefined,
    );
  });
  await test("actual bridge captures token before FileReader and query recovers rejected response", async () => {
    const state = {
      sessionId: "bridge-session",
      epoch: 4,
      notes: { "note-a": { epoch: 7, authorized: true } },
      suspended: [],
      operationId: null,
    };
    bridge.accessGate.state = state;
    const calls = [];
    globalThis.__attachmentBridgeBoundary = {
      invoke: async (command, params) => {
        calls.push({ command, params });
        if (command === "read_attachment")
          return {
            access: state,
            data: "JVBERg==",
            mime: "application/pdf",
            name: "a.pdf",
          };
        return { ...stored, access: state };
      },
    };
    const file = {
      name: "a.pdf",
      type: "application/pdf",
      lastModified: 1793743199123,
    };
    const pending = bridge.storeAttachmentOperation("op-a", "note-a", file);
    const reader = readerQueue.shift();
    assert.equal(reader.file, file);
    bridge.invalidateAccessRequests();
    reader.complete("JVBERg==");
    await assert.rejects(pending, /授权状态已改变/);
    assert.deepEqual(calls[0], {
      command: "store_attachment_operation",
      params: {
        operationId: "op-a",
        noteId: "note-a",
        name: "a.pdf",
        mime: "application/pdf",
        data: "JVBERg==",
        expected: { sessionId: "bridge-session", epoch: 4, noteEpoch: 7 },
      },
    });
    const queried = await bridge.queryAttachmentOperation("op-a", "note-a");
    assert.equal(queried.attachment.id, attachment.id);
    const read = await bridge.readAttachment(attachment.id);
    assert.equal(read.data, "JVBERg==");
    assert.equal(calls[1].command, "query_attachment_operation");
    assert.equal(calls[2].params.expected.noteEpoch, 7);
    await bridge.cancelAttachmentOperation("op-a", "note-a");
    assert.deepEqual(calls[3], {
      command: "cancel_attachment_operation",
      params: {
        operationId: "op-a",
        noteId: "note-a",
        expected: { sessionId: "bridge-session", epoch: 4, noteEpoch: 7 },
      },
    });
  });
  await test("actual bridge never accepts query/cancel without current access snapshot", async () => {
    const state = bridge.accessGate.state;
    globalThis.__attachmentBridgeBoundary = { invoke: async () => stored };
    await assert.rejects(
      bridge.queryAttachmentOperation("op-a", "note-a"),
      /未提供授权状态/,
    );
    await assert.rejects(
      bridge.cancelAttachmentOperation("op-a", "note-a"),
      /未提供授权状态/,
    );
    bridge.accessGate.state = undefined;
    await assert.rejects(
      bridge.storeAttachmentOperation("op-a", "note-a", {}),
      /授权状态已改变/,
    );
    assert.equal(readerQueue.length, 0);
    bridge.accessGate.state = state;
  });
} finally {
  globalThis.FileReader = previousReader;
  delete globalThis.__attachmentBridgeBoundary;
}
console.log(
  JSON.stringify(
    {
      status: "passed",
      groups: results.length,
      results,
      productionSourceSha256: hashes,
      limitations:
        "Source boundary checks with controlled platform I/O. No real picker, Tauri IPC, device, cold launch, pixels or audible media acceptance.",
    },
    null,
    2,
  ),
);
