"""Fixed-scope Android identities and selected synthetic rows; no payload transfer."""
from pathlib import Path
import datetime,hashlib,json,re,shlex,shutil,subprocess,sys
ROOT=Path('/Users/water/work/2026/Apple-Notes-Clone')
OUT=ROOT/'docs/verification/candidate06-android-runtime-01'
ADB='/Applications/极空间.app/Contents/Resources/app.asar.unpacked/bin/platform-tools/adb'
SERIAL='emulator-5580';PKG='com.local.notesclone';DATA='/data/user/0/'+PKG
APK=ROOT/'artifacts/unified-candidate06/android-build01/android-attempt01/android-original.apk'
EXPECTED={'before':(304110831,'bbc4c1a81d22c01082e94a169b5dedc410c8503ede7c405f32d2d0656a56c2c2'),'after':(177445114,'d773e08fd76ba5bbb8e77be9acbfe6e42159bd4efea6674c1af03aae66fecfc4')}
NOTES=['1a0718dd-c71c-4192-89b6-bd58cb9ba475','a9d1bbe7-a0ee-4f46-ba3e-e0889085cac3','a5a92add-fdb9-4b7f-9836-e7e4a930b2c2','2e1d2253-a332-42cc-85ad-0f66752e6498']
ATTACHMENTS=['cb3fa001-9d73-4580-b959-38481fbba90b','6771077d-eee5-4c9a-875b-e9b7445cf516']
events=[]
def run(args,allowed=(0,),timeout=30):
 p=subprocess.run([ADB,'-s',SERIAL]+args,capture_output=True,timeout=timeout)
 d={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'args':args,'exitCode':p.returncode,'stdout':p.stdout.decode(errors='replace'),'stderr':p.stderr.decode(errors='replace')};events.append(d)
 assert p.returncode in allowed,d
 return d['stdout'].strip()
def identity(path,private=False):
 pre=['shell']+(['run-as',PKG] if private else [])
 return {'path':path,'bytes':int(run(pre+['stat','-c','%s',path])),'sha256':run(pre+['sha256sum',path]).split()[0]}
def sql(q):return run(['shell',shlex.join(['run-as',PKG,'/system/bin/sqlite3','-readonly',DATA+'/notes.sqlite3',q])])
def rows(table,cols,where):
 raw=sql('SELECT '+"||'|'||".join('hex('+c+')' for c in cols)+' FROM '+table+' WHERE '+where+';');result=[]
 for line in raw.splitlines():
  vals=line.split('|');assert len(vals)==len(cols)
  row={k:bytes.fromhex(v).decode() for k,v in zip(cols,vals)}
  if 'body' in row:row['body']=json.loads(row['body'])
  if 'revision' in row:row['revision']=int(row['revision'])
  result.append(row)
 return result
def selected():
 notes=[rows('notes',['id','folder_id','body','revision'],"id='"+n+"'")[0] for n in NOTES]
 attachments=[rows('attachments',['id','note_id','body'],"id='"+n+"'")[0] for n in ATTACHMENTS]
 files=[]
 for a in attachments:
  relative=a['body']['relativePath'];assert relative in ['cb3fa001-9d73-4580-b959-38481fbba90b.webm','op-109f65df-0ac3-4f50-90e7-12665a22e060-6771077d-eee5-4c9a-875b-e9b7445cf516.blob']
  files.append(identity(DATA+'/attachments/'+relative,True))
 return dict(notes=notes,attachments=attachments,audioFiles=files)
phase=sys.argv[1];assert phase in EXPECTED
tag=sys.argv[2];assert re.fullmatch('[a-zA-Z0-9_-]+',tag)
record={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'phase':phase,'serial':SERIAL,'package':PKG,'apkSourceHead':'f18da0ccf8bb6e131e80e22b9752f0df2725245d','freeBefore':shutil.disk_usage(ROOT).free}
try:
 assert record['freeBefore']>=2*1024**3
 assert run(['get-state'])=='device'
 props={k:run(['shell','getprop',k]) for k in ['ro.product.model','ro.product.device','ro.build.fingerprint','ro.kernel.qemu']};record['deviceProperties']=props
 assert props['ro.product.model']=='sdk_gphone_arm64' and props['ro.product.device']=='emulator_arm64' and props['ro.kernel.qemu']=='1'
 record['pidof']=run(['shell','pidof',PKG],allowed=(0,1))
 paths=run(['shell','pm','path',PKG]).splitlines();assert len(paths)==1 and paths[0].startswith('package:/data/app/')
 record['installedApk']=identity(paths[0][8:]);assert (record['installedApk']['bytes'],record['installedApk']['sha256'])==EXPECTED[phase]
 dump=run(['shell','dumpsys','package',PKG]);record['packageFields']={k:re.search(r'^\s*'+k+r'=(.*)$',dump,re.M).group(1) for k in ['userId','firstInstallTime','lastUpdateTime']}
 assert record['packageFields']['userId']=='10169' and record['packageFields']['firstInstallTime']=='2026-11-03 22:09:17'
 record['deviceDataSpace']=run(['shell','df','-k','/data'])
 record['selected']=selected()
 old=json.loads((ROOT/'docs/verification/candidate04-android-runtime-01/66-final-store.json').read_text());oldnotes=old['syntheticNotes']+[old['newNote']];oldattachments=old['syntheticAttachments']+old['newAttachments']
 record['matchesCandidate04']={'fourRows':record['selected']['notes']==oldnotes,'twoAttachmentRows':record['selected']['attachments']==oldattachments,'oldAudio':(record['selected']['audioFiles'][0]['bytes'],record['selected']['audioFiles'][0]['sha256'])==(429547,'cd7ee9692361fb3502775e8b7efc87ba0957ee22835f10e6d7335b09980fdf4f'),'candidate04Audio':(record['selected']['audioFiles'][1]['bytes'],record['selected']['audioFiles'][1]['sha256'])==(168397,'6e145210f656836e9f1260f8e349af1ab8737e52885b27ed70fba80bf15fb32c')}
 assert all(record['matchesCandidate04'].values()),record['matchesCandidate04']
 if phase=='before':
  b=APK.read_bytes();record['hostCandidate06']={'path':str(APK),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()};assert (len(b),record['hostCandidate06']['sha256'])==EXPECTED['after']
 record['status']='PASS'
except Exception as error:
 record['status']='FAIL_STOP';record['error']=repr(error)
finally:
 record['events']=events;record['freeAfter']=shutil.disk_usage(ROOT).free;record['scope']='Exactly four known synthetic note rows and two attachment rows/file identities. No DB/WAL/audio/APK payload copied; no launch/input/stop/install in this script.'
 with (OUT/(tag+'.json')).open('x') as f:f.write(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({k:record[k] for k in ['status','phase','matchesCandidate04','installedApk','error'] if k in record},ensure_ascii=False))
sys.exit(0 if record['status']=='PASS' else 1)
