import test from 'node:test';
import assert from 'node:assert/strict';
import { createCredentialTransfer } from './account109-credential-transfer.mjs';

const time = 1800000000000;
const marker = 'account109-offline-test-marker';
const fixture = changes => ({
  marker, purpose: 'account109-synthetic-login', expiresAt: time + 180000,
  username: 'cybernoteqa20261113a', passphrase: 'offline-fixture-only', ...changes,
});

test('validated acknowledgement precedes consume, raw buffer is wiped, references cleared', async () => {
  const raw = Buffer.from(JSON.stringify(fixture()));
  const phases = [];
  let observed;
  const transfer = createCredentialTransfer({
    read: () => raw, now: () => time,
    captured: receipt => {
      assert.deepEqual(receipt, { phase: 'captured', captured: true, markerMatched: true, valuesRecorded: false });
      assert.ok(raw.every(byte => byte === 0));
      phases.push('captured');
    },
    consume: data => {
      phases.push('consume');
      assert.equal(data.username, fixture().username);
      assert.equal(data.passphrase, fixture().passphrase);
      observed = data;
    },
  });
  assert.deepEqual(await transfer(marker), { phase: 'submitted-via-hosted-ui', submitted: true, valuesRecorded: false });
  assert.deepEqual(phases, ['captured', 'consume']);
  assert.equal(observed.username, null);
  assert.equal(observed.passphrase, null);
  await assert.rejects(transfer(marker), { code: 'CAPTURE_ALREADY_ATTEMPTED' });
});

test('schema, owner, marker and validity failures never acknowledge or consume', async t => {
  const failures = [
    ['marker', { marker: 'other-synthetic-marker' }],
    ['purpose', { purpose: 'other-purpose' }],
    ['username', { username: 'other-synthetic-owner' }],
    ['expired', { expiresAt: time }],
    ['too-far-future', { expiresAt: time + 240001 }],
    ['invalid-expiry', { expiresAt: {} }],
    ['invalid-expiry-text', { expiresAt: 'invalid' }],
    ['empty-secret', { passphrase: '' }],
    ['wrong-secret-type', { passphrase: 42 }],
    ['oversized-secret', { passphrase: 'x'.repeat(4097) }],
    ['linefeed', { passphrase: 'offline\nfixture' }],
    ['return', { passphrase: 'offline\rfixture' }],
    ['nul', { passphrase: 'offline\0fixture' }],
  ];
  for (const [name, change] of failures) await t.test(name, async () => {
    const raw = Buffer.from(JSON.stringify(fixture(change)));
    let called = false;
    const transfer = createCredentialTransfer({
      read: () => raw, now: () => time,
      captured: () => { called = true; }, consume: () => { called = true; },
    });
    await assert.rejects(transfer(marker), { code: 'TRANSFER_VALIDATION_FAILED' });
    assert.equal(called, false);
    assert.ok(raw.every(byte => byte === 0));
  });
});

test('read and JSON failures have distinct fixed errors with no original error attached', async () => {
  const unexpected = () => assert.fail('must not acknowledge or consume');
  const unreadable = createCredentialTransfer({
    read: () => { throw Error('synthetic-private-reader-detail'); }, captured: unexpected, consume: unexpected,
  });
  await assert.rejects(unreadable(marker), error => {
    assert.equal(error.code, 'CLIPBOARD_READ_FAILED');
    assert.equal(error.message, 'CLIPBOARD_READ_FAILED');
    assert.equal(error.cause, undefined);
    return true;
  });
  await assert.rejects(unreadable(marker), { code: 'CAPTURE_ALREADY_ATTEMPTED' });
  const raw = Buffer.from('synthetic-invalid-json');
  const invalid = createCredentialTransfer({ read: () => raw, captured: unexpected, consume: unexpected });
  await assert.rejects(invalid(marker), { code: 'CLIPBOARD_JSON_INVALID' });
  assert.ok(raw.every(byte => byte === 0));
});

test('failed trusted-page or native-transaction check clears parsed fields without retry', async () => {
  let data;
  const transfer = createCredentialTransfer({
    read: () => Buffer.from(JSON.stringify(fixture())), now: () => time,
    captured: () => {},
    consume: value => {
      data = value;
      throw Object.assign(Error('NATIVE_TRANSACTION_NOT_WAITING'), { code: 'NATIVE_TRANSACTION_NOT_WAITING' });
    },
  });
  await assert.rejects(transfer(marker), { code: 'NATIVE_TRANSACTION_NOT_WAITING' });
  assert.equal(data.username, null);
  assert.equal(data.passphrase, null);
  await assert.rejects(transfer(marker), { code: 'CAPTURE_ALREADY_ATTEMPTED' });
});

test('epoch seconds and ISO expiry are accepted; invalid marker never reads', async () => {
  for (const expiresAt of [(time + 180000) / 1000, new Date(time + 180000).toISOString()]) {
    const transfer = createCredentialTransfer({
      read: () => Buffer.from(JSON.stringify(fixture({ expiresAt }))), now: () => time,
      captured: () => {}, consume: () => {},
    });
    assert.equal((await transfer(marker)).submitted, true);
  }
  let read = false;
  const transfer = createCredentialTransfer({
    read: () => { read = true; }, captured: () => {}, consume: () => {},
  });
  await assert.rejects(transfer('short'), { code: 'MARKER_REQUIRED' });
  assert.equal(read, false);
});
