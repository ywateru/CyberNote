import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const compile = (text) => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const data = (text) => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
// Stub only IPC/platform imports; production gate, validation and Session run.
const helper = compile(await readFile('src/native-recording-access.ts', 'utf8'))
  .replace(/import \{ isTauri \} from "@tauri-apps\/api\/core";/, 'const isTauri = () => globalThis.recording52IsTauri;')
  .replace(/import \{ recordingAccess \} from "\.\.\/plugins\/tauri-plugin-notes-ui\/guest-js";/, 'const recordingAccess = () => globalThis.recording52Invoke();');
const helperUrl = data(helper);
const { authorizeNativeRecording } = await import(helperUrl);
const compiled = compile(await readFile('src/recording-session.ts', 'utf8')).replace('import("./native-recording-access")', `import(${JSON.stringify(helperUrl)})`);
assert.ok(compiled.includes(helperUrl));
const { RecordingSession } = await import(data(compiled));
const names = ['window', 'navigator', 'MediaRecorder', 'AudioContext', 'recording52IsTauri', 'recording52Invoke'];
const originals = names.map((n) => [n, Object.getOwnPropertyDescriptor(globalThis, n)]);
const set = (n, value) => Object.defineProperty(globalThis, n, { configurable: true, writable: true, value });
const results = [];
try {
  for (const [name, platform, ua, tauri, outcome, expectedInvoke, expectedMedia] of [
    ['Mac native allowed', 'MacIntel', 'Mac', true, { status: 'authorized' }, 1, 1],
    ['Mac native denied', 'MacIntel', 'Mac', true, { code: 'microphone_denied', message: '真实拒绝原因' }, 1, 0],
    ['Mac native unknown status rejected', 'MacIntel', 'Mac', true, { status: 'unknown' }, 1, 0],
    ['Mac native missing media API', 'MacIntel', 'Mac', true, null, 0, 0],
    ['Mac browser no native request', 'MacIntel', 'Mac', false, null, 0, 1],
    ['Android Tauri no native request', 'Linux', 'Android', true, null, 0, 1],
    ['iPad Mac platform no native request', 'MacIntel', 'iPad', true, null, 0, 1],
  ]) {
    let invoked = 0, media = 0, recorded = 0;
    const errors = [];
    set('recording52IsTauri', tauri);
    set('recording52Invoke', async () => { invoked++; if (outcome?.code) throw outcome; return outcome; });
    set('window', { ...(tauri ? { __TAURI_INTERNALS__: {} } : {}), setInterval: () => 1, clearInterval() {} });
    const track = { addEventListener() {}, removeEventListener() {}, stop() {} };
    set('navigator', { platform, userAgent: ua, mediaDevices: { getUserMedia: async (constraints) => { assert.deepEqual(constraints, { audio: true }); media++; return { getTracks: () => [track] }; } } });
    if (name === 'Mac native missing media API') globalThis.navigator.mediaDevices = undefined;
    set('MediaRecorder', class { static isTypeSupported() { return false; } state = 'inactive'; start() { this.state = 'recording'; } stop() { this.state = 'inactive'; } });
    set('AudioContext', class { createAnalyser() { return { frequencyBinCount: 1, disconnect() {} }; } createMediaStreamSource() { return { connect() {}, disconnect() {} }; } close() { return Promise.resolve(); } });
    const session = new RecordingSession({ onRecording() { recorded++; }, onStopped() {}, onLevel() {}, onError(error) { errors.push(error); } });
    assert.equal(invoked, 0, 'constructor must not request permission');
    await session.start();
    assert.equal(invoked, expectedInvoke, name); assert.equal(media, expectedMedia, name); assert.equal(recorded, expectedMedia, name);
    if (!expectedMedia) { assert.equal(errors.length, 1); if (outcome?.code) assert.equal(errors[0].message, outcome.message); }
    else assert.equal(errors.length, 0);
    session.dispose(); results.push(name);
  }
  set('recording52IsTauri', false); let calls = 0; set('recording52Invoke', () => { calls++; });
  await assert.rejects(authorizeNativeRecording(), /不支持/); assert.equal(calls, 0); results.push('helper rejects direct unsupported invocation');
  console.log(JSON.stringify({ status: 'PASS', checks: results.length, results, limits: 'IPC/OS stub only; no permission/audio operation' }, null, 2));
} finally {
  for (const [name, descriptor] of originals) if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
}
