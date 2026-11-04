from pathlib import Path
from PIL import Image, ImageChops, ImageDraw
import json, hashlib, subprocess
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
read=lambda p:json.loads((OUT/p).read_text())
a=read('baseline/result.json');b=read('candidate/result.json')
assert a['status']==b['status']=='pass'
old=a['snapshots']['folders'];new=b['snapshots']['folders']
changes=[]
for i,(x,y) in enumerate(zip(old['elements'],new['elements'])):
 if x==y:continue
 diff={'index':i,'tag':x['tag'],'class':x['class'],'computed':{k:[x['computed'].get(k),v] for k,v in y['computed'].items() if x['computed'].get(k)!=v},'beforeRect':x['rect'],'afterRect':y['rect']}
 assert x['tag']==y['tag'] and x['class']==y['class'] and x['text']==y['text']
 if x['class']=='folder-footer':
  assert x['rect']==y['rect']
  assert diff['computed']=={'padding-inline-end':['17px','14px'],'padding-right':['17px','14px']}
 else:
  assert not diff['computed']
  assert y['rect']==dict(x['rect'],x=x['rect']['x']+3)
 changes.append(diff)
assert len(changes)==5
assert old['left']==new['left']
assert old['compose']['paths']==new['compose']['paths']
assert new['compose']['bbox']=={'x':3,'y':2.0044124126434326,'width':18.995590209960938,'height':18.995588302612305}
assert old['storage']==new['storage']
controls={}
for name,pa,pb in [('desktop','baseline','candidate'),('notes','baseline-stable-notes-retry01','candidate-stable-notes')]:
 aa=read(pa+'/result.json');bb=read(pb+'/result.json');assert aa['status']==bb['status']=='pass'
 x=aa['snapshots'][name];y=bb['snapshots'][name];assert x==y,name+' computed/rect/storage mismatch'
 ia=Image.open(OUT/pa/(name+'.png')).convert('RGB');ib=Image.open(OUT/pb/(name+'.png')).convert('RGB');assert ImageChops.difference(ia,ib).getbbox() is None
 controls[name]={'elementsCompared':len(x['elements']),'allSnapshotFieldsEqual':True,'pixelDifference':None,'baseline':pa+'/'+name+'.png','candidate':pb+'/'+name+'.png'}
predicates={'gold_strict':lambda p:p[0]>140 and p[1]>95 and p[2]<.65*p[0] and p[0]>1.06*p[1],'gold_loose':lambda p:p[0]>140 and p[1]>95 and p[2]<.80*p[0] and p[0]>1.03*p[1]}
inputs={'original14':('references/mobile/frames-2s/frame-008.png',[192,434,220,463]),'original62':('references/mobile/frames-2s/frame-032.png',[192,434,220,463]),'android07':('docs/verification/android-folder-visual-runtime29/19-after-restart.png',[930,2020,1060,2130]),'host-baseline':(str((OUT/'baseline/folders.png').relative_to(ROOT)),[930,1935,1060,2045]),'host-candidate':(str((OUT/'candidate/folders.png').relative_to(ROOT)),[930,1935,1060,2045])}
records={};canvas=Image.new('RGB',(1240,320),'#ddd');draw=ImageDraw.Draw(canvas)
for i,(name,(path,roi)) in enumerate(inputs.items()):
 im=Image.open(ROOT/path).convert('RGB');ratio=im.width/224;masks={}
 for key,pred in predicates.items():
  pts=[(x,y)for y in range(roi[1],roi[3])for x in range(roi[0],roi[2])if pred(im.getpixel((x,y)))];box=[min(x for x,y in pts),min(y for x,y in pts),max(x for x,y in pts)+1,max(y for x,y in pts)+1]
  masks[key]={'nativeBbox':box,'pixels':len(pts),'leftInReferencePx':box[0]/ratio,'rightInReferencePx':box[2]/ratio,'centerXInReferencePx':(box[0]+box[2])/2/ratio,'widthInReferencePx':(box[2]-box[0])/ratio,'heightInReferencePx':(box[3]-box[1])/ratio}
 records[name]={'path':path,'imageSize':list(im.size),'roi':roi,'widthRatio':ratio,'masks':masks}
 crop=im.crop(roi);crop=crop.resize((round(crop.width/ratio*8),round(crop.height/ratio*8)),Image.Resampling.NEAREST)
 # Fixed full-image width ratio only; distinct crop origins printed. No glyph fitting.
 draw.text((i*248+4,4),name,fill='black');draw.text((i*248+4,20),'ROI '+str(roi),fill='black');draw.text((i*248+4,36),'width ratio %.6f; nearest8x'%ratio,fill='black');canvas.paste(crop,(i*248+4,65))
canvas.save(OUT/'compose-width-normalized-nearest8x.png')
folderdiff=ImageChops.difference(Image.open(OUT/'baseline/folders.png').convert('RGB'),Image.open(OUT/'candidate/folders.png').convert('RGB'));diffbox=folderdiff.getbbox();assert diffbox== (966,1964,1031,2021)
# Translation-only model anchored on actual saved Android07. This is not a device render.
actual=records['android07']['masks']['gold_strict'];delta_css=3;delta_native=delta_css*2.75;delta_ref=delta_native/(1080/224)
result={'scope':'Single layout candidate; full production App rendering and finite callbacks in isolated Chrome; saved native Android07 reference is baseline only','phaseStatuses':{'baseline':a['status'],'candidate':b['status']},'chosenCandidate':{'selector':'.mobile.page-folders .folder-footer','property':'padding-right','before':17,'after':14,'buttonAndSvgShiftCssPx':3,'selectionReason':'Actual Android07 reference-normalized center deficit1.7333 corresponds to3.03896 current CSS px. Choose integer3 CSS shift; do not optimize against host capture rounding or resize SVG.'},'elementCount':len(old['elements']),'allDifferences':changes,'leftButtonAllFieldsUnchanged':True,'pathsUnchanged':True,'candidateBBoxMatchesReadiness32':True,'initialBaselineBBoxLimitation':'Initial snapshot used JSON.stringify(SVGRect), yielding{}. Candidate capture explicitly serializes geometry; baseline path strings and computed/rect equality remain available, plus sealed readiness32 actual getBBox. No baseline geometry is invented.','controls':controls,'folderPixelDifferenceBbox':list(diffbox),'hostInitialNotesTransition':'Initial notes captures at200ms were still inside original240ms animation. Those raw files retained. Only notes controls rerun after waiting for actual animation.finished.','stableNotesAttempt01':'Parallel control attempt hit local Vite connection port collision in baseline only; its JSON and PNG retained. Candidate passed; baseline retry01 ran alone and passed. No product change arose from transport error.','records':records,'androidTranslationModelNotDeviceProof':{'nativeDelta':delta_native,'referenceDelta':delta_ref,'referenceCenterBefore':actual['centerXInReferencePx'],'referenceCenterAfter':actual['centerXInReferencePx']+delta_ref,'residualFrom208':actual['centerXInReferencePx']+delta_ref-208},'limitations':['No new Android or iOS native render, package, GUI, ADB, or user database operations.','Chrome integer viewport393x751 DPR2.75 differs from saved Android fractional visualViewport393.0909x751.2727; host capture1081x2065 versus native capture1080x2280 includes different system chrome.','Width normalization uses each image width/224 only; no inferred original CSS/dp/pt/DPR or vertical fitting.','Raster bbox width can change one host pixel when fractional edges translate, while actual SVG/button dimensions, paths/stroke/colors remain equal.','Original224x480 recording is compressed; path topology, line weight/color, cap/corners and native button slot remain unknown. No path-perfect or full pixel acceptance.']}
(OUT/'analysis.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'changes':len(changes),'controls':controls,'bbox':{n:v['masks']for n,v in records.items()},'androidModel':result['androidTranslationModelNotDeviceProof']},ensure_ascii=False,indent=2))
