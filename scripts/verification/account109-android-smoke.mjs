/** Actual isolated-app smoke. Never enters credentials, enables sync, or injects callbacks/grants.
 * Usage: node scripts/verification/account109-android-smoke.mjs OUTPUT_DIR [PRIOR_SMOKE_JSON]
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { assertInteractive, connectAndroid, launchAndroid, PACKAGE, SERIAL } from './account109-android.mjs';

const digest = data => createHash('sha256').update(JSON.stringify(data)).digest('hex');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const [output, previous] = process.argv.slice(2);
if (!output) throw Error('OUTPUT_DIR is required');
await mkdir(output, { recursive: true });
const adb = path.join(process.env.ANDROID_HOME || `${os.homedir()}/Library/Android/sdk`, 'platform-tools/adb');
const run = (...args) => execFileSync(adb, ['-s', SERIAL, ...args], { encoding: 'utf8', timeout: 20000 });
const report = { schemaVersion: 1, package: PACKAGE, serial: SERIAL, checks: [], passed: false };
let client;
try {
  launchAndroid(); assertInteractive();
  client = await connectAndroid(); report.owned = client.owned;
  report.appDataRoot = run('shell', 'run-as', PACKAGE, 'pwd').trim();
  assert.equal(report.appDataRoot, `/data/user/0/${PACKAGE}`);
  const initial = await client.accountStatus();
  assert.equal(initial.state, 'signedOut');
  assert.equal(initial.enabled, false); assert.equal(initial.profile, undefined); assert.equal(initial.error, undefined);
  report.initial = initial; report.checks.push('real-native-signedOut');
  if (previous) {
    const prior = JSON.parse(await readFile(previous, 'utf8'));
    const current = await client.readNote(prior.localNote.id);
    assert.deepEqual(current.note.document, prior.localNote.note.document);
    assert.equal(current.note.plainText, prior.localNote.note.plainText);
    report.continuation = { noteId: current.note.id, documentSha256: digest(current.note.document), plainTextSha256: digest(current.note.plainText) };
    report.checks.push('prior-synthetic-note-survived-update');
  }
  const title = `Account109 ${randomUUID().slice(0, 8)}`;
  const lines = ['Android 本地编辑验证', '第二行：保留合成数据。'];
  const note = await client.createNote({ title, body: lines.join('\n') });
  const expected = { type: 'doc', content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: title }] },
    ...lines.map(text => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
  ] };
  assert.deepEqual(note.document, expected);
  assert.equal(note.plainText, [title, ...lines].join('\n'));
  report.localNote = { id: note.id, title, body: lines.join('\n'), note };
  report.documentSha256 = digest(note.document); report.plainTextSha256 = digest(note.plainText);
  report.checks.push('real-input-full-document-and-plainText');
  await client.openAccount();
  const authorizing = await client.signIn();
  assert.equal(authorizing.state, 'authorizing');
  report.checks.push('real-ui-started-authorization');
  // Observe only the foreground component, never browser URL/state or page data.
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const resumed = run('shell', 'dumpsys', 'activity', 'activities').split('\n').find(line => line.includes('mResumedActivity:')) || '';
    if (!resumed.includes(`${PACKAGE}/`)) { report.browserLaunched = true; break; }
    const status = await client.accountStatus();
    assert.equal(status.state, 'authorizing');
    await wait(300);
  }
  assert.equal(report.browserLaunched, true, 'authorization did not open an external activity');
  launchAndroid(); assertInteractive();
  const cancelled = await client.cancelLogin();
  assert.equal(cancelled.state, 'signedOut'); assert.equal(cancelled.profile, undefined); assert.equal(cancelled.error, undefined);
  report.cancelled = cancelled; report.checks.push('real-ui-cancel-returned-native-signedOut');
  const saved = await client.readNote(note.id);
  assert.deepEqual(saved.note.document, expected); assert.equal(saved.note.plainText, note.plainText);
  report.checks.push('cancel-preserved-local-document');
  report.passed = true;
} catch (error) {
  report.failure = { code: error.code || error.name, phase: error.phase || client?.diagnostics.phase || 'launch',
    selector: error.selector || client?.diagnostics.selector || null, nativeErrorCode: error.nativeErrorCode || null };
  process.exitCode = 1;
} finally {
  if (client) {
    await client.close();
    report.cleanup = { closed: true, ownedForwardPresent: run('forward', '--list').trim().split('\n').some(line => line === `${SERIAL} ${client.owned.local} ${client.owned.remote}`) };
  }
  await writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks, failure: report.failure,
    documentSha256: report.documentSha256, cleanup: report.cleanup }));
}
