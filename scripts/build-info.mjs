import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync, realpathSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const excluded = new Set(['target', 'node_modules', '.git', '.gradle', 'build', 'dist', 'artifacts', '.DS_Store', 'local.properties', 'tauri.properties']);
// Tauri writes these dependency/path bridges during Android compilation. They
// are outputs; the package locks and actual plugin/native sources are inputs.
const generatedFiles = new Set(['src-tauri/gen/android/tauri.settings.gradle', 'src-tauri/gen/android/app/tauri.build.gradle.kts', 'src-tauri/gen/android/app/proguard-tauri.pro']);
const generatedDirectories = new Set([
  'src-tauri/gen/schemas',
  'src-tauri/gen/android/.tauri',
  'src-tauri/gen/android/app/src/main/assets',
  'src-tauri/gen/android/app/src/main/jniLibs',
  'src-tauri/gen/android/app/src/main/java/com/local/notesclone/generated',
]);
// Android SDK copies live in this reserved directory for each plugin, including
// newly added plugins. Do not exclude other Android sources or arbitrary
// directories named `generated`: MainActivity and handwritten plugins are inputs.
const pluginAndroidOutput = /^plugins\/[^/]+\/android\/\.tauri$/;
const roots = ['src', 'public', 'plugins', 'src-tauri', 'crates', 'vendor', 'index.html', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'patches', 'tsconfig.json', 'vite.config.ts', 'scripts/android.mjs', 'scripts/build-info.mjs', 'scripts/versions.mjs', 'scripts/release.mjs', 'scripts/native'];
export function productFiles(root = projectRoot) {
  const files = [];
  const walk = (path) => {
    const name = relative(root, path).split('\\').join('/');
    if (generatedFiles.has(name) || generatedDirectories.has(name) || pluginAndroidOutput.test(name)) return;
    if (excluded.has(name.split('/').at(-1)) || /\.(log|tsbuildinfo)$/.test(name)) return;
    const stat = statSync(path, { throwIfNoEntry: false });
    if (!stat) return;
    if (stat.isDirectory()) for (const child of readdirSync(path).sort()) walk(join(path, child));
    else if (stat.isFile()) files.push(name);
  };
  for (const entry of roots) walk(resolve(root, entry));
  return files.sort();
}
export function sourceIdentity(root = projectRoot, { metadataPath = process.env.CYBERNOTE_DEPLOY_METADATA } = {}) {
  const hash = createHash('sha256'), files = productFiles(root);
  for (const file of files) {
    const bytes = readFileSync(resolve(root, file));
    hash.update(file + '\0' + bytes.length + '\0'); hash.update(bytes);
  }
  const fingerprint = hash.digest('hex');
  let metadata;
  if (metadataPath) {
    metadata = JSON.parse(readFileSync(resolve(root, metadataPath), 'utf8'));
    if (metadata.schema !== 1 || metadata.provenance !== 'trusted-checkout' ||
        !/^[a-f0-9]{40,64}$/.test(metadata.sourceRevision ?? '') ||
        metadata.sourceFingerprint !== fingerprint || metadata.inputCount !== files.length ||
        typeof metadata.sourceDirty !== 'boolean') throw Error('Deployment metadata does not match actual product bytes');
  }
  // Do not accidentally identify an archive using an enclosing, unrelated Git repo.
  if (existsSync(resolve(root, '.git'))) {
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' }).trim();
    if (realpathSync(top) !== realpathSync(root)) throw Error('Build root is not the Git checkout root');
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    const dirty = !!execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: root, encoding: 'utf8' }).trim();
    if (metadata && (metadata.sourceRevision !== revision || metadata.sourceDirty !== dirty)) throw Error('Deployment metadata disagrees with checkout');
    return { sourceRevision: revision, sourceFingerprint: fingerprint, sourceDirty: dirty, inputCount: files.length };
  }
  if (!metadata) throw Error('No .git: provide CYBERNOTE_DEPLOY_METADATA from the trusted source checkout');
  // Revision provenance belongs to the explicit metadata producer. The fingerprint
  // and count above are ALWAYS recomputed locally, never copied as claimed bytes.
  return { sourceRevision: metadata.sourceRevision, sourceFingerprint: fingerprint, sourceDirty: metadata.sourceDirty, inputCount: files.length };
}
export function packageVersion(root = projectRoot) {
  const version = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw Error('CyberNote version must be a stable major.minor.patch value');
  return version;
}
export function assertVersions(root = projectRoot) {
  const version = packageVersion(root);
  const tauri = JSON.parse(readFileSync(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8')).version;
  const cargo = /^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m.exec(readFileSync(resolve(root, 'src-tauri/Cargo.toml'), 'utf8'))?.[1];
  const lockPath = resolve(root, 'src-tauri/Cargo.lock');
  const lock = statSync(lockPath, { throwIfNoEntry: false })
    ? /\[\[package\]\]\nname = "notes-clone"\nversion = "([^"]+)"/.exec(readFileSync(lockPath, 'utf8'))?.[1]
    : version;
  if (tauri !== version || cargo !== version || lock !== version) throw Error(`Native version differs from package.json (${version}); run pnpm version:sync`);
  return version;
}
export function releaseStamp(root = projectRoot, now = new Date()) {
  return { schema: 1, version: assertVersions(root), ...sourceIdentity(root), preparedAt: now.toISOString() };
}
export function validateStamp(stamp, root = projectRoot) {
  const current = releaseStamp(root);
  if (stamp?.schema !== 1 || stamp.version !== current.version || stamp.sourceRevision !== current.sourceRevision || stamp.sourceFingerprint !== current.sourceFingerprint || !Number.isFinite(Date.parse(stamp.preparedAt))) throw Error('Release stamp is stale or invalid; prepare again from the current source');
  return stamp;
}
export function createBuildInfo({ root = projectRoot, development = false, stampPath = process.env.CYBERNOTE_RELEASE_STAMP, now = new Date(), target = process.env.CYBERNOTE_BUILD_TARGET || process.env.TAURI_ENV_PLATFORM || 'web' } = {}) {
  const source = stampPath ? validateStamp(JSON.parse(readFileSync(resolve(root, stampPath), 'utf8')), root) : releaseStamp(root, now);
  return { schema: 1, version: source.version, mode: development ? 'development' : 'production', builtAt: development ? null : now.toISOString(), target, sourceRevision: source.sourceRevision, sourceFingerprint: source.sourceFingerprint, sourceDirty: source.sourceDirty, inputCount: source.inputCount, releasePreparedAt: stampPath ? source.preparedAt : null };
}
export function buildInfoPlugin(info) {
  return { name: 'cybernote-build-info', generateBundle() { this.emitFile({ type: 'asset', fileName: 'build-info.json', source: JSON.stringify(info, null, 2) + '\n' }); } };
}
