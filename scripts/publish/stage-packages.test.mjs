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
             'src-tauri/fonts/README.md': b'font', 'vendor/sdk/licenses/dependency.txt': b'public license'}
    for name, data in texts.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    files = {name: hashlib.sha256(data).hexdigest() for name, data in texts.items() if name not in ('LICENSE', 'THIRD_PARTY_NOTICES.md')}
    notice = 'vendor/sdk/licenses/dependency.txt'
    manifest = {'files': files, 'thirdParty': [{'licenses': [notice]}]}
    good = module.notice_payloads(root, manifest)
    assert good[notice] == b'public license'
    for bad in ['../LICENSE', str(root / 'LICENSE'), 'vendor/sdk/../LICENSE']:
        altered = {'files': {**files, bad: '0'*64}, 'thirdParty': [{'licenses': [bad]}]}
        try: module.notice_payloads(root, altered)
        except (RuntimeError, OSError): pass
        else: raise AssertionError('Unsafe notice path accepted')
    altered = {'files': {**files, notice: '0'*64}, 'thirdParty': [{'licenses': [notice]}]}
    try: module.notice_payloads(root, altered)
    except RuntimeError: pass
    else: raise AssertionError('Wrong notice hash accepted')
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
