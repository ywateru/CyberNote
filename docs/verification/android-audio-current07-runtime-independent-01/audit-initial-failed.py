from pathlib import Path
from PIL import Image,ImageChops
import json,hashlib,datetime,re
r=Path.cwd();a=r/'docs/verification/android-audio-current07-runtime-01';o=Path(__file__).resolve().parent
H=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def J(n):return json.loads((a/(n+'.json')).read_text())
def dump(n,d):
 p=o/n;assert not p.exists();p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def ident(p):return dict(path=str(p.relative_to(r)),bytes=p.stat().st_size,sha256=H(p))
m=J('manifest');assert H(a/'manifest.json')=='c35db992c0b366c2f77ab6c2cad3a80fceb636d1f07af812720ddbad08b24060'
actual=sorted(str(p.relative_to(a)) for p in a.rglob('*') if p.is_file() and p.name!='manifest.json');assert actual==[x['path'] for x in m['files']] and len(actual)==m['fileCount']==97
for row in m['files']:
 p=a/row['path'];assert p.stat().st_size==row['bytes'] and H(p)==row['sha256'],p
assert sum(x['bytes'] for x in m['files'])==m['totalBytes']==4126238
agg=hashlib.sha256(''.join(f"{x['path']}\t{x['bytes']}\t{x['sha256']}\n" for x in m['files']).encode()).hexdigest();assert agg==m['aggregateSha256']
paths={a/'manifest.json',*[a/x['path'] for x in m['files']]}
for ref in ['references','historical-unknown-date-reference']:
 for row in J(ref)['files']:
  p=r/row['path'];assert p.stat().st_size==row['bytes'] and H(p)==row['sha256'];paths.add(p)
inputs=[ident(p) for p in sorted(paths)];dump('inputs-open.json',dict(files=inputs,authorFiles=97,authorAggregate=agg))
freeze=J('capture-inputs')['files'];assert len(freeze)==88
for row in freeze:
 p=a/row['path'];assert p.stat().st_size==row['bytes'] and H(p)==row['sha256']
commands=[];reads=[];events=[];screens=[]
for p in sorted(a.glob('[0-9][0-9]-*.json')):
 d=json.loads(p.read_text())
 if 'events' in d:
  commands.append(p.name);assert d['serial']=='emulator-5580' and d['package']=='com.local.notesclone' and d['status']=='PASS';events+=d['events']
  assert d['space']['hostFreeBytes']>=2*1024**3 and int(d['space']['deviceDataDf'].strip().splitlines()[-1].split()[3])*1024>=2*1024**3
  for e in d['events']:
   assert e['exitCode']==0 or (p.name=='41-force-stop.json' and e['args']==['shell','pidof','com.local.notesclone'] and e['exitCode']==1 and e['stdout']=='')
  if 'png' in d:
   row=d['png'];path=a/row['path'];assert H(path)==row['sha256'] and path.stat().st_size==row['bytes']
   im=Image.open(path);im.load();assert im.format=='PNG' and im.size==(1080,2280);screens.append(row['path'])
   saved=[e for e in d['events'] if e['args']==['exec-out','screencap','-p']];assert len(saved)==1 and saved[0]['stdout']=={'bytes':row['bytes'],'sha256':row['sha256']}
 elif 'readAtUtc' in d:reads.append(p.name)
assert len(commands)==38 and len(screens)==37 and len(reads)==12 and len(events)==222
# Inspect serialized actual command allowlist, no ADB execution.
for e in events:
 args=e['args'];assert args[0] in ['devices','get-state','forward','exec-out','shell']
 if args[0]=='shell':
  assert args[1] in ['df','getprop','pm','stat','sha256sum','dumpsys','date','input','run-as','pidof','cat','am'],args
  if args[1]=='pm':assert args[2:] == ['path','com.local.notesclone']
  if args[1]=='run-as':assert args[2]=='com.local.notesclone' and args[3:] in [['find','.','-maxdepth','3','-type','d'],['ls','-ln','attachments']]
  if args[1]=='cat':assert args[2:] == ['/proc/net/unix']
  if args[1]=='input':assert args[2] in ['tap','keyevent','text','swipe']
  if args[1]=='am':assert args[2:] in [['force-stop','com.local.notesclone'],['start','-W','-n','com.local.notesclone/.MainActivity']]
# Two device-side APK identities and event-level scalar provenance.
first=J('00-preflight');last=J('45-final-identity');expectedApk={'path':'/data/app/~~hOHHoDrsHngH1bKyMQBuWw==/com.local.notesclone-jqr8OHuRWD_FvfatYZ1gVg==/base.apk','bytes':177445114,'sha256':'d6350a35374a8fa05c836e26f361dfb3d4834882fd4a360ad7a7ebbedf2d123c'}
assert first['installedApk']==last['installedApk']==expectedApk
fields={'userId':'10169','firstInstallTime':'2026-11-03 22:09:17','lastUpdateTime':'2026-11-04 18:41:56'};assert first['packageFields']==last['packageFields']==fields
for d in [first,last]:
 assert next(e for e in d['events'] if e['args'][:3]==['shell','stat','-c'])['stdout'].strip()==str(expectedApk['bytes'])
 assert next(e for e in d['events'] if e['args'][:2]==['shell','sha256sum'])['stdout'].split()[0]==expectedApk['sha256']
 package=next(e for e in d['events'] if e['args'][:3]==['shell','dumpsys','package'])['stdout']
 for k,v in fields.items():assert re.search(r'^\s*'+k+r'=(.*)$',package,re.M).group(1)==v
assert first['pidof']=='19635' and J('41-force-stop')['pidof']=='' and J('42-cold-start')['pidof']==last['pidof']=='21594'
assert 'LaunchState: COLD' in next(e for e in J('42-cold-start')['events'] if e['args'][:3]==['shell','am','start'])['stdout']
assert not J('40-remove-old-forward')['forwardsAfter'].strip() and not J('49-release-forward')['forwardsAfter'].strip()
def media(name):
 d=J(name);valid=[x for x in d['allAudioElements'] if x['readyState']==4];assert len(valid)==1
 v=valid[0];assert v['error'] is None and not v['muted'] and not v['seeking'];return v
names=['15-preview-paused-audio-elements','17-forward15-media','19-forward-clamp-end-media','21-back15-media','23-back-clamp-start-media','25-preview-playing-media','27-preview-paused-media'];vs=[media(n) for n in names]
assert J('14-preview-paused-media')['audio']==[]
assert vs[0]['currentTime']==25.224588 and vs[0]['duration']=='Infinity'
assert abs(vs[1]['currentTime']-vs[0]['currentTime']-15)<1e-9
assert vs[2]['currentTime']==vs[2]['duration']==41.714 and vs[3]['currentTime']==26.714 and vs[4]['currentTime']==0
assert vs[5]['currentTime']==4.944764 and not vs[5]['paused'] and vs[6]['currentTime']==10.658469
assert all(v['paused'] for i,v in enumerate(vs) if i!=5) and all(not v['connected'] for v in vs)
assert all(0<=v['currentTime']<=v['duration'] for v in vs[1:])
# Distinguish active disabled Done from actual save after pause.
active=J('30-saved-card-media');assert any(b['text']=='完成' and b['disabled'] for b in active['buttons']) and '音频 ·' not in active['visibleText']
assert J('06-attachments-before')['attachmentDirectoryMetadata']==J('31-attachments-saved')['attachmentDirectoryMetadata']
for name in ['29-done-saved','32-resume-paused-before-done','33-done-after-pause']:
 d=J(name);assert any(e['args'][:3]==['shell','input','tap'] for e in d['events'])
cardNames=['34-real-saved-card-media','39-normal-reopen-media','48-cold-qa-media']
for name in cardNames:
 d=J(name)
 for s in ['QA-AUDIO-20261104-07','Local audio lifecycle QA','2026年11月4日 19:52','音频 · 2:03']:assert s in d['visibleText']
 v=media(name);assert v['connected'] and v['duration']=='Infinity' and v['currentTime']==0 and v['paused']
assert J(cardNames[1])['visibleText']==J(cardNames[2])['visibleText']
def metadata(n):return [x for x in J(n)['attachmentDirectoryMetadata'].splitlines() if x.startswith('-')]
old=metadata('06-attachments-before');saved=metadata('35-attachments-real-saved');cold=metadata('46-final-attachments');assert len(old)==2 and saved==cold and len(saved)==3 and all(x in cold for x in old)
new=[x for x in cold if x not in old];assert len(new)==1 and new[0].split()[4]=='798500' and sorted(x.split()[4] for x in old)==['168397','429547']
start=next(e['atUtc'] for e in J('09-recording-over18s')['events'] if e['args'][:3]==['shell','input','tap'])
assert datetime.datetime.fromisoformat(start).astimezone(datetime.timezone(datetime.timedelta(hours=8))).strftime('%Y-%m-%d %H:%M')=='2026-11-04 19:52'
left=Image.open(a/'38-normal-reopen.png').convert('RGB');right=Image.open(a/'44-cold-qa-reopen.png').convert('RGB');roi=(0,240,1080,800);diff=ImageChops.difference(left.crop(roi),right.crop(roi));changed=sum(any(v) for v in diff.getdata());maxDelta=max(v[1] for v in diff.getextrema());assert changed==maxDelta==0
failure=J('44-approval-timeout');assert 'did not finish before its deadline' in failure['error'] and 'none of these commands executed' in failure['action']
# Capture scripts are inspected read-only, never imported/executed. No private store or media src read.
readSource=(a/'read-media.mjs').read_text();assert 'Runtime.queryObjects' in readSource and 'Runtime.callFunctionOn' in readSource and 'audio:[...document.querySelectorAll' in readSource
assert not any(s in readSource for s in ['.play(','.pause(','.currentTime=','a.src','__TAURI','localStorage','indexedDB'])
result=dict(verdict='PASS_FINITE_EVIDENCE_NO_NEW_PRODUCT_BLOCKER',authorFiles=97,authorAggregateSha256=agg,manifestSha256=H(a/'manifest.json'),inputs=len(inputs),commandRecords=38,passiveReads=12,rawNumberedInputs=88,pngs=37,recordedCommandEvents=222,installedApk=expectedApk,packageFields=fields,previewMedia=dict(zip(names,vs)),saveBoundary='29 disabled active Done and31 no attachment;32 pause then33 actual save',cardReadNames=cardNames,savedDurationStillInfinity=True,recordingStartUtc=start,newAttachment=new[0],oldMetadataLines=old,roi=list(roi),changedPixels=changed,maxChannelDifference=maxDelta,initialPid='19635',coldPid='21594',finalForwardsEmpty=True,limits=['Saved-evidence independent verification; no live ADB/GUI/device/DB/audio/product/build access.','2:03 is card display, sampled saved media duration Infinity, no fresh encoded duration validation.','Position progression/ready4 do not prove useful microphone signal or audible output.','Old attachment metadata lines only, no old bytes hash/JSON/all-note integrity; historical unknown-date evidence uses another APK.','Same-clone ROI only; no Apple parity, iOS/real device, saved-card play-to-ended, cancellation/error recovery.'])
author=J('analysis');assert author['installedApk']==result['installedApk'] and author['imageComparison'][0]['changedPixels']==changed and author['newAttachmentMetadata']==new[0]
for n,v in result['previewMedia'].items():assert author['previewMedia'][n]==v
for row in inputs:
 p=r/row['path'];assert p.stat().st_size==row['bytes'] and H(p)==row['sha256']
dump('inputs-close.json',dict(unchangedCount=len(inputs),files=inputs,allUnchanged=True));dump('result.json',result)
print(json.dumps(dict(verdict=result['verdict'],authorFiles=97,inputs=len(inputs),previewMediaSamples=7,savedCardSamples=3,roiChangedPixels=changed),ensure_ascii=False))
