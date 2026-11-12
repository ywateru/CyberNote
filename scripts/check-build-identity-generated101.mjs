// Product-input boundaries only. No Android generation/build, Cargo, or device use.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { productFiles, releaseStamp, sourceIdentity, validateStamp } from './build-info.mjs';

const expectBug = process.argv.includes('--expect-bug');
const output = resolve('artifacts/build-identity101');
await mkdir(output, { recursive: true });
const root = await mkdtemp(join(tmpdir(), 'cybernote-generated101-'));
const checks = [], observations = [];
const put = async (path, value = 'fixture source\n') => {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, value);
};
const generated = [
  'plugins/tauri-plugin-notes-scan/android/.tauri/tauri-api/src/main/java/app/tauri/Plugin.kt',
  'plugins/tauri-plugin-notes-media/android/.tauri/tauri-api/build.gradle.kts',
  'plugins/tauri-plugin-future/android/.tauri/tauri-api/consumer-rules.pro',
  'src-tauri/gen/android/.tauri/.gitignore',
  'src-tauri/gen/android/.tauri/new-dependency/path.json',
  'src-tauri/gen/android/app/src/main/java/com/local/notesclone/generated/TauriActivity.kt',
  'src-tauri/gen/android/app/src/main/java/com/local/notesclone/generated/proguard-wry.pro',
  'src-tauri/gen/android/app/proguard-tauri.pro',
];
const handwritten = [
  'plugins/tauri-plugin-notes-scan/android/src/main/java/com/plugin/notes_scan/NotesScanPlugin.kt',
  'plugins/tauri-plugin-notes-media/android/src/main/java/com/plugin/notes_media/NotesMediaPlugin.kt',
  'plugins/tauri-plugin-notes-media/android/src/main/AndroidManifest.xml',
  'plugins/tauri-plugin-notes-media/android/build.gradle.kts',
  'plugins/tauri-plugin-notes-media/src/lib.rs',
  'plugins/tauri-plugin-notes-media/build.rs',
  'plugins/tauri-plugin-notes-ui/macos/toolbar.m',
  'plugins/tauri-plugin-notes-ui/macos/example.c',
  'src-tauri/src/lib.rs',
  'src-tauri/gen/android/app/src/main/java/com/local/notesclone/MainActivity.kt',
  'src-tauri/gen/android/app/src/main/AndroidManifest.xml',
  'src-tauri/gen/android/app/build.gradle.kts',
  'src-tauri/gen/android/build.gradle.kts',
  // Nearby source paths must not be swept into a broad Android/generated ban.
  'plugins/tauri-plugin-notes-media/android/src/main/java/generated/Handwritten.kt',
  'plugins/tauri-plugin-notes-media/android/.tauri-custom/Handwritten.kt',
  'plugins/tauri-plugin-notes-media/android/tauri-api/src/main/java/Handwritten.kt',
  'src-tauri/gen/android/app/src/main/java/com/local/notesclone/generated-custom/Handwritten.kt',
  'src-tauri/gen/android/app/src/main/java/com/other/generated/Handwritten.kt',
  'src-tauri/gen/android/app/proguard-rules.pro',
  'src-tauri/gen/android/app/proguard-tauri.pro.source',
  'src-tauri/gen/android/.tauri-custom/settings.gradle',
  'src/handwritten.ts',
];
try {
  await put('package.json', JSON.stringify({ version: '0.1.0' }));
  await put('src-tauri/tauri.conf.json', JSON.stringify({ version: '0.1.0' }));
  await put('src-tauri/Cargo.toml', '[package]\nversion = "0.1.0"\n');
  await put('.gitignore', '/plugins/*/android/.tauri/\n/src-tauri/gen/android/.tauri/\n/src-tauri/gen/android/app/src/main/java/com/local/notesclone/generated/\n/src-tauri/gen/android/app/proguard-tauri.pro\n');
  for (const path of handwritten) await put(path);
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Build Identity Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture'], { cwd: root });
  const stamp = releaseStamp(root), initial = sourceIdentity(root);
  const unchanged = () => {
    const current = sourceIdentity(root);
    assert.equal(current.sourceFingerprint, initial.sourceFingerprint);
    assert.equal(current.inputCount, initial.inputCount);
    assert.equal(current.sourceRevision, initial.sourceRevision);
    validateStamp(stamp, root);
  };
  for (const path of generated) {
    await put(path, 'generated first run\n');
    const added = sourceIdentity(root), listed = productFiles(root).includes(path);
    observations.push({ path, ignoredByGit: execFileSync('git', ['check-ignore', path], { cwd: root, encoding: 'utf8' }).trim() === path, listed, fingerprintChanged: added.sourceFingerprint !== initial.sourceFingerprint });
    if (expectBug) {
      assert(listed, path + ' must reproduce inclusion');
      assert.notEqual(added.sourceFingerprint, initial.sourceFingerprint);
      assert.throws(() => validateStamp(stamp, root), /stale/);
    } else {
      assert(!listed, path + ' must be excluded');
      unchanged();
    }
    await put(path, 'generated next SDK version\n');
    if (!expectBug) unchanged();
    await rm(join(root, path));
    unchanged();
    checks.push(`${expectBug ? 'reproduced' : 'stable create/rewrite/delete'}: ${path}`);
  }
  if (!expectBug) {
    for (const path of generated) await put(path);
    unchanged();
    // Removing whole tool directories after a clean build must preserve stamp.
    for (const path of ['plugins/tauri-plugin-notes-scan/android/.tauri', 'plugins/tauri-plugin-notes-media/android/.tauri', 'plugins/tauri-plugin-future/android/.tauri', 'src-tauri/gen/android/.tauri', 'src-tauri/gen/android/app/src/main/java/com/local/notesclone/generated']) await rm(join(root, path), { recursive: true, force: true });
    await rm(join(root, 'src-tauri/gen/android/app/proguard-tauri.pro'));
    unchanged();
    checks.push('creating and removing all generated directories preserves the prepared stamp');
    for (const path of handwritten) {
      assert(productFiles(root).includes(path), 'authored input missing: ' + path);
      const bytes = await readFile(join(root, path));
      await put(path, 'changed handwritten product input\n');
      assert.notEqual(sourceIdentity(root).sourceFingerprint, initial.sourceFingerprint, path);
      assert.throws(() => validateStamp(stamp, root), /stale/, path);
      await put(path, bytes);
      unchanged();
      checks.push('handwritten mutation invalidates stamp: ' + path);
    }
  }
  await writeFile(join(output, expectBug ? 'before.json' : 'result.json'), JSON.stringify({ ok: true, mode: expectBug ? 'causal-before' : 'fixed', checks, observations, initial, scope: 'Temporary git fixture; actual productFiles/sourceIdentity/validateStamp. No native generation/build or device validation.' }, null, 2) + '\n');
  console.log(`Build identity generated101 ${expectBug ? 'causal-before' : 'fixed'}: ${checks.length} checks passed`);
} finally {
  await rm(root, { recursive: true, force: true });
}
