// Package-entry boundary tests only: no native code is built or executed.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { verifyMacEntry, verifyAndroidEntry } from './release.mjs';

const temporary = mkdtempSync(join(tmpdir(), 'cybernote-package-entry-'));
const checks = [];
const check = (name, run) => { run(); checks.push(name); };
try {
  const app = join(temporary, 'CyberNote.app'), macos = join(app, 'Contents/MacOS');
  mkdirSync(macos, { recursive: true });
  const actual = join(macos, 'notes-clone'), decoy = join(macos, 'unused-decoy');
  writeFileSync(actual, 'actual-main'); writeFileSync(decoy, 'newer-unused-decoy');
  const plist = executable => execFileSync('python3', ['-c', 'import json,plistlib,sys;plistlib.dump(json.loads(sys.argv[2]),open(sys.argv[1],"wb"))', join(app, 'Contents/Info.plist'), JSON.stringify({ CFBundleShortVersionString: '0.1.0', ...(executable === undefined ? {} : { CFBundleExecutable: executable }) })]);
  plist('notes-clone');
  check('Mac accepts the exact CFBundleExecutable', () => assert.deepEqual(verifyMacEntry(app, actual), { entry: 'Contents/MacOS/notes-clone', version: '0.1.0' }));
  check('Mac rejects an unused decoy inside Contents/MacOS', () => assert.throws(() => verifyMacEntry(app, decoy), /actual Mac CFBundleExecutable/));
  for (const [name, executable] of [['missing', undefined], ['empty', ''], ['dot', '.'], ['parent', '..'], ['path traversal', '../outside'], ['backslash path', 'nested\\main'], ['non-string', 7]]) {
    plist(executable);
    check(`Mac rejects ${name} executable metadata`, () => assert.throws(() => verifyMacEntry(app, actual), /safe single filename/));
  }
  plist('not-present');
  check('Mac rejects a missing actual executable', () => assert.throws(() => verifyMacEntry(app, actual), /ENOENT/));
  const outside = join(temporary, 'outside'); writeFileSync(outside, 'outside-main');
  rmSync(actual); symlinkSync(outside, actual); plist('notes-clone');
  check('Mac rejects an actual executable symlink escaping the bundle', () => assert.throws(() => verifyMacEntry(app, actual), /within Contents\/MacOS/));

  const apk = join(temporary, 'synthetic.zip');
  const main = join(temporary, 'libnotes_clone_lib.so'), helper = join(temporary, 'libhelper.so');
  writeFileSync(main, 'actual-main'); writeFileSync(helper, 'newer-unused-decoy');
  const abi = 'arm64-v8a';
  const archive = entries => execFileSync('python3', ['-c', 'import json,zipfile,sys;z=zipfile.ZipFile(sys.argv[1],"w");[z.writestr(n,b) for n,b in json.loads(sys.argv[2])];z.close()', apk, JSON.stringify(entries)]);
  const mainEntry = `lib/${abi}/libnotes_clone_lib.so`, helperEntry = `lib/${abi}/libhelper.so`;
  archive([[mainEntry, 'actual-main'], [helperEntry, 'newer-unused-decoy']]);
  check('Android resolves the real Cargo main library and actual APK ABI', () => assert.deepEqual(verifyAndroidEntry(apk, main), { entry: mainEntry, abi }));
  check('Android rejects selecting an auxiliary library by its basename', () => assert.throws(() => verifyAndroidEntry(apk, helper), /Cargo main library/));
  writeFileSync(main, 'newer-unused-decoy');
  check('Android rejects an auxiliary library renamed as the main library', () => assert.throws(() => verifyAndroidEntry(apk, main), /not the actual Cargo main library/));
  writeFileSync(main, 'actual-main');
  archive([[helperEntry, 'newer-unused-decoy']]);
  check('Android rejects an APK without its actual main library', () => assert.throws(() => verifyAndroidEntry(apk, main), /exactly one Cargo main library/));
  archive([[mainEntry, 'actual-main'], ['lib/x86_64/libnotes_clone_lib.so', 'another-ABI']]);
  check('Android rejects multiple APK ABIs', () => assert.throws(() => verifyAndroidEntry(apk, main), /single supported ABI/));
  archive([['lib/unknown/libnotes_clone_lib.so', 'actual-main']]);
  check('Android rejects an unknown ABI directory', () => assert.throws(() => verifyAndroidEntry(apk, main), /single supported ABI/));
  archive([[mainEntry, 'actual-main'], [`lib/${abi}/nested/libhelper.so`, 'nested']]);
  check('Android rejects malformed native library paths', () => assert.throws(() => verifyAndroidEntry(apk, main), /paths are invalid/));

  const output = resolve('artifacts/build-delivery97'); mkdirSync(output, { recursive: true });
  writeFileSync(join(output, 'package-entry-boundaries.json'), JSON.stringify({ ok: true, checks, scope: 'Synthetic plist/files and ZIP library selection. Not an installable APK, native build, embedded-resource acceptance, or device execution.' }, null, 2) + '\n');
  console.log(JSON.stringify({ ok: true, checks }, null, 2));
} finally { rmSync(temporary, { recursive: true, force: true }); }
