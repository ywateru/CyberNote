"""Read only this run's exact synthetic marker, then its fixed note ID."""
from pathlib import Path
import datetime,json,re,shlex,shutil,subprocess,sys
ROOT=Path('/Users/water/work/2026/Apple-Notes-Clone');OUT=ROOT/'docs/verification/candidate06-android-runtime-01'
assert shutil.disk_usage(ROOT).free>=2*1024**3
tag=sys.argv[1];assert re.fullmatch('[A-Za-z0-9_-]+',tag)
marker='QA-CANDIDATE06-ANDROID-RUNTIME-20261104A';identity=OUT/'new-note-identity.json'
where="body LIKE '%"+marker+"%'" if not identity.exists() else "id='"+json.loads(identity.read_text())['id']+"'"
q="SELECT hex(id)||'|'||hex(folder_id)||'|'||hex(body)||'|'||hex(revision) FROM notes WHERE "+where+';'
args=['/Applications/极空间.app/Contents/Resources/app.asar.unpacked/bin/platform-tools/adb','-s','emulator-5580','shell',shlex.join(['run-as','com.local.notesclone','/system/bin/sqlite3','-readonly','/data/user/0/com.local.notesclone/notes.sqlite3',q])]
p=subprocess.run(args,capture_output=True,text=True,timeout=25);assert p.returncode==0,p.stderr
lines=p.stdout.strip().splitlines();assert len(lines)==1,'Exact synthetic marker missing/ambiguous'
vals=lines[0].split('|');assert len(vals)==4
row={k:bytes.fromhex(v).decode() for k,v in zip(['id','folder_id','body','revision'],vals)};row['body']=json.loads(row['body']);row['revision']=int(row['revision']);assert marker in row['body']['plainText']
if not identity.exists():
 with identity.open('x') as f:f.write(json.dumps({'id':row['id'],'marker':marker},indent=2)+'\n')
marks=[]
def visit(node):
 marks.extend(m for m in node.get('marks',[]) if m['type']=='noteTag')
 for child in node.get('content',[]):visit(child)
visit(row['body']['document'])
r={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'command':args,'exitCode':p.returncode,'stdout':p.stdout,'stderr':p.stderr,'note':row,'noteTagMarks':marks,'freeBytes':shutil.disk_usage(ROOT).free,'scope':'Only exact new QA06 marker once, then fixed returned synthetic note ID. No DB/WAL/audio transfer or writes.'}
with (OUT/(tag+'.json')).open('x') as f:f.write(json.dumps(r,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'id':row['id'],'revision':row['revision'],'plainText':row['body']['plainText'],'marks':marks},ensure_ascii=False))
