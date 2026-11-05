"""Independent finite recomputation from sealed JPEGs, in memory only."""
from pathlib import Path
from io import BytesIO
import hashlib,json,re,copy
import statistics
from PIL import Image,ImageCms,ImageDraw

R=Path('/Users/water/work/2026/Apple-Notes-Clone')
A=R/'docs/research/mac-ordinary-selection-runtime47-analysis'
O=Path(__file__).resolve().parent
checks=[]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def load(p):return json.loads(p.read_text())
def save(n,v):(O/n).write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
def ck(n,v):checks.append({'name':n,'pass':bool(v)})
def record(p):return {'path':str(p.relative_to(R)),'bytes':p.stat().st_size,'sha256':sha(p),'mtimeNs':p.stat().st_mtime_ns}
idx=load(A/'evidence-index.json');opened=load(A/'input-open.json')
protected={R/e['path']for e in idx['files']}|{A/'evidence-index.json'}|{R/e['path']for e in opened['files']}
before=[record(p)for p in sorted(protected)];save('input-open.json',{'count':len(before),'files':before})
ck('sealed analysis index',sha(A/'evidence-index.json')=='0772ed95f12b517053ce6fc3365b0499f55ffd17b8537ed4374bcddf9c69b15c')
ck('23 exact unique members',len(idx['files'])==idx['count']==len({e['path']for e in idx['files']})==23)
ck('complete analysis membership',{p for p in A.iterdir()if p.is_file()}=={R/e['path']for e in idx['files']}|{A/'evidence-index.json'})
for e in idx['files']:ck('analysis member '+e['path'],(R/e['path']).stat().st_size==e['bytes']and sha(R/e['path'])==e['sha256'])
for e in opened['files']:ck('upstream input '+e['path'],record(R/e['path'])==e)
d=load(A/'measurements.json');initial=load(A/'measurements-before-visual-qualification.json')
unqualified=copy.deepcopy(d);unqualified.pop('samplingQualification');unqualified['status']=initial['status']
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
ck('fixed prequalification nine-image core 430',len(core)==430)
ROIS={'name':[135,115,280,158],'nameLabel':[35,115,115,157],'smartLabel':[75,190,330,230]}
ck('fixed ROI coordinates',d['ROIs']==ROIS)
recomputed={}
for host in ['original','mac13','mac14']:
    name=host+'-all';ref='original-all';v=d['measurements'][name]
    c={'commonNineEndpointPixels':len(core),'rawMedian':median(raw[name],core),'srgbMedian':median(srgb[name],core),'partialSelectedCorePixels':len(partialCore),'partialSelectedCoreSrgbMedian':median(srgb[name],partialCore)}
    ck('all complete core '+host,c==v['core']);r={'core':c,'ink':{},'errors':{}}
    for key,roi in ROIS.items():
        coords=sample(roi);union=[p for p in coords if any(max(raw[h+'-all'].getpixel(p))<200 for h in ['original','mac13','mac14'])]
        ink={space:{str(t):coverage(images[name],coords,t)for t in [100,160,200]}for space,images in [('raw',raw),('srgb',srgb)]}
        errors={'roi':roi,'samplePixels':len(coords),'naturalCommonCaretExclusion':None,'fullRoiMAESrgb':mae(srgb[name],srgb[ref],coords),'commonThreeHostUnion200Pixels':len(union),'commonThreeHostUnionMAESrgb':mae(srgb[name],srgb[ref],union),'maskXor':{space:{str(t):xor(images[name],images[ref],coords,t)for t in [100,160,200]}for space,images in [('raw',raw),('srgb',srgb)]}}
        ck('all complete coverage '+host+' '+key,ink==v['ink'][key]);ck('all complete errors '+host+' '+key,errors==v['errors'][key]);r['ink'][key]=ink;r['errors'][key]=errors
    for key,roi in [('backgroundStrip',[145,120,265,124]),('ringStrip',[300,107,340,111])]:
        stats={'roi':roi,'rawMedian':median(raw[name],sample(roi)),'srgbMedian':median(srgb[name],sample(roi))}
        ck('all strip '+host+' '+key,all(v[key][k]==value for k,value in stats.items()));r[key]=stats
    recomputed[name]=r
for key,roi in ROIS.items():
    coords=sample(roi);a,b='mac13-all','mac14-all';v={'rawChangedPixels':sum(raw[a].getpixel(p)!=raw[b].getpixel(p)for p in coords),'srgbChangedPixels':sum(srgb[a].getpixel(p)!=srgb[b].getpixel(p)for p in coords),'rawMAE':mae(raw[a],raw[b],coords),'srgbMAE':mae(srgb[a],srgb[b],coords)}
    ck('all complete old/new ROI '+key,v==d['mac13vsMac14']['all'][key])
q=d['samplingQualification']
ck('all usable qualification',q['all']['threeHostComparisonUsable']is True)
ck('partial/natural UNKNOWN qualification',all(q[s]['status']=='UNKNOWN'and q[s]['threeHostComparisonUsable']is False for s in ['partial','natural']))
ck('qualification per endpoint',all(v['threeHostProductComparisonUsable']==n.endswith('-all')for n,v in d['measurements'].items()))
ck('core contamination caution retained','430'in q['coreCaution']and'halo'in q['coreCaution'])
for host in ['original','mac13','mac14']:
    n=host+'-natural';coords=sample(ROIS['name'],True)
    ck('natural contaminated count retained '+host,coverage(raw[n],coords,160)==d['measurements'][n]['ink']['name']['raw']['160'])
ck('adverse sRGB160 preserved',[recomputed[h+'-all']['errors']['name']['maskXor']['srgb']['160']for h in ['mac13','mac14']]==[195,197])
ck('adverse right edge preserved',[recomputed[h+'-all']['ink']['name']['raw']['160']['bbox'][2]for h in ['original','mac13','mac14']]==[268,268,269])
after=[record(p)for p in sorted(protected)];ck('all protected SHA bytes mtime unchanged',before==after)
save('input-close.json',{'count':len(after),'unchanged':before==after,'files':after})
save('recomputed.json',{'method':'Independent Pillow floodfill and standard-library metrics, each raw JPEG ICC conversion in memory; no new image render/output or image alignment','geometry':geometries,'all':recomputed,'coreCaution':q['coreCaution']})
failed=[v for v in checks if not v['pass']]
result={'status':'PASS finite local color evidence and contamination boundaries only'if not failed else'FAIL','stop':'READY STOP','analysisIndexSHA256':sha(A/'evidence-index.json'),'checks':len(checks),'passed':len(checks)-len(failed),'failed':failed,'protectedInputs':len(before),'protectedInputsUnchanged':before==after,'all':'Independent full finite all metrics agree; local color improvement only; sRGB160195->197 and raw bbox+1 adverse values retained','partial':'UNKNOWN: original46 and Mac13 pointer/halo visible','natural':'UNKNOWN: original46 and Mac13 pointer/halo visible','manualViewedExisting':['glyphs-nearest2x-srgb.png','three-host-three-state-native-srgb.png'],'newGUIRuntimeRenderOperations':0,'no48Read':True,'limits':['No whole-pixel, font-outline, system color parameter or cross-platform acceptance','Core fixed from nine images includes contaminated states; not native foreground constant','Original cropped capture cannot reconstruct outside framing; JPEG4:2:0 ICC AA limits remain'],'details':checks}
save('result.json',result);print(json.dumps({k:v for k,v in result.items()if k!='details'},ensure_ascii=False,indent=2))
raise SystemExit(bool(failed))
