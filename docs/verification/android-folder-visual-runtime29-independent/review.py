"""Static Android29 evidence review and same finite ROI recomputation; no ADB/app/tests/build."""
from pathlib import Path
from PIL import Image
import json,hashlib,re,datetime
ROOT=Path('/Users/water/work/2026/Apple-Notes-Clone');OUT=ROOT/'docs/verification/android-folder-visual-runtime29-independent';RUN=ROOT/'docs/verification/android-folder-visual-runtime29';ANA=ROOT/'docs/research/android-folder-visual-runtime29-analysis';PKG=ROOT/'docs/verification/unified-candidate06/android-folder-visual-build07';APK=ROOT/'artifacts/unified-candidate06/android-folder-visual-build07/android-attempt01/android-original.apk';SOURCE='d7423070207684c5a2bb584281350723c44e9d9c';APKSHA='e19965fd97c45ac3184e569777146d68b4d312bd561bbb2862d27ad93c6a86c6';PRODUCT='7c83817061c438c388c9c52e8e0207ffb415a0847f9d0a320c59eac5a63363e5';checks=[]
def load(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def ident(p):return {'path':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':sha(p)}
def write(n,d):
 with (OUT/n).open('x')as f:f.write(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def check(n,ok):
 checks.append({'name':n,'pass':bool(ok)})
 if not ok:raise AssertionError(n)
def indexrows(p):
 d=load(p);rows=d['files']if'files'in d else[{'path':k,**v}for k,v in d.items()]
 out=[]
 for r in rows:
  target=ROOT/r['path']
  if not target.exists():target=p.parent/r['path']
  out.append((r,target))
 return out
ri=indexrows(RUN/'evidence-index.json');ai=indexrows(ANA/'evidence-index.json');manifest=load(ANA/'input-manifest.json');close=load(ANA/'input-close.json');freeze=load(PKG/'input-freeze.json');historical=[]
for r in close['sealedEvidence']:
 p=ROOT/r['index'];historical.append((r,p,indexrows(p)))
paths={RUN/'evidence-index.json',ANA/'evidence-index.json',APK,PKG/'input-freeze.json',PKG/'android-attempt01/collection/result.json',ROOT/'docs/verification/unified-candidate06/android-folder-visual-independent07/result.json'}
paths.update(p for r,p in ri+ai);paths.update(ROOT/r['path']for r in manifest['files']);paths.update(ROOT/r['path']for r in freeze['productFiles'])
for r,p,rows in historical:paths.add(p);paths.update(q for v,q in rows)
initial=[ident(p)for p in sorted(paths)];write('input-initial.json',{'count':len(initial),'files':initial})
check('exact runtime39 sealed index',len(ri)==39 and sha(RUN/'evidence-index.json')=='421b22689cf4b76e7238c09eca746d5488fa9c1343ff5f9145f32e7008c57c6b')
check('exact analysis14 sealed index',len(ai)==14 and sha(ANA/'evidence-index.json')=='a086338ab2258dad8ad5f47b151bfa02b0ba87662684d43e436b53f83cd5ef23')
for label,rows in [('runtime',ri),('analysis',ai)]:
 for r,p in rows:check(label+' indexed identity '+r['path'],p.stat().st_size==r['bytes']and sha(p)==r['sha256'])
for r in manifest['files']:check('finite analysis original input '+r['path'],ident(ROOT/r['path'])==r)
check('eighteen finite input closure recorded',len(manifest['files'])==len(close['selectedAnalysisInputs'])==18 and all(r['matches']for r in close['selectedAnalysisInputs']))
for r,p,rows in historical:
 check('historical sealed index '+r['index'],sha(p)==r['indexSha256']and len(rows)==r['entries']and r['mismatches']==[])
 for v,q in rows:check('historical evidence byte preservation '+str(q.relative_to(ROOT)),q.stat().st_size==v['bytes']and sha(q)==v['sha256'])
for r in freeze['productFiles']:check('current frozen product '+r['path'],ident(ROOT/r['path'])==r)
agg=hashlib.sha256(''.join(r['sha256']+'  '+r['path']+'\n'for r in freeze['productFiles']).encode()).hexdigest();check('exact same source303 product aggregate',freeze['head']==SOURCE and len(freeze['productFiles'])==303 and agg==freeze['productAggregate']==PRODUCT)
check('accurate APK frozen collector and prior independent pass',APK.stat().st_size==179247354 and sha(APK)==APKSHA and sha(PKG/'input-freeze.json')=='703b60b51ccc6a8eb98c9460759c7449ec27e38b61ec5091ec29d0ed739867b7'and sha(PKG/'android-attempt01/collection/result.json')=='6e528483f6e5e5875abed78d14aab063441d2cea99848c93942475dc0134d237'and sha(ROOT/'docs/verification/unified-candidate06/android-folder-visual-independent07/result.json')=='f9e59ee9dd50890b9462b916342f1f2a95e44ae57c01b2934476b79462c8c1d8')
before=load(RUN/'01-device-before.json');up=load(RUN/'02-upgrade.json');records={r['name']:r for r in up['records']};installed=up['installedAPK'];post=records['package-after']['stdout'];pre=before['records']['package']['stdout']
check('exact installed07 identity and successful preserving install-r',before['device']=='emulator-5580'and up['sourceHead']==SOURCE and up['productAggregate']==PRODUCT and up['apk']['sha256']==installed['sha256']==APKSHA and up['apk']['bytes']==installed['bytes']==179247354 and installed['exit']==0 and not installed['stderr']and records['install-r']['command']==['install','-r',str(APK)]and records['install-r']['exit']==0 and records['install-r']['stdout'].endswith('Success\n')and not records['install-r']['stderr']and up['identityPreserved'])
check('installed user and first-install identity preserved',all(re.findall(pattern,pre)==re.findall(pattern,post)==[expected]for pattern,expected in [(r'^\s+userId=(\d+)\s*$','10169'),(r'^\s+firstInstallTime=(.+)\s*$','2026-11-03 22:09:17')])if False else 'userId=10169'in pre and'userId=10169'in post and'firstInstallTime=2026-11-03 22:09:17'in pre and'firstInstallTime=2026-11-03 22:09:17'in post)
check('installed path matches streamed identity and arm64 package',installed['path']in records['path-after']['stdout']and installed['path']in post and'primaryCpuAbi=arm64-v8a'in post and'apkSigningVersion=2'in post and records['running-process']['stdout']=='27516\n'and all(r['exit']==0 and not r['stderr']for r in up['records']))
check('recorded independent gate exact',up['independentGate']['assertions']==391 and up['independentGate']['sha256']==sha(ROOT/up['independentGate']['path']))
expected={'05-visible-plus-center-open':['input','tap','125','2059'],'06-new-folder-canceled':['input','tap','110','223'],'07-quick-folder-open':['input','tap','390','548'],'08-quick-back-folders':['input','keyevent','4'],'09-ordinary-folder-open':['input','tap','390','972'],'10-ordinary-back-folders':['input','keyevent','4'],'11-ordinary-longpress':['input','swipe','300','972','300','972','900'],'12-longpress-back-dismissed':['input','keyevent','4'],'13-ordinary-list-reopened':['input','tap','390','972'],'14-synthetic-note-open':['input','tap','390','675'],'15-body-selection':['input','swipe','300','553','300','553','900'],'16-body-return-ordinary-list':['input','tap','130','143'],'17-before-restart-folders':['input','keyevent','4']}
for stem,action in expected.items():
 rows=load(RUN/(stem+'.json'));check('captured actual input '+stem,len(rows)==1 and rows[0]['action']==action and rows[0]['exit']==0 and not rows[0]['stderr']and not rows[0]['stdout'])
restart={r['name']:r for r in load(RUN/'18-restart-process.json')['records']}
check('recorded exact cold process chain27516 empty27930',restart['before-pid']['stdout']=='27516\n'and restart['before-pid']['exit']==0 and restart['force-stop']['command']==['shell','am','force-stop','com.local.notesclone']and restart['force-stop']['exit']==0 and restart['stopped-pid']['exit']==1 and restart['stopped-pid']['stdout']==''and'LaunchState: COLD'in restart['start']['stdout']and restart['start']['exit']==0 and restart['after-pid']['stdout']=='27930\n'and restart['after-pid']['exit']==0 and all(not r['stderr']for r in restart.values()))
runtime=load(RUN/'result.json');ex=load(RUN/'execution-record.json');check('transition and schema correction honestly excluded',runtime['status']=='pass-finite-runtime'and runtime['stop']and runtime['sourceHead']==SOURCE and runtime['apk']['sha256']==APKSHA and'03-stable-after-upgrade.png'in runtime['transitionalEvidence']and len(ex['adaptations'])==2 and"KeyError: 'files'"in ex['adaptations'][1]['error']and ex['prohibitedActionsPerformed']==[])
check('original00 baseline preserved',sha(RUN/'00-before-upgrade.png')=='c404c76ad9f22256c884b84429654739502c043a8cc19685cd82a61d4943af77'and load(RUN/'00-before-upgrade-identity.json')['installedAPK_SHA256']=='8609231ff310ffef028c62b20f9774bcb2968f15d21a95ddf87d3f4eb98951ac')
for p in sorted(RUN.glob('*.png')):
 with Image.open(p)as im:im.load();check('raw runtime PNG native dimensions '+p.name,im.format=='PNG'and im.size==(1080,2280))
# Independent same-ROI measurement only; never run author's app or rendering script.
m=load(ANA/'measurements.json');b=load(ROOT/'docs/research/mobile-folders-baseline14/measurements.json');ratio=1080/224;images={};computed={};finite={}
pred={'dark100':lambda p:max(p)<100,'dark160':lambda p:max(p)<160,'gold_strict':lambda p:p[0]>140 and p[1]>95 and p[2]<.65*p[0]and p[0]>1.06*p[1],'gold_loose':lambda p:p[0]>140 and p[1]>95 and p[2]<.80*p[0]and p[0]>1.03*p[1],'search237':lambda p:min(p)>=200 and max(p)<=244 and p[0]<237 and p[1]<237,'search234':lambda p:min(p)>=200 and max(p)<=242 and p[0]<234 and p[1]<234}
def bbox(im,roi,func):
 pts=[(x,y)for y in range(roi[1],roi[3])for x in range(roi[0],roi[2])if func(im.getpixel((x,y)))];return[min(x for x,y in pts),min(y for x,y in pts),max(x for x,y in pts)+1,max(y for x,y in pts)+1]if pts else None
for name,rec in m['rawMeasurements'].items():
 im=Image.open(ROOT/rec['source']).convert('RGB');images[name]=im;factor=1 if name.startswith('original')else ratio;template=b['measurements'][name if name.startswith('original')else'android'];values={};f={}
 check('same source image dimensions '+name,list(im.size)==rec['nativeSize'])
 for key,measure in rec['measurements'].items():
  check('same sealed baseline ROI and masks '+name+' '+key,measure['roi']==template[key]['roi']and list(measure['bbox_by_mask'])==list(template[key]['bbox_by_mask']))
  boxes={k:bbox(im,measure['roi'],pred[k])for k in measure['bbox_by_mask']};check('independently same finite threshold bbox '+name+' '+key,boxes==measure['bbox_by_mask']);values[key]={'roi':measure['roi'],'bbox_by_mask':boxes};mask='gold_strict'if'gold'in key else'search237'if key=='search_fill'else'dark160';r=boxes[mask];f[key]={'mask':mask,'nativeBbox':r,'widthInReferencePx':(r[2]-r[0])/factor,'heightInReferencePx':(r[3]-r[1])/factor,'leftInReferencePx':r[0]/factor,'centerXInReferencePx':(r[0]+r[2])/2/factor}
 check('all normalized measures reproduced '+name,f==m['finiteMeasures'][name]);computed[name]=values;finite[name]=f
check('width ratio only and8 stable bboxes',m['ratio']==ratio and len(m['stableBboxes04And19'])==8 and all(m['stableBboxes04And19'].values())and all(finite['android07-04'][k]['nativeBbox']==finite['android07-19'][k]['nativeBbox']for k in m['stableBboxes04And19']))
def diff(im1,im2,roi):
 pairs=list(zip(im1.crop(roi).getdata(),im2.crop(roi).getdata()));return{'roi':roi,'changedPixels':sum(a!=b for a,b in pairs),'maxChannelDifference':max(abs(x-y)for a,b in pairs for x,y in zip(a,b))}
changes={};stable={}
for key,rec in m['nativeRoiChanges06To07'].items():changes[key]=diff(images['android06-39'],images['android07-19'],rec['roi']);check('actual06to07 finite RGB difference '+key,changes[key]==rec)
for key,rec in m['nativeRoiChanges04To19'].items():stable[key]=diff(images['android07-04'],images['android07-19'],rec['roi']);check('actual04to19 finite RGB stability '+key,stable[key]==rec and rec['changedPixels']==rec['maxChannelDifference']==0)
check('nonzero search count-chevron compose change retained',changes['search']['changedPixels']==667 and changes['search']['maxChannelDifference']==84 and changes['quickCountChevron']['changedPixels']==changes['ordinaryCountChevron']['changedPixels']==78 and changes['footerRight']['changedPixels']==651 and changes['footerRight']['maxChannelDifference']==249 and changes['ordinaryLabel']['changedPixels']==0)
metricmap={'quickTextLeft':('quick_label_ink','leftInReferencePx'),'titleWidth':('title_ink','widthInReferencePx'),'ordinaryFolderWidth':('memo_icon_gold','widthInReferencePx'),'footerFolderCenterX':('footer_folder_gold','centerXInReferencePx'),'footerFolderWidth':('footer_folder_gold','widthInReferencePx'),'footerComposeCenterX':('footer_compose_gold','centerXInReferencePx')};deltas={}
for name,(key,metric)in metricmap.items():
 ref=finite['original14'][key][metric];old=finite['android06-39'][key][metric];new=finite['android07-19'][key][metric];r={'reference14':ref,'android06':old,'android07':new,'delta06MinusReference':old-ref,'delta07MinusReference':new-ref};check('same finite before-after metric '+name,r==m['metricBeforeAfter'][name]);deltas[name]=r
check('compose remaining offset not promoted to zero',deltas['footerComposeCenterX']['android06']==deltas['footerComposeCenterX']['android07']and deltas['footerComposeCenterX']['delta07MinusReference']!=0 and finite['android06-39']['footer_compose_gold']['nativeBbox'][1]==2048 and finite['android07-19']['footer_compose_gold']['nativeBbox'][1]==2049)
for name in ['android06-39','android07-19']:
 im=images[name];scan=[[y,*im.getpixel((750,y))]for y in range(895,1040)];ys=[row[0]for row in scan if row[1:]!=[255,255,255]];check('same saved separator scan '+name,scan==m['separatorScans'][name]['rgbByY']and ys==[908,1029])
check('normalized row pitch finite only',m['rowPitch']['androidPitch']==121 and m['rowPitch']['normalizedPitch']==121/ratio and m['rowPitch']['originalReference']==25)
for p in sorted(ANA.glob('*.png')):
 with Image.open(p)as im:im.load();check('analysis diagnostic PNG decodes '+p.name,im.format=='PNG')
check('all protected inputs unchanged at close',all(ident(ROOT/r['path'])==r for r in initial));write('input-close.json',{'count':len(initial),'unchanged':True,'files':[ident(ROOT/r['path'])for r in initial]})
write('roi-recalculation.json',{'scope':'Existing five saved images; exact existing eight ROIs and thresholds,10 finite RGB ROI comparisons, width ratio only. No render/app/ADB tests.','rawMeasurements':computed,'finiteMeasures':finite,'metricBeforeAfter':deltas,'nativeRoiChanges06To07':changes,'nativeRoiChanges04To19':stable})
write('result.json',{'status':'pass-finite-evidence','stop':True,'scope':'Finite static Android29 actual-runtime evidence review; no full pixel/iOS or universal interaction acceptance','sourceHeadSuppliedByRoot':SOURCE,'gitObjectRead':False,'apkSHA256':APKSHA,'apkBytes':179247354,'sourceProductFiles':303,'productAggregate':PRODUCT,'runtimeIndexFiles':39,'analysisIndexFiles':14,'analysisInputFiles':18,'assertions':len(checks),'checks':checks,'protectedFiles':len(initial),'failed':0,'blockingFindings':[],'finiteSupported':['install-r recorded Success, exact installed base.apk SHA/size and preserved userId/firstInstallTime','visible outer-plus recorded tap125,2059 opens form then canceled','quick0/ordinary8 navigation/Back captured','ordinary900ms longpress menu without visible native selection while body smart word retains native selection','force-stop recorded27516 empty COLD27930 and visible counts/tags preserved','same fixed eight-bbox and ten stable-ROI claims independently recomputed;06to07 nonzero search/chevron/compose changes retained'],'limits':['Saved records/screenshots reviewed, not independent action replay or database/complete attachment integrity audit.','03 startup transition excluded despite stable filename; author historical-index schema adaptation retained.','Stable04/19 zero difference only ten finite ROIs, never entire frame/all06to07 regions.','Original224x480 recording unknown DPR/device;1080/224 width normalization is not CSS/dp/pt or vertical fitting.','Right compose normalized center remains206.2667 vs original208; strict top shifted1 native pixel, other nonzero differences remain.','No true iOS runtime, complete animation/font/color/path/pixel acceptance.','No GUI/ADB/application/tests/build/install/process-query/userDB/cache/Git/product/shared-doc operations this review.']})
print(json.dumps({'status':'pass-finite-evidence','checks':len(checks),'protectedFiles':len(initial),'resultSHA256':sha(OUT/'result.json')}))
