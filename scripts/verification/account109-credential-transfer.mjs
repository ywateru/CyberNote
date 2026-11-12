/** One-shot, memory-only transfer for the synthetic hosted-login UI test.
 * Importing this module never reads the clipboard or operates a device.
 * Callers must verify the current native transaction, trusted origin and form
 * in consume() before sending credentials through CDP Input. No grant injection.
 */
import { execFileSync } from 'node:child_process';

const safeError = code => Object.assign(new Error(code), { code });
const readClipboard = () => execFileSync('/usr/bin/pbpaste', [], {
  maxBuffer: 16384, timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'],
});

export function createCredentialTransfer({
  read = readClipboard, now = Date.now, captured, consume,
}) {
  if (typeof read !== 'function' || typeof now !== 'function' ||
      typeof captured !== 'function' || typeof consume !== 'function') {
    throw safeError('TRANSFER_CONFIGURATION_INVALID');
  }
  let attempted = false;
  return async function transfer(marker) {
    if (attempted) throw safeError('CAPTURE_ALREADY_ATTEMPTED');
    attempted = true;
    let raw, data;
    try {
      if (typeof marker !== 'string' || marker.length < 12 || marker.length > 160) {
        throw safeError('MARKER_REQUIRED');
      }
      try { raw = await read(); }
      catch { throw safeError('CLIPBOARD_READ_FAILED'); }
      if (!Buffer.isBuffer(raw) || raw.length > 16384) {
        throw safeError('CLIPBOARD_BUFFER_INVALID');
      }
      try { data = JSON.parse(raw.toString('utf8')); }
      catch { throw safeError('CLIPBOARD_JSON_INVALID'); }
      finally { raw.fill(0); raw = undefined; }
      const expiry = typeof data?.expiresAt === 'number'
        ? (data.expiresAt < 1e12 ? data.expiresAt * 1000 : data.expiresAt)
        : (typeof data?.expiresAt === 'string' ? Date.parse(data.expiresAt) : NaN);
      const time = now();
      if (!data || Array.isArray(data) || data.marker !== marker ||
          data.purpose !== 'account109-synthetic-login' ||
          !Number.isFinite(time) || !Number.isFinite(expiry) ||
          expiry <= time || expiry > time + 240000 ||
          data.username !== 'cybernoteqa20261113a' ||
          typeof data.passphrase !== 'string' || !data.passphrase ||
          data.passphrase.length > 4096 || /[\0\r\n]/.test(data.passphrase)) {
        throw safeError('TRANSFER_VALIDATION_FAILED');
      }
      // The caller can immediately notify the clipboard owner before any UI work.
      try {
        await captured(Object.freeze({
          phase: 'captured', captured: true, markerMatched: true, valuesRecorded: false,
        }));
      } catch { throw safeError('CAPTURE_ACKNOWLEDGEMENT_FAILED'); }
      // The acknowledgement may have waited for a human or another process.
      // Its completion does not extend the original transfer's validity.
      const afterAcknowledgement = now();
      if (!Number.isFinite(afterAcknowledgement) || expiry <= afterAcknowledgement) {
        throw safeError('TRANSFER_EXPIRED_AFTER_ACKNOWLEDGEMENT');
      }
      try { await consume(data); }
      catch { throw safeError('CREDENTIAL_CONSUMER_FAILED'); }
      // Only the UI consumer can establish a real submit or native callback.
      return { phase: 'consumer-completed', consumerCompleted: true, valuesRecorded: false };
    } finally {
      if (Buffer.isBuffer(raw)) raw.fill(0);
      if (data && typeof data === 'object') {
        data.username = null;
        data.passphrase = null;
      }
      raw = undefined;
      data = undefined;
    }
  };
}
