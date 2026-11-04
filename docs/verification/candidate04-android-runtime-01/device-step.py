"""Bounded ADB actions/evidence on the one authorized clone emulator."""
from pathlib import Path
import datetime,hashlib,json,shutil,subprocess,sys
ROOT=Path('/Users/water/work/2026/Apple-Notes-Clone')
OUT=ROOT/'docs/verification/candidate04-android-runtime-01'
ADB='/Applications/极空间.app/Contents/Resources/app.asar.unpacked/bin/platform-tools/adb'
assert shutil.disk_usage(ROOT).free>=2*1024**3, 'Host free space below 2GiB'
tag=sys.argv[1]
assert all(c.isalnum() or c in '-_' for c in tag)
commands=json.loads(sys.argv[2]) if len(sys.argv)>2 else []
events=[]
def run(args, binary=False, timeout=25):
 p=subprocess.run([ADB,'-s','emulator-5580']+args,capture_output=True,timeout=timeout)
 if not binary:
  output=p.stdout.decode(errors='replace')
  if args[:2]==['exec-out','cat']:output={'savedAs':f'{tag}.xml','bytes':len(p.stdout),'sha256':hashlib.sha256(p.stdout).hexdigest()}
  events.append({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'args':args,'exit':p.returncode,'stdout':output,'stderr':p.stderr.decode(errors='replace')})
 assert p.returncode==0, str(events[-1] if events else p.stderr)
 return p.stdout
try:
 for args in commands:run(args)
 device_xml=f'/data/local/tmp/notes-clone-c04-{tag}.xml'
 (OUT/f'{tag}.png').write_bytes(run(['exec-out','screencap','-p'],True))
 if '--skip-tree' not in sys.argv:
  try:
   (OUT/f'{tag}.dump-log.txt').write_bytes(run(['shell','uiautomator','dump',device_xml]))
   (OUT/f'{tag}.xml').write_bytes(run(['exec-out','cat',device_xml]))
  except AssertionError as e:
   (OUT/f'{tag}.dump-error.txt').write_text(str(e)+'\n')
 run(['shell','pidof','com.local.notesclone'])
finally:
 (OUT/f'{tag}-actions.json').write_text(json.dumps(events,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'tag':tag,'pngBytes':(OUT/f'{tag}.png').stat().st_size,'events':events},ensure_ascii=False))
