import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const temporary = await mkdtemp(join(tmpdir(), "notes-recording-preview-"));
const checks = [];
const test = async (name, run) => {
  await run();
  checks.push(name);
};
const timers = new Map();
const originalTimeout = globalThis.setTimeout,
  originalClear = globalThis.clearTimeout;
globalThis.setTimeout = (callback, ms, ...args) => {
  if (ms !== 5000) return originalTimeout(callback, ms, ...args);
  const id = {};
  timers.set(id, () => callback(...args));
  return id;
};
globalThis.clearTimeout = (id) => {
  if (!timers.delete(id)) originalClear(id);
};
const flush = () => new Promise((done) => originalTimeout(done, 0));
try {
  for (const name of [
    "audio-playback",
    "recording-session",
    "recording-playback",
  ]) {
    let source = ts.transpileModule(await readFile(`src/${name}.ts`, "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    }).outputText;
    source = source
      .replaceAll('"./audio-playback"', '"./audio-playback.mjs"')
      .replaceAll('"./recording-session"', '"./recording-session.mjs"');
    await writeFile(join(temporary, `${name}.mjs`), source);
  }
  const { RecordingSession } = await import(
    pathToFileURL(join(temporary, "recording-session.mjs"))
  );
  const { createRecordingPlayback } = await import(
    pathToFileURL(join(temporary, "recording-playback.mjs"))
  );
  function capture() {
    const counts = { requests: 0, stops: 0, released: 0 },
      stopped = [],
      errors = [];
    const recorder = {
      state: "inactive",
      mimeType: "audio/webm;codecs=opus",
      start() {
        this.state = "recording";
      },
      pause() {
        this.state = "paused";
      },
      resume() {
        this.state = "recording";
      },
      requestData() {
        counts.requests++;
        if (this.requestError) throw Error("request failed");
      },
      stop() {
        counts.stops++;
        this.state = "inactive";
      },
    };
    const track = {
      readyState: "live",
      addEventListener() {},
      removeEventListener() {},
      stop() {
        counts.released++;
      },
    };
    const session = new RecordingSession(
      {
        onRecording() {},
        onStopped: (blob) => stopped.push(blob),
        onLevel() {},
        onError: (error) => errors.push(error),
      },
      {
        getStream: async () => ({ getTracks: () => [track] }),
        createRecorder: () => recorder,
        createContext: () => ({
          createAnalyser: () => ({ frequencyBinCount: 1, disconnect() {} }),
          createMediaStreamSource: () => ({ connect() {}, disconnect() {} }),
          close: async () => {},
        }),
        setInterval: () => 1,
        clearInterval() {},
      },
    );
    return {
      session,
      recorder,
      counts,
      stopped,
      errors,
      data: (text) =>
        recorder.ondataavailable?.({
          data: new Blob([text], { type: recorder.mimeType }),
        }),
      pauseEvent: () => recorder.onpause?.(),
    };
  }
  await test("actual pause event gates requestData; duplicate snapshot promise; cumulative bytes and MIME remain final exactly once", async () => {
    const f = capture();
    await f.session.start();
    f.data("before");
    f.session.pause();
    const candidate = f.session.snapshot();
    assert.equal(candidate, f.session.snapshot());
    assert.equal(f.counts.requests, 0);
    f.pauseEvent();
    assert.equal(f.counts.requests, 1);
    f.data("paused");
    const blob = await candidate;
    assert.equal(await blob.text(), "beforepaused");
    assert.equal(blob.type, f.recorder.mimeType);
    assert.equal(f.counts.stops, 0);
    assert.equal(f.counts.released, 0);
    assert.equal(f.stopped.length, 0);
    f.session.resume();
    f.data("resumed");
    f.session.stop();
    f.data("tail");
    f.recorder.onstop();
    assert.equal(f.stopped.length, 1);
    assert.equal(await f.stopped[0].text(), "beforepausedresumedtail");
    assert.deepEqual(f.errors, []);
    assert.equal(f.counts.stops, 1);
    assert.equal(f.counts.released, 1);
    f.session.dispose();
  });
  await test("old issued data slot drains before newer paused request; old rejection never resolves new promise", async () => {
    const f = capture();
    await f.session.start();
    f.session.pause();
    f.pauseEvent();
    const old = f.session.snapshot();
    const rejected = assert.rejects(old, /回放已结束/);
    f.session.resume();
    await rejected;
    f.session.pause();
    f.pauseEvent();
    const next = f.session.snapshot();
    let resolved = false;
    void next.then(() => {
      resolved = true;
    });
    assert.equal(f.counts.requests, 1);
    f.data("old");
    await flush();
    assert.equal(resolved, false);
    assert.equal(f.counts.requests, 2);
    f.data("new");
    assert.equal(await (await next).text(), "oldnew");
    f.session.dispose();
  });
  for (const kind of ["empty", "throw", "timeout"])
    await test(`${kind} snapshot fails alone and capture can resume/finalize`, async () => {
      const f = capture();
      await f.session.start();
      f.session.pause();
      f.pauseEvent();
      f.recorder.requestError = kind === "throw";
      const promise = f.session.snapshot();
      const rejected = assert.rejects(promise);
      if (kind === "empty") f.data("");
      if (kind === "timeout") [...timers.values()].forEach((fn) => fn());
      await rejected;
      assert.deepEqual(f.errors, []);
      assert.equal(f.counts.stops, 0);
      f.session.resume();
      f.data("valid");
      f.session.stop();
      f.data("tail");
      f.recorder.onstop();
      assert.equal(await f.stopped[0].text(), "validtail");
      f.session.dispose();
    });
  for (const action of ["stop", "dispose", "error"])
    await test(`${action} seals pending snapshot, releases once and rejects late captured events`, async () => {
      const f = capture();
      await f.session.start();
      f.session.pause();
      f.pauseEvent();
      const pending = f.session.snapshot();
      const rejected = assert.rejects(pending);
      const data = f.recorder.ondataavailable,
        stop = f.recorder.onstop;
      if (action === "error")
        f.recorder.onerror({ error: Error("capture failed") });
      else f.session[action]();
      await rejected;
      data({ data: new Blob(["tail"]) });
      stop();
      assert.equal(f.stopped.length, action === "stop" ? 1 : 0);
      assert.equal(f.counts.released, 1);
      if (action === "stop") assert.equal(await f.stopped[0].text(), "tail");
      f.session.dispose();
    });
  await test("snapshot outside pause rejects without stopping capture", async () => {
    const f = capture();
    await f.session.start();
    await assert.rejects(f.session.snapshot(), /暂停/);
    assert.equal(f.counts.stops, 0);
    f.session.dispose();
  });
  assert.equal(timers.size, 0, "no remaining snapshot deadlines");

  class Media extends EventTarget {
    duration = NaN;
    readyState = 0;
    paused = true;
    src = "";
    error = null;
    seeking = false;
    position = 0;
    plays = 0;
    range = [];
    requested = [];
    get seekable() {
      const r = this.range;
      return { length: r.length, start: (i) => r[i][0], end: (i) => r[i][1] };
    }
    get currentTime() {
      return this.position;
    }
    set currentTime(value) {
      if (this.seekFails) throw Error("seek failed");
      this.requested.push(value);
      this.seeking = true;
    }
    emit(type) {
      this.dispatchEvent(new Event(type));
    }
    load() {
      this.error = null;
      this.readyState = 0;
      this.duration = NaN;
      this.range = [];
    }
    removeAttribute(name) {
      if (name === "src") this.src = "";
    }
    pause() {
      this.paused = true;
      this.emit("pause");
    }
    play() {
      this.plays++;
      if (this.playResult) return this.playResult();
      this.paused = false;
      this.emit("play");
      return Promise.resolve();
    }
    ready(duration = 45, range = [[0, 45]]) {
      this.duration = duration;
      this.range = range;
      this.readyState = 2;
      this.emit("loadedmetadata");
      this.emit("canplay");
    }
    confirm(time) {
      this.position = time;
      this.seeking = false;
      this.emit("seeked");
    }
  }
  function playback(options = {}) {
    const audio = new Media(),
      probes = [],
      states = [],
      cleanup = [];
    const player = createRecordingPlayback(
      audio,
      new Blob(["actual-boundary-test"]),
      (state) => states.push(state),
      {
        urls: {
          createObjectURL: () => "blob:fixture",
          revokeObjectURL: () => {
            assert.equal(audio.src, "");
            assert.ok(probes.every((p) => p.src === ""));
            cleanup.push("revoked");
          },
        },
        createAudio: () => {
          const probe = new Media();
          probes.push(probe);
          return probe;
        },
        seekTimeoutMs: 10,
        ...options,
      },
    );
    return {
      audio,
      player,
      probes,
      states,
      cleanup,
      get state() {
        return states.at(-1);
      },
    };
  }
  await test("actual ready state and seekable ranges gate controls, independent of finite duration", async () => {
    const f = playback();
    f.audio.duration = 45;
    f.audio.readyState = 1;
    f.audio.emit("loadedmetadata");
    assert.equal(f.state.ready, false);
    assert.equal(f.state.canSeek, false);
    f.player.toggle();
    assert.equal(f.audio.plays, 0);
    f.audio.ready(45, []);
    assert.equal(f.state.ready, true);
    assert.equal(f.state.canSeek, false);
    f.player.skip(15);
    assert.equal(f.audio.requested.length, 0);
    f.player.dispose();
  });
  await test("skip suppresses optimistic time, clamps real ranges, confirms only actual seeked/currentTime", async () => {
    const f = playback();
    f.audio.ready(45, [
      [5, 20],
      [30, 40],
    ]);
    f.audio.position = 12;
    f.audio.emit("timeupdate");
    f.player.skip(15);
    assert.equal(f.audio.requested.at(-1), 30);
    assert.equal(f.state.time, 12);
    assert.equal(f.state.seeking, true);
    f.audio.position = 30;
    f.audio.emit("timeupdate");
    assert.equal(f.state.time, 12);
    f.audio.confirm(30);
    assert.equal(f.state.time, 30);
    assert.match(f.state.seekMessage, /0:30/);
    assert.equal(f.state.canSeek, true);
    f.player.skip(15);
    assert.equal(f.audio.requested.at(-1), 40);
    f.audio.confirm(40);
    f.player.skip(-99);
    assert.equal(f.audio.requested.at(-1), 5);
    f.audio.confirm(5);
    f.player.dispose();
  });
  await test("mismatched seek and missing confirmation show explicit errors without invented success", async () => {
    const f = playback();
    f.audio.ready();
    f.player.skip(15);
    f.audio.confirm(3);
    assert.match(f.state.seekError, /未确认/);
    assert.equal(f.state.time, 3);
    assert.equal(f.state.seekMessage, "");
    f.player.skip(15);
    await new Promise((done) => originalTimeout(done, 20));
    assert.match(f.state.seekError, /未确认/);
    assert.equal(f.state.seekMessage, "");
    f.player.dispose();
  });
  await test("media/play errors remain explicit; retry reloads same source without capture dependency", async () => {
    const f = playback();
    f.audio.ready();
    f.audio.playResult = () => Promise.reject(Error("blocked"));
    f.player.toggle();
    await flush();
    assert.match(f.state.playError, /无法播放/);
    f.audio.error = { code: 4 };
    f.audio.emit("error");
    assert.match(f.state.mediaError, /无法播放此录音格式/);
    assert.equal(f.state.ready, false);
    f.player.retry();
    assert.equal(f.audio.src, "blob:fixture");
    f.player.dispose();
  });
  await test("media-error retry closes old readiness before error clears and waits fresh decoded media", async () => {
    const f = playback();
    f.audio.ready();
    assert.equal(f.state.ready, true);
    f.audio.error = { code: 4 };
    f.audio.readyState = 0;
    f.audio.emit("error");
    f.player.retry();
    assert.equal(f.audio.readyState, 0);
    assert.equal(f.state.ready, false);
    assert.equal(f.state.canSeek, false);
    const plays = f.audio.plays;
    f.player.toggle();
    assert.equal(f.audio.plays, plays);
    f.audio.duration = 45;
    f.audio.readyState = 1;
    f.audio.emit("loadedmetadata");
    assert.equal(f.state.ready, false);
    f.audio.ready();
    assert.equal(f.state.ready, true);
    assert.equal(f.state.canSeek, true);
    f.player.toggle();
    assert.equal(f.audio.plays, plays + 1);
    f.player.dispose();
  });
  await test("dispose seals late play/seek/metadata and stops production probe before URL revoke exactly once", async () => {
    const f = playback();
    f.audio.ready(Infinity);
    assert.equal(f.probes.length, 1);
    let resolvePlay;
    f.audio.playResult = () =>
      new Promise((resolve) => {
        resolvePlay = resolve;
      });
    f.player.toggle();
    f.player.dispose();
    const count = f.states.length;
    resolvePlay();
    f.audio.emit("play");
    f.audio.ready(90);
    f.probes[0].emit("loadedmetadata");
    await flush();
    assert.equal(f.states.length, count);
    assert.deepEqual(f.cleanup, ["revoked"]);
    assert.equal(f.audio.src, "");
    f.player.dispose();
    assert.equal(f.cleanup.length, 1);
  });
  await test("synchronous media load error still releases URL/source and listeners", async () => {
    const audio = new Media();
    audio.load = () => {
      throw Error("load failed");
    };
    let revoked = 0;
    assert.throws(
      () =>
        createRecordingPlayback(audio, new Blob(["bytes"]), () => {}, {
          urls: {
            createObjectURL: () => "blob:failure",
            revokeObjectURL: () => {
              revoked++;
              assert.equal(audio.src, "");
            },
          },
        }),
      /load failed/,
    );
    assert.equal(revoked, 1);
  });
  await test("absolute seek coalesces a drag to the final requested position and publishes only observed time", async () => {
    const f = playback();
    f.audio.ready(45, [[0, 45]]);
    f.player.seek(9);
    f.player.seek(17);
    f.player.seek(24);
    assert.equal(f.state.time, 0);
    assert.deepEqual(f.audio.requested, [9]);
    f.audio.confirm(9);
    assert.deepEqual(f.audio.requested, [9, 24]);
    assert.equal(f.state.time, 9);
    f.audio.confirm(24);
    assert.equal(f.state.time, 24);
    assert.equal(f.state.seeking, false);
    f.player.seek(99);
    f.audio.confirm(45);
    assert.equal(f.state.time, 45);
    f.player.seek(-99);
    f.audio.confirm(0);
    assert.equal(f.state.time, 0);
    f.player.dispose();
  });
  await test("actual ended retains end time; replay waits confirmed start before issuing play", async () => {
    const f = playback();
    f.audio.ready();
    f.player.toggle();
    f.audio.position = 45;
    f.audio.paused = true;
    f.audio.emit("ended");
    assert.equal(f.state.ended, true);
    assert.equal(f.state.time, 45);
    const plays = f.audio.plays;
    f.player.toggle();
    assert.equal(f.state.playPending, true);
    assert.equal(f.audio.plays, plays);
    assert.equal(f.audio.requested.at(-1), 0);
    assert.equal(f.state.time, 45);
    f.audio.confirm(0);
    assert.equal(f.audio.plays, plays + 1);
    assert.equal(f.state.time, 0);
    assert.equal(f.state.ended, false);
    assert.equal(f.state.playPending, false);
    f.player.dispose();
  });
  await test("pending play admission stays busy until actual play or failure", async () => {
    const f = playback();
    f.audio.ready();
    let reject;
    f.audio.playResult = () =>
      new Promise((_, no) => {
        reject = no;
      });
    f.player.toggle();
    f.player.toggle();
    assert.equal(f.audio.plays, 1);
    assert.equal(f.state.playPending, true);
    reject(Error("blocked"));
    await flush();
    assert.equal(f.state.playPending, false);
    assert.match(f.state.playError, /无法播放/);
    f.player.dispose();
  });
  console.log(
    JSON.stringify(
      {
        status: "pass",
        checks: checks.length,
        results: checks,
        limits: [
          "Production Session, recording adapter and unchanged production playback controller; controlled platform events, chunks, timers and media only",
          "No claim of encoded prefix playability, device audibility, mobile/native acceptance or pixel parity",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  globalThis.setTimeout = originalTimeout;
  globalThis.clearTimeout = originalClear;
  await rm(temporary, { recursive: true, force: true });
}
