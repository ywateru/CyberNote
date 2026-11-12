// Independent package-entry regression probe. No native code is built or run.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { brotliCompressSync } from 'node:zlib';
import { releaseStamp, createBuildInfo } from '../../../scripts/build-info.mjs';
import { verifyPackage } from '../../../scripts/release.mjs';

const temporary = mkdtempSync(join(tmpdir(), 'delivery97-entry-probe-'));
const checks = [];
try {
  const stamp = releaseStamp();
  const info = { ...createBuildInfo(), releasePreparedAt: stamp.preparedAt };
  const frontend = join(temporary, 'frontend'), assets = join(temporary, 'cache');
  const app = join(temporary, 'CyberNote.app'), macos = join(app, 'Contents/MacOS');
  for (const path of [frontend, assets, macos]) mkdirSync(path, { recursive: true });
  const metadata = Buffer.from(JSON.stringify(info));
  const runtime = Buffer.from('const currentBuild=' + JSON.stringify(info));
  writeFileSync(join(frontend, 'build-info.json'), metadata);
  writeFileSync(join(frontend, 'index.js'), runtime);
  const metadataBr = brotliCompressSync(metadata), runtimeBr = brotliCompressSync(runtime);
  writeFileSync(join(assets, 'current.json'), metadataBr);
  writeFileSync(join(assets, 'current.js'), runtimeBr);
  const currentBytes = Buffer.concat([metadataBr, runtimeBr]);
  writeFileSync(join(app, 'Contents/Info.plist'), '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleShortVersionString</key><string>' + info.version + '</string><key>CFBundleExecutable</key><string>notes-clone</string></dict></plist>');
  const actual = join(macos, 'notes-clone'), decoy = join(macos, 'unused-decoy');
  writeFileSync(actual, currentBytes);
  verifyPackage({ platform: 'macos', artifact: app, binary: actual, assets, frontend, stamp });
  checks.push({ name: 'actual bundle executable carrying current resources is accepted', ok: true });
  writeFileSync(actual, 'STALE ACTUAL EXECUTABLE, NO CURRENT RESOURCES');
  writeFileSync(decoy, currentBytes);
  let rejected = false;
  try { verifyPackage({ platform: 'macos', artifact: app, binary: decoy, assets, frontend, stamp }); }
  catch { rejected = true; }
  checks.push({ name: 'unused package binary cannot stand in for CFBundleExecutable', ok: rejected });
  const out = resolve('artifacts/delivery97-review'); mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'package-entry.json'), JSON.stringify({ ok: checks.every(check => check.ok), checks, scope: 'Synthetic executable bytes; does not prove native package execution.' }, null, 2) + '\n');
  console.log(JSON.stringify(checks, null, 2));
  assert.ok(rejected, 'Package verification accepted an unused decoy while CFBundleExecutable was stale');
} finally { rmSync(temporary, { recursive: true, force: true }); }
