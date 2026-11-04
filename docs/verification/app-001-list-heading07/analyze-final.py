from pathlib import Path
from PIL import Image,ImageDraw
import hashlib,json,statistics
r=Path.cwd();o=Path(__file__).resolve().parent;out=o/'webkit05'
paths={'baseline':o/'webkit04/baseline.png','final':out/'candidate.png','original17':r/'docs/verification/mac-sidebar-optical06-runtime-01/17-original-visible228.cua-image'}
records={};images={}
for name,p in paths.items():
 im=Image.open(p).convert('RGB');images[name]=im;thresholds={}
 for t in [120,160,200]:
  pts=[];rgb=[]
  for y in range(110,170):
   for x in range(476,566):
    c=im.getpixel((x,y))
    if 299*c[0]+587*c[1]+114*c[2]<t*1000 and max(c)-min(c)<25:pts.append((x,y));rgb.append(c)
  b=[min(x for x,y in pts),min(y for x,y in pts),max(x for x,y in pts)+1,max(y for x,y in pts)+1]
  thresholds[str(t)]={'bbox':b,'width':b[2]-b[0],'height':b[3]-b[1],'inkPixels':len(pts),'medianRGB':[statistics.median(c[i] for c in rgb) for i in range(3)],'meanLuminance':statistics.mean((299*c[0]+587*c[1]+114*c[2])/1000 for c in rgb)}
 samples=[{'y':y,'median':statistics.median(sum(im.getpixel((x,y)))/3 for x in range(476,756))} for y in range(170,195)];minimum=min(x['median'] for x in samples)
 records[name]={'identity':{'path':str(p.relative_to(r)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()},'thresholds':thresholds,'divider':{'primaryRows':[x['y'] for x in samples if x['median']==minimum],'minimumMedian':minimum,'samples':samples}}
d=json.loads((out/'candidate.json').read_text());assert d['status']=='metrics-ok' and not d['appActive'] and not d['webViewAttachedToWindow'];assert all(not x['visible'] and not x['main'] and not x['key'] for x in d['windowDiagnostics'])
f=records['final']['thresholds']['160'];a=records['original17']['thresholds']['160']
result={'status':'finite WK same-text final candidate measured','records':records,'threshold160SameBboxAsOriginal':f['bbox']==a['bbox'],'threshold160Residual':{'top':f['bbox'][1]-a['bbox'][1],'width':f['width']-a['width'],'height':f['height']-a['height'],'medianRGB':[f['medianRGB'][i]-a['medianRGB'][i] for i in range(3)]},'first':d['metrics']['cases'][0]['first'],'windowDiagnostics':d['windowDiagnostics'],'method':'Same unscaled half-open ROI[476,110,566,170], neutral luminance thresholds120/160/200; original saved JPEG and native WK lossless PNG.','limits':['Finite local same-text bounding-box evidence; no actual package/native input/persistence/full pixel acceptance.','Requested font and computed style do not identify original glyph font. Color and antialiasing residuals are retained.']}
(out/'measurements.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
sheet=Image.new('RGB',(340,390),'white');draw=ImageDraw.Draw(sheet)
for i,(name,im) in enumerate(images.items()):draw.text((5,130*i+3),name,fill='black');sheet.paste(im.crop((456,104,760,205)),(5,130*i+23))
sheet.save(out/'contact.png')
print(json.dumps({'status':result['status'],'bbox160':{k:v['thresholds']['160'] for k,v in records.items()},'dividers':{k:v['divider']['primaryRows'] for k,v in records.items()},'sameBbox160':result['threshold160SameBboxAsOriginal'],'residual':result['threshold160Residual']},ensure_ascii=False))
