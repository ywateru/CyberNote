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
    get seekable() { return { length: 1, start: () => 0, end: () => 45 }; }
    emit(name) { this.dispatchEvent(new Event(name)); }
    pause() { this.paused = true; this.emit("pause"); }
    play() { this.plays++; return Promise.resolve(); }
    load() { this.readyState = 0; this.duration = NaN; this.currentTime = 0; this.error = null; }
    removeAttribute(name) { if (name === "src") this.src = ""; }
  }
  const audio = new Media(), states = [];
  const player = createRecordingPlayback(audio, new Blob(["controlled-prefix"]), state => states.push({...state}), {
    urls: { createObjectURL: () => "blob:independent", revokeObjectURL: () => {} }
  });
  const state = () => states.at(-1);
  audio.duration = 45; audio.readyState = 2;
  audio.emit("loadedmetadata"); audio.emit("canplay");
  assert.equal(state().ready,true); assert.equal(state().canSeek,true);
  player.skip(15); assert.equal(state().seeking,true);
  audio.error = {code:4}; audio.readyState = 0; audio.emit("error");
  player.retry();
  assert.equal(state().ready,false); assert.equal(state().canSeek,false); assert.equal(state().seeking,false);
  const plays = audio.plays; player.toggle(); assert.equal(audio.plays,plays);
  const loading = {...state()};
  audio.emit("seeked"); assert.equal(state().seekMessage,"");
  audio.duration = 45; audio.readyState = 1; audio.emit("loadedmetadata");
  assert.equal(state().ready,false); assert.equal(state().canSeek,false);
  const metadataOnly = {...state()};
  audio.readyState = 2; audio.emit("loadeddata");
  assert.equal(state().ready,true); assert.equal(state().canSeek,true);
  player.toggle(); assert.equal(audio.plays,plays+1);
  player.skip(15); assert.equal(state().seeking,true); assert.equal(state().time,0);
  audio.emit("seeked"); assert.equal(state().seeking,false); assert.equal(state().time,15);
  assert.match(state().seekMessage,/0:15/);
  const recovered = {...state()};
  player.dispose(); const count = states.length;
  audio.emit("loadeddata"); audio.emit("seeked"); audio.emit("canplay");
  assert.equal(states.length,count);
  console.log(JSON.stringify({tests:4, pass:true, sourceHashes:hashes, checks:["error reload clears prior readiness and pending seek; toggle denied", "metadata only does not restore readiness", "fresh decoded-data event restores real play and confirmed seek", "dispose seals later readiness/seek events"], loading, metadataOnly, recovered, boundary:"Independent cases using production adapter/shared controller; controlled media host, no real decoding or audible claim"},null,2));
} finally { await rm(temporary,{recursive:true,force:true}); }
