import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const temporary = await mkdtemp(join(tmpdir(), "notes-audio-check-"));
try {
  const modulePath = join(temporary, "audio-playback.mjs");
  await writeFile(
    modulePath,
    ts.transpileModule(await readFile("src/audio-playback.ts", "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    }).outputText,
  );
  const { createAudioPlayback, probeAudioDuration, formatAudioTime } =
    await import(pathToFileURL(modulePath));
  class Media extends EventTarget {
    duration = NaN;
    readyState = 0;
    paused = true;
    src = "";
    error = null;
    seeks = [];
    plays = 0;
    loads = 0;
    removed = false;
    set currentTime(value) {
      if (this.seekFails) throw new Error("seek failed");
      this.position = value;
      this.seeks?.push(value);
    }
    get currentTime() {
      return this.position ?? 0;
    }
    emit(name) {
      this.dispatchEvent(new Event(name));
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
    removeAttribute(name) {
      if (name === "src") {
        this.src = "";
        this.removed = true;
      }
    }
    load() {
      this.loads++;
      this.error = null;
    }
    metadata(duration) {
      this.duration = duration;
      this.readyState = 1;
      this.emit("loadedmetadata");
    }
  }
  const createMedia = () => new Media();
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const checks = [];
  const setup = (options = {}) => {
    const audio = createMedia();
    const probes = [];
    const states = [];
    const player = createAudioPlayback(
      audio,
      "data:audio/webm;base64,fixture",
      (state) => states.push(state),
      {
        createAudio: () => {
          const probe = createMedia();
          probes.push(probe);
          return probe;
        },
        ...options,
      },
    );
    return {
      audio,
      probes,
      states,
      player,
      get state() {
        return states.at(-1);
      },
    };
  };
  {
    const p = setup();
    assert.equal(p.state.duration, null);
    assert.equal(formatAudioTime(null), "时长未知");
    p.audio.metadata(0);
    assert.equal(formatAudioTime(p.state.duration), "0:00");
    p.audio.metadata(90.5);
    assert.equal(formatAudioTime(p.state.duration), "1:30");
    assert.equal(p.probes.length, 0, "finite metadata creates no probe");
    p.player.seek(90);
    p.player.skip(15);
    assert.equal(p.audio.currentTime, 90.5);
    p.player.skip(-1000);
    assert.equal(p.audio.currentTime, 0);
    p.player.seek(Infinity);
    assert.equal(p.audio.currentTime, 0);
    p.player.dispose();
    checks.push("finite metadata / real zero / unknown / bounded seek");
  }
  {
    const p = setup();
    p.audio.metadata(Infinity);
    assert.equal(p.probes.length, 1);
    const probe = p.probes[0];
    assert.equal(probe.muted, true);
    probe.metadata(Infinity);
    probe.emit("loadedmetadata");
    assert.equal(probe.seeks.length, 1, "single finite probe seek");
    assert.ok(Number.isFinite(probe.seeks[0]));
    // While the independent probe works, the actual player can move and play.
    p.audio.currentTime = 23;
    p.audio.emit("timeupdate");
    p.player.toggle();
    probe.duration = 66.004;
    probe.emit("durationchange");
    assert.equal(p.state.duration, 66.004);
    assert.equal(p.state.time, 23);
    assert.equal(p.audio.currentTime, 23);
    assert.equal(p.audio.paused, false);
    assert.equal(probe.plays, 0);
    assert.equal(probe.removed, true);
    p.player.seek(37);
    assert.equal(p.audio.currentTime, 37);
    p.player.skip(100);
    assert.equal(p.audio.currentTime, 66.004);
    p.player.dispose();
    checks.push(
      "Infinity → finite / one silent probe / intervening user position and play preserved",
    );
  }
  {
    const p = setup();
    p.audio.metadata(Infinity);
    const old = p.probes[0];
    old.metadata(Infinity);
    p.audio.duration = 42;
    p.audio.emit("durationchange");
    assert.equal(old.removed, true);
    old.duration = 99;
    old.emit("durationchange");
    assert.equal(p.state.duration, 42);
    p.player.dispose();
    checks.push("normal finite duration supersedes probe / late probe ignored");
  }
  {
    const p = setup();
    p.audio.metadata(Infinity);
    const probe = p.probes[0];
    probe.metadata(Infinity);
    probe.emit("seeked");
    assert.equal(p.state.duration, null);
    assert.match(p.state.durationError, /完整录音时长/);
    p.audio.emit("durationchange");
    assert.equal(p.probes.length, 1, "no automatic retry loop");
    p.player.retry();
    assert.equal(p.probes.length, 2);
    p.probes[1].metadata(12);
    assert.equal(p.state.duration, 12);
    p.player.dispose();
    checks.push(
      "unresolved seek remains unknown / visible failure / manual retry",
    );
  }
  {
    const p = setup({ timeoutMs: 5 });
    p.audio.metadata(Infinity);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(p.state.duration, null);
    assert.match(p.state.durationError, /超时/);
    assert.equal(p.probes[0].removed, true);
    p.player.dispose();
    checks.push("probe timeout releases media and stays unknown");
  }
  {
    const p = setup();
    p.audio.metadata(Infinity);
    const probe = p.probes[0];
    probe.error = { code: 3 };
    probe.emit("error");
    assert.match(p.state.durationError, /解码失败/);
    assert.equal(probe.removed, true);
    p.player.retry();
    assert.equal(p.probes.length, 2);
    p.audio.error = { code: 3 };
    p.audio.emit("error");
    assert.match(p.state.mediaError, /解码失败/);
    assert.equal(p.probes[1].removed, true);
    const loads = p.audio.loads;
    p.player.retry();
    assert.equal(p.audio.loads, loads + 1);
    assert.equal(p.state.mediaError, "");
    p.audio.metadata(33);
    assert.equal(p.state.duration, 33);
    assert.equal(
      p.audio.plays,
      0,
      "retrying media load never automatically plays",
    );
    p.player.dispose();
    checks.push("probe / actual media error visible and retryable");
  }
  {
    const p = setup();
    p.audio.metadata(80);
    p.audio.seekFails = true;
    p.player.seek(32);
    assert.match(p.state.playError, /调整录音进度/);
    p.audio.seekFails = false;
    p.player.retry();
    assert.equal(p.audio.currentTime, 32);
    assert.equal(p.state.playError, "");
    assert.equal(p.audio.plays, 0);
    p.player.dispose();
    checks.push(
      "failed seek retry restores requested position without playing",
    );
  }
  {
    const p = setup();
    p.audio.metadata(40);
    p.audio.playResult = () => Promise.reject(new Error("denied"));
    p.player.toggle();
    await flush();
    assert.match(p.state.playError, /无法播放/);
    assert.equal(p.state.playing, false);
    p.audio.playResult = null;
    p.player.retry();
    await flush();
    assert.equal(p.state.playError, "");
    assert.equal(p.state.playing, true);
    p.player.toggle();
    assert.equal(p.state.playing, false);
    p.audio.playResult = () => {
      throw new Error("sync failure");
    };
    p.player.toggle();
    assert.match(p.state.playError, /无法播放/);
    p.player.dispose();
    checks.push("async play rejection / sync throw visible / user retry works");
  }
  {
    const p = setup();
    p.audio.metadata(Infinity);
    const probe = p.probes[0];
    let rejectPlay;
    p.audio.playResult = () =>
      new Promise((_, reject) => {
        rejectPlay = reject;
      });
    p.player.toggle();
    p.player.dispose();
    const count = p.states.length;
    probe.duration = 72;
    probe.emit("durationchange");
    p.audio.metadata(111);
    p.audio.emit("error");
    rejectPlay(new Error("late"));
    await flush();
    assert.equal(p.states.length, count);
    assert.equal(probe.removed, true);
    assert.equal(p.audio.removed, true);
    const next = setup();
    next.audio.metadata(21);
    assert.equal(next.state.duration, 21);
    assert.equal(next.state.time, 0);
    next.player.dispose();
    checks.push(
      "unmount / source replacement lifetime / late events and play rejection ignored",
    );
  }
  {
    const p = setup();
    p.audio.metadata(100);
    let rejectPlay;
    p.audio.playResult = () => {
      p.audio.paused = false;
      return new Promise((_, reject) => {
        rejectPlay = reject;
      });
    };
    p.player.toggle();
    p.player.toggle();
    rejectPlay(new Error("aborted by pause"));
    await flush();
    assert.equal(p.state.playError, "");
    assert.equal(p.state.playing, false);
    p.player.dispose();
    checks.push("intervening user pause invalidates pending play promise");
  }
  {
    const probe = createMedia();
    let completed = false;
    const cancel = probeAudioDuration(
      "data:audio/webm;base64,fixture",
      () => {
        completed = true;
      },
      { createAudio: () => probe, timeoutMs: 5 },
    );
    cancel();
    probe.duration = 99;
    probe.emit("durationchange");
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(completed, false);
    assert.equal(probe.removed, true);
    checks.push("direct probe cancellation clears listeners and deadline");
  }
  console.log(
    JSON.stringify(
      {
        productionModule: "src/audio-playback.ts",
        checks,
        passed: checks.length,
      },
      null,
      2,
    ),
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
