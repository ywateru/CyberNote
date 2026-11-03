import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile("src/recording-session.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const { RecordingSession, createRecordingPreview } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
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

// Fakes are only platform boundaries. All lifecycle, event admission and cleanup
// decisions below execute the same RecordingSession used by RecordingPanel.
function fixture(failure) {
  const events = [],
    timers = new Map(),
    counts = {};
  const call = (name) => {
    counts[name] = (counts[name] || 0) + 1;
    if (failure === name) throw Error(`injected ${name}`);
  };
  class Track extends EventTarget {
    readyState = "live";
    stop() {
      call(this.name);
      this.readyState = "ended";
    }
    constructor(name) {
      super();
      this.name = name;
    }
  }
  const tracks = [new Track("track1.stop"), new Track("track2.stop")];
  const stream = { getTracks: () => tracks };
  const recorder = {
    state: "inactive",
    mimeType: "audio/webm;codecs=opus",
    start(timeslice) {
      call("recorder.start");
      assert.equal(timeslice, 250);
      this.state = "recording";
    },
    pause() {
      call("recorder.pause");
      this.state = "paused";
    },
    resume() {
      call("recorder.resume");
      this.state = "recording";
    },
    stop() {
      call("recorder.stop");
      this.state = "inactive";
    },
  };
  const analyser = {
    frequencyBinCount: 32,
    fftSize: 0,
    disconnect() {
      call("analyser.disconnect");
    },
    getByteFrequencyData(data) {
      call("analyser.read");
      data.fill(40);
    },
  };
  const audioSource = {
    connect(target) {
      call("source.connect");
      assert.equal(target, analyser);
    },
    disconnect() {
      call("source.disconnect");
    },
  };
  const context = {
    createAnalyser() {
      call("context.analyser");
      return analyser;
    },
    createMediaStreamSource(target) {
      call("context.source");
      assert.equal(target, stream);
      return audioSource;
    },
    close() {
      call("context.close");
      return Promise.resolve();
    },
  };
  const environment = {
    async getStream() {
      call("getStream");
      return stream;
    },
    createRecorder(target) {
      call("createRecorder");
      assert.equal(target, stream);
      return recorder;
    },
    createContext() {
      call("createContext");
      return context;
    },
    setInterval(callback, delay) {
      call("setInterval");
      assert.equal(delay, 100);
      timers.set(1, callback);
      return 1;
    },
    clearInterval(timer) {
      call("clearInterval");
      timers.delete(timer);
    },
  };
  const callbacks = {
    onRecording: () => events.push(["recording"]),
    onStopped: (blob) => events.push(["stopped", blob]),
    onLevel: (level) => events.push(["level", level]),
    onError: (error) => events.push(["error", error]),
  };
  const session = new RecordingSession(callbacks, environment);
  return {
    session,
    events,
    counts,
    tracks,
    recorder,
    context,
    environment,
    callbacks,
    stream,
    timers,
  };
}
const errors = (f) => f.events.filter(([kind]) => kind === "error");
const assertReleased = (f) => {
  assert.equal(f.counts["track1.stop"], 1);
  assert.equal(f.counts["track2.stop"], 1);
  assert.equal(f.timers.size, 0);
  assert.equal(f.recorder.onstop, null);
  assert.equal(f.recorder.ondataavailable, null);
  assert.equal(f.recorder.onerror, null);
};

for (const failure of [
  "createRecorder",
  "recorder.start",
  "createContext",
  "context.analyser",
  "context.source",
  "source.connect",
  "setInterval",
]) {
  await test(`preparation ${failure} releases every acquired capture resource immediately`, async () => {
    const f = fixture(failure);
    await f.session.start();
    assert.equal(errors(f).length, 1);
    assert.match(errors(f)[0][1].message, /injected/);
    assert.equal(f.counts["track1.stop"], 1);
    assert.equal(f.counts["track2.stop"], 1);
    assert.equal(f.timers.size, 0);
    if (
      [
        "context.analyser",
        "context.source",
        "source.connect",
        "setInterval",
      ].includes(failure)
    )
      assert.equal(f.counts["context.close"], 1);
    if (
      [
        "createContext",
        "context.analyser",
        "context.source",
        "source.connect",
        "setInterval",
      ].includes(failure)
    )
      assert.equal(f.counts["recorder.stop"], 1);
    f.session.dispose();
    f.session.dispose();
    assert.equal(f.counts["track1.stop"], 1);
    assert.equal(f.counts["track2.stop"], 1);
  });
}
await test("permission denial reports once without creating capture resources", async () => {
  const f = fixture("getStream");
  await f.session.start();
  assert.equal(errors(f).length, 1);
  assert.equal(f.counts.createRecorder, undefined);
  f.session.dispose();
});
for (const outcome of ["resolve", "reject"]) {
  await test(`permission ${outcome} after disposal has no callbacks or recorder`, async () => {
    const f = fixture(),
      permission = deferred();
    f.environment.getStream = () => permission.promise;
    const start = f.session.start();
    f.session.dispose();
    f.session.dispose();
    if (outcome === "resolve") permission.resolve(f.stream);
    else permission.reject(Error("late permission failure"));
    await start;
    assert.deepEqual(f.events, []);
    assert.equal(f.counts.createRecorder, undefined);
    assert.equal(
      f.counts["track1.stop"],
      outcome === "resolve" ? 1 : undefined,
    );
    assert.equal(
      f.counts["track2.stop"],
      outcome === "resolve" ? 1 : undefined,
    );
  });
}
await test("auto-start, real analyser samples and pause/resume remain; explicit stop waits for final data", async () => {
  const f = fixture();
  await f.session.start();
  await f.session.start();
  assert.equal(f.counts.getStream, 1);
  assert.equal(f.recorder.state, "recording");
  f.timers.get(1)();
  assert.deepEqual(f.events.at(-1), ["level", 40]);
  assert.equal(f.session.pause(), true);
  f.timers.get(1)();
  assert.equal(f.events.filter(([k]) => k === "level").length, 1);
  assert.equal(f.session.resume(), true);
  const ondata = f.recorder.ondataavailable,
    onstop = f.recorder.onstop;
  ondata({ data: new Blob(["first"]) });
  f.session.stop();
  f.session.stop();
  assert.equal(f.counts["recorder.stop"], 1);
  assert.equal(f.counts["context.close"], 1);
  assert.equal(f.events.filter(([k]) => k === "stopped").length, 0);
  ondata({ data: new Blob(["final"]) });
  onstop();
  const blob = f.events.find(([k]) => k === "stopped")[1];
  assert.equal(await blob.text(), "firstfinal");
  assert.equal(blob.type, f.recorder.mimeType);
  ondata({ data: new Blob(["late"]) });
  onstop();
  assert.equal(f.events.filter(([k]) => k === "stopped").length, 1);
  f.session.dispose();
  assertReleased(f);
});
for (const trigger of [
  "dispose",
  "recorderError",
  "trackEnded",
  "analyserError",
]) {
  await test(`${trigger} releases once; captured late data/stop/error/ended/timer cannot revive session`, async () => {
    const f = fixture(
      trigger === "analyserError" ? "analyser.read" : undefined,
    );
    await f.session.start();
    const ondata = f.recorder.ondataavailable,
      onstop = f.recorder.onstop,
      onerror = f.recorder.onerror,
      tick = f.timers.get(1);
    ondata({ data: new Blob(["discarded"]) });
    if (trigger === "dispose") f.session.dispose();
    else if (trigger === "recorderError")
      onerror({ error: Error("recorder failed") });
    else if (trigger === "trackEnded")
      f.tracks[0].dispatchEvent(new Event("ended"));
    else tick();
    const snapshot = [...f.events];
    ondata({ data: new Blob(["late"]) });
    onstop();
    onerror({ error: Error("late error") });
    f.tracks[1].dispatchEvent(new Event("ended"));
    tick();
    f.session.stop();
    f.session.dispose();
    f.session.dispose();
    assert.deepEqual(f.events, snapshot);
    assert.equal(errors(f).length, trigger === "dispose" ? 0 : 1);
    assertReleased(f);
    assert.equal(f.counts["context.close"], 1);
    assert.equal(f.counts["recorder.stop"], 1);
  });
}
await test("stopping tracks does not turn normal completion into an interruption", async () => {
  const f = fixture();
  await f.session.start();
  const originalStop = f.tracks[0].stop.bind(f.tracks[0]);
  f.tracks[0].stop = () => {
    originalStop();
    f.tracks[0].dispatchEvent(new Event("ended"));
  };
  f.session.stop();
  f.recorder.onstop();
  assert.equal(errors(f).length, 0);
  assert.equal(f.events.at(-1)[0], "stopped");
  f.session.dispose();
});
await test("one track stop failure still releases the other track, timer, nodes and context", async () => {
  const f = fixture("track1.stop");
  await f.session.start();
  f.recorder.onerror({ error: Error("capture failure") });
  assert.equal(f.counts["track1.stop"], 1);
  assert.equal(f.counts["track2.stop"], 1);
  assert.equal(f.counts["context.close"], 1);
  assert.equal(f.timers.size, 0);
  assert.equal(errors(f).length, 1);
  assert(errors(f)[0][1] instanceof AggregateError);
  f.session.dispose();
});
for (const operation of ["pause", "resume"]) {
  await test(`${operation} exception reports failure and releases capture`, async () => {
    const f = fixture(`recorder.${operation}`);
    await f.session.start();
    assert.equal(f.session[operation](), false);
    assert.equal(errors(f).length, 1);
    assertReleased(f);
    f.session.dispose();
  });
}
await test("old permission session cannot stop or publish into the next session", async () => {
  const old = fixture(),
    permission = deferred();
  old.environment.getStream = () => permission.promise;
  const start = old.session.start();
  old.session.dispose();
  const next = fixture();
  await next.session.start();
  permission.resolve(old.stream);
  await start;
  assert.deepEqual(old.events, []);
  assert.equal(next.recorder.state, "recording");
  assert.equal(next.counts["track1.stop"], undefined);
  next.session.dispose();
});
await test("preview creates one URL and revokes that same URL once", () => {
  const calls = [],
    blob = new Blob(["preview"]);
  const preview = createRecordingPreview(blob, {
    createObjectURL(value) {
      assert.equal(value, blob);
      calls.push("create");
      return "blob:owned";
    },
    revokeObjectURL(url) {
      calls.push(url);
    },
  });
  assert.equal(preview.url, "blob:owned");
  assert.deepEqual(calls, ["create"]);
  preview.dispose();
  preview.dispose();
  assert.deepEqual(calls, ["create", "blob:owned"]);
});

await test("partially started recorder throwing still stops recorder and every track", async () => {
  const f = fixture();
  f.recorder.start = () => {
    f.recorder.state = "recording";
    throw Error("start failed after acquisition");
  };
  await f.session.start();
  assert.equal(errors(f).length, 1);
  assert.equal(f.counts["recorder.stop"], 1);
  assertReleased(f);
  f.session.dispose();
});
await test("synchronous recorder error during start prevents later context acquisition", async () => {
  const f = fixture();
  f.recorder.start = () => {
    f.recorder.state = "recording";
    f.recorder.onerror({ error: Error("start event failure") });
  };
  await f.session.start();
  assert.equal(errors(f).length, 1);
  assert.equal(f.counts.createContext, undefined);
  assert.equal(f.events.filter(([kind]) => kind === "recording").length, 0);
  assertReleased(f);
  f.session.dispose();
});
await test("async context close rejection after disposal is handled without late UI errors", async () => {
  const f = fixture(),
    close = deferred();
  f.context.close = () => close.promise;
  await f.session.start();
  f.session.dispose();
  const snapshot = [...f.events];
  close.reject(Error("late context close failure"));
  await Promise.resolve();
  assert.deepEqual(f.events, snapshot);
  assertReleased(f);
});
for (const supported of ["audio/mp4", undefined]) {
  await test(`production browser bindings retain audio-only permission and ${supported || "default"} MIME selection`, async () => {
    const f = fixture();
    const originals = new Map();
    const globals = {
      navigator: {
        mediaDevices: {
          async getUserMedia(constraints) {
            assert.deepEqual(constraints, { audio: true });
            return f.stream;
          },
        },
      },
      MediaRecorder: class {
        static isTypeSupported(type) {
          return type === supported;
        }
        constructor(stream, options) {
          assert.equal(stream, f.stream);
          assert.deepEqual(
            options,
            supported ? { mimeType: supported } : undefined,
          );
          return f.recorder;
        }
      },
      AudioContext: class {
        constructor() {
          return f.context;
        }
      },
      window: {
        setInterval: f.environment.setInterval,
        clearInterval: f.environment.clearInterval,
      },
    };
    try {
      for (const [name, value] of Object.entries(globals)) {
        originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
        Object.defineProperty(globalThis, name, { configurable: true, value });
      }
      const session = new RecordingSession(f.callbacks);
      await session.start();
      assert.equal(f.recorder.state, "recording");
      assert.equal(errors(f).length, 0);
      session.dispose();
      assertReleased(f);
    } finally {
      for (const [name, descriptor] of originals)
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
    }
  });
}

console.log(
  JSON.stringify(
    {
      kind: "production-recording-session-failure-injection",
      status: "pass",
      checks: results.length,
      results,
      limits:
        "Fake platform boundaries; no microphone/device/encoding/playback acceptance.",
    },
    null,
    2,
  ),
);
