import { createHash } from 'node:crypto';
import { posix } from 'node:path';

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function safePath(name, runtimeAsset = false) {
  if (typeof name !== 'string' || !name || name !== posix.normalize(name) || name.startsWith('/') || /[\\\x00-\x20\x7f]/.test(name) || name.split('/').some(p => p === '..' || p.startsWith('.') && !['.github', '.gitignore', '.editorconfig'].includes(p))) throw Error('Unsafe export path');
  if (/^(?:docs|references|output|labs|artifacts|dist|target|node_modules)\//.test(name) ||
      /(?:^|\/)(?:target|build|node_modules|evidence|verification|local\.properties|tauri\.properties|key\.properties|keystore\.properties)(?:\/|$)/.test(name) ||
      /\.(?:log|jsonl|sqlite\w*|db|key|pem|p12|pfx|jks|keystore|apk|aab|dmg|zip|mp4|wav|webm|tsbuildinfo)$/.test(name) ||
      /(?:tauri\.settings\.gradle|tauri\.build\.gradle\.kts|proguard-tauri\.pro)$/.test(name) ||
      (/\/jniLibs\//.test(name) && !(runtimeAsset && name === 'vendor/cybergrid-sdk/provider-assets/android-arm64/jniLibs/arm64-v8a/libcloudflared.so')) || /\/app\/src\/main\/assets\//.test(name)) throw Error(`Excluded export path: ${name}`);
  if (name.endsWith('.notesbackup') && !/^src-tauri\/tests\/fixtures\/archive\/[a-z-]+\.notesbackup$/.test(name)) throw Error('Only reviewed synthetic archive fixtures may be exported');
  return name;
}
export function scanBytes(name, bytes, approvedAssets = new Map()) {
  if (bytes.length > 50 * 1024 * 1024) throw Error(`File exceeds source export size limit: ${name}`);
  if (bytes.includes(0)) {
    const asset = approvedAssets.get(name);
    const approved = asset && asset.path === name && asset.size === bytes.length && asset.sha256 === digest(bytes);
    if (!approved && !/\.(?:png|icns|ico)$/.test(name) && name !== 'src-tauri/fonts/NotoSansCJKsc-Regular.otf' && name !== 'src-tauri/gen/android/gradle/wrapper/gradle-wrapper.jar') throw Error(`Unreviewed binary: ${name}`);
    return;
  }
  const text = bytes.toString();
  // Never echo values, snippets or hashes of a matched credential.
  if (/-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{30,255}|github_pat_[A-Za-z0-9_]{40,255})|\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{32,255}|xox[baprs]-[A-Za-z0-9-]{20,255}|AIza[A-Za-z0-9_-]{30,255})|\b(?:AKIA|ASIA)[A-Z0-9]{16}|\beyJ[A-Za-z0-9_-]{15,2000}\.[A-Za-z0-9_-]{15,2000}\.[A-Za-z0-9_-]{15,2000}|notes-sync-v1:[A-Za-z0-9_-]{32,2000}/.test(text)) throw Error(`Credential pattern in export input: ${name}`);
  for (const m of text.matchAll(/(?:https?|rediss?):\/\/[^\s/'"]{1,200}:[^\s/'"]{1,200}@[^\s'"<>]+/g)) {
    let synthetic = false;
    try {
      const url = new URL(m[0]);
      synthetic = (/(?:^|\.)(?:test|invalid|example)$/.test(url.hostname) || ['example.com', 'example.net', 'example.org'].includes(url.hostname)) &&
        ['u', 'user', 'test', 'fixture'].includes(url.username) &&
        ['p', 'pass', 'pass' + 'word', 'test', 'fixture'].includes(url['pass' + 'word']) &&
        (/(?:^|\/)test\//.test(name) || /(?:^|\/)tests\.rs$/.test(name));
    } catch { /* Malformed credential-shaped inputs fail closed too. */ }
    if (!synthetic) throw Error(`Credential URL in export input: ${name}`);
  }
  if (/\/Users\/[A-Za-z0-9_.-]+\/|\/home\/[A-Za-z0-9_.-]+\//.test(text)) throw Error(`Local user path in export input: ${name}`);
}

const manifestPath = 'scripts/publish/manifest.json';
const rightsSource = 'scripts/publish/LICENSE.project-reserved.txt';
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const revision = value => typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
const under = (path, root) => path.startsWith(root + '/');
function fields(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !allowed.includes(k))) throw Error(`Invalid ${label} declaration`);
}
function https(value) {
  if (typeof value !== 'string') throw Error('Expected pinned HTTPS source');
  const url = new URL(value);
  if (url.protocol !== 'https:' || !url.hostname || url.username || url['pass' + 'word'] || url.search || url.hash || value.split('/')[2].includes('@')) throw Error('Expected pinned HTTPS source');
}
function retained(files, paths) {
  if (!Array.isArray(paths) || !paths.length || new Set(paths).size !== paths.length) throw Error('Missing license closure');
  for (const path of paths) {
    safePath(path);
    const bytes = files.get(path);
    if (!bytes?.length || bytes.includes(0)) throw Error(`Missing text license input: ${path}`);
  }
}

// Validates the full candidate inventory BEFORE any binary scanner exemption.
// These declarations are reviewed assertions of authorship/provenance, not a
// machine-generated license grant or an authenticity proof for an upstream build.
export function validatePolicy(manifest, files) {
  const third = manifest.thirdParty;
  const first = manifest.firstParty ?? [], assets = manifest.runtimeAssets ?? [];
  if (!Array.isArray(third) || !Array.isArray(first) || !Array.isArray(assets)) throw Error('Invalid ownership/runtime inventory');
  const roots = [];
  for (const item of first) {
    fields(item, ['root', 'provenance', 'rights', 'rightsSource'], 'first-party');
    safePath(item.root);
    if ((!/^crates\/[A-Za-z0-9_-]+$/.test(item.root) && item.root !== 'plugins/tauri-plugin-notes-auth') || item.provenance !== 'project-authored' || item.rights !== 'reserved' || item.rightsSource !== rightsSource) throw Error('First-party requires exact project crate or reviewed auth plugin and reserved rights source');
    retained(files, [item.rightsSource]); roots.push(item.root);
  }
  for (const item of third) {
    fields(item, ['root', 'origin', 'revision', 'licenses'], 'third-party');
    safePath(item.root); https(item.origin);
    if (!/^(?:vendor|crates|services)\/[A-Za-z0-9_-]+$/.test(item.root) || !revision(item.revision)) throw Error('Invalid third-party source pin');
    retained(files, item.licenses);
    if (item.licenses.some(p => !under(p, item.root))) throw Error('Third-party license must belong to its source root');
    roots.push(item.root);
  }
  for (let i = 0; i < roots.length; i++) {
    if (![...files.keys()].some(p => under(p, roots[i]))) throw Error('Ownership root has no retained files');
    if (roots.slice(0, i).some(r => r === roots[i] || under(r, roots[i]) || under(roots[i], r))) throw Error('Overlapping ownership roots');
  }
  for (const path of files.keys()) {
    if ((/^(?:crates|vendor)\//.test(path) || under(path, 'plugins/tauri-plugin-notes-auth')) && !roots.some(root => under(path, root))) throw Error(`SDK/vendor/auth plugin requires explicit ownership and license: ${path}`);
  }
  const approved = new Map();
  for (const asset of assets) {
    fields(asset, ['path', 'sha256', 'size', 'source', 'licenses', 'provenance'], 'runtime asset');
    safePath(asset.path, true);
    if (!/^vendor\/[^/]+\/provider-assets\//.test(asset.path) || approved.has(asset.path)) throw Error('Runtime assets require unique exact vendor provider paths');
    const owner = third.find(p => under(asset.path, p.root));
    if (!owner || !sha(asset.sha256) || manifest.files[asset.path] !== asset.sha256 || !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > 50 * 1024 * 1024) throw Error('Invalid runtime asset hash/size/ownership');
    const bytes = files.get(asset.path);
    if (!bytes || bytes.length !== asset.size || digest(bytes) !== asset.sha256) throw Error(`Runtime asset bytes differ from reviewed pin: ${asset.path}`);
    fields(asset.source, ['url', 'revision', 'version'], 'runtime source');
    https(asset.source.url);
    if (!revision(asset.source.revision) || typeof asset.source.version !== 'string' || !/^[A-Za-z0-9._-]{1,80}$/.test(asset.source.version)) throw Error('Invalid runtime source pin');
    retained(files, asset.licenses);
    if (asset.licenses.some(p => !under(p, owner.root))) throw Error('Runtime licenses must belong to the retained vendor');
    fields(asset.provenance, ['manifest', 'platform'], 'runtime provenance');
    const sourcePath = asset.provenance.manifest;
    safePath(sourcePath);
    if (!under(sourcePath, owner.root) || !files.has(sourcePath) || !/^[a-z0-9]+-[a-z0-9]+$/.test(asset.provenance.platform)) throw Error('Missing retained runtime source manifest');
    const metadata = JSON.parse(files.get(sourcePath));
    const entry = metadata.platforms?.[asset.provenance.platform];
    if (metadata.schema !== 1 || metadata.runtimeDownload !== false || metadata.repository !== asset.source.url || metadata.commit !== asset.source.revision || metadata.version !== asset.source.version || !entry || typeof entry.binary !== 'string' || entry.binary !== posix.relative(posix.dirname(sourcePath), asset.path) || entry.sha256 !== asset.sha256 || entry.bytes !== asset.size) throw Error('Runtime source manifest disagrees with asset pin');
    // Modified source patches and referenced build information remain export inputs.
    for (const patch of entry.patches ?? []) {
      const path = posix.join(posix.dirname(sourcePath), patch.path);
      safePath(path);
      if (!sha(patch.sha256) || !files.has(path) || digest(files.get(path)) !== patch.sha256) throw Error('Missing or changed runtime source patch');
    }
    if (entry.buildInfo && !files.has(posix.join(posix.dirname(sourcePath), entry.buildInfo))) throw Error('Missing runtime build information');
    approved.set(asset.path, asset);
  }
  return approved;
}

export function readInventory(manifest, read, { refresh = false } = {}) {
  fields(manifest, ['schema', 'policy', 'files', 'thirdParty', 'firstParty', 'runtimeAssets'], 'manifest');
  if ((manifest.policy !== undefined && typeof manifest.policy !== 'string') || manifest.schema !== 1 || !manifest.files || typeof manifest.files !== 'object' || Array.isArray(manifest.files) || !Array.isArray(manifest.runtimeAssets ?? [])) throw Error('Invalid export manifest');
  const declared = new Set((manifest.runtimeAssets ?? []).map(a => a?.path));
  const files = new Map();
  for (const [path, expected] of Object.entries(manifest.files)) {
    safePath(path, declared.has(path));
    const bytes = read(path);
    if (bytes.length > 50 * 1024 * 1024) throw Error(`File exceeds source export size limit: ${path}`);
    if (path === manifestPath ? expected !== 'SELF' : !sha(expected) || (!refresh && digest(bytes) !== expected)) throw Error(`Export hash mismatch: ${path}`);
    files.set(path, bytes);
  }
  if (refresh) {
    for (const [path, bytes] of files) manifest.files[path] = path === manifestPath ? 'SELF' : digest(bytes);
  }
  const approved = validatePolicy(manifest, files);
  for (const [path, bytes] of files) scanBytes(path, bytes, approved);
  return files;
}
