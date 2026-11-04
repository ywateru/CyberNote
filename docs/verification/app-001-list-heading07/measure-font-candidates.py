from pathlib import Path
from PIL import Image,ImageDraw
import hashlib,json,statistics
r=Path.cwd();o=Path(__file__).resolve().parent;out=o/'font-candidates01'
paths={'original17':r/'docs/verification/mac-sidebar-optical06-runtime-01/17-original-visible228.cua-image','font15':o/'webkit04/candidate.png','font15.25':out/'font-15_25.png','font15.5':out/'font-15_5.png'}
records={};images={}
for name,p in paths.items():
 im=Image.open(p).convert('RGB');images[name]=im;measures={}
 for t in [120,160,200]:
  pts=[];rgb=[]
  for y in range(110,170):
   for x in range(476,566):
    c=im.getpixel((x,y))
    if 299*c[0]+587*c[1]+114*c[2]<t*1000 and max(c)-min(c)<25:pts.append((x,y));rgb.append(c)
  b=[min(x for x,y in pts),min(y for x,y in pts),max(x for x,y in pts)+1,max(y for x,y in pts)+1]
  measures[str(t)]={'bbox':b,'width':b[2]-b[0],'height':b[3]-b[1],'inkPixels':len(pts),'medianRGB':[statistics.median(c[i] for c in rgb) for i in range(3)],'meanLuminance':statistics.mean((299*c[0]+587*c[1]+114*c[2])/1000 for c in rgb)}
 samples=[{'y':y,'median':statistics.median(sum(im.getpixel((x,y)))/3 for x in range(476,756))} for y in range(170,195)];minimum=min(x['median'] for x in samples)
 records[name]={'identity':{'path':str(p.relative_to(r)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()},'thresholds':measures,'divider':{'primaryRows':[x['y'] for x in samples if x['median']==minimum],'minimumMedian':minimum,'samples':samples}}
for name in ['font15.25','font15.5']:assert records[name]['divider']['primaryRows']==[183],name
result={'status':'two bounded fixture candidates measured; root chooses product value','method':'Same unscaled RGB neutral ink predicate and half-open ROI[476,110,566,170] as readiness07; thresholds120/160/200. MedianRGB/meanLuminance only over threshold-selected neutral ink.','records':records,'limits':'Saved original is JPEG, new WK is lossless PNG. Bounding boxes and tone distributions are local finite evidence, not exact typeface identity or whole-app pixel acceptance.'}
(out/'measurements.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
sheet=Image.new('RGB',(340,130*len(images)),'white');draw=ImageDraw.Draw(sheet)
for i,(name,im) in enumerate(images.items()):draw.text((5,130*i+3),name,fill='black');sheet.paste(im.crop((456,104,760,205)),(5,130*i+23))
sheet.save(out/'contact.png')
print(json.dumps({'results':{k:v['thresholds'] for k,v in records.items()},'dividers':{k:v['divider']['primaryRows'] for k,v in records.items()}},ensure_ascii=False,indent=2))
