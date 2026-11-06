import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const [manifestArg, binaryArg, outArg] = process.argv.slice(2);
assert(manifestArg && binaryArg && outArg, 'usage: node extract-assets.mjs MANIFEST BINARY OUT');
const root = process.cwd(), manifest = path.resolve(manifestArg), binary = path.resolve(binaryArg), out = path.resolve(outArg);
const dist = JSON.parse(fs.readFileSync(manifest)).frontendFiles;
assert(Array.isArray(dist) && dist.length > 0);
const data = fs.readFileSync(binary), hash = x => crypto.createHash('sha256').update(x).digest('hex');
fs.mkdirSync(out, { recursive: true });
const records = [];
for (const expected of dist) {
  assert(!path.isAbsolute(expected.path) && !expected.path.split('/').includes('..'));
  const bytes = fs.readFileSync(path.join(root, 'dist', expected.path));
  assert.equal(hash(bytes), expected.sha256); assert.equal(bytes.length, expected.bytes);
  const name = Buffer.from(path.basename(expected.path)), positions = [];
  let p = -1;
  while ((p = data.indexOf(name, p + 1)) >= 0) positions.push(p);
  const references = expected.path === 'index.html'
    ? [...bytes.toString().matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)].map(m => path.basename(m[1]))
    : [];
  const inputBound = Math.max(1200000, bytes.length * 2 + 65536);
  const outputBound = Math.max(2000000, bytes.length * 2 + 65536);
  assert(inputBound <= 32000000 && outputBound <= 32000000, 'review larger asset bounds explicitly');
  const candidates = []; let selected;
  for (const pos of positions) {
    for (let offset = pos + name.length; offset <= pos + name.length + 32; offset++) {
      let decoded;
      try { decoded = zlib.brotliDecompressSync(data.subarray(offset, Math.min(offset + inputBound, data.length)), { maxOutputLength: outputBound, info: true }); }
      catch { continue; }
      const candidate = { offset, bytes: decoded.buffer.length, sha256: hash(decoded.buffer), compressedBytes: decoded.engine.bytesWritten };
      candidates.push(candidate);
      const exactDist = decoded.buffer.equals(bytes);
      const htmlCandidate = expected.path === 'index.html' && references.length > 0 && references.every(ref => decoded.buffer.includes(Buffer.from(ref)));
      if (!exactDist && !htmlCandidate) continue;
      selected = { ...candidate, exactDist };
      fs.mkdirSync(path.dirname(path.join(out, expected.path)), { recursive: true });
      fs.writeFileSync(path.join(out, expected.path), decoded.buffer);
      break;
    }
    if (selected) break;
  }
  records.push({ path: expected.path, expectedBytes: expected.bytes, expectedSha256: expected.sha256, inputBound, outputBound, filenameOffsets: positions, match: selected, candidates });
}
const result = { manifest, binary, binaryBytes: data.length, binarySha256: hash(data), method: 'Bounded complete Brotli decode in offsets 0..32 after embedded basenames. Every non-HTML asset must equal current dist and recorded bytes/SHA. HTML requires independent complete ordered token comparison.', records };
fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ binary, binarySha256: result.binarySha256, records: records.map(r => ({ path: r.path, match: r.match })) }, null, 2));
if (records.some(r => !r.match)) process.exitCode = 1;
