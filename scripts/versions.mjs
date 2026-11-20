import { spawnSync } from 'node:child_process';
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, rmdirSync, statSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageVersion, projectRoot, assertVersions } from './build-info.mjs';

export function nextVersion(version) {
  if (version === '0.1.0') return '0.2.1';
  const match = /^0\.2\.([1-9]\d{0,3})$/.exec(version);
  if (!match || Number(match[1]) === 9999) throw Error(`Cannot advance the 0.2 build counter from ${version}`);
  return `0.2.${Number(match[1]) + 1}`;
}

function replace(path, data) {
  const temp = `${path}.${randomUUID()}.version-temp`;
  try {
    const file = openSync(temp, 'wx', statSync(path).mode & 0o777);
    try { writeFileSync(file, data); fsyncSync(file); } finally { closeSync(file); }
    renameSync(temp, path);
  } finally { rmSync(temp, {force:true}); }
}

function synchronize(root, version, advance = false) {
  const tauriPath = resolve(root, 'src-tauri/tauri.conf.json');
  const tauri = JSON.parse(readFileSync(tauriPath, 'utf8')); tauri.version = version;
  const cargoPath = resolve(root, 'src-tauri/Cargo.toml');
  const lock = resolve(root, 'src-tauri/Cargo.lock');
  const packagePath = resolve(root, 'package.json');
  const edits = [
    [tauriPath, JSON.stringify(tauri, null, 2) + '\n'],
    [cargoPath, readFileSync(cargoPath, 'utf8').replace(/(\[package\][\s\S]*?^version\s*=\s*)"[^"]+"/m, `$1"${version}"`)],
    [lock, readFileSync(lock, 'utf8').replace(/(\[\[package\]\]\nname = "notes-clone"\nversion = )"[^"]+"/, `$1"${version}"`)],
  ];
  if (advance) {
    const pkg = JSON.parse(readFileSync(packagePath, 'utf8')); pkg.version = version;
    edits.push([packagePath, JSON.stringify(pkg, null, 2) + '\n']);
  }
  const original = edits.map(([path]) => [path, readFileSync(path)]);
  try {
    for (const [path, value] of edits) if (readFileSync(path, 'utf8') !== value) replace(path, value);
    assertVersions(root);
  } catch (error) {
    for (const [path, value] of original) if (!readFileSync(path).equals(value)) replace(path, value);
    throw error;
  }
}

function run() {
  const root = projectRoot;
  const [mode, command, ...args] = process.argv.slice(2);
  if (mode === '--check') {
    assertVersions(root);
    console.log(`CyberNote ${packageVersion(root)}: frontend/Tauri/Cargo agree; Android derives package.json`);
    return;
  }
  if (mode !== undefined && mode !== '--next' && mode !== '--build') throw Error(`Unknown version operation: ${mode}`);
  if (mode === '--build' && !command) throw Error('--build requires a command');
  const artifacts = resolve(root, 'artifacts');
  mkdirSync(artifacts, {recursive:true});
  const lock = resolve(artifacts, '.version-build.lock');
  mkdirSync(lock);
  try {
    const current = packageVersion(root);
    const advancing = mode === '--next' || mode === '--build';
    if (advancing) {
      assertVersions(root);
      if (mode === '--next' && (process.env.CYBERNOTE_RELEASE_STAMP || process.env.GITHUB_ACTIONS === 'true')) throw Error('Allocate release versions in the source checkout before CI or preparing a release stamp');
    }
    // CI and prepared releases share an assigned number. Ordinary builds get
    // a new number even when the source HEAD still carries the previous tag.
    const fixed = mode === '--build' && (process.env.CYBERNOTE_RELEASE_STAMP || process.env.GITHUB_ACTIONS === 'true');
    const version = advancing && !fixed ? nextVersion(current) : current;
    if (!fixed) synchronize(root, version, advancing);
    console.log(`CyberNote ${version}: ${version === current ? 'version synchronized' : 'new build number allocated'}`);
    if (mode === '--build') {
      const env = {...process.env};
      if (!fixed) env.CYBERNOTE_UNTAGGED_BUILD = '1';
      const result = spawnSync(command, args, {stdio:'inherit', env});
      if (result.error) throw result.error;
      process.exitCode = result.status ?? 1;
    }
  } finally { rmdirSync(lock); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
