// Direct production core harness only; never the Tauri app or a copied crate.
import assert from 'node:assert/strict';
import { readFile, realpath, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, basename, sep } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const target = resolve(process.env.CARGO_TARGET_DIR || '/tmp/apple-notes-sync85-target');
const suffix = []; let ancestor = target, canonical;
for (;;) {
  try { canonical = resolve(await realpath(ancestor), ...suffix); break; }
  catch (e) { if (e.code !== 'ENOENT' || dirname(ancestor) === ancestor) throw e; suffix.unshift(basename(ancestor)); ancestor = dirname(ancestor); }
}
assert.ok(![target, canonical].some(p => [resolve('target'), resolve('src-tauri/target')].some(root => p === root || p.startsWith(root + sep)) || /\/(?:src-tauri|Apple-Notes-Clone)\/target(?:\/|$)/.test(p)), 'Tauri/main target forbidden');
const replay = resolve('artifacts/evolve115/app-settings-replays.json');
const captured = JSON.parse(await readFile(replay, 'utf8'));
assert.equal(captured.length, 9);
assert.deepEqual(captured, JSON.parse(await readFile('src-tauri/tests/evolve115-presentation-replays.json', 'utf8')), 'Actual App capture must match the committed replay contract');
const out = resolve('artifacts/evolve115-store'); await mkdir(out, { recursive: true });
const files = [...new Set([...execFileSync('git', ['ls-files', 'src', 'src-tauri/src', 'src-tauri/tests', 'src-tauri/src/application/harness/Cargo.toml', 'src-tauri/src/application/harness/Cargo.lock'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean),
  'scripts/check-evolve115-store.mjs', 'scripts/check-evolve115-presentation.mjs',
  'src/presentation/model.ts', 'src/presentation/resolver.ts', 'src/presentation/context.ts', 'src/presentation/PreferencesPresentation.tsx',
  'src/shells/WorkspaceShell.tsx', 'src/shells/DesktopShell.tsx', 'src/shells/MobileShell.tsx', 'src/shells/shells.css',
  'src-tauri/tests/evolve115-presentation-replays.json', 'artifacts/evolve115/app-settings-replays.json'])].sort();
const hashes = () => Promise.all(files.map(async f => [f, createHash('sha256').update(await readFile(f)).digest('hex')])).then(Object.fromEntries);
const sources = await hashes();
const args = ['test', '--locked', '--offline', '--manifest-path', resolve('src-tauri/src/application/harness/Cargo.toml'), '--lib', 'evolve115_', '--', '--nocapture'];
const result = spawnSync('cargo', args, { env: { ...process.env, CARGO_TARGET_DIR: target, CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS || '2', EVOLVE115_SETTINGS_REPLAY: replay }, encoding: 'utf8', timeout: 600000, maxBuffer: 8 * 1024 ** 2 });
const log = (result.stdout || '') + (result.stderr || ''); await writeFile(resolve(out, 'tests.log'), log);
const expectedTests = ['evolve115_presentation_is_strict_atomic_and_roundtrips', 'evolve115_actual_app_patches_reopen_and_archive'];
const unchanged = JSON.stringify(sources) === JSON.stringify(await hashes());
const passed = result.status === 0 && unchanged && expectedTests.every(t => result.stdout?.includes(`test store::archive::tests::${t} ... ok`)) && /test result: ok\. 2 passed; 0 failed;/.test(result.stdout || '');
await writeFile(resolve(out, 'receipt.json'), JSON.stringify({ passed, exitCode: result.status, error: result.error?.message, signal: result.signal,
  command: ['cargo', ...args], target, replay, replayPaths: captured.length, sourcesUnchanged: unchanged, sources,
  source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), expectedTests, logSha256: createHash('sha256').update(log).digest('hex'),
  scope: 'Production Store/core direct compilation; actual App IPC patches replayed through SQLite/reopen/archive. Input hashes identify sources, not execution coverage. No native116 acceptance.' }, null, 2) + '\n');
console.log(log); assert.ok(passed, 'Production Store checks failed; see artifacts/evolve115-store/receipt.json');
