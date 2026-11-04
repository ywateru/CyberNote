"""Bounded read-only Android05 provenance/APK audit; writes only new reviewer evidence.

No build, Gradle, version probes, cache traversal, GUI, ADB or installation.
APK ZIP members are streamed in memory, never extracted.
"""
from pathlib import Path
import datetime
import hashlib
import json
import os
import re
import shutil
import signal
import stat
import struct
import subprocess
import time
import zipfile

ROOT = Path('/Users/water/work/2026/Apple-Notes-Clone')
BASE = ROOT / 'docs/verification/unified-candidate06'
OUT = BASE / 'android-smart-u-independent05'
RUN = BASE / 'android-smart-u-build05'
ATTEMPT = RUN / 'android-attempt01'
ART = ROOT / 'artifacts/unified-candidate06/android-smart-u-build05/android-attempt01'
AUTH = BASE / 'smart-u-device09-preparation/android-build05-authorization.json'
SOURCE = 'e482dac285a1e2b66f88bac035824b7c98e832a7'
FREEZE = '189ee0d17005187bdfc9902f969de3dd724f3a619f1d637f3b3abd09f48544c2'
APK_SHA = 'a6f94fe3c397a6078116c5f2d6c3190ae5091afa214b7005307973f57ef96322'
CERT = 'e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79'
checks = []

def digest(data):
    return hashlib.sha256(data).hexdigest()

def hash_stream(stream):
    h = hashlib.sha256()
    for block in iter(lambda: stream.read(1024 * 1024), b''):
        h.update(block)
    return h.hexdigest()

def ident(p):
    with p.open('rb') as stream:
        sha = hash_stream(stream)
    return {'path': str(p.relative_to(ROOT)), 'bytes': p.stat().st_size, 'sha256': sha}

def absolute_ident(p):
    return {**ident(p), 'path': str(p)}

def load(p):
    return json.loads(p.read_text())

def record(name, value):
    with (OUT / name).open('x') as stream:
        stream.write(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def check(name, condition):
    checks.append({'name': name, 'pass': bool(condition)})
    if not condition:
        raise AssertionError(name)

def aggregate(rows):
    return digest(''.join(r['sha256'] + '  ' + r['path'] + '\n' for r in rows).encode())

def tree(path):
    rows = []
    for p in sorted(path.rglob('*')):
        if p.is_symlink():
            target = os.readlink(p)
            rows.append({'path': str(p.relative_to(path)), 'type': 'symlink', 'target': target, 'sha256': digest(target.encode())})
        elif p.is_file():
            rows.append({**ident(p), 'path': str(p.relative_to(path)), 'type': 'file', 'mode': stat.S_IMODE(p.stat().st_mode)})
    return rows

def file_snapshot(p):
    s = p.stat()
    return dict(kind='file', device=s.st_dev, inode=s.st_ino, mode=stat.S_IMODE(s.st_mode),
                **{k:v for k,v in ident(p).items() if k != 'path'})

def directory_snapshot(p):
    s = p.stat()
    return dict(kind='directory', device=s.st_dev, inode=s.st_ino, mode=stat.S_IMODE(s.st_mode),
                directories=[{'path':str(x.relative_to(p)), 'mode':stat.S_IMODE(x.stat().st_mode)} for x in sorted(p.rglob('*')) if x.is_dir()], files=tree(p))

def protected_inputs():
    paths = {AUTH}
    for directory in [RUN, ART, BASE / 'android-smart-u-build04',
                      ROOT / 'docs/verification/tools-android-offline-init14',
                      ROOT / 'docs/verification/tools-android-offline-init14-independent']:
        paths.update(p for p in directory.rglob('*') if p.is_file() and not p.is_symlink())
    mac = load(BASE / 'mac-smart-u-independent09/input-manifest.json')
    paths.update(ROOT / r['path'] for r in mac['files'])
    paths.update(p for p in (BASE / 'mac-smart-u-independent09').iterdir() if p.is_file())
    paths.add(ROOT / 'docs/plan/reviews/mac-smart-u-independent09.md')
    paths.add(ROOT / 'docs/plan/reviews/tools-android-offline-init14.md')
    return [ident(p) for p in sorted(paths)]

def read_lp(data, offset=0):
    if offset + 4 > len(data):
        raise ValueError('truncated signing field')
    end = offset + 4 + struct.unpack_from('<I', data, offset)[0]
    if end > len(data):
        raise ValueError('signing field exceeds container')
    return data[offset + 4:end], end

def sequences(data):
    offset = 0
    while offset < len(data):
        value, offset = read_lp(data, offset)
        yield value

def v2_certificates(p):
    with zipfile.ZipFile(p) as z:
        cd = z.start_dir
    with p.open('rb') as stream:
        stream.seek(cd - 24)
        footer = stream.read(24)
        if footer[8:] != b'APK Sig Block 42':
            raise ValueError('signing block missing')
        size = struct.unpack_from('<Q', footer)[0]
        if size < 24 or size + 8 > cd:
            raise ValueError('invalid signing block size')
        stream.seek(cd - size - 8)
        block = stream.read(size + 8)
    if struct.unpack_from('<Q', block)[0] != size:
        raise ValueError('signing block size mismatch')
    offset, limit, pairs = 8, len(block) - 24, []
    while offset < limit:
        length = struct.unpack_from('<Q', block, offset)[0]
        offset += 8
        if length < 4 or offset + length > limit:
            raise ValueError('invalid signing pair')
        pairs.append((struct.unpack_from('<I', block, offset)[0], block[offset+4:offset+length]))
        offset += length
    if offset != limit:
        raise ValueError('signing pair boundary mismatch')
    v2 = [value for key, value in pairs if key == 0x7109871a]
    if len(v2) != 1:
        raise ValueError('expected one v2 block')
    signers, end = read_lp(v2[0])
    if end != len(v2[0]):
        raise ValueError('v2 trailing bytes')
    certificates = []
    for signer in sequences(signers):
        signed, _ = read_lp(signer)
        _, pos = read_lp(signed)
        certs, _ = read_lp(signed, pos)
        certificates.append([{'bytes':len(cert), 'sha256':digest(cert)} for cert in sequences(certs)])
    return {'signingBlockSha256':digest(block), 'pairIds':[hex(k) for k,v in pairs], 'signerCertificates':certificates}

def fresh_verify(apk, environment):
    argv = [environment['ANDROID_HOME'] + '/build-tools/36.0.0/apksigner', 'verify', '--verbose', '--print-certs', str(apk)]
    env = os.environ.copy()
    env.update(environment)
    started = time.monotonic()
    p = subprocess.Popen(argv, cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
    try:
        stdout, stderr = p.communicate(timeout=30)
    except BaseException:
        if p.poll() is None:
            os.killpg(p.pid, signal.SIGTERM)
            try:
                p.communicate(timeout=3)
            except subprocess.TimeoutExpired:
                os.killpg(p.pid, signal.SIGKILL)
                p.communicate(timeout=3)
        raise
    value = dict(argv=argv, exitCode=p.returncode, elapsedSeconds=time.monotonic()-started, deadlineSeconds=30, stdout=stdout, stderr=stderr)
    record('fresh-signature-check.json', value)
    check('fresh cryptographic apksigner exit0', p.returncode == 0)
    check('fresh v2 signature and one signer', 'Verified using v2 scheme (APK Signature Scheme v2): true' in stdout and 'Number of signers: 1' in stdout)
    check('fresh expected certificate', re.findall(r'^Signer #\d+ certificate SHA-256 digest: ([0-9a-fA-F]+)\s*$',stdout,re.MULTILINE) == [CERT])
    return value

def main():
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    check('free >=2GiB', shutil.disk_usage(OUT).free >= 2*1024**3)
    initial = protected_inputs()
    record('input-manifest.json', {'sourceHead':SOURCE, 'count':len(initial), 'files':initial})
    f, b, c = (load(p) for p in [RUN/'input-freeze.json', ATTEMPT/'result.json', ATTEMPT/'collection/result.json'])
    check('exact HEAD', subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip() == SOURCE)
    for path, sha in [(AUTH,'c6dd1cd54f0be54381658d7a713d13f5887a65a37afed93f0fe46d3e287446e9'), (RUN/'input-freeze.json',FREEZE), (ATTEMPT/'result.json','8869531ccdfd68313317744efef79f0c9210a4af501b88bf877e7726560fbf27'), (ATTEMPT/'collection/result.json','37689109403e751a52b4f6e600354253b772e051fc3042d9b9b29067fedb5af9')]:
        check('exact frozen evidence '+str(path.relative_to(ROOT)), ident(path)['sha256']==sha)
    a = load(AUTH)
    check('exact authorization and lists', f['authorization']==a and a['sourceHead']==SOURCE and a['inputPaths']==[x['path'] for x in f['files']] and a['productPaths']==[x['path'] for x in f['productFiles']] and a['stage']=='android' and a['runDirectory']==str(RUN) and a['artifactDirectory']==str(ART.parent))
    check('source/stage/freeze/aggregate chain', f['head']==SOURCE and f['stage']=='android' and all(x['expectedHead']==SOURCE and x['stage']=='android' and x['freezeSha256']==FREEZE and x['productAggregate']==f['productAggregate'] and x['sourceAggregate']==f['aggregate'] for x in [b,c]))
    summary = load(RUN/'freeze-summary.json')
    check('freeze summary exact linkage', summary['sourceHead']==SOURCE and summary['freeze']==absolute_ident(RUN/'input-freeze.json') and summary['productAggregate']==f['productAggregate'] and summary['inputAggregate']==f['aggregate'])
    approval = load(RUN/'root-freeze-review.json')
    check('root exact START record', approval['sourceHead']==SOURCE and approval['freezeSha256']==FREEZE and approval['differences']==[] and approval['effectiveBuildEnvironment']==f['effectiveBuildEnvironment'] and approval['decision'].startswith('START Android05 attempt01'))
    check('timestamps ordered', summary['at']<=b['startedAt']<b['endedAt']<=c['startedAt']<c['endedAt'])
    check('exact build command/result linkage', c['buildResult']==absolute_ident(ATTEMPT/'result.json') and c['buildNonce']==b['nonce']=='a1c0326678524738aa1cd9c99796afe8' and b['attempt']==str(ATTEMPT) and b['command']==['pnpm','android:build','--debug'] and c['artifactDirectory']==str(ART))
    check('build success/resource gates', b['exitCode']==0 and b['ownedGroupStopped'] is True and b['remainingOwnedGroupMembers']==[] and b['supplementalInputsUnchanged'] is True and all(b['inputComparisons'].values()) and b['deadlineSeconds']==600 and b['elapsedSeconds']<600 and b['minimumFreeBytes']>=2*1024**3 and not any(k in b for k in ['error','invalidated','offlineMarkerMissing','cleanupError','stopReason','groupCleanupError']))
    check('collection success gates', c['ready'] is True and c['supplementalInputsUnchangedDuringCollection'] is True and all(c['inputComparisons'].values()) and not any(k in c for k in ['error','invalidated','cleanupError','stopReason','groupCleanupError']))
    snapshots = ['inputs-before.json','inputs-after.json','collection/inputs-before-collection.json','collection/inputs-after-collection.json']
    for name in snapshots:
        value=load(ATTEMPT/name)
        check('complete frozen snapshot '+name, all(value[k]==v for k,v in f.items() if k!='at'))
    current=[]
    for row in f['files']:
        p=ROOT/row['path']
        value=ident(p)
        if p.is_symlink(): value['symlinkTarget']=os.readlink(p)
        check('current input '+row['path'], value==row)
        current.append(value)
    check('320 complete current input aggregate', len(current)==320 and aggregate(current)==f['aggregate']=='abf3f38aceb7cc93100e27ca3bca1848d3d12bba5999835d2a501346522efab6')
    cmap={x['path']:x for x in current}
    check('301 product aggregate',len(f['productFiles'])==301 and all(cmap[r['path']]==r for r in f['productFiles']) and aggregate(f['productFiles'])==f['productAggregate']=='b02f0a58b0ff5bc31cb9d09437fd73b32645b5f198d781336196fe2060b75897')
    git_tree=subprocess.check_output(['git','ls-tree','-r','-z',SOURCE,'--']+[r['path'] for r in f['productFiles']],cwd=ROOT)
    blobs={}
    for entry in git_tree.split(b'\0'):
        if entry:
            header,path=entry.split(b'\t',1);blobs[path.decode()]=header.split()[2].decode()
    check('301 explicit git blobs',set(blobs)=={r['path'] for r in f['productFiles']})
    for path,oid in blobs.items():
        p=ROOT/path; data=os.readlink(p).encode() if p.is_symlink() else p.read_bytes()
        check('exact source git blob '+path,hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()==oid)
    check('fix13 product tree unchanged',git_tree==subprocess.check_output(['git','ls-tree','-r','-z','8e8fe7e320e34a2b9c27bf7c7e794662ad988da4','--']+[r['path'] for r in f['productFiles']],cwd=ROOT))
    for row in f['tools']:
        check('frozen canonical tool '+row['path'],{**ident(BASE/'preparation'/row['path']),'path':row['path']}==row)
    check('7 canonical tools unchanged vs reviewed tools14',len(f['tools'])==7 and subprocess.check_output(['git','diff','--name-only','93e0e13da6e3e0efe2450684f9f909e795aeda6b',SOURCE,'--',str(BASE/'preparation')],cwd=ROOT,text=True)=='')
    expected_env={'ANDROID_HOME':'/Users/water/Library/Android/sdk','NDK_HOME':'/Users/water/Library/Android/sdk/ndk/27.2.12479018','JAVA_HOME':'/opt/zerobrew/opt/openjdk@17','GRADLE_USER_HOME':'/private/tmp/notes-scan-gradle-home','CARGO_NET_OFFLINE':'true','CARGO_BUILD_JOBS':'2','GRADLE_RO_DEP_CACHE':'/private/tmp/notes-lifecycle-cache-overlay-01/overlay-ro','GRADLE_OPTS':'-Dorg.gradle.daemon=false -Dorg.gradle.configuration-cache=false'}
    check('fixed frozen and actual child override environment',f['effectiveBuildEnvironment']==b['explicitEnvironmentOverrides']==expected_env)
    log=(ATTEMPT/'build.txt').read_text()
    expected_marker='CANDIDATE06_OFFLINE=true workers=2 configurationCacheJvmProperty=false nonce='+b['nonce']
    markers=[(i,line.strip()) for i,line in enumerate(log.splitlines(),1) if 'CANDIDATE06_OFFLINE=' in line]
    check('real current init exactly twice in raw log',markers==[(73,expected_marker),(74,expected_marker)] and b['androidOfflineProof']==dict(nonce=b['nonce'],offline=True,workers=2,configurationCacheJvmProperty='false',markerCount=2))
    check('raw log no configuration cache reuse or download',re.search(r'reusing\s+(?:the\s+)?configuration cache|configuration cache(?: entry)?\s+(?:was\s+)?reused|\bDownloading\b',log,re.I) is None)
    check('native build completion logged','> node scripts/android.mjs build --debug' in log and '> tauri android build --debug --target aarch64 --apk' in log and 'Finished 1 APK at:' in log)
    init=b['temporaryGradleInit']; cleanup=b['temporaryGradleInitBeforeCleanup']
    check('owned init exact cleanup provenance',b['temporaryGradleInitRemoved'] is True and cleanup['regularFile'] is True and all(cleanup[k]==v for k,v in init.items()) and init['bytes']==576 and init['sha256']=='d511be1f1d6177054b134b2032f5f0fd007b8b0ff459d2f1fe805fa79c58d833' and init['path'].endswith('candidate06-offline-'+b['nonce']+'.gradle'))
    check('atomic isolation recorded before command',load(ATTEMPT/'output-isolation.json')==b['outputIsolation'] and b['outputIsolation']['policy']=='atomic-rename-final-output-and-dist' and b['outputIsolation']['sourcePathsAbsentBeforeCommand'] is True and load(ATTEMPT/'generated-outputs.json')==b['generatedOutputs'])
    for row in b['outputIsolation']['outputs']:
        p=Path(row['preserved'])
        actual=file_snapshot(p) if row['kind']=='file' else directory_snapshot(p)
        check('prior output full identity '+row['name'],actual==row['before'])
    generated=b['generatedOutputs']
    for row in generated:
        p=Path(row['source'])
        actual=file_snapshot(p) if row['snapshot']['kind']=='file' else directory_snapshot(p)
        check('current generated full identity '+p.name,actual==row['snapshot'])
    prior=b['outputIsolation']['outputs'][0]['before']; new=generated[0]['snapshot']
    failed=load(BASE/'android-smart-u-build04/android-attempt01/result.json')
    check('old failed04 output preserved with original inode',prior==failed['generatedOutputs'][0]['snapshot'] and failed['offlineMarkerMissing'] is True and failed['exitCode']==0)
    check('new05 distinct inode despite identical bytes',prior['device']==new['device'] and prior['inode']==29383214 and new['inode']==29389444 and prior['inode']!=new['inode'] and prior['sha256']==new['sha256']==APK_SHA)
    apk=ART/'android-original.apk'; identity=ident(apk)
    check('exact preserved new APK',identity['bytes']==179247354 and identity['sha256']==APK_SHA and absolute_ident(apk)==c['preservedApk'])
    check('new output/collector exact identity',absolute_ident(Path(generated[0]['source']))==b['buildOutputIdentity']==c['apk'] and all(x['bytes']==identity['bytes'] and x['sha256']==APK_SHA for x in [new,b['buildOutputIdentity'],c['apk']]))
    check('current complete dist matches generated record',tree(ROOT/'dist')==b['dist']==generated[1]['snapshot']['files'])
    rows=[]; elf=[]
    with zipfile.ZipFile(apk) as z:
        items=z.infolist()
        check('APK no duplicate ZIP names',len(items)==len({i.filename for i in items}))
        for item in sorted(items,key=lambda x:x.filename):
            if item.is_dir():continue
            with z.open(item) as stream: sha=hash_stream(stream)
            rows.append(dict(path=item.filename,bytes=item.file_size,compressedBytes=item.compress_size,sha256=sha))
            if item.filename.startswith('lib/') and item.filename.endswith('.so'):
                with z.open(item) as stream:header=stream.read(20)
                check('ELF64 AArch64 '+item.filename,header[:6]==b'\x7fELF\x02\x01' and struct.unpack_from('<H',header,18)[0]==183)
                elf.append(item.filename)
    check('all1066 APK entries streamed with CRC/hash',len(rows)==1066 and rows==c['allZipEntries'])
    models=[r for r in rows if r['path'].startswith('assets/mlkit-google-ocr-models/')]
    modelmap={r['path']:(r['bytes'],r['sha256']) for r in models}
    expected={r['path']:(r['bytes'],r['sha256']) for aar in f['ocrCache'] for r in aar['models']}
    check('all25 model identities vs frozen AAR records',len(models)==len(expected)==25 and modelmap==expected and models==c['ocrModels'] and sum(r['bytes'] for r in models)==c['ocrModelBytes']==2490310 and c['ocrModelsExactlyMatchCachedAars'] is True)
    check('arm64 only and four real ELF libraries',sorted({p.split('/')[1] for p in elf})==c['abis']==['arm64-v8a'] and len(elf)==4 and 'lib/arm64-v8a/libnotes_clone_lib.so' in elf)
    sig=c['signature']
    check('signature raw log exact linkage',c['commands']==[sig] and sig['argv']==[expected_env['ANDROID_HOME']+'/build-tools/36.0.0/apksigner','verify','--verbose','--print-certs',str(apk)] and Path(sig['log'])==ART/'command-01.txt' and Path(sig['log']).read_text()==sig['stdout'])
    check('recorded signature success and resource gates',sig['exitCode']==0 and sig['ownedGroupStopped'] is True and sig['remainingOwnedGroupMembers']==[] and sig['minimumFreeBytes']>=2*1024**3 and sig['elapsedSeconds']<600 and 'Verified using v2 scheme (APK Signature Scheme v2): true' in sig['stdout'] and c['signerCertificateSha256']==[CERT])
    v2=v2_certificates(apk)
    check('current v2 certificate DER matches expected signer',[[x['sha256'] for x in signer] for signer in v2['signerCertificates']]==[[CERT]])
    old_record=load(ROOT/'docs/verification/unified-candidate04-android-install-01/03-host-apk-identity.json')
    old_apk=Path(old_record['apk']['path'])
    check('candidate04 preserved APK identity',absolute_ident(old_apk)==old_record['apk'])
    old_v2=v2_certificates(old_apk)
    check('candidate04 current certificate identity compatible',old_v2['signerCertificates']==v2['signerCertificates'] and c['candidate04UpgradeCertificateMatches'] is True)
    fresh=fresh_verify(apk,expected_env)
    mac=load(BASE/'mac-smart-u-build09/mac-attempt01/collection/result.json')
    for name,key in [('original','sourceApp'),('sealed','derivedApp')]:
        p=ROOT/'artifacts/unified-candidate06/mac-smart-u-build09/mac-attempt01'/('mac-'+name+'.app')
        check('historical Mac complete app unchanged '+name,tree(p)==mac[name]['bundleFiles'] and aggregate(tree(p))==mac[name]['bundleAggregate'])
    check('all protected author/historical files unchanged',all(ident(ROOT/r['path'])==r for r in initial))
    check('exact HEAD at close',subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()==SOURCE)
    record('input-close.json',dict(sourceHead=SOURCE,protectedFileCount=len(initial),protectedChanged=[],currentInputCount=len(current),currentInputsChanged=[],minimumFreeBytes=shutil.disk_usage(OUT).free))
    result=dict(schema=1,startedAt=started,endedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),conclusion='PASS: accurate Android05 APK source/input/init/output/ABI/model/signature gates only',sourceHead=SOURCE,freezeSha256=FREEZE,checks=checks,inputFiles=320,productFiles=301,productAggregate=f['productAggregate'],inputAggregate=f['aggregate'],apk=identity,zipEntryCount=len(rows),zipEntryAggregate=aggregate(rows),abis=['arm64-v8a'],elfLibraries=elf,modelCount=len(models),modelBytes=sum(r['bytes'] for r in models),models=models,rawInitMarkers=markers,rawBuildLog=ident(ATTEMPT/'build.txt'),priorFailed04Inode=prior['inode'],fresh05Inode=new['inode'],v2CertificateParse=v2,candidate04CertificateParse=old_v2,freshSignatureCheck=ident(OUT/'fresh-signature-check.json'),protectedFiles=len(initial),limits='No build, Gradle, version, product tests, GUI/ADB/install or cache/target traversal. Only exact final APK output path read. Frozen cache/environment/tool/version records compared across all snapshots, not re-probed. AAR model identity comparison uses frozen AAR model records. Embedded compressed frontend is not independently decoded/rebuilt. Certificate compatibility does not prove on-device upgrade, runtime, offline OCR, native input, audio, persistence or pixel fidelity.',stop=True,sharedTargetAndCache='not acquired or used; released')
    record('result.json',result)
    print(json.dumps({'conclusion':result['conclusion'],'checks':len(checks),'protectedFiles':len(initial),'result':ident(OUT/'result.json')},ensure_ascii=False))

if __name__=='__main__':
    try:
        main()
    except BaseException as error:
        record('attempt01-failure.json',{'error':repr(error),'checks':checks})
        raise
