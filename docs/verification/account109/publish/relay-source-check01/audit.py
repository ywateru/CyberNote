#!/usr/bin/env python3
"""Read-only source/sealed-root audit; only this evidence directory is written."""
import datetime, hashlib, json, os, stat, subprocess, sys, time
from pathlib import Path

ROOT = Path('/Users/water/work/2026/Apple-Notes-Clone')
OUT = Path(__file__).resolve().parent
REF = 'ec4147b6'
EXPECTED = 'ec4147b6fdd7656a794f126d5860ca60eec891b6'
PIN = 'c45f8ce2cce31da0643ff5c7835ad8ac30ab3c5853c58c11a2957a2b64d196c2'
TEST_SOURCE = 'vendor/cybergrid-sdk/src/tests.rs'
MANIFEST = 'scripts/publish/manifest.json'

def sha(data): return hashlib.sha256(data).hexdigest()
def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def git(*args): return subprocess.check_output(['git', *args], cwd=ROOT, stderr=subprocess.PIPE)
def save(name, value): (OUT / name).write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')
def load(name): return json.loads((OUT / name).read_text())

def snapshot(root):
    entries = []
    def visit(path):
        st = path.lstat()
        row = [str(path.relative_to(root)), stat.S_IFMT(st.st_mode), stat.S_IMODE(st.st_mode), st.st_size, st.st_mtime_ns, st.st_ctime_ns]
        if stat.S_ISREG(st.st_mode):
            h = hashlib.sha256()
            with path.open('rb') as f:
                for block in iter(lambda: f.read(1024 * 1024), b''): h.update(block)
            row.append(h.hexdigest())
        elif stat.S_ISLNK(st.st_mode): row.append(sha(os.readlink(path).encode()))
        elif stat.S_ISDIR(st.st_mode):
            for child in sorted(path.iterdir()): visit(child)
        else: raise RuntimeError('Unexpected sealed entry type')
        entries.append(row)
    visit(root)
    entries.sort()
    return {'path': str(root), 'entryCount': len(entries), 'regularFiles': sum(row[1] == stat.S_IFREG for row in entries), 'treeSha256': sha(json.dumps(entries, separators=(',', ':')).encode())}

def sealed():
    return [snapshot(p) for p in sorted(Path('/private/tmp').iterdir()) if p.name.startswith('account109-source-') and p.is_dir()]

def protected():
    paths = list((ROOT / 'scripts/publish').glob('*')) + [ROOT / 'scripts/build-info.mjs']
    paths += [ROOT / p for p in git('diff', '--name-only').decode().splitlines()]
    paths += [ROOT / p for p in git('diff', '--name-only', REF, 'HEAD').decode().splitlines()]
    paths += list((ROOT / 'docs/verification/account109/native/relay-live01').rglob('*'))
    return {str(p.relative_to(ROOT)): sha(p.read_bytes()) for p in sorted(set(paths)) if p.is_file()}

def run(label, args, limit):
    started = now(); tick = time.monotonic()
    with (OUT / (label + '.stdout.log')).open('wb') as stdout, (OUT / (label + '.stderr.log')).open('wb') as stderr:
        try:
            completed = subprocess.run(args, cwd=ROOT, stdout=stdout, stderr=stderr, timeout=limit)
            code, timeout = completed.returncode, False
        except subprocess.TimeoutExpired:
            code, timeout = None, True
    record = {'argv': args, 'cwd': str(ROOT), 'startedAt': started, 'finishedAt': now(), 'elapsedSeconds': time.monotonic() - tick, 'exitCode': code, 'timedOut': timeout}
    save(label + '.json', record)
    print(json.dumps(record))
    if code != 0 or timeout: sys.exit(1)

stage = sys.argv[1]
if stage == 'preflight':
    assert git('rev-parse', REF).decode().strip() == EXPECTED
    observed_head = git('rev-parse', 'HEAD').decode().strip()
    assert all(p.startswith('docs/') for p in git('diff', '--name-only', REF, 'HEAD').decode().splitlines())
    before = git('show', REF + '^:' + MANIFEST)
    after = git('show', REF + ':' + MANIFEST)
    old, new = json.loads(before), json.loads(after)
    changes = [{'path': k, 'before': old['files'].get(k), 'after': new['files'].get(k)} for k in sorted(set(old['files']) | set(new['files'])) if old['files'].get(k) != new['files'].get(k)]
    assert len(changes) == 1 and changes[0]['path'] == TEST_SOURCE and changes[0]['after'] == PIN
    expected = json.loads(before); expected['files'][TEST_SOURCE] = PIN
    assert expected == new
    assert git('diff-tree', '--no-commit-id', '--name-only', '-r', REF).decode().splitlines() == [MANIFEST]
    source = git('show', REF + ':' + TEST_SOURCE)
    assert sha(source) == PIN
    assert source == git('show', 'f84bb9e1:' + TEST_SOURCE)
    assert source == git('show', 'd3a5f10e:' + TEST_SOURCE)
    tools = sorted((ROOT / 'scripts/publish').glob('*.mjs'))
    tools += [ROOT / 'scripts/publish/stage-packages.py', ROOT / 'scripts/build-info.mjs']
    for p in tools: assert p.read_bytes() == git('show', REF + ':' + str(p.relative_to(ROOT)))
    (OUT / 'manifest.diff').write_bytes(git('diff', REF + '^', REF, '--', MANIFEST))
    save('source-review.json', {'sourceCommit': EXPECTED, 'reviewedCherryPick': git('rev-parse', 'f84bb9e1').decode().strip(), 'authorCommit': git('rev-parse', 'd3a5f10e').decode().strip(), 'manifestSha256': sha(after), 'sourceSha256': sha(source), 'manifestOnlyChange': changes, 'otherManifestFieldsIdentical': True, 'sourceMatchesReviewedAndAuthorCommits': True, 'workingToolsMatchCommittedRef': True, 'tools': {str(p.relative_to(ROOT)): sha(p.read_bytes()) for p in tools}, 'nodeVersion': subprocess.check_output(['node', '--version']).decode().strip()})
    save('precondition.json', {'at': now(), 'head': observed_head, 'targetRef': EXPECTED, 'worktreeStatus': git('status', '--porcelain').decode().splitlines(), 'sealed': sealed(), 'protectedFileHashes': protected()})
    print('Preflight passed; exact source/hash confirmed; sealed roots snapshotted.')
elif stage == 'tests':
    run('publish-tests', ['node', '--test', *[str(p.relative_to(ROOT)) for p in sorted((ROOT / 'scripts/publish').glob('*.test.mjs'))]], 120)
elif stage == 'export':
    run('export', ['node', 'scripts/publish/export.mjs', '--ref', REF], 180)
elif stage == 'postflight':
    prior = load('precondition.json'); current_sealed = sealed(); current_protected = protected()
    unchanged = prior['sealed'] == current_sealed
    changes = [k for k, v in prior['protectedFileHashes'].items() if current_protected.get(k) != v]
    test_text = (OUT / 'publish-tests.stdout.log').read_text()
    counts = {}
    for line in test_text.splitlines():
        parts = line.split()
        if len(parts) == 3 and parts[0] == '#' and parts[1] in ('tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'):
            counts[parts[1]] = int(parts[2])
    export = json.loads((OUT / 'export.stdout.log').read_text())
    save('postcondition.json', {'at': now(), 'head': git('rev-parse', 'HEAD').decode().strip(), 'worktreeStatus': git('status', '--porcelain').decode().splitlines(), 'sealed': current_sealed, 'sealedUnchanged': unchanged, 'protectedFilesChecked': len(prior['protectedFileHashes']), 'protectedFilesChanged': changes, 'snapshotDefinition': 'Sorted relative path, entry type/mode/size/mtime_ns/ctime_ns, regular file SHA256, symlink-target SHA256; includes .git; excludes access times; no Git commands run in sealed roots.'})
    passed = unchanged and not changes and counts == {'tests': 19, 'pass': 19, 'fail': 0, 'cancelled': 0, 'skipped': 0, 'todo': 0} and export['dryRun'] and not export['initializedNewHistory'] and export['sourceCommit'] == EXPECTED
    save('result.json', {'result': 'PASS' if passed else 'FAIL', 'at': now(), 'sourceCommit': EXPECTED, 'tests': counts, 'export': export, 'sealedRootCount': len(current_sealed), 'sealedUnchanged': unchanged, 'protectedFilesChanged': changes, 'liveTestsRun': False, 'productBuildRun': False, 'sealedRootCreated': False, 'remoteOperationRun': False, 'limitations': 'Publishing tests use disposable synthetic local repositories; validation-only export does not constitute live SDK/device acceptance or publication.'})
    print(json.dumps(load('result.json')))
    if not passed: sys.exit(1)
else: raise RuntimeError('Unknown stage')
