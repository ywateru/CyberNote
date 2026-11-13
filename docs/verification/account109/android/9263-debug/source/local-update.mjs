/** Sole delegated ADB owner: one local update, all synthetic documents, restart.
 * No sign-in, sign-out, cancel, browser, sync command, data clear or original app.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { connectAndroid, launchAndroid, assertInteractive, PACKAGE, SERIAL } from '/Users/water/work/2026/Apple-Notes-Clone/scripts/verification/account109-android.mjs';

const MAIN = '/Users/water/work/2026/Apple-Notes-Clone';
const OUT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ADB = '/Users/water/Library/Android/sdk/platform-tools/adb';
const LOCK = `/private/tmp/cybernote-account109-${SERIAL}.lock`;
const resume = process.argv.includes('--resume-after-verified-install');
const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const save = (name, value) => writeFileSync(path.join(OUT, name), JSON.stringify(value, null, 2) + '\n');
const read = name => JSON.parse(readFileSync(path.join(OUT, name), 'utf8'));
const run = (...args) => execFileSync(ADB, ['-s', SERIAL, ...args], { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'ignore'] });
const forwards = () => run('forward', '--list').trim().split('\n').filter(Boolean).filter(line => line.startsWith(SERIAL + ' '));
const preflight = () => JSON.parse(execFileSync('python3', ['-c',
  'import runpy,json; m=runpy.run_path(' + JSON.stringify(path.join(OUT, 'source/device-preflight.py')) + '); print(json.dumps(m["check"]()))'],
  { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'ignore'] }));
const statusSummary = s => ({ state: s.state, enabled: s.enabled === true, profilePresent: !!s.profile, errorPresent: !!s.error });
const noteDigest = n => ({ id: n.id, documentSha256: hash(n.document), plainTextSha256: hash(n.plainText) });
function compare(prior, current) {
  for (const old of prior) {
    const now = current.notes.find(n => n.id === old.id);
    assert.ok(now);
    assert.deepEqual(now.document, old.document);
    assert.equal(now.plainText, old.plainText);
  }
  return prior.map(noteDigest);
}

const report = { schema: 1, sourceCandidate: '9263ea87b5f6112bbd23d4b57d6d7a8b21c9fee3',
  serial: SERIAL, package: PACKAGE, recordedAt: new Date().toISOString(), passed: false,
  installationAttempted: false, installed: false, signInCalled: false, cancelCalled: false,
  signOutCalled: false, syncEnabled: false, dataCleared: false, originalAppTouched: false,
  boundary: 'One local debug in-place update with synthetic isolated notes only. No real-account login or three-way sync acceptance.',
  mappings: [], checks: [], cleanup: { closedMappings: [] } };
report.resumedAfterVerifiedInstall = resume;
let client, phase = 'preflight';
const close = async () => {
  if (!client) return;
  const owned = { ...client.owned };
  await client.close();
  client = null;
  const exact = `${SERIAL} ${owned.local} ${owned.remote}`;
  assert.ok(!forwards().includes(exact));
  assert.equal(existsSync(LOCK), false);
  report.cleanup.closedMappings.push({ ...owned, exactForwardAbsent: true, leaseClosed: true });
};
const connect = async () => {
  client = await connectAndroid();
  report.mappings.push({ ...client.owned });
  assertInteractive();
  assert.equal(run('shell', 'am', 'get-current-user').trim(), '0');
};
try {
  const identity = read('identity.json');
  assert.equal(identity.sourceCommit, report.sourceCandidate);
  assert.equal(identity.status, 'passed-static-preinstallation-identity-only');
  assert.equal(hash(readFileSync(identity.apk.path)), identity.apk.sha256);
  const before = preflight();
  save(resume ? 'device-before-resume.json' : 'device-before-update.json', before);
  assert.ok(before.passed && before.unlocked && before.isolatedPackageUser0Foreground);
  assert.equal(before.currentUser, '0');
  report.forwardsBefore = forwards();
  phase = 'snapshot-all-synthetic-notes-before-update';
  await connect();
  const workspace = await client.readWorkspace();
  assert.ok(Array.isArray(workspace.notes) && workspace.notes.length > 0);
  // Refuse to archive any unexpected/non-test title or workspace metadata.
  const unknown = workspace.notes.filter(n => !/^(?:Account109|account109|Sync108|sync108|账户测试|合成测试)/.test(n.title || ''));
  if (unknown.length) {
    report.unclassifiedNotes = unknown.map(n => ({ id: n.id, titleSha256: hash(n.title || '') }));
    throw Object.assign(Error('SYNTHETIC_NOTE_CLASSIFICATION_REQUIRED'), { code: 'SYNTHETIC_NOTE_CLASSIFICATION_REQUIRED' });
  }
  const baseline = resume ? read('synthetic-baseline.json') : {
    package: PACKAGE, serial: SERIAL, sourceInstalledApkSha256: before.installedApk.sha256,
    notes: workspace.notes.map(n => ({ id: n.id, title: n.title, document: n.document, plainText: n.plainText })) };
  if (resume) {
    const prior = read('local-update-initial-result.json');
    assert.ok(prior.installed && prior.installedApkSha256 === identity.apk.sha256);
    assert.equal(before.installedApk.sha256, identity.apk.sha256);
    compare(baseline.notes, workspace);
    report.priorInstallReceipt = 'local-update-initial-result.json';
    report.priorAccountTransition = { before: prior.accountBefore, after: prior.accountAfter,
      interpretation: 'Terminal error changed to signedOut on process recreation; no authorization cancellation was performed.' };
  } else save('synthetic-baseline.json', baseline);
  report.baselineNoteCount = baseline.notes.length;
  report.baselineNotes = baseline.notes.map(noteDigest);
  const initial = await client.accountStatus();
  report.accountBefore = statusSummary(initial);
  if (initial.state === 'authorizing') throw Object.assign(Error('EXISTING_AUTHORIZATION_ACTIVE'), { code: 'EXISTING_AUTHORIZATION_ACTIVE' });
  // Local update scope requires an account that cannot initiate remote work.
  assert.ok(['signedOut', 'error'].includes(initial.state));
  assert.equal(initial.enabled, false);
  assert.ok(!initial.profile);
  report.checks.push(resume ? 'all-original-preinstall-synthetic-notes-rechecked' : 'all-preexisting-synthetic-notes-snapshotted-before-install');
  await close();
  phase = 'revalidate-before-install';
  const immediate = preflight();
  assert.ok(immediate.passed && immediate.unlocked && immediate.isolatedPackageUser0Foreground);
  assert.equal(immediate.installedApk.sha256, before.installedApk.sha256);
  assert.equal(hash(readFileSync(identity.apk.path)), identity.apk.sha256);
  if (!resume) {
    phase = 'install-r-exact-preserved-apk';
    report.installationAttempted = true;
    const install = run('install', '-r', '--user', '0', identity.apk.path);
    assert.ok(/\bSuccess\b/.test(install));
  }
  report.installed = true;
  phase = 'installed-apk-rehash-and-cert';
  const after = preflight();
  save('device-after-update.json', after);
  assert.ok(after.passed && after.unlocked);
  assert.equal(after.installedApk.sha256, identity.apk.sha256);
  report.installedApkSha256 = after.installedApk.sha256;
  report.checks.push('installed-apk-exact-candidate-hash-and-certificate');
  phase = 'post-update-all-baseline-documents';
  launchAndroid();
  await connect();
  report.postUpdateNotes = compare(baseline.notes, await client.readWorkspace());
  report.checks.push('every-preexisting-document-and-plainText-preserved-after-update');
  phase = 'default-native-ui-and-status';
  await client.openAccount();
  const inspection = await client.inspect();
  report.accountAfter = statusSummary(inspection.account);
  report.accountUI = { ready: inspection.ui.ready, renderedState: inspection.ui.state,
    loginControlPresent: inspection.ui.login, cancelControlPresent: inspection.ui.cancel };
  assert.equal(inspection.ui.state, inspection.account.state);
  assert.equal(inspection.account.state, initial.state);
  assert.equal(inspection.account.enabled, false);
  assert.ok(!inspection.account.profile);
  assert.ok(inspection.ui.ready && inspection.ui.login && !inspection.ui.cancel);
  report.checks.push('default-native-account-ui-matches-read-only-native-status');
  phase = 'one-synthetic-note-real-product-input';
  const title = `Account109 9263 ${randomUUID().slice(0, 8)}`;
  const lines = ['9263 默认原生账户候选：本地更新验证。', '完整保留既有合成笔记；不登录、不同步。'];
  const created = await client.createNote({ title, body: lines.join('\n') });
  const expected = { id: created.id, title, document: { type: 'doc', content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: title }] },
    ...lines.map(text => ({ type: 'paragraph', content: [{ type: 'text', text }] })) ] },
    plainText: [title, ...lines].join('\n') };
  compare([expected], await client.readWorkspace());
  save('synthetic-created-note.json', expected);
  report.createdNote = noteDigest(expected);
  const oldPid = client.owned.pid;
  await close();
  phase = 'restart-isolated-package';
  const lockedCheck = preflight();
  assert.ok(lockedCheck.passed && lockedCheck.unlocked && lockedCheck.isolatedPackageUser0Foreground);
  launchAndroid({ restart: true });
  await connect();
  assert.notEqual(client.owned.pid, oldPid);
  report.restart = { oldPid, newPid: client.owned.pid };
  phase = 'restart-all-documents-and-new-note';
  const restarted = await client.readWorkspace();
  assert.equal(restarted.notes.length, baseline.notes.length + 1);
  report.restartNotes = compare([...baseline.notes, expected], restarted);
  save('synthetic-after-restart.json', { package: PACKAGE,
    notes: restarted.notes.map(n => ({ id: n.id, title: n.title, document: n.document, plainText: n.plainText })) });
  report.accountAfterRestart = statusSummary(await client.accountStatus());
  assert.equal(report.accountAfterRestart.state, initial.state);
  assert.equal(report.accountAfterRestart.enabled, false);
  report.checks.push('new-full-document-and-all-preexisting-documents-preserved-after-package-restart');
  report.passed = true;
} catch (error) {
  report.failure = { phase, code: typeof error.code === 'string' && /^[A-Z_]{1,80}$/.test(error.code) ? error.code : 'LOCAL_UPDATE_CHECK_FAILED',
    driverPhase: client?.diagnostics?.phase || null, createdNoteId: client?.diagnostics?.createdNoteId || null };
} finally {
  try {
    await close();
    report.cleanup.forwardsAfter = forwards();
    report.cleanup.allOwnedForwardsAbsent = report.mappings.every(m => !report.cleanup.forwardsAfter.includes(`${SERIAL} ${m.local} ${m.remote}`));
    report.cleanup.preexistingForwardsPreserved = (report.forwardsBefore || []).every(f => report.cleanup.forwardsAfter.includes(f));
    report.cleanup.leaseAbsent = !existsSync(LOCK);
    report.cleanup.adbOwnershipReturned = true;
  } catch {
    report.passed = false;
    report.cleanup.failure = 'OWNED_DRIVER_CLEANUP_FAILED';
  }
  report.completedAt = new Date().toISOString();
  save('local-update-result.json', report);
  console.log(JSON.stringify({ phase: 'local-update-complete', passed: report.passed, installed: report.installed,
    baselineNoteCount: report.baselineNoteCount, failure: report.failure || null, cleanup: report.cleanup }));
}
