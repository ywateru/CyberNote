"""Independent read-only candidate06 Android evidence check; no platform tools/cache.

APK v2 certificate extraction reads length-prefixed signing-block structures only.
It is certificate identity parsing, not a new cryptographic signature verification.
"""
from pathlib import Path
import datetime
import hashlib
import json
import os
import re
import shutil
import struct
import subprocess
import zipfile

ROOT = Path('/Users/water/work/2026/Apple-Notes-Clone')
OUT = ROOT / 'docs/verification/unified-candidate06/android-paper-selection-independent03'
RUN = ROOT / 'docs/verification/unified-candidate06/android-paper-selection-build03'
ATTEMPT = RUN / 'android-attempt01'
ART = ROOT / 'artifacts/unified-candidate06/android-paper-selection-build03/android-attempt01'
SOURCE = '093986d170ef279fbce0f66e59891fd5f94aecad'
FREEZE = '39190998b264a76345eebe66bcd39642ff4c512f1422ec65b88399b644369d9d'
APK_SHA = 'd6350a35374a8fa05c836e26f361dfb3d4834882fd4a360ad7a7ebbedf2d123c'
CERT = 'e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79'
checks = []


def digest(data):
    return hashlib.sha256(data).hexdigest()


def ident(p):
    h = hashlib.sha256()
    with p.open('rb') as s:
        for block in iter(lambda: s.read(1024 * 1024), b''):
            h.update(block)
    return {'path': str(p.relative_to(ROOT)), 'bytes': p.stat().st_size, 'sha256': h.hexdigest()}


def load(p):
    return json.loads(p.read_text())


def check(name, value):
    checks.append({'name': name, 'pass': bool(value)})
    if not value:
        raise AssertionError(name)


def aggregate(rows):
    return digest(''.join(r['sha256'] + '  ' + r['path'] + '\n' for r in rows).encode())


def lp(data, offset=0):
    if offset + 4 > len(data):
        raise ValueError('truncated length prefix')
    size = struct.unpack_from('<I', data, offset)[0]
    end = offset + 4 + size
    if end > len(data):
        raise ValueError('length prefix exceeds parent')
    return data[offset + 4:end], end


def sequence(data):
    items, offset = [], 0
    while offset < len(data):
        item, offset = lp(data, offset)
        items.append(item)
    return items


def v2_certs(p):
    with zipfile.ZipFile(p) as z:
        cd = z.start_dir
    with p.open('rb') as s:
        s.seek(cd - 24)
        footer = s.read(24)
        if footer[8:] != b'APK Sig Block 42':
            raise ValueError('APK signing block footer missing')
        size = struct.unpack_from('<Q', footer)[0]
        if size < 24 or size + 8 > cd:
            raise ValueError('invalid APK signing block size')
        s.seek(cd - size - 8)
        block = s.read(size + 8)
    if struct.unpack_from('<Q', block)[0] != size:
        raise ValueError('APK signing block sizes differ')
    pairs, offset, end = [], 8, len(block) - 24
    while offset < end:
        size = struct.unpack_from('<Q', block, offset)[0]
        offset += 8
        if size < 4 or offset + size > end:
            raise ValueError('invalid signing pair')
        pairs.append((struct.unpack_from('<I', block, offset)[0], block[offset + 4:offset + size]))
        offset += size
    if offset != end:
        raise ValueError('signing pairs boundary mismatch')
    v2 = [value for key, value in pairs if key == 0x7109871a]
    if len(v2) != 1:
        raise ValueError('expected one v2 signing block')
    signers, consumed = lp(v2[0])
    if consumed != len(v2[0]):
        raise ValueError('v2 block trailing bytes')
    certs = []
    for signer in sequence(signers):
        signed, _ = lp(signer)
        _, offset = lp(signed)
        certificates, _ = lp(signed, offset)
        certs.append([{'bytes': len(cert), 'sha256': digest(cert)} for cert in sequence(certificates)])
    return {'signingBlockSha256': digest(block), 'pairIds': [hex(key) for key, _ in pairs], 'signerCertificates': certs}


started = datetime.datetime.now(datetime.timezone.utc).isoformat()
free = shutil.disk_usage(OUT).free
check('free >=2GiB', free >= 2 * 1024**3)
f, b, c = (load(p) for p in [RUN / 'input-freeze.json', ATTEMPT / 'result.json', ATTEMPT / 'collection/result.json'])
check('exact freeze SHA', ident(RUN / 'input-freeze.json')['sha256'] == FREEZE)
summary = load(RUN / 'freeze-summary.json')
check('exact freeze summary linkage', summary['sourceHead'] == SOURCE and summary['productAggregate'] == f['productAggregate'] and summary['inputAggregate'] == f['aggregate'] and summary['freeze'] == {**ident(RUN / 'input-freeze.json'), 'path': str(RUN / 'input-freeze.json')})
check('explicit expected aggregates', f['productAggregate'] == 'c888cc902f9f05da636c827c2b030200732967bcfd4fb52743000e877333bc60' and f['aggregate'] == 'aa8a862312b923f56bb4046dbacd780175a79bf080991647a38e5d121392ea28')

check('exact build result SHA', ident(ATTEMPT / 'result.json')['sha256'] == '310324bb81cd72d7434c11b65aff1d66b8e988c9136f83ed333366cd384be434')
check('exact collection result SHA', ident(ATTEMPT / 'collection/result.json')['sha256'] == 'af14eb4514b5ae59b77767fb151e51aa02d63bc068eb9517326d63862f1a1bc9')
check('exact source and Android stage', f['head'] == SOURCE and f['stage'] == 'android' and all(v['expectedHead'] == SOURCE and v['stage'] == 'android' for v in (b, c)))
check('source/freeze/aggregate linkage', all(v['freezeSha256'] == FREEZE and v['sourceAggregate'] == f['aggregate'] and v['productAggregate'] == f['productAggregate'] for v in (b, c)))
check('root authorization SHA', ident(ROOT / 'docs/verification/unified-candidate06/root-authorization-android-paper-selection-build03.json')['sha256'] == '68edde9e7ae7d605879914c5312c71012ddbb4662170545a1906a6d6f6dbe8bc')
check('authorization exact and input list', f['authorization'] == load(ROOT / 'docs/verification/unified-candidate06/root-authorization-android-paper-selection-build03.json') and f['authorization']['sourceHead'] == SOURCE and f['authorization']['inputPaths'] == [r['path'] for r in f['files']] and f['authorization']['productPaths'] == [r['path'] for r in f['productFiles']])
check('build collector exact identity linkage', {**ident(ATTEMPT / 'result.json'), 'path': str(ATTEMPT / 'result.json')} == c['buildResult'] and c['buildNonce'] == b['nonce'] and len(b['nonce']) == 32 and b['attempt'] == str(ATTEMPT) and b['command'] == ['pnpm', 'android:build', '--debug'])
check('build success gates', b['exitCode'] == 0 and b['ownedGroupStopped'] is True and b['remainingOwnedGroupMembers'] == [] and b['generatedOutputs'] and b['supplementalInputsUnchanged'] is True and all(b['inputComparisons'].values()) and not any(k in b for k in ['error', 'invalidated', 'offlineMarkerMissing', 'cleanupError', 'stopReason', 'groupCleanupError']))
check('collector success gates', c['ready'] is True and c['supplementalInputsUnchangedDuringCollection'] is True and all(c['inputComparisons'].values()) and not any(k in c for k in ['error', 'invalidated', 'cleanupError', 'stopReason', 'groupCleanupError']))
build_log = (ATTEMPT / 'build.txt').read_text()
check('offline and APK completion logged', 'CANDIDATE06_OFFLINE=true' in build_log and 'Finished 1 APK at:' in build_log and 'Downloading' not in build_log)
init = b['temporaryGradleInit']
clean = b['temporaryGradleInitBeforeCleanup']
check('recorded owned offline init cleanup', b['temporaryGradleInitRemoved'] is True and clean['regularFile'] is True and all(clean[k] == v for k, v in init.items()) and b['nonce'] in init['path'])
check('output provenance JSON linkage', load(ATTEMPT / 'output-isolation.json') == b['outputIsolation'] and load(ATTEMPT / 'generated-outputs.json') == b['generatedOutputs'] and b['outputIsolation']['sourcePathsAbsentBeforeCommand'] is True)
snapshots = ['inputs-before.json', 'inputs-after.json', 'collection/inputs-before-collection.json', 'collection/inputs-after-collection.json']
for name in snapshots:
    v = load(ATTEMPT / name)
    check('frozen recorded inputs: ' + name, all(v[k] == value for k, value in f.items() if k != 'at'))
current = []
for row in f['files']:
    p = ROOT / row['path']
    check('source outside target/cache: ' + row['path'], not (set(p.relative_to(ROOT).parts) & {'target', '.gradle', '.cache', 'build'}))
    value = ident(p)
    if p.is_symlink():
        value['symlinkTarget'] = os.readlink(p)
    check('current input: ' + row['path'], value == row)
    current.append(value)
check('302 complete inputs aggregate', len(current) == 302 and aggregate(current) == f['aggregate'])
current_map = {r['path']: r for r in current}
check('238 products aggregate', len(f['productFiles']) == 238 and all(current_map[r['path']] == r for r in f['productFiles']) and aggregate(f['productFiles']) == f['productAggregate'])
tree = subprocess.check_output(['git', 'ls-tree', '-r', '-z', SOURCE, '--', *[r['path'] for r in f['productFiles']]], cwd=ROOT)
blobs = {}
for entry in tree.split(b'\0'):
    if entry:
        header, path = entry.split(b'\t', 1)
        blobs[path.decode()] = header.split()[2].decode()
check('all products in exact source commit', len(blobs) == 238 and set(blobs) == {r['path'] for r in f['productFiles']})
for path, oid in blobs.items():
    p = ROOT / path
    data = os.readlink(p).encode() if p.is_symlink() else p.read_bytes()
    check('exact source blob: ' + path, hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest() == oid)
for row in f['tools']:
    check('frozen tool: ' + row['path'], {**ident(ROOT / 'docs/verification/unified-candidate06/android-paper-recovery-preparation02' / row['path']), 'path': row['path']} == row)

apk = ART / 'android-original.apk'
identity = ident(apk)
check('exact preserved APK bytes', identity['bytes'] == 177445114 and identity['sha256'] == APK_SHA and {**identity, 'path': str(apk)} == c['preservedApk'])
check('generated APK identity linkage', all(v['bytes'] == identity['bytes'] and v['sha256'] == identity['sha256'] for v in [b['buildOutputIdentity'], b['generatedOutputs'][0]['snapshot'], c['apk']]))
with zipfile.ZipFile(apk) as z:
    items = z.infolist()
    check('APK no duplicate ZIP names', len(items) == len({i.filename for i in items}))
    rows = [{'path': i.filename, 'bytes': i.file_size, 'compressedBytes': i.compress_size, 'sha256': digest(z.read(i))} for i in sorted(items, key=lambda i: i.filename) if not i.is_dir()]
check('all1066 APK ZIP entries and CRC', len(rows) == 1066 and rows == c['allZipEntries'])
models = [r for r in rows if r['path'].startswith('assets/mlkit-google-ocr-models/')]
model_map = {r['path']: (r['bytes'], r['sha256']) for r in models}
expected = {m['path']: (m['bytes'], m['sha256']) for aar in f['ocrCache'] for m in aar['models']}
check('all25 model bytes vs frozen AAR records', len(model_map) == 25 and len(expected) == 25 and model_map == expected and models == c['ocrModels'] and sum(r['bytes'] for r in models) == c['ocrModelBytes'] == 2490310 and c['ocrModelsExactlyMatchCachedAars'] is True)
abis = sorted({r['path'].split('/')[1] for r in rows if r['path'].startswith('lib/') and r['path'].endswith('.so')})
check('only arm64 ABI', abis == c['abis'] == ['arm64-v8a'])
sig = c['signature']
check('signature raw command linkage', c['commands'] == [sig] and sig['argv'] == [f['effectiveBuildEnvironment']['ANDROID_HOME'] + '/build-tools/36.0.0/apksigner', 'verify', '--verbose', '--print-certs', str(apk)] and Path(sig['log']) == ART / 'command-01.txt' and Path(sig['log']).read_text() == sig['stdout'])
check('recorded signature verify success', sig['exitCode'] == 0 and sig['ownedGroupStopped'] is True and sig['remainingOwnedGroupMembers'] == [] and 'Verifies\n' in sig['stdout'] and 'Verified using v2 scheme (APK Signature Scheme v2): true' in sig['stdout'])
logged_certs = re.findall(r'^Signer #\d+ certificate SHA-256 digest: ([0-9a-fA-F]+)\s*$', sig['stdout'], flags=re.MULTILINE)
v2 = v2_certs(apk)
check('current APK v2 certificate DER digest matches log', [[cert['sha256'] for cert in signer] for signer in v2['signerCertificates']] == [[CERT]] and logged_certs == c['signerCertificateSha256'] == [CERT])
old_path = ROOT / 'docs/verification/unified-candidate04-android-install-01/03-host-apk-identity.json'
old = load(old_path)
old_apk = Path(old['apk']['path'])
old_identity = ident(old_apk)
old_v2 = v2_certs(old_apk)
check('candidate04 exact preserved APK identity', {**old_identity, 'path': str(old_apk)} == old['apk'])
check('candidate04 current certificate matches candidate06', old_v2['signerCertificates'] == v2['signerCertificates'] and old['signature']['exit'] == 0 and re.findall(r'^Signer #\d+ certificate SHA-256 digest: ([0-9a-fA-F]+)\s*$', old['signature']['stdout'], flags=re.MULTILINE) == [CERT] and c['candidate04UpgradeCertificateMatches'] is True)
old_models_path = ROOT / 'docs/verification/unified-candidate04/android-recovery-01/android-original-identity.json'
old_models = load(old_models_path)
check('candidate04 recorded models match candidate06 current models', {r['path']: (r['bytes'], r['sha256']) for r in old_models['ocrModels']} == model_map)

evidence = [RUN / 'input-freeze.json', RUN / 'freeze-summary.json', ATTEMPT / 'result.json', ATTEMPT / 'output-isolation.json', ATTEMPT / 'generated-outputs.json', ATTEMPT / 'build.txt', ATTEMPT / 'collection/result.json', ART / 'command-01.txt', old_path, old_models_path] + [ATTEMPT / p for p in snapshots]
result = {'schema': 1, 'startedAt': started, 'endedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'conclusion': 'PASS: current preserved Android APK bytes and recorded source/signature/model provenance', 'sourceHead': SOURCE, 'freezeSHA256': FREEZE, 'productFiles': 238, 'inputFiles': 302, 'productAggregate': f['productAggregate'], 'inputAggregate': f['aggregate'], 'diskFreeBefore': free, 'checks': checks, 'apk': identity, 'zipEntryCount': len(rows), 'zipEntryAggregate': aggregate(rows), 'abis': abis, 'models': models, 'modelBytes': sum(r['bytes'] for r in models), 'currentV2CertificateParse': v2, 'candidate04Apk': old_identity, 'candidate04CurrentV2CertificateParse': old_v2, 'sourceEvidence': [ident(p) for p in evidence], 'limits': 'No build/sign/verify/install/platform/GUI command executed. v2 certificate DER parsed directly from both current APKs; existing apksigner verify result linked to raw log and exact bytes, not a new cryptographic signature verification. Frozen AAR model records checked without current cache access. No target/cache read; no device, upgrade installation, offline OCR, native input, audio, iOS or pixel acceptance.'}
with (OUT / 'result.json').open('x') as s:
    s.write(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'conclusion': result['conclusion'], 'checks': len(checks), 'result': ident(OUT / 'result.json')}, ensure_ascii=False))
