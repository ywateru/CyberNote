from pathlib import Path
from PIL import Image, ImageCms, ImageDraw
from collections import deque
import json,hashlib,io
ROOT=Path(__file__).resolve().parents[3];OUT=Path(__file__).resolve().parent
SOURCES={
 'original31-selected':'docs/research/mac-ordinary-original31/01-name-click-select-all.cua-image',
 'original31-caret':'docs/research/mac-ordinary-original31/02-name-caret-end.cua-image',
 'original29-selected':'docs/verification/mac-name-focus-runtime29/03-original-default-selected.cua-image',
 'mac12-selected':'docs/verification/mac-name-focus-runtime29/08-mac12-default-selected.cua-image',
 'mac13-initial':'docs/verification/mac-typography-keyboard-runtime36/05-ordinary-initial-selected.cua-image',
 'mac13-selected':'docs/verification/mac-typography-keyboard-runtime36/11-clean-explicit-name-selected.cua-image',
 'mac13-caret':'docs/verification/mac-typography-keyboard-runtime36/12-clean-name-caret-end.cua-image',
}
SRGB=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB'))
def component(im,t,roi=(650,400,1520,900),seed=(1088,720)):
 q=deque([seed]);seen={seed};found=[];pix=im.load()
 while q:
  x,y=q.popleft()
  if min(pix[x,y])<t:continue
  found.append((x,y))
  for p in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
   if roi[0]<=p[0]<roi[2] and roi[1]<=p[1]<roi[3] and p not in seen:seen.add(p);q.append(p)
 assert found
 return [min(x for x,y in found),min(y for x,y in found),max(x for x,y in found)+1,max(y for x,y in found)+1]
meta={};images={}
for name,rel in SOURCES.items():
 b=(ROOT/rel).read_bytes();s=Image.open(io.BytesIO(b));icc=s.info['icc_profile'];im=s.convert('RGB');boxes=None
 if im.size!=(800,414):
  boxes={str(t):component(im,t)for t in [190,195,200]};assert len({tuple(v)for v in boxes.values()})==1,boxes
  im=im.crop(boxes['190'])
 assert im.size==(800,414)
 meta[name]={'path':rel,'sourceSHA256':hashlib.sha256(b).hexdigest(),'sourcePixels':list(s.size),'format':s.format,'jpegComponents':s.layer,'iccBytes':len(icc),'iccSHA256':hashlib.sha256(icc).hexdigest(),'detection':boxes,'cropPixels':[800,414]}
 im.save(OUT/(name+'-raw.png'))
 images[name]=ImageCms.profileToProfile(im,ImageCms.ImageCmsProfile(io.BytesIO(icc)),SRGB,outputMode='RGB');images[name].save(OUT/(name+'-srgb.png'),icc_profile=SRGB.tobytes())
for filename,names in [('selected-native-srgb.png',['original31-selected','mac12-selected','mac13-initial','mac13-selected']),('caret-native-srgb.png',['original31-caret','mac13-caret'])]:
 canvas=Image.new('RGB',(800*2,450*((len(names)+1)//2)),'#ddd');d=ImageDraw.Draw(canvas)
 for i,name in enumerate(names):
  x=(i%2)*800;y=(i//2)*450;d.text((x+8,y+8),name+' | native 800x414 | ICC->sRGB',fill='black');canvas.paste(images[name],(x,y+36))
 canvas.save(OUT/filename,icc_profile=SRGB.tobytes())
canvas=Image.new('RGB',(820,145*len(images)),'#ddd');d=ImageDraw.Draw(canvas)
for i,(name,im)in enumerate(images.items()):
 y=i*145;d.text((5,y+5),name+' | nearest2x | no glyph registration',fill='black');canvas.paste(im.crop((35,115,280,158)).resize((490,86),Image.Resampling.NEAREST),(0,y+28));canvas.paste(im.crop((75,190,280,230)).resize((410,80),Image.Resampling.NEAREST),(410,y+28))
canvas.save(OUT/'glyphs-nearest2x-srgb.png',icc_profile=SRGB.tobytes())
(OUT/'preparation.json').write_text(json.dumps({'sources':meta,'method':'Prior29 fixed bright-component search ROI[650,400,1520,900),seed[1088,720],4connected minRGB190/195/200; integer crop,no scale/registration; own ICC->sRGB; JPEG originals untouched'},ensure_ascii=False,indent=2)+'\n')
print(json.dumps(meta,ensure_ascii=False))
