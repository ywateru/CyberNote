from pathlib import Path
import hashlib,json,shutil,subprocess
ROOT=Path('/Users/water/work/2026/Apple-Notes-Clone');OUT=ROOT/'docs/verification/candidate04-android-runtime-01'
assert shutil.disk_usage(ROOT).free>=2*1024**3
ADB='/Applications/极空间.app/Contents/Resources/app.asar.unpacked/bin/platform-tools/adb'
host=ROOT/'docs/verification/qa-scan-plugin/chinese-fixture.png';remote='/sdcard/Download/notes-clone-qa/candidate04-runtime-20261104A-chinese-fixture.png'
expected='53e4caa8f5d48a7a3bbb55ba0b72b93a33bf3def9418142edbbe9f8a35facda9'
assert host.stat().st_size==70361 and hashlib.sha256(host.read_bytes()).hexdigest()==expected
events=[]
def run(args,allowed=(0,)):
 p=subprocess.run([ADB,'-s','emulator-5580']+args,capture_output=True,timeout=25)
 r={'args':args,'exit':p.returncode,'stdout':p.stdout.decode(),'stderr':p.stderr.decode()};events.append(r);assert p.returncode in allowed,r
 return r
exists=run(['shell','test','-e',remote],(0,1))['exit']==0
if not exists:
 run(['shell','mkdir','-p','/sdcard/Download/notes-clone-qa'])
 run(['push',str(host),remote])
size=int(run(['shell','stat','-c','%s',remote])['stdout'].strip());digest=run(['shell','sha256sum',remote])['stdout'].split()[0]
assert size==70361 and digest==expected
r={'host':str(host),'remote':remote,'existedBefore':exists,'pushed':not exists,'bytes':size,'sha256':digest,'events':events}
(OUT/'12-ocr-fixture.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
