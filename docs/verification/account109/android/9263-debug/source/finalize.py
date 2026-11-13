"""Offline receipt/document comparison and full evidence hash manifest. No ADB."""
from pathlib import Path
import datetime
import hashlib
import json
import subprocess

MAIN = Path('/Users/water/work/2026/Apple-Notes-Clone')
OUT = Path(__file__).resolve().parent.parent
MAC = MAIN / 'docs/verification/account109/macos/9263ea87-debug-e2e.json'


def load(p):
    return json.loads(p.read_text())


def sha(p):
    h = hashlib.sha256()
    with p.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def save(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2) + '\n')


def main():
    identity = load(OUT / 'identity.json')
    mac = load(MAC)
    initial = load(OUT / 'local-update-initial-result.json')
    final = load(OUT / 'local-update-result.json')
    baseline = load(OUT / 'synthetic-baseline.json')['notes']
    created = load(OUT / 'synthetic-created-note.json')
    after = load(OUT / 'synthetic-after-restart.json')['notes']
    assert len(baseline) == 3 and len(after) == 4
    assert len({n['id'] for n in after}) == 4
    assert created['id'] not in {n['id'] for n in baseline}
    for old in baseline + [created]:
        current = next(n for n in after if n['id'] == old['id'])
        assert old['document'] == current['document']
        assert old['plainText'] == current['plainText']
    assert initial['installed'] and initial['installationAttempted']
    assert initial['failure']['phase'] == 'default-native-ui-and-status'
    assert final['passed'] and final['resumedAfterVerifiedInstall']
    assert not final['installationAttempted']
    assert final['restart']['oldPid'] != final['restart']['newPid']
    assert final['accountUI']['renderedState'] == 'signedOut'
    assert final['accountAfterRestart']['state'] == 'signedOut'
    assert not final['accountAfterRestart']['enabled']
    for receipt in [initial, final]:
        assert not any(receipt[k] for k in ['signInCalled', 'cancelCalled', 'signOutCalled',
                                          'syncEnabled', 'dataCleared', 'originalAppTouched'])
        assert receipt['cleanup']['allOwnedForwardsAbsent']
        assert receipt['cleanup']['leaseAbsent']
        assert receipt['cleanup']['forwardsAfter'] == []
    apk = Path(identity['apk']['path'])
    assert sha(apk) == identity['apk']['sha256'] == final['installedApkSha256']
    assert sha(Path(mac['binary']['path'])) == mac['binary']['expectedSha256']
    # This revalidates product fingerprint and embedded bytes using the sealed
    # mac receipt, independent of shared docs changes, dist, or Cargo targets.
    mac_check = json.loads(subprocess.check_output(
        ['node', str(OUT / 'source/mac-identity.mjs')], text=True, cwd=MAIN))
    summary = {
        'schema': 1, 'recordedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'status': 'passed-static-identities-and-one-android-local-update',
        'sourceCommit': identity['sourceCommit'], 'sourceTree': identity['sourceTree'],
        'observedMainHeadAtFinalization': subprocess.check_output(
            ['git', '-C', str(MAIN), 'rev-parse', 'HEAD'], text=True).strip(),
        'productFingerprintMatches9263': mac_check['productFingerprintMatches9263'],
        'sourceCleanAtInitialIndependentCheck': True,
        'mainStatusAtFinalization': subprocess.check_output(
            ['git', '-C', str(MAIN), 'status', '--porcelain=v1'], text=True).splitlines(),
        'macBinarySha256': mac['binary']['sha256'], 'androidApkSha256': identity['apk']['sha256'],
        'androidCertificateSha256': identity['signatureCertificateSha256'],
        'macEmbeddedIdentity': mac['embeddedIdentity']['sha256'],
        'androidEmbeddedIdentity': identity['embeddedIdentity']['sha256'],
        'preexistingSyntheticNotes': len(baseline), 'createdSyntheticNotes': 1,
        'fullDocumentsAndPlainTextEqualAfterRestart': len(after),
        'installationsPerformed': 1, 'restartVerified': True,
        'initialHelperAssertionStoppedAndArchived': True,
        'initialTerminalAccountState': initial['accountBefore']['state'],
        'finalTerminalAccountState': final['accountAfterRestart']['state'],
        'ownedForwardsRemoved': len(initial['mappings']) + len(final['mappings']),
        'finalForwards': [], 'leaseClosed': True, 'adbOwnershipReturned': True,
        'mainDistCanBeOverwrittenForThisIdentityCheck': True,
        'macAppRun': False, 'loginExecuted': False, 'threeWaySyncAccepted': False,
        'boundary': 'Static artifact identities plus local Android debug update/restart with synthetic notes only. Historical build environment is attributed to build receipts; no real-account, three-way sync, production release, signing or notarization acceptance.',
    }
    save('verification-summary.json', summary)
    evidence = [p for p in sorted(OUT.rglob('*')) if p.is_file() and p.name != 'evidence-manifest.json']
    evidence.append(MAC)
    evidence.extend([apk, Path(mac['binary']['path'])])
    save('evidence-manifest.json', {'schema': 1,
        'recordedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'selfExcluded': True,
        'files': [{'path': str(p.relative_to(MAIN)), 'bytes': p.stat().st_size, 'sha256': sha(p)} for p in evidence]})
    print(json.dumps({k: summary[k] for k in ['status', 'androidApkSha256', 'macBinarySha256',
        'preexistingSyntheticNotes', 'fullDocumentsAndPlainTextEqualAfterRestart',
        'installationsPerformed', 'ownedForwardsRemoved', 'adbOwnershipReturned']}))


if __name__ == '__main__':
    main()
