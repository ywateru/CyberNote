#!/usr/bin/env python3
"""Python-only source/environment checks. Never freezes, builds or reads target/cache."""
import ast
import hashlib
import json
from pathlib import Path
import subprocess
from unittest.mock import patch
import common as c

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
OLD = HERE.parent / 'preparation'
BASE_HEAD = '62244d445b19321a3fe773ffa074563c56970595'
BEFORE = b"GRADLE_OPTS='-Dorg.gradle.daemon=false'"
AFTER = b"GRADLE_OPTS='-Dorg.gradle.daemon=false -Dorg.gradle.configuration-cache=false'"

def sha(value):
    return hashlib.sha256(value).hexdigest()


def main():
    result = {'pass': False, 'scope': 'Controlled Python-only; no freeze, version/build/Gradle commands, target/cache access or dependency acquisition.'}
    try:
        names = ['common.py', 'freeze-inputs.py', 'run-build.py', 'collect-outputs.py']
        copies = []
        for name in names:
            old, new = (OLD / name).read_bytes(), (HERE / name).read_bytes()
            expected = old.replace(BEFORE, AFTER) if name == 'common.py' else old
            if name == 'common.py':
                assert old.count(BEFORE) == 1 and new.count(AFTER) == 1
            assert new == expected, name + ': unexpected difference'
            ast.parse(new, filename=name)
            copies.append({'file': name, 'sourceSha256': sha(old), 'newSha256': sha(new), 'byteIdenticalExceptSpecifiedAndroidString': True})
        for p in sorted(HERE.glob('*.py')):
            ast.parse(p.read_text(), filename=str(p))
        result['copies'] = copies
        # Stub only file existence in this test; no SDK/cache location is read.
        # Actual freeze will perform the unmodified real presence checks later.
        with patch.object(Path, 'exists', return_value=True), patch.object(c.subprocess, 'run', side_effect=AssertionError('No subprocess permitted during environment check')):
            android = c.effective_environment('android')
            mac = c.effective_environment('mac')
        assert android['GRADLE_OPTS'] == '-Dorg.gradle.daemon=false -Dorg.gradle.configuration-cache=false'
        assert 'GRADLE_OPTS' not in mac and 'GRADLE_RO_DEP_CACHE' not in mac
        assert {k: v for k, v in android.items() if k not in ['GRADLE_OPTS', 'GRADLE_RO_DEP_CACHE']} == mac
        assert android['GRADLE_RO_DEP_CACHE'] == '/private/tmp/notes-lifecycle-cache-overlay-01/overlay-ro'
        result['controlledEffectiveEnvironment'] = {'android': android, 'mac': mac, 'availabilityChecksStubbed': True}
        # Source-equivalent gates must still reject an otherwise successful build.
        base = dict(exitCode=0, ownedGroupStopped=True, generatedOutputs=['controlled'], supplementalInputsUnchanged=True, inputComparisons={'files': True})
        assert c.success(base)
        for key in ['offlineMarkerMissing', 'error', 'invalidated', 'cleanupError', 'groupCleanupError', 'stopReason']:
            assert not c.success({**base, key: True}), key
        result['failedBuildRejectionUnchanged'] = True
        reference = json.loads((HERE / 'evidence/reference-inputs.json').read_text())
        for row in reference['files']:
            b = (ROOT / row['path']).read_bytes()
            assert len(b) == row['bytes'] and sha(b) == row['sha256'], row['path']
        result['historicalReferenceFilesUnchanged'] = len(reference['files'])
        frozen = json.loads((HERE.parent / 'android-paper-build02/input-freeze.json').read_text())
        product = []
        for row in frozen['productFiles']:
            b = (ROOT / row['path']).read_bytes()
            assert len(b) == row['bytes'] and sha(b) == row['sha256'], row['path']
            product.append(row)
        digest = c.aggregate(product)
        assert len(product) == 238 and digest == '560f9826b44320f184493f8f522a2cfefaf78a7e4e7c1faad8fa001e1190583d'
        result['product'] = {'files': len(product), 'aggregate': digest, 'unchangedFromFrozenSourceHead': BASE_HEAD}
        changed = subprocess.check_output(['git', 'diff', BASE_HEAD, '--name-only', '--', *[r['path'] for r in product]], cwd=ROOT, text=True)
        assert not changed
        result['headAtCheck'] = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
        result['pass'] = True
    except BaseException as error:
        result['error'] = repr(error)
        raise
    finally:
        output = HERE / 'evidence/controlled-check.json'
        with output.open('x') as stream:
            stream.write(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
