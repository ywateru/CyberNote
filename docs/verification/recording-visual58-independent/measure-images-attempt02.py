from pathlib import Path
from PIL import Image,ImageChops,ImageDraw
import json
root=Path('/private/tmp/apple-notes-recording-visual58-independent-01')
out=root/'docs/verification/recording-visual58-independent';p=out/'comparison';p.mkdir(exist_ok=True)
ref=Image.open(root/'references/desktop/recording-20261105/user-recording-sidebar.png').convert('RGB').crop((1999,164,2559,1098))
old=Image.open(out/'baseline-first/desktop-paused-280x467.png').convert('RGB')
new=Image.open(out/'candidate-first/desktop-paused-280x467.png').convert('RGB')
assert ref.size==old.size==new.size==(560,934)
ref.save(p/'desktop-reference-crop.png')
rois={'full':[0,0,560,934],'title-and-date':[24,38,260,120],'top-controls':[414,40,536,94],'waveform-dynamic':[0,128,560,542],'time-axis':[0,528,560,590],'timer':[160,650,400,716],'playback':[150,735,410,795],'continue-state-diff':[126,816,434,912],'done':[442,815,536,912]}
def metrics(a,b,rs):
 diff=ImageChops.difference(a,b)
 result={}
 for n,r in rs.items():
  values=list(diff.crop(r).getdata());count=len(values)
  result[n]={'bounds':r,'meanAbsoluteChannelError':round(sum(sum(v) for v in values)/(count*3),4),'changedPixelRatio':round(sum(any(v) for v in values)/count,6),'pixelRatioOver16':round(sum(max(v)>16 for v in values)/count,6)}
 return result
def bbox(im,roi,mode):
 x0,y0,x1,y1=roi;points=[]
 for y in range(y0,y1):
  for x in range(x0,x1):
   r,g,b=im.getpixel((x,y))
   match=max(r,g,b)<80 if mode=='black' else r>170 and g>90 and g<220 and b<140 and r>g*1.05
   if match:points.append((x,y))
 return [min(x for x,y in points),min(y for x,y in points),max(x for x,y in points)+1,max(y for x,y in points)+1] if points else None
geometry={name:{'titleInk':bbox(im,[20,30,150,85],'black'),'timerInk':bbox(im,[160,650,400,716],'black'),'playTriangleInk':bbox(im,[250,730,310,795],'black'),'doneGold':bbox(im,[435,805,540,920],'gold'),'playheadGold':bbox(im,[270,120,290,550],'gold')} for name,im in [('reference',ref),('old',old),('new',new)]}
canvas=Image.new('RGB',(1680,964),'white');draw=ImageDraw.Draw(canvas)
for i,(name,im) in enumerate([('Apple preserved crop',ref),('Old50144de actualView',old),('New8a305475 actualView',new)]):canvas.paste(im,(i*560,30));draw.text((i*560+10,8),name,fill='black')
canvas.save(p/'desktop-three-way-independent.png')
for name,im in [('old',old),('new',new)]:
 Image.blend(ref,im,.5).save(p/f'desktop-overlay-{name}.png');ImageChops.difference(ref,im).save(p/f'desktop-diff-{name}.png')
mr=Image.open(root/'docs/research/mobile-recording-sequence-01/representative/frame-n0960.png').convert('RGB')
mo=Image.open(out/'baseline-first/mobile-paused-392x840.png').convert('RGB').resize((224,480),Image.Resampling.LANCZOS)
mn=Image.open(out/'candidate-first/mobile-paused-392x840.png').convert('RGB').resize((224,480),Image.Resampling.LANCZOS)
assert mr.size==(224,480)
mrois={'full-with-system-differences':[0,0,224,480],'header':[65,59,158,93],'waveform-dynamic':[0,104,224,270],'axis-union-of-old-new-ref':[0,245,224,285],'timer':[60,326,164,349],'playback':[50,365,175,400],'continue':[68,413,157,450]}
mc=Image.new('RGB',(672,505),'white');draw=ImageDraw.Draw(mc)
for i,(name,im) in enumerate([('Apple frame n0960',mr),('Old actualView',mo),('New actualView',mn)]):mc.paste(im,(i*224,25));draw.text((i*224+5,6),name,fill='black')
mc.save(p/'mobile-three-way-independent.png')
for name,im in [('reference',mr),('old',mo),('new',mn)]:im.save(p/f'mobile-{name}-224x480.png')
Image.blend(mr,mn,.5).save(p/'mobile-overlay-new.png');ImageChops.difference(mr,mn).save(p/'mobile-diff-new.png')
result={'boundary':{'desktopCrop':[1999,164,560,934],'renderLogical':[280,467],'DPR':2,'sourceDPR':'unproven explicit2x comparison only','mobileRender':[392,840],'mobileComparison':[224,480],'mobileResize':'aspect preserving LANCZOS; lossy source only coarse geometry','masks':False,'dynamicDifferences':'Synthetic samples differ from real amplitude; date and total reflect controlled props. Ordinary paused Continue enabled red vs reference disabled gray, reference exact media state unknown. Mobile native status/Home/transcription differ; none excluded from full score.'},'desktop':{'old':metrics(ref,old,rois),'new':metrics(ref,new,rois)},'desktopInk':geometry,'mobile':{'old':metrics(mr,mo,mrois),'new':metrics(mr,mn,mrois)},'mobilePlayheadGold':{name:bbox(im,[107,90,119,280],'gold') for name,im in [('reference',mr),('old',mo),('new',mn)]}}
(p/'metrics-independent.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'desktopFull':{n:result['desktop'][n]['full'] for n in ['old','new']},'ink':geometry,'mobile':result['mobilePlayheadGold'],'mobileAxis':{n:result['mobile'][n]['axis-union-of-old-new-ref'] for n in ['old','new']}},indent=2))
