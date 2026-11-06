"""Narrow independent source/package-input and recorded single-peer audit.

Run from candidate root; never compiles, starts a peer, accesses ADB, or changes
the main worktree. Reads owned receipts/metadata and candidate source only.
"""
import hashlib
import json
import re
import subprocess
import time
from pathlib import Path

ROOT = Path.cwd()
OUT = Path(__file__).resolve().parent
AUTHOR = ROOT / 'docs/verification/sync87-native/final-dependency-alignment'
PRODUCT = '16ce577907b3aa2dcd04b834cb00b887cfd6d99a'
SHARED = 'b08c77289203691c30026ce673116721c5ca5a59'
SOURCE_FP = '6b143fb87d3cbf6b5ca8b44e912c2a21a0e857d817a8569ff05bea09178105f9'
checks = []
started = time.monotonic()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def load(path):
    return json.loads(path.read_text())


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)


def check(name, condition):
    assert condition, name
    checks.append(name)


def objects(commit, paths):
    result = subprocess.run(['git', 'cat-file', '--batch'], cwd=ROOT,
                            input=''.join(commit + ':' + p + '\n' for p in paths).encode(),
                            capture_output=True, check=True).stdout
    offset = 0
    blobs = {}
    for path in paths:
        end = result.index(b'\n', offset)
        _, kind, size = result[offset:end].split()
        assert kind == b'blob'
        start = end + 1
        offset = start + int(size)
        blobs[path] = result[start:offset]
        assert result[offset:offset+1] == b'\n'
        offset += 1
    assert offset == len(result)
    return blobs


process = load(AUTHOR / 'processes.json')
shared = {p: v for p, v in process['sourceBefore'].items() if p in [
    'scripts/debug/runtime.mjs', 'scripts/debug/rust-backend.mjs', 'scripts/debug/sync-rust-dom.mjs']}
shared_objects = objects(SHARED, list(shared))
check('three shared bytes and SHA exactly match b08c7728 git objects', len(shared) == 3
      and all((ROOT / p).read_bytes() == shared_objects[p] and sha(shared_objects[p]) == digest for p, digest in shared.items()))
peer_path = 'scripts/debug/sync87-native/desktop-peer.mjs'
old = git('show', PRODUCT + '^:' + peer_path).decode()
new = git('show', PRODUCT + ':' + peer_path).decode()


def normalized(code):
    code = re.sub(r'^export const DOM_DEPENDENCIES=.*$', 'DEPENDENCY_CONSTANT', code, flags=re.M)
    return re.sub(r'sourceCommit:"[a-f0-9]{40}"', 'sourceCommit:"SOURCE_LABEL"', code)


check('16ce5779 only changes exact dependency constants source label and README',
      normalized(old) == normalized(new)
      and git('diff-tree', '--no-commit-id', '--name-only', '-r', PRODUCT).decode().splitlines()
      == ['scripts/debug/sync87-native/README.md', peer_path]
      and (ROOT / peer_path).read_text() == new)
check('verify dependency byte assertions receipt and natural-exit checks remain enforced',
      'assert.equal(hash(await readFile(join(root,name))),digest,"Frozen DOM dependency changed")' in new
      and 'await verifyDOMDependencies(self.frontendRoot)' in new
      and 'await verifyDOMDependencies(this.frontendRoot)' in new
      and 'assert(!failed&&exit?.code===0&&!exit.signal&&binaryUnchanged&&report.frontendUnchanged&&this.runtime.errors.length===0' in new)
before = load(AUTHOR / 'package-input-before.json')
after = load(AUTHOR / 'package-input-after.json')
check('author before and after package maps identical', before == after)
package_rows = {}
package_heads = {}
for label in ['native-build', 'android-build']:
    actual_manifest = load(ROOT / 'docs/verification/sync87' / label / 'result.json')
    rows = actual_manifest['inputBefore']
    package_heads[label] = actual_manifest['head']
    check(label + ' 321 inputBefore inputAfter author rows all equal',
          len(rows) == 321 and len({r['path'] for r in rows}) == 321
          and rows == actual_manifest['inputAfter'] == before[label]['inputBefore']
          == before[label]['actual'] and before[label]['all321Equal'] is True
          and before[label]['packageHead'] == actual_manifest['head']
          and before[label]['packageStatus'] == actual_manifest['status'] == 'pass')
    package_rows[label] = rows
check('Mac27 Android17 selected 321 product inputs identical', package_rows['native-build'] == package_rows['android-build'])
rows = package_rows['native-build']
paths = [r['path'] for r in rows]
candidate_objects = objects(PRODUCT, paths)
package_objects = {label: objects(head, paths) for label, head in package_heads.items()}
for row in rows:
    data = (ROOT / row['path']).read_bytes()
    assert len(data) == row['bytes'] and sha(data) == row['sha256'], row['path']
    assert data == candidate_objects[row['path']], row['path']
    assert all(data == blobs[row['path']] for blobs in package_objects.values()), row['path']
check('all 321 current bytes match exact candidate and both package-source commit objects', True)

check('author tool before after maps and all current exact source objects match',
      process['sourceBefore'] == process['sourceAfter'] and process['sourceUnchanged'] is True
      and all(sha((ROOT / p).read_bytes()) == digest == sha(git('show', PRODUCT + ':' + p)) for p, digest in process['sourceBefore'].items()))
receipt = load(AUTHOR / 'peer-receipt.json')
check('author receipt equals corrected root immutable11 receipt', receipt == load(Path('/private/tmp/sync87-peer-final11/receipt.json'))
      and receipt['authorizedBy'] == 'root-sync87-peer-review'
      and receipt['binary'] == '/private/tmp/sync86-transport-build11/notes-current-attachment-transport'
      and receipt['sha256'] == '333fcd44e19ebbd30ece11b7a595816249a9458a46fb03523855ae8c51215800'
      and receipt['sourceCommit'] == 'cd334bc88513a89c490788d2e2e27c7967575f4a' and receipt['buildLabel'] == 'build11')
apk_receipt = load(Path('/private/tmp/sync87-apk-final17/receipt.json'))
check('Android receipt is root-reviewed Android17 exact package source metadata',
      apk_receipt['authorizedBy'] == 'root-sync87-package-review' and apk_receipt['buildLabel'] == 'Android17'
      and apk_receipt['sourceCommit'] == package_heads['android-build'])
result = load(AUTHOR / 'result.json')
lifecycle = load(AUTHOR / 'desktop-peer-lifecycle.json')
command = next(c for c in process['commands'] if c['name'] == 'desktop-dom-smoke')
check('recorded single-peer ten checks exit0 complete outer 9.546s no stderr',
      result['status'] == 'PASS' and len(result['checks']) == 10
      and command['exitCode'] == 0 and command['wallSeconds'] == 9.546326625
      and (AUTHOR / 'desktop-dom-smoke.stderr.txt').stat().st_size == 0
      and json.loads((AUTHOR / 'desktop-dom-smoke.stdout.txt').read_text())['passed'] == 10
      and result['lifecycle'] == lifecycle)
check('153-source inner outer fingerprints unchanged clean exact value',
      all(r['sha256'] == SOURCE_FP and r['fileCount'] == 153 and r['gitDirty'] is False
          for r in [result['sourceBefore'], result['sourceAfter'], lifecycle['frontendBefore'], lifecycle['frontendAfter']])
      and result['sourceUnchanged'] is True and lifecycle['frontendUnchanged'] is True)
check('recorded real Rust 29268 natural0 no failure and immutable11 identity',
      lifecycle['pid'] == 29268 and lifecycle['exit'] == {'code': 0, 'signal': None}
      and lifecycle['forcedOrFailed'] is False and lifecycle['pageErrorCount'] == 0 and lifecycle['events'] == 5
      and lifecycle['binaryUnchanged'] is True and lifecycle['binarySha256'] == receipt['sha256']
      and lifecycle['sourceCommit'] == receipt['sourceCommit'] and lifecycle['buildLabel'] == 'build11')
closures = lifecycle['resourceClosures']
check('recorded browser 29270 natural0 stdio destroyed plus context server cleanup terminal',
      len(closures) == 5 and all(c['terminal'] is True for c in closures)
      and next(c for c in closures if c['event'] == 'browser-process-exit')
      == {'event': 'browser-process-exit', 'terminal': True, 'pid': 29270, 'code': 0, 'signal': None, 'stdioDestroyed': True}
      and next(c for c in closures if c['event'] == 'browser-server-close')['code'] == 0
      and next(c for c in closures if c['event'] == 'cleanup')['wallMs'] > 0)

args = ['node', str(OUT / 'dependencies.mjs')]
begin_node = time.monotonic()
run = subprocess.run(args, cwd=ROOT, capture_output=True)
(OUT / 'dependencies.stdout.txt').write_bytes(run.stdout)
(OUT / 'dependencies.stderr.txt').write_bytes(run.stderr)
node_process = {'args': args, 'exitCode': run.returncode, 'wallMs': round((time.monotonic() - begin_node) * 1000)}
(OUT / 'dependencies.execution.json').write_text(json.dumps(node_process, indent=2) + '\n')
check('independent six dependency positive negative checks naturally exit0 no peer spawn', run.returncode == 0)
node_result = load(OUT / 'dependencies.json')
check('independent 153 source fingerprint and direct root-reviewed immutable11 admission',
      node_result['passed'] == 6 and node_result['sourceBefore'] == node_result['sourceAfter']
      and node_result['sourceBefore']['sha256'] == SOURCE_FP and node_result['noPeerSpawn'] is True
      and node_result['ownedSnapshotRemoved'] is True)
output = {'status': 'PASS-NARROW-FINAL-DEPENDENCY-REVIEW', 'candidate': PRODUCT, 'sharedCommit': SHARED,
          'checks': checks, 'passedAuditChecks': len(checks), 'passedDependencyChecks': node_result['passed'],
          'wallMs': round((time.monotonic() - started) * 1000), 'dependenciesProcess': node_process,
          'sharedHashes': shared, 'packageHeads': package_heads, 'packageRows': rows,
          'limits': ['Author single-peer smoke is audited evidence, not independently rerun.',
                     'No DOM matrix, network or native device acceptance repeated.',
                     'No main writes, compilation, ADB, APK install/launch, user Store or microphone.']}
(OUT / 'audit.json').write_text(json.dumps(output, indent=2) + '\n')
print(json.dumps({'status': output['status'], 'auditChecks': len(checks), 'dependencyChecks': node_result['passed'], 'wallMs': output['wallMs']}))
