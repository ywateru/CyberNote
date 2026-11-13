"""Remove only this task's clone after saving source and output receipts."""
import datetime
import hashlib
import json
import os
import pathlib
import shutil
import subprocess

archive = pathlib.Path(__file__).resolve().parent
root = pathlib.Path('/private/tmp/account109-source-66ad8c52-node-preflight01')
record = archive / 'receipt.json'
receipt = json.loads(record.read_text())
assert receipt['disposableClone'] == str(root)
assert receipt['status'] == 'passed-node-frontend-only' and receipt['safeToRemoveClone']
assert root.is_dir() and not root.is_symlink() and (root / '.git').is_dir()
env = receipt['environment']
git = lambda *args: subprocess.check_output(['git', *args], cwd=root, env=env, text=True).strip()
assert git('rev-parse', 'HEAD') == receipt['expectedRoot']
assert not git('remote') and not git('status', '--porcelain', '--untracked-files=all')
identity = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
    "import {sourceIdentity} from './scripts/build-info.mjs'; console.log(JSON.stringify(sourceIdentity(process.cwd(),{metadataPath:null})));"],
    cwd=root, env=env, text=True))
assert identity == receipt['sourceBefore'] == receipt['sourceAfter']
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
assert all(sha(root / name) == value for name, value in receipt['lockfilesBefore'].items())
info = json.loads((root / 'dist/build-info.json').read_text())
assert info == receipt['frontendBuildInfo']
for key, value in identity.items():
    assert info[key] == value
receipt['distFilesBeforeRemoval'] = [
    {'path': str(path.relative_to(root / 'dist')), 'bytes': path.stat().st_size, 'sha256': sha(path)}
    for path in sorted((root / 'dist').rglob('*')) if path.is_file()
]
receipt['preCleanupSourceIdentity'] = identity
receipt['preCleanupControllerSha256'] = sha(archive / 'controller.py')
receipt['cleanup'] = {'authorizedRoot': str(root), 'receiptSavedBeforeDeletion': True,
                      'sourceAndLocksUnchanged': True, 'removed': [], 'complete': False}
record.write_text(json.dumps(receipt, indent=2) + '\n')
for path in [root / 'node_modules', root / 'dist', root]:
    assert path.is_dir() and not path.is_symlink()
    shutil.rmtree(path)
    receipt['cleanup']['removed'].append(str(path))
    record.write_text(json.dumps(receipt, indent=2) + '\n')
assert not root.exists()
receipt['cleanup'].update(complete=True, cloneAbsent=True,
    completedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
receipt['remainingReceiptLogicalBytes'] = sum(path.stat().st_size for path in archive.iterdir() if path.is_file())
record.write_text(json.dumps(receipt, indent=2) + '\n')
print('cleanup complete; only owned clone/node_modules/dist removed; receipt preserved')
