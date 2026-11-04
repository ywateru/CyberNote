"""Offline assertions over preserved real-ADB/CDP evidence; no device access."""
from pathlib import Path
from PIL import Image, ImageChops
import datetime, hashlib, json
OUT=Path(__file__).resolve().parent
def load(n):return json.loads((OUT/(n+'.json')).read_text())
sha=lambda b:hashlib.sha256(b).hexdigest()
freeze=load('capture-inputs')
for r in freeze['files']:
 b=(OUT/r['path']).read_bytes();assert len(b)==r['bytes'] and sha(b)==r['sha256']
before=load('00-preflight');after=load('45-final-identity')
assert before['installedApk']==after['installedApk']
assert before['packageFields']==after['packageFields']=={'userId':'10169','firstInstallTime':'2026-11-03 22:09:17','lastUpdateTime':'2026-11-04 18:41:56'}
assert before['pidof']=='19635' and after['pidof']=='21594'
assert load('41-force-stop')['pidof']==''
assert load('42-cold-start')['pidof']=='21594'
assert not load('40-remove-old-forward')['forwardsAfter'].strip()
assert not load('49-release-forward')['forwardsAfter'].strip()

def audio(n):
 values=[a for a in load(n)['allAudioElements'] if a['readyState']==4]
 assert len(values)==1 and values[0]['error'] is None
 return values[0]
steps=['15-preview-paused-audio-elements','17-forward15-media','19-forward-clamp-end-media','21-back15-media','23-back-clamp-start-media','25-preview-playing-media','27-preview-paused-media']
media={n:audio(n) for n in steps}
assert media[steps[0]]['currentTime']==25.224588 and media[steps[0]]['paused']
assert abs(media[steps[1]]['currentTime']-media[steps[0]]['currentTime']-15)<1e-9
assert media[steps[2]]['duration']==media[steps[2]]['currentTime']==41.714
assert media[steps[3]]['currentTime']==26.714
assert media[steps[4]]['currentTime']==0
assert not media[steps[5]]['paused'] and media[steps[5]]['currentTime']==4.944764
assert media[steps[6]]['paused'] and media[steps[6]]['currentTime']==10.658469
assert all(0<=a['currentTime']<=a['duration'] for a in list(media.values())[1:])
assert all(a['paused'] for n,a in media.items() if n!=steps[5])
assert any(b['text']=='完成' and b['disabled'] for b in load('30-saved-card-media')['buttons'])
assert '音频 ·' not in load('30-saved-card-media')['visibleText']
assert load('06-attachments-before')['attachmentDirectoryMetadata']==load('31-attachments-saved')['attachmentDirectoryMetadata']
cardreads=['34-real-saved-card-media','39-normal-reopen-media','48-cold-qa-media']
for n in cardreads:
 x=load(n);assert 'QA-AUDIO-20261104-07' in x['visibleText'] and 'Local audio lifecycle QA' in x['visibleText']
 assert '2026年11月4日 19:52' in x['visibleText'] and '音频 · 2:03' in x['visibleText']
 a=audio(n);assert a['paused'] and a['currentTime']==0 and a['connected']

def metadata(n):
 t=load(n)['attachmentDirectoryMetadata']
 return [x for x in t.splitlines() if x.startswith('-')]
old=metadata('06-attachments-before');saved=metadata('35-attachments-real-saved');final=metadata('46-final-attachments')
assert len(old)==2 and len(saved)==len(final)==3 and saved==final
assert all(x in final for x in old)
new=[x for x in final if x not in old];assert len(new)==1
fields=new[0].split();assert fields[4]=='798500'

captures=[];command_records=[]
for p in sorted(OUT.glob('[0-9][0-9]-*.json')):
 x=json.loads(p.read_text())
 if 'events' not in x:continue
 assert x['status']=='PASS',p
 command_records.append(p.name)
 if 'png' not in x:continue
 r=x['png'];b=(OUT/r['path']).read_bytes();assert len(b)==r['bytes'] and sha(b)==r['sha256']
 with Image.open(OUT/r['path']) as im:
  im.load();assert im.format=='PNG' and im.size==(1080,2280)
  captures.append({'file':r['path'],'bytes':len(b),'sha256':sha(b),'format':im.format,'size':list(im.size)})
# Explicit bounded comparison inside the same clone. No Apple image comparison.
comparisons=[]
roi=(0,240,1080,800)
for lhs,rhs in [('38-normal-reopen.png','44-cold-qa-reopen.png')]:
 with Image.open(OUT/lhs) as a,Image.open(OUT/rhs) as b:
  diff=ImageChops.difference(a.convert('RGB').crop(roi),b.convert('RGB').crop(roi));changed=sum(any(v) for v in diff.getdata())
  comparisons.append({'left':lhs,'right':rhs,'roi':list(roi),'changedPixels':changed,'maxChannelDifference':max(x[1] for x in diff.getextrema()),'scope':'Same clone normal-note-reopen versus process-cold-reopen; title/note date/body/card included; status and outer controls excluded. Not Apple parity.'})
start=[e for e in load('09-recording-over18s')['events'] if e['args'][:2]==['shell','input']][0]['atUtc']
assert datetime.datetime.fromisoformat(start).astimezone(datetime.timezone(datetime.timedelta(hours=8))).strftime('%Y-%m-%d %H:%M')=='2026-11-04 19:52'
result={'verdict':'PASS_FINITE_NEW_RECORDING_PREVIEW_AND_LOCAL_PERSISTENCE','deviceReleased':True,'rawNumberedInputs':len(freeze['files']),'commandRecords':len(command_records),'pngCount':len(captures),'captures':captures,'installedApk':after['installedApk'],'packageFieldsUnchanged':after['packageFields'],'initialPID':before['pidof'],'coldPID':after['pidof'],'previewMedia':media,'savedCardReadFiles':cardreads,'recordingStartAdbUtc':start,'recordingCardDateLocal':'2026-11-04 19:52','savedCardDurationDisplay':'2:03','activeDoneAttempt':'29 click while recording hit disabled Done;30 still active panel;31 no new attachment. 32 pause then33 Done is actual save. Raw filenames preserved.','newAttachmentMetadata':new[0],'oldAttachmentMetadataUnchanged':old,'imageComparison':comparisons,'approvalTimeout':'44 first auto-review timed out before execution; single allowed retry succeeded, raw timeout retained.','historicalUnknownDate':'Only prior d773/f18da0 package evidence referenced; no current d635 old-card visual reacceptance.','limits':['No new audio export, file-content hash, audio bytes, transcription, private DB read/export or direct editor/store mutation.','Actual media playback state and readyState are not audible output or useful microphone signal acceptance; host input settings unchanged.','Paused preview main timer returns capture duration; actual audio scalar reads give playback positions.','Saved connected media duration stays Infinity at sampled endpoints; UI total 2:03 is not a fresh full encoded-duration probe.','Only one new QA note created, visible note count6 to7; not all-note or DB-wide preservation proof.','No process-normal-quit, saved-card play-to-ended, cancellation/error recovery, iOS/real device or Apple pixel acceptance.','Command status PASS reports allowed exits and capture integrity; functional results use explicit endpoint/media assertions.'],'numberedInputsUnchanged':True}
(OUT/'analysis.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:result[k] for k in ['verdict','rawNumberedInputs','commandRecords','pngCount','newAttachmentMetadata','imageComparison']},ensure_ascii=False,indent=2))
