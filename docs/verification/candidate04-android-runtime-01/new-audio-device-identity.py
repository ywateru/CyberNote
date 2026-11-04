"""Read only size and SHA of the exact new attachment; never transfer audio bytes."""
from pathlib import Path
import datetime,json,shutil,subprocess,sys
ROOT=Path('/Users/water/work/2026/Apple-Notes-Clone')
OUT=ROOT/'docs/verification/candidate04-android-runtime-01'
assert shutil.disk_usage(ROOT).free>=2*1024**3
tag=sys.argv[1];assert all(c.isalnum() or c in '-_' for c in tag)
ADB='/Applications/极空间.app/Contents/Resources/app.asar.unpacked/bin/platform-tools/adb'
PKG='com.local.notesclone'
remote='/data/user/0/com.local.notesclone/attachments/op-109f65df-0ac3-4f50-90e7-12665a22e060-6771077d-eee5-4c9a-875b-e9b7445cf516.blob'
events=[]
def run(args):
 p=subprocess.run([ADB,'-s','emulator-5580']+args,capture_output=True,timeout=20)
 events.append({'args':args,'exit':p.returncode,'stdout':p.stdout.decode().strip(),'stderr':p.stderr.decode(errors='replace')})
 assert p.returncode==0,events[-1]
 return p.stdout.decode().strip()
size=int(run(['shell','run-as',PKG,'stat','-c','%s',remote]))
sha=run(['shell','run-as',PKG,'sha256sum',remote]).split()[0]
assert size==168397
r={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'serial':'emulator-5580','package':PKG,'noteId':'2e1d2253-a332-42cc-85ad-0f66752e6498','attachmentId':'6771077d-eee5-4c9a-875b-e9b7445cf516','remote':remote,'bytes':size,'sha256':sha,'events':events,'scope':'Device-side stat and sha256sum of this exact new attachment only. No audio payload or database transferred.'}
(OUT/f'{tag}-new-audio-device.json').write_text(json.dumps(r,indent=2)+'\n')
print(json.dumps(r))
