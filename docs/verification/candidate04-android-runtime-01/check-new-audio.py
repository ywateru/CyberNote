from pathlib import Path
import datetime,hashlib,json,shutil,subprocess
ROOT=Path('/Users/water/work/2026/Apple-Notes-Clone');OUT=ROOT/'docs/verification/candidate04-android-runtime-01'
assert shutil.disk_usage(ROOT).free>=2*1024**3
ADB='/Applications/极空间.app/Contents/Resources/app.asar.unpacked/bin/platform-tools/adb'
PKG='com.local.notesclone';aid='6771077d-eee5-4c9a-875b-e9b7445cf516'
relative='op-109f65df-0ac3-4f50-90e7-12665a22e060-6771077d-eee5-4c9a-875b-e9b7445cf516.blob'
j=json.loads((OUT/'54-recording-saved-store.json').read_text());a=j['newAttachments'];assert len(a)==1 and a[0]['id']==aid and a[0]['body']['relativePath']==relative
remote='/data/user/0/'+PKG+'/attachments/'+relative;events=[]
def run(args,binary=False):
 p=subprocess.run([ADB,'-s','emulator-5580']+args,capture_output=True,timeout=20)
 events.append({'args':args,'exit':p.returncode,'stdoutBytes':len(p.stdout),'stderr':p.stderr.decode(errors='replace')});assert p.returncode==0,events[-1]
 return p.stdout if binary else p.stdout.decode().strip()
size=int(run(['shell','run-as',PKG,'stat','-c','%s',remote]));assert size==a[0]['body']['size'] and size<1024*1024
sha=run(['shell','run-as',PKG,'sha256sum',remote]).split()[0]
b=run(['exec-out','run-as',PKG,'cat',remote],True);assert len(b)==size and hashlib.sha256(b).hexdigest()==sha
host=OUT/'new-recording.webm';assert not host.exists();host.write_bytes(b)
probe=subprocess.run(['/opt/zerobrew/bin/ffprobe','-v','error','-show_streams','-show_format','-of','json',str(host)],capture_output=True,timeout=20)
(OUT/'55-new-audio-ffprobe.json').write_bytes(probe.stdout);assert probe.returncode==0,probe.stderr.decode()
decode=subprocess.run(['/opt/zerobrew/bin/ffmpeg','-nostdin','-hide_banner','-v','info','-i',str(host),'-t','60','-map','0:a:0','-af','astats=metadata=1:reset=0','-f','null','-'],capture_output=True,timeout=25)
(OUT/'55-new-audio-decode.txt').write_bytes(decode.stderr)
r={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'noteId':j['newNote']['id'],'attachmentId':aid,'remote':remote,'bytes':size,'sha256':sha,'hostFile':str(host),'ffprobeExit':probe.returncode,'decodeExit':decode.returncode,'decodedWithinSeconds':60,'events':events,'scope':'Only this run new synthetic recording transferred; original audio and DB/WAL not copied. Decode validity does not prove audibility.'}
(OUT/'55-new-audio-identity.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
