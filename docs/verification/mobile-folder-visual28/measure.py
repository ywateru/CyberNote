from pathlib import Path
from PIL import Image,ImageChops,ImageDraw
import json,math
D=Path(__file__).resolve().parent;R=D.parents[2];ratio=1080/224
runs={'baseline':D/'baseline-attempt06','candidate':D/'candidate-attempt03'}
ims={k:Image.open(v/'mobile.png').convert('RGB')for k,v in runs.items()}
snaps={k:json.loads((v/'result.json').read_text())['snapshots']['mobile'] for k,v in runs.items()}
def bbox(im,roi,pred):
 points=[(x,y)for y in range(roi[1],roi[3])for x in range(roi[0],roi[2])if pred(im.getpixel((x,y)))];return [min(x for x,y in points),min(y for x,y in points),max(x for x,y in points)+1,max(y for x,y in points)+1]if points else None
def roi(rect,scale,pad=0,right=0):return [math.floor((rect['x']-pad)*scale),math.floor((rect['y']-pad)*scale),math.ceil((rect['x']+rect['width']+pad+right)*scale),math.ceil((rect['y']+rect['height']+pad)*scale)]
gold=lambda p:p[0]>140 and p[1]>95 and p[2]<.65*p[0] and p[0]>1.06*p[1]
dark=lambda p:max(p)<160
out={};rois={}
for key,s in snaps.items():
 im=ims[key];scale=s['dpr'];q=s['rows'][0];f=next(r for r in s['rows']if r['text']=='备忘录8')
 regions={'title':roi(s['title']['rect'],scale),'quickLabel':roi(q['children'][1]['rect'],scale),'quickIcon':roi(q['children'][0]['rect'],scale,2),'closedFolder':roi(f['children'][0]['rect'],scale,2),'footerAdd':roi(s['buttons'][0]['rect'],scale,2,12)}
 rois[key]=regions;out[key]={}
 for name,region in regions.items():
  b=bbox(im,region,dark if name in ['title','quickLabel']else gold)
  out[key][name]={'roi':region,'nativeBbox':b,'referenceUnits':{'left':b[0]/ratio,'width':(b[2]-b[0])/ratio,'height':(b[3]-b[1])/ratio,'centerX':(b[0]+b[2])/2/ratio},'logicalInkCenterY':(b[1]+b[3])/2/scale}
geometry={}
for n in ['title','search','footer','buttons']:
 a=snaps['baseline'][n];b=snaps['candidate'][n]
 geometry[n+'RectSame']=([x['rect']for x in a]==[x['rect']for x in b])if isinstance(a,list)else a['rect']==b['rect']
geometry['rowOuterRectsSame']=[r['rect']for r in snaps['baseline']['rows']]==[r['rect']for r in snaps['candidate']['rows']]
geometry['allCountChevronRectsSame']=[[r['children'][i]['rect']for i in [2,3]]for r in snaps['baseline']['rows']]==[[r['children'][i]['rect']for i in [2,3]]for r in snaps['candidate']['rows']]
geometry['nonQuickLabelRectsSame']=[r['children'][1]['rect']for r in snaps['baseline']['rows'][1:]]==[r['children'][1]['rect']for r in snaps['candidate']['rows'][1:]]
for kind in ['desktop','notes']:
 a=Image.open(runs['baseline']/(kind+'.png')).convert('RGB');b=Image.open(runs['candidate']/(kind+'.png')).convert('RGB');pairs=list(zip(a.getdata(),b.getdata()));geometry[kind+'ChangedPixels']=sum(x!=y for x,y in pairs)
ref=json.loads((R/'docs/research/android-folders-readiness27/measurements.json').read_text())['finiteMeasures']
original=Image.open(R/'references/mobile/frames-2s/frame-008.png').convert('RGB');refregions={'quickIcon':(13,114,35,133),'closedFolder':(13,246,35,270),'footerAdd':(4,434,36,463)}
# Local comparison has uniform whole-screen width normalization only; no shape score is derived from its sampling.
for name,refroi in refregions.items():
 canvas=Image.new('RGB',(420,180),'#eee');draw=ImageDraw.Draw(canvas)
 for n,(key,im,region,factor)in enumerate([('original14',original,refroi,1),*[(key,ims[key],rois[key][name],ratio)for key in ['baseline','candidate']]]):
  crop=im.crop(region)
  if factor!=1:crop=crop.resize((round(crop.width/factor),round(crop.height/factor)),Image.Resampling.LANCZOS)
  crop=crop.resize((crop.width*4,crop.height*4),Image.Resampling.NEAREST);draw.text((n*140+3,4),key,fill='black');canvas.paste(crop,(n*140,25))
 canvas.save(D/(name+'-diagnostic-nearest4x.png'))
result={'scope':'Actual App completeCSS simulated macOS Chrome host baseline/candidate; separate saved exactAndroid06 image baseline from readiness27; not the same host or installed06 capture','viewport':{'logical':[390,746],'dpr':1080/390,'snapshot':[1080,2066]},'method':'half-open native bboxes, dark maxRGB<160, gold same strict readiness27 predicate; normalization1080/224 is whole-width ratio, not recovery of original DPR. No vertical registration/system-bar alignment or per-control stretching. Local diagnostic crops are resampled for inspection only, not zero-difference scoring.','measurements':out,'preservation':geometry,'savedReferenceFinite':{k:ref[k]for k in ['original14','android06-39']},'limits':['Original video224x480 low resolution/compression ~1-2px uncertainty','Browser preview watermark and macOS fonts remain different from Android native host; no physical keyboard/native touch claim','Changed source does not mean Android06 saved screenshots were rerendered or newAPK accepted','Reference original group content differs; no invented iCloud rows or absolute group/card-height alignment']}
(D/'measurements.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'measures':out,'geometry':geometry},ensure_ascii=False,indent=2))
