/** Exactly one actual product SignIn. No credentials, callbacks or enablement.
 * On hosted-auth handoff this process retains its existing driver/lease.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import readline from 'node:readline';
import { connectAndroid, PACKAGE, SERIAL } from '/Users/water/work/2026/Apple-Notes-Clone/scripts/verification/account109-android.mjs';

const MAIN = '/Users/water/work/2026/Apple-Notes-Clone';
const ARCHIVE = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = '/private/tmp/account109-android-real-9263-jwks01';
const ADB = '/Users/water/Library/Android/sdk/platform-tools/adb';
const LOCK = `/private/tmp/cybernote-account109-${SERIAL}.lock`;
const EXPECTED = 'da74379984dfc0af86bff1ae89aeac43c83fdab4e7884b9b032961519c404ce9';
const hash = x => createHash('sha256').update(typeof x === 'string' || Buffer.isBuffer(x) ? x : JSON.stringify(x)).digest('hex');
const saveFile = (name, value) => {
  const data = JSON.stringify(value, null, 2) + '\n';
  for (const dir of [OUTPUT, ARCHIVE]) writeFileSync(path.join(dir, name), data);
};
const run = (...args) => execFileSync(ADB, ['-s', SERIAL, ...args],
  { encoding: 'utf8', timeout: 25000, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
const forwards = () => run('forward', '--list').trim().split('\n').filter(Boolean).filter(l => l.startsWith(SERIAL + ' '));
const preflight = () => JSON.parse(execFileSync('python3', ['-c',
  'import runpy,json; m=runpy.run_path(' + JSON.stringify(path.join(ARCHIVE, 'preflight.py')) + '); print(json.dumps(m["check"]()))'],
  { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'ignore'] }));
const codes = ['account_configuration', 'account_authentication', 'account_auth_callback_invalid',
  'account_auth_identity_invalid', 'account_auth_code_rejected', 'account_auth_token_response_invalid',
  'account_auth_refresh_missing', 'account_owner_workspace_mismatch', 'account_network', 'account_enrollment_invalid',
  'account_storage', 'account_cancelled', 'account_busy', 'account_platform_unsupported', 'account_cleanup_required',
  'account_sync_failed', 'account_sync_protocol'];
const stages = ['callbackListen', 'browserOpen', 'callbackReceive', 'identityProvider', 'coordinator',
  'coordinatorConfiguration', 'coordinatorRegistration', 'coordinatorProfile', 'coordinatorEnrollment',
  'coordinatorJwks', 'authorizationProvider', 'identitySession', 'identityRefresh', 'identityRevocation', 'coordinatorSession'];
const reasons = ['configuration', 'network', 'invalidCallback', 'invalidIdentity', 'identityRejected',
  'codeExchangeRejected', 'tokenResponseInvalid', 'missingRefreshToken', 'cancelled', 'noSession',
  'ownershipMismatch', 'storage', 'refreshFailed', 'revocationFailed', 'busy'];
const states = ['signedOut', 'authorizing', 'connecting', 'ready', 'paused', 'error'];
const pick = (value, allowed) => allowed.includes(value) ? value : null;
const safe = s => ({ state: pick(s.state, states), enabled: s.enabled === true, hasProfile: !!s.profile,
  identityCheck: s.profile?.username === undefined ? 'unverified' :
    s.profile.username === 'cybernoteqa20261113a' ? 'expectedSyntheticUser' : 'differentUser',
  hasError: !!s.error, error: s.error ? { code: pick(s.error.code, codes), stage: pick(s.error.stage, stages),
    providerReason: pick(s.error.providerReason, reasons) } : null });
const browserState = () => {
  const report = { browserForeground: false, host: null, passwordFieldPresent: null, inputFieldsPresent: null };
  try {
    const activity = run('shell', 'dumpsys', 'activity', 'activities');
    const line = activity.split('\n').find(l => l.includes('mResumedActivity:')) || '';
    report.browserForeground = /\su0\s+(?:com\.android\.chrome|com\.chrome\.beta|com\.sec\.android\.app\.sbrowser|org\.mozilla\.firefox|org\.chromium\.chrome)\//.test(line);
    if (report.browserForeground) {
      const xml = run('shell', 'uiautomator', 'dump', '/dev/tty');
      report.passwordFieldPresent = /password="true"/.test(xml);
      report.inputFieldsPresent = /class="android\.widget\.EditText"/.test(xml);
      for (const node of xml.match(/<node\b[^>]*>/g) || []) {
        if (!/resource-id="[^"]*(?:url_bar|location_bar_edit_text)[^"]*"/.test(node)) continue;
        const text = node.match(/\btext="([^"]*)"/)?.[1];
        if (!text) continue;
        try {
          const host = new URL(/^https?:\/\//.test(text) ? text : 'https://' + text).hostname;
          if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) report.host = host;
        } catch {}
      }
    }
  } catch { report.inspectionUnavailable = true; }
  return report;
};
const report = { schema: 1, kind: 'one-android-real-product-signin-initially-paused',
  startedAt: new Date().toISOString(), serial: SERIAL, package: PACKAGE, expectedApkSha256: EXPECTED,
  signinCalls: 0, maxAuthenticationWaitMs: 90000, observations: [],
  enablementCalled: false, credentialsInjected: false, callbackInjected: false, tokenInjected: false,
  cancelCalled: false, signOutCalled: false, originalAppTouched: false, deviceSettingsTouched: false,
  output: OUTPUT, cleanup: {}, outcome: null };
let client, baseline, previous, phase = 'readonly-preflight';
const save = () => saveFile('result.json', report);
const noteDigests = notes => notes.map(n => ({ id: n.id, documentSha256: hash(n.document), plainTextSha256: hash(n.plainText) }));
async function preserve() {
  const current = await client.readWorkspace();
  assert.equal(current.notes.length, 4);
  for (const old of baseline) {
    const now = current.notes.find(n => n.id === old.id);
    assert.ok(now); assert.deepEqual(now.document, old.document); assert.equal(now.plainText, old.plainText);
  }
  report.allFourOriginalDocumentsAndPlainTextPreserved = true;
  report.finalNotes = noteDigests(current.notes);
}
async function observe() {
  const raw = await client.accountStatus(), status = safe(raw);
  assert.ok(status.state);
  if (JSON.stringify(status) !== previous) {
    previous = JSON.stringify(status);
    report.observations.push({ elapsedMs: report.signinRequestedAtMs ? Date.now() - report.signinRequestedAtMs : 0, ...status });
    save();
    console.log(JSON.stringify({ phase: 'safe-native-account-status', ...status }));
  }
  report.lastSafeStatus = status;
  return status;
}
try {
  const before = preflight();
  saveFile('preflight.json', before);
  assert.ok(before.passed && before.unlocked && before.isolatedPackageUser0Foreground && before.currentUser === '0');
  assert.equal(before.installedApk.sha256, EXPECTED);
  report.forwardsBefore = forwards();
  assert.deepEqual(report.forwardsBefore, []);
  phase = 'connect-owned-driver-and-preserve-four-documents';
  client = await connectAndroid();
  report.owned = { ...client.owned };
  assert.ok(forwards().includes(`${SERIAL} ${client.owned.local} ${client.owned.remote}`));
  const expected = JSON.parse(readFileSync(MAIN + '/docs/verification/account109/android/9263-debug/synthetic-after-restart.json')).notes;
  const workspace = await client.readWorkspace();
  assert.equal(expected.length, 4); assert.equal(workspace.notes.length, 4);
  baseline = expected;
  await preserve();
  report.originalNotes = noteDigests(baseline);
  const prior = await observe();
  assert.equal(prior.enabled, false);
  assert.equal(prior.hasProfile, false);
  assert.ok(['signedOut', 'error'].includes(prior.state));
  phase = 'one-product-ui-signin';
  await client.openAccount();
  report.signinCalls++;
  report.signinRequestedAtMs = Date.now();
  report.signinRequestedAt = new Date().toISOString();
  save();
  await client.signIn();
  console.log(JSON.stringify({ phase: 'one-product-signin-requested', signinCalls: report.signinCalls, ownedPid: client.owned.pid }));
  phase = 'bounded-real-native-profile-or-error';
  const deadline = report.signinRequestedAtMs + 90000;
  while (Date.now() < deadline) {
    const status = await observe();
    if (status.hasError || status.state === 'error') {
      report.outcome = 'TERMINAL_NATIVE_ERROR'; break;
    }
    if (status.hasProfile) {
      assert.equal(status.identityCheck, 'expectedSyntheticUser');
      assert.equal(status.enabled, false);
      assert.equal(status.state, 'paused');
      report.outcome = 'EXPECTED_SYNTHETIC_USER_AUTHENTICATED_INITIALLY_PAUSED'; break;
    }
    await new Promise(resolve => setTimeout(resolve, Math.min(1000, Math.max(1, deadline - Date.now()))));
  }
  report.authenticationWaitMs = Date.now() - report.signinRequestedAtMs;
  await preserve();
  if (!report.outcome) {
    report.outcome = 'AWAITING_HOSTED_AUTHENTICATION';
    report.browser = browserState();
    report.cleanup = { driverKeptOpenAwaitingParent: true, exactForwardRetained: true,
      leaseRetained: existsSync(LOCK), adbOwnershipReturned: false };
    save();
    console.log(JSON.stringify({ phase: 'AWAITING_HOSTED_AUTHENTICATION', browser: report.browser,
      allFourOriginalDocumentsAndPlainTextPreserved: true, driverKeptOpen: true }));
    // Explicit control channel for the parent. It supports only status/close,
    // never a second sign-in or an account mutation.
    const lines = readline.createInterface({ input: process.stdin });
    for await (const command of lines) {
      if (command.trim() === 'status') {
        const status = await observe();
        await preserve();
        if (status.hasError || status.state === 'error') { report.outcome = 'TERMINAL_NATIVE_ERROR'; break; }
        if (status.hasProfile) {
          assert.equal(status.identityCheck, 'expectedSyntheticUser'); assert.equal(status.enabled, false); assert.equal(status.state, 'paused');
          report.outcome = 'EXPECTED_SYNTHETIC_USER_AUTHENTICATED_INITIALLY_PAUSED'; break;
        }
        report.browser = browserState(); save();
        console.log(JSON.stringify({ phase: 'AWAITING_HOSTED_AUTHENTICATION', browser: report.browser, driverKeptOpen: true }));
      } else if (command.trim() === 'close') { report.outcome = 'PARENT_REQUESTED_DRIVER_CLOSE'; break; }
    }
    lines.close();
  }
} catch (error) {
  report.outcome = 'SIGNIN_DIAGNOSTIC_FAILED';
  report.failure = { phase, code: typeof error.code === 'string' && /^[A-Z_]{1,80}$/.test(error.code) ? error.code : 'SIGNIN_CHECK_FAILED' };
} finally {
  if (client) {
    try {
      if (baseline) await preserve();
      await client.close();
      const exact = `${SERIAL} ${client.owned.local} ${client.owned.remote}`;
      report.cleanup = { driverClosed: true, exactForwardAbsent: !forwards().includes(exact),
        finalForwards: forwards(), leaseAbsent: !existsSync(LOCK), adbOwnershipReturned: true };
    } catch {
      // A preservation failure must not leave a lease or forward behind.
      try { await client.close(); } catch {}
      report.cleanup = { failure: 'DRIVER_OR_PRESERVATION_CLEANUP_FAILED', leaseAbsent: !existsSync(LOCK) };
    }
  } else report.cleanup = { driverNeverConnected: true, adbOwnershipReturned: true };
  report.finishedAt = new Date().toISOString();
  save();
  console.log(JSON.stringify({ phase: 'one-signin-finished', outcome: report.outcome, lastSafeStatus: report.lastSafeStatus || null,
    signinCalls: report.signinCalls, allFourOriginalDocumentsAndPlainTextPreserved: report.allFourOriginalDocumentsAndPlainTextPreserved === true,
    cleanup: report.cleanup, failure: report.failure || null }));
}
