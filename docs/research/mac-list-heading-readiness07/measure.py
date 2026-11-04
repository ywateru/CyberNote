from pathlib import Path
from PIL import Image
import hashlib,json,statistics
ROOT=Path(__file__).resolve().parents[3];OUT=Path(__file__).resolve().parent
def h(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(name,data):(OUT/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
opened=json.loads((OUT/'inputs-open.json').read_text());extra=[ROOT/'docs/research/mac-zero-candidate04-geometry-01'/n for n in ['original-fill.jpg','clone-fill.jpg']]+[ROOT/'docs/verification/app-001-search-zero-geometry-01/source-candidate-01/typography-measurements.json']
append=[{'path':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':h(p)} for p in extra];save('inputs-append01.json',{'scope':'Existing production zero-result JPEG and historic typography diagnostic only; no new runtime','files':append})
def ink(im,roi,t):
 pts=[];rgb=[]
 for y in range(roi[1],roi[3]):
  for x in range(roi[0],roi[2]):
   c=im.getpixel((x,y))
   if 299*c[0]+587*c[1]+114*c[2]<t*1000 and max(c)-min(c)<25:pts.append((x,y));rgb.append(c)
 if not pts:return {'roi':roi,'threshold':t,'bbox':None,'inkPixels':0}
 b=[min(x for x,y in pts),min(y for x,y in pts),max(x for x,y in pts)+1,max(y for x,y in pts)+1]
 return {'roi':roi,'threshold':t,'bbox':b,'width':b[2]-b[0],'height':b[3]-b[1],'inkPixels':len(pts),'medianRGB':[statistics.median(c[i] for c in rgb) for i in range(3)]}
records={}
for row in opened['files']:
 p=ROOT/row['path']
 if p.suffix!='.cua-image':continue
 im=Image.open(p).convert('RGB');name=p.stem;hidden='hidden' in name;narrow='208' in name or name=='06-original-narrow';left=0 if hidden else 416 if narrow else 456
 titleX=300 if hidden else left+25
 rois={'title':[titleX,15,titleX+320,55],'count':[titleX,55,titleX+200,90],'firstDate':[left+20,110,left+110,170]}
 measures={k:{str(t):ink(im,roi,t) for t in [120,160,200]} for k,roi in rois.items()}
 line=[{'y':y,'medianLuminance':statistics.median(sum(im.getpixel((x,y)))/3 for x in range(left+20,left+300))} for y in range(170,195)]
 lineMin=min(x['medianLuminance'] for x in line);primary=[x['y'] for x in line if x['medianLuminance']==lineMin]
 records[name]={'path':row['path'],'size':list(im.size),'localListLeft':left,'listLeftEvidence':'Original228/208 AX plus same-left capture; clone labels derive root drag actions and 40px paired icon movement, not numeric clone AX.','text':measures,'firstGroupDivider':{'samples':line,'minimumMedian':lineMin,'primaryRows':primary}}
zero={}
for p in extra[:2]:
 im=Image.open(p).convert('RGB');zero[p.stem]={'path':str(p.relative_to(ROOT)),'size':list(im.size),'sectionROI':{str(t):ink(im,[480,110,590,170],t) for t in [120,160,200]}}
sources={r['path']:{'bytes':r['bytes'],'sha256':r['sha256']} for r in opened['files'] if r['path'] in ['src/App.tsx','src/style.css','plugins/tauri-plugin-notes-ui/macos/toolbar.m']}
sourceFacts={'title':{'font':'system13 semibold','frameY':9,'zeroFrameY':11},'count':{'font':'system11 regular','frameY':28,'zeroFrameY':27},'firstDate':{'fontSize':16,'fontWeight':700,'lineHeight':'normal/inherited','paddingTop':7,'height':39,'borderBottom':1},'laterDate':{'paddingTop':19,'height':49},'measuredZeroSection':{'fontSize':15,'fontWeight':700,'lineHeight':20,'paddingTop':9,'height':40,'borderBottom':0.5}}
save('measurements.json',{'sourceHead':opened['sourceHead'],'method':'Original decoded JPEG RGB; half-open absolute image boxes; neutral299R+587G+114B<t*1000 and channel spread<25; thresholds120/160/200; no scaling/registration.','records':records,'productionZeroReference':zero,'sourceFacts':sourceFacts,'sourceIdentities':sources,'limits':['Original exact typeface/size/weight not exposed by these screenshots.','No same-text today15px real WK fixture exists in the fixed evidence; candidate must be rendered after implementation.','Count7 vs11 differs; compare vertical span and glyph heights, do not normalize full text widths.','Pixel bbox/median does not prove native frames or whole-window parity.']})
for row in opened['files']+append:assert (ROOT/row['path']).stat().st_size==row['bytes'] and h(ROOT/row['path'])==row['sha256'],row['path']
print(json.dumps({'records':len(records),'fixedInputsUnchanged':len(opened['files'])+len(append),'results160':{k:{n:v['160'] for n,v in r['text'].items()} for k,r in records.items()}},ensure_ascii=False,indent=2))
