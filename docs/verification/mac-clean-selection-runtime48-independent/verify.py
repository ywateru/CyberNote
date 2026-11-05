"""Independent finite recomputation from sealed JPEGs, in memory only."""
from pathlib import Path
from io import BytesIO
import hashlib,json,re,copy
import statistics
from PIL import Image,ImageCms,ImageDraw

R=Path('/Users/water/work/2026/Apple-Notes-Clone')
A=R/'docs/research/mac-clean-selection-runtime48-analysis'
S=R/'docs/research/mac-clean-selection-runtime48'
O=Path(__file__).resolve().parent
checks=[]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def load(p):return json.loads(p.read_text())
def save(n,v):(O/n).write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
def ck(n,v):checks.append({'name':n,'pass':bool(v)})
def record(p):return {'path':str(p.relative_to(R)),'bytes':p.stat().st_size,'sha256':sha(p),'mtimeNs':p.stat().st_mtime_ns}
idx=load(A/'evidence-index.json');opened=load(A/'input-open.json')
protected={R/e['path']for e in idx['files']}|{A/'evidence-index.json'}|{R/e['path']for e in opened['files']}
prior=R/'docs/verification/mac-selection-runtime47-analysis-independent/evidence-index.json'
protected.add(prior);protected.update(R/e['path']for e in load(prior)['files'])
before=[record(p)for p in sorted(protected)];save('input-open.json',{'count':len(before),'files':before})
ck('sealed analysis index',sha(A/'evidence-index.json')=='d74700a84ab364ecf66412f1e8e3cc8f1a0bb1c97e5b72784be14376639efb06')
ck('21 exact unique members',len(idx['files'])==idx['count']==len({e['path']for e in idx['files']})==21)
ck('complete analysis membership',{p for p in A.iterdir()if p.is_file()}=={R/e['path']for e in idx['files']}|{A/'evidence-index.json'})
for e in idx['files']:ck('analysis member '+e['path'],(R/e['path']).stat().st_size==e['bytes']and sha(R/e['path'])==e['sha256'])
for e in opened['files']:ck('upstream input '+e['path'],record(R/e['path'])==e)
d=load(A/'measurements.json');initial=load(A/'measurements-before-visual-qualification.json')
unqualified=copy.deepcopy(d);unqualified.pop('samplingQualification');unqualified.pop('savedProcessIdentity');unqualified['status']=initial['status']
for v in unqualified['measurements'].values():v.pop('threeHostProductComparisonUsable');v.pop('quality',None)
ck('qualification leaves all numerical observations intact',unqualified==initial)
raw={};srgb={};geometries={};profile=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB'))
for name,s in d['sources'].items():
    original=name.startswith('original-');state=name.split('-',1)[1];p=R/s['path']
    im=Image.open(p);im.load();icc=im.info['icc_profile'];rgb=im.convert('RGB')
    ck('raw JPEG ICC '+name,sha(p)==s['sourceSHA256']and im.format=='JPEG'and list(im.size)==s['sourcePixels']and list(im.size)==([800,414]if original else[2176,1320])and len(icc)==4064 and hashlib.sha256(icc).hexdigest()=='2b131b3ddbafff098096955b9e3a868ed9c261e5829a83704206086ca754c7bf'and [list(v)for v in im.layer]==[[1,2,2,0],[2,1,1,1],[3,1,1,1]])
    search=[0,0,800,414]if original else[650,400,1520,900];seed=[400,207]if original else[1088,720]
    expected=[0,0,800,414]if original else[688,453,1488,867];geometry={}
    ck('fixed search and seed '+name,s['search']==search and s['seed']==seed)
    # Pillow flood-fill supplies an independent four-connected component implementation.
    x0,y0,x1,y1=search
    for threshold in [190,195,200]:
        mask=Image.frombytes('L',(x1-x0,y1-y0),bytes(min(v)>=threshold for v in rgb.crop(search).getdata()))
        ck('bright seed '+name+str(threshold),mask.getpixel((seed[0]-x0,seed[1]-y0))==1)
        ImageDraw.floodfill(mask,(seed[0]-x0,seed[1]-y0),2)
        component=mask.point(lambda v:255 if v==2 else 0);bbox=component.getbbox()
        item={'bbox':[bbox[0]+x0,bbox[1]+y0,bbox[2]+x0,bbox[3]+y0],'componentPixels':mask.histogram()[2]}
        ck('recomputed component '+name+str(threshold),item==s['geometryByThreshold'][str(threshold)]and item['bbox']==expected)
        geometry[str(threshold)]=item
    geometries[name]=geometry
    ck('integer crop '+name,s['crop']==expected and s['cropPixels']==[800,414])
    x0,y0,x1,y1=expected;raw[name]=rgb.crop(expected)
    converted=ImageCms.profileToProfile(im,ImageCms.ImageCmsProfile(BytesIO(icc)),profile,outputMode='RGB')
    srgb[name]=converted.crop(expected)
    with Image.open(A/(name+'-form-srgb.png'))as png:
        png.load();desc=ImageCms.getProfileDescription(ImageCms.ImageCmsProfile(BytesIO(png.info['icc_profile']))).strip()
        ck('independent ICC conversion equals existing PNG '+name,png.format=='PNG'and png.size==(800,414)and'sRGB'in desc and srgb[name].tobytes()==png.tobytes())
    ax=(R/s['axPath']).read_text();m=re.search(r'Selected text: ```\n(.*?)\n```',ax,re.S);selected=m.group(1)if m else None
    ck('AX endpoint '+name,selected==s['selectedText']=={'all':'新建文件夹','partial':'建文','natural':None}[state]and(state!='natural'or'focused UI element'in ax))

def sample(roi,exclude=False):
    x0,y0,x1,y1=roi
    return [(x,y)for y in range(y0,y1)for x in range(x0,x1)if not(exclude and 268<=x<280)]
def pixels(im,coords):return [im.getpixel(p)for p in coords]
def median(im,coords):
    ps=pixels(im,coords);return [statistics.median(v[c]for v in ps)for c in range(3)]
def coverage(im,coords,t):
    ps=[p for p in coords if max(im.getpixel(p))<t]
    return {'pixels':len(ps),'bbox':[min(p[0]for p in ps),min(p[1]for p in ps),max(p[0]for p in ps)+1,max(p[1]for p in ps)+1]if ps else None}
def mae(a,b,coords):return sum(abs(x-y)for p in coords for x,y in zip(a.getpixel(p),b.getpixel(p)))/(len(coords)*3)
def xor(a,b,coords,t):return sum((max(a.getpixel(p))<t)!=(max(b.getpixel(p))<t)for p in coords)
core=[p for p in sample([141,125,268,149])if all(max(v.getpixel(p))<80 for v in raw.values())];partialCore=[p for p in core if 167<=p[0]<219]
ck('fixed nine-image core721 selected289',len(core)==721 and len(partialCore)==289)
ROIS={'name':[135,115,280,158],'nameLabel':[35,115,115,157],'smartLabel':[75,190,330,230]}
ck('fixed ROI coordinates',d['ROIs']==ROIS)
rawidx=load(S/'evidence-index.json')
ck('raw48 index exact',sha(S/'evidence-index.json')=='1dc6997273b1bcf39845f229e8d848843b421838200878c727c013d1caca79ff'and rawidx['count']==len(rawidx['files'])==27 and rawidx['pathsRelativeTo']=='evidence directory')
for e in rawidx['files']:ck('raw48 member '+e['path'],(S/e['path']).stat().st_size==e['bytes']and sha(S/e['path'])==e['sha256'])
for host,pid,exe,suffix in [('mac13',81681,'b24f87623e49781859166d798dec052cb987692469ad2741847392b13e127812','mac-typography-keyboard-build13/mac-attempt02/mac-sealed.app/Contents/MacOS/notes-clone'),('mac14',81752,'c9f7f35adc675c8058fabeb98f03fa7d1904a2c023e123cc396121264a8e211f','mac-ordinary-loop-build14/mac-attempt01/mac-sealed.app/Contents/MacOS/notes-clone')]:
    v=load(S/(host+'-process.json'));ck('saved process only '+host,v==d['savedProcessIdentity'][host]and d['identity'][host+'SavedPID']==pid and v['sha256']==exe and v['exe'].endswith(suffix)and v['process']==[str(pid)+' '+v['exe']])
ck('saved prior PID absence',d['savedProcessIdentity']['mac13']['previousMac14PID81260Absent']and d['savedProcessIdentity']['mac14']['previousMac13PID81681Absent'])
recomputed={};comparisons={}
for state in ['all','partial','natural']:
    for host in ['original','mac13','mac14']:
        name=host+'-'+state;ref='original-'+state;v=d['measurements'][name]
        c={'commonNineEndpointPixels':len(core),'rawMedian':median(raw[name],core),'srgbMedian':median(srgb[name],core),'partialSelectedCorePixels':len(partialCore),'partialSelectedCoreSrgbMedian':median(srgb[name],partialCore)}
        ck('complete core '+name,c==v['core']);rec={'core':c,'ink':{},'errors':{}}
        for key,roi in ROIS.items():
            coords=sample(roi,state=='natural'and key=='name');union=[p for p in coords if any(max(raw[h+'-'+state].getpixel(p))<200 for h in ['original','mac13','mac14'])]
            ink={space:{str(t):coverage(images[name],coords,t)for t in [100,160,200]}for space,images in [('raw',raw),('srgb',srgb)]}
            errors={'roi':roi,'samplePixels':len(coords),'naturalCommonCaretExclusion':[268,115,280,158]if state=='natural'and key=='name'else None,'fullRoiMAESrgb':mae(srgb[name],srgb[ref],coords),'commonThreeHostUnion200Pixels':len(union),'commonThreeHostUnionMAESrgb':mae(srgb[name],srgb[ref],union),'maskXor':{space:{str(t):xor(images[name],images[ref],coords,t)for t in [100,160,200]}for space,images in [('raw',raw),('srgb',srgb)]}}
            ck('complete coverage '+name+' '+key,ink==v['ink'][key]);ck('complete errors '+name+' '+key,errors==v['errors'][key]);rec['ink'][key]=ink;rec['errors'][key]=errors
        for key,roi in [('backgroundStrip',[172,120,215,124]if state=='partial'else[145,120,265,124]),('ringStrip',[300,107,340,111])]:
            stats={'roi':roi,'rawMedian':median(raw[name],sample(roi)),'srgbMedian':median(srgb[name],sample(roi))}
            ck('strip '+name+' '+key,all(v[key][k]==value for k,value in stats.items()));rec[key]=stats
        recomputed[name]=rec
    comparisons[state]={}
    for key,roi in ROIS.items():
        coords=sample(roi,state=='natural'and key=='name');a,b='mac13-'+state,'mac14-'+state
        v={'rawChangedPixels':sum(raw[a].getpixel(p)!=raw[b].getpixel(p)for p in coords),'srgbChangedPixels':sum(srgb[a].getpixel(p)!=srgb[b].getpixel(p)for p in coords),'rawMAE':mae(raw[a],raw[b],coords),'srgbMAE':mae(srgb[a],srgb[b],coords)}
        ck('complete old/new ROI '+state+' '+key,v==d['mac13vsMac14'][state][key]);comparisons[state][key]=v
partialSpans={}
for host in ['original','mac13','mac14']:
    n=host+'-partial';partialSpans[host]={}
    for key,roi in [('selectedJianWen',[167,115,219,158]),('unselectedXin',[135,115,167,158]),('unselectedJiaJia',[219,115,268,158])]:
        coords=sample(roi);v={'roi':roi,'coreMedianSrgb':median(srgb[n],[p for p in core if roi[0]<=p[0]<roi[2]]),'fullRoiMAESrgb':mae(srgb[n],srgb['original-partial'],coords),'rawMaskXor160':xor(raw[n],raw['original-partial'],coords,160)}
        ck('partial fixed cell '+host+' '+key,v==d['partialSpans'][host][key]);partialSpans[host][key]=v
naturalChanges={space:sum(x!=y for x,y in zip(images['mac13-natural'].getdata(),images['mac14-natural'].getdata()))for space,images in [('raw',raw),('srgb',srgb)]}
ck('natural entire800x414 raw and sRGB unchanged',naturalChanges=={'raw':0,'srgb':0}and d['mac13vsMac14']['natural']['fullFormRawChangedPixels']==0)
q=d['samplingQualification']
ck('all nine usable qualification',all(q[s]['threeHostComparisonUsable']is True for s in ['all','partial','natural'])and all(v['threeHostProductComparisonUsable']is True for v in d['measurements'].values()))
ck('core fixed rule caution','721'in q['coreCaution']and'289'in q['coreCaution']and'430'in q['coreCaution'])
ck('all MAE improves',recomputed['mac14-all']['errors']['name']['fullRoiMAESrgb']<recomputed['mac13-all']['errors']['name']['fullRoiMAESrgb'])
ck('partial name and selected improves',recomputed['mac14-partial']['errors']['name']['fullRoiMAESrgb']<recomputed['mac13-partial']['errors']['name']['fullRoiMAESrgb']and partialSpans['mac14']['selectedJianWen']['fullRoiMAESrgb']<partialSpans['mac13']['selectedJianWen']['fullRoiMAESrgb'])
ck('adverse partial unselected JiaJia retained',partialSpans['mac14']['unselectedJiaJia']['fullRoiMAESrgb']>partialSpans['mac13']['unselectedJiaJia']['fullRoiMAESrgb'])
ck('adverse sRGB160 preserved',[recomputed[h+'-all']['errors']['name']['maskXor']['srgb']['160']for h in ['mac13','mac14']]==[195,197])
ck('adverse right edge preserved',[recomputed[h+'-all']['ink']['name']['raw']['160']['bbox'][2]for h in ['original','mac13','mac14']]==[268,268,269])
after=[record(p)for p in sorted(protected)];ck('all protected SHA bytes mtime unchanged',before==after)
save('input-close.json',{'count':len(after),'unchanged':before==after,'files':after})
save('recomputed.json',{'method':'Independent Pillow floodfill and standard-library metrics reused from own47; each raw JPEG ICC conversion in memory; no new image render/output or alignment','geometry':geometries,'measurements':recomputed,'mac13vs14':comparisons,'partialSpans':partialSpans,'naturalFull800x414ChangedRGBPixels':naturalChanges,'coreCaution':q['coreCaution']})
failed=[v for v in checks if not v['pass']]
result={'status':'PASS finite clean48 saved-image evidence only'if not failed else'FAIL','stop':'READY STOP','analysisIndexSHA256':sha(A/'evidence-index.json'),'checks':len(checks),'passed':len(checks)-len(failed),'failed':failed,'protectedInputs':len(before),'protectedInputsUnchanged':before==after,'visualQualification':'All nine name endpoints free of visible pointer/halo; existing native and nearest2x montage inspected','natural13vs14':'Entire800x414 raw and sRGB changed pixels zero; original residual remains','selected':'All and partial selected name local color improvement; sRGB160195->197, raw right+1 and unselected JiaJia adverse preserved','manualViewedExisting':['glyphs-nearest2x-srgb.png','three-host-three-state-native-srgb.png'],'newGUIRuntimeRenderOperations':0,'limits':['No whole-pixel, font-outline, system color parameter or cross-platform acceptance','Fixed core screenshot darkness only, not native foreground constant','Original cropped capture cannot reconstruct outside framing; JPEG4:2:0 ICC AA limits remain','47 contaminated frames and UNKNOWN conclusions remain unchanged'],'details':checks}
save('result.json',result);print(json.dumps({k:v for k,v in result.items()if k!='details'},ensure_ascii=False,indent=2))
raise SystemExit(bool(failed))
