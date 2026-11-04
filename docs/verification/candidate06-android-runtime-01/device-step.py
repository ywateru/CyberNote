"""Declared actions and screenshot/tree on the one authorized clone emulator."""
from pathlib import Path
import datetime,hashlib,json,re,shutil,subprocess,sys
ROOT=Path('/Users/water/work/2026/Apple-Notes-Clone');OUT=ROOT/'docs/verification/candidate06-android-runtime-01'
ADB='/Applications/极空间.app/Contents/Resources/app.asar.unpacked/bin/platform-tools/adb'
assert shutil.disk_usage(ROOT).free>=2*1024**3
tag=sys.argv[1];assert re.fullmatch('[a-zA-Z0-9_-]+',tag)
commands=json.loads(sys.argv[2]) if len(sys.argv)>2 else [];events=[]
def run(args,binary=False,allowed=(0,)):
 p=subprocess.run([ADB,'-s','emulator-5580']+args,capture_output=True,timeout=25)
 out={'bytes':len(p.stdout),'sha256':hashlib.sha256(p.stdout).hexdigest()} if binary else p.stdout.decode(errors='replace')
 events.append({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'args':args,'exitCode':p.returncode,'stdout':out,'stderr':p.stderr.decode(errors='replace')})
 assert p.returncode in allowed,events[-1]
 return p.stdout
try:
 for args in commands:run(args)
 with (OUT/(tag+'.png')).open('xb') as f:f.write(run(['exec-out','screencap','-p'],True))
 if '--skip-tree' not in sys.argv:
  remote='/data/local/tmp/notes-clone-c06-'+tag+'.xml'
  try:
   run(['shell','uiautomator','dump',remote])
   with (OUT/(tag+'.xml')).open('xb') as f:f.write(run(['exec-out','cat',remote],True))
  except (AssertionError,subprocess.TimeoutExpired) as ex:
   (OUT/(tag+'.dump-error.txt')).write_text(repr(ex)+'\n')
 run(['shell','pidof','com.local.notesclone'],allowed=(0,1))
finally:
 with (OUT/(tag+'-actions.json')).open('x') as f:f.write(json.dumps(events,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'tag':tag,'events':events},ensure_ascii=False))
