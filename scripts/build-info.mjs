import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync, realpathSync, lstatSync } from 'node:fs';
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
  'src-tauri/gen/android/.kotlin',
  'src-tauri/gen/android/app/src/main/assets',
  'src-tauri/gen/android/app/src/main/jniLibs',
  'src-tauri/gen/android/app/src/main/java/com/local/notesclone/generated',
]);
// Android SDK copies live in this reserved directory for each plugin, including
// newly added plugins. Do not exclude other Android sources or arbitrary
// directories named `generated`: MainActivity and handwritten plugins are inputs.
const pluginAndroidOutput = /^plugins\/[^/]+\/android\/\.tauri$/;
const roots = ['src', 'public', 'plugins', 'src-tauri', 'crates', 'vendor', 'index.html', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'patches', 'tsconfig.json', 'vite.config.ts', 'scripts/android.mjs', 'scripts/bundle-mcp.mjs', 'scripts/build-info.mjs', 'scripts/versions.mjs', 'scripts/release.mjs', 'scripts/native', 'scripts/publish/stage-packages.py'];
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
    const top = checkoutGit(root, ['rev-parse', '--show-toplevel']);
    if (realpathSync(top) !== realpathSync(root)) throw Error('Build root is not the Git checkout root');
    const revision = checkoutGit(root, ['rev-parse', 'HEAD']);
    const dirty = !!checkoutGit(root, ['status', '--porcelain', '--untracked-files=normal']);
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
// The package core remains stable. A release identity must come from an exact,
// canonical Git tag, never a timestamp, source stamp, branch name or caller input.
export function releaseVersionFromTag(tag, core) {
  if (typeof tag !== 'string' || tag.length > 200 || !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(tag)) throw Error('Noncanonical release tag');
  const version = tag.slice(1), [base, ...pre] = version.split('-');
  // Numeric prerelease identifiers cannot have leading zeroes. Hyphens inside
  // an identifier are allowed by SemVer; '+' metadata is intentionally excluded
  // from the project's canonical publication tag grammar.
  const suffix = pre.join('-');
  if (suffix && suffix.split('.').some(part => /^\d+$/.test(part) && part.length > 1 && part[0] === '0')) throw Error('Noncanonical release tag');
  if (base !== core) throw Error('Release tag core differs from package version');
  return version;
}
function checkoutGit(root, args) {
  // A caller's GIT_DIR/INDEX_FILE/config injection must not redirect validation
  // away from the supplied checkout or hide worktree modifications.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  return execFileSync('git', args, { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 }).trim();
}
export function resolveReleaseVersion(root = projectRoot, { development = false, environment = process.env } = {}) {
  const core = assertVersions(root);
  if (development) return null;
  const type = environment.GITHUB_REF_TYPE, name = environment.GITHUB_REF_NAME;
  const ci = environment.GITHUB_ACTIONS === 'true' || type !== undefined || name !== undefined;
  if (ci && !['tag', 'branch'].includes(type)) throw Error('Incomplete or invalid GitHub release ref context');
  if (ci && !name) throw Error('Missing GitHub ref name');
  if (type === 'branch') return null; // CI branch/PR artifacts are not tagged releases.
  if (!existsSync(resolve(root, '.git'))) {
    if (type === 'tag') throw Error('Release tag requires its verified Git checkout');
    return null; // Archive metadata cannot assert an installed release tag.
  }
  const entry = lstatSync(resolve(root, '.git'));
  if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) throw Error('Release checkout root has an unsafe .git');
  const top = checkoutGit(root, ['rev-parse', '--show-toplevel']);
  if (realpathSync(top) !== realpathSync(root)) throw Error('Release root is not the Git checkout root');
  if (entry.isFile()) {
    // A linked worktree has a reciprocal Git-owned pointer. Merely copying
    // another checkout's .git file must not borrow its tags/index as our root.
    const gitDir = checkoutGit(root, ['rev-parse', '--absolute-git-dir']);
    const backlink = readFileSync(resolve(gitDir, 'gitdir'), 'utf8').trim();
    if (realpathSync(backlink) !== realpathSync(resolve(root, '.git'))) throw Error('Release root differs from registered Git worktree');
  }
  const head = checkoutGit(root, ['rev-parse', '--verify', 'HEAD^{commit}']);
  let tag;
  if (type === 'tag') {
    releaseVersionFromTag(name, core);
    if (environment.GITHUB_SHA !== undefined && environment.GITHUB_SHA !== head) throw Error('GitHub SHA differs from checkout HEAD');
    tag = name; // Explicit CI source disambiguates other tags on this commit.
  } else {
    const tags = checkoutGit(root, ['tag', '--points-at', 'HEAD']).split('\n').filter(t => t.startsWith('v'));
    for (const candidate of tags) releaseVersionFromTag(candidate, core);
    if (tags.length > 1) throw Error('Ambiguous exact release tags at HEAD; use an explicit GitHub tag ref');
    tag = tags[0];
  }
  if (!tag) return null;
  const tagged = checkoutGit(root, ['rev-parse', '--verify', `refs/tags/${tag}^{commit}`]);
  if (tagged !== head) throw Error('Release tag does not point at checkout HEAD');
  if (checkoutGit(root, ['status', '--porcelain', '--untracked-files=normal'])) throw Error('Release identity requires a clean checkout');
  return releaseVersionFromTag(tag, core);
}
export function validateBuildReleaseIdentity(info, root = projectRoot, options = {}) {
  const expected = resolveReleaseVersion(root, options);
  // Missing field is accepted only for legacy/untagged builds. It never grants
  // a known release identity to an old package on an otherwise tagged checkout.
  if ((info.releaseVersion ?? null) !== expected) throw Error('Embedded releaseVersion differs from verified checkout tag');
  if (info.version !== assertVersions(root) || (info.releaseVersion != null && (info.mode !== 'production' || info.sourceDirty !== false))) throw Error('Release identity requires matching clean production package metadata');
  return expected;
}
export function releaseStamp(root = projectRoot, now = new Date()) {
  return { schema: 1, version: assertVersions(root), ...sourceIdentity(root), preparedAt: now.toISOString() };
}
export function validateStamp(stamp, root = projectRoot) {
  const current = releaseStamp(root);
  if (stamp?.schema !== 1 || stamp.version !== current.version || stamp.sourceRevision !== current.sourceRevision || stamp.sourceFingerprint !== current.sourceFingerprint || stamp.sourceDirty !== current.sourceDirty || stamp.inputCount !== current.inputCount || !Number.isFinite(Date.parse(stamp.preparedAt))) throw Error('Release stamp is stale or invalid; prepare again from the current source');
  return stamp;
}
export function createBuildInfo({ root = projectRoot, development = false, environment = process.env, stampPath = process.env.CYBERNOTE_RELEASE_STAMP, now = new Date(), target = process.env.CYBERNOTE_BUILD_TARGET || process.env.TAURI_ENV_PLATFORM || 'web' } = {}) {
  const source = stampPath ? validateStamp(JSON.parse(readFileSync(resolve(root, stampPath), 'utf8')), root) : releaseStamp(root, now);
  const releaseVersion = resolveReleaseVersion(root, { development, environment });
  return { schema: 1, version: source.version, releaseVersion, mode: development ? 'development' : 'production', builtAt: development ? null : now.toISOString(), target, sourceRevision: source.sourceRevision, sourceFingerprint: source.sourceFingerprint, sourceDirty: source.sourceDirty, inputCount: source.inputCount, releasePreparedAt: stampPath ? source.preparedAt : null };
}
export function buildInfoPlugin(info) {
  return { name: 'cybernote-build-info', generateBundle() { this.emitFile({ type: 'asset', fileName: 'build-info.json', source: JSON.stringify(info, null, 2) + '\n' }); } };
}
// One resolver is used by Vite, Cargo and staging. No duplicated Rust/Python
// SemVer policy, no frontend-supplied current version, no public feed access.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === '--native-release-identity' && (args.length === 0 || (args.length === 1 && args[0] === '--development'))) {
    const development = args.length === 1;
    if (process.env.CARGO_PKG_VERSION !== assertVersions(projectRoot)) throw Error('Cargo package version differs from source package');
    let releaseVersion = null;
    if (!development) {
      const info = JSON.parse(readFileSync(resolve(projectRoot, 'dist/build-info.json'), 'utf8'));
      // Export exactly the identity just validated against the embedded frontend,
      // not an earlier tag lookup that could describe a different ref generation.
      releaseVersion = validateBuildReleaseIdentity(info);
      const actual = sourceIdentity(projectRoot);
      if (info.schema !== 1 || info.mode !== 'production' || !Number.isFinite(Date.parse(info.builtAt))) throw Error('Native release requires production frontend build-info');
      for (const key of ['sourceRevision', 'sourceFingerprint', 'sourceDirty', 'inputCount']) if (info[key] !== actual[key]) throw Error('Native and frontend build source identities differ');
    }
    // Empty is deliberate: override any ambient CYBERNOTE_RELEASE_VERSION.
    console.log(`cargo:rustc-env=CYBERNOTE_RELEASE_VERSION=${releaseVersion ?? ''}`);
    for (const file of productFiles()) console.log(`cargo:rerun-if-changed=${resolve(projectRoot, file)}`);
    console.log(`cargo:rerun-if-changed=${resolve(projectRoot, 'dist/build-info.json')}`);
    if (existsSync(resolve(projectRoot, '.git'))) {
      for (const args of [['rev-parse', '--absolute-git-dir'], ['rev-parse', '--git-common-dir']]) {
        const dir = resolve(projectRoot, checkoutGit(projectRoot, args));
        for (const file of ['HEAD', 'index', 'packed-refs', 'refs']) console.log(`cargo:rerun-if-changed=${resolve(dir, file)}`);
      }
    }
  } else if (mode === '--validate-release-build-info' && args.length === 1) {
    const info = JSON.parse(readFileSync(resolve(args[0]), 'utf8'));
    console.log(JSON.stringify({ releaseVersion: validateBuildReleaseIdentity(info) }));
  } else throw Error('Expected --native-release-identity [--development] or --validate-release-build-info <file>');
}
