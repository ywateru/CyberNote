from pathlib import Path
from PIL import Image, ImageChops, ImageDraw
import json, hashlib, re
ROOT=Path(__file__).resolve().parents[3];OUT=Path(__file__).resolve().parent;SRC=ROOT/'docs/verification/android-compose-anchor-runtime36'
load=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();checks=[]
def check(name,value,details=None):
 assert value,name
 checks.append({'name':name,'passed':True,'details':details})
start=load(OUT/'inputs-before.json');idx=load(SRC/'evidence-index.json');author=load(SRC/'result.json');opening=load(SRC/'input-open.json');closing=load(SRC/'input-close.json')
check('exact author evidence index and result',sha(SRC/'evidence-index.json')==start['authorIndexSha256']=='a7d1caf870a28c5b815e276375f3d968837b62fbd106241cb3da17ff93e7166d' and sha(SRC/'result.json')==start['authorResultSha256']=='b38a32345cecc6066ca84f8c0913788013d35ad89bb37a2e13ffb67e22a1a9a4')
for group,rows in [('authorIndex',idx['files']),('protectedInputs',opening['files'])]:
 for row in rows:
  p=ROOT/row['path'];assert p.stat().st_size==row['bytes'] and sha(p)==row['sha256'],row['path']
 check(group+' exact identities',True,len(rows))
check('331 initial and close input protection matches',opening['count']==closing['protectedFileCount']==331 and closing['protectedChanged']==[] and closing['frozenInputCount']==323 and closing['frozenInputMismatches']==[])
freeze=load(ROOT/'docs/verification/unified-candidate06/android-compose-anchor-build08/input-freeze.json')
check('323 actual frozen files and product304 aggregate',len(freeze['files'])==323 and len(freeze['productFiles'])==304 and freeze['aggregate']=='0769da604be0d4d3087771b948477e9c96c45992f0e75b81298465cdaa9d290e' and freeze['productAggregate']=='6b1cda6557ff292326617bd2fdf8750ba37d700eb460e2d6cdb1ac2da80848ad')
for row in freeze['files']:
 p=ROOT/row['path'];assert p.stat().st_size==row['bytes'] and sha(p)==row['sha256'],row['path']
old=load(SRC/'01-before-identity.json');up=load(SRC/'03-upgrade.json');final=load(SRC/'19-final-identity.json');newsha='a7ba557478e42da0a7f0e387a772bf764b067bfe082553e765603ca700385632'
check('old07 exact installed identity',old['identity']['sha256']=='e19965fd97c45ac3184e569777146d68b4d312bd561bbb2862d27ad93c6a86c6' and old['identity']==up['before'])
installs=[e for e in up['events'] if e.get('args',[None])[0]=='install']
check('exact install-r command succeeds',len(installs)==1 and installs[0]['args']==['install','-r',str(ROOT/'artifacts/unified-candidate06/android-compose-anchor-build08/android-attempt01/android-original.apk')] and installs[0]['exitCode']==0 and 'Success' in installs[0]['stdout'])
check('after and final baseAPK equal accurate08 bytes and hash',all(i['bytes']==179247354 and i['sha256']==newsha for i in [up['after'],final['identity']]))
check('userId and firstInstallTime remain',all(i['packageFields']['userId']=='10169' and i['packageFields']['firstInstallTime']=='2026-11-03 22:09:17' for i in [old['identity'],up['after'],final['identity']]))
commands=[];captures=0
for path in sorted(SRC.glob('*.json')):
 a=load(path)
 if 'events' not in a:continue
 if 'png' in a:
  p=ROOT/a['png']['path'];check(path.stem+' PNG matches raw screencap',p.stat().st_size==a['png']['bytes'] and sha(p)==a['png']['sha256'] and any(e.get('args')==['exec-out','screencap','-p'] and e.get('stdout',{}).get('sha256')==a['png']['sha256'] for e in a['events']));captures+=1
 for e in a['events']:
  if e.get('args'):commands.append({'file':path.name,**e})
def input_command(name,text):
 a=load(SRC/name);events=[e for e in a['events'] if e.get('args',[None])[0]=='shell' and len(e['args'])==2 and e['args'][1].startswith('input ')]
 check(name+' actual finite input',len(events)==1 and events[0]['args']==['shell',text] and events[0]['exitCode']==0)
input_command('06-compose-tap.json','input tap 1003 2077');input_command('07-empty-draft-return.json','input tap 120 145');input_command('09-visible-left-plus.json','input tap 125 2059');input_command('10-folder-cancel.json','input tap 110 222')
check('no text input or destructive database commands in recorded event stream',all('input text' not in str(e['args']) and all(s not in str(e['args']) for s in ['uninstall','pm clear','run-as','sqlite','/data/user/0/','/data/data/']) for e in commands))
for name in ['00-before-identity.json','05-compose-tap.json']:
 a=load(SRC/name);check(name+' failure preserved before successful device input',a['status']=='FAIL_STOP' and not any('input ' in str(e.get('args','')) for e in a['events']))
r=load(SRC/'15-force-stop-reopen.json');check('real cold restart new PID',r['oldPid']=='28752' and r['stoppedPid']=='' and r['newPid']==final['identity']['pid']=='29053' and any(e.get('args',[])[:3]==['shell','am','force-stop'] and e['exitCode']==0 for e in r['events']) and any('LaunchState: COLD' in str(e.get('stdout','')) and e.get('exitCode')==0 for e in r['events']))
# Independent threshold implementation against each saved source. No author script execution.
measure=load(SRC/'measurements.json');remeasured={}
for name,row in measure['records'].items():
 im=Image.open(ROOT/row['source']).convert('RGB');roi=row['roi'];check(name+' image dimensions',list(im.size)==row['size']);masks={}
 for mask in ['gold_strict','gold_loose']:
  def pred(p):
   r,g,b=p;return r>140 and g>95 and b<r*(.65 if mask=='gold_strict' else .80) and r>g*(1.06 if mask=='gold_strict' else 1.03)
  pixels=[(x,y)for y in range(roi[1],roi[3])for x in range(roi[0],roi[2])if pred(im.getpixel((x,y)))];box=[min(p[0] for p in pixels),min(p[1] for p in pixels),max(p[0] for p in pixels)+1,max(p[1] for p in pixels)+1];factor=im.width/224
  value={'nativeBbox':box,'pixels':len(pixels),'widthInReferencePx':(box[2]-box[0])/factor,'heightInReferencePx':(box[3]-box[1])/factor,'centerXInReferencePx':(box[0]+box[2])/2/factor}
  check(name+'/'+mask+' independent measurement matches',value==row['masks'][mask]);masks[mask]=value
 remeasured[name]=masks
pixelControls={}
for name,row in measure['comparisons'].items():
 ia=Image.open(ROOT/row['a']).convert('RGB');ib=Image.open(ROOT/row['b']).convert('RGB');roi=row['roi']
 for ex in row['exclusions']:
  for im in [ia,ib]:ImageDraw.Draw(im).rectangle((ex[0],ex[1],ex[2]-1,ex[3]-1),fill=(0,0,0))
 diff=ImageChops.difference(ia.crop(roi),ib.crop(roi));changed=sum(any(c for c in p) for p in diff.getdata());check(name+' independent RGB control',changed==row['changedPixels']==0 and diff.getbbox() is None and row['diffBboxWithinRoi'] is None);pixelControls[name]={'roi':roi,'exclusions':row['exclusions'],'changedPixels':changed}
# Translation proof stays finite and uses only overlapping fixed compare strips.
ia=Image.open(ROOT/measure['records']['android07-19']['source']).convert('RGB');ib=Image.open(ROOT/measure['records']['android08-04']['source']).convert('RGB');tr=ImageChops.difference(ia.crop((930,2020,1052,2130)),ib.crop((938,2020,1060,2130)));check('compose full RGB paint translated by8 within common strip',tr.getbbox() is None)
check('blank new note observation is open and8to9 retained',author['status']=='LIMITED_PASS_WITH_OPEN_PARITY_DIFFERENCE' and author['blankDraftReturnObservation']['initialAllAndOrdinaryCount']==8 and author['blankDraftReturnObservation']['finalAllAndOrdinaryCount']==9 and author['blankDraftReturnObservation']['inputTextSent'] is False and author['blankDraftReturnObservation']['originalParity']=='PENDING_ORIGINAL_SAME_PATH_EVIDENCE' and not any('cancel' in c['name'].lower() and 'empty' in c['name'].lower() for c in author['checks']))
summary={'status':'PASS_WITH_OPEN_PARITY_OBSERVATION','stop':True,'reviewScope':'Independent saved-evidence review only, no ADB/GUI/DB/build/source/Git operations','sourceHead':author['sourceHead'],'authorIndexSha256':start['authorIndexSha256'],'authorResultSha256':start['authorResultSha256'],'checks':checks,'assertions':len(checks),'captureRecordsVerified':captures,'remeasured':remeasured,'pixelControls':pixelControls,'composeTranslationNativePx':8,'newCenterMinusOriginalReferencePx':remeasured['android08-04']['gold_strict']['centerXInReferencePx']-208,'observation':'Empty create with no text then normal back retains one new blank entry; counts8to9. Original same-path parity unproven; no cancel-no-create PASS.','visualReview':'Viewed six-state contact sheet and native QA screenshot. Initial0/8/8/1, new editor+keyboard, blank list entry+count9, newfolderdialog then cancel/folders0/9/9/1 visible. QA complete title/body/tag visible; independently exactRGB matched after restart.','limits':['Only saved evidence reviewed; no second live replay.','Near-right left-plus edge was not separately tapped in runtime36; visible-circle center tap only.','Visible counts and one old QA do not establish all records/attachments/database integrity.','Width-only1080/224 normalization; original compressed224x480 cannot prove path/stroke/color/native slot pixel equivalence.','No original same-path empty-back proof; entire project acceptance remains open.']}
(OUT/'result.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'status':summary['status'],'assertions':len(checks),'captureRecordsVerified':captures,'newCenter':remeasured['android08-04']['gold_strict']['centerXInReferencePx'],'shiftPx':8},indent=2))
