"""Only the preauthorized synthetic IDs plus this run's exact marker note."""
from pathlib import Path
import datetime,json,shlex,shutil,subprocess,sys
ROOT=Path('/Users/water/work/2026/Apple-Notes-Clone');OUT=ROOT/'docs/verification/candidate04-android-runtime-01'
ADB='/Applications/极空间.app/Contents/Resources/app.asar.unpacked/bin/platform-tools/adb'
PKG='com.local.notesclone';DATA='/data/user/0/'+PKG
assert shutil.disk_usage(ROOT).free>=2*1024**3
tag=sys.argv[1];assert all(c.isalnum() or c in '-_' for c in tag)
def adb(args):
 p=subprocess.run([ADB,'-s','emulator-5580']+args,capture_output=True,timeout=20)
 assert p.returncode==0,p.stderr.decode(errors='replace')
 return p.stdout.decode().strip()
def sql(q):return adb(['shell',shlex.join(['run-as',PKG,'/system/bin/sqlite3','-readonly',DATA+'/notes.sqlite3',q])])
def rows(q,cols):
 raw=sql(q);result=[]
 for line in raw.splitlines():
  vals=line.split('|');assert len(vals)==len(cols)
  d={k:bytes.fromhex(v).decode() for k,v in zip(cols,vals)}
  if 'body' in d:d['body']=json.loads(d['body'])
  if 'revision' in d:d['revision']=int(d['revision'])
  result.append(d)
 return result
baseline=json.loads((OUT/'01-baseline-after.json').read_text())
r={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'hostFreeBytes':shutil.disk_usage(ROOT).free,'serial':'emulator-5580','package':PKG,'syntheticNotes':[]}
for old in baseline['syntheticNotes']:
 r['syntheticNotes']+=rows("SELECT hex(id)||'|'||hex(folder_id)||'|'||hex(body)||'|'||hex(revision) FROM notes WHERE id='"+old['id']+"';",['id','folder_id','body','revision'])
r['syntheticAttachments']=rows("SELECT hex(id)||'|'||hex(note_id)||'|'||hex(body) FROM attachments WHERE id='cb3fa001-9d73-4580-b959-38481fbba90b';",['id','note_id','body'])
audio=DATA+'/attachments/cb3fa001-9d73-4580-b959-38481fbba90b.webm'
r['syntheticAudio']={'path':audio,'bytes':int(adb(['shell','run-as',PKG,'stat','-c','%s',audio])),'sha256':adb(['shell','run-as',PKG,'sha256sum',audio]).split()[0]}
r['originalSelectedUnchanged']={
 'notes':r['syntheticNotes']==baseline['syntheticNotes'],
 'attachmentMetadata':r['syntheticAttachments']==baseline['syntheticAttachments'],
 'audio':r['syntheticAudio']==baseline['syntheticAudio']}
marker='QA-CANDIDATE04-ANDROID-RUNTIME-20261104A'
nid='2e1d2253-a332-42cc-85ad-0f66752e6498'
r['newNote']=rows("SELECT hex(id)||'|'||hex(folder_id)||'|'||hex(body)||'|'||hex(revision) FROM notes WHERE id='"+nid+"';",['id','folder_id','body','revision'])[0]
assert marker in r['newNote']['body']['plainText'],'Original synthetic marker missing'
r['newAttachments']=rows("SELECT hex(id)||'|'||hex(note_id)||'|'||hex(body) FROM attachments WHERE note_id='"+nid+"';",['id','note_id','body'])
r['scope']='Only fixed three original synthetic note IDs, fixed original audio attachment ID/path, exact new QA marker note, and its attachments; no DB/WAL/audio transfer.'
(OUT/f'{tag}-store.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'at':r['at'],'originalSelectedUnchanged':r['originalSelectedUnchanged'],'newNoteId':nid,'revision':r['newNote']['revision'],'plainText':r['newNote']['body']['plainText'],'newAttachments':r['newAttachments']},ensure_ascii=False))
