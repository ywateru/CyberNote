import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { StringDecoder } from "node:string_decoder";

export const PREFIX = "@@SYNC108_NATIVE@@";
export const MAX_REQUEST = 2_100_000;
export const MAX_REPLY = 8_010_000;
export const MAX_EXPRESSION = 128_000;
const failure = (code) => Object.assign(new Error(code), { code });
export const delay = (ms) => new Promise((done) => setTimeout(done, ms));
export async function bounded(promise, ms, code = "TIMEOUT") {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(failure(code)), ms); }),
    ]);
  } finally { clearTimeout(timer); }
}
export async function until(name, predicate, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(100);
  }
  throw failure(`CONDITION_TIMEOUT:${name}`);
}
export function encodeRequest(id, action, timeoutMs = 30_000) {
  if (!Number.isSafeInteger(id) || id < 1 || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000)
    throw failure("INVALID_REQUEST");
  if (!action || Object.getPrototypeOf(action) !== Object.prototype) throw failure("INVALID_REQUEST");
  const keys = {
    ready: [], startupDiagnostic: [], state: [], idle: [], shutdown: [],
    execute: ["command", "args"], snapshot: ["options"], eval: ["expression", "arg"],
  };
  if (!Object.hasOwn(keys, action.op) || Object.keys(action).some((k) => k !== "op" && !keys[action.op].includes(k)))
    throw failure("INVALID_REQUEST");
  const object = (v) => !!v && Object.getPrototypeOf(v) === Object.prototype;
  if (action.op === "execute" && (typeof action.command !== "string" || Buffer.byteLength(action.command) > 200 || (action.args !== undefined && !object(action.args))))
    throw failure("INVALID_REQUEST");
  if (action.op === "snapshot" && action.options !== undefined && !object(action.options)) throw failure("INVALID_REQUEST");
  if (action.op === "eval" && (typeof action.expression !== "string" || !action.expression.length || Buffer.byteLength(action.expression) > MAX_EXPRESSION))
    throw failure("INVALID_REQUEST");
  const serialized = JSON.stringify({ id, timeoutMs, action }) + "\n";
  if (Buffer.byteLength(serialized) > MAX_REQUEST) throw failure("INPUT_TOO_LARGE");
  return serialized;
}

// Exact finite projection only: malformed or old candidates remain diagnostic-unavailable.
export function safeStartupDiagnostic(value) {
  const record = (v, keys) => {
    if (!v || Object.getPrototypeOf(v) !== Object.prototype || Object.keys(v).length !== keys.length || Object.keys(v).some(k => !keys.includes(k))) throw failure("INVALID_DIAGNOSTIC");
    return v;
  };
  const bool = v => { if (typeof v !== "boolean") throw failure("INVALID_DIAGNOSTIC"); return v; };
  const count = (v, max) => {
    if (!Number.isSafeInteger(v) || v < 0 || v > max) throw failure("INVALID_DIAGNOSTIC");
    return v;
  };
  const label = (v, choices) => { if (!choices.includes(v)) throw failure("INVALID_DIAGNOSTIC"); return v; };
  const v = record(value, ["version", "cancelled", "readyState", "visibility", "debug", "startup", "root", "renderClock", "startupSnapshot", "nativeWindow"]);
  if (v.version !== 1) throw failure("INVALID_DIAGNOSTIC");
  const clock = record(v.renderClock, ["raf", "timer", "elapsedMs"]);
  const root = v.root === null ? null : record(v.root, ["inert", "inertAttribute", "ariaHidden", "ariaBusy"]);
  const nativeWindow = record(v.nativeWindow, ["visible", "minimized", "focused"]);
  const gateKeys = ["loading", "workspaceLoaded", "syncCover", "synchronizing", "editorSatisfied", "nativeRequired", "nativeInfoPresent", "errorPresent", "startupReady"];
  let startupSnapshot = null;
  if (v.startupSnapshot !== null) {
    const snapshot = record(v.startupSnapshot, ["schema", "gates", "phase"]);
    if (snapshot.schema !== 1) throw failure("INVALID_DIAGNOSTIC");
    const gates = record(snapshot.gates, gateKeys);
    startupSnapshot = {schema: 1, gates: Object.fromEntries(gateKeys.map(k => [k, bool(gates[k])])), phase: label(snapshot.phase, ["notScheduled", "frame1", "frame2", "fallback", "ready", "cancelled"])};
  }
  return {
    version: 1, cancelled: bool(v.cancelled), readyState: label(v.readyState, ["loading", "interactive", "complete", "unknown"]),
    visibility: label(v.visibility, ["visible", "hidden", "unknown"]), debug: bool(v.debug), startup: label(v.startup, ["loading", "ready", "error", "present", "detached"]),
    root: root && Object.fromEntries(Object.entries(root).map(([k, value]) => [k, bool(value)])),
    renderClock: {raf: count(clock.raf, 10000), timer: count(clock.timer, 10000), elapsedMs: count(clock.elapsedMs, 60000)},
    startupSnapshot,
    nativeWindow: Object.fromEntries(Object.entries(nativeWindow).map(([k, value]) => [k, value === null ? null : bool(value)])),
  };
}

// Native stdout may include third-party diagnostics. Never retain those lines.
// UTF-8 chunk boundaries and the bytes of even a newline-free line are bounded.
export class FrameDecoder {
  #decoder = new StringDecoder("utf8");
  #line = "";
  #bytes = 0;
  noiseBytes = 0;
  constructor(onFrame) { this.onFrame = onFrame; }
  push(chunk) {
    let offset = 0;
    for (;;) {
      const newline = chunk.indexOf(10, offset);
      const end = newline === -1 ? chunk.length : newline + 1;
      this.#bytes += end - offset;
      if (this.#bytes > MAX_REPLY) throw failure("STDOUT_LINE_TOO_LARGE");
      this.#line += this.#decoder.write(chunk.subarray(offset, end));
      if (newline === -1) return;
      const line = this.#line.trimEnd();
      if (line.startsWith(PREFIX)) {
        let frame;
        try { frame = JSON.parse(line.slice(PREFIX.length)); }
        catch { throw failure("INVALID_FRAME"); }
        if (!frame || typeof frame !== "object" || Array.isArray(frame)) throw failure("INVALID_FRAME");
        this.onFrame(frame);
      } else this.noiseBytes += this.#bytes;
      this.#line = "";
      this.#bytes = 0;
      offset = end;
      if (offset === chunk.length) return;
    }
  }
  end() {
    this.#line += this.#decoder.end();
    if (this.#line.startsWith(PREFIX)) throw failure("TRUNCATED_FRAME");
    this.noiseBytes += this.#bytes;
    this.#line = "";
    this.#bytes = 0;
  }
}

/** Exactly one owned native process. No stdout/stderr/arguments transcript. */
export class NativeApp extends EventEmitter {
  #nextId = 0;
  #tail = Promise.resolve();
  #pending;
  #helloResolve;
  #helloReject;
  #closedResolve;
  #fatal;
  #closing;
  constructor(binary, directory, { name = "native", commandArgs, env = {}, closeTimeoutMs = 15_000 } = {}) {
    super();
    this.name = name;
    this.directory = directory;
    this.closeTimeoutMs = closeTimeoutMs;
    this.lifecycle = { name, directory, stderrBytes: 0, commands: 0, forcedSignals: [] };
    this.hello = new Promise((resolve, reject) => { this.#helloResolve = resolve; this.#helloReject = reject; });
    // Construction may be followed by a failed sibling open; avoid an unhandled rejection.
    this.hello.catch(() => {});
    this.closed = new Promise((resolve) => { this.#closedResolve = resolve; });
    this.decoder = new FrameDecoder((frame) => this.#frame(frame));
    this.child = spawn(binary, commandArgs ?? ["--data-dir", directory], {
      env: { ...process.env, ...env, NOTES_SYNC_E2E: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.lifecycle.pid = this.child.pid;
    this.child.stdout.on("data", (chunk) => {
      try { this.decoder.push(chunk); } catch (error) { this.#fail(error); }
    });
    this.child.stderr.on("data", (chunk) => { this.lifecycle.stderrBytes += chunk.length; });
    this.child.stdin.on("error", () => this.#fail(failure("STDIN_ERROR")));
    this.child.on("error", () => this.#fail(failure("SPAWN_ERROR")));
    this.child.on("exit", (code, signal) => {
      this.lifecycle.exit = { code, signal };
      this.emit("nativeExit", this.lifecycle.exit);
    });
    this.child.on("close", (code, signal) => {
      this.lifecycle.close = { code, signal };
      try { this.decoder.end(); } catch (error) { this.#fail(error); }
      this.lifecycle.stdoutNoiseBytes = this.decoder.noiseBytes;
      this.#helloReject(failure("EXIT_BEFORE_HELLO"));
      if (this.#pending) this.#fail(failure("EXIT_BEFORE_RESPONSE"));
      this.#closedResolve(this.lifecycle);
    });
  }
  #fail(error) {
    this.#fatal ||= error;
    this.lifecycle.failureCode ||= error.code || "DRIVER_ERROR";
    this.#helloReject(error);
    this.#pending?.reject(error);
    this.#pending = undefined;
  }
  #frame(frame) {
    if (frame.type === "hello") {
      if (this.metadata || frame.protocol !== 1 || frame.pid !== this.child.pid || frame.window !== "main" || frame.transport !== "native-webview-eval-event")
        throw failure("INVALID_HELLO");
      this.metadata = frame;
      this.#helloResolve(frame);
      return;
    }
    if (!this.metadata || frame.type !== "response" || !this.#pending || frame.id !== this.#pending.id || typeof frame.ok !== "boolean")
      throw failure("UNEXPECTED_RESPONSE");
    if (frame.ok) {
      if (!Object.hasOwn(frame, "value") || Object.hasOwn(frame, "error")) throw failure("INVALID_RESPONSE");
      const pending = this.#pending;
      this.#pending = undefined;
      pending.resolve(frame.value);
    } else {
      if (!frame.error || !/^[A-Z_]{1,80}$/.test(frame.error.code || "") || Object.hasOwn(frame, "value")) throw failure("INVALID_RESPONSE");
      const error = failure(frame.error.code);
      if (["nativePageFinished", "documentProbe", "debugRegistration", "appIdle", "startupHandoff", "evalEntered", "evalNotObserved"].includes(frame.error.phase)) {
        error.phase = frame.error.phase;
        this.lifecycle.failurePhase = error.phase;
        if (JSON.stringify(frame.error.diagnostic ?? null).length <= 8192)
          this.lifecycle.nativeDiagnostic = frame.error.diagnostic ?? null;
      }
      if (frame.error.code === "NATIVE_TIMEOUT") this.#fail(error);
      else {
        const pending = this.#pending;
        this.#pending = undefined;
        pending.reject(error);
      }
    }
  }
  async ready(timeoutMs = 60_000) {
    try {
      await bounded(this.hello, timeoutMs, "HELLO_TIMEOUT");
      const ready = await this.request({ op: "ready" }, timeoutMs);
      if (ready?.version !== 1 || ready.native !== true || ready.window !== "main" || ready.interactive !== true || ready.startupDetached !== true)
        throw failure("NOT_NATIVE_DEBUG_APP");
      return ready;
    } catch (error) {
      // A legacy candidate can answer an unknown fixed action with id:null.
      // Keep strict framing failures fatal while retaining Ready's first error.
      this.lifecycle.readinessError = {
        code: /^[A-Z_]{1,80}$/.test(error.code || "") ? error.code : "DRIVER_ERROR",
        ...(error.phase ? { phase: error.phase } : {}),
      };
      // A JS TIMEOUT reply means that Ready's awaited operation has finished;
      // this is distinct from NATIVE_TIMEOUT, whose JS cannot be cancelled.
      // Capture only bounded, non-content diagnostics before failing closed.
      if (error.code === "TIMEOUT" && !this.#fatal && !this.lifecycle.exit) {
        try {
          this.lifecycle.readinessFailure = safeStartupDiagnostic(await this.request({ op: "startupDiagnostic" }, 3000));
        } catch { this.lifecycle.readinessFailure = { code: "DIAGNOSTIC_UNAVAILABLE" }; }
      }
      this.#fail(error);
      throw error;
    }
  }
  request(action, timeoutMs = 30_000) {
    if (this.#closing) return Promise.reject(failure("APP_CLOSING"));
    const task = this.#tail.then(async () => {
      if (this.#fatal) throw this.#fatal;
      if (this.lifecycle.exit) throw failure("APP_EXITED");
      const id = ++this.#nextId;
      const line = encodeRequest(id, action, timeoutMs);
      const response = new Promise((resolve, reject) => { this.#pending = { id, resolve, reject }; });
      this.lifecycle.commands++;
      this.lifecycle.lastAction = action.op === "execute" ? action.command : action.op;
      this.child.stdin.write(line, (error) => { if (error) this.#fail(failure("STDIN_ERROR")); });
      try { return await bounded(response, timeoutMs + 3000, "DRIVER_TIMEOUT"); }
      catch (error) {
        if (error.code === "DRIVER_TIMEOUT") this.#fail(error);
        throw error;
      }
    });
    this.#tail = task.catch(() => {});
    return task;
  }
  execute(command, args = {}, timeoutMs) { return this.request({ op: "execute", command, args }, timeoutMs); }
  state() { return this.request({ op: "state" }); }
  idle() { return this.request({ op: "idle" }); }
  evaluate(expression, arg = null, timeoutMs) { return this.request({ op: "eval", expression, arg }, timeoutMs); }
  snapshot(options = {}) { return this.request({ op: "snapshot", options }); }
  close({ eof = false } = {}) {
    this.#closing ||= this.#close(eof);
    return this.#closing;
  }
  async #close(eof) {
    let cleanupFailure = this.#fatal;
    if (!this.lifecycle.exit) {
      if (!cleanupFailure) {
        try {
          if (eof) { await this.#tail; this.child.stdin.end(); }
          // #close starts before #closing is assigned, so this shutdown enters
          // the same serial queue; subsequent public requests are refused.
          else { await this.request({ op: "shutdown" }); this.child.stdin.end(); }
        } catch (error) { cleanupFailure = error; this.child.stdin.end(); }
      } else this.child.stdin.end();
      try { await bounded(this.closed, this.closeTimeoutMs, "NATURAL_EXIT_TIMEOUT"); }
      catch (error) {
        cleanupFailure ||= error;
        // Exact owned ChildProcess only; never kill by process name or port.
        if (!this.lifecycle.exit) {
          this.lifecycle.forcedSignals.push("SIGTERM");
          this.child.kill("SIGTERM");
        }
        try { await bounded(this.closed, 3000, "TERM_EXIT_TIMEOUT"); }
        catch {
          if (!this.lifecycle.exit) {
            this.lifecycle.forcedSignals.push("SIGKILL");
            this.child.kill("SIGKILL");
          }
          await bounded(this.closed, 3000, "KILL_EXIT_TIMEOUT");
        }
      }
    }
    await bounded(this.closed, 3000, "PIPE_CLOSE_TIMEOUT");
    // stdout.end may discover a malformed tail after shutdown already replied.
    cleanupFailure ||= this.#fatal;
    if (this.lifecycle.exit?.code !== 0 || this.lifecycle.exit?.signal !== null || this.lifecycle.forcedSignals.length)
      cleanupFailure ||= failure("NON_NATURAL_EXIT");
    this.lifecycle.naturalExit = !cleanupFailure;
    if (cleanupFailure) throw cleanupFailure;
    return this.lifecycle;
  }
}
