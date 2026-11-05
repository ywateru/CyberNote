from pathlib import Path
from PIL import Image,ImageChops,ImageDraw
import json
root=Path(__file__).resolve().parent;p=root/'comparison';p.mkdir(exist_ok=True)
ref=Image.open('docs/research/mobile-recording-sequence-01/representative/frame-n0960.png').convert('RGB')
old=Image.open(root/'baseline-first/mobile-paused-392x840.png').convert('RGB').resize((224,480),Image.Resampling.LANCZOS)
new=Image.open(root/'candidate-first/mobile-paused-392x840.png').convert('RGB').resize((224,480),Image.Resampling.LANCZOS)
assert ref.size==old.size==new.size==(224,480)
images={'reference':ref,'old':old,'new':new}
rois={'full':[0,0,224,480],'timer':[60,320,165,351],'playback-row':[50,360,175,405],'central-play':[95,360,130,405],'unchanged-header-wave':[0,25,224,310]}
inkrois={'timer':[60,320,165,351],'left-skip':[50,360,85,405],'central-play':[95,360,130,405],'right-skip':[140,360,174,405]}
def ink(im,roi,threshold):
 x0,y0,x1,y1=roi;points=[(x,y)for y in range(y0,y1)for x in range(x0,x1)if max(im.getpixel((x,y)))<threshold]
 if not points:return None
 bounds=[min(x for x,y in points),min(y for x,y in points),max(x for x,y in points)+1,max(y for x,y in points)+1]
 return {'boundsHalfOpen':bounds,'count':len(points),'width':bounds[2]-bounds[0],'height':bounds[3]-bounds[1],'center':[(bounds[0]+bounds[2]-1)/2,(bounds[1]+bounds[3]-1)/2]}
def metrics(a,b):
 diff=ImageChops.difference(a,b);r={}
 for name,roi in rois.items():
  vals=list(diff.crop(roi).getdata());n=len(vals)
  r[name]={'roi':roi,'meanAbsoluteChannelError':sum(map(sum,vals))/(n*3),'anyNonzeroRatio':sum(any(v)for v in vals)/n,'over16Ratio':sum(max(v)>16 for v in vals)/n}
 return r
canvas=Image.new('RGB',(672,505),'white');draw=ImageDraw.Draw(canvas)
for i,(name,im)in enumerate(images.items()):
 canvas.paste(im,(i*224,25));draw.text((i*224+5,6),name,fill='black');im.save(p/f'{name}-224x480.png')
canvas.save(p/'mobile-three-way-independent.png')
for name,im in [('old',old),('new',new)]:
 Image.blend(ref,im,.5).save(p/f'overlay-{name}.png');ImageChops.difference(ref,im).save(p/f'diff-{name}.png')
result={'boundary':{'sourceFrame':'n0960 preserved224x480','renderLogical':[392,840],'DPR':2,'renderPixels':[784,1680],'resize':'whole image aspect preserving LANCZOS224x480','bounds':'half open; centers reflect inclusive ink endpoints','masks':False,'pixelParity':'OPEN; lossy reference plus system/date/sample/transcription differences retained'},'ink':{name:{str(t):{r:ink(im,roi,t)for r,roi in inkrois.items()}for t in [96,160]}for name,im in images.items()},'old':metrics(ref,old),'new':metrics(ref,new),'candidateVsOld':metrics(old,new)}
(p/'metrics-independent.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'ink':result['ink'],'metrics':{name:{r:result[name][r]for r in ['timer','playback-row','central-play']}for name in ['old','new']},'unchangedHeaderWave':result['candidateVsOld']['unchanged-header-wave']},indent=2))
