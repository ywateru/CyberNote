/** Two existing desktops, read-only status calls and note comparisons only.
 * Does not import or start the full account runner. No account/debug mutations.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, realpath, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { NativeApp, delay } from '/Users/water/work/2026/Apple-Notes-Clone/scripts/verification/sync108-native-driver.mjs';

const MAIN = '/Users/water/work/2026/Apple-Notes-Clone';
const ARCHIVE = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = '/private/tmp/account109-desktop-real-39c1420d-diagnostic01';
const STORES = '/private/tmp/account109-desktop-real-90b8b28b-01';
const BINARY = MAIN + '/artifacts/account109/mac-39c1420d-finite-diagnostics/notes-clone';
const EXPECTED = 'b4cec5d9b78509ab07d5e0b3700032bad9b09ba178024e4e1863b7ab3fa310d2';
const IDENTITY = '/private/tmp/account109-mac-39c1420d-identity.json';
const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const snapshot = () => JSON.parse(execFileSync('python3', [path.join(ARCHIVE, 'note-snapshot.py')],
  { encoding: 'utf8', timeout: 15000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }));
const summarizeNotes = originals => Object.fromEntries(Object.entries(originals).map(([name, notes]) => [name,
  notes.map(n => ({ id: n.id, documentSha256: hash(n.document), plainTextSha256: hash(n.plainText) }))]));
const finiteStates = ['signedOut', 'authorizing', 'connecting', 'ready', 'paused', 'error'];
const finiteCodes = ['account_configuration', 'account_authentication', 'account_auth_callback_invalid',
  'account_auth_identity_invalid', 'account_auth_code_rejected', 'account_auth_token_response_invalid',
  'account_auth_refresh_missing', 'account_owner_workspace_mismatch', 'account_network',
  'account_enrollment_invalid', 'account_storage', 'account_cancelled', 'account_busy',
  'account_platform_unsupported', 'account_cleanup_required', 'account_sync_failed', 'account_sync_protocol'];
const stages = ['callbackListen', 'browserOpen', 'callbackReceive', 'identityProvider', 'coordinator',
  'coordinatorConfiguration', 'coordinatorRegistration', 'coordinatorProfile', 'coordinatorEnrollment',
  'coordinatorJwks', 'authorizationProvider', 'identitySession', 'identityRefresh', 'identityRevocation', 'coordinatorSession'];
const reasons = ['configuration', 'network', 'invalidCallback', 'invalidIdentity', 'identityRejected',
  'codeExchangeRejected', 'tokenResponseInvalid', 'missingRefreshToken', 'cancelled', 'noSession',
  'ownershipMismatch', 'storage', 'refreshFailed', 'revocationFailed', 'busy'];
// Sanitize inside the webview before any data crosses the diagnostic pipe.
const expression = `(async()=>{const s=await window.__TAURI_INTERNALS__.invoke('account_command',{command:{type:'status'}});
const pick=(v,allowed)=>allowed.includes(v)?v:null;
return {state:pick(s.state,${JSON.stringify(finiteStates)}),enabled:s.enabled===true,hasProfile:!!s.profile,
hasError:!!s.error,error:s.error?{code:pick(s.error.code,${JSON.stringify(finiteCodes)}),
stage:pick(s.error.stage,${JSON.stringify(stages)}),providerReason:pick(s.error.providerReason,${JSON.stringify(reasons)})}:null,
hasRemoteOnline:Array.isArray(s.devices)&&s.devices.some(d=>!d.current&&d.online===true),
hasRemoteConnected:Array.isArray(s.devices)&&s.devices.some(d=>!d.current&&d.connected===true)};})()`;
const proxyKeys = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy'];
const env = Object.fromEntries(proxyKeys.map(key => [key, '']));
const report = { schema: 1, kind: 'two-desktop-readonly-finite-auth-diagnostic', startedAt: new Date().toISOString(),
  output: OUTPUT, stores: STORES, maxRuntimeMs: 120000, pollingIntervalMs: 1000,
  accountCommands: ['status'], accountMutationRequested: false, grantFilesReadCopiedOrCleared: false,
  loginRequested: false, browserRequested: false, buildsRun: false, adbUsed: false,
  inheritedProxyVariablesBlanked: proxyKeys, slots: { a: 'left', b: 'right' },
  observations: [], lifecycle: [], diagnosis: null,
  boundary: 'Real native runtime startup may restore existing grants and run its configured background work. The diagnostic requests only account status and reads original note documents; no sign-in, sign-out, cancel, enablement, syncNow, document mutation or full runner.' };
const apps = {}, previous = {}, latest = {};
let original, phase = 'identity-and-preflight', deadline;
const save = async () => {
  const text = JSON.stringify(report, null, 2) + '\n';
  await writeFile(path.join(OUTPUT, 'result.json'), text);
  await writeFile(path.join(ARCHIVE, 'result.json'), text);
};
try {
  const native = await readFile(BINARY), receiptBytes = await readFile(IDENTITY), receipt = JSON.parse(receiptBytes);
  assert.equal(hash(native), EXPECTED);
  assert.equal(receipt.nativeBinarySha256, EXPECTED);
  assert.equal(receipt.info.sourceRevision, '39c1420d23daaa9397036d24826219e1bd2b89ff');
  assert.equal(receipt.info.sourceDirty, false);
  for (const name of ['a', 'b']) {
    const directory = path.join(STORES, 'desktop-' + name);
    assert.ok((await lstat(directory)).isDirectory());
    assert.equal(await realpath(directory), directory);
  }
  const processes = execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' });
  assert.ok(!processes.split('\n').some(line => line.includes('notes-clone') &&
    ['desktop-a', 'desktop-b'].some(n => line.includes(path.join(STORES, n)))));
  await mkdir(OUTPUT); // Fresh owned output; intentionally never reuse.
  await writeFile(path.join(ARCHIVE, 'identity-receipt.json'), receiptBytes, { flag: 'wx' });
  await writeFile(path.join(OUTPUT, 'identity-receipt.json'), receiptBytes, { flag: 'wx' });
  for (const file of ['diagnostic.mjs', 'note-snapshot.py'])
    await writeFile(path.join(OUTPUT, file), await readFile(path.join(ARCHIVE, file)), { flag: 'wx' });
  report.binary = { path: BINARY, bytes: native.length, sha256: hash(native),
    identityReceiptSha256: hash(receiptBytes), embeddedIdentityPerReceipt: receipt.embeddedIdentity,
    embeddedIdentityIndependentlyRecheckedThisRun: false };
  report.helperSha256 = hash(await readFile(fileURLToPath(import.meta.url)));
  report.driverSha256 = hash(await readFile(MAIN + '/scripts/verification/sync108-native-driver.mjs'));
  original = snapshot();
  assert.ok(original.a.length && original.b.length);
  report.originalNotes = summarizeNotes(original);
  phase = 'start-two-original-desktops';
  report.processesStartedAt = new Date().toISOString();
  deadline = Date.now() + 120000;
  for (const name of ['a', 'b']) {
    apps[name] = new NativeApp(BINARY, path.join(STORES, 'desktop-' + name), {
      name, env: { ...env, NOTES_SYNC_E2E_SLOT: name === 'a' ? 'left' : 'right' }, closeTimeoutMs: 15000,
    });
  }
  report.pids = Object.fromEntries(Object.entries(apps).map(([name, app]) => [name, app.child.pid]));
  await save();
  console.log(JSON.stringify({ phase: 'two-desktop-processes-started', pids: report.pids, binarySha256: EXPECTED }));
  phase = 'native-readiness';
  const ready = await Promise.all(Object.entries(apps).map(async ([name, app]) => {
    const r = await app.ready(Math.min(30000, deadline - Date.now()));
    return { device: name, interactive: r.interactive, startupDetached: r.startupDetached };
  }));
  report.ready = ready;
  phase = 'readonly-account-status';
  // Concurrent per-desktop polls stop on the first observed terminal auth state;
  // safe observations are deduplicated independently for each desktop.
  let stopped = false;
  const terminal = s => s.hasError && s.error?.code !== 'account_network' &&
    (s.error?.code === 'account_authentication' && s.error?.providerReason !== 'network' ||
     ['account_auth_callback_invalid', 'account_auth_identity_invalid', 'account_auth_code_rejected',
      'account_auth_token_response_invalid', 'account_auth_refresh_missing', 'account_owner_workspace_mismatch',
      'account_enrollment_invalid', 'account_cleanup_required'].includes(s.error?.code));
  const poll = async name => {
    while (!stopped && Date.now() < deadline) {
      const remaining = deadline - Date.now();
      if (remaining < 1) break;
      const s = await apps[name].evaluate(expression, null, Math.min(5000, remaining));
      assert.ok(s && finiteStates.includes(s.state));
      latest[name] = s;
      if (JSON.stringify(s) !== previous[name]) {
        previous[name] = JSON.stringify(s);
        report.observations.push({ device: name, elapsedMs: Date.now() - (deadline - 120000), ...s });
        await save();
        console.log(JSON.stringify({ phase: 'safe-status-change', device: name, ...s }));
      }
      if (terminal(s)) {
        stopped = true;
        report.diagnosis ||= { outcome: 'terminal-authentication', device: name, ...s.error };
        break;
      }
      if (['a', 'b'].every(n => latest[n]?.state === 'ready' && latest[n]?.enabled && latest[n]?.hasProfile &&
          !latest[n]?.hasError && latest[n]?.hasRemoteConnected)) {
        stopped = true;
        report.diagnosis ||= { outcome: 'both-desktops-connected' };
        break;
      }
      await delay(Math.min(1000, Math.max(0, deadline - Date.now())));
    }
  };
  await Promise.all([poll('a'), poll('b')]);
  report.pollingElapsedMs = Date.now() - (deadline - 120000);
  report.diagnosis ||= { outcome: 'bounded-diagnostic-timeout' };
  report.lastSafeStatus = latest;
  console.log(JSON.stringify({ phase: 'safe-auth-diagnosis', diagnosis: report.diagnosis }));
} catch (error) {
  report.failure = { phase, code: typeof error.code === 'string' && /^[A-Z_]{1,80}$/.test(error.code) ? error.code : 'DIAGNOSTIC_CHECK_FAILED' };
  report.diagnosis ||= { outcome: 'diagnostic-failed' };
} finally {
  const closed = await Promise.allSettled(Object.values(apps).map(app => app.close()));
  report.lifecycle = Object.values(apps).map(app => {
    const l = app.lifecycle;
    // Whitelist lifecycle counters; never archive arbitrary native diagnostics.
    return { name: app.name, directory: app.directory, pid: l.pid, commands: l.commands,
      stderrBytes: l.stderrBytes, stdoutNoiseBytes: l.stdoutNoiseBytes,
      forcedSignals: l.forcedSignals, exit: l.exit || null, close: l.close || null,
      naturalExit: l.naturalExit === true, failureCode: l.failureCode || null };
  });
  report.bothClosedNaturally = closed.length === 2 && closed.every(r => r.status === 'fulfilled') &&
    report.lifecycle.every(l => l.naturalExit && l.exit?.code === 0 && l.exit?.signal === null && !l.forcedSignals.length);
  if (original) {
    try {
      const after = snapshot();
      report.originalDocumentsUnchanged = {};
      for (const name of ['a', 'b']) {
        for (const n of original[name]) {
          const actual = after[name].find(x => x.id === n.id);
          assert.ok(actual);
          assert.deepEqual(actual.document, n.document);
          assert.equal(actual.plainText, n.plainText);
        }
        report.originalDocumentsUnchanged[name] = true;
      }
      report.finalNotes = summarizeNotes(after);
    } catch { report.documentComparisonFailure = 'ORIGINAL_DOCUMENT_COMPARISON_FAILED'; }
  }
  report.finishedAt = new Date().toISOString();
  try { await save(); } catch { console.log(JSON.stringify({ phase: 'diagnostic-report-save-failed' })); }
  console.log(JSON.stringify({ phase: 'two-desktop-diagnostic-closed', diagnosis: report.diagnosis,
    bothClosedNaturally: report.bothClosedNaturally, originalDocumentsUnchanged: report.originalDocumentsUnchanged || null,
    failure: report.failure || null, lifecycle: report.lifecycle }));
}
