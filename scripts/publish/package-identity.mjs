import { readFileSync, readdirSync, lstatSync, realpathSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync } from 'node:zlib';
import { sourceIdentity, assertVersions } from '../build-info.mjs';
import { digest } from './policy.mjs';

export function validatePackageInfo(info, root) {
  const actual = sourceIdentity(root, { metadataPath: null });
  if (actual.sourceDirty || info.schema !== 1 || info.mode !== 'production' || info.version !== assertVersions(root) || !Number.isFinite(Date.parse(info.builtAt))) throw Error('Expected production identity from current clean source');
  for (const key of ['sourceRevision', 'sourceFingerprint', 'sourceDirty', 'inputCount']) if (info[key] !== actual[key]) throw Error('Build identity differs from current source');
  return info;
}
export function verifyEmbeddedIdentity(native, expected, candidates = []) {
  // Tauri embeds build-info as a raw asset or a Brotli-compressed asset. Match
  // the actual encoded payload in the packaged executable, not a sidecar claim.
  if (native.includes(expected)) return { encoding: 'raw', sha256: digest(expected) };
  for (const candidate of candidates) {
    if (candidate.length > 1024 * 1024) continue;
    try {
      const decoded = brotliDecompressSync(candidate, { maxOutputLength: 1024 * 1024 });
      if (decoded.equals(expected) && native.includes(candidate)) return { encoding: 'brotli', sha256: digest(expected) };
    } catch { /* Not this asset; no untrusted bytes are reflected. */ }
  }
  throw Error('Packaged executable does not contain the current build identity');
}
function regular(path) {
  const st = lstatSync(path);
  if (!st.isFile() || st.isSymbolicLink() || st.size > 1024 * 1024) throw Error('Unsafe generated identity asset');
  return readFileSync(path);
}
function encodedAssets(build) {
  const candidates = [];
  if (!lstatSync(build).isDirectory() || lstatSync(build).isSymbolicLink()) throw Error('Unsafe Cargo build directory');
  for (const entry of readdirSync(build, { withFileTypes: true })) {
    if (!entry.name.startsWith('notes-clone-') || !entry.isDirectory()) continue;
    let path = join(build, entry.name);
    try {
      for (const part of ['out', 'tauri-codegen-assets']) {
        path = join(path, part);
        const st = lstatSync(path);
        if (!st.isDirectory() || st.isSymbolicLink()) throw Error('Unsafe generated assets directory');
      }
      for (const asset of readdirSync(path)) {
        if (/^[a-f0-9]{64}\.json$/.test(asset)) candidates.push(regular(join(path, asset)));
        if (candidates.length > 4096) throw Error('Too many generated identity candidates');
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return candidates;
}
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
  const [nativePath, build] = process.argv.slice(2);
  if (!nativePath || !build || process.argv.length !== 4) throw Error('Expected native executable and exact Cargo release/build directory');
  const bytes = readFileSync(join(root, 'dist/build-info.json'));
  const info = validatePackageInfo(JSON.parse(bytes), root);
  const native = readFileSync(nativePath);
  const embedded = verifyEmbeddedIdentity(native, bytes, encodedAssets(build));
  console.log(JSON.stringify({ info, nativeBinarySha256: digest(native), embeddedIdentity: embedded, currentSourceRevalidated: true }));
}
