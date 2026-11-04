from pathlib import Path
from PIL import Image,ImageDraw
import hashlib,json,statistics
r=Path.cwd();o=Path(__file__).resolve().parent;p=o/'webkit03'
def ident(f):
 b=f.read_bytes();return dict(path=str(f.relative_to(r)),bytes=len(b),sha256=hashlib.sha256(b).hexdigest())
def ink(im,roi,t):
 pts=[]
 for y in range(roi[1],roi[3]):
  for x in range(roi[0],roi[2]):
   c=im.getpixel((x,y))
   if 299*c[0]+587*c[1]+114*c[2]<t*1000 and max(c)-min(c)<25:pts.append((x,y))
 b=[min(x for x,y in pts),min(y for x,y in pts),max(x for x,y in pts)+1,max(y for x,y in pts)+1] if pts else None
 return dict(threshold=t,roi=roi,bbox=b,width=b[2]-b[0] if b else None,height=b[3]-b[1] if b else None,pixels=len(pts))
inputs={'baselineWK':p/'baseline.png','candidateWK':p/'candidate.png','original17':r/'docs/verification/mac-sidebar-optical06-runtime-01/17-original-visible228.cua-image'}
rows={};images={}
for label,f in inputs.items():
 im=Image.open(f).convert('RGB');images[label]=im
 samples=[dict(y=y,median=statistics.median(sum(im.getpixel((x,y)))/3 for x in range(476,756))) for y in range(170,195)]
 minimum=min(x['median'] for x in samples)
 rows[label]={'identity':ident(f),'size':list(im.size),'ink':{str(t):ink(im,[476,110,566,170],t) for t in [120,160,200]},'divider':{'samples':samples,'minimumMedian':minimum,'primaryRows':[x['y'] for x in samples if x['median']==minimum]}}
base=rows['baselineWK']['ink']['160'];candidate=rows['candidateWK']['ink']['160'];original=rows['original17']['ink']['160']
diag=json.loads((p/'window-diagnostic.json').read_text());assert not diag['appActive'] and not diag['webViewAttachedToWindow'];assert all(not w['visible'] and not w['key'] and not w['main'] for w in diag['windowDiagnostics'])
assert candidate['bbox'][1]==original['bbox'][1] and candidate['height']==original['height'],'Same-text candidate top/height must match this original ROI'
assert rows['candidateWK']['divider']['primaryRows']==[183]
result={'status':'pass finite same-text raster check','method':'Native WK snapshots at DPR2; decoded original saved JPEG; no scaling/registration; same half-open ROI and neutral luminance thresholds as readiness07.','records':rows,'threshold160DeltaFromBaseline':{'top':candidate['bbox'][1]-base['bbox'][1],'width':candidate['width']-base['width'],'height':candidate['height']-base['height']},'windowDiagnostic':{k:v for k,v in diag.items() if k!='metrics'},'limits':['WK uses full production CSS and App DOM structure, without React application/native toolbar/user input/persistence.','TUINSWindow is framework-created, invisible, not key/main; harness does not construct/order/activate an NSWindow.','Original image is previously recorded JPEG with different whole-window extent; this is a local same-text check, not package or whole-window acceptance.','Font identity, original exact size/weight, color and horizontal residuals remain open.']}
(o/'webkit-ink.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
sheet=Image.new('RGB',(340,3*130),'white');draw=ImageDraw.Draw(sheet)
for i,(label,im) in enumerate(images.items()):
 draw.text((5,i*130+3),label,fill='black');sheet.paste(im.crop((456,104,760,205)),(5,i*130+23))
sheet.save(o/'webkit-first-group-contact.png')
print(json.dumps({'status':result['status'],'ink160':{k:v['ink']['160'] for k,v in rows.items()},'dividers':{k:v['divider']['primaryRows'] for k,v in rows.items()},'delta':result['threshold160DeltaFromBaseline']},ensure_ascii=False))
