import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync, realpathSync } from 'node:fs';
import { resolve, relative, join, dirname, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync } from 'node:zlib';
import { releaseStamp, validateStamp, projectRoot, productFiles } from './build-info.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const writeJSON = (path, value) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(value, null, 2) + '\n'); };
function walk(root) {
  const result = [];
  const visit = path => {
    if (statSync(path).isDirectory()) for (const name of readdirSync(path).sort()) visit(join(path, name));
    else result.push(path);
  };
  visit(root); return result;
}
export function artifactDigest(path) {
  if (!statSync(path).isDirectory()) return sha(readFileSync(path));
  const hash = createHash('sha256');
  for (const file of walk(path)) { const bytes = readFileSync(file); hash.update(relative(path, file) + '\0' + bytes.length + '\0'); hash.update(bytes); }
  return hash.digest('hex');
}
export function verifyFrontend(frontend, stamp, root = projectRoot) {
  const info = json(resolve(frontend, 'build-info.json'));
  assert.equal(info.schema, 1); assert.equal(info.mode, 'production');
  assert.ok(info.builtAt && new Date(info.builtAt).toISOString() === info.builtAt, 'Missing real UTC build timestamp');
  validateStamp({ schema: 1, version: info.version, sourceRevision: info.sourceRevision, sourceFingerprint: info.sourceFingerprint, sourceDirty: info.sourceDirty, inputCount: info.inputCount, preparedAt: info.releasePreparedAt || info.builtAt }, root);
  if (stamp) {
    validateStamp(stamp, root);
    for (const key of ['version', 'sourceRevision', 'sourceFingerprint']) assert.equal(info[key], stamp[key], `Frontend differs from release stamp: ${key}`);
    assert.equal(info.releasePreparedAt, stamp.preparedAt, 'Frontend was not built with this release stamp');
  }
  const runtime = walk(frontend).filter(p => p.endsWith('.js')).some(p => {
    const text = readFileSync(p, 'utf8'); return [info.sourceFingerprint, info.builtAt, info.sourceRevision].every(value => text.includes(value));
  });
  assert.ok(runtime, 'Build identity is absent from production JavaScript');
  return info;
}
export function verifyEmbedded(binary, embeddedAssets, info) {
  const executable = readFileSync(binary), witnesses = {};
  for (const path of walk(embeddedAssets).filter(p => /\.(json|js)$/.test(p))) {
    const encoded = readFileSync(path);
    let decoded;
    try { decoded = brotliDecompressSync(encoded); } catch { decoded = encoded; }
    let kind;
    if (path.endsWith('.json')) {
      try { if (JSON.stringify(JSON.parse(decoded.toString())) === JSON.stringify(info)) kind = 'metadata'; } catch { /* Other JSON assets are unrelated. */ }
    } else if ([info.sourceFingerprint, info.builtAt, info.sourceRevision].every(value => decoded.includes(Buffer.from(value)))) kind = 'runtime';
    if (kind && executable.includes(encoded)) witnesses[kind] = { asset: relative(projectRoot, path), sha256: sha(encoded), decodedBytes: decoded.length };
  }
  assert.ok(witnesses.metadata && witnesses.runtime, 'Native binary does not contain the matching metadata AND production runtime assets');
  return witnesses;
}
export function verifyMacEntry(artifact, binary) {
  const bundle = realpathSync(artifact);
  const plist = JSON.parse(execFileSync('python3', ['-c', 'import json,plistlib,sys;p=plistlib.load(open(sys.argv[1],"rb"));print(json.dumps({"version":p.get("CFBundleShortVersionString"),"executable":p.get("CFBundleExecutable")}))', resolve(bundle, 'Contents/Info.plist')], { encoding: 'utf8' }));
  const name = plist.executable;
  assert.ok(typeof name === 'string' && name.length > 0 && name !== '.' && name !== '..' && !/[/\\\u0000-\u001f\u007f]/.test(name), 'Mac CFBundleExecutable must be a safe single filename');
  const macos = realpathSync(resolve(bundle, 'Contents/MacOS'));
  assert.ok(macos.startsWith(bundle + sep), 'Mac executable directory must belong to the supplied app');
  const actual = realpathSync(resolve(macos, name));
  assert.ok(dirname(actual) === macos && statSync(actual).isFile(), 'Mac CFBundleExecutable must resolve to a file within Contents/MacOS');
  assert.equal(realpathSync(binary), actual, 'Binary must match the actual Mac CFBundleExecutable');
  return { entry: `Contents/MacOS/${name}`, version: plist.version };
}
export function verifyAndroidEntry(artifact, binary, root = projectRoot) {
  // Tauri loads this project's Cargo [lib] cdylib, not an arbitrary auxiliary
  // .so chosen by the caller. The ABI comes from the actual APK entries.
  const cargo = readFileSync(resolve(root, 'src-tauri/Cargo.toml'), 'utf8');
  const lib = cargo.split(/^\[lib\][ \t]*\r?$/m)[1]?.split(/^\[/m)[0];
  const name = /^name\s*=\s*"([A-Za-z_][A-Za-z0-9_]*)"\s*$/m.exec(lib || '')?.[1];
  assert.ok(name, 'Cargo [lib] must specify the Android main library name');
  const library = `lib${name}.so`;
  assert.equal(basename(binary), library, 'Android binary must be the Cargo main library');
  const entries = JSON.parse(execFileSync('python3', ['-c', 'import json,zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps([n for n in z.namelist() if n.startswith("lib/") and n.endswith(".so")]))', artifact], { encoding: 'utf8' }));
  assert.ok(entries.length > 0 && entries.every(n => /^lib\/[^/]+\/[^/]+\.so$/.test(n)), 'APK native library paths are invalid');
  const abis = [...new Set(entries.map(n => n.split('/')[1]))];
  assert.ok(abis.length === 1 && ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64'].includes(abis[0]), 'Supply a single supported ABI APK');
  const entry = `lib/${abis[0]}/${library}`;
  assert.equal(entries.filter(n => n === entry).length, 1, 'APK must contain exactly one Cargo main library at its ABI entry');
  const bytes = execFileSync('python3', ['-c', 'import zipfile,sys;sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]))', artifact, entry], { maxBuffer: 256 * 1024 * 1024 });
  assert.equal(sha(bytes), sha(readFileSync(binary)), 'Supplied Android binary is not the actual Cargo main library in this APK');
  return { entry, abi: abis[0] };
}
export function verifyPackage({ platform, artifact, binary, assets, frontend, stamp, validationNote = 'Build identity and package bytes verified; functional/device validation is recorded separately.' }) {
  assert.ok(['macos', 'android'].includes(platform), 'platform must be macos or android');
  const info = verifyFrontend(frontend, stamp);
  let packageEntry;
  if (platform === 'macos') {
    const { entry, version } = verifyMacEntry(artifact, binary);
    packageEntry = entry;
    assert.equal(version, info.version, 'Mac bundle version differs from frontend');
  } else {
    packageEntry = verifyAndroidEntry(artifact, binary).entry;
    const sdk = process.env.ANDROID_HOME || resolve(process.env.HOME, 'Library/Android/sdk');
    const tools = resolve(sdk, 'build-tools');
    const aapt = readdirSync(tools).sort((a,b) => b.localeCompare(a, undefined, { numeric: true })).map(v => resolve(tools, v, 'aapt')).find(existsSync);
    assert.ok(aapt, 'Android aapt is required to inspect the APK version');
    const version = /versionName='([^']+)'/.exec(execFileSync(aapt, ['dump', 'badging', artifact], { encoding: 'utf8' }))?.[1];
    assert.equal(version, info.version, 'APK version differs from frontend');
  }
  const witnesses = verifyEmbedded(binary, assets, info);
  return { schema: 1, platform, artifact: relative(projectRoot, resolve(artifact)), artifactSha256: artifactDigest(artifact), binary: relative(projectRoot, resolve(binary)), binarySha256: sha(readFileSync(binary)), packageEntry, ...info, embedded: witnesses, validation: validationNote, verifiedAt: new Date().toISOString() };
}
export function publishLatest(manifests, root = projectRoot) {
  assert.equal(manifests.length, 2, 'Publish requires both Mac and Android manifests');
  assert.deepEqual(new Set(manifests.map(m => m.platform)), new Set(['macos', 'android']));
  for (const m of manifests) {
    assert.equal(m.schema, 1); assert.ok(m.embedded?.metadata && m.embedded?.runtime, 'Missing package-embedded identity evidence');
    validateStamp({ ...m, preparedAt: m.releasePreparedAt || m.builtAt }, root);
    assert.equal(artifactDigest(resolve(root, m.artifact)), m.artifactSha256, 'Delivered artifact changed after verification');
  }
  assert.equal(manifests[0].sourceFingerprint, manifests[1].sourceFingerprint, 'Packages are built from different product inputs');
  assert.equal(manifests[0].version, manifests[1].version);
  assert.equal(manifests[0].releasePreparedAt, manifests[1].releasePreparedAt, 'Packages are not from the same prepared release');
  assert.ok(manifests[0].releasePreparedAt, 'Prepare a shared release stamp before publishing');
  const table = ['| 平台 | 安装包 | 版本 / 构建时间（UTC） | 源码 |', '| --- | --- | --- | --- |', ...manifests.map(m => `| ${m.platform === 'macos' ? 'macOS' : 'Android'} | [${m.platform === 'macos' ? 'CyberNote.app' : 'APK'}](<${m.artifact}>) | ${m.version} / ${m.builtAt} | ${m.sourceRevision.slice(0,12)} + ${m.sourceFingerprint.slice(0,16)} |`)];
  const path = resolve(root, 'README.md'), text = readFileSync(path, 'utf8');
  const pattern = /<!-- latest-installers:start -->[\s\S]*?<!-- latest-installers:end -->/;
  assert.ok(pattern.test(text), 'README latest installer markers are missing');
  writeFileSync(path, text.replace(pattern, `<!-- latest-installers:start -->\n\n${table.join('\n')}\n\n双端源码指纹一致；功能与平台差异见[功能对应表](docs/platform-feature-matrix.md)。本机包不纳入 Git，验证范围见各平台交付 manifest。\n\n<!-- latest-installers:end -->`));
}
function cli() {
  const [command, ...args] = process.argv.slice(2), options = {};
  for (let i=0; i<args.length; i+=2) { assert.ok(args[i].startsWith('--') && args[i+1] && !args[i+1].startsWith('--'), `Expected --name value: ${args[i]}`); const key=args[i].slice(2); (options[key] ||= []).push(args[i+1]); }
  const one = key => options[key]?.[0];
  if (command === 'prepare') {
    assert.ok(one('out'), 'prepare requires --out');
    const out = resolve(one('out'));
    assert.ok(!productFiles().some(p => resolve(p) === out) && !['src','public','plugins','src-tauri','scripts'].some(p => out.startsWith(resolve(p) + sep)), 'Release stamp must be outside product inputs (use artifacts/)');
    const stamp = releaseStamp(); writeJSON(out, stamp); console.log(JSON.stringify(stamp, null, 2));
  } else if (command === 'verify-frontend') console.log(JSON.stringify(verifyFrontend(resolve(one('frontend') || 'dist'), one('stamp') ? json(one('stamp')) : undefined), null, 2));
  else if (command === 'verify-package') {
    for (const key of ['platform','artifact','binary','assets','frontend','stamp','out']) assert.ok(one(key), `verify-package requires --${key}`);
    const result = verifyPackage({ platform: one('platform'), artifact: resolve(one('artifact')), binary: resolve(one('binary')), assets: resolve(one('assets')), frontend: resolve(one('frontend')), stamp: json(one('stamp')), validationNote: one('validation-note') });
    writeJSON(resolve(one('out')), result); console.log(JSON.stringify(result, null, 2));
  } else if (command === 'publish') publishLatest((options.manifest || []).map(path => json(path)));
  else throw Error('Commands: prepare --out path; verify-frontend --frontend dist [--stamp path]; verify-package --platform macos|android --artifact path --binary path --assets Tauri-out-assets-dir --frontend dist --stamp path --out manifest.json; publish --manifest mac.json --manifest android.json');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli();
