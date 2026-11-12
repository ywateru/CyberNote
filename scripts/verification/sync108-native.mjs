#!/usr/bin/env node
// Two actual native Tauri processes, same binary, independent fresh Store roots.
// This runner never replaces Session, quiet-window handlers, transport or save ACKs.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile, copyFile, chmod, readdir } from "node:fs/promises";
import { resolve, relative, sep, isAbsolute } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { NativeApp, until, delay } from "./sync108-native-driver.mjs";
import { productFiles, sourceIdentity } from "../build-info.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
async function fileHash(path) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest("hex");
}
function options(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i];
    if (name === "--smoke") { assert(!result.smoke, "Duplicate --smoke"); result.smoke = true; }
    else {
      assert(["--binary", "--output", "--root", "--build-record"].includes(name), "Unknown option");
      const key = name.slice(2);
      assert(!result[key] && argv[i + 1] && !argv[i + 1].startsWith("--"), "Missing or duplicate option");
      result[key] = argv[++i];
    }
  }
  assert(result.binary && result.output, "Usage: node scripts/verification/sync108-native.mjs --binary ABS_BINARY --output FRESH_ABS_DIR [--root SOURCE_ROOT] [--build-record JSON] [--smoke]");
  assert(isAbsolute(result.binary) && isAbsolute(result.output), "Binary and output must be absolute paths");
  return result;
}
async function fingerprint(root) {
  const paths = productFiles(root);
  const sources = {};
  for (const path of [...new Set(paths)].sort()) sources[path] = await fileHash(resolve(root, path));
  return { sha256: sourceIdentity(root).sourceFingerprint, algorithm: "build-info.sourceIdentity/productFiles", files: sources };
}
async function distFingerprint(root) {
  const base = resolve(root, "dist");
  const files = {};
  for (const entry of await readdir(base, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      const path = resolve(entry.parentPath, entry.name);
      files[relative(base, path)] = await fileHash(path);
    }
  }
  assert(Object.keys(files).length, "Static frontend dist must exist");
  return { sha256: hash(JSON.stringify(Object.fromEntries(Object.entries(files).sort()))), files };
}
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZkAAAAASUVORK5CYII=", "base64");
const txt = Buffer.from("原始附件：中文 UTF-8\r\nsecond line\nNUL:\0 完。\n", "utf8");
const refs = (node) => [...(node?.type === "attachment" ? [node.attrs.id] : []), ...(node?.content || []).flatMap(refs)];
const documentFor = (text) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const bodyDigest = (note) => hash(JSON.stringify({ document: note.document, plainText: note.plainText }));
const projection = (ws) => ({
  folders: ws.folders.map(({ createdAt, definitionRevision, ...f }) => f).sort((a, b) => a.id.localeCompare(b.id)),
  notes: ws.notes.map(({ revision, ...note }) => note).sort((a, b) => a.id.localeCompare(b.id)),
  attachments: ws.attachments.map(({ relativePath, ...a }) => a).sort((a, b) => a.id.localeCompare(b.id)),
});

class Device {
  constructor(app) { this.app = app; }
  async command(command, args = {}) {
    const result = await this.app.execute(command, args);
    await this.app.idle();
    return result;
  }
  async state() { return this.app.state(); }
  async workspace() { return (await this.state()).workspace; }
  async note(id) { return (await this.workspace()).notes.find((n) => n.id === id); }
  async select(id) { await this.command("note.select", { id }); }
  async create(text) {
    await this.command("folder.select", { id: "default" });
    await this.command("note.create");
    await this.command("editor.insertText", { text });
    const id = (await this.state()).selection.noteId;
    assert(id, "Real create receipt selects a note");
    return id;
  }
  async edit(id, text) {
    await this.select(id);
    await this.command("editor.setContent", { document: documentFor(text) });
  }
  async enterSync() {
    if (!(await this.state()).preferences.open) await this.command("settings.open");
    await this.command("settings.tab", { tab: "sync" });
  }
  async leaveSync() {
    // Switching away clears invitation/confirmation before closing preferences.
    await this.command("settings.tab", { tab: "settings" });
    await this.command("app.back");
  }
  async sync(command, args = {}) {
    await this.enterSync();
    await this.command(command, args);
    const value = (await this.state()).synchronization;
    assert(!value.error, "Sync UI reports no operation failure");
    await this.leaveSync();
    return value.status;
  }
  async conflicts() {
    await this.enterSync();
    await this.command("sync.conflicts");
    // Read the real rendered conflict rows. No direct Session query is needed.
    return this.app.evaluate(`Array.from(document.querySelectorAll('.sync-conflict')).map(article => ({
      titles:Array.from(article.querySelectorAll('.sync-variant strong')).map(n=>n.textContent),
      variants:article.querySelectorAll('.sync-variant').length
    }))`);
  }
  async readOriginal(id, noteId) {
    // Read-only existing production IPC with a token captured from actual App
    // state. No invented Session identity or access epochs.
    return this.app.evaluate(`(async () => {
      const s = (await window.__NOTES_DEBUG__.execute('app.state')).result;
      const access = s.workspace.access, owner = access.notes[arg.noteId];
      if (!owner?.authorized) throw Error();
      return window.__TAURI_INTERNALS__.invoke('read_attachment', {id:arg.id, expected:{
        sessionId:access.sessionId,epoch:access.epoch,noteEpoch:owner.epoch
      }});
    })()`, { id, noteId });
  }
}

async function freePort() {
  const server = createServer();
  return new Promise((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : done(port));
    });
  });
}

async function readOnlyEvidence(directory, snapshotDirectory) {
  // Owned apps must already have exited. A nonempty WAL is valid persisted
  // state; immutable=1 would silently ignore it. Read an owned DB/WAL/SHM copy
  // with SQLite mode=ro, and prove every original file remains byte-identical.
  await mkdir(snapshotDirectory);
  const originalFiles = {};
  for (const name of ["notes.sqlite3", "notes.sqlite3-wal", "notes.sqlite3-shm"]) {
    try {
      originalFiles[name] = await fileHash(resolve(directory, name));
      await copyFile(resolve(directory, name), resolve(snapshotDirectory, name));
    } catch (error) { if (error.code !== "ENOENT" || name === "notes.sqlite3") throw error; }
  }
  const script = `import sqlite3,hashlib,json,os,sys
from pathlib import Path
p=os.path.join(sys.argv[1],'notes.sqlite3')
wal=p+'-wal'
h=lambda:hashlib.sha256(open(p,'rb').read()).hexdigest()
before=h()
c=sqlite3.connect(Path(p).as_uri()+'?mode=ro',uri=True)
c.execute('pragma query_only=on')
tables=['notes','attachments','sync_heads','sync_inbox','sync_dirty','sync_projection']
present={row[0] for row in c.execute("select name from sqlite_master where type='table'")}
r={'integrity':c.execute('pragma integrity_check').fetchone()[0], 'counts':{t:c.execute('select count(*) from '+t).fetchone()[0] for t in tables if t in present}, 'absentSyncTables':[t for t in tables if t not in present], 'identity':c.execute('select workspace_id,device_id from sync_identity').fetchall() if 'sync_identity' in present else [], 'projection':c.execute('select kind,entity_id,digest from sync_projection order by kind,entity_id').fetchall() if 'sync_projection' in present else [], 'databaseSha256':before, 'readOnlySnapshot':True, 'walBytes':os.path.getsize(wal) if os.path.exists(wal) else 0}
c.close()
r['snapshotDatabaseUnchanged']=before==h()
assert r['snapshotDatabaseUnchanged'] and r['integrity']=='ok'
print(json.dumps(r))`;
  const value = JSON.parse(execFileSync("python3", ["-c", script, snapshotDirectory], { encoding: "utf8", maxBuffer: 8_000_000, stdio: ["ignore", "pipe", "pipe"] }));
  for (const [name, before] of Object.entries(originalFiles)) assert.equal(await fileHash(resolve(directory, name)), before, "Original SQLite evidence file remains unchanged");
  return { ...value, originalFiles, originalFilesUnchanged: true, snapshotDirectory };
}

export async function run(argv = process.argv.slice(2)) {
  const opts = options(argv);
  const root = resolve(opts.root || process.cwd()), output = resolve(opts.output);
  assert(output !== root && !output.startsWith(root + sep), "Evidence must be outside the source tree");
  await mkdir(output); // Existing output is rejected; never reuse or delete user data.
  const binary = resolve(output, "sync108-native-app");
  await copyFile(opts.binary, binary);
  await chmod(binary, 0o700);
  const binarySha256 = await fileHash(binary);
  assert.equal(binarySha256, await fileHash(opts.binary), "Owned binary snapshot matches input");
  const sourceBefore = await fingerprint(root), distBefore = await distFingerprint(root);
  const report = {
    schema: 1, kind: "two-native-tauri-apps", startedAt: new Date().toISOString(),
    sourceHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    sourceBefore, staticFrontendBefore: distBefore,
    tools: Object.fromEntries(await Promise.all(["sync108-native.mjs", "sync108-native-driver.mjs"].map(async (name) => [name, await fileHash(fileURLToPath(new URL(name, import.meta.url)))]))),
    binary: { path: binary, sha256: binarySha256 },
    frontend: { buildCommand: "NODE_ENV=development VITE_NOTES_DEBUG=1 pnpm build", staticDebug: true,
      differencesFromProduction: ["import.meta.env.DEV=true", "VITE_NOTES_DEBUG=1", "NODE_ENV=development", "Rust sync-e2e feature and debug_assertions", "NOTES_SYNC_E2E=1 owned child environment"] },
    environment: { platform: process.platform, arch: process.arch, node: process.version },
    checks: [], observations: [], processes: [], databaseEvidence: [],
    limitations: ["Synthetic test notes and File[] from the existing attachment.submit handler; no OS file-picker or physical keyboard claim.",
      "Raw expressions execute only in the explicitly enabled test feature; read_attachment uses the actual App access snapshot.",
      "No Android results are implied by the desktop suite."] ,
  };
  if (opts["build-record"]) {
    const record = JSON.parse(await readFile(resolve(opts["build-record"]), "utf8"));
    assert(record.binary?.sha256 === binarySha256 && record.sourceSha256 === sourceBefore.sha256 && record.staticFrontendSha256 === distBefore.sha256,
      "Build record matches binary and source/static frontend fingerprints");
    report.buildRecord = { sha256: await fileHash(resolve(opts["build-record"])), matched: true };
  } else report.limitations.push("No external build record supplied: source/dist hashes describe run-time inputs; matching embedded binary provenance requires a separate build record.");
  const apps = [], stores = [resolve(output, "store-A"), resolve(output, "store-B")];
  const check = (name, condition = true) => {
    assert(condition, name);
    report.checks.push({ name, status: "pass" });
    console.log("PASS " + name); // Names only; never arguments, responses or exceptions.
  };
  const open = async (name, directory) => {
    const app = new NativeApp(binary, directory, { name });
    apps.push(app);
    const ready = await app.ready();
    assert(["tauri://localhost", "http://tauri.localhost"].includes(ready.location), "Static native frontend origin");
    report.observations.push({ name: name + ":native-ready", pid: app.child.pid, ...ready });
    return new Device(app);
  };
  const sameBody = async (from, to, id, name) => {
    const expected = await from.note(id);
    assert(expected, name + " source exists");
    await until(name, async () => {
      const actual = await to.note(id);
      return actual && bodyDigest(actual) === bodyDigest(expected);
    });
    report.observations.push({ name, noteId: id, documentAndPlainTextSha256: bodyDigest(expected), plainTextChars: expected.plainText.length });
    check(name);
  };
  const originals = async (device, owner, fixtureByName) => {
    const ws = await device.workspace(), note = ws.notes.find((n) => n.id === owner);
    for (const [name, bytes] of fixtureByName) {
      const attachment = ws.attachments.find((a) => a.noteId === owner && a.displayName === name);
      assert(attachment && refs(note.document).includes(attachment.id), "Document references original attachment");
      const value = await device.readOriginal(attachment.id, owner);
      const actual = Buffer.from(value.data, "base64");
      assert(hash(actual) === hash(bytes) && actual.length === bytes.length, "Production attachment read matches original bytes");
      const relativePath = attachment.relativePath;
      const path = resolve(device.app.directory, "attachments", relativePath);
      assert(path.startsWith(resolve(device.app.directory, "attachments") + sep), "Confined attachment path");
      assert.equal(await fileHash(path), hash(bytes), "Physical original bytes match");
      report.observations.push({ name: device.app.name + ":original", noteId: owner, attachmentId: attachment.id, bytes: bytes.length, sha256: hash(bytes) });
    }
  };
  let a, b, mediaNote, localA, localB, identityA;
  try {
    for (const directory of stores) await mkdir(directory);
    a = await open("A", stores[0]);
    b = await open("B", stores[1]);
    check("two independently owned native processes", a.app.child.pid !== b.app.child.pid);
    const statusA = await a.sync("sync.status"), statusB = await b.sync("sync.status");
    check("fresh disabled stores do not create synchronization identity", [statusA, statusB].every((s) => s.state === "disabled" && !s.deviceId && !s.workspaceId));
    if (!opts.smoke) {
      localA = await a.create("甲端配对前已有中文笔记");
      localB = await b.create("乙端配对前已有中文笔记");
      await a.sync("sync.host.start", { deviceName: "Sync108 Native A", port: await freePort() });
      await a.enterSync();
      await a.command("sync.status");
      const host = (await a.state()).synchronization.status;
      identityA = host.deviceId;
      assert(identityA && host.workspaceId, "Explicit host opt-in creates actual identity");
      const endpoint = host.listenAddress?.replace("0.0.0.0", "127.0.0.1");
      assert(endpoint, "Actual host returns listen address");
      report.observations.push({ name: "actual-sync-endpoint", endpoint });
      await a.command("sync.invite", { endpoint });
      // The sole secret transfer remains in memory; no request transcript,
      // screenshot, snapshot, exception text, invitation hash or private key log.
      let invitation = await a.app.evaluate(`document.querySelector('[data-sensitive="invitation"]')?.value`);
      assert(typeof invitation === "string" && invitation.startsWith("notes-sync-v1:"), "Real invitation is available");
      try { await b.sync("sync.pair", { invitation, deviceName: "Sync108 Native B" }); }
      finally { invitation = undefined; }
      await a.leaveSync();
      const pairedA = await a.sync("sync.status"), pairedB = await b.sync("sync.status");
      check("pair shares workspace with distinct device identities and preserves host identity", pairedA.deviceId === identityA &&
        !!pairedB.deviceId && pairedA.deviceId !== pairedB.deviceId && pairedA.workspaceId === host.workspaceId && pairedA.workspaceId === pairedB.workspaceId);
      report.observations.push({ name: "paired-identities", a: { deviceId: pairedA.deviceId, workspaceId: pairedA.workspaceId }, b: { deviceId: pairedB.deviceId, workspaceId: pairedB.workspaceId } });
      await sameBody(a, b, localA, "pair merges existing A note into B");
      await sameBody(b, a, localB, "pair merges existing B note into A");

      const formatted = { type: "doc", content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "中文标题：原生双端" }] },
        { type: "paragraph", content: [{ type: "text", marks: [{ type: "bold" }], text: "加粗中文与 emoji 🌏" }, { type: "text", text: "\n第二行 " }, { type: "text", marks: [{ type: "noteTag", attrs: { name: "sync108" } }], text: "#sync108" }] },
        { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "列表内容保留" }] }] }] },
      ] };
      await a.select(localA);
      await a.command("editor.setContent", { document: formatted });
      const savedA = await a.note(localA);
      check("actual editor retains Chinese heading bold and list", savedA.plainText.includes("加粗中文与 emoji 🌏") &&
        JSON.stringify(savedA.document).includes('"bold"') && JSON.stringify(savedA.document).includes('"bulletList"'));
      await sameBody(a, b, localA, "A to B full Chinese document and formatting");
      await b.edit(localB, "乙端反向编辑：完整中文与标点。\n下一段不会丢失");
      await b.command("editor.select", { from: 1, to: 4 });
      await b.command("editor.format", { command: "italic" });
      check("B applies real editor italic format", JSON.stringify((await b.note(localB)).document).includes('"italic"'));
      await sameBody(b, a, localB, "B to A full Chinese document and formatting");

      await a.command("folder.open");
      await a.command("folder.updateDraft", { draft: { name: "原生同步资料夹", smart: false } });
      await a.command("folder.submit");
      const folder = (await a.workspace()).folders.find((f) => f.name === "原生同步资料夹");
      assert(folder, "Actual folder submit created folder");
      await a.select(localA);
      await a.command("note.patch", { folderId: folder.id, pinned: true, paperStyle: "grid-small" });
      await until("folder and metadata", async () => {
        const ws = await b.workspace(), note = ws.notes.find((n) => n.id === localA);
        return ws.folders.some((f) => f.id === folder.id && f.name === folder.name) && note?.folderId === folder.id && note.pinned && note.paperStyle === "grid-small";
      });
      await b.command("tag.select", { name: "sync108" });
      check("folder move pin paper and tag projection reach peer", (await b.state()).selection.listed.includes(localA));
      await b.command("tag.select", { name: null });
      await b.command("folder.select", { id: "all" });

      mediaNote = await a.create("PNG 与 TXT 原始字节附件");
      const fixtures = [["sync108-original.png", png], ["sync108-original.txt", txt]];
      await a.command("attachment.submit", { files: fixtures.map(([name, bytes]) => ({ name, mime: name.endsWith("png") ? "image/png" : "text/plain", base64: bytes.toString("base64") })) });
      await a.command("app.flush");
      await until("two original attachments reach B", async () => (await b.workspace()).attachments.filter((x) => x.noteId === mediaNote).length === 2);
      await sameBody(a, b, mediaNote, "attachment references and full body converge");
      await originals(a, mediaNote, fixtures);
      await originals(b, mediaNote, fixtures);
      check("PNG and TXT original SHA256 match on both native stores");
      await b.select(mediaNote);
      await until("native webview renders real PNG", () => b.app.evaluate(`Array.from(document.querySelectorAll('.attachment-node img')).some(img=>img.naturalWidth>0)`));
      check("peer native webview decodes replicated image");

      await b.command("note.delete");
      await until("delete reaches A", async () => !!(await a.note(mediaNote))?.deletedAt);
      check("B deletion reaches A");
      await a.select(mediaNote);
      await a.command("note.restore");
      await until("restore reaches B", async () => (await b.note(mediaNote))?.deletedAt === null);
      await sameBody(a, b, mediaNote, "restore retains full body and attachment references");
      await originals(b, mediaNote, fixtures);
      check("restored attachment original bytes remain intact");

      // Actual process absence, then reopen exactly the same data directory.
      await b.app.close();
      check("offline B process exits naturally", b.app.lifecycle.naturalExit);
      const offlineText = "乙端离线期间甲端编辑：断线重连后补齐全部中文";
      await a.edit(localA, offlineText);
      const priorB = b.app.child.pid;
      b = await open("B-reconnect", stores[1]);
      check("B restarts as a new owned process", b.app.child.pid !== priorB);
      await sameBody(a, b, localA, "offline native restart reconnect catches up");

      // Stop BOTH real runtimes before editing one shared base on each device.
      const concurrent = await a.create("并发共享基线");
      await sameBody(a, b, concurrent, "concurrent base reaches both native apps");
      await a.sync("sync.stop");
      await b.sync("sync.stop");
      await a.edit(concurrent, "甲端并发版本：保留全部甲中文");
      await b.edit(concurrent, "乙端并发版本：保留全部乙中文");
      const branchA = await a.note(concurrent), branchB = await b.note(concurrent);
      await a.sync("sync.resume");
      await b.sync("sync.resume");
      await until("two visible concurrent conflict versions", async () => {
        const rows = await a.conflicts();
        return rows.some((r) => r.variants >= 2 && r.titles.includes(branchA.title) && r.titles.includes(branchB.title));
      });
      check("actual conflict UI retains concurrent Chinese heads");
      const opened = await a.app.evaluate(`(() => {
        const row=Array.from(document.querySelectorAll('.sync-conflict')).find(row=>
          Array.from(row.querySelectorAll('.sync-variant strong')).some(n=>n.textContent===arg));
        const button=row && Array.from(row.querySelectorAll('button')).find(b=>b.textContent.trim()==='全部另存并解决');
        if(!button || button.disabled) return false; button.click(); return true;
      })()`, branchA.title);
      assert(opened, "Actual conflict keep-all button is available");
      await a.app.idle();
      const confirmed = await a.app.evaluate(`(() => {
        const b=Array.from(document.querySelectorAll('.sync-confirmation button')).find(b=>b.textContent.replace(/\\s/g,'')==='确认全部另存');
        if(!b || b.disabled) return false; b.click(); return true;
      })()`);
      assert(confirmed, "Actual keep-all confirmation is clicked");
      await a.app.idle();
      await until("keep-all conflict resolves", async () => (await a.conflicts()).length === 0);
      await a.leaveSync();
      for (const device of [a, b]) {
        await until("keep-all retains complete branch bodies", async () => {
          const notes = (await device.workspace()).notes;
          return [branchA, branchB].every((branch) => notes.some((note) => !note.deletedAt && bodyDigest(note) === bodyDigest(branch)));
        });
      }
      check("confirmed keepAll preserves both full Chinese documents on A and B");

      await a.sync("sync.stop");
      await b.sync("sync.stop");
      const beforeRestart = projection(await a.workspace());
      await a.edit(localB, "停止同步后甲端持久脏数据，重启再继续");
      const persisted = await a.note(localB), priorA = a.app.child.pid;
      await a.app.close({ eof: true });
      check("stdin EOF flushes and exits native A naturally", a.app.lifecycle.naturalExit);
      a = await open("A-restart", stores[0]);
      const restarted = await a.sync("sync.status");
      check("same-directory restart preserves paused state and device identity", restarted.state === "paused" && restarted.deviceId === identityA && a.app.child.pid !== priorA);
      check("restarted native store retains full pending local document", bodyDigest(await a.note(localB)) === bodyDigest(persisted));
      const restartedIds = new Set((await a.workspace()).notes.map((n) => n.id));
      check("restarted store retains existing note IDs", beforeRestart.notes.every((n) => restartedIds.has(n.id)));
      await originals(a, mediaNote, fixtures);
      await a.sync("sync.resume");
      await b.sync("sync.resume");
      await sameBody(a, b, localB, "persisted offline dirty resumes across native restart");
      await until("complete workspace convergence before idempotence", async () => hash(JSON.stringify(projection(await a.workspace()))) === hash(JSON.stringify(projection(await b.workspace()))));
      const stable = hash(JSON.stringify(projection(await a.workspace())));
      for (let i = 0; i < 3; i++) {
        await a.sync("sync.now");
        await b.sync("sync.now");
      }
      await delay(750);
      check("three repeated real sync requests are idempotent on both projections", [
        hash(JSON.stringify(projection(await a.workspace()))), hash(JSON.stringify(projection(await b.workspace()))),
      ].every((digest) => digest === stable));
      check("repeated sync has no pending inbox or conflicts", [await a.sync("sync.status"), await b.sync("sync.status")].every((s) => s.pendingCount === 0 && s.conflictCount === 0));
      report.observations.push({ name: "converged-projection", sha256: stable });
      await writeFile(resolve(output, "native-A-dom.json"), JSON.stringify(await a.app.snapshot(), null, 2) + "\n");
      await writeFile(resolve(output, "native-B-dom.json"), JSON.stringify(await b.app.snapshot(), null, 2) + "\n");
    }
  } catch (error) {
    // Assertion and application exception messages can contain arguments.
    report.failure = { code: /^[A-Z_:a-z0-9 -]{1,160}$/.test(error.code || "") ? error.code : "SUITE_FAILED", completedChecks: report.checks.length,
      operations: apps.map((app) => ({ name: app.name, lastAction: app.lifecycle.lastAction })) };
    console.error("FAIL native suite; see result.json completed checks");
  } finally {
    for (const app of apps) {
      try { await app.close(); }
      catch { report.failure ||= { code: "OWNED_PROCESS_CLEANUP_FAILED", name: app.name }; }
    }
    report.processes = apps.map((app) => app.lifecycle);
    for (const directory of stores) {
      if (apps.filter((app) => app.directory === directory).every((app) => app.lifecycle.exit)) {
        try { report.databaseEvidence.push({ directory, ...await readOnlyEvidence(directory, resolve(output, "sqlite-readonly-" + (directory === stores[0] ? "A" : "B"))) }); }
        catch { report.failure ||= { code: "READONLY_EVIDENCE_FAILED" }; }
      }
    }
    try {
      report.sourceAfter = await fingerprint(root);
      report.staticFrontendAfter = await distFingerprint(root);
      assert.equal(report.sourceAfter.sha256, sourceBefore.sha256);
      assert.equal(report.staticFrontendAfter.sha256, distBefore.sha256);
      assert.equal(await fileHash(binary), binarySha256);
      report.inputsUnchanged = true;
    } catch { report.failure ||= { code: "INPUTS_CHANGED_DURING_RUN" }; }
    report.finishedAt = new Date().toISOString();
    report.status = report.failure ? "failed" : opts.smoke ? "smoke-passed" : "passed";
    await writeFile(resolve(output, "result.json"), JSON.stringify(report, null, 2) + "\n");
  }
  if (report.failure) process.exitCode = 1;
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await run().catch(() => { console.error("FAIL native runner setup"); process.exitCode = 1; });
