import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import ts from "typescript";
const output = resolve(
  process.argv[2] || "docs/verification/mac-recording-autosave64/author",
);
await mkdir(output, { recursive: true });
const modules = new Map(),
  hashes = {};
async function load(name) {
  if (modules.has(name)) return modules.get(name);
  const source = await readFile("src/" + name + ".ts", "utf8");
  hashes[name] = createHash("sha256").update(source).digest("hex");
  let code = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  for (const dependency of ["recording-session", "recording-pcm"])
    if (code.includes('"./' + dependency + '"')) {
      const m = await load(dependency);
      code = code.replaceAll('"./' + dependency + '"', JSON.stringify(m.url));
    }
  const url =
    "data:text/javascript;base64," + Buffer.from(code).toString("base64");
  const module = { url, exports: await import(url) };
  modules.set(name, module);
  return module;
}
const { DesktopRecordingSession } = (await load("desktop-recording-session"))
  .exports;
const { RecordingRevisionRelay } = (await load("recording-revision-relay"))
  .exports;
const { RecordingOwner } = (await load("recording-coordinator")).exports;
const audio = (value = 0.25) => ({
  sampleRate: 24000,
  numberOfChannels: 1,
  length: 10,
  getChannelData: () => new Float32Array(10).fill(value),
});
const until = async (p) => {
  for (let i = 0; i < 100 && !p(); i++) await Promise.resolve();
  assert(p());
};
const factory = (options = {}) => {
  const errors = [],
    decodes = [],
    recorders = [];
  let starts = 0,
    stops = 0,
    tick;
  const track = {
      readyState: "live",
      addEventListener() {},
      removeEventListener() {},
      stop() {
        this.readyState = "ended";
        stops++;
      },
    },
    stream = { getTracks: () => [track] };
  const environment = {
    authorize: async () => {},
    getStream: async () => stream,
    createContext: () => ({
      createAnalyser: () => ({
        fftSize: 0,
        frequencyBinCount: 1,
        getByteFrequencyData() {
          if (options.analyserError) throw Error("controlled analyser failure");
        },
        disconnect() {},
      }),
      createMediaStreamSource: () => ({ connect() {}, disconnect() {} }),
      close: async () => {},
    }),
    setInterval: (callback) => {
      tick = callback;
      return 1;
    },
    clearInterval() {},
    createRecorder: () => {
      const r = {
        mimeType: "audio/webm",
        state: "inactive",
        start() {
          this.state = "recording";
          starts++;
        },
        stop() {
          this.state = "inactive";
          if (!options.holdStop) queueMicrotask(() => r.finish());
        },
        finish() {
          this.ondataavailable?.({ data: new Blob(["tail"]) });
          this.onstop?.();
        },
      };
      recorders.push(r);
      return r;
    },
  };
  const session = new DesktopRecordingSession(
    { onRecording() {}, onLevel() {}, onError: (e) => errors.push(e.message) },
    environment,
    async (blob) => {
      decodes.push(blob);
      if (options.decodeFailures > 0) {
        options.decodeFailures--;
        throw Error("controlled decode failure");
      }
      assert.equal(await blob.text(), "prefixtail");
      return audio();
    },
  );
  return {
    session,
    tick: () => tick(),
    errors,
    recorders,
    track,
    decodes,
    get starts() {
      return starts;
    },
    get stops() {
      return stops;
    },
  };
};
const checks = [];
const test = async (name, run) => {
  console.log("RUN", name);
  checks.push({ name, pass: true, ...(await run()) });
};
try {
  await test("checkpoint waits for real final tail/onstop and decodes the complete segment once", async () => {
    const f = factory({ holdStop: true });
    await f.session.start();
    const r = f.recorders[0];
    r.ondataavailable({ data: new Blob(["prefix"]) });
    let done = false;
    const work = f.session.checkpoint().then((b) => {
      done = true;
      return b;
    });
    await Promise.resolve();
    assert(!done);
    assert.equal(f.decodes.length, 0);
    r.finish();
    const wav = await work;
    assert.equal(wav.size, 64);
    assert.equal(f.decodes.length, 1);
    assert(f.session.canResume);
    f.session.dispose();
    return { bytes: wav.size };
  });
  await test("decode failure retains exact sealed Blob; explicit retry succeeds without recorder restart or data replacement", async () => {
    const f = factory({ decodeFailures: 1 });
    await f.session.start();
    f.recorders[0].ondataavailable({ data: new Blob(["prefix"]) });
    await assert.rejects(f.session.checkpoint(), /decode failure/);
    const wav = await f.session.checkpoint();
    assert.equal(f.decodes[0], f.decodes[1]);
    assert.equal(f.starts, 1);
    assert.equal(wav.size, 64);
    f.session.dispose();
    return { sameBlob: true };
  });
  await test("MediaRecorder error still collects its final tail and permits saving; capture cannot silently resume", async () => {
    const f = factory();
    await f.session.start();
    const r = f.recorders[0];
    r.ondataavailable({ data: new Blob(["prefix"]) });
    r.onerror({});
    await until(() => r.onstop === null);
    const wav = await f.session.checkpoint();
    assert.equal(wav.size, 64);
    assert(!f.session.canResume);
    assert(f.errors.some((e) => e.includes("设备发生错误")));
    f.session.dispose();
    return { tailRetained: true };
  });
  await test("finalization timeout retains late tail for explicit save retry", async () => {
    const f = factory({ holdStop: true });
    await f.session.start();
    const r = f.recorders[0];
    r.ondataavailable({ data: new Blob(["prefix"]) });
    const native = setTimeout;
    let deadline;
    globalThis.setTimeout = (fn, ms, ...args) => {
      if (ms === 15000) {
        deadline = fn;
        return 12345;
      }
      return native(fn, ms, ...args);
    };
    let work;
    try {
      work = f.session.checkpoint();
      deadline();
      await assert.rejects(work, /超时/);
    } finally {
      globalThis.setTimeout = native;
    }
    assert.equal(f.decodes.length, 0);
    r.finish();
    const wav = await f.session.checkpoint();
    assert.equal(wav.size, 64);
    assert.equal(f.starts, 1);
    f.session.dispose();
    return { lateTailRetained: true };
  });
  await test("empty finalized media remains a visible save failure and does not fabricate a WAV", async () => {
    const f = factory({ holdStop: true });
    await f.session.start();
    const work = f.session.checkpoint();
    f.recorders[0].onstop();
    await assert.rejects(work, /为空/);
    await assert.rejects(f.session.checkpoint(), /为空/);
    assert(!f.session.canResume);
    f.session.dispose();
    return {};
  });
  await test("analyser failure seals capture before showing retry and retains final tail", async () => {
    const f = factory({ analyserError: true });
    await f.session.start();
    const r = f.recorders[0];
    r.ondataavailable({ data: new Blob(["prefix"]) });
    f.tick();
    assert.equal(r.state, "inactive");
    await until(() => r.onstop === null);
    const wav = await f.session.checkpoint();
    assert.equal(wav.size, 64);
    assert(!f.session.canResume);
    assert(f.errors.includes("controlled analyser failure"));
    f.session.dispose();
    return { tailRetained: true };
  });
  await test("stale/wrong-intent ACK cannot settle a revision; retry retains transfer bytes until owner acceptance", async () => {
    const sent = [];
    let encode = 0;
    const relay = new RecordingRevisionRelay(
      async (m) => sent.push(m),
      async () => {
        encode++;
        return "eA==";
      },
    );
    const file = new File([new Uint8Array(50)], "新录音.wav", {
        type: "audio/wav",
      }),
      r = Object.freeze({
        file,
        recordedAt: 1793743199123,
        revision: 1,
        intent: "checkpoint",
      });
    let done = false;
    const first = relay.submit(r).then(() => (done = true));
    await until(() => sent.length === 1);
    assert.equal(
      relay.receive({
        kind: "owner-status",
        revision: 0,
        status: "saved",
        fileAccepted: true,
      }),
      false,
    );
    assert.equal(
      relay.receive({
        kind: "owner-status",
        revision: 1,
        status: "saved",
        fileAccepted: true,
      }),
      false,
    );
    await Promise.resolve();
    assert(!done);
    relay.receive({
      kind: "owner-status",
      revision: 1,
      status: "checkpoint-saved",
      fileAccepted: true,
    });
    await first;
    const final = Object.freeze({ ...r, revision: 2, intent: "final" });
    let resolved = false;
    const second = relay.submit(final).then(() => (resolved = true));
    await until(() => sent.length === 2);
    relay.receive({
      kind: "owner-status",
      revision: 1,
      status: "checkpoint-saved",
      fileAccepted: true,
    });
    await Promise.resolve();
    assert(!resolved);
    assert.equal(
      relay.receive({
        kind: "owner-status",
        revision: 2,
        status: "saved",
        fileAccepted: true,
      }),
      false,
      "active waiter owns destroy",
    );
    await second;
    assert.equal(
      relay.receive({
        kind: "owner-status",
        revision: 2,
        status: "saved",
        fileAccepted: true,
      }),
      true,
      "late ACK can recover",
    );
    assert.equal(encode, 2);
    relay.dispose();
    return {};
  });
  await test("Owner lost checkpoint receipt replays exact ACK without resaving, then reconstructs only the next immutable version", async () => {
    const identity = {
        sessionId: "s",
        operationId: "o",
        owner: "main",
        child: "child",
      },
      statuses = [],
      saved = [];
    const owner = new RecordingOwner(identity, {
      send: async (m) => statuses.push(m),
      decode: (t) =>
        new File([Buffer.from(t.data, "base64")], t.name, { type: t.mime }),
      submit: async () => assert.fail("legacy submit"),
      saveRevision: async (r) => saved.push(r),
      discard: async () => {},
      view() {},
      reveal: async () => {},
      closed() {},
    });
    const data = Buffer.alloc(50, 1).toString("base64"),
      transfer = {
        name: "新录音.wav",
        mime: "audio/wav",
        size: 50,
        lastModified: 1,
        recordedAt: 1793743199123,
        data,
      },
      receive = (m) =>
        owner.receive({ ...identity, from: "child", message: m });
    await receive({
      kind: "revision-submit",
      revision: 1,
      intent: "checkpoint",
      transfer,
    });
    assert.equal(statuses.at(-1).status, "checkpoint-saved");
    await receive({ kind: "hello" });
    await receive({
      kind: "revision-submit",
      revision: 1,
      intent: "checkpoint",
    });
    assert.equal(saved.length, 1);
    assert.equal(statuses.at(-1).status, "checkpoint-saved");
    await receive({
      kind: "revision-submit",
      revision: 2,
      intent: "final",
      transfer,
    });
    assert.equal(saved.length, 2);
    assert.notEqual(saved[0].file, saved[1].file);
    assert.equal(saved[0].recordedAt, saved[1].recordedAt);
    assert.equal(statuses.at(-1).revision, 2);
    assert.equal(statuses.at(-1).status, "saved");
    return {};
  });
  console.log(JSON.stringify({ pass: true, checks, hashes }, null, 2));
  await writeFile(
    resolve(output, "session.json"),
    JSON.stringify({ pass: true, checks, hashes }, null, 2),
  );
} catch (error) {
  await writeFile(
    resolve(output, "session-failure.json"),
    JSON.stringify(
      { pass: false, checks, error: String(error), stack: error.stack },
      null,
      2,
    ),
  );
  throw error;
}
