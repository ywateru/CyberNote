"""Bounded authorized preserve-data Android08 upgrade and real input capture; no DB access."""
from pathlib import Path
import datetime, hashlib, json, re, shlex, shutil, subprocess, sys, time
ROOT=Path('/Users/water/work/2026/Apple-Notes-Clone')
OUT=ROOT/'docs/verification/android-compose-anchor-runtime36'
ADB='/Users/water/Library/Android/sdk/platform-tools/adb'
SERIAL='emulator-5580';PKG='com.local.notesclone'
APK=ROOT/'artifacts/unified-candidate06/android-compose-anchor-build08/android-attempt01/android-original.apk'
OLD='e19965fd97c45ac3184e569777146d68b4d312bd561bbb2862d27ad93c6a86c6'
NEW='a7ba557478e42da0a7f0e387a772bf764b067bfe082553e765603ca700385632'
tag,mode=sys.argv[1:3]
assert re.fullmatch('[a-z0-9-]+',tag)
record={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'serial':SERIAL,'package':PKG,'mode':mode,'events':[]}
def run(args,binary=False,allowed=(0,),timeout=20):
    start=time.monotonic()
    try:p=subprocess.run([ADB,'-s',SERIAL]+args,capture_output=True,timeout=timeout)
    except BaseException as e:
        record['events'].append({'args':args,'error':repr(e),'deadlineSeconds':timeout});raise
    record['events'].append({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'args':args,'exitCode':p.returncode,'elapsedSeconds':round(time.monotonic()-start,3),'deadlineSeconds':timeout,'stdout':{'bytes':len(p.stdout),'sha256':hashlib.sha256(p.stdout).hexdigest()}if binary else p.stdout.decode(errors='replace'),'stderr':p.stderr.decode(errors='replace')})
    assert p.returncode in allowed, record['events'][-1]
    return p.stdout
def identity(expected):
    assert run(['get-state']).strip()==b'device'
    assert run(['shell','getprop','ro.kernel.qemu']).strip()==b'1'
    paths=run(['shell','pm','path',PKG]).decode().strip().splitlines()
    assert len(paths)==1 and paths[0].startswith('package:/data/app/') and paths[0].endswith('/base.apk')
    path=paths[0][8:]
    size=int(run(['shell','stat','-c','%s',path]).strip())
    sha=run(['shell','sha256sum',path]).decode().split()[0]
    assert (size,sha)==(179247354,expected),(size,sha)
    dump=run(['shell','dumpsys','package',PKG]).decode()
    fields={k:re.search(r'^\s*'+k+r'=(.*)$',dump,re.M).group(1)for k in ['userId','firstInstallTime','lastUpdateTime']}
    return {'path':path,'bytes':size,'sha256':sha,'packageFields':fields,'pid':run(['shell','pidof',PKG],allowed=(0,1)).decode().strip()}
def capture():
    png=run(['exec-out','screencap','-p'],binary=True)
    assert png.startswith(b'\x89PNG\r\n\x1a\n')
    p=OUT/(tag+'.png')
    with p.open('xb') as s:s.write(png)
    record['png']={'path':str(p.relative_to(ROOT)),'bytes':len(png),'sha256':hashlib.sha256(png).hexdigest()}
try:
    record['hostFreeBytes']=shutil.disk_usage(ROOT).free
    assert record['hostFreeBytes']>=2*1024**3
    if mode=='old-identity':record['identity']=identity(OLD)
    elif mode=='new-identity':record['identity']=identity(NEW)
    elif mode=='capture':
        for action in json.loads(sys.argv[3])if len(sys.argv)>3 else []:
            if action[0]=='wait':
                assert 0<=float(action[1])<=2;time.sleep(float(action[1]));record['events'].append({'waitSeconds':float(action[1])});continue
            assert action[0]=='input'and action[1]in ['tap','keyevent','swipe']
            run(['shell',shlex.join([str(value) for value in action])])
        time.sleep(.35);capture()
    elif mode=='upgrade':
        before=identity(OLD);record['before']=before
        g=ROOT/'docs/verification/unified-candidate06/android-compose-anchor-independent08/result.json'
        gate=json.loads(g.read_text());assert gate['status']=='pass' and gate['stop'] and gate['assertions']==403 and gate['apk']['sha256']==NEW
        assert APK.stat().st_size==179247354 and hashlib.sha256(APK.read_bytes()).hexdigest()==NEW
        record['gate']={'path':str(g.relative_to(ROOT)),'sha256':hashlib.sha256(g.read_bytes()).hexdigest()}
        assert b'Success' in run(['install','-r',str(APK)],timeout=90)
        after=identity(NEW);record['after']=after
        record['identityPreserved']=all(before['packageFields'][k]==after['packageFields'][k]for k in ['userId','firstInstallTime']);assert record['identityPreserved']
    elif mode=='launch':
        run(['shell','am','start','-W','-n',PKG+'/.MainActivity']);time.sleep(1.2);record['pid']=run(['shell','pidof',PKG]).decode().strip();capture()
    elif mode=='restart':
        record['oldPid']=run(['shell','pidof',PKG]).decode().strip();run(['shell','am','force-stop',PKG]);record['stoppedPid']=run(['shell','pidof',PKG],allowed=(0,1)).decode().strip();assert not record['stoppedPid'];run(['shell','am','start','-W','-n',PKG+'/.MainActivity']);time.sleep(1.2);record['newPid']=run(['shell','pidof',PKG]).decode().strip();assert record['newPid']and record['oldPid']!=record['newPid'];capture()
    else:raise ValueError(mode)
    record['status']='PASS'
except BaseException as e:record['status']='FAIL_STOP';record['error']=repr(e)
finally:
    record['endedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
    with (OUT/(tag+'.json')).open('x') as s:json.dump(record,s,ensure_ascii=False,indent=2);s.write('\n')
    print(json.dumps({k:v for k,v in record.items()if k not in ['events']},ensure_ascii=False))
sys.exit(0 if record['status']=='PASS'else 1)
