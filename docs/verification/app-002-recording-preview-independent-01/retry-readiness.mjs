import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import ts from "typescript";
const temporary = await mkdtemp(join(tmpdir(), "notes-independent-recording-retry-"));
const hashes = {};
try {
  for (const name of ["audio-playback", "recording-session", "recording-playback"]) {
    const source = await readFile(`src/${name}.ts`, "utf8");
    hashes[name] = createHash("sha256").update(source).digest("hex");
    const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
      .replaceAll('"./audio-playback"', '"./audio-playback.mjs"')
      .replaceAll('"./recording-session"', '"./recording-session.mjs"');
    await writeFile(join(temporary, `${name}.mjs`), output);
  }
  const { createRecordingPlayback } = await import(pathToFileURL(join(temporary, "recording-playback.mjs")));
  class Media extends EventTarget {
    readyState = 0; duration = NaN; currentTime = 0; error = null; paused = true; seeking = false; src = ""; plays = 0;
    get seekable() { return { length: 0 }; }
    emit(name) { this.dispatchEvent(new Event(name)); }
    pause() { this.paused = true; this.emit("pause"); }
    play() { this.plays++; return Promise.resolve(); }
    load() { this.readyState = 0; this.duration = NaN; this.error = null; }
    removeAttribute(name) { if (name === "src") this.src = ""; }
  }
  const audio = new Media(), states = [];
  const player = createRecordingPlayback(audio, new Blob(["controlled-prefix"]), state => states.push({...state}), {
    urls: { createObjectURL: () => "blob:independent", revokeObjectURL: () => {} }
  });
  audio.duration = 45; audio.readyState = 2;
  audio.emit("loadedmetadata"); audio.emit("canplay");
  const ready = states.at(-1); assert.equal(ready.ready, true);
  audio.error = {code:4}; audio.readyState = 0; audio.emit("error");
  const failed = states.at(-1); assert.equal(failed.ready, false);
  player.retry();
  const retried = states.at(-1);
  const beforePlay = audio.plays;
  player.toggle();
  const observed = { sourceHashes:hashes, readyBeforeFailure:ready.ready, failureReady:failed.ready,
    mediaReadyStateAfterRetry:audio.readyState, adapterReadyAfterRetry:retried.ready,
    adapterDurationAfterRetry:retried.duration, playCallsBeforeDataEvent:audio.plays-beforePlay,
    boundary:"Production recording adapter + unchanged production shared controller; Media host controlled. No new loadeddata/canplay event after retry." };
  console.log(JSON.stringify(observed,null,2));
  player.dispose();
  assert.equal(retried.ready, false, "retry reload is not media-ready before a new data/canplay event");
  assert.equal(audio.plays, beforePlay, "play admission remains disabled before new media readiness");
} finally { await rm(temporary,{recursive:true,force:true}); }
