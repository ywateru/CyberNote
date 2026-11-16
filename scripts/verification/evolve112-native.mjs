// Owned debug-feature Mac candidate + real stdio adapter + production host/Session.
// Never supplies a successful fake application handler or reads a credential file.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { NativeApp, bounded, delay, until } from "./sync108-native-driver.mjs";

const binary = resolve(process.argv[2] || "");
const adapter = resolve(process.argv[3] || "");
assert(process.argv[2] && process.argv[3], "Usage: node evolve112-native.mjs ABS_NATIVE ABS_MCP");
const bundleId = execFileSync('/usr/libexec/PlistBuddy', ['-c','Print :CFBundleIdentifier',resolve(binary,'../../Info.plist')], {encoding:'utf8'}).trim();
assert.match(bundleId,/^com\.local\.cybernote\.evolve112\./);
const root = await realpath(await mkdtemp("/private/tmp/e112-native-"));
await chmod(root, 0o700);
const runtime = join(root, "run");
const report = { scope: "112 integration source candidate; not 116 final package acceptance", root,
  sourceHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  sourceStatus:execFileSync("git",["status","--short"],{encoding:"utf8"}).trim(),
  bundleId, profiles: [], artifacts: {}, checks: [], lifecycles: [], events: [], limitations: ["Native debug-feature/static development frontend with explicit eval driver; not a production release", "CompositionEvent injection tests native PM composition handling; does not prove physical macOS IME input"] };
for (const [name, path] of Object.entries({ native: binary, adapter }))
  report.artifacts[name] = { path, sha256: createHash("sha256").update(await readFile(path)).digest("hex") };
const check = (name, value = true) => { assert(value, name); report.checks.push(name); console.log(JSON.stringify({check:name})); };
const apps = [], peers = [];
class Rpc {
  seq = 0; pending = new Map(); buffer = ""; stderrBytes = 0; jsonrpc = true;
  constructor(command, args, options = {}) {
    this.child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], ...options });
    this.closed = new Promise(done => this.child.once("close", (code, signal) => done({ code, signal })));
    this.child.stderr.on("data", b => { this.stderrBytes += b.length; });
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", chunk => {
      this.buffer += chunk;
      assert(Buffer.byteLength(this.buffer) <= 8_010_000, "bounded RPC stdout");
      for (;;) {
        const at = this.buffer.indexOf("\n"); if (at < 0) break;
        const line = this.buffer.slice(0, at); this.buffer = this.buffer.slice(at + 1);
        const reply = JSON.parse(line), pending = this.pending.get(reply.id);
        if (pending) { this.pending.delete(reply.id); pending.resolve(reply); }
      }
    });
    this.child.on("error", error => { for (const p of this.pending.values()) p.reject(error); this.pending.clear(); });
    this.child.on("exit", () => { for (const p of this.pending.values()) p.reject(Error("RPC child exited")); this.pending.clear(); });
    peers.push(this);
  }
  send(value) { this.child.stdin.write(JSON.stringify(value) + "\n"); }
  async rpc(method, params) {
    const id = ++this.seq;
    const response = new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); });
    this.send({ ...(this.jsonrpc ? { jsonrpc: "2.0" } : {}), id, method, params });
    const reply = await bounded(response, 30_000, "RPC_TIMEOUT");
    assert(!reply.error, JSON.stringify({ method, error: reply.error }));
    return reply.result;
  }
  async close() { if (this.child.exitCode === null && this.child.signalCode === null) this.child.stdin.end(); return bounded(this.closed, 5000); }
}
const argsFor = c => ["--workspace-id", c.workspaceId, "--credential-ref", c.credentialRef, "--runtime-dir", c.runtimeDir];
async function mcp(c) {
  const peer = new Rpc(adapter, argsFor(c));
  const initialized = await peer.rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "evolve112-native", version: "1" } });
  assert.equal(initialized.protocolVersion, "2025-11-25");
  peer.send({ jsonrpc: "2.0", method: "notifications/initialized" });
  assert.equal((await peer.rpc("tools/list", {})).tools.length, 9);
  peer.tool = async (name, arguments_ = {}) => peer.rpc("tools/call", { name, arguments: arguments_ });
  return peer;
}
const success = value => { assert(!value.isError, JSON.stringify(value)); assert(value.structuredContent); return value.structuredContent; };
async function open(name, data, selectedRuntime = runtime) {
  const app = new NativeApp(binary, data, { name, commandArgs: ["--data-dir", data, "--agent-runtime-dir", selectedRuntime] });
  apps.push(app); await app.ready();
  const profile = await app.request({op:'webviewStorageDiagnostic'});
  assert.equal(profile.bundleIdentifier,bundleId);
  assert(profile.stores.some(s=>s.label==="main"));
  assert.equal(app.metadata.pid,app.child.pid);
  assert.equal(app.metadata.window,"main");
  report.profiles.push({name,pid:app.child.pid,window:app.metadata.window,...profile});
  return app;
}
async function invoke(app, command, args = {}) {
  return app.evaluate(`(async () => {
    const s = (await window.__NOTES_DEBUG__.execute('app.state')).result;
    const a = s.workspace.access;
    return window.__TAURI_INTERNALS__.invoke(arg.command, {...arg.args, expected:{sessionId:a.sessionId,epoch:a.epoch}});
  })()`, { command, args });
}
async function installTrace(app) {
  await app.evaluate(`(async () => {
    window.e112 = {events:[]};
    const i = window.__TAURI_INTERNALS__, original = i.invoke.bind(i);
    for(const event of ['notes-agent','notes-metadata']) {
      const callback = i.transformCallback(e=>window.e112.events.push({name:event,payload:e.payload}));
      await original('plugin:event|listen',{event,target:{kind:'Any'},handler:callback});
    }
    return true;
  })()`);
}
async function browse(app) {
  await app.execute("editor.done");
  await app.evaluate(`(() => { document.querySelector('.search input')?.focus(); document.querySelector('.tiptap')?.blur(); return true; })()`);
  await app.idle();
}
const create = text => ({ folderId: "default", format: "text", content: text, idempotencyKey: randomUUID() });
async function directCodex(connection) {
  const home = join(root, "codex"), cwd = join(root, "empty-cwd");
  await mkdir(home, { mode: 0o700 }); await mkdir(cwd, { mode: 0o700 });
  await writeFile(join(home, "config.toml"), `cli_auth_credentials_store = "file"\nmcp_oauth_credentials_store = "file"\n[analytics]\nenabled = false\n[features]\nhooks = false\n[mcp_servers.cybernote]\ncommand = ${JSON.stringify(adapter)}\nargs = ${JSON.stringify(argsFor(connection))}\nstartup_timeout_sec = 10\ntool_timeout_sec = 30\n`, { mode: 0o600 });
  const env = { PATH: process.env.PATH || "/usr/bin:/bin", LANG: "en_US.UTF-8", CODEX_HOME: home };
  const cliVersion = execFileSync("codex", ["--version"], { cwd, env, encoding: "utf8" }).trim();
  assert.equal(cliVersion, "codex-cli 0.167.0");
  const codex = new Rpc("codex", ["app-server", "--stdio"], { cwd, env }); codex.jsonrpc = false;
  const initialized = await codex.rpc("initialize", { clientInfo: { name: "evolve112_actual_native", version: "1" }, capabilities: { experimentalApi: true } });
  assert.equal(initialized.codexHome, home);
  codex.send({ method: "initialized" });
  const thread = await codex.rpc("thread/start", { ephemeral: true, cwd, sandbox: "read-only", approvalPolicy: "never" });
  assert.equal(thread.thread.ephemeral, true);
  const threadId = thread.thread.id;
  const status = await codex.rpc("mcpServerStatus/list", { threadId, serverName: "cybernote", detail: "toolsAndAuthOnly" });
  const tools = [];
  const tool = async (name, arguments_ = {}) => {
    const reply = await codex.rpc("mcpServer/tool/call", { threadId, server: "cybernote", tool: name, arguments: arguments_ });
    tools.push(name); return success(reply);
  };
  await tool("notes_get_capabilities"); await tool("notes_list_folders");
  const created = await tool("notes_create", create("Codex公开RPC真实业务\n无需模型登录"));
  let note = await tool("notes_read", { noteId: created.noteId });
  await tool("notes_append", { noteId: created.noteId, expectedVersion: note.version, text: "\nRPC追加", idempotencyKey: randomUUID() });
  note = await tool("notes_read", { noteId: created.noteId });
  const updated = await tool("notes_update", { noteId: created.noteId, expectedVersion: note.version, format: "text", content: "Codex原生SQLite最终内容", idempotencyKey: randomUUID() });
  assert.deepEqual(updated.warnings, []);
  assert.equal((await tool("notes_read", { noteId: created.noteId })).content, "Codex原生SQLite最终内容");
  await tool("notes_list"); await tool("notes_search", { query: "Codex" });
  await tool("notes_get_operation", { operationId: updated.operationId });
  const exit = await codex.close(); assert.equal(exit.code, 0);
  assert(!(await readdir(home)).includes("auth.json"));
  report.codex = { cliVersion, tools, status, childEnvKeys: Object.keys(env), ephemeral: true, modelTurns: 0, loginRequests: 0, exit, created, updated };
  check("Codex 0.167 public direct RPC calls all nine actual host tools without model/login");
}
async function replayBoundary(peer) {
  // Independently generated real-native fixture retained as an external,
  // immutable source. This replay now reaches the actual App/SQLite host.
  const fixturePath=process.env.EVOLVE112_BOUNDARY_FIXTURE||'/tmp/evolve112-actual-node-boundary.json';
  const fixtureBytes=await readFile(fixturePath);
  assert.equal(createHash('sha256').update(fixtureBytes).digest('hex'),'5966d0b580c459ba02e814f93853ba870a371674c9100372130bb7f12b1e1396');
  const fixture=JSON.parse(fixtureBytes),document=fixture.createArguments.content;
  const boundary=success(await peer.tool('notes_create',{...fixture.createArguments,idempotencyKey:randomUUID()}));
  const boundaryRead=success(await peer.tool('notes_read',{noteId:boundary.noteId,format:'document'}));
  assert.deepEqual(boundaryRead.content,document);
  const boundaryUpdate=success(await peer.tool('notes_update',{noteId:boundary.noteId,expectedVersion:boundaryRead.version,format:'document',content:document,idempotencyKey:randomUUID()}));
  assert(boundaryUpdate.committed);assert.deepEqual(boundaryUpdate.warnings,[]);
  const excess=await peer.tool('notes_create',{...fixture.createArguments,content:{...document,content:[...document.content,{type:'paragraph'}]},idempotencyKey:randomUUID()});
  assert(excess.isError);assert.equal(excess.structuredContent.code,'CONTENT_TOO_LARGE');
  report.nodeBoundary={fixturePath,fixtureSHA256:createHash('sha256').update(fixtureBytes).digest('hex'),documentBytes:779987,nodes:20000,rejectedNodes:20001,create:boundary,update:boundaryUpdate};
  check('actual adapter/IPC/service accepts 779987-byte 20000-node create/read/update and rejects 20001 nodes');
}

try {
  let app = await open("A", join(root, "a"));
  await installTrace(app);
  let settings = await invoke(app, "agent_settings");
  check("new actual workspace defaults off", !settings.enabled);
  await app.execute("settings.open");
  await app.execute("dom.click", { selector: '[data-preferences-page="agent"]' });
  check("Preferences mounts actual Agent page", await app.evaluate(`!!document.querySelector('.agent-settings [role="switch"]')`));
  await app.evaluate(`(() => {document.querySelector('.agent-settings [role="switch"]').click();return true;})()`);
  await until("UI enables real listener", async () => (await invoke(app, "agent_settings")).enabled);
  settings = await invoke(app, "agent_settings");
  const grant = await invoke(app, "agent_create_grant", { input: { clientId: "native-A", scopes: ["notes:read", "notes:create", "notes:update"], folderIds: ["default"], expiresAt: Date.now() + 3_600_000 } });
  check("renderer DTO carries references only", !JSON.stringify(grant).includes('"credential":'));
  assert.equal(grant.connection.runtimeDir, runtime);
  for (const name of await readdir(runtime)) if (name.endsWith(".json")) assert.equal((await stat(join(runtime, name))).mode & 0o777, 0o600);
  assert.equal((await stat(runtime)).mode & 0o777, 0o700);
  assert.equal((await stat(join(runtime, "credentials"))).mode & 0o777, 0o700);
  check("runtime and state files have private modes");
  await app.execute("app.back");
  let peer = await mcp(grant.connection);
  if (process.env.EVOLVE112_FOCUS === "boundary") {
    report.focus = "large-document regression and actual Codex direct RPC";
    await replayBoundary(peer);
    await directCodex(grant.connection);
    await invoke(app, "agent_revoke_grant", { grantId: grant.grant.grantId });
  } else {
  const caps = success(await peer.tool("notes_get_capabilities"));
  assert.equal(caps.workspaceId, settings.workspaceId);
  success(await peer.tool("notes_list_folders"));
  const args = create("112真实宿主标题\n中文正文");
  const receipt = success(await peer.tool("notes_create", args));
  assert.equal(receipt.committed, true); assert.deepEqual(receipt.warnings, []);
  const id = receipt.noteId;
  success(await peer.tool("notes_list"));
  success(await peer.tool("notes_search", { query: "中文" }));
  let read = success(await peer.tool("notes_read", { noteId: id }));
  assert.equal(read.content, args.content);
  success(await peer.tool("notes_get_operation", { operationId: receipt.operationId }));
  await app.execute("note.select", { id }); await browse(app);
  const appended = success(await peer.tool("notes_append", { noteId: id, expectedVersion: read.version, text: "\n追加", idempotencyKey: randomUUID() }));
  assert.deepEqual(appended.warnings, []);
  read = success(await peer.tool("notes_read", { noteId: id }));
  const updated = success(await peer.tool("notes_update", { noteId: id, expectedVersion: read.version, format: "text", content: "112真实更新\n原生刷新", idempotencyKey: randomUUID() }));
  assert.deepEqual(updated.warnings, []);
  await app.idle();
  assert(JSON.stringify((await app.state()).editorJSON).includes("原生刷新"));
  const trace = {events:await app.evaluate(`window.e112.events`),replies:await app.request({op:'agentDiagnostic'})};
  report.events.push(trace);
  const releaseIndex = trace.events.findIndex(e => e.payload.operationId === updated.operationId && e.payload.phase === "release");
  assert(releaseIndex > 0 && trace.events.slice(0, releaseIndex).some(e => e.name === "notes-metadata"));
  assert(trace.replies.some(r => r.accepted && r.reply.operationId === updated.operationId && r.reply.phase === "release" && r.reply.refreshed));
  check("nine real MCP tools reach SQLite and real WebView metadata/ACK/refresh");
  assert.deepEqual(success(await peer.tool("notes_create", args)), receipt);
  check("original idempotent receipt survives subsequent edits");
  await replayBoundary(peer);
  const wrongExpected = await app.evaluate(`(async () => {
    const s=(await window.__NOTES_DEBUG__.execute('app.state')).result;
    const expected={sessionId:s.workspace.access.sessionId,epoch:s.workspace.access.epoch+1};
    const results=[];
    for(const [command,args] of [
      ['agent_settings',{}],['agent_set_enabled',{enabled:false}],
      ['agent_create_grant',{input:{clientId:'stale',scopes:['notes:read'],folderIds:['default'],expiresAt:Date.now()+60000}}],
      ['agent_revoke_grant',{grantId:arg}]
    ]) {try {await window.__TAURI_INTERNALS__.invoke(command,{...args,expected});results.push('accepted');}catch(e){results.push(e.code);}}
    return results;
  })()`, grant.grant.grantId);
  assert.deepEqual(wrongExpected, Array(4).fill("UNAUTHORIZED"));
  check("all four native Agent commands reject stale expected authority");
  const invalidGrants = await app.evaluate(`(async () => {
    const s=(await window.__NOTES_DEBUG__.execute('app.state')).result;
    const expected={sessionId:s.workspace.access.sessionId,epoch:s.workspace.access.epoch};
    const base={clientId:'invalid-test',scopes:['notes:read'],folderIds:['default'],expiresAt:Date.now()+60000};
    const results=[];
    for(const patch of [{folderIds:['trash']},{folderIds:['missing']},{scopes:['notes:delete']},{expiresAt:1}]) {
      try {await window.__TAURI_INTERNALS__.invoke('agent_create_grant',{input:{...base,...patch},expected});results.push('accepted');}catch(e){results.push(e.code);}
    }
    return results;
  })()`);
  assert(invalidGrants.every(code => code !== "accepted"));
  assert.equal((await invoke(app, "agent_settings")).grants.length, 1);
  check("native grant creation rejects nonphysical directories, unsupported scope and expired authority");
  await directCodex(grant.connection);
  // Lose the stdio caller response, while the real host completes against real
  // renderer ACKs. Pause consumption before the call; never invent a receipt.
  const lostArgs = create("112丢失响应后仅提交一次");
  const lost = await mcp(grant.connection);
  const startEvents = await app.evaluate(`window.e112.events.length`);
  lost.child.stdout.pause();
  const lostResponse = lost.tool("notes_create", lostArgs).catch(() => null);
  await until("actual commit release", () => app.evaluate(`window.e112.events.slice(arg).some(e=>e.name==='notes-agent'&&e.payload.phase==='release'&&e.payload.outcome==='commit')`, startEvents));
  lost.child.kill("SIGTERM");
  // Discard unread bytes without resuming the application RPC decoder.
  lost.child.stdout.removeAllListeners('data'); lost.child.stdout.resume();
  await bounded(lost.closed, 5000); await lostResponse;
  const recovered = success(await peer.tool("notes_create", lostArgs));
  assert.equal(recovered.committed, true);
  assert.deepEqual(success(await peer.tool("notes_create", lostArgs)), recovered);
  check("lost stdio response after real commit recovers one original idempotent receipt");
  // Two real clients compete on a single native Session CAS version.
  const second = await mcp(grant.connection);
  read = success(await peer.tool("notes_read", { noteId: id }));
  const cas = text => ({ noteId: id, expectedVersion: read.version, format: "text", content: text, idempotencyKey: randomUUID() });
  const raced = await Promise.all([peer.tool("notes_update", cas("CAS甲")), second.tool("notes_update", cas("CAS乙"))]);
  assert.equal(raced.filter(r => !r.isError).length, 1);
  assert.equal(raced.find(r => r.isError).structuredContent.code, "REVISION_CONFLICT");
  const finalText = success(await peer.tool("notes_read", { noteId: id })).content;
  report.finalText = finalText;
  check("two real stdio clients CAS exactly one winner");
  await second.close();
  // Protection is reported by actual App/editor/recording state, not a fake
  // participant. The recording registration remains idle: no microphone start.
  const guarded = success(await peer.tool("notes_create", create("112保护边界\n原文")));
  await app.execute("note.select", {id:guarded.noteId});
  const busyAttempt = async () => {
    const current = success(await peer.tool("notes_read",{noteId:guarded.noteId}));
    const denied = await peer.tool("notes_update",{noteId:guarded.noteId,expectedVersion:current.version,format:"text",content:"不应覆盖",idempotencyKey:randomUUID()});
    assert.equal(denied.isError,true); assert.equal(denied.structuredContent.code,"NOTE_BUSY");
    assert.equal(success(await peer.tool("notes_read",{noteId:guarded.noteId})).content,current.content);
    return denied.structuredContent;
  };
  await app.execute("editor.insertText",{text:"活动编辑"}); await app.execute("app.flush");
  await busyAttempt();
  check("actual focused editor rejects external update without overwriting local text");
  await browse(app);
  await app.evaluate(`(() => {const e=document.querySelector('.tiptap');e.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'中'}));return true;})()`);
  assert((await app.state()).quietWindow.editors.some(e=>e.id===guarded.noteId&&e.composing));
  await busyAttempt();
  await app.evaluate(`(() => {document.querySelector('.tiptap').dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'中'}));return true;})()`);
  await app.idle();
  check("native ProseMirror composition state protects target (injected event, not physical IME)");
  // A real SQLite failure retains an unsaved renderer draft; SQL touches only
  // this newly generated test database. No separate production Store is created.
  const sql = statement => execFileSync('python3',['-c',"import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.executescript(sys.argv[2]); c.close()",join(root,'a','notes.sqlite3'),statement]);
  sql("CREATE TRIGGER e112_pending_fault BEFORE INSERT ON notes BEGIN SELECT RAISE(ABORT,'e112-owned-save-fault'); END;");
  try {
    await app.execute("editor.insertText",{text:"待重试草稿"}).catch(e=>{assert.equal(e.code,'APP_ERROR');});
    await until("real failed save retained",async () => (await app.state()).save.failed>0);
    const state=await app.state(); assert(state.agentWindow.unsavedNoteIds.includes(guarded.noteId));
    await busyAttempt();
    const replies=await app.request({op:'agentDiagnostic'});
    assert(replies.some(e=>e.accepted&&e.reply.phase==='probe'&&e.reply.unsavedNoteIds.includes(guarded.noteId)));
  } finally {sql('DROP TRIGGER e112_pending_fault;');}
  await app.execute('app.dismissError');
  await app.execute('editor.insertText',{text:'保存恢复'}); await app.execute('app.flush');
  await browse(app);
  check("real SQLite save failure retains pending draft and rejects external overwrite; retry recovers");
  await app.execute('recording.open');
  await until('idle native recording registered',async () => {const state=await app.state();return state.recording.active&&state.recording.state?.phase==='idle';});
  await browse(app);
  assert((await app.state()).agentWindow.protectedNoteIds.includes(guarded.noteId));
  await busyAttempt();
  // Actual MediaRecorder/PCM/RecordingController -> native attachment journal
  // and document ACK, with an inaudible WebAudio-only pure-tone input. During
  // this Start only, platform/stream adapters bypass native mic authorization;
  // neither the original getUserMedia nor the native TCC command is called.
  await app.evaluate(`(async () => {
    const context=new AudioContext({sampleRate:24000}), dest=context.createMediaStreamDestination(), oscillator=context.createOscillator(), gain=context.createGain();
    oscillator.frequency.value=330;gain.gain.value=0.02;oscillator.connect(gain).connect(dest);oscillator.start();
    await Promise.race([context.resume(),new Promise((_,reject)=>setTimeout(()=>reject(Error('synthetic audio context blocked')),2500))]);
    if(context.state!=='running')throw Error('synthetic audio unavailable');
    const platform=Object.getOwnPropertyDescriptor(navigator,'platform'),stream=navigator.mediaDevices.getUserMedia;
    window.e112.synthetic={context,oscillator,dest,platform,stream,requests:0};
    Object.defineProperty(navigator,'platform',{value:'E112 isolated synthetic source',configurable:true});
    navigator.mediaDevices.getUserMedia=async ()=>{window.e112.synthetic.requests++;return dest.stream;};
    return {state:context.state,source:'WebAudio330Hz'};
  })()`);
  try {
    await app.execute('recording.action',{action:'toggle'});
    await until('synthetic source recording',async () => (await app.state()).recording.state?.phase==='recording');
    await browse(app);await busyAttempt();await delay(500);
    await app.execute('recording.action',{action:'close'});await app.idle();
    const state=await app.state(); assert(!state.recording.active);
    const audio=state.workspace.attachments.find(a=>a.noteId===guarded.noteId&&a.mime==='audio/wav');
    assert(audio&&audio.size>44&&Number.isSafeInteger(audio.recordedAt));
    report.syntheticRecording={source:'WK AudioContext 330Hz -> MediaStreamDestination; no speaker connection',nativeMicAuthorization:'skipped during synthetic Start only',attachment:audio,requests:await app.evaluate('window.e112.synthetic.requests')};
    assert.equal(report.syntheticRecording.requests,1);
  } finally {
    await app.evaluate(`(async () => {const s=window.e112.synthetic;navigator.mediaDevices.getUserMedia=s.stream;if(s.platform)Object.defineProperty(navigator,'platform',s.platform);else delete navigator.platform;s.oscillator.stop();await s.context.close();return true;})()`);
  }
  check("synthetic WebAudio source drives real recording/register/save/document ACK while MCP write is refused; no mic/TCC claim");
  // Capture an actual picker owner while suppressing only the OS chooser.
  // A synthetic cancel event releases it; no existing user's file is selected.
  await app.evaluate(`(() => {const original=HTMLInputElement.prototype.click;window.e112.restorePicker=()=>{HTMLInputElement.prototype.click=original;};HTMLInputElement.prototype.click=function(){if(this.type==='file'){window.e112.input=this;return;}return original.call(this);};return true;})()`);
  await app.execute('attachment.choose',{kind:'file'}); await browse(app);
  assert((await app.state()).agentWindow.protectedNoteIds.includes(guarded.noteId)); await busyAttempt();
  await app.evaluate(`(() => {window.e112.input.dispatchEvent(new Event('cancel',{bubbles:true}));window.e112.restorePicker();return true;})()`);
  await app.idle();
  check('actual picker captured owner rejects external write; test suppresses only OS chooser');
  await app.execute('ocr.open'); await browse(app);
  assert((await app.state()).agentWindow.protectedNoteIds.includes(guarded.noteId)); await busyAttempt();
  await app.execute('ocr.cancel'); await browse(app);
  check('actual OCR operation protects original target until cancel without recognition or camera access');
  // Dynamic real WebView participates in the same release and metadata refresh.
  const child = await app.evaluate(`window.__TAURI_INTERNALS__.invoke('open_note_window',{noteId:arg,title:'E112 actual ACK child'})`,guarded.noteId);
  await delay(700);
  await app.execute('note.select',{id}); await browse(app);
  let multi;
  await until('dynamic document ready and accepting external write',async () => {
    const current=success(await peer.tool('notes_read',{noteId:id}));
    const value=await peer.tool('notes_append',{noteId:id,expectedVersion:current.version,text:'\n多窗口确认',idempotencyKey:randomUUID()});
    if(value.isError) {assert.equal(value.structuredContent.code,'NOTE_BUSY');return false;}
    multi=success(value);return true;
  });
  assert.deepEqual(multi.warnings,[]);
  const multiReplies=await app.request({op:'agentDiagnostic'});
  for(const label of ['main',child]) assert(multiReplies.some(e=>e.window===label&&e.accepted&&e.reply.operationId===multi.operationId&&e.reply.phase==='release'&&e.reply.refreshed));
  report.events.push({multiOperation:multi.operationId,replies:multiReplies});
  report.profiles.push({name:'real-multiwindow',...await app.request({op:'webviewStorageDiagnostic'})});
  // Preserve the value checked after restart after the additional append.
  report.finalText=success(await peer.tool('notes_read',{noteId:id})).content;
  check("real main and document WebViews both ACK refreshed:true for the committed operation");
  const readOnly=await invoke(app,'agent_create_grant',{input:{clientId:'read-only',scopes:['notes:read'],folderIds:['default'],expiresAt:Date.now()+60000}});
  const readPeer=await mcp(readOnly.connection);
  const scopeDenied=await readPeer.tool('notes_create',create('scope-denied'));
  assert(scopeDenied.isError);assert.equal(scopeDenied.structuredContent.code,'FORBIDDEN');
  await invoke(app,'agent_revoke_grant',{grantId:readOnly.grant.grantId}); await readPeer.close();
  const page=success(await peer.tool('notes_list',{limit:1})); assert(page.nextCursor);
  const next=success(await peer.tool('notes_list',{limit:1,cursor:page.nextCursor}));assert.notEqual(next.items[0].id,page.items[0].id);
  const expiryGrant=await invoke(app,'agent_create_grant',{input:{clientId:'expiring',scopes:['notes:read'],folderIds:['default'],expiresAt:Date.now()+800}});
  const expiring=await mcp(expiryGrant.connection);await delay(1000);
  assert((await expiring.tool('notes_list')).isError);
  await invoke(app,'agent_revoke_grant',{grantId:expiryGrant.grant.grantId});await expiring.close();
  const lockTarget=success(await peer.tool('notes_create',create('112锁定排除')));
  await app.execute('note.select',{id:lockTarget.noteId});await browse(app);
  await app.execute('modal.open',{type:'lock',value:'e112-owned-test-passphrase'});
  await app.execute('modal.submit'); await app.idle();
  assert((await peer.tool('notes_read',{noteId:lockTarget.noteId})).isError);
  assert(!success(await peer.tool('notes_list')).items.some(e=>e.id===lockTarget.noteId));
  const expiredCursor=await peer.tool('notes_list',{limit:1,cursor:page.nextCursor});
  assert(expiredCursor.isError); assert.equal(expiredCursor.structuredContent.code,'CURSOR_EXPIRED');
  check("real grants enforce scope and expiry; pagination advances and expires on change; locked note excluded");
  const b = await open("B", join(root, "b"));
  const bSettings = await invoke(b, "agent_settings");
  assert(!bSettings.enabled); assert.notEqual(bSettings.workspaceId, settings.workspaceId);
  await invoke(b, "agent_set_enabled", { enabled: true });
  const bGrant = await invoke(b, "agent_create_grant", { input: { clientId: "native-B", scopes: ["notes:read", "notes:create"], folderIds: ["default"], expiresAt: Date.now() + 3_600_000 } });
  const bPeer = await mcp(bGrant.connection);
  const bNote = success(await bPeer.tool("notes_create", create("另一真实隔离库")));
  assert.equal((await readdir(runtime)).filter(x => x.endsWith(".sock")).length, 2);
  assert(!(success(await peer.tool("notes_list"))).items.some(n => n.id === bNote.noteId));
  await invoke(b, "agent_revoke_grant", { grantId: bGrant.grant.grantId });
  await bPeer.close(); report.lifecycles.push(await b.close());
  assert.equal((await readdir(runtime)).filter(x => x.endsWith(".sock")).length, 1);
  success(await peer.tool("notes_get_capabilities"));
  check("two native libraries share runtime with private workspace registries and never delete sibling endpoint");
  await peer.close();
  report.lifecycles.push(await app.close());
  check("quit removes only owned endpoint", !(await readdir(runtime)).some(x => x.endsWith(".sock")));
  app = await open("A-restart", join(root, "a"));
  await installTrace(app);
  assert.equal((await invoke(app, "agent_settings")).enabled, true);
  peer = await mcp(grant.connection);
  assert.deepEqual(success(await peer.tool("notes_create", args)), receipt);
  assert.equal(success(await peer.tool("notes_read", { noteId: id })).content, report.finalText);
  check("new native process restores enabled preference, credential reference and original SQLite receipt");
  await invoke(app, "agent_revoke_grant", { grantId: grant.grant.grantId });
  assert.equal((await peer.tool("notes_read", { noteId: id })).isError, true);
  check("actual UI command revokes live stdio client");
  await peer.close();
  const rotation=await invoke(app,'agent_create_grant',{input:{clientId:'retire-on-import',scopes:['notes:read'],folderIds:['default'],expiresAt:Date.now()+60000}});
  const previous=await invoke(app,'agent_settings');
  const archive=join(root,'owned-backup.zip');
  await invoke(app,'export_archive',{path:archive});
  await invoke(app,'import_archive',{path:archive});
  await app.idle();
  const rotated=await invoke(app,'agent_settings');
  assert.notEqual(rotated.incarnation,previous.incarnation);assert(!rotated.enabled);assert.equal(rotated.grants.length,0);
  assert(!(await readdir(join(runtime,'credentials'))).includes(rotation.connection.credentialRef+'.json'));
  check('real archive import retires old incarnation/grants and leaves new identity off');
  await invoke(app, "agent_set_enabled", { enabled: true });
  await invoke(app, "agent_set_enabled", { enabled: false });
  report.lifecycles.push(await app.close());
  const off=await open('A-explicit-off-restart',join(root,'a'));
  assert(!(await invoke(off,'agent_settings')).enabled);
  check('explicit off persists across a fresh native process');
  report.lifecycles.push(await off.close());
  const invalidRuntime=join(root,'retry-run'); await mkdir(invalidRuntime,{mode:0o700});await chmod(invalidRuntime,0o755);
  const retry=await open('host-startup-failure-retry',join(root,'retry-data'),invalidRuntime);
  await retry.execute('note.create');await retry.execute('editor.insertText',{text:'Host失败不影响笔记'});await retry.execute('app.flush');await browse(retry);
  await retry.execute('settings.open');await retry.execute('dom.click',{selector:'[data-preferences-page="agent"]'});
  const failure=await retry.evaluate(`(async () => {const s=(await window.__NOTES_DEBUG__.execute('app.state')).result;try {await window.__TAURI_INTERNALS__.invoke('agent_settings',{expected:{sessionId:s.workspace.access.sessionId,epoch:s.workspace.access.epoch}});return 'accepted';}catch(e){return e.code;}})()`);
  assert.notEqual(failure,'accepted');
  check('invalid private runtime prevents host enable but actual notes App starts and saves');
  await chmod(invalidRuntime,0o700);
  const retried=await invoke(retry,'agent_set_enabled',{enabled:true});assert(retried.enabled);assert.equal(retried.runtimeDir,invalidRuntime);
  await invoke(retry,'agent_set_enabled',{enabled:false});report.lifecycles.push(await retry.close());
  check('actual Agent settings retry binds after private runtime permissions are repaired');
  }
  report.passed = true;
} catch (error) {
  report.passed = false; report.failure = { message: error.message, stack: error.stack };
} finally {
  for (const peer of peers) {
    try { await peer.close(); } catch { peer.child.kill("SIGTERM"); await bounded(peer.closed, 5000).catch(() => {}); }
  }
  for (const app of apps) {
    if (!app.lifecycle.close) try { report.lifecycles.push(await app.close()); } catch (e) { report.cleanupError ||= e.message; }
  }
  report.lifecycles=apps.map(app=>app.lifecycle);
  await writeFile(join(root, "result.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ passed: report.passed, root, checks: report.checks, failure: report.failure, cleanupError: report.cleanupError }, null, 2));
}
if (!report.passed || report.cleanupError) process.exitCode = 1;
