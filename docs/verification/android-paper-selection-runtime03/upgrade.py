from pathlib import Path
import json,subprocess,hashlib,datetime,shutil
R=Path.cwd();O=R/'docs/verification/android-paper-selection-runtime03';A='/Applications/极空间.app/Contents/Resources/app.asar.unpacked/bin/platform-tools/adb';serial='emulator-5580';apk=R/'artifacts/unified-candidate06/android-paper-selection-build03/android-attempt01/android-original.apk';events=[]
def run(args,timeout=25):
 p=subprocess.run([A,'-s',serial]+args,capture_output=True,text=True,timeout=timeout);events.append(dict(at=datetime.datetime.now(datetime.timezone.utc).isoformat(),args=args,exitCode=p.returncode,stdout=p.stdout,stderr=p.stderr));assert p.returncode==0,events[-1];return p.stdout
result=dict(serial=serial,package='com.local.notesclone',artifactGate='docs/verification/unified-candidate06/android-paper-selection-independent03/artifact-gate.json')
try:
 gate=json.loads((R/result['artifactGate']).read_text());assert gate['status']=='PASS' and gate['newCryptographicSignatureVerifyPassed'] and gate['cssAndJsExactlyDecodedFromSignedApk'];assert apk.stat().st_size==177445114 and hashlib.sha256(apk.read_bytes()).hexdigest()==gate['apkSha256'];assert shutil.disk_usage(R).free>=2*1024**3
 assert run(['get-state']).strip()=='device';assert run(['shell','getprop','ro.kernel.qemu']).strip()=='1';path=run(['shell','pm','path','com.local.notesclone']).strip()[8:];assert run(['shell','sha256sum',path]).split()[0]=='843e0c01aad154872851664ced574e1fa07544d8fcf874022698c37a3ee160f8';run(['shell','df','-k','/data'])
 assert 'Success' in run(['install','-r',str(apk)],timeout=60);result['status']='PASS'
except BaseException as e:result['status']='FAIL_STOP';result['error']=repr(e)
result['events']=events;(O/'05-install-retain-data.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2));assert result['status']=='PASS'
