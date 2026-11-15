import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { packageVersion, projectRoot, assertVersions } from './build-info.mjs';
const root = projectRoot, version = packageVersion(root);
if (process.argv.includes('--check')) { assertVersions(root); console.log(`CyberNote ${version}: frontend/Tauri/Cargo agree; Android derives package.json`); }
else {
  const tauriPath = resolve(root, 'src-tauri/tauri.conf.json');
  const tauri = JSON.parse(readFileSync(tauriPath, 'utf8')); tauri.version = version;
  writeFileSync(tauriPath, JSON.stringify(tauri, null, 2) + '\n');
  const cargoPath = resolve(root, 'src-tauri/Cargo.toml');
  writeFileSync(cargoPath, readFileSync(cargoPath, 'utf8').replace(/(\[package\][\s\S]*?^version\s*=\s*)"[^"]+"/m, `$1"${version}"`));
  const lock = resolve(root, 'src-tauri/Cargo.lock');
  writeFileSync(lock, readFileSync(lock, 'utf8').replace(/(\[\[package\]\]\nname = "notes-clone"\nversion = )"[^"]+"/, `$1"${version}"`));
  assertVersions(root); console.log(`Native version synchronized to package.json ${version}`);
}
