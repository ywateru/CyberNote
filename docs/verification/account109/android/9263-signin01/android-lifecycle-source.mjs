// Device-free ownership primitive shared by the Android driver and offline tests.
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

const failure = code => Object.assign(Error(code), { code, phase: 'driver-lifecycle' });
export async function acquireDriverLease(directory) {
  await mkdir(directory).catch(() => { throw failure('ANDROID_DRIVER_LOCK_BUSY'); });
  const token = randomUUID(), ownerFile = join(directory, 'owner');
  await writeFile(ownerFile, token, { flag: 'wx', mode: 0o600 });
  let closing;
  const assertOpen = () => { if (closing) throw failure('ANDROID_DRIVER_CLOSED'); };
  const close = cleanup => {
    if (!closing) {
      // Assign before cleanup starts, so reentrant close cannot release twice.
      closing = Promise.resolve().then(async () => {
        try { await cleanup(); }
        finally {
          const current = await readFile(ownerFile, 'utf8').catch(() => null);
          if (current !== token) throw failure('ANDROID_DRIVER_LOCK_OWNER_CHANGED');
          await rm(directory, { recursive: true });
        }
      });
    }
    return closing;
  };
  return { assertOpen, close };
}

export function guardDriverMethods(api, lease) {
  return Object.fromEntries(Object.entries(api).map(([name, value]) => [name,
    typeof value === 'function' && name !== 'close'
      ? (...args) => { lease.assertOpen(); return value(...args); } : value]));
}
