import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, chmodSync, realpathSync } from 'node:fs';
import { resolve, dirname, isAbsolute, posix, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformPackage } from './package-transform.mjs';

export const manifestName = 'scripts/publish/manifest.json';
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (root, args) => execFileSync('git', args, { cwd: root, maxBuffer: 128 * 1024 * 1024 });
export function safePath(name) {
  if (typeof name !== 'string' || !name || name !== posix.normalize(name) || name.startsWith('/') || /[\\\x00-\x20\x7f]/.test(name) || name.split('/').some(p => p === '..' || p.startsWith('.') && !['.github', '.gitignore', '.editorconfig'].includes(p))) throw Error('Unsafe export path');
  if (/^(?:docs|references|output|labs|artifacts|dist|target|node_modules)\//.test(name) ||
      /(?:^|\/)(?:target|build|node_modules|evidence|verification|local\.properties|tauri\.properties|key\.properties|keystore\.properties)(?:\/|$)/.test(name) ||
      /\.(?:log|jsonl|sqlite\w*|db|key|pem|p12|pfx|jks|keystore|apk|aab|dmg|zip|mp4|wav|webm|tsbuildinfo)$/.test(name) ||
      /(?:tauri\.settings\.gradle|tauri\.build\.gradle\.kts|proguard-tauri\.pro)$/.test(name) ||
      /\/jniLibs\/|\/app\/src\/main\/assets\//.test(name)) throw Error(`Excluded export path: ${name}`);
  if (name.endsWith('.notesbackup') && !/^src-tauri\/tests\/fixtures\/archive\/[a-z-]+\.notesbackup$/.test(name)) throw Error('Only reviewed synthetic archive fixtures may be exported');
  return name;
}
export function scanBytes(name, bytes) {
  if (bytes.length > 50 * 1024 * 1024) throw Error(`File exceeds source export size limit: ${name}`);
  if (bytes.includes(0)) {
    if (!/\.(?:png|icns|ico)$/.test(name) && name !== 'src-tauri/fonts/NotoSansCJKsc-Regular.otf' && name !== 'src-tauri/gen/android/gradle/wrapper/gradle-wrapper.jar') throw Error(`Unreviewed binary: ${name}`);
    return;
  }
  const text = bytes.toString();
  // Never echo values, snippets or hashes of a matched credential.
  if (/-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{30,255}|github_pat_[A-Za-z0-9_]{40,255})|\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{32,255}|xox[baprs]-[A-Za-z0-9-]{20,255}|AIza[A-Za-z0-9_-]{30,255})|\b(?:AKIA|ASIA)[A-Z0-9]{16}|\beyJ[A-Za-z0-9_-]{15,2000}\.[A-Za-z0-9_-]{15,2000}\.[A-Za-z0-9_-]{15,2000}|notes-sync-v1:[A-Za-z0-9_-]{32,2000}/.test(text)) throw Error(`Credential pattern in export input: ${name}`);
  for (const m of text.matchAll(/(?:https?|rediss?):\/\/[^\s/'"]{1,200}:[^\s/'"]{1,200}@[^\s'"<>]+/g)) {
    let synthetic = false;
    try {
      const url = new URL(m[0]);
      synthetic = /(?:^|\.)(?:test|invalid|example)$/.test(url.hostname) &&
        ['u', 'user', 'test', 'fixture'].includes(url.username) &&
        ['p', 'pass', 'pass' + 'word', 'test', 'fixture'].includes(url['pass' + 'word']) &&
        /(?:^|\/)test\//.test(name);
    } catch { /* Malformed credential-shaped inputs fail closed too. */ }
    if (!synthetic) throw Error(`Credential URL in export input: ${name}`);
  }
  if (/\/Users\/[A-Za-z0-9_.-]+\/|\/home\/[A-Za-z0-9_.-]+\//.test(text)) throw Error(`Local user path in export input: ${name}`);
}
export function trackedTree(root, ref) {
  const commit = git(root, ['rev-parse', '--verify', `${ref}^{commit}`]).toString().trim();
  const entries = new Map(git(root, ['ls-tree', '-rz', commit]).toString().split('\0').filter(Boolean).map(row => {
    const [meta, name] = row.split('\t'), [mode, type, oid] = meta.split(' '); return [name, { mode, type, oid }];
  }));
  return { commit, entries, read: name => {
    const entry = entries.get(name);
    if (!entry || entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode)) throw Error(`Not a regular tracked file: ${name}`);
    return git(root, ['cat-file', 'blob', entry.oid]);
  } };
}
function closure(files) {
  const has = name => files.has(name) || [...files.keys()].some(p => p.startsWith(name + '/'));
  for (const [name, bytes] of files) {
    if (name.endsWith('.rs')) {
      for (const m of bytes.toString().matchAll(/include_(?:str|bytes)!\s*\(\s*"([^"\n]+)"/g)) {
        if (!files.has(posix.normalize(posix.join(posix.dirname(name), m[1])))) throw Error(`Missing Rust fixture dependency: ${name}`);
      }
    }
    if (name.endsWith('Cargo.toml')) {
      for (const m of bytes.toString().matchAll(/\bpath\s*=\s*"([^"\n]+)"/g)) {
        if (!has(posix.normalize(posix.join(posix.dirname(name), m[1])))) throw Error(`Missing Cargo path dependency: ${name}`);
      }
    }
    if (/\.(?:[cm]?js|tsx?)$/.test(name)) {
      for (const m of bytes.toString().matchAll(/(?:from\s*|import\s*\(\s*|import\s*)['"](\.[^'"\n]+)['"]/g)) {
        const path = posix.normalize(posix.join(posix.dirname(name), m[1]));
        if (![path, path.replace(/\.js$/, '.ts'), ...['.ts', '.tsx', '.mjs', '.js', '/index.ts', '/index.tsx', '/index.js'].map(s => path + s)].some(has)) throw Error(`Missing JS module dependency: ${name}`);
      }
    }
  }
  const pkg = JSON.parse(files.get('package.json'));
  for (const [key, command] of Object.entries(pkg.scripts)) {
    for (const match of command.matchAll(/\b(?:node|tsx)\s+(?:--test\s+)?(scripts\/[^\s]+)/g)) {
      const path = match[1];
      if (path.includes('*') ? ![...files.keys()].some(f => f.startsWith(path.split('*')[0]) && f.endsWith('.test.mjs')) : !files.has(path)) throw Error(`Missing public package script: ${key}`);
    }
  }
}
export function planExport(root, ref = 'HEAD') {
  const tree = trackedTree(root, ref), manifest = JSON.parse(tree.read(manifestName));
  if (manifest.schema !== 1 || !manifest.files || !Array.isArray(manifest.thirdParty)) throw Error('Invalid export manifest');
  const files = new Map(), modes = new Map();
  for (const [name, expected] of Object.entries(manifest.files)) {
    safePath(name); const bytes = tree.read(name);
    if (name === manifestName ? expected !== 'SELF' : !/^[a-f0-9]{64}$/.test(expected) || digest(bytes) !== expected) throw Error(`Export hash mismatch: ${name}`);
    scanBytes(name, bytes); files.set(name, bytes); modes.set(name, tree.entries.get(name).mode);
  }
  for (const item of manifest.thirdParty) {
    safePath(item.root);
    const origin = new URL(item.origin);
    if (origin.protocol !== 'https:' || origin.username || origin['pass' + 'word'] || !/^[a-f0-9]{40,64}$/.test(item.revision) || !item.licenses?.length || item.licenses.some(f => !files.has(f))) throw Error('Incomplete third-party provenance/license closure');
  }
  for (const name of files.keys()) if (/^(?:crates|vendor)\//.test(name) && !manifest.thirdParty.some(p => name.startsWith(p.root + '/'))) throw Error(`SDK/vendor requires explicit provenance and license: ${name}`);
  for (const required of ['src-tauri/fonts/OFL.txt', 'src-tauri/fonts/NotoSansCJKsc-Regular.otf', 'services/coordinator/LICENSE', 'pnpm-workspace.yaml', 'patches/prosemirror-view@1.42.9.patch']) if (!files.has(required)) throw Error(`Required license/build input missing: ${required}`);
  const transformed = transformPackage(files.get('package.json'));
  files.set('package.json', transformed.bytes);
  for (const [target, source] of Object.entries({ 'README.md': 'scripts/publish/README.public.md', '.gitignore': 'scripts/publish/gitignore.public', 'LICENSE': 'scripts/publish/LICENSE.project-reserved.txt', 'THIRD_PARTY_NOTICES.md': 'scripts/publish/THIRD_PARTY_NOTICES.md' })) {
    if (!files.has(source) || files.has(target)) throw Error('Invalid public template transform');
    files.set(target, files.get(source)); modes.set(target, '100644');
  }
  closure(files);
  // The exported repo is a reusable clean source root, with transformed package
  // bytes. SELF is the sole nonrecursive control-file hash exemption.
  const exportedManifest = structuredClone(manifest);
  exportedManifest.files['package.json'] = digest(transformed.bytes);
  files.set(manifestName, Buffer.from(JSON.stringify(exportedManifest, null, 2) + '\n'));
  return { tree, manifest, files, modes, removedScripts: transformed.removed };
}
export function exportSnapshot({ root, ref = 'HEAD', target, expectedTarget, apply = false, initialize = false }) {
  const plan = planExport(root, ref);
  if (target) {
    if (!isAbsolute(target) || target !== resolve(target)) throw Error('Target must be an exact absolute path');
    if (existsSync(target)) throw Error('Target must not exist; existing directories are never reused/deleted');
    const parent = realpathSync(dirname(target)), source = realpathSync(root), canonical = resolve(parent, posix.basename(target));
    if (canonical !== target || canonical === source || canonical.startsWith(source + sep)) throw Error('Target must be outside source and have no symlinked parents');
  }
  if (apply) {
    if (!target || expectedTarget !== target) throw Error('--apply requires --target and identical --expected-target');
    mkdirSync(target, { mode: 0o700 });
    for (const [name, bytes] of plan.files) {
      const path = resolve(target, name); mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, bytes, { flag: 'wx', mode: 0o644 }); if (plan.modes.get(name) === '100755') chmodSync(path, 0o755);
    }
    if (initialize) {
      git(target, ['init', '-q', '--template=', '--initial-branch=main']);
      git(target, ['-c', 'core.hooksPath=/dev/null', 'add', '-f', '--', ...plan.files.keys()]);
      execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Initial source import'], {
        cwd: target, env: { ...process.env, GIT_AUTHOR_NAME: 'CyberNote Source Export', GIT_AUTHOR_EMAIL: 'source-export@example.invalid', GIT_COMMITTER_NAME: 'CyberNote Source Export', GIT_COMMITTER_EMAIL: 'source-export@example.invalid' },
      });
      if (git(target, ['rev-list', '--count', 'HEAD']).toString().trim() !== '1' || git(target, ['remote']).length) throw Error('Export history isolation failed');
      if (git(target, ['ls-files', '-z']).toString().split('\0').filter(Boolean).length !== plan.files.size) throw Error('Export commit is missing files');
    }
  } else if (initialize) throw Error('--init requires --apply');
  return { dryRun: !apply, sourceCommit: plan.tree.commit, fileCount: plan.files.size, bytes: [...plan.files.values()].reduce((n, b) => n + b.length, 0), removedPackageScripts: plan.removedScripts, initializedNewHistory: apply && initialize };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opts = { root: resolve(fileURLToPath(new URL('../..', import.meta.url))) };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--apply') opts.apply = true;
    else if (key === '--init') opts.initialize = true;
    else if (['--ref', '--target', '--expected-target'].includes(key) && args[i + 1] && !args[i + 1].startsWith('--')) opts[{ '--ref': 'ref', '--target': 'target', '--expected-target': 'expectedTarget' }[key]] = args[++i];
    else throw Error('Unknown/missing export option');
  }
  try { console.log(JSON.stringify(exportSnapshot(opts), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
