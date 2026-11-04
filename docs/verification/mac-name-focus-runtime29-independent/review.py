"""Static Mac29 evidence review only. No native app, tests, process queries or device operations."""
from pathlib import Path
from PIL import Image, ImageCms, ImageChops
import json,hashlib,io,statistics,datetime
ROOT=Path('/Users/water/work/2026/Apple-Notes-Clone');OUT=ROOT/'docs/verification/mac-name-focus-runtime29-independent';RUN=ROOT/'docs/verification/mac-name-focus-runtime29';ANA=ROOT/'docs/research/mac-name-focus-runtime29-analysis';PKG=ROOT/'docs/verification/unified-candidate06/mac-name-focus-build12';ART=ROOT/'artifacts/unified-candidate06/mac-name-focus-build12/mac-attempt01'
SOURCE='d7423070207684c5a2bb584281350723c44e9d9c';EXE='2549c676034aad46f9dd3189c9023549f829a8a53045b821491856050682e9f2';ZIP='0eed58ebbd774e9043c7e05638054e15b6ef02ff17de2c9e4c29293dd1030601'
checks=[]
def load(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def ident(p):return {'path':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':sha(p)}
def write(name,d):
 with (OUT/name).open('x')as f:f.write(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def check(name,ok):
 checks.append({'name':name,'pass':bool(ok)})
 if not ok:raise AssertionError(name)
def selected(s):return s.split('Selected text: ```\n')[1].split('\n```')[0] if 'Selected text: ```\n'in s else None
def ax(stem):return (RUN/(stem+'.ax.txt')).read_text()
ri=load(RUN/'evidence-index.json');ai=load(ANA/'evidence-index.json');im=load(ANA/'input-manifest.json');freeze=load(PKG/'input-freeze.json')
paths={RUN/'evidence-index.json',ANA/'evidence-index.json',PKG/'input-freeze.json',PKG/'mac-attempt01/collection/result.json',ART/'mac-sealed.app/Contents/MacOS/notes-clone',ART/'mac-sealed.zip'}
paths.update(ROOT/r['path']for r in ri['files']);paths.update(ANA/r['path']for r in ai['files']);paths.update(ROOT/r['path']for r in im['inputs']);paths.update(ROOT/r['path']for r in freeze['productFiles'])
for rel in ['docs/verification/unified-candidate06/mac-name-focus-independent12/result.json','docs/verification/unified-candidate06/mac-name-focus-independent12/evidence-index.json','docs/plan/reviews/mac-name-focus-independent12.md','artifacts/unified-candidate06/mac-ordinary-sidebar-build11/mac-attempt01/mac-sealed.app/Contents/MacOS/notes-clone']:
 paths.add(ROOT/rel)
initial=[ident(p)for p in sorted(paths)];write('input-initial.json',{'files':initial,'count':len(initial)})
check('exact runtime29 sealed index',sha(RUN/'evidence-index.json')=='d9110bf491a17288d701e13674f9ba31f4af15d08983a1bafa4a025313111518'and len(ri['files'])==58 and ri['pathBase']=='repository-root')
for r in ri['files']:check('runtime indexed identity '+r['path'],ident(ROOT/r['path'])==r)
check('exact finite analysis index',sha(ANA/'evidence-index.json')=='a6b9908ce06639c11786ddfe69a8989724ed7beaf937b0a8e913f0a0acc906c9'and len(ai['files'])==16 and ai['inputCount']==ai['unchangedInputCount']==17 and ai['pngCount']==12)
for r in ai['files']:check('analysis indexed identity '+r['path'],(ANA/r['path']).stat().st_size==r['bytes']and sha(ANA/r['path'])==r['sha256'])
for r in im['inputs']:check('seventeen exact finite-analysis input '+r['path'],(ROOT/r['path']).stat().st_size==r['bytes']and sha(ROOT/r['path'])==r['sha256'])
check('analysis closure is finite and unchanged',len(im['inputs'])==im['closingCount']==17 and im['allInputsUnchanged']and all(r['unchanged']for r in im['closingResults']))
for r in freeze['productFiles']:check('fixed current product '+r['path'],ident(ROOT/r['path'])==r)
agg=hashlib.sha256(''.join(r['sha256']+'  '+r['path']+'\n'for r in freeze['productFiles']).encode()).hexdigest()
check('same fixed source and303 product aggregate',freeze['head']==SOURCE and len(freeze['productFiles'])==303 and agg==freeze['productAggregate']=='7c83817061c438c388c9c52e8e0207ffb415a0847f9d0a320c59eac5a63363e5')
check('exact Mac12 executable ZIP and reviewed source chain',sha(ART/'mac-sealed.app/Contents/MacOS/notes-clone')==EXE and sha(ART/'mac-sealed.zip')==ZIP and sha(PKG/'input-freeze.json')=='529600e375e84df860a47cd6873a7aefd7faf4086ae4c5609c0b5010fea5ab9a'and sha(PKG/'mac-attempt01/collection/result.json')=='ad229e00bf49b87788c76d3225be7d58017ff51953df8121999a43ce0b802a56')
pr=load(ROOT/'docs/verification/unified-candidate06/mac-name-focus-independent12/result.json');check('prior exact independent package result pass',pr['status']=='pass'and pr['assertions']==494 and pr['sourceHeadSuppliedByRoot']==SOURCE and sha(ROOT/'docs/verification/unified-candidate06/mac-name-focus-independent12/result.json')=='8817dcfc97756e8d85bc3badaf69eea77754e089577574ce942ffa5daeff70b4')
proc=[('00-prior-mac11-process',46056),('02-prior-mac11-quit-process',None),('06-new-mac12-process',52413),('25-hidden-quit-process',None),('26-hidden-relaunch-process',53039),('29-visible-quit-process',None),('30-visible-relaunch-process',53139)]
times=[]
for stem,pid in proc:
 d=load(RUN/(stem+'.json'));times.append(d['at']);expected='3cc7188dff3213fdf1e7ca7c85373d3fe937ff8de8158fb187cb8679614e200d'if stem.startswith(('00','02'))else EXE
 check('recorded exact process endpoint '+stem,d['exists']and d['psExit']==0 and not d['stderr']and d['sha256']==expected and sha(Path(d['executable']))==expected and d['matchingRows']==([]if pid is None else[{'pid':pid,'executable':d['executable']}]))
check('ordered captured process chain',times==sorted(times))
check('default and partial native/clone selected text',all(selected(ax(s))==v for s,v in [('03-original-default-selected','新建文件夹'),('04-original-partial-selected','件夹'),('08-mac12-default-selected','新建文件夹'),('09-mac12-partial-selected','件夹'),('11-mac12-name-refocused','新建文件夹')]))
check('blur is checkbox focus only','The focused UI element is 9 checkbox 制作智能文件夹, Value: 0'in ax('10-mac12-name-blurred')and'名称, Value: 新建文件夹'in ax('10-mac12-name-blurred'))
check('replacement ordinary-smart-ordinary retains exact draft',all('名称, Value: QA-NAME-29-CANCEL'in ax(s)for s in ['12-mac12-name-replaced','13-mac12-smart-draft','14-mac12-back-ordinary'])and'heading 新建智能文件夹'in ax('13-mac12-smart-draft')and'heading 新建文件夹'in ax('14-mac12-back-ordinary'))
visible=['07-mac12-initial-visible','15-mac12-escape-closed','20-list-view-restored','23-toolbar-restored-visible','28-visible-before-normal-quit','31-visible-after-relaunch'];hidden=['16-toolbar-hidden','22-menu-hidden','24-hidden-before-normal-quit','27-hidden-after-relaunch']
for s in visible:check('visible synthetic counts and three-line body '+s,all(t in ax(s)for t in ['button 全部备忘录 41','button 备忘录 1','button Notes Clone UI 对照 8','button QA-SMART-U09-Mac-R18 0','button QA-SMART-U09-Mac-Selected 1','button #QASmartU09, Help: 1个备忘录','text entry area (settable) 备忘录正文, Value: QA-SMART-U09-Mac-Tag\n本地智能文件夹验收。\n#QASmartU09'])and'container 新建文件夹'not in ax(s))
for s in hidden:check('hidden sidebar with recovery control and body '+s,'button 全部备忘录'not in ax(s)and'button 显示或隐藏文件夹'in ax(s)and'text entry area (settable) 备忘录正文, Value: QA-SMART-U09-Mac-Tag\n本地智能文件夹验收。\n#QASmartU09'in ax(s))
check('normal quit hidden and visible endpoints preserved',ax('24-hidden-before-normal-quit')==ax('27-hidden-after-relaunch')and ax('28-visible-before-normal-quit')==ax('31-visible-after-relaunch'))
check('dynamic menu labels supported only by full records','显示文件夹, ID: customAction:'in ax('17-hidden-menu')and'隐藏文件夹, ID: customAction:'in ax('21b-visible-menu-full')and'no change'in ax('21-visible-menu'))
check('18 correctly excluded and19 actual sidebar restored','button 全部备忘录'not in ax('18-menu-restored-visible')and'text entry area'not in ax('18-menu-restored-visible')and'button 全部备忘录 41'in ax('19-actual-menu-restored-visible-gallery')and'text entry area'not in ax('19-actual-menu-restored-visible-gallery'))
a=load(RUN/'actions.json');check('limited actions and nonacceptance honest',a['sourceHead']==SOURCE and a['exeSha256']==EXE and a['pids']==[52413,53039,53139]and a['originalDeletionPaused']and set(a['excludedEvidence'])=={'18','21'}and all(x in a['notPassed']for x in ['all application pixel parity','cross-application activation','all immediate quit race timings','all data/internal ACK integrity']))
# Independent recomputation uses only the six sealed images, same fixed ROI and same integer crop.
m=load(ANA/'measurements.json');raw={};srgb={};derived=[];profile=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB'))
for name,r in m['sources'].items():
 p=ROOT/r['path'];src=Image.open(p);icc=src.info['icc_profile'];im=src.convert('RGB')
 check('source format ICC and native dimensions '+name,src.format=='JPEG'and list(src.size)==r['sourcePixels']and len(icc)==4064 and hashlib.sha256(icc).hexdigest()=='2b131b3ddbafff098096955b9e3a868ed9c261e5829a83704206086ca754c7bf')
 if im.size!=(800,414):im=im.crop((688,453,1488,867))
 raw[name]=im;srgb[name]=ImageCms.profileToProfile(im,ImageCms.ImageCmsProfile(io.BytesIO(icc)),profile,outputMode='RGB')
 check('same native crop independently ICC converted '+name,im.size==(800,414)and ImageChops.difference(srgb[name],Image.open(ANA/(name+'-srgb.png')).convert('RGB')).getbbox()is None)
for p in ANA.glob('*.png'):
 with Image.open(p)as image:image.load();check('derived PNG decodes with ICC '+p.name,image.format=='PNG'and bool(image.info.get('icc_profile')))
HALO=(190,85,350,225);CENTER=(300,104,600,116);INTERIOR=(138,118,750,155);CORNERS={'TL':(115,100,155,132),'TR':(734,100,774,132),'BL':(115,140,155,172),'BR':(734,140,774,172)};INK={'name':(135,115,280,158),'nameLabel':(35,115,115,157),'smartLabel':(75,190,330,230)}
def inside(pt,r):return r[0]<=pt[0]<r[2]and r[1]<=pt[1]<r[3]
def points(r,exclude=None):return[(x,y)for y in range(r[1],r[3])for x in range(r[0],r[2])if exclude is None or not inside((x,y),exclude)]
def median(im,r):return[statistics.median(v[c]for v in im.crop(r).getdata())for c in range(3)]
def gold(p):return p[0]>170 and p[1]>140 and p[0]-p[2]>35 and p[1]-p[2]>17.5
def mae(im,ref,pts):return sum(abs(a-b)for pt in pts for a,b in zip(im.getpixel(pt),ref.getpixel(pt)))/(len(pts)*3)
computed={}
for name in srgb:
 im=srgb[name];rec=m['measurements'][name];ref=srgb['original-partial'if'partial'in name else'original-all'];v={}
 if name in ['original-all','mac12-all']:
  inks={}
  for key,roi in INK.items():
   inks[key]={}
   for t in [100,160,200]:
    pts=[pt for pt in points(roi)if max(raw[name].getpixel(pt))<t];value={'bbox':[min(x for x,y in pts),min(y for x,y in pts),max(x for x,y in pts)+1,max(y for x,y in pts)+1],'pixels':len(pts)};inks[key][str(t)]=value
   check('same fixed clean ink bbox and coverage '+name+' '+key,inks[key]==rec['inkRaw'][key])
  v['inkRaw']=inks
  for key,roi,field in [('selection',(145,120,265,124),'selectionBackground'),('core',(300,107,340,111),'cleanCoreRingSrgb')]:
   value=median(im,roi);expected=rec[field]['srgbMedianRGB'if key=='selection'else'median'];check('same fixed sRGB median '+name+' '+key,value==expected);v[key]=value
  for side,roi in [('top',(300,110,340,115)),('bottom',(300,157,340,161))]:
   count=sum(145<=min(im.getpixel(pt))and max(im.getpixel(pt))<=215 and max(im.getpixel(pt))-min(im.getpixel(pt))<=6 for pt in points(roi));check('same finite gray inner-edge count '+name+' '+side,count==rec['neutralGrayInnerBands'][side]['pixels']==0)
 if name!='mac12-blurred':
  cp=points(CENTER,HALO);v['centerMAE']=mae(im,ref,cp);check('same finite center MAE '+name,len(cp)==rec['centerBand']['remainingPixels']==3000 and v['centerMAE']==rec['centerBand']['meanAbsoluteChannelDifferenceVsPairedOriginal'])
  v['corners']={}
  for key,roi in CORNERS.items():
   pts=[pt for pt in points(roi,HALO)if not inside(pt,INTERIOR)];err=sum(gold(im.getpixel(pt))!=gold(ref.getpixel(pt))for pt in pts);value=mae(im,ref,pts);expected=rec['ringCornerMetrics'][key];check('same finite corner residual '+name+' '+key,err==expected['goldMaskDisagreementVsPairedOriginal']and value==expected['meanAbsoluteChannelDifferenceVsPairedOriginal']);v['corners'][key]={'goldMaskDisagreement':err,'mae':value}
 v['goldRowsX600']={'top':[y for y in range(100,117)if gold(im.getpixel((600,y)))],'bottom':[y for y in range(154,170)if gold(im.getpixel((600,y)))]};check('same focus gold-line endpoints '+name,v['goldRowsX600']==rec['strongGoldRowsX600']);computed[name]=v
check('known duplicated original is not new sample',sha(RUN/'03-original-default-selected.cua-image')=='973718945e025e30aa64ea1540872b4ce1f5af67b8f5a085feb7739dc6d56090')
check('all protected files unchanged at close',all(ident(ROOT/r['path'])==r for r in initial))
write('input-close.json',{'count':len(initial),'unchanged':True,'files':[ident(ROOT/r['path'])for r in initial]})
write('roi-recalculation.json',{'scope':'Independent same fixed six images/native integer crop/ICC and fixed ROI recomputation only. No new rendering or app tests.','computed':computed,'partialHaloExcluded':HALO,'noPartialCoverageOrSelectionColor':True,'noOriginalBlurRefocusPixelAcceptance':True})
write('result.json',{'status':'pass','stop':True,'scope':'Finite static actual Mac29 evidence review only; no application-wide pixel or universal interaction acceptance','sourceHeadSuppliedByRoot':SOURCE,'gitObjectRead':False,'checks':checks,'assertions':len(checks),'failed':0,'protectedFiles':len(initial),'runtimeIndexedFiles':58,'analysisIndexedFiles':16,'analysisFixedInputs':17,'sourceProductFiles':303,'sourceProductAggregate':freeze['productAggregate'],'exeSha256':EXE,'zipSha256':ZIP,'pids':[52413,53039,53139],'blockingFindings':[],'finiteSupported':['default all selection and partial 件夹 selection','checkbox Tab/ShiftTab endpoint refocus with whole selection','recorded genuine draft replacement and ordinary-smart-ordinary retention','recorded Escape with dialog absent and synthetic body/count endpoints preserved','toolbar hide/menu show at19 then list restored20; menu hide/toolbar show','normal quit/relaunch hidden then visible preference; distinct exact process IDs','same fixed visual ROI position/coverage/color/ring numbers independently reproduced'],'limits':['Captured action narrative plus AX/image endpoints reviewed, not an independent replay or raw keyboard event proof.','18 misleading filename excluded;21 AX diff not used for menu label;21b full menu used.','03 original all-selected image repeats earlier sample, not a new independent image.','No cross-application deactivation or immediate-quit race acceptance.','Only visible synthetic content/count retention; no user DB/internal ACK/integrity proof.','JPEG/ICC/halo/host limitations preserved; no whole pixel PASS or font/weight inference.','No native app/GUI/ADB/build/install/test/process-query/cache/Git operations this review.']})
print(json.dumps({'status':'pass','checks':len(checks),'protected':len(initial),'resultSHA256':sha(OUT/'result.json')}))
