"""Finite native-ADB evidence capture; never exports media/database bytes."""
from pathlib import Path
import datetime, hashlib, json, re, shutil, subprocess, sys, time
ROOT=Path('/Users/water/work/2026/Apple-Notes-Clone')
OUT=Path(__file__).resolve().parent
ADB='/Applications/极空间.app/Contents/Resources/app.asar.unpacked/bin/platform-tools/adb'
SERIAL='emulator-5580'; PACKAGE='com.local.notesclone'
tag,mode=sys.argv[1:3]
assert re.fullmatch('[a-z0-9-]+',tag)
record={'serial':SERIAL,'package':PACKAGE,'startedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'events':[]}
def run(args,binary=False,allowed=(0,),global_adb=False):
 p=subprocess.run([ADB]+([] if global_adb else ['-s',SERIAL])+args,capture_output=True,timeout=30)
 record['events'].append({'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'args':args,'globalAdb':global_adb,'exitCode':p.returncode,'stdout':{'bytes':len(p.stdout),'sha256':hashlib.sha256(p.stdout).hexdigest()} if binary else p.stdout.decode(errors='replace'),'stderr':p.stderr.decode(errors='replace')})
 assert p.returncode in allowed, record['events'][-1]
 return p.stdout
def space():
 free=shutil.disk_usage(ROOT).free; assert free>=2*1024**3
 df=run(['shell','df','-k','/data']).decode(); assert int(df.strip().splitlines()[-1].split()[3])*1024>=2*1024**3
 return {'hostFreeBytes':free,'deviceDataDf':df}
try:
 if mode=='preflight':
  record['devices']=run(['devices','-l'],global_adb=True).decode()
 assert run(['get-state']).strip()==b'device'
 record['space']=space()
 if mode=='preflight':
  record['properties']={k:run(['shell','getprop',k]).decode().strip() for k in ['ro.product.model','ro.product.device','ro.kernel.qemu','ro.build.fingerprint']}
  assert record['properties']['ro.product.model']=='sdk_gphone_arm64' and record['properties']['ro.kernel.qemu']=='1'
  paths=run(['shell','pm','path',PACKAGE]).decode().strip().splitlines(); assert len(paths)==1 and paths[0].startswith('package:/data/app/') and paths[0].endswith('/base.apk')
  path=paths[0][8:]; size=int(run(['shell','stat','-c','%s',path]).decode()); sha=run(['shell','sha256sum',path]).decode().split()[0]
  record['installedApk']={'path':path,'bytes':size,'sha256':sha}
  assert (size,sha)==(177445114,'d6350a35374a8fa05c836e26f361dfb3d4834882fd4a360ad7a7ebbedf2d123c')
  dump=run(['shell','dumpsys','package',PACKAGE]).decode()
  record['packageFields']={k:re.search(r'^\s*'+k+r'=(.*)$',dump,re.M).group(1) for k in ['userId','firstInstallTime','lastUpdateTime']}
  assert record['packageFields']=={'userId':'10169','firstInstallTime':'2026-11-03 22:09:17','lastUpdateTime':'2026-11-04 18:41:56'}
  record['deviceDate']=run(['shell','date','+%Y-%m-%dT%H:%M:%S%z']).decode().strip()
 elif mode=='storage':
  # Metadata only: no DB reads, attachment content, hashes or export.
  record['storageMetadata']=run(['shell','run-as',PACKAGE,'find','.','-maxdepth','3','-type','d']).decode()
 elif mode=='attachments':
  record['attachmentDirectoryMetadata']=run(['shell','run-as',PACKAGE,'ls','-ln','attachments']).decode()
 elif mode=='cdp-forward':
  forwards=run(['forward','--list'],global_adb=True).decode();record['forwardsBefore']=forwards
  assert not any('tcp:9237' in line for line in forwards.splitlines())
  pid=run(['shell','pidof',PACKAGE]).decode().strip(); assert re.fullmatch(r'\d+',pid)
  sockets=run(['shell','cat','/proc/net/unix']).decode(); sock='webview_devtools_remote_'+pid
  assert '@'+sock in sockets
  run(['forward','tcp:9237','localabstract:'+sock])
 elif mode=='cdp-remove':
  run(['forward','--remove','tcp:9237'])
  record['forwardsAfter']=run(['forward','--list'],global_adb=True).decode()
 elif mode=='capture':
  commands=json.loads(sys.argv[3]) if len(sys.argv)>3 else []
  for args in commands:
   assert args[:2]==['shell','input'] and args[2] in ['tap','keyevent','text','swipe'],args
   run(args)
  if len(sys.argv)>4:
   delay=float(sys.argv[4]); assert 0<=delay<=25; record['waitSeconds']=delay;time.sleep(delay)
 elif mode=='lifecycle':
  action=sys.argv[3]
  assert action in ['stop','start']
  run(['shell','am','force-stop',PACKAGE] if action=='stop' else ['shell','am','start','-W','-n',PACKAGE+'/.MainActivity'])
  time.sleep(1)
 else: raise ValueError(mode)
 if mode!='lifecycle' or sys.argv[3]!='stop':
  png=run(['exec-out','screencap','-p'],True);assert png.startswith(b'\x89PNG\r\n\x1a\n')
  with (OUT/(tag+'.png')).open('xb') as f:f.write(png)
  record['png']={'path':tag+'.png','bytes':len(png),'sha256':hashlib.sha256(png).hexdigest()}
 record['pidof']=run(['shell','pidof',PACKAGE],allowed=(0,1)).decode().strip()
 record['status']='PASS'
except Exception as exc:
 record['status']='FAIL_STOP';record['error']=repr(exc)
finally:
 record['finishedUtc']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 with (OUT/(tag+'.json')).open('x') as f:f.write(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({k:record[k] for k in ['status','installedApk','packageFields','png','pidof','error'] if k in record},ensure_ascii=False))
sys.exit(0 if record['status']=='PASS' else 1)
