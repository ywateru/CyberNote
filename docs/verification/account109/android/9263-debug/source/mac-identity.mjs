/** Recheck the sealed mac receipt without dist or any Cargo target. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { brotliCompressSync, constants } from 'node:zlib';
import assert from 'node:assert/strict';
import { verifyEmbeddedIdentity } from '/Users/water/work/2026/Apple-Notes-Clone/scripts/publish/package-identity.mjs';
import { sourceIdentity } from '/Users/water/work/2026/Apple-Notes-Clone/scripts/build-info.mjs';
const root = '/Users/water/work/2026/Apple-Notes-Clone';
const receipt = JSON.parse(readFileSync(root + '/docs/verification/account109/macos/9263ea87-debug-e2e.json'));
const native = readFileSync(receipt.binary.path);
const expected = Buffer.from(receipt.buildInfoExactUtf8);
const hash = b => createHash('sha256').update(b).digest('hex');
assert.equal(hash(native), receipt.binary.expectedSha256);
assert.equal(hash(expected), receipt.buildInfoSha256);
assert.equal(native.readUInt32LE(0), 0xfeedfacf);
assert.equal(native.readUInt32LE(4), 0x0100000c);
const { quality, mode, encodedSha256 } = receipt.embeddedIdentity.encodingParameters;
const encoded = brotliCompressSync(expected, { params: {
  [constants.BROTLI_PARAM_QUALITY]: quality, [constants.BROTLI_PARAM_MODE]: mode,
} });
assert.equal(hash(encoded), encodedSha256);
const embedded = verifyEmbeddedIdentity(native, expected, [encoded]);
assert.equal(embedded.sha256, receipt.embeddedIdentity.sha256);
const current = sourceIdentity(root, { metadataPath: null });
assert.equal(current.sourceFingerprint, receipt.buildInfo.sourceFingerprint);
assert.equal(current.inputCount, receipt.buildInfo.inputCount);
console.log(JSON.stringify({ phase: 'mac-sealed-identity-revalidated', binarySha256: hash(native),
  embeddedIdentity: embedded, productFingerprintMatches9263: true, usedDist: false, usedCargoTarget: false }));
