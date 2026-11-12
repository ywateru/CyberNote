import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { acquireDriverLease, guardDriverMethods } from './sync108-android-lifecycle.mjs';

test('A close, B acquire, A close again preserves B lock; closing is idempotent and methods refuse use', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sync108-lock-unit-')), lock = join(directory, 'owned.lock');
  try {
    const a = await acquireDriverLease(lock); let cleanups = 0, calls = 0;
    const close = () => a.close(async () => { cleanups++; });
    const api = guardDriverMethods({ close, readWorkspace: () => ++calls }, a);
    assert.equal(api.readWorkspace(), 1);
    const first = api.close(); assert.equal(api.close(), first);
    assert.throws(() => api.readWorkspace(), { code: 'ANDROID_DRIVER_CLOSED' });
    await first;
    const b = await acquireDriverLease(lock), owner = await readFile(join(lock, 'owner'), 'utf8');
    assert.equal(api.close(), first); await api.close();
    assert.equal(await readFile(join(lock, 'owner'), 'utf8'), owner); b.assertOpen();
    assert.equal(cleanups, 1); assert.equal(calls, 1);
    await b.close(async () => {});
  } finally { await rm(directory, { recursive: true }); }
});

test('changed owner token prevents removal of a successor lock', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sync108-lock-unit-')), lock = join(directory, 'owned.lock');
  try {
    const a = await acquireDriverLease(lock);
    await writeFile(join(lock, 'owner'), 'successor-token');
    await assert.rejects(a.close(async () => {}), { code: 'ANDROID_DRIVER_LOCK_OWNER_CHANGED' });
    assert.equal(await readFile(join(lock, 'owner'), 'utf8'), 'successor-token');
  } finally { await rm(directory, { recursive: true }); }
});
