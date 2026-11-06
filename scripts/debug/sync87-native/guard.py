#!/usr/bin/env python3
"""Owned-device-only native acceptance. No generic ADB/shell passthrough."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import zipfile

ROOT = Path('/private/tmp/apple-notes-sync87-environment-01')
SERIAL, AVD, PACKAGE = 'emulator-5584', 'notes-sync87-isolated', 'com.local.notesclone'
ADB = '/Applications/极空间.app/Contents/Resources/app.asar.unpacked/bin/platform-tools/adb'
DEVICE = '/sdcard/Download/notes-sync87-'
MODULE = Path(__file__).resolve().parents[1] / 'sync87-environment/lifecycle.py'
class Refused(RuntimeError): pass

def require(ok, reason):
    if not ok: raise Refused(reason)

def target(serial, avd):
    require(serial == SERIAL and avd == AVD, 'explicit isolated serial and AVD required')

def stream_hash(stream):
    digest=hashlib.sha256()
    for block in iter(lambda:stream.read(1024*1024),b''):digest.update(block)
    return digest.hexdigest()

def receipt(path):
    p = Path(path)
    require(p.is_absolute() and p.is_file() and not p.is_symlink(), 'receipt must be an absolute direct file')
    obj = json.loads(p.read_text())
    required = {'authorizedBy','apk','sha256','sourceCommit','buildLabel','package','activity','entries'}
    require(type(obj) is dict and set(obj) == required, 'receipt fields mismatch')
    require(obj['authorizedBy'] == 'root-sync87-package-review', 'root package review receipt required')
    require(obj['package'] == PACKAGE and obj['activity'] == '.MainActivity', 'unexpected application identity')
    require(type(obj['buildLabel']) is str and re.fullmatch(r'Android[1-9][0-9]*', obj['buildLabel']) and int(obj['buildLabel'][7:]) >= 17, 'new sync build label required')
    require(type(obj['sourceCommit']) is str and re.fullmatch(r'[0-9a-f]{40}', obj['sourceCommit']), 'full source commit required')
    require(type(obj['sha256']) is str and re.fullmatch(r'[0-9a-f]{64}',obj['sha256']), 'full APK hash required')
    apk = Path(obj['apk'])
    require(apk.is_absolute() and apk.suffix == '.apk' and apk.is_file() and not apk.is_symlink(), 'absolute reviewed APK required')
    with apk.open('rb') as stream:actual=stream_hash(stream)
    require(actual == obj['sha256'], 'APK hash changed')
    require(type(obj['entries']) is dict and obj['entries'], 'reviewed actual ZIP entries required')
    with zipfile.ZipFile(apk) as z:
        for name, expected in obj['entries'].items():
            require(type(name) is str and not name.startswith('/') and '..' not in name.split('/') and name in z.namelist(), 'APK entry missing or unsafe')
            require(type(expected) is str and re.fullmatch(r'[0-9a-f]{64}',expected), 'entry hash malformed')
            with z.open(name) as entry:
                actual = stream_hash(entry)
            require(actual == expected, 'APK entry hash changed: '+name)
        require(any(name.startswith('lib/arm64-v8a/') and name.endswith('.so') for name in obj['entries']), 'reviewed arm64 native library required')
    return obj

def install_result(value):
    require(value in ('Success', 'Performing Streamed Install\nSuccess'), 'installation did not report Success')
    return value

def installed_apk_path(value):
    # Android 11 uses a randomized ~~token parent; bind the app directory to this package.
    pattern = r'package:/data/app/(?:~~[A-Za-z0-9_=+-]+/)?' + re.escape(PACKAGE) + r'-[A-Za-z0-9_=+-]+/base\.apk'
    require(type(value) is str and re.fullmatch(pattern, value), 'unexpected installed APK path')
    return value[len('package:'):]

def owned_file(path):
    p = Path(path)
    require(p.is_absolute() and p.is_file() and not p.is_symlink(), 'direct host fixture file required')
    require(re.fullmatch(r'sync87-[a-z0-9-]+\.(png|txt|wav)',p.name), 'synthetic fixture filename required')
    require(p.stat().st_size <= 8*1024*1024, 'fixture exceeds 8MiB')
    return p

def device_path(value, *, file=True):
    require(type(value) is str and re.fullmatch(r'/sdcard/Download/notes-sync87-[a-z0-9-]+(?:/sync87-[a-z0-9-]+\.(?:png|txt|wav))?' ,value), 'only this synthetic Download subtree allowed')
    require(not file or value.count('/') == 4, 'synthetic file path required')
    return value

def run_scope(path):
    p=Path(path)
    require(p.is_absolute() and re.fullmatch(r'/private/tmp/notes-sync87-native-[a-z0-9-]+/state.json',str(p)), 'exact owned run-state path required')
    require(p.is_file() and not p.is_symlink() and p.parent.is_dir() and not p.parent.is_symlink() and p.resolve()==p, 'run state must be a confined direct file')
    state=json.loads(p.read_text())
    require(type(state) is dict and state.get('version')==1 and state.get('serial')==SERIAL and state.get('avd')==AVD, 'run state identity mismatch')
    ident=state.get('runId')
    require(type(ident) is str and re.fullmatch(r'[0-9a-f]{10}',ident), 'synthetic run id required')
    require(state.get('remote')=='/sdcard/Download/notes-sync87-'+ident, 'run remote directory mismatch')
    require(type(state.get('files')) is list and type(state.get('desktopFiles',[])) is list, 'fixture lists required')
    files=state['files']+state.get('desktopFiles',[])
    require(len(files) in (3,5), 'synthetic fixture manifest required')
    seen=set()
    for f in files:
        require(type(f) is dict and set(f)=={'name','path','remote','sha256','bytes'}, 'fixture manifest fields mismatch')
        name=f['name']
        require(type(name) is str and re.fullmatch(r'sync87-(?:desktop-)?'+ident+r'\.(?:png|txt|wav)',name) and name not in seen, 'fixture does not belong to this run')
        seen.add(name)
        require(f['path']==str(p.parent/name) and f['remote']==state['remote']+'/'+name, 'fixture path differs from owned run')
        require(type(f['bytes']) is int and 0<f['bytes']<=8*1024*1024 and type(f['sha256']) is str and re.fullmatch(r'[0-9a-f]{64}',f['sha256']), 'fixture size/hash malformed')
        direct=owned_file(f['path'])
        with direct.open('rb') as stream: actual=stream_hash(stream)
        require(direct.stat().st_size==f['bytes'] and actual==f['sha256'], 'host fixture changed')
    return p.parent,state,files

def export_scope(path,index,name):
    root,state,files=run_scope(path)
    require(type(index) is int and 1<=index<=20, 'export index must be1..20')
    found=[f for f in files if f['name']==name]
    require(len(found)==1, 'export filename must identify a known original fixture')
    folder='exports-'+str(index)
    return root/folder, state['remote']+'/'+folder, found[0]

def run(argv, timeout=15, binary=False):
    started=time.monotonic()
    r=subprocess.run(argv,capture_output=True,timeout=timeout)
    require(r.returncode == 0, 'bounded subprocess failed '+str(r.returncode)+': '+r.stderr.decode(errors='replace')[:500])
    return r.stdout if binary else r.stdout.decode(errors='strict').strip()

def ownership(serial,avd):
    target(serial,avd)
    spec=importlib.util.spec_from_file_location('sync87_environment_guard',MODULE)
    env=importlib.util.module_from_spec(spec);spec.loader.exec_module(env)
    # Environment functions emit diagnostic records to stdout; keep JSON response separate.
    import contextlib
    with contextlib.redirect_stdout(sys.stderr):
        env.validate_target(argparse.Namespace(serial=serial,avd=avd))
        state=env.read_state()
        require(state['status']=='ready','owned emulator is not ready')
        env.identity(state,listener=True)
    name=run([ADB,'-s',SERIAL,'emu','avd','name'])
    require(name.splitlines()==[AVD,'OK'],'explicit serial reports different AVD')
    return state

def adb(serial,avd,tail,timeout=15,binary=False):
    ownership(serial,avd)
    return run([ADB,'-s',SERIAL,*tail],timeout,binary)

def app_identity(serial,avd,expected=None):
    raw=adb(serial,avd,['shell','pidof',PACKAGE])
    require(re.fullmatch(r'[1-9][0-9]*',raw),'exactly one app PID required')
    pid=int(raw)
    cmd=adb(serial,avd,['shell','cat',f'/proc/{pid}/cmdline']).rstrip('\0')
    require(cmd==PACKAGE,'app PID command differs')
    stat=adb(serial,avd,['shell','cat',f'/proc/{pid}/stat'])
    # /proc PID comm can contain spaces; fields after closing parenthesis start at field3.
    rest=stat[stat.rfind(')')+2:].split(); start=rest[19]
    result={'pid':pid,'startTicks':start,'package':PACKAGE}
    require(expected is None or result==expected,'app PID lifetime changed; reconnect required')
    return result

PICKER_KEYS = {'TAB': '61', 'DPAD_DOWN': '20', 'DPAD_UP': '19', 'DPAD_CENTER': '23', 'ENTER': '66', 'SPACE': '62'}
PICKER_COMPONENT = r'(?:com\.google\.android\.documentsui|com\.android\.documentsui)/com\.android\.documentsui\.picker\.PickActivity'
COUNTS_DEX = Path('/private/tmp/notes-sync87-native-counts-helper01/dex/classes.dex')
COUNTS_DEX_SHA256 = 'f98199e0a4bc9432760fa47eee2f0c0baa0c17edd5278172f9059f0776fff2a3'
COUNTS_SOURCE_SHA256 = 'daa1d8c584715070f7b1a4a95d0c600be25d393e061cdb6def0b1a92780bc5d9'
def counts_preflight(state_path,expected):
    require(type(expected) is dict and set(expected)=={'pid','startTicks','package'} and type(expected['pid']) is int and expected['pid']>1 and expected['package']==PACKAGE and type(expected['startTicks']) is str and re.fullmatch(r'[0-9]+',expected['startTicks']), 'exact app lifetime required for readonly counts')
    require(state_path=='/private/tmp/notes-sync87-native-final-02/state.json','exact final02 state required')
    p=Path(state_path);require(p.is_file() and not p.is_symlink() and p.resolve()==p,'direct final02 state required')
    s=json.loads(p.read_text());require(s.get('version')==1 and s.get('runId')=='74da049123' and s.get('serial')==SERIAL and s.get('avd')==AVD and any(n.get('id')=='256cf1ef-b7c6-4c1e-a8ab-31cb5e6be460' for n in s.get('notes',[])), 'known final02 scenario required')
    source=Path(__file__).resolve().parent/'android/SyncTargetCounts.java'
    for path,digest in [(source,COUNTS_SOURCE_SHA256),(COUNTS_DEX,COUNTS_DEX_SHA256)]:
        require(path.is_file() and not path.is_symlink() and path.resolve()==path,'direct reviewed helper required')
        require(hashlib.sha256(path.read_bytes()).hexdigest()==digest,'reviewed helper changed')
def counts_result(value):
    try:r=json.loads(value)
    except Exception:raise Refused('readonly counts returned invalid JSON') from None
    require(type(r) is dict and set(r)=={'ok','counts'} and r['ok'] is True and type(r['counts']) is dict and set(r['counts'])=={'inboxTotal','targetInbox','targetNotes','targetProjection','targetSeen'},'readonly counts schema mismatch')
    require(all(type(n) is int and 0<=n<=2147483647 for n in r['counts'].values()),'readonly counts must be bounded integers')
    return r['counts']

def picker_key(foreground, key):
    require(type(key) is str and key in PICKER_KEYS, 'fixed picker navigation key required')
    require(type(foreground) is str, 'actual picker foreground required')
    resumed_lines = [line.strip() for line in foreground.splitlines() if re.match(r'^\s*mResumedActivity\s*:', line)]
    focused_lines = [line.strip() for line in foreground.splitlines() if re.match(r'^\s*mCurrentFocus\s*=', line)]
    require(len(resumed_lines) == 1, 'exactly one resumed activity field required')
    require(len(focused_lines) == 1, 'exactly one current focus field required')
    resumed = re.fullmatch(r'mResumedActivity: ActivityRecord\{[0-9a-f]+ u0 (' + PICKER_COMPONENT + r') t[0-9]+\}', resumed_lines[0])
    focused = re.fullmatch(r'mCurrentFocus=Window\{[0-9a-f]+ u0 (' + PICKER_COMPONENT + r')\}', focused_lines[0])
    require(resumed is not None, 'exact DocumentsUI resumed picker required')
    require(focused is not None and focused[1] == resumed[1], 'exact DocumentsUI focused picker required')
    return PICKER_KEYS[key]

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--serial',required=True);p.add_argument('--avd',required=True)
    p.add_argument('operation',choices=['status','install','start','stop','home','back','identity','tap','hold','uia','ime','push','pull','forward','unforward','verify-app','foreground','screenshot','installed','prepare-export','checkpoint','picker-key','sync-target-counts'])
    p.add_argument('--key');p.add_argument('--run-state');p.add_argument('--export-index',type=int);p.add_argument('--name');p.add_argument('--receipt');p.add_argument('--path');p.add_argument('--remote');p.add_argument('--x',type=int);p.add_argument('--y',type=int);p.add_argument('--port',type=int);p.add_argument('--app-identity')
    a=p.parse_args();target(a.serial,a.avd)
    invoke=lambda tail,**kw:adb(a.serial,a.avd,tail,**kw)
    result=None
    if a.operation=='install':
        reviewed=receipt(a.receipt)
        result=invoke(['install','-r',reviewed['apk']],timeout=60)
        install_result(result)
        result={'installed':True,'sha256':reviewed['sha256'],'sourceCommit':reviewed['sourceCommit'],'buildLabel':reviewed['buildLabel']}
    elif a.operation=='status':result={'emulator':ownership(a.serial,a.avd)}
    elif a.operation in ('start','installed'):
        reviewed=receipt(a.receipt)
        location=invoke(['shell','pm','path',PACKAGE])
        apk_path=installed_apk_path(location)
        payload=invoke(['exec-out','cat',apk_path],binary=True)
        require(hashlib.sha256(payload).hexdigest()==reviewed['sha256'],'installed package differs from reviewed APK')
        result={'sha256':reviewed['sha256']}
        if a.operation=='start':result=invoke(['shell','am','start','-W','-n',PACKAGE+'/.MainActivity'])
    elif a.operation=='stop':result=invoke(['shell','am','force-stop',PACKAGE])
    elif a.operation in ('identity','verify-app'):
        expected=json.loads(a.app_identity) if a.app_identity else None
        if a.operation=='verify-app':require(expected is not None,'exact app identity required')
        result=app_identity(a.serial,a.avd,expected)
    elif a.operation in ('home','back'):result=invoke(['shell','input','keyevent','3' if a.operation=='home' else '4'])
    elif a.operation in ('tap','hold'):
        require(type(a.x) is int and type(a.y) is int and 0<=a.x<720 and 0<=a.y<1280,'tap outside fixed isolated 720x1280 display')
        args=['shell','input','tap',str(a.x),str(a.y)] if a.operation=='tap' else ['shell','input','swipe',str(a.x),str(a.y),str(a.x),str(a.y),'700']
        result=invoke(args)
    elif a.operation=='uia':
        invoke(['shell','uiautomator','dump','/data/local/tmp/notes-sync87-uia.xml'],timeout=25)
        result=invoke(['exec-out','cat','/data/local/tmp/notes-sync87-uia.xml'])
    elif a.operation=='ime':result=invoke(['shell','dumpsys','input_method'])
    elif a.operation=='screenshot':
        dst=Path(a.path)
        require(dst.is_absolute() and not dst.exists() and dst.suffix=='.png' and dst.parent.is_dir() and not dst.parent.is_symlink(),'new absolute PNG output required')
        dst.write_bytes(invoke(['exec-out','screencap','-p'],binary=True));result={'bytes':dst.stat().st_size}
    elif a.operation=='foreground':result=invoke(['shell','dumpsys','activity','activities'])
    elif a.operation=='push':
        root,state,files=run_scope(a.run_state)
        found=[f for f in files if f['path']==a.path and f['remote']==a.remote]
        require(len(found)==1, 'push must match this exact run fixture')
        src=owned_file(a.path);dst=device_path(a.remote)
        invoke(['shell','mkdir','-p',state['remote']])
        result=invoke(['push',str(src),dst])
    elif a.operation in ('prepare-export','pull'):
        local,remote,fixture=export_scope(a.run_state,a.export_index,a.name)
        source=remote+'/'+fixture['name'];target_file=local/fixture['name']
        if a.operation=='prepare-export':
            require(not local.exists() and not local.is_symlink(), 'export directory must be new')
            local.mkdir(mode=0o700)
            invoke(['shell','mkdir',remote])
            invoke(['shell','test','-d',remote]);invoke(['shell','test','!','-L',remote])
            invoke(['shell','test','!','-e',source])
            result={'remoteDirectory':remote,'localDirectory':str(local),'name':fixture['name']}
        else:
            require(local.is_dir() and not local.is_symlink() and local.resolve()==local and not target_file.exists() and not target_file.is_symlink(), 'new output inside exact owned export directory required')
            require(a.path==str(target_file) and a.remote==source, 'pull path differs from exact run/index/original')
            invoke(['shell','test','!','-L',remote]);invoke(['shell','test','!','-L',source]);invoke(['shell','test','-f',source])
            size=invoke(['shell','stat','-c','%s',source]);require(size==str(fixture['bytes']), 'exported size differs from original')
            payload=invoke(['exec-out','cat',source],binary=True)
            actual=hashlib.sha256(payload).hexdigest()
            require(len(payload)==fixture['bytes'] and actual==fixture['sha256'], 'exported original bytes differ')
            fd=os.open(target_file,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
            with os.fdopen(fd,'wb') as stream:stream.write(payload);stream.flush();os.fsync(stream.fileno())
            result={'path':str(target_file),'bytes':len(payload),'sha256':actual,'originalBytesVerified':True}
    elif a.operation=='sync-target-counts':
        expected=json.loads(a.app_identity) if a.app_identity else None;counts_preflight(a.run_state,expected)
        before=app_identity(a.serial,a.avd,expected)
        invoke(['push',str(COUNTS_DEX),'/data/local/tmp/notes-sync87-target-counts.dex'])
        app_identity(a.serial,a.avd,expected)
        try:raw=invoke(['shell','run-as',PACKAGE,'env','CLASSPATH=/data/local/tmp/notes-sync87-target-counts.dex','app_process','/system/bin','SyncTargetCounts'],timeout=15)
        except Exception:raise Refused('readonly counts helper failed') from None
        result={'counts':counts_result(raw),'appIdentityBefore':before,'appIdentityAfter':app_identity(a.serial,a.avd,expected),'fixedSyntheticTarget':True}
    elif a.operation=='picker-key':
        require(type(a.key) is str and a.key in PICKER_KEYS, 'fixed picker navigation key required')
        expected=json.loads(a.app_identity) if a.app_identity else None
        require(type(expected) is dict and set(expected)=={'pid','startTicks','package'} and type(expected['pid']) is int and expected['pid']>1 and expected['package']==PACKAGE and type(expected['startTicks']) is str and re.fullmatch(r'[0-9]+',expected['startTicks']), 'exact app lifetime required for picker navigation')
        before=app_identity(a.serial,a.avd,expected)
        foreground=invoke(['shell','dumpsys','activity','activities'])
        keycode=picker_key(foreground,a.key)
        app_identity(a.serial,a.avd,expected)
        invoke(['shell','input','keyevent',keycode])
        after=app_identity(a.serial,a.avd,expected)
        result={'key':a.key,'appIdentityBefore':before,'appIdentityAfter':after,'pickerForegroundVerified':True}
    elif a.operation=='checkpoint':
        owned=ownership(a.serial,a.avd)
        boot=invoke(['shell','cat','/proc/sys/kernel/random/boot_id'])
        require(re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',boot), 'guest boot identity malformed')
        data=ROOT/'data/userdata-qemu.img';require(data.is_file() and not data.is_symlink(),'owned existing userdata required')
        stat=data.stat();result={'emulatorPid':owned['pid'],'emulatorStart':owned['lstart'],'bootId':boot,'userdataDevice':stat.st_dev,'userdataInode':stat.st_ino,'userdataSize':stat.st_size}
    elif a.operation in ('forward','unforward'):
        require(type(a.port) is int and 19400<=a.port<=19419,'owned CDP port range19400..19419 required')
        expected=json.loads(a.app_identity) if a.app_identity else None
        require(expected is not None,'app lifetime required for forwarding')
        require(type(expected) is dict and set(expected)=={'pid','startTicks','package'} and type(expected['pid']) is int and expected['pid']>1 and expected['package']==PACKAGE and re.fullmatch(r'[0-9]+',expected['startTicks']),'invalid app identity')
        identity=app_identity(a.serial,a.avd,expected) if a.operation=='forward' else expected
        listing=invoke(['forward','--list']).splitlines()
        address='tcp:'+str(a.port);remote='localabstract:webview_devtools_remote_'+str(identity['pid'])
        rows=[line.split() for line in listing if address in line.split()]
        if a.operation=='forward':
            require(not rows,'CDP port already forwarded; refuse takeover')
            result=invoke(['forward','--no-rebind',address,remote])
        else:
            require(rows==[[SERIAL,address,remote]],'forward no longer belongs to this exact app PID')
            result=invoke(['forward','--remove',address])
    print(json.dumps({'ok':True,'operation':a.operation,'result':result},ensure_ascii=False))

if __name__=='__main__':
    try:main()
    except Exception as exc:
        print(json.dumps({'ok':False,'error':type(exc).__name__,'message':str(exc)},ensure_ascii=False));sys.exit(2)
