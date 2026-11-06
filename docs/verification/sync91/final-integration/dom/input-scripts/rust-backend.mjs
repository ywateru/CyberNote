import { access } from "node:fs/promises";
import { spawn } from "node:child_process";

// One owned process, strict line protocol, no Fake fallback. close() resolves
// only after the child exit, so callers may safely reopen/delete its directory.
export async function rustBackend(
  binary,
  directory,
  {
    timeoutMs = 10000,
    closeTimeoutMs = 2000,
    maxLineBytes = 20 * 1024 * 1024,
    onEvents,
    windowLabel = "main",
    recordPolls = true,
  } = {},
) {
  if (onEvents !== undefined && typeof onEvents !== "function")
    throw Error("Invalid Rust event handler");
  if (typeof windowLabel !== "string" || !windowLabel)
    throw Error("Invalid Rust window label");
  await access(binary);
  const child = spawn(binary, [directory], { stdio: ["pipe", "pipe", "pipe"] });
  let nextId = 0,
    buffer = Buffer.alloc(0),
    stderr = "",
    failure = null,
    closing = false,
    exitInfo = null,
    closePromise;
  const pending = new Map(),
    calls = [];
  const exited = new Promise((resolve) =>
    child.once("close", (code, signal) => {
      exitInfo = { code, signal };
      rejectPending(
        Error(`Rust transport exited ${code}/${signal}: ${stderr}`),
      );
      resolve(exitInfo);
    }),
  );
  const rejectPending = (error) => {
    for (const slot of pending.values()) {
      clearTimeout(slot.timer);
      slot.reject(error);
    }
    pending.clear();
  };
  const fail = (error) => {
    failure ||= error;
    rejectPending(failure);
    if (!closing && !exitInfo) child.kill("SIGTERM");
  };
  child.stderr.on("data", (bytes) => {
    stderr = (stderr + bytes.toString()).slice(-4000);
  });
  child.stdin.on("error", (error) =>
    fail(Error("Rust transport stdin: " + error.message)),
  );
  child.on("error", (error) =>
    fail(Error("Rust transport spawn: " + error.message)),
  );
  child.stdout.on("data", (bytes) => {
    if (failure) return;
    buffer = Buffer.concat([buffer, bytes]);
    while (true) {
      const end = buffer.indexOf(10);
      if (end < 0) {
        if (buffer.length > maxLineBytes)
          fail(Error("Rust transport oversized response"));
        return;
      }
      if (end > maxLineBytes) {
        fail(Error("Rust transport oversized response"));
        return;
      }
      const line = buffer.subarray(0, end).toString();
      buffer = buffer.subarray(end + 1);
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        fail(Error("Rust transport malformed JSON"));
        return;
      }
      if (
        !row ||
        typeof row !== "object" ||
        !Number.isSafeInteger(row.requestId) ||
        typeof row.ok !== "boolean" ||
        !Array.isArray(row.events) ||
        (!row.ok && (!row.error || typeof row.error.message !== "string"))
      ) {
        fail(Error("Rust transport invalid response"));
        return;
      }
      const slot = pending.get(row.requestId);
      if (!slot) {
        fail(
          Error(
            "Rust transport unknown or duplicate requestId " + row.requestId,
          ),
        );
        return;
      }
      pending.delete(row.requestId);
      clearTimeout(slot.timer);
      Object.assign(slot.call, {
        ok: row.ok,
        status: row.value?.status,
        error: row.error?.code,
      });
      // The sink owns events from every response exactly once. Never await it
      // here: a probe handler sends a concurrent reply through this transport.
      if (onEvents && row.events.length) {
        try {
          Promise.resolve(onEvents(row.events)).catch(fail);
        } catch (error) {
          slot.reject(error);
          fail(error);
          return;
        }
        row.events = [];
      }
      slot.resolve(row);
    }
  });
  child.stdout.on("end", () => {
    if (buffer.length) fail(Error("Rust transport incomplete response"));
    if (pending.size) fail(Error("Rust transport EOF with pending requests"));
  });
  try {
    await new Promise((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
  } catch (error) {
    await exited;
    throw error;
  }
  return {
    kind: "external-real-rust-session-store-transport",
    pid: child.pid,
    calls,
    get lifecycle() {
      return {
        pid: child.pid,
        closing,
        exit: exitInfo,
        failure: failure?.message,
        pending: pending.size,
      };
    },
    call(command, args = {}) {
      if (failure || closing || exitInfo)
        return Promise.reject(failure || Error("Rust transport is closed"));
      return new Promise((resolve, reject) => {
        const requestId = ++nextId;
        const call = {
          requestId,
          command,
          type: args.action?.type || args.command?.type,
          phase: args.reply?.phase,
          ready: args.reply?.ready,
          protectedNoteIds: args.reply?.protectedNoteIds,
          revision: args.revision,
          finalIntent: args.finalIntent,
          noteId: args.noteId,
          operationId: args.operationId,
        };
        if (recordPolls || command !== "poll_events") calls.push(call);
        if (calls.length > 1000) calls.shift();
        const timer = setTimeout(
          () => fail(Error("Rust transport timeout for " + command)),
          timeoutMs,
        );
        pending.set(requestId, { resolve, reject, timer, call });
        child.stdin.write(
          JSON.stringify({ requestId, command, args, window: windowLabel }) +
            "\n",
          (error) => {
            if (error) fail(error);
          },
        );
      });
    },
    close() {
      return (closePromise ||= (async () => {
        closing = true;
        rejectPending(Error("Rust transport closing"));
        if (!exitInfo) child.stdin.end();
        let forced = false;
        const timer = setTimeout(() => {
          forced = true;
          child.kill("SIGTERM");
        }, closeTimeoutMs);
        const kill = setTimeout(
          () => child.kill("SIGKILL"),
          closeTimeoutMs + 1000,
        );
        let info;
        try {
          info = await exited;
        } finally {
          clearTimeout(timer);
          clearTimeout(kill);
        }
        if (failure || forced || info.code !== 0)
          throw (
            failure ||
            Error(
              "Rust transport required termination: " + JSON.stringify(info),
            )
          );
        return info;
      })());
    },
    configure() {
      throw Error("Fault controls unavailable for external transport");
    },
  };
}

// Opt-in concurrent polling for a real WindowHost. Events still pass through
// rustBackend's single sink, including events returned by non-poll requests.
export function pollRustEvents(backend, { intervalMs = 30 } = {}) {
  if (!Number.isInteger(intervalMs) || intervalMs < 5 || intervalMs > 1000)
    throw Error("Invalid bounded event poll interval");
  let stopped = false,
    failure,
    timer,
    wake,
    polls = 0;
  const task = (async () => {
    while (!stopped) {
      const response = await backend.call("poll_events");
      if (!response.ok)
        throw Object.assign(Error(response.error.message), response.error);
      if (response.events.length)
        throw Error("Polling requires one configured event sink");
      polls++;
      if (!stopped)
        await new Promise((resolve) => {
          wake = resolve;
          timer = setTimeout(resolve, intervalMs);
        });
    }
  })().catch((error) => {
    failure = error;
  });
  return {
    get state() {
      return { polls, stopped, failure: failure?.message };
    },
    async stop() {
      stopped = true;
      clearTimeout(timer);
      wake?.();
      await task;
      if (failure) throw failure;
    },
  };
}
