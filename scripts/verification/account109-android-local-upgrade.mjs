/** Three local-only checks for an in-place Account109 debug update.
 * Never calls SignIn, Cancel, SignOut, sync enablement, SQL or callback injection.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { connectAndroid, launchAndroid, PACKAGE, SERIAL } from './account109-android.mjs';

const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const run = (...args) => execFileSync('/Users/water/Library/Android/sdk/platform-tools/adb', ['-s', SERIAL, ...args],
  { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] });
const user0Foreground = () => {
  const lines = run('shell', 'dumpsys', 'activity', 'activities').split('\n').filter(l => l.includes('mResumedActivity:'));
  const component = lines.length === 1 && lines[0].match(/mResumedActivity:\s+ActivityRecord\{[^}]*?\su(\d+)\s+([^\s/]+)\//);
  return component?.[1] === '0' && component[2] === PACKAGE;
};

export async function localUpgradeSmoke({ baselinePath, output, WebSocketImpl = globalThis.WebSocket }) {
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
  assert.equal(baseline.package, PACKAGE);
  assert.ok(Array.isArray(baseline.notes) && baseline.notes.length > 0);
  await mkdir(output, { recursive: true });
  const report = { schemaVersion: 1, sourceCandidate: 'd69ffbce2ad1284e6c7ce830f6840ba083148aab',
    package: PACKAGE, serial: SERIAL, checks: [], passed: false, signInCalled: false, syncEnabled: false };
  let client, phase = 'owned-app-launch';
  try {
    launchAndroid();
    assert.equal(user0Foreground(), true);
    client = await connectAndroid({ WebSocketImpl });
    const { serial, package: packageId, pid, local, remote } = client.owned;
    report.ownedMapping = { serial, package: packageId, pid, local, remote };
    phase = 'existing-full-document-and-plainText';
    report.preservedNotes = [];
    for (const prior of baseline.notes) {
      const { note } = await client.readNote(prior.id);
      assert.deepEqual(note.document, prior.document);
      assert.equal(note.plainText, prior.plainText);
      report.preservedNotes.push({ id: note.id, documentSha256: hash(note.document), plainTextSha256: hash(note.plainText) });
    }
    report.checks.push('all-baseline-documents-and-plainText-preserved');
    phase = 'default-native-signedOut-ui';
    await client.openAccount();
    const initial = await client.accountStatus();
    report.native = { signedOut: initial.state === 'signedOut', profilePresent: !!initial.profile,
      errorPresent: !!initial.error, enabled: initial.enabled === true, realAccountSettingsOpened: true };
    assert.equal(initial.state, 'signedOut');
    assert.equal(initial.enabled, false);
    assert.equal(initial.profile, undefined);
    assert.equal(initial.error, undefined);
    report.checks.push('default-native-ui-and-real-signedOut');
    phase = 'real-ui-new-full-document';
    assert.equal(user0Foreground(), true);
    const title = `Account109 d69 ${randomUUID().slice(0, 8)}`;
    const lines = ['默认原生账户候选：本地编辑。', '保留全部既有合成数据；不登录、不同步。'];
    const created = await client.createNote({ title, body: lines.join('\n') });
    const expected = { type: 'doc', content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: title }] },
      ...lines.map(text => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
    ] };
    const { note } = await client.readNote(created.id);
    assert.deepEqual(note.document, expected);
    assert.equal(note.plainText, [title, ...lines].join('\n'));
    report.createdNote = { id: note.id, document: note.document, plainText: note.plainText,
      documentSha256: hash(note.document), plainTextSha256: hash(note.plainText) };
    const final = await client.accountStatus();
    assert.equal(final.state, 'signedOut');
    assert.equal(final.enabled, false);
    assert.equal(final.profile, undefined);
    assert.equal(final.error, undefined);
    report.checks.push('real-input-new-full-document-and-plainText');
    report.passed = true;
  } catch (error) {
    report.failure = { code: typeof error.code === 'string' && /^[A-Z_]{1,80}$/.test(error.code) ? error.code : 'LOCAL_UPGRADE_CHECK_FAILED',
      phase, driverPhase: client?.diagnostics?.phase || null, createdNoteId: client?.diagnostics?.createdNoteId || null };
  } finally {
    if (client) {
      try {
        await client.close();
        report.cleanup = { driverClosed: true, exactForwardAbsent: !run('forward', '--list').trim().split('\n')
          .includes(`${SERIAL} ${client.owned.local} ${client.owned.remote}`), ownedAppUser0Foreground: user0Foreground() };
      } catch { report.cleanup = { driverClosed: false, code: 'OWNED_DRIVER_CLEANUP_FAILED' }; report.passed = false; }
    }
    await writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  }
  return report;
}
