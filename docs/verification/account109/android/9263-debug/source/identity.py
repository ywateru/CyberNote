"""Static-only Account109 9263 identity check; never builds, installs, or uses ADB.

Adapted from ../../d69-debug/source/identity.py. All writes stay in this
evidence directory, except exclusive preservation of the ignored candidate APK.
"""
from pathlib import Path
import base64
import datetime
import hashlib
import json
import os
import re
import shutil
import struct
import subprocess
import zipfile

MAIN = Path('/Users/water/work/2026/Apple-Notes-Clone')
ROOT = Path('/private/tmp/cybernote-account109-android-90b8b28b-01')
OUT = Path(__file__).resolve().parent.parent
REVISION = '9263ea87b5f6112bbd23d4b57d6d7a8b21c9fee3'
CERTIFICATE = 'e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79'
PROVIDER = 'c1f6fc493bef37eb530022a1598e689c0d50073680192616aa7aea4e732cdd3c'
APK = ROOT / 'src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk'
PRESERVED = MAIN / 'artifacts/account109/android-candidate-9263ea87-debug.apk'
TOOLS = Path('/Users/water/Library/Android/sdk/build-tools/36.0.0')


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args], text=True).strip()


def write_json(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2) + '\n')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    assert git(ROOT, 'rev-parse', 'HEAD') == REVISION
    assert not git(ROOT, 'status', '--porcelain=v1')
    request_path = ROOT / 'artifacts/account109/build-request.json'
    result_path = Path('/private/tmp/account109-android-9263-result.json')
    request = json.loads(request_path.read_text())
    result = json.loads(result_path.read_text())
    assert request['sourceCommit'] == request['toolCommit'] == result['source'] == REVISION
    assert request['sourceTree'] == git(ROOT, 'rev-parse', 'HEAD^{tree}')
    assert result['buildExit'] == 0 and result['signal'] is None
    assert result['sourceClean'] and result['derivedChanges'] == []
    for name, digest in request['lockfiles'].items():
        assert sha(ROOT / name) == digest
    assert sha(ROOT / 'scripts/verification/account109-android-build.mjs') == request['toolSha256']
    assert sha(ROOT / 'scripts/verification/account109-android.init.gradle') == request['initScriptSha256']
    assert request['removedEnvironmentFlags'] == ['VITE_NOTES_ACCOUNT_NATIVE', 'VITE_NOTES_ACCOUNT_UI']
    env_files = [p.name for p in ROOT.glob('.env*') if p.is_file()]
    assert env_files == []
    source_sha = sha(APK)
    if PRESERVED.exists():
        assert sha(PRESERVED) == source_sha, 'Existing mismatched APK will not be overwritten'
    else:
        with APK.open('rb') as src, PRESERVED.open('xb') as dst:
            shutil.copyfileobj(src, dst, 1024 * 1024)
    assert sha(PRESERVED) == source_sha
    env = os.environ.copy()
    env['JAVA_HOME'] = '/opt/zerobrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home'
    badging = subprocess.check_output([str(TOOLS / 'aapt2'), 'dump', 'badging', str(PRESERVED)], text=True)
    xml = subprocess.check_output([str(TOOLS / 'aapt2'), 'dump', 'xmltree', '--file', 'AndroidManifest.xml', str(PRESERVED)], text=True)
    sig = subprocess.check_output([str(TOOLS / 'apksigner'), 'verify', '--verbose', '--print-certs', str(PRESERVED)], text=True, env=env)
    assert "package: name='com.local.notesclone.account109'" in badging
    assert "application-label:'CyberNote Account Test'" in badging
    assert "launchable-activity: name='com.local.notesclone.MainActivity'" in badging
    assert re.search(r'allowBackup[^\n]*=false', xml)
    assert re.search(r'debuggable[^\n]*=true', xml)
    assert re.search(r'extractNativeLibs[^\n]*=true', xml)
    schemes = re.findall(r'android:scheme[^\n]*="([^"]+)"', xml)
    hosts = re.findall(r'android:host[^\n]*="([^"]+)"', xml)
    assert schemes == ['com.local.notesclone.auth'] and hosts == ['callback']
    authorities = re.findall(r'android:authorities[^\n]*="([^"]+)"', xml)
    assert authorities and all(a.startswith('com.local.notesclone.account109.') for a in authorities)
    certs = re.findall(r'Signer #\d+ certificate SHA-256 digest: ([0-9a-f]+)', sig)
    assert certs == [CERTIFICATE]
    build_info_bytes = (ROOT / 'dist/build-info.json').read_bytes()
    build_info = json.loads(build_info_bytes)
    assert build_info['sourceRevision'] == REVISION and not build_info['sourceDirty']
    assert build_info['target'] == 'android'
    libraries = []
    with zipfile.ZipFile(PRESERVED) as archive:
        names = archive.namelist()
        assert len(names) == len(set(names)), 'Duplicate APK entries'
        for name in names:
            if not (name.startswith('lib/') and name.endswith('.so')):
                continue
            assert name.split('/')[1] == 'arm64' + '-v8a'
            with archive.open(name) as stream:
                header = stream.read(64)
                h = hashlib.sha256(header)
                for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                    h.update(chunk)
            assert header[:4] == b'\x7fELF' and header[4] == 2 and header[5] == 1
            assert struct.unpack_from('<H', header, 18)[0] == 183
            libraries.append({'path': name, 'bytes': archive.getinfo(name).file_size,
                              'sha256': h.hexdigest(), 'elfClass': 64, 'machine': 'AArch64'})
        provider = next(x for x in libraries if x['path'].endswith('/libcloudflared.so'))
        assert provider['sha256'] == PROVIDER
        native_name = next(x['path'] for x in libraries if x['path'].endswith('/libnotes_clone_lib.so'))
        # Pipe actual APK library bytes to Node, without extracting or using any Cargo target.
        node_code = r'''
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {brotliCompressSync,constants} from 'node:zlib';
import {verifyEmbeddedIdentity} from './scripts/publish/package-identity.mjs';
import {sourceIdentity} from './scripts/build-info.mjs';
const expected=Buffer.from(process.argv[2],'base64'), native=readFileSync(0);
const info=JSON.parse(expected), actual=sourceIdentity(process.argv[3],{metadataPath:null});
for(const key of ['sourceRevision','sourceFingerprint','sourceDirty','inputCount'])
 if(info[key]!==actual[key])throw Error('Source identity mismatch');
let embedded,parameters=null;
try{embedded=verifyEmbeddedIdentity(native,expected);}catch{
outer:for(let quality=0;quality<=11;quality++)for(const mode of [0,1,2]){
 const bytes=brotliCompressSync(expected,{params:{[constants.BROTLI_PARAM_QUALITY]:quality,[constants.BROTLI_PARAM_MODE]:mode}});
 try{embedded=verifyEmbeddedIdentity(native,expected,[bytes]);parameters={quality,mode,encodedSha256:createHash('sha256').update(bytes).digest('hex')};break outer;}catch{}
}}
if(!embedded)throw Error('Actual APK library lacks expected embedded identity');
console.log(JSON.stringify({embeddedIdentity:embedded,encodingParameters:parameters,sourceIdentity:actual}));
'''
        checked = subprocess.run(['node', '--input-type=module', '-e', node_code, str(Path(__file__).resolve()),
                                  base64.b64encode(build_info_bytes).decode(), str(ROOT)],
                                 input=archive.read(native_name), stdout=subprocess.PIPE,
                                 stderr=subprocess.PIPE, cwd=MAIN, check=True)
        embedded = json.loads(checked.stdout)
    assert sha(APK) == source_sha and not git(ROOT, 'status', '--porcelain=v1')
    for name, content in [('badging.txt', badging), ('manifest.txt', xml), ('signature.txt', sig)]:
        (OUT / name).write_text(content)
    write_json('build-request.json', request)
    write_json('build-result.json', result)
    write_json('build-info.json', build_info)
    receipt = {
        'schema': 1, 'status': 'passed-static-preinstallation-identity-only',
        'recordedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'sourceCommit': REVISION, 'sourceTree': request['sourceTree'], 'sourceRoot': str(ROOT),
        'sourceClean': True, 'derivedDiffEmpty': True,
        'apk': {'path': str(PRESERVED), 'sourcePath': str(APK), 'bytes': PRESERVED.stat().st_size,
                'sha256': source_sha, 'sourceAndPreservedMatch': True},
        'packageId': request['packageId'], 'activity': request['activity'],
        'displayName': request['displayName'], 'signatureCertificateSha256': certs[0],
        'backup': False, 'debuggable': True, 'extractNativeLibs': True,
        'authorities': authorities, 'callback': 'com.local.notesclone.auth://callback',
        'callbackSchemeCount': len(schemes), 'callbackHostCount': len(hosts),
        'libraries': libraries, 'frontendBuildInfo': build_info,
        'frontendBuildInfoSha256': hashlib.sha256(build_info_bytes).hexdigest(),
        'frontendBuildInfoExactUtf8': build_info_bytes.decode(), **embedded,
        'defaultGate': {'accountFlagsRemovedPerRequest': request['removedEnvironmentFlags'],
                        'envFilesPresent': env_files,
                        'sourcePath': 'src/account-client.ts', 'sourceSha256': sha(ROOT / 'src/account-client.ts'),
                        'limitation': 'Request records removed flags; historical process environment was not observed. Native default UI/behavior is not established by this static receipt.'},
        'environment': {'buildFlagsPerRequest': request['buildFlags'],
                        'historicalEnvironmentIndependentlyObserved': False},
        'lifecycle': {'buildExitCodePerResult': result['buildExit'], 'signalPerResult': result['signal'],
                      'independentlyObservedBuild': False},
        'evidence': {str(p.relative_to(OUT)): sha(p) for p in sorted(OUT.rglob('*')) if p.is_file() and p.name != 'identity.json'},
        'inputReceipts': {'requestSha256': sha(request_path), 'resultSha256': sha(result_path)},
        'installed': False, 'appLaunched': False, 'authExecuted': False, 'syncAccepted': False,
        'boundary': 'Static identity only, before installation. Build success/environment are attributed to supplied build receipts; APK signature/manifest/ELF/provider/embedded source bytes were independently checked. No runtime, account, sync, production signing, store, or release acceptance.',
    }
    write_json('identity.json', receipt)
    print(json.dumps({'phase': 'static-identity-verified', 'apkSha256': source_sha,
                      'bytes': receipt['apk']['bytes'], 'sourceCommit': REVISION,
                      'embeddedIdentity': embedded['embeddedIdentity'],
                      'packageId': receipt['packageId'], 'sourceClean': True}))


if __name__ == '__main__':
    main()
