// Real release CLI and exported verifier against generated metadata/JS fixtures.
// No frontend/native build, installed package, browser, device, or publication.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createBuildInfo, projectRoot, releaseStamp } from './build-info.mjs';
import { verifyFrontend } from './release.mjs';

const expectBug = process.argv.includes('--expect-bug');
assert(process.argv.slice(2).every(arg => arg === '--expect-bug'), 'Unknown argument');
const temporary = mkdtempSync(join(tmpdir(), 'cybernote-release116-'));
const checks = [];
const put = (path, value) => writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value));
const runtimeFor = info => `globalThis.fixtureBuildIdentity = ${JSON.stringify(info)};\n`;
const check = (name, run) => { run(); checks.push(name); };

// Invoke the checkout's actual CLI, without copying/replacing either verifier.
const frontend = join(temporary, 'cli-frontend');
mkdirSync(frontend);
const stampPath = join(temporary, 'source-stamp.json');
put(stampPath, releaseStamp());
const cliInfo = createBuildInfo({ stampPath });
put(join(frontend, 'build-info.json'), cliInfo);
put(join(frontend, 'runtime.js'), runtimeFor(cliInfo));
const cli = () => spawnSync(process.execPath, [resolve(projectRoot, 'scripts/release.mjs'),
  'verify-frontend', '--frontend', frontend, '--stamp', stampPath], {
  cwd: projectRoot, encoding: 'utf8', timeout: 30_000,
});
const result = cli();
put(join(temporary, 'cli.stdout'), result.stdout);
put(join(temporary, 'cli.stderr'), result.stderr);
if (expectBug) {
  check('unmodified real CLI rejects a valid current production fixture', () => {
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Release stamp is stale or invalid/);
  });
} else {
  check('real CLI accepts current production fixture with its release stamp', () => {
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), cliInfo);
  });
  // This must reach the runtime witness check, after all stamp checks pass.
  put(join(frontend, 'runtime.js'), 'globalThis.unrelated = true;');
  check('real CLI still rejects missing JavaScript identity', () => {
    const missing = cli();
    assert.ifError(missing.error);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /Build identity is absent from production JavaScript/);
  });
  put(join(frontend, 'runtime.js'), runtimeFor(cliInfo));

  const root = join(temporary, 'checkout'), dist = join(root, 'dist');
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'src-tauri'));
  mkdirSync(join(root, 'artifacts'));
  mkdirSync(dist);
  put(join(root, '.gitignore'), '/dist/\n/artifacts/\n');
  put(join(root, 'package.json'), { version: '0.1.0' });
  put(join(root, 'src-tauri/tauri.conf.json'), { version: '0.1.0' });
  put(join(root, 'src-tauri/Cargo.toml'), '[package]\nversion = "0.1.0"\n');
  put(join(root, 'src/main.ts'), 'export const value = 1;');
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  const commit = (...args) => git('-c', 'user.name=Release Fixture', '-c',
    'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', ...args);
  git('init', '-q'); git('add', '.'); commit('-qm', 'fixture');
  const infoPath = join(dist, 'build-info.json'), jsPath = join(dist, 'runtime.js');
  for (const dirty of [false, true]) {
    if (dirty) put(join(root, 'src/main.ts'), 'export const value = 2;');
    const stamp = releaseStamp(root), path = join(root, 'artifacts/stamp.json');
    assert.equal(stamp.sourceDirty, dirty);
    put(path, stamp);
    const info = createBuildInfo({ root, stampPath: path });
    const verify = (metadata = info, suppliedStamp = stamp, runtime = runtimeFor(metadata)) => {
      put(infoPath, metadata); put(jsPath, runtime);
      return verifyFrontend(dist, suppliedStamp, root);
    };
    for (const suppliedStamp of [undefined, stamp]) {
      check(`${dirty ? 'dirty' : 'clean'} fixture accepts valid metadata ${suppliedStamp ? 'with' : 'without'} stamp`,
        () => {
          put(infoPath, info); put(jsPath, runtimeFor(info));
          assert.deepEqual(verifyFrontend(dist, suppliedStamp, root), info);
        });
    }
    const invalid = [
      ['missing dirty', { sourceDirty: undefined }],
      ['opposite dirty', { sourceDirty: !dirty }],
      ['string dirty', { sourceDirty: String(dirty) }],
      ['null dirty', { sourceDirty: null }],
      ['missing count', { inputCount: undefined }],
      ['wrong count', { inputCount: info.inputCount + 1 }],
      ['string count', { inputCount: String(info.inputCount) }],
      ['null count', { inputCount: null }],
      ['stale revision', { sourceRevision: '0'.repeat(40) }],
      ['stale fingerprint', { sourceFingerprint: '0'.repeat(64) }],
      ['wrong version', { version: '0.2.0' }],
    ];
    for (const [name, patch] of invalid) {
      check(`${dirty ? 'dirty' : 'clean'} fixture rejects ${name} even with matching runtime`,
        () => assert.throws(() => verify({ ...info, ...patch }), /Release stamp is stale or invalid/));
    }
    for (const [name, patch] of [
      ['schema', { schema: 2 }], ['nonproduction mode', { mode: 'development' }],
      ['missing timestamp', { builtAt: undefined }], ['invalid timestamp', { builtAt: 'invalid' }],
    ]) check(`rejects ${name} (${dirty ? 'dirty' : 'clean'})`,
      () => assert.throws(() => verify({ ...info, ...patch })));
    check(`rejects different valid stamp preparation time (${dirty ? 'dirty' : 'clean'})`,
      () => assert.throws(() => verify(info, { ...stamp, preparedAt: '2026-01-01T00:00:00.000Z' }),
        /Frontend was not built with this release stamp/));
    for (const key of ['sourceDirty', 'inputCount', 'sourceRevision', 'sourceFingerprint']) {
      const changed = { ...stamp, [key]: key === 'sourceDirty' ? !dirty : key === 'inputCount' ? stamp[key] + 1 : 'stale' };
      check(`rejects mismatched supplied stamp ${key} (${dirty ? 'dirty' : 'clean'})`,
        () => assert.throws(() => verify(info, changed), /Release stamp is stale or invalid/));
    }
    for (const key of ['sourceRevision', 'sourceFingerprint', 'builtAt']) {
      check(`runtime must include ${key} (${dirty ? 'dirty' : 'clean'})`,
        () => assert.throws(() => verify(info, stamp, runtimeFor({ ...info, [key]: 'absent' })),
          /Build identity is absent from production JavaScript/));
    }
    put(join(root, 'src/main.ts'), `export const value = ${dirty ? 3 : 2};`);
    check(`actual source byte drift rejects prior frontend (${dirty ? 'dirty' : 'clean'})`,
      () => assert.throws(() => verify(), /Release stamp is stale or invalid/));
    put(join(root, 'src/main.ts'), `export const value = ${dirty ? 2 : 1};`);
  }
}
const report = { ok: true, expectBug, checks, scope: 'Generated frontend metadata/JavaScript fixtures through the actual release CLI and verifier; no build, installed native package, browser execution, or publication.' };
put(join(temporary, 'result.json'), report);
console.log(JSON.stringify({ ...report, evidence: temporary }, null, 2));
