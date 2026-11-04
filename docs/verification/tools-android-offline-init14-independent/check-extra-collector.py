#!/usr/bin/env python3
"""Extra collector mutations against a real temporary Python-runner fixture."""
import copy
import importlib.util
import json
from pathlib import Path
import sys
from unittest.mock import patch

OUT = Path(__file__).parent
PREP = OUT.parents[1] / 'verification/unified-candidate06/preparation'
sys.path.insert(0, str(PREP))
spec = importlib.util.spec_from_file_location('author_check', PREP / 'check-android-offline-init.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
original = m.collector.validate_built
checks = []
ran = False

def reject(label, a, before, digest, attempt, record):
    try:
        original(a, before, digest, attempt, record)
    except (RuntimeError, OSError) as error:
        checks.append({'case': label, 'expected': 'reject', 'actual': 'reject', 'reason': str(error)})
    else:
        raise AssertionError('Unexpected collector acceptance: ' + label)

def intercept(a, before, digest, attempt, built):
    global ran
    original(a, before, digest, attempt, built)
    if ran:
        return
    ran = True
    log = attempt / 'build.txt'
    raw = log.read_text()
    try:
        for label, suffix in [
            ('second-cache-reuse-phrase', '\nReusing configuration cache.\n'),
            ('case-insensitive-cache-reuse', '\nCONFIGURATION CACHE ENTRY REUSED.\n'),
            ('mixed-old-and-current-nonce', '\n' + raw.replace(built['nonce'], '0' * 32)),
        ]:
            log.write_text(raw + suffix)
            reject(label, a, before, digest, attempt, built)
        log.write_text(raw)
        wrong_nonce = {**built, 'nonce': 'f' * 32}
        reject('result-nonce-only', a, before, digest, attempt, wrong_nonce)
        wrong_count = {**built, 'androidOfflineProof': {**built['androidOfflineProof'], 'markerCount': 2}}
        reject('proof-marker-count-only', a, before, digest, attempt, wrong_count)
        log.unlink()
        reject('raw-log-removed-while-success-proof-remains', a, before, digest, attempt, built)
        log.write_text(raw + raw)
        duplicate = {**built, 'androidOfflineProof': {**built['androidOfflineProof'], 'markerCount': 2}}
        original(a, before, digest, attempt, duplicate)
        checks.append({'case': 'two-identical-current-proofs', 'expected': 'accept', 'actual': 'accept'})
        reject('duplicate-log-stale-proof-count', a, before, digest, attempt, built)
    finally:
        log.write_text(raw)
    snapshots = {name: (attempt / name).read_text() for name in ['inputs-before.json', 'inputs-after.json']}
    try:
        # Synchronize the bad frozen environment, recorded child overrides and both
        # temporary snapshots; rejection must still come from the required launch option.
        bad = copy.deepcopy(before)
        bad['effectiveBuildEnvironment']['GRADLE_OPTS'] = '-Dorg.gradle.daemon=false'
        record = {**built, 'explicitEnvironmentOverrides': bad['effectiveBuildEnvironment']}
        for name in snapshots:
            (attempt / name).write_text(json.dumps(bad))
        reject('bad-frozen-environment-and-matching-child-record', a, bad, digest, attempt, record)
    finally:
        for name, text in snapshots.items():
            (attempt / name).write_text(text)

def main():
    target = OUT / 'extra-collector.json'
    assert not target.exists()
    env, selection = m.environments()
    with patch.object(m.collector, 'validate_built', side_effect=intercept):
        fixture = m.fixture(env['android'], 'good')
    assert ran and len(checks) == 9
    # Construction rejects attempts to inject arbitrary init text through nonce.
    invalid = ['', '0' * 31, 'A' * 32, '0' * 32 + '\nprintln("x")']
    for nonce in invalid:
        try:
            m.c.android_offline_init(nonce)
        except ValueError:
            pass
        else:
            raise AssertionError('Invalid init nonce accepted')
    result = dict(status='pass', scope='Python/temp fixtures only; no Groovy, Gradle or native execution.',
                  extraCollectorCases=checks, invalidInitNonceRejections=len(invalid), environmentSelection=selection,
                  baseFixture=fixture, provenancePreconditions='Unmodified real temporary runner files/output identity; no collector provenance bypass mocks.')
    m.c.record_new(target, result)
    print(json.dumps({'status':'pass','extraCollectorCases':len(checks),'invalidInitNonceRejections':len(invalid)}))

if __name__ == '__main__':
    main()
