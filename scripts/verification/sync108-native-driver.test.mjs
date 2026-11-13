// Protocol-only tests. The child below is explicitly a Node fixture, never
// evidence for native Tauri, Session, networking or business synchronization.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { NativeApp, FrameDecoder, PREFIX, MAX_REQUEST, MAX_REPLY, encodeRequest, bounded } from "./sync108-native-driver.mjs";

if (process.argv.includes("--stdio-fixture")) {
  const mode = process.env.SYNC108_UNIT_MODE;
  const send = (value) => process.stdout.write(PREFIX + JSON.stringify(value) + "\n");
  if (mode !== "noHello") {
    process.stdout.write("discard this native-like diagnostic\n");
    send({ type: "hello", protocol: 1, pid: process.pid, window: "main", transport: "native-webview-eval-event" });
  }
  let active = 0, maximum = 0, completed = 0;
  const lines = createInterface({ input: process.stdin });
  lines.on("line", async (line) => {
    const request = JSON.parse(line);
    const { id, action } = request;
    active++;
    maximum = Math.max(maximum, active);
    if (action.op === "ready" && mode?.startsWith("readyTimeout")) {
      active--;
      send({type:"response",id,ok:false,error:{code:"TIMEOUT",phase:"documentProbe",diagnostic:{documentProbes:3}}});
      return;
    }
    if (action.op === "startupDiagnostic") {
      active--;
      if (mode === "readyTimeoutOldCandidate") send({type:"response",id:null,ok:false,error:{code:"INVALID_REQUEST"}});
      else send({type:"response",id,ok:true,value:{version:1,cancelled:false,readyState:"complete",visibility:"hidden",debug:true,startup:"loading",
        root:{inert:true,inertAttribute:true,ariaHidden:true,ariaBusy:true},renderClock:{raf:0,timer:14,elapsedMs:350},startupSnapshot:null,
        nativeWindow:{visible:true,minimized:false,focused:false},...(mode === "readyTimeoutUnsafe" ? {body:"private-sentinel"} : {})}});
      return;
    }
    if (action.op === "state" && mode === "invalidResponse") {
      send({ type: "response", id, ok: true });
      active--;
      return;
    }
    if (action.op === "state" && mode === "nativeTimeout") {
      process.stdout.write(PREFIX + JSON.stringify({ type: "response", id, ok: false, error: { code: "NATIVE_TIMEOUT" } }) + "\n", () => process.exit(70));
      return;
    }
    if (action.op === "state" && mode === "hang") return;
    await new Promise((done) => setTimeout(done, action.op === "execute" ? 25 : 1));
    let value = null;
    if (action.op === "ready") value = { version: 1, native: true, window: "main", location: "tauri://localhost", interactive: true, startupDetached: true };
    if (action.op === "execute") value = { text: "真实 UTF-8 分帧 🧪", completed: ++completed, maximum };
    if (action.op === "state") value = { completed, maximum };
    active--;
    send({ type: "response", id: action.op === "state" && mode === "wrongId" ? id + 1 : id, ok: true, value });
    if (action.op === "shutdown" && mode === "truncatedShutdownTail")
      process.stdout.write(PREFIX + '{"type":"response"');
    if (action.op === "shutdown" && mode !== "forcedExit") lines.close();
  });
  if (mode === "forcedExit") setInterval(() => {}, 1000);
} else {
  const { test } = await import("node:test");
  const fixture = (mode = "normal", closeTimeoutMs = 1000) => new NativeApp(process.execPath, "/unit-fixture-not-a-store", {
    name: "node-protocol-fixture", commandArgs: [fileURLToPath(import.meta.url), "--stdio-fixture"],
    env: { SYNC108_UNIT_MODE: mode }, closeTimeoutMs,
  });
  const clean = async (app) => { await app.close().catch(() => {}); assert(app.lifecycle.exit, "Owned fixture must exit"); };

  test("request schema rejects unknown keys, unsafe IDs, unbounded values and invalid action types", () => {
    assert.equal(JSON.parse(encodeRequest(1, { op: "execute", command: "note.create", args: {} })).id, 1);
    assert.deepEqual(JSON.parse(encodeRequest(1, {op:"startupDiagnostic"})).action,{op:"startupDiagnostic"});
    for (const [id, action, timeout] of [
      [0, { op: "state" }], [Number.MAX_SAFE_INTEGER + 1, { op: "state" }],
      [1, { op: "startupDiagnostic", expression: "true" }], [1, { op: "startupDiagnostic", args: {} }],
      [1, { op: "startupDiagnostic", command: "app.state" }], [1, { op: "unknown" }], [1, { op: "state", extra: true }], [1, { op: "state" }, 60_001],
      [1, { op: "execute", command: "x", args: [] }], [1, { op: "snapshot", options: [] }],
      [1, { op: "eval", expression: "" }], [1, { op: "eval", expression: "中".repeat(128_000) }],
      [1, { op: "eval", expression: "arg", arg: "x".repeat(MAX_REQUEST) }],
    ]) assert.throws(() => encodeRequest(id, action, timeout));
  });
  test("prefixed framing handles UTF-8 and multiple frames across byte-sized chunks; noise is counted only", () => {
    const frames = [], decoder = new FrameDecoder((frame) => frames.push(frame));
    const expected = [{ type: "hello" }, { type: "response", value: "中文 🧪" }];
    const bytes = Buffer.from("not retained\n" + expected.map((frame) => PREFIX + JSON.stringify(frame) + "\r\n").join(""));
    for (const byte of bytes) decoder.push(Buffer.from([byte]));
    decoder.end();
    assert.deepEqual(frames, expected);
    assert.equal(decoder.noiseBytes, Buffer.byteLength("not retained\n"));
    assert(!Object.values(decoder).some((v) => typeof v === "string" && v.includes("not retained")));
  });
  test("framing refuses oversized lines, malformed JSON and truncated protocol frames", () => {
    assert.throws(() => new FrameDecoder(() => {}).push(Buffer.alloc(MAX_REPLY + 1, 65)), { code: "STDOUT_LINE_TOO_LARGE" });
    assert.throws(() => new FrameDecoder(() => {}).push(Buffer.from(PREFIX + "{\n")), { code: "INVALID_FRAME" });
    const decoder = new FrameDecoder(() => {});
    decoder.push(Buffer.from(PREFIX + '{"type":"response"}'));
    assert.throws(() => decoder.end(), { code: "TRUNCATED_FRAME" });
  });
  for (const mode of ["readyTimeout", "readyTimeoutOldCandidate", "readyTimeoutUnsafe"]) {
    test(`${mode} attempts only fixed diagnostic and preserves original ready failure`, async () => {
      const app=fixture(mode);
      try {
        await assert.rejects(app.ready(1000),{code:"TIMEOUT",phase:"documentProbe"});
        assert.equal(app.lifecycle.failureCode,mode === "readyTimeoutOldCandidate" ? "UNEXPECTED_RESPONSE" : "TIMEOUT");assert.equal(app.lifecycle.failurePhase,"documentProbe");
        assert.deepEqual(app.lifecycle.readinessError,{code:"TIMEOUT",phase:"documentProbe"});
        assert.deepEqual(app.lifecycle.nativeDiagnostic,{documentProbes:3});
        assert.equal(app.lifecycle.commands,2);assert.equal(app.lifecycle.lastAction,"startupDiagnostic");
        if(mode === "readyTimeout") assert.equal(app.lifecycle.readinessFailure.renderClock.timer,14);
        else assert.deepEqual(app.lifecycle.readinessFailure,{code:"DIAGNOSTIC_UNAVAILABLE"});
        assert(!JSON.stringify(app.lifecycle).includes("private-sentinel"));
        await assert.rejects(app.state(),{code:mode === "readyTimeoutOldCandidate" ? "UNEXPECTED_RESPONSE" : "TIMEOUT"});assert.equal(app.lifecycle.commands,2);
      } finally {await clean(app);}
    });
  }
  test("concurrent callers are serialized and explicit shutdown reaches owned natural exit", async () => {
    const app = fixture();
    try {
      await app.ready();
      const values = await Promise.all([1, 2, 3].map(() => app.execute("fixture")));
      assert.deepEqual(values.map((v) => v.completed), [1, 2, 3]);
      assert(values.every((v) => v.maximum === 1));
      assert.deepEqual(await app.state(), { completed: 3, maximum: 1 });
      await app.close();
      assert(app.lifecycle.naturalExit);
      assert.equal(app.lifecycle.exit.code, 0);
      assert.equal(app.lifecycle.stdoutNoiseBytes, Buffer.byteLength("discard this native-like diagnostic\n"));
      await assert.rejects(app.state(), { code: "APP_CLOSING" });
    } finally { await clean(app); }
  });
  test("clean stdin EOF reaches owned natural exit", async () => {
    const app = fixture();
    try { await app.ready(); await app.close({ eof: true }); assert(app.lifecycle.naturalExit); }
    finally { await clean(app); }
  });
  test("successful shutdown followed by a truncated tail rejects close despite exit zero", async () => {
    const app = fixture("truncatedShutdownTail");
    try {
      await app.ready();
      await assert.rejects(app.close(), { code: "TRUNCATED_FRAME" });
      assert.deepEqual(app.lifecycle.exit, { code: 0, signal: null });
      assert.equal(app.lifecycle.failureCode, "TRUNCATED_FRAME");
      assert.equal(app.lifecycle.naturalExit, false);
      assert.deepEqual(app.lifecycle.forcedSignals, []);
    } finally { await clean(app); }
  });
  for (const [mode, code] of [["invalidResponse", "INVALID_RESPONSE"], ["wrongId", "UNEXPECTED_RESPONSE"], ["nativeTimeout", "NATIVE_TIMEOUT"]]) {
    test(`${mode} fails promptly and prevents another request`, async () => {
      const app = fixture(mode);
      try {
        await app.ready();
        await assert.rejects(bounded(app.state(), 1000), { code });
        await assert.rejects(app.execute("never sent"), { code });
        await assert.rejects(app.close(), { code });
      } finally { await clean(app); }
    });
  }
  test("local timeout fails closed and owned process is cleaned up", async () => {
    const app = fixture("hang");
    try {
      await app.ready();
      await assert.rejects(app.request({ op: "state" }, 1), { code: "DRIVER_TIMEOUT" });
      await assert.rejects(app.execute("never sent"), { code: "DRIVER_TIMEOUT" });
    } finally { await clean(app); }
  });
  test("hello timeout closes an unresponsive owned fixture without a second command", async () => {
    const app = fixture("noHello");
    try {
      await assert.rejects(app.ready(100), { code: "HELLO_TIMEOUT" });
      await assert.rejects(app.close(), { code: "HELLO_TIMEOUT" });
      assert.equal(app.lifecycle.commands, 0);
    } finally { await clean(app); }
  });
  test("a process requiring a signal is recorded as failure, never a natural exit", async () => {
    const app = fixture("forcedExit", 100);
    try {
      await app.ready();
      await assert.rejects(app.close(), { code: "NATURAL_EXIT_TIMEOUT" });
      assert.deepEqual(app.lifecycle.forcedSignals, ["SIGTERM"]);
      assert.equal(app.lifecycle.naturalExit, false);
    } finally { await clean(app); }
  });
}
