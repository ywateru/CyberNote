import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('package sidecar retains declared notices with ordinary dependency filenames', () => {
  execFileSync('python3', ['-c', `
import importlib.util, sys
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('staging', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
dependency = 'vendor/sdk/licenses/ordinary-dependency.txt'
provider = 'vendor/sdk/provider-assets/dependency-attribution.txt'
rights = 'scripts/publish/LICENSE.project-reserved.txt'
manifest = {'files': {dependency: 'hash', provider: 'hash', rights: 'hash'},
            'thirdParty': [{'licenses': [dependency]}],
            'runtimeAssets': [{'licenses': [provider]}],
            'firstParty': [{'rightsSource': rights}]}
assert {dependency, provider, rights}.issubset(module.notice_paths(manifest))
del manifest['files'][dependency]
try:
    module.notice_paths(manifest)
except RuntimeError:
    pass
else:
    raise AssertionError('Missing declared notice was silently skipped')
`, fileURLToPath(new URL('./stage-packages.py', import.meta.url))], { stdio: 'pipe' });
});

test('notice archive inputs reject traversal, absolute paths, wrong hashes and parent symlinks before reading or copying', () => {
  execFileSync('python3', ['-c', `
import importlib.util, sys, tempfile, hashlib
from pathlib import Path
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('staging', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp) / 'source'
    root.mkdir()
    texts = {'LICENSE': b'reserved', 'THIRD_PARTY_NOTICES.md': b'notices',
             'scripts/publish/LICENSE.project-reserved.txt': b'reserved',
             'scripts/publish/THIRD_PARTY_NOTICES.md': b'notices',
             'src-tauri/fonts/README.md': b'font', 'vendor/sdk/licenses/dependency.txt': b'public license',
             'vendor/sdk/licenses/dependency/.github/workflows/license.yml': b'name: upstream license provenance'}
    for name, data in texts.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    files = {name: hashlib.sha256(data).hexdigest() for name, data in texts.items() if name not in ('LICENSE', 'THIRD_PARTY_NOTICES.md')}
    notice = 'vendor/sdk/licenses/dependency.txt'
    manifest = {'files': files, 'thirdParty': [{'licenses': [notice]}]}
    good = module.notice_payloads(root, manifest)
    assert good[notice] == b'public license'
    provenance = 'vendor/sdk/licenses/dependency/.github/workflows/license.yml'
    assert good[provenance] == texts[provenance]
    for bad in ['../LICENSE', str(root / 'LICENSE'), 'vendor/sdk/../LICENSE',
                'vendor/sdk/.git/config', 'vendor/sdk/.env',
                'vendor/sdk/.github/../LICENSE', 'vendor/sdk/.github/.env']:
        altered = {'files': {**files, bad: '0'*64}, 'thirdParty': [{'licenses': [bad]}]}
        try: module.notice_payloads(root, altered)
        except (RuntimeError, OSError): pass
        else: raise AssertionError('Unsafe notice path accepted')
    altered = {'files': {**files, notice: '0'*64}, 'thirdParty': [{'licenses': [notice]}]}
    try: module.notice_payloads(root, altered)
    except RuntimeError: pass
    else: raise AssertionError('Wrong notice hash accepted')
    github = root / 'vendor/sdk/licenses/dependency/.github'
    moved_github = root / 'outside-github'
    github.rename(moved_github)
    github.symlink_to(moved_github, target_is_directory=True)
    try: module.notice_payloads(root, manifest)
    except (RuntimeError, OSError): pass
    else: raise AssertionError('Named .github exception followed a symlink')
    github.unlink()
    moved_github.rename(github)
    # Keep exact bytes and declared hash: only the parent-directory symlink changes.
    folder = root / 'vendor/sdk/licenses'
    moved = root / 'outside-licenses'
    folder.rename(moved)
    folder.symlink_to(moved, target_is_directory=True)
    try: module.notice_payloads(root, manifest)
    except (RuntimeError, OSError): pass
    else: raise AssertionError('Symlinked notice parent accepted')
`, fileURLToPath(new URL('./stage-packages.py', import.meta.url))], { stdio: 'pipe' });
});

test('Android ABI checks actual ELF headers for every library rather than ZIP directory labels', () => {
  execFileSync('python3', ['-c', `
import importlib.util, sys, io, struct, zipfile, warnings
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('staging', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
def elf(machine=183, kind=3):
    header = bytearray(64)
    header[:7] = b'\\x7fELF\\x02\\x01\\x01'
    struct.pack_into('<HHI', header, 16, kind, machine, 1)
    struct.pack_into('<H', header, 52, 64)
    return bytes(header)
entry = 'lib/arm64-v8a/libnotes_clone_lib.so'
provider = 'lib/arm64-v8a/libcloudflared.so'
def check(entries, accepted):
    data = io.BytesIO()
    with warnings.catch_warnings():
        warnings.simplefilter('ignore', UserWarning)
        with zipfile.ZipFile(data, 'w') as out:
            for name, value in entries: out.writestr(name, value)
    with zipfile.ZipFile(data) as archive:
        try: module.android_native_bytes(archive)
        except RuntimeError:
            assert not accepted, 'Valid arm64 library headers rejected'
        else: assert accepted, 'Mislabelled or ambiguous APK libraries accepted'
check([(entry, elf())], True)
check([(entry, elf()), ('lib/arm64-v8a/libother.so', elf())], True)
check([(entry, elf()), (provider, elf(kind=2))], False) # retired helper must never ship
check([(entry, elf(62))], False) # x86_64 hidden in an arm64 directory
check([(entry, elf()), (provider, elf(40))], False) # secondary ARM32 provider
check([(entry, elf()), (provider, b'not an ELF executable')], False)
check([(entry, elf()[:30])], False)
check([(entry, elf()), (entry, elf())], False)
check([(entry, elf()), ('lib/x86_64/extra.so', elf(62))], False)
check([(entry, elf()), ('lib/arm64-v8a/nested/extra.so', elf())], False)
check([(provider, elf())], False)
`, fileURLToPath(new URL('./stage-packages.py', import.meta.url))], { stdio: 'pipe' });
});

test('unsigned Android staging rejects verifier errors and both JAR and APK block signing material', () => {
  execFileSync('python3', ['-c', `
import importlib.util, sys, tempfile, zipfile, struct, subprocess
from pathlib import Path
from unittest.mock import patch
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('staging', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
unsigned = subprocess.CompletedProcess([], 1, '', 'DOES NOT VERIFY\\nERROR: Missing META-INF/MANIFEST.MF\\n')
with tempfile.TemporaryDirectory() as tmp:
    package = Path(tmp) / 'fixture.apk'
    def make(extra=None):
        with zipfile.ZipFile(package, 'w') as out:
            out.writestr('AndroidManifest.xml', b'fixture')
            if extra: out.writestr(extra, b'invalid signing material')
    def check(result, accepted):
        with patch.object(module.subprocess, 'run', return_value=result):
            try: module.require_unsigned_apk(package, Path(tmp))
            except RuntimeError:
                assert not accepted, 'Unsigned diagnostic rejected'
            else: assert accepted, 'Unverified signing status accepted as unsigned'
    make()
    check(unsigned, True)
    for result in [subprocess.CompletedProcess([], 0, '', ''),
                   subprocess.CompletedProcess([], 2, '', 'usage error'),
                   subprocess.CompletedProcess([], 1, '', 'DOES NOT VERIFY\\nERROR: invalid signature'),
                   subprocess.CompletedProcess([], -9, '', ''),
                   subprocess.CompletedProcess([], 1, 'unexpected', unsigned.stderr)]:
        check(result, False)
    for marker in ['META-INF/MANIFEST.MF', 'META-INF/CERT.RSA', 'meta-inf/cert.sf', 'META-INF/CERT.EC']:
        make(marker)
        check(unsigned, False)
    make()
    data = bytearray(package.read_bytes())
    eocd = data.rfind(b'PK\\x05\\x06')
    central = struct.unpack_from('<I', data, eocd + 16)[0]
    block = struct.pack('<QQ', 24, 24) + b'APK Sig Block 42'
    data[central:central] = block
    struct.pack_into('<I', data, eocd + len(block) + 16, central + len(block))
    package.write_bytes(data)
    check(unsigned, False) # invalid v2/v3 signatures must not become unsigned
    make()
    for error in [FileNotFoundError(), subprocess.TimeoutExpired('apksigner', 60)]:
        with patch.object(module.subprocess, 'run', side_effect=error):
            try: module.require_unsigned_apk(package, Path(tmp))
            except (OSError, subprocess.TimeoutExpired): pass
            else: raise AssertionError('Missing or hung verifier accepted')
`, fileURLToPath(new URL('./stage-packages.py', import.meta.url))], { stdio: 'pipe' });
});

test('Android release staging requires a decodable production manifest and rejects debug/test-only builds', () => {
  execFileSync('python3', ['-c', `
import importlib.util, sys, tempfile, zipfile, subprocess
from pathlib import Path
from unittest.mock import patch
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('staging', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
tree = '''  E: manifest (line=2)
    A: package="com.local.notesclone" (Raw: "com.local.notesclone")
    A: http://schemas.android.com/apk/res/android:versionName(0x0101021c)="0.1.0" (Raw: "0.1.0")
    A: http://schemas.android.com/apk/res/android:versionCode(0x0101021b)=1000
      E: application (line=6)
        A: http://schemas.android.com/apk/res/android:debuggable(0x0101000f)=false
        A: http://schemas.android.com/apk/res/android:testOnly(0x01010272)=false
        E: activity (line=8)
          A: http://schemas.android.com/apk/res/android:name(0x01010003)=".MainActivity"
'''
with tempfile.TemporaryDirectory() as tmp:
    package = Path(tmp) / 'fixture.apk'
    def make(manifest=True):
        with zipfile.ZipFile(package, 'w') as out:
            out.writestr('AndroidManifest.xml' if manifest else 'other', b'fixture')
    def check(text, accepted, version='0.1.0'):
        result = subprocess.CompletedProcess([], 0, text, '')
        with patch.object(module.subprocess, 'run', return_value=result):
            try: module.require_android_release_manifest(package, Path(tmp), 'com.local.notesclone', version)
            except RuntimeError:
                assert not accepted, 'Production manifest rejected'
            else: assert accepted, 'Non-production or undecodable manifest accepted'
    make()
    check(tree, True)
    check('\\n'.join(line for line in tree.splitlines() if ':debuggable(' not in line and ':testOnly(' not in line), True)
    check(tree.replace(':debuggable(0x0101000f)=false', ':debuggable(0x0101000f)=true'), False)
    check(tree.replace(':testOnly(0x01010272)=false', ':testOnly(0x01010272)=true'), False)
    check(tree.replace(':debuggable(0x0101000f)=false', ':debuggablX(0x0101000f)=true'), False)
    check(tree.replace(':testOnly(0x01010272)=false', ':testOnlX(0x01010272)=true'), False)
    check(tree.replace(':debuggable(0x0101000f)', ':debuggable(0x0101000e)'), False)
    check(tree.replace('http://schemas.android.com/apk/res/android:debuggable', 'http://example.invalid:debuggable'), False)
    check(tree.replace(':versionName(0x0101021c)', ':versionNamX(0x0101021c)'), False)
    check(tree.replace(':versionCode(0x0101021b)', ':versionCode(0x0101021a)'), False)
    check(tree.replace('      E: application (line=6)', '    A: http://schemas.android.com/apk/res/android:versionCode(0x0101021b)=1000\\n      E: application (line=6)'), False)
    check(tree.replace('com.local.notesclone', 'com.local.notesclone.account109'), False)
    check(tree.replace('0.1.0', '0.2.0'), False)
    check(tree.replace('=1000', '=2000'), False)
    check(tree.replace('=1000', '=0x000003e8'), True)
    for counter in (1, 1000, 9999):
        version = f'0.2.{counter}'
        numbered = tree.replace('0.1.0', version).replace('=1000', f'={20000+counter}')
        check(numbered, True, version)
        check(numbered.replace(f'={20000+counter}', '=1000'), False, version)
    check(tree.replace('=false', '=@0x7f100000'), False)
    check(tree + '      E: application (line=10)\\n', False)
    check('', False)
    make(False)
    check(tree, False)
    make()
    with patch.object(module.subprocess, 'run', side_effect=subprocess.CalledProcessError(1, 'aapt2')):
        try: module.require_android_release_manifest(package, Path(tmp), 'com.local.notesclone', '0.1.0')
        except subprocess.CalledProcessError: pass
        else: raise AssertionError('aapt2 failure accepted')
`, fileURLToPath(new URL('./stage-packages.py', import.meta.url))], { stdio: 'pipe' });
});

test('CyberBus sidecar includes exact retained LGPL/GPL texts even without LICENSE in filename',()=>{
  execFileSync('python3',['-c',`
import importlib.util,sys
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('staging',sys.argv[1])
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
paths=['scripts/publish/notices/cyberbus/LGPL-3.0.txt','scripts/publish/notices/cyberbus/GPL-3.0.txt']
manifest={'files':dict.fromkeys(paths,'a'*64)}
assert set(paths).issubset(m.notice_paths(manifest))
`,fileURLToPath(new URL('./stage-packages.py',import.meta.url))],{stdio:'pipe'});
});
