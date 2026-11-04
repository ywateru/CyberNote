#!/usr/bin/env python3
"""Future candidate06 preservation and strict acceptance. Never installs or launches."""
import argparse
import os
from pathlib import Path
import re
import shutil
import time
import common as c
from importlib.util import spec_from_file_location, module_from_spec

_spec = spec_from_file_location('candidate06_runner', Path(__file__).with_name('run-build.py'))
runner = module_from_spec(_spec)
_spec.loader.exec_module(runner)


class Budget:
    def __init__(self, root, directory, env, result):
        self.root, self.directory, self.env, self.result = root, directory, env, result
        self.started = time.monotonic()
        self.index = 0

    def check(self):
        c.check_space(self.root)
        remaining = c.DEADLINE - (time.monotonic() - self.started)
        if remaining <= 0:
            self.result['stopReason'] = 'deadline'
            raise RuntimeError('Collection deadline600s reached')
        return remaining

    def command(self, argv, required=True):
        remaining = self.check()
        self.index += 1
        log = self.directory / ('command-%02d.txt' % self.index)
        record = {'argv': [str(x) for x in argv], 'log': str(log)}
        self.result.setdefault('commands', []).append(record)
        c.monitored(argv, self.root, self.env, log, record, deadline=remaining)
        record['stdout'] = log.read_text(errors='replace')
        self.check()
        if required and record['exitCode'] != 0:
            raise RuntimeError('Preservation command failed; inspect raw command log')
        return record

    def copy_file(self, source, destination):
        self.check()
        with Path(source).open('rb') as src, Path(destination).open('xb') as dst:
            while True:
                self.check()
                block = src.read(1024 * 1024)
                if not block:
                    break
                dst.write(block)
        shutil.copystat(source, destination)
        self.check()


def validate_built(a, before, digest, attempt, built):
    if not c.success(built):
        raise RuntimeError('Failed/invalidated build; no candidate acceptance')
    expected = {'stage': a['stage'], 'expectedHead': a['sourceHead'], 'productAggregate': a['productAggregate'],
                'sourceAggregate': before['aggregate'], 'freezeSha256': digest, 'attempt': str(attempt),
                'command': runner.COMMANDS[a['stage']]}
    if any(built.get(k) != v for k, v in expected.items()) or not re.fullmatch('[0-9a-f]{32}', built.get('nonce', '')):
        raise RuntimeError('Build result differs from exact authorized attempt/freeze/source/stage/command')
    for name in ['inputs-before.json', 'inputs-after.json']:
        if not all(c.same_inputs(before, c.load(attempt / name)).values()):
            raise RuntimeError('Actual attempt input evidence differs from frozen inputs')
    if a['stage'] == 'android':
        if not built.get('temporaryGradleInitRemoved') or 'CANDIDATE06_OFFLINE=true' not in (attempt / 'build.txt').read_text(errors='replace'):
            raise RuntimeError('Android offline marker or owned init cleanup missing')


def collect_mac(a, before, budget, result):
    source = Path(a['root']) / 'src-tauri/target/release/bundle/macos/备忘录.app'
    original = budget.directory / 'mac-original.app'
    original_zip = budget.directory / 'mac-original.zip'
    sealed = budget.directory / 'mac-sealed.app'
    sealed_zip = budget.directory / 'mac-sealed.zip'
    files = c.tree(source)
    budget.command(['/usr/bin/ditto', str(source), str(original)])
    if c.tree(original) != files or c.tree(source) != files:
        raise RuntimeError('Complete original bundle preservation mismatch')
    budget.command(['/usr/bin/ditto', '-c', '-k', '--sequesterRsrc', '--keepParent', str(original), str(original_zip)])
    result['original'] = {'sourceApp': str(source), 'preservedApp': str(original), 'bundleFiles': files,
                          'bundleAggregate': c.aggregate(files), 'archive': c.identity(original_zip),
                          'executable': c.identity(original / 'Contents/MacOS/notes-clone')}
    result['originalSignature'] = [budget.command(cmd, required=False) for cmd in [
        ['/usr/bin/codesign', '-d', '--verbose=4', str(original)],
        ['/usr/bin/codesign', '-d', '--entitlements', '-', str(original)],
        ['/usr/bin/codesign', '-d', '-r-', str(original)],
        ['/usr/bin/codesign', '--verify', '--deep', '--strict', '--verbose=4', str(original)]]]
    # Original signature failure is recorded; readiness requires the separate derived bundle to verify.
    budget.command(['/usr/bin/ditto', str(original), str(sealed)])
    result['sealedSign'] = budget.command(['/usr/bin/codesign', '--force', '--sign', '-', '--timestamp=none', str(sealed)])
    result['sealedVerify'] = budget.command(['/usr/bin/codesign', '--verify', '--deep', '--strict', '--verbose=4', str(sealed)])
    result['sealedDisplays'] = [budget.command(cmd, required=False) for cmd in [
        ['/usr/bin/codesign', '-d', '--verbose=4', str(sealed)],
        ['/usr/bin/codesign', '-d', '--entitlements', '-', str(sealed)],
        ['/usr/bin/codesign', '-d', '-r-', str(sealed)]]]
    new = c.tree(sealed)
    if c.tree(original) != files or c.tree(source) != files:
        raise RuntimeError('Original bundle changed during derived signing')
    oldmap, newmap = ({r['path']: r for r in rows} for rows in [files, new])
    changes = [{'path': p, 'before': oldmap.get(p), 'after': newmap.get(p)}
               for p in sorted(oldmap.keys() | newmap.keys()) if oldmap.get(p) != newmap.get(p)]
    result['sealingChanges'] = changes
    if {r['path'] for r in changes} - {'Contents/MacOS/notes-clone', 'Contents/_CodeSignature/CodeResources'}:
        raise RuntimeError('Unexpected derived bundle payload changes')
    budget.command(['/usr/bin/ditto', '-c', '-k', '--sequesterRsrc', '--keepParent', str(sealed), str(sealed_zip)])
    result['sealed'] = {'derivedApp': str(sealed), 'bundleFiles': new, 'bundleAggregate': c.aggregate(new),
                        'archive': c.identity(sealed_zip), 'executable': c.identity(sealed / 'Contents/MacOS/notes-clone')}
    result['preservedOriginalUnchanged'] = c.tree(original) == files
    result['limits'] = 'Complete original plus local adhoc derived bundle only. No DeveloperID, notarization, TCC, launch, persistence or pixel acceptance.'


def collect_android(a, before, budget, result):
    source = Path(a['root']) / 'src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk'
    preserved = budget.directory / 'android-original.apk'
    original = c.identity(source)
    budget.copy_file(source, preserved)
    if c.sha_file(preserved) != original['sha256'] or c.identity(source) != original:
        raise RuntimeError('Exact APK preservation mismatch')
    budget.check()
    entries = c.zip_entries(preserved)
    budget.check()
    models = [r for r in entries if r['path'].startswith('assets/mlkit-google-ocr-models/')]
    expected = {m['path']: (m['bytes'], m['sha256']) for archive in before['ocrCache'] for m in archive['models']}
    actual = {r['path']: (r['bytes'], r['sha256']) for r in models}
    result.update(apk=original, preservedApk=c.identity(preserved), allZipEntries=entries,
                  abis=sorted({r['path'].split('/')[1] for r in entries if r['path'].startswith('lib/') and r['path'].endswith('.so')}),
                  ocrModels=models, ocrModelBytes=sum(r['bytes'] for r in models),
                  ocrModelsExactlyMatchCachedAars=(len(expected) == 25 and actual == expected))
    command = [before['effectiveBuildEnvironment']['ANDROID_HOME'] + '/build-tools/36.0.0/apksigner', 'verify', '--verbose', '--print-certs', str(preserved)]
    result['signature'] = budget.command(command, required=False)
    certs = re.findall(r'^Signer #\d+ certificate SHA-256 digest: ([0-9a-fA-F]+)\s*$', result['signature']['stdout'], flags=re.MULTILINE)
    result['signerCertificateSha256'] = [v.lower() for v in certs]
    result['candidate04UpgradeCertificateMatches'] = result['signerCertificateSha256'] == [c.CERT]
    result['limits'] = 'Exact APK/model/ABI/signature and candidate04 certificate compatibility only. No install, device runtime, first-offline OCR, native input, audio or pixel claim.'
    if (result['signature']['exitCode'] != 0 or not result['ocrModelsExactlyMatchCachedAars']
            or not result['candidate04UpgradeCertificateMatches'] or result['abis'] != ['arm64-v8a']):
        raise RuntimeError('APK signature/model/ABI/upgrade certificate acceptance failed; retain failed APK')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--authorization', type=Path, required=True)
    p.add_argument('--freeze-sha256', required=True)
    p.add_argument('--attempt', required=True)
    args = p.parse_args()
    if not re.fullmatch('[A-Za-z0-9_-]+', args.attempt):
        raise ValueError('Unique simple attempt identifier required')
    a = c.authorization(args.authorization)
    before = c.frozen(a, args.freeze_sha256)
    run = Path(a['runDirectory'])
    attempt = run / (a['stage'] + '-' + args.attempt)
    built_path = attempt / 'result.json'
    built = c.load(built_path)
    validate_built(a, before, args.freeze_sha256, attempt, built)
    destination = Path(a['artifactDirectory']) / (a['stage'] + '-' + args.attempt)
    c.check_space(Path(a['root']))
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.mkdir(exist_ok=False)
    evidence = attempt / 'collection'
    evidence.mkdir(exist_ok=False)
    result = {'schema': 1, 'startedAt': c.now(), 'stage': a['stage'], 'expectedHead': a['sourceHead'],
              'productAggregate': a['productAggregate'], 'sourceAggregate': before['aggregate'],
              'freezeSha256': args.freeze_sha256, 'buildResult': c.identity(built_path),
              'buildNonce': built['nonce'], 'artifactDirectory': str(destination), 'ready': False}
    try:
        with c.lock_build():
            current = c.capture(a)
            c.write_new(evidence / 'inputs-before-collection.json', current)
            if not all(c.same_inputs(before, current).values()):
                raise RuntimeError('Full input/environment identity changed before collection')
            if runner.output_identity(a) != built.get('buildOutputIdentity') or c.tree(Path(a['root']) / 'dist') != built.get('dist'):
                raise RuntimeError('Build outputs changed or belong to another build attempt')
            env = os.environ.copy(); env.update(before['effectiveBuildEnvironment'])
            env['PATH'] = env['JAVA_HOME'] + '/bin:' + env['PATH']
            budget = Budget(Path(a['root']), destination, env, result)
            {'mac': collect_mac, 'android': collect_android}[a['stage']](a, before, budget, result)
            budget.check()
            after = c.capture(a)
            c.write_new(evidence / 'inputs-after-collection.json', after)
            result['inputComparisons'] = c.same_inputs(before, after)
            result['supplementalInputsUnchangedDuringCollection'] = before['supplementalInputs'] == after['supplementalInputs']
            if not all(result['inputComparisons'].values()) or not result['supplementalInputsUnchangedDuringCollection']:
                raise RuntimeError('Full source/environment/supplemental inputs changed during collection')
            if c.identity(built_path) != result['buildResult'] or runner.output_identity(a) != built['buildOutputIdentity']:
                raise RuntimeError('Build result/source artifact changed during collection')
            budget.check()
            result['ready'] = True
    except BaseException as error:
        result['error'] = repr(error)
    finally:
        result['endedAt'] = c.now()
        c.record_new(evidence / 'result.json', result)
    print({k: v for k, v in result.items() if k not in ['allZipEntries', 'ocrModels', 'original', 'sealed', 'commands']})
    raise SystemExit(0 if result['ready'] else 1)


if __name__ == '__main__':
    main()
