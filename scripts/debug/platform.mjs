// Isolated IPC/device boundaries for the real App/Editor/SaveQueue/recorders.
// The default protocol fixture is NOT the production Rust Store or OS/TCC.
import { accountFixture } from './account-fixture.mjs';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
export { rustBackend } from './rust-backend.mjs';

const document = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }] });
const textOf = (doc) => (doc?.content || []).map((node) => node.text ?? textOf(node)).join(doc?.type === 'doc' ? '\n' : '');
const clone = (value) => structuredClone(value);
const failure = (message, code = 'fixture_error') => Object.assign(Error(message), { code });
export function seededWorkspace() {
  return {
    folders: [
      { id: 'default', name: '备忘录', kind: 'default', parentId: null, sortOrder: 0, createdAt: 1 },
      { id: 'quick', name: '快速备忘录', kind: 'quick', parentId: null, sortOrder: -1, createdAt: 1 },
      { id: 'trash', name: '最近删除', kind: 'trash', parentId: null, sortOrder: 9999, createdAt: 1 },
    ],
    notes: ['A', 'B'].map((name) => ({ id: 'note-' + name.toLowerCase(), folderId: 'default', title: 'Fixture ' + name, plainText: 'Fixture ' + name, document: document('Fixture ' + name), createdAt: 1, updatedAt: 1, pinned: false, deletedAt: null, originalFolderId: null, locked: false, paperStyle: 'plain', revision: 1 })),
    attachments: [],
    settings: { selectedFolder: 'default', selectedNote: 'note-a', theme: 'light', sort: 'title' },
  };
}
export class FakeBackend {
  kind = 'isolated-js-protocol-fixture';
  constructor(directory) { this.directory = directory; this.workspace = seededWorkspace(); this.sequence = 0; this.sessionId = 'debug70-' + randomUUID(); this.journal = new Map(); this.files = new Map(); this.passwords = new Map(); this.unlocked = new Set(); this.scan = new Map(); this.controls = { fail: {}, delay: {} }; this.calls = []; this.local = null; this.revision = 0; this.quit = null; this.exports = []; this.dataExtras = []; this.accessEpoch = 1; this.noteEpochs = {}; this.suspended = []; this.operationId = null; this.account = null; this.sync = null; this.syncConflicts = []; this.mediaLeases=new Map();this.mediaReads=[];this.mediaOrigin=null; }
  reset() { const mediaOrigin=this.mediaOrigin;Object.assign(this, new FakeBackend(this.directory));this.mediaOrigin=mediaOrigin; }
  // Functional transport fixture only: a real HTTP URL and Range path exercise
  // browser loading. This is not a native provider/Rust or performance proof.
  serveMedia(request,response){
    const id=new URL(request.url,this.mediaOrigin).pathname.slice('/media/'.length),lease=this.mediaLeases.get(id);
    const a=lease&&this.workspace.attachments.find(a=>a.id===lease.id&&a.noteId===lease.owner);
    if(!a||lease.session!==this.sessionId||lease.epoch!==(this.noteEpochs[a.noteId]||0)||this.suspended.includes(a.noteId)||this.operationId||(this.workspace.notes.find(n=>n.id===a.noteId)?.locked&&!this.unlocked.has(a.noteId))){response.writeHead(403);response.end();return;}
    const bytes=lease.purpose==='thumbnail'?Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'):Buffer.from(this.files.get(a.id)||'','base64');
    const range=request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);let start=0,end=bytes.length-1;
    if(range){start=Number(range[1]);end=range[2]?Math.min(Number(range[2]),end):end;if(start>end){response.writeHead(416);response.end();return;}}
    response.setHeader('Content-Type',lease.purpose==='thumbnail'?'image/png':a.mime);response.setHeader('Cache-Control','no-store');response.setHeader('Accept-Ranges','bytes');response.setHeader('Access-Control-Allow-Origin','*');response.setHeader('Content-Length',end-start+1);
    if(range){response.statusCode=206;response.setHeader('Content-Range',`bytes ${start}-${end}/${bytes.length}`);}
    this.mediaReads.push({id:a.id,purpose:lease.purpose,bytes:request.method==='HEAD'?0:end-start+1});response.end(request.method==='HEAD'?undefined:bytes.subarray(start,end+1));
  }
  state() { const value = clone(this.workspace); value.access = { sessionId: this.sessionId, epoch: this.accessEpoch, notes: Object.fromEntries(value.notes.map((note) => [note.id, { epoch: this.noteEpochs[note.id] || 0, authorized: !!(!note.locked || this.unlocked?.has(note.id)) }])), suspended: [...this.suspended], operationId: this.operationId }; value.metadata = { sessionId: this.sessionId, sequence: this.sequence }; return value; }
  tagged(value) { const state = this.state(); return { ...clone(value), access: state.access, metadata: state.metadata }; }
  configure(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure('Platform configuration must be an object'); for (const key of Object.keys(value)) if (!['fail', 'delay'].includes(key)) throw failure('Unknown backend control ' + key); for (const key of ['fail', 'delay']) if (value[key]) for (const [name, number] of Object.entries(value[key])) { if (!Number.isInteger(number) || number < 0 || number > (key === 'delay' ? 10000 : 100)) throw failure('Invalid bounded platform control'); this.controls[key][name] = number; } return clone(this.controls); }
  async boundary(name) { const delay = this.controls.delay[name] || 0; if (delay) await new Promise((done) => setTimeout(done, delay)); if (this.controls.fail[name] > 0) { this.controls.fail[name]--; throw failure('Controlled ' + name + ' failure', 'controlled_' + name); } }
  assertNote(id) { const note = this.workspace.notes.find((item) => item.id === id); if (!note) throw failure('Note does not exist'); if (note.deletedAt) throw failure('Note is deleted', 'access_denied'); if (note.locked && !this.unlocked?.has(id)) throw failure('Note is locked', 'access_denied'); return note; }
  async call(command, args = {}) {
    this.calls.push({ command, ...(args.purpose?{purpose:args.purpose,id:args.id,pixels:args.pixels}:{}), type: args.action?.type || args.command?.type, ...(args.operationId ? { operationId: args.operationId } : {}), ...(args.noteId ? { noteId: args.noteId } : {}) }); if (this.calls.length > 1000) this.calls.shift();
    const before = this.sequence; const beforeAttachments=new Map(this.workspace.attachments.map(a=>[a.id,JSON.stringify(a)])); const events = []; let value;
    try {
      if (command === 'load_workspace') { await this.boundary('load'); value = this.state(); }
      else if (command === 'register_save_intent' || command === 'acknowledge_access') value = null;
      else if (command === 'read_note_text') { const note = this.assertNote(args.id); value = this.tagged({ title: note.title, text: note.plainText }); }
      else if (command === 'workspace_action') value = await this.action(args.action || {});
      else if (command === 'account_command') value = await accountFixture(this, args.command);
      else if (command === 'sync_command') { if (args.expected?.sessionId !== this.sessionId || args.expected?.epoch !== this.accessEpoch) throw failure('Stale local sync authority', 'access_changed'); value = await this.syncCommand(args.command); }
      else if (command === 'store_attachment' || command === 'store_attachment_operation') {
        this.assertNote(args.noteId); await this.boundary('store');
        if (command === 'store_attachment_operation' && this.journal.has(args.operationId)) value = this.tagged(this.journal.get(args.operationId));
        else { const attachment = { id: randomUUID(), noteId: args.noteId, kind: args.mime?.startsWith('audio/') ? 'audio' : args.mime?.startsWith('image/') ? 'image' : args.mime?.startsWith('video/') ? 'video' : 'file', displayName: args.name, mime: args.mime, size: Buffer.from(args.data, 'base64').length, relativePath: 'synthetic/' + randomUUID(), ...(args.recordedAt == null ? {} : { recordedAt: args.recordedAt }) }; this.files.set(attachment.id, args.data); this.workspace.attachments.push(attachment); this.sequence++; const result = { operationId: args.operationId, noteId: args.noteId, status: 'stored', attachment }; if (args.operationId) this.journal.set(args.operationId, result); value = this.tagged(command === 'store_attachment' ? attachment : result); await this.boundary('storeResponse'); }
      } else if (command === 'query_attachment_operation' || command === 'cancel_attachment_operation') {
        await this.boundary('query'); const operation = this.journal.get(args.operationId); if (operation && command === 'cancel_attachment_operation') operation.status = 'aborted'; if (operation && command === 'query_attachment_operation' && JSON.stringify(this.workspace.notes.find((n) => n.id === operation.noteId)?.document).includes(operation.attachment.id)) operation.status = 'committed'; value = this.tagged(operation || { operationId: args.operationId, noteId: args.noteId, status: 'notPersisted' });
      } else if(command === 'acquire_attachment_source') {
        await this.boundary('media');const a=this.workspace.attachments.find(a=>a.id===args.id);if(!a)throw failure('Attachment absent','not_found');this.assertNote(a.noteId);
        if(this.suspended.includes(a.noteId)||this.operationId)throw failure('Preparing','access_changed');
        if(args.expected?.sessionId!==this.sessionId||args.expected?.epoch!==this.accessEpoch||args.expected?.noteEpoch!==(this.noteEpochs[a.noteId]||0))throw failure('Stale media authority','access_changed');
        if(args.purpose==='thumbnail'&&!['image','video'].includes(a.kind))throw failure('No thumbnail','unsupported_media');
        if(args.purpose==='thumbnail'&&a.kind==='video')throw failure('Video poster provider pending99C','unsupported_media');
        const leaseId=randomUUID().replaceAll('-','');const mime=args.purpose==='thumbnail'?'image/png':a.mime;
        this.mediaLeases.set(leaseId,{id:a.id,owner:a.noteId,purpose:args.purpose,epoch:this.noteEpochs[a.noteId]||0,session:this.sessionId});
        value=this.tagged({leaseId,url:this.mediaOrigin+'/media/'+leaseId,mime,bytes:args.purpose==='thumbnail'?68:a.size,name:a.displayName,width:args.purpose==='thumbnail'?1:null,height:args.purpose==='thumbnail'?1:null,attachmentId:a.id,noteId:a.noteId,purpose:args.purpose});
      } else if(command==='release_attachment_source'){this.mediaLeases.delete(args.leaseId);value=null;}
      else if(command==='clear_attachment_media_cache'){value=this.tagged({cleared:true});}
      else if (command === 'read_attachment') { await this.boundary('read'); const attachment = this.workspace.attachments.find((item) => item.id === args.id); if (!attachment) throw failure('Attachment absent'); this.assertNote(attachment.noteId); value = this.tagged({ data: this.files.get(args.id), mime: attachment.mime, name: attachment.displayName, recordedAt: attachment.recordedAt }); }
      else if (command === 'get_data_management') {
        await this.boundary('inventory');
        const files = [
          { relativePath: 'notes.sqlite3', category: 'database', size: 32768, modifiedAt: 1760000000000, exists: true, status: 'file' },
          { relativePath: 'notes.sqlite3-wal', category: 'wal', size: 8192, modifiedAt: 1760000001000, exists: true, status: 'file' },
          { relativePath: 'notes.sqlite3-shm', category: 'shm', size: null, modifiedAt: null, exists: false, status: 'missing' },
          ...this.workspace.attachments.map(a => { const encoded = this.files.get(a.id); return { relativePath: 'attachments/' + a.relativePath, category: 'attachment', size: encoded === undefined ? null : Buffer.from(encoded, 'base64').length, modifiedAt: encoded === undefined ? null : 1760000002000, exists: encoded !== undefined, status: encoded === undefined ? 'missing' : 'file', attachment: { id: a.id, noteId: a.noteId, kind: a.kind, mime: a.mime, displayName: this.state().access.notes[a.noteId]?.authorized ? a.displayName : null, declaredSize: a.size, referenced: JSON.stringify(this.workspace.notes.find(n => n.id === a.noteId)?.document).includes(a.id), exportable: encoded !== undefined && !!this.state().access.notes[a.noteId]?.authorized } }; }),
          ...clone(this.dataExtras),
        ];
        const bytes = category => files.filter(f => f.category === category && f.status === 'file').reduce((n,f) => n + (f.size || 0),0);
        value = this.tagged({ version: 1, mediaCache:{version:1,bytes:68,files:1,quota:268435456}, capturedAt: Date.now(), rootPath: '/synthetic-fixture/local-data', files, totals: { databaseBytes: bytes('database'), auxiliaryBytes: bytes('wal') + bytes('shm'), attachmentBytes: bytes('attachment'), otherBytes: bytes('other') + bytes('import'), totalBytes: files.filter(f=>f.status==='file').reduce((n,f)=>n+(f.size||0),0), declaredAttachmentBytes: this.workspace.attachments.reduce((n,a)=>n+a.size,0) }, counts: { notes: this.workspace.notes.length, folders: this.workspace.folders.length, attachments: this.workspace.attachments.length, physicalFiles: files.filter(f=>f.status==='file').length, missingAttachments: files.filter(f=>f.attachment && !f.exists).length }, warnings: [] });
      }
      else if (command === 'export_attachment') {
        await this.boundary('export');
        const a = this.workspace.attachments.find(x => x.id === args.id);
        if (!a) throw failure('Attachment absent'); this.assertNote(a.noteId);
        if (args.expected?.sessionId !== this.sessionId || args.expected?.epoch !== this.accessEpoch || args.expected?.noteEpoch !== (this.noteEpochs[a.noteId] || 0)) throw failure('Stale export authority', 'access_changed');
        const encoded = this.files.get(a.id); if (encoded === undefined) throw failure('Attachment file missing');
        const bytes = Buffer.from(encoded,'base64'); if (bytes.length !== a.size) throw failure('Attachment length mismatch');
        this.exports.push({ id:a.id, path:args.path, data:encoded }); value = { name:a.displayName, bytes:bytes.length, mime:a.mime };
      }
      else if (command === 'register_recording_local') { if (this.local && this.local.sessionId !== args.sessionId) throw failure('Another recording is active'); value = this.local ||= { ...args, owner: 'main', incarnation: randomUUID() }; }
      else if (command.startsWith('recording_local_')) { if (command === 'recording_local_release' && !this.local && this.completed && args.sessionId === this.completed.sessionId) value = null; else { if (!this.local || args.sessionId !== this.local.sessionId || args.operationId !== this.local.operationId || args.incarnation !== this.local.incarnation) throw failure('Stale local recording identity'); if (command === 'recording_local_revision') { await this.boundary('revision'); if (args.revision !== this.revision && args.revision !== this.revision + 1) throw failure('Wrong recording revision'); this.revision = args.revision; this.final = args.finalIntent; } else if (command === 'recording_local_release') { await this.boundary('release'); if (args.saved && (!this.final || args.revision !== this.revision)) throw failure('Missing final recording acknowledgement'); this.completed = clone(args); this.local = null; this.revision = 0; this.final = false; } else if (!['recording_local_started', 'recording_local_validate'].includes(command)) throw failure('Unknown local command'); value = null; } }
      else if (command === 'recording_quit_sealed') { this.quit = args.id; events.push({ name: 'notes-recording-quit-ready', payload: { id: args.id } }); value = null; }
      else if (command === 'recording_quit_ack') { this.quitAck = clone(args); if (!args.success) events.push({ name: 'notes-recording-quit-cancelled', payload: { id: args.id } }); value = null; }
      else if (command === 'plugin:notes-scan|execute') value = await this.ocr(args.request);
      else if (command === 'export_archive') { await this.boundary('archive'); await writeFile(this.directory + '/fixture-export.json', JSON.stringify({workspace:this.workspace,files:[...this.files]})); value = null; }
      else if (command === 'import_archive') { await this.boundary('archive'); const saved = JSON.parse(await readFile(this.directory + '/fixture-export.json', 'utf8')); this.workspace = saved.workspace; this.files = new Map(saved.files); this.sequence++; value = this.state(); }
      else throw failure('Unsupported fixture IPC ' + command, 'fixture_unsupported');
      if (before !== this.sequence) events.push({ name: 'notes-metadata', payload: { metadata: this.state().metadata,changes:[...this.workspace.attachments.filter(a=>beforeAttachments.get(a.id)!==JSON.stringify(a)).map(a=>({kind:'attachment',id:a.id})),...Array.from(beforeAttachments.keys()).filter(id=>!this.workspace.attachments.some(a=>a.id===id)).map(id=>({kind:'attachment',id})),...(args.action?.id?[{kind:'note',id:args.action.id}]:[])] } });
      return { ok: true, value, events };
    } catch (error) { return { ok: false, error: { code: error.code || 'fixture_error', message: error.message }, events }; }
  }
  // Explicit UI-only synchronization fixture. No network, Store, pairing or
  // causal merge is implemented here; production sync is never replaced.
  async syncCommand(command) {
    if (!command || typeof command.type !== 'string') throw failure('Invalid sync fixture command');
    await this.boundary('sync');
    await this.boundary('sync-' + command.type);
    this.sync ||= { state: 'disabled', deviceName: '', peers: [], pendingCount: 0, conflictCount: 0 };
    let invitation, conflicts;
    switch (command.type) {
      case 'status': break;
      case 'startHost': this.sync = { ...this.sync, state: 'listening', deviceName: command.deviceName, workspaceId: 'ui-fixture-workspace', deviceId: 'ui-fixture-host', listenAddress: '0.0.0.0:' + command.port }; break;
      case 'createInvite': invitation = 'EXPLICIT-UI-FIXTURE-NOT-A-REAL-INVITATION'; break;
      case 'pair': this.sync = { ...this.sync, state: 'idle', deviceName: command.deviceName, workspaceId: 'ui-fixture-workspace', deviceId: 'ui-fixture-client', peers: [{ id: 'ui-fixture-peer', name: 'UI fixture Mac', connected: true }] }; break;
      case 'syncNow': this.sync.state = 'idle'; this.sync.lastSyncAt = Date.now(); break;
      case 'stop': this.sync.state = 'paused'; break;
      case 'resume': this.sync.state = 'idle'; break;
      case 'revoke': this.sync.peers = this.sync.peers.filter(peer => peer.id !== command.peerId); break;
      case 'conflicts': conflicts = clone(this.syncConflicts || []); break;
      case 'resolve': this.syncConflicts = (this.syncConflicts || []).filter(row => row.entityId !== command.entityId || row.kind !== command.kind); this.sync.conflictCount = this.syncConflicts.length; conflicts = clone(this.syncConflicts); break;
      default: throw failure('Unknown sync fixture command');
    }
    return { status: clone(this.sync), ...(invitation ? { invitation } : {}), ...(conflicts ? { conflicts } : {}) };
  }
  async action(action) {
    const type = action.type; let value;
    if (type === 'settings') {
      await this.boundary('settings');
      // Model the native atomic settings merge, not a frontend snapshot write.
      // Failure boundaries remain observable. F1 captures actual App patches
      // and replays them against production SQLite Store to check this model.
      const current = this.workspace.settings, patch = action.settings;
      const appearance = patch.appearance || {
        ...(current.appearance || { version: 2, themeId: 'classic', schemePreference: current.theme || 'system' }),
        ...(Object.hasOwn(patch, 'theme') ? { schemePreference: patch.theme } : {}),
      };
      Object.assign(current, patch, { appearance, theme: appearance.schemePreference });
      value = this.workspace;
    }
    else if (type === 'createNote') { await this.boundary('create'); const note = { ...seededWorkspace().notes[0], id: randomUUID(), folderId: action.folderId || 'default', title: '新备忘录', plainText: '', document: document(''), createdAt: Date.now(), updatedAt: Date.now(), revision: 0 }; this.workspace.notes.unshift(note); value = note; }
    else if (type === 'saveNote') { await this.boundary('save'); const note = this.assertNote(action.id); if (action.revision !== note.revision) throw failure('Controlled revision conflict', 'conflict'); note.document = clone(action.document); note.plainText = textOf(note.document); note.title = note.plainText.split('\n')[0] || '新备忘录'; note.updatedAt = Date.now(); note.revision++; value = note; }
    else if (type === 'createFolder' || type === 'createSmartFolder') { const input = type === 'createSmartFolder' ? action.input : action; const folder = { id: randomUUID(), name: input.name, parentId: input.parentId || null, sortOrder: Date.now(), createdAt: Date.now(), kind: type === 'createSmartFolder' ? 'smart' : 'normal', ...(type === 'createSmartFolder' ? { query: clone(input.query), definitionRevision: 1 } : {}) }; this.workspace.folders.push(folder); value = folder; }
    else if (type === 'renameFolder' || type === 'updateSmartFolder') { const input = action.input || action; const folder = this.workspace.folders.find((f) => f.id === input.id); if (!folder) throw failure('Folder absent'); if (type === 'updateSmartFolder' && folder.definitionRevision !== input.expectedDefinitionRevision) throw failure('Smart folder changed', 'smart_conflict'); folder.name = input.name; if (type === 'updateSmartFolder') { folder.query = clone(input.query); folder.definitionRevision++; } value = folder; }
    else if (type === 'deleteFolder' || type === 'deleteSmartFolder') { const id = action.input?.id || action.id; this.workspace.folders = this.workspace.folders.filter((f) => f.id !== id); if (type === 'deleteFolder') for (const n of this.workspace.notes.filter((n) => n.folderId === id)) { n.originalFolderId = 'default'; n.folderId = 'trash'; n.deletedAt = Date.now(); n.revision++; } value = this.workspace; }
    else if (type === 'patchNote') { const note = this.assertNote(action.id); for (const key of ['folderId', 'pinned', 'paperStyle']) if (key in action) note[key] = action[key]; note.revision++; value = note; }
    else if (['deleteNote', 'restoreNote', 'purgeNote'].includes(type)) { const note = this.workspace.notes.find((n) => n.id === action.id); if (!note) throw failure('Note absent'); if (type === 'purgeNote') this.workspace.notes = this.workspace.notes.filter((n) => n !== note); else { if (type === 'deleteNote') { note.originalFolderId = note.folderId; note.folderId = 'trash'; note.deletedAt = Date.now(); } else { note.folderId = note.originalFolderId || 'default'; note.deletedAt = null; } note.revision++; } value = this.workspace; }
    else if (['lockNote', 'unlockNote', 'removeLock', 'closeLocks'].includes(type)) { const note = this.workspace.notes.find((n) => n.id === action.id); this.unlocked ||= new Set(); if (type === 'closeLocks') this.unlocked.clear(); else if (!note) throw failure('Note absent'); else if (type === 'lockNote') { note.locked = true; this.passwords.set(note.id, action.password || action.value || 'fixture-password'); this.unlocked.delete(note.id); } else { if (this.passwords.get(note.id) !== (action.password || action.value)) throw failure('密码错误', 'wrong_password'); this.unlocked.add(note.id); if (type === 'removeLock') note.locked = false; } value = this.workspace; }
    else throw failure('Unsupported fixture action ' + type, 'fixture_unsupported');
    if (type !== 'settings') this.sequence++;
    return this.tagged(value);
  }
  async ocr(request) {
    await this.boundary('ocr'); const { operation, sessionId } = request;
    if (operation === 'begin') { const session = { version: 1, sessionId: randomUUID(), mode: request.mode, state: 'draft', createdAt: Date.now(), updatedAt: Date.now(), files: [], pages: [], ocr: null, pdfToken: null }; this.scan.set(session.sessionId, session); return clone(session); }
    const session = this.scan.get(sessionId); if (!session) throw failure('OCR session absent');
    if (['ingestImage', 'pickImage', 'openCamera'].includes(operation)) session.files = [{ token: randomUUID(), mime: 'image/png', size: 68, width: 1, height: 1 }];
    else if (operation === 'recognize') session.ocr = { status: 'recognized', text: 'Synthetic OCR fixture text', fileToken: request.fileToken, lines: [{ text: 'Synthetic OCR fixture text' }], engine: 'explicit-fake-ocr', revision: 1, languages: ['en'] };
    else if (operation === 'finish') session.state = 'ready';
    else if (['acknowledge', 'cancel'].includes(operation)) { this.scan.delete(sessionId); return { removed: true }; }
    else if (operation !== 'get') throw failure('Unsupported OCR fixture operation');
    return clone(session);
  }
  close() {}
}

// Runs before any application module. No application state/handler is replaced.
export function installBrowserPlatform({ mobile = false, nativeToolbar = false } = {}) {
  Object.defineProperty(navigator, 'platform', { value: mobile ? 'Android' : nativeToolbar ? 'MacIntel' : 'Linux' });
  const nativePerformanceNow = performance.now.bind(performance); let offset = 0; const intervals = new Map(); const timers = { set: window.setInterval.bind(window), clear: window.clearInterval.bind(window) };
  Object.defineProperty(performance, 'now', { value: () => nativePerformanceNow() + offset });
  window.setInterval = (fn, ms, ...args) => { const id = timers.set(fn, ms, ...args); intervals.set(id, () => fn(...args)); return id; };
  window.clearInterval = (id) => { intervals.delete(id); timers.clear(id); };
  const control = window.__DEBUG_PLATFORM__ = { kind: 'synthetic-device-and-ipc-boundaries', fail: {}, calls: [], events: [], streams: 0, starts: 0, stops: 0, trackStops: 0, contexts: 0, decodes: 0, generatedFrames: 0, quitAcknowledgements: [], clipboard: '', destroyed: false, dialogResults: {save:[],open:[]}, dialogDelay: 0,
    advance(ms) { if (!Number.isFinite(ms) || ms < 0 || ms > 120000) throw Error('advance is bounded to 120000ms'); offset += ms; for (const tick of intervals.values()) tick(); return performance.now(); },
    async configure(value) { if (value.dialog) for (const kind of ['save','open']) { if (value.dialog[kind]) { if (!Array.isArray(value.dialog[kind]) || value.dialog[kind].some(x=>x!==null&&typeof x!=='string')) throw Error('Invalid synthetic dialog result'); control.dialogResults[kind].push(...value.dialog[kind]); } } for (const [key, count] of Object.entries(value.mediaFail || {})) { if (!Number.isInteger(count) || count < 0 || count > 100) throw Error('Invalid media failure count'); control.fail[key] = count; } if (value.fail || value.delay) return fetch('/__debug_control', { method: 'POST', body: JSON.stringify({ ...(value.fail ? { fail: value.fail } : {}), ...(value.delay ? { delay: value.delay } : {}) }) }).then((r) => r.json()); },
    emit(name, payload) { return Promise.all((listeners.get(name) || []).map((id) => Promise.resolve(callbacks.get(id)?.({ event: name, id, payload })))); },
    async closeIntent() { let prevented = false; await Promise.all((listeners.get('tauri://close-requested') || []).map((id) => Promise.resolve(callbacks.get(id)?.({ event: 'tauri://close-requested', id, payload: { preventDefault() { prevented = true; } } })))); return { simulated: true, prevented }; },
    async quitIntent() { const id = crypto.randomUUID(); await control.emit('notes-recording-quit', { id }); return { id, simulated: true, osTerminationTested: false }; },
    async backIntent(canGoBack = false) { if (typeof canGoBack !== 'boolean') throw Error('canGoBack must be boolean'); const rows = [...appListeners.values()]; for (const row of rows) callbacks.get(row.id)?.({ index: row.index++, message: { canGoBack } }); return { simulated: true, dispatched: rows.length, nativeBackTested: false }; },
    dispose() { for (const id of intervals.keys()) timers.clear(id); intervals.clear(); for (const row of appListeners.values()) callbacks.delete(row.id); appListeners.clear(); for (const context of contexts) void context.close(); delete window.__DEBUG_PLATFORM__; },
  };
  const fail = (name) => { if (control.fail[name] > 0) { control.fail[name]--; throw Error('Controlled ' + name + ' device failure'); } };
  const callbacks = new Map(), listeners = new Map(), appListeners = new Map(); let callbackId = 0;
  let toolbarState; control.toolbarStates = [];
  const toolbarInfo = () => ({windowLabel:'main',bindingId:'synthetic-toolbar82',stateRevision:toolbarState?.revision || 0,native:{material:'legacyHeader',reservedTop:52,contentWidth:1280,active:true,overflowActions:[],searchSequence:0,fullSizeContent:true,symbolFallbacks:[],windowNumber:0,scaleFactor:1}});
  window.isTauri = true; window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } }, transformCallback(fn) { const id = ++callbackId; callbacks.set(id, fn); return id; }, unregisterCallback(id) { callbacks.delete(id); }, convertFileSrc: (path) => path,
    async invoke(command, args = {}) {
      control.calls.push({ command, type: args.action?.type }); if (control.calls.length > 1000) control.calls.shift();
      if (command === 'plugin:event|listen') { const ids = listeners.get(args.event) || []; ids.push(args.handler); listeners.set(args.event, ids); return args.handler; }
      if (command === 'plugin:event|unlisten') { for (const [name, ids] of listeners) listeners.set(name, ids.filter((id) => id !== args.eventId)); return; }
      if (command === 'plugin:event|emit' || command === 'plugin:event|emit_to') { control.emit(args.event, args.payload); return; }
      if (command === 'plugin:dialog|save' || command === 'plugin:dialog|open') { if (control.dialogDelay) await new Promise(done=>setTimeout(done,control.dialogDelay)); const kind=command.endsWith('|save')?'save':'open'; return control.dialogResults[kind].length ? control.dialogResults[kind].shift() : '/synthetic-fixture/fixture-export.json'; }
      if (nativeToolbar && command.startsWith('plugin:notes-ui|')) {
        if (command.endsWith('|keyboard_navigation')) return {enabled:true};
        if (command.endsWith('|unbind')) return null;
        if (command.endsWith('|bind') || command.endsWith('|update')) { toolbarState=args.toolbar; control.toolbarStates.push(structuredClone(toolbarState)); return toolbarInfo(); }
        if (command.endsWith('|inspect') || command.endsWith('|focus_search')) return toolbarInfo();
      }
      if (command === 'plugin:notes-ui|recording_access') { fail('authorization'); return { status: 'authorized' }; }
      if (command.startsWith('plugin:window|') || command.startsWith('plugin:webview|') || command.startsWith('plugin:webview-window|')) { if (command.endsWith('|close')) { await control.emit('tauri://close-requested', null); return; } if (command.endsWith('|destroy')) control.destroyed = true; if (command.endsWith('|is_focused')) return true; return null; }
      if (command === 'plugin:app|exit') { control.exited = true; return control.quitIntent(); }
      if ((command === 'plugin:app|register_listener' || command === 'plugin:app|registerListener') && args.event === 'back-button') { if (!Number.isInteger(args.handler?.id) || !callbacks.has(args.handler.id)) throw Error('Invalid synthetic back-button channel'); appListeners.set(args.handler.id, { id: args.handler.id, index: 0 }); return null; }
      if ((command === 'plugin:app|remove_listener' || command === 'plugin:app|removeListener') && args.event === 'back-button') { if (!Number.isInteger(args.channelId)) throw Error('Invalid synthetic back-button channel id'); appListeners.delete(args.channelId); callbacks.delete(args.channelId); return null; }
      const response = await fetch('/__debug_ipc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ command, args }) }).then((r) => r.json());
      for (const event of response.events || []) { control.events.push(event.name); control.emit(event.name, event.payload); }
      if (command === 'recording_quit_ack') control.quitAcknowledgements.push(args);
      if (!response.ok) throw response.error; return response.value;
    },
  };
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { control.clipboard = text; }, readText: async () => control.clipboard } });
  const createURL = URL.createObjectURL.bind(URL), revokeURL = URL.revokeObjectURL.bind(URL);
  control.objectURLs = { created: 0, revoked: 0, live: [] };
  URL.createObjectURL = (blob) => { const url = createURL(blob); control.objectURLs.created++; control.objectURLs.live.push(url); return url; };
  URL.revokeObjectURL = (url) => { if (control.objectURLs.live.includes(url)) { control.objectURLs.revoked++; control.objectURLs.live = control.objectURLs.live.filter((item) => item !== url); } return revokeURL(url); };
  const NativeContext = window.AudioContext; const contexts = [];
  const sourceContext = new NativeContext({ sampleRate: 24000 }); contexts.push(sourceContext); const destination = sourceContext.createMediaStreamDestination(); const oscillator = sourceContext.createOscillator(); oscillator.frequency.value = 440; oscillator.connect(destination); oscillator.start(); void sourceContext.resume();
  const nativeDecode = NativeContext.prototype.decodeAudioData;
  NativeContext.prototype.decodeAudioData = function (...args) { control.decodes++; try { fail('decode'); } catch (error) { return Promise.reject(error); } return nativeDecode.apply(this, args); };
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => { fail('permission'); control.streams++; const stream = destination.stream.clone(); for (const track of stream.getTracks()) { const stop = track.stop.bind(track); track.stop = () => { control.trackStops++; stop(); }; } return stream; } } });
  // MediaRecorder emits one continuous container, not a complete cumulative
  // WAV at each requestData(). Unknown RIFF/data lengths keep every prefix
  // decodable; subsequent events contain only PCM since the previous event.
  function wavChunk(recorder, elapsed) {
    const end = Math.max(480, Math.min(24000 * 120, Math.round(elapsed * 24)));
    const start = recorder.emittedFrames || 0, frames = Math.max(0, end - start);
    const header = recorder.headerEmitted ? 0 : 44;
    const bytes = new ArrayBuffer(header + frames * 2), view = new DataView(bytes);
    if (header) {
      const text = (at, value) => { for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i)); };
      text(0, 'RIFF'); view.setUint32(4, 0xffffffff, true); text(8, 'WAVE'); text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 24000, true); view.setUint32(28, 48000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, 0xffffffff, true);
    }
    for (let i = 0; i < frames; i++) view.setInt16(header + i * 2, Math.round(Math.sin((start + i) / 24000 * Math.PI * 880) * 4096), true);
    recorder.emittedFrames = end; recorder.headerEmitted = true; control.generatedFrames += frames;
    return new Blob([bytes], { type: 'audio/wav' });
  }
  const nativePlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) { try { fail('play'); } catch (error) { return Promise.reject(error); } return nativePlay.apply(this, args); };
  window.MediaRecorder = class SyntheticMediaRecorder {
    static isTypeSupported() { return true; }
    constructor() { this.state = 'inactive'; this.mimeType = 'audio/wav'; }
    start() { fail('start'); this.state = 'recording'; this.startedAt = performance.now(); this.activeMs = 0; this.emittedFrames = 0; this.headerEmitted = false; control.starts++; }
    pause() { fail('pause'); this.activeMs += performance.now() - this.startedAt; this.state = 'paused'; queueMicrotask(() => this.onpause?.(new Event('pause'))); }
    resume() { this.startedAt = performance.now(); this.state = 'recording'; }
    requestData() { fail('seal'); const data = wavChunk(this, this.activeMs + (this.state === 'recording' ? performance.now() - this.startedAt : 0)); queueMicrotask(() => this.ondataavailable?.({ data })); }
    stop() { fail('seal'); const elapsed = this.activeMs + (this.state === 'recording' ? performance.now() - this.startedAt : 0); this.state = 'inactive'; control.stops++; const data = wavChunk(this, elapsed); queueMicrotask(() => { this.ondataavailable?.({ data }); this.onstop?.(new Event('stop')); }); }
  };
}
