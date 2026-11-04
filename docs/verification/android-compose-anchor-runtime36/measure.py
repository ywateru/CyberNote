"""Finite saved-image compose comparison. No device commands or source changes."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageChops
import json
ROOT=Path('/Users/water/work/2026/Apple-Notes-Clone')
OUT=ROOT/'docs/verification/android-compose-anchor-runtime36'
RATIO=1080/224
SOURCES={
 'original14':('references/mobile/frames-2s/frame-008.png',(192,434,220,463)),
 'original62':('references/mobile/frames-2s/frame-032.png',(192,434,220,463)),
 'android07-19':('docs/verification/android-folder-visual-runtime29/19-after-restart.png',(930,2020,1060,2130)),
 'android08-04':('docs/verification/android-compose-anchor-runtime36/04-launch.png',(930,2020,1060,2130)),
 'android08-15':('docs/verification/android-compose-anchor-runtime36/15-force-stop-reopen.png',(930,2020,1060,2130)),
}
PRED={'gold_strict':lambda p:p[0]>140 and p[1]>95 and p[2]<.65*p[0] and p[0]>1.06*p[1],
      'gold_loose':lambda p:p[0]>140 and p[1]>95 and p[2]<.80*p[0] and p[0]>1.03*p[1]}
records={};crops={}
for name,(source,roi)in SOURCES.items():
 im=Image.open(ROOT/source).convert('RGB');crops[name]=im.crop(roi);masks={}
 for mask,pred in PRED.items():
  pts=[(x,y)for y in range(roi[1],roi[3])for x in range(roi[0],roi[2])if pred(im.getpixel((x,y)))]
  b=[min(x for x,y in pts),min(y for x,y in pts),max(x for x,y in pts)+1,max(y for x,y in pts)+1];factor=RATIO if name.startswith('android')else 1
  masks[mask]={'nativeBbox':b,'pixels':len(pts),'widthInReferencePx':(b[2]-b[0])/factor,'heightInReferencePx':(b[3]-b[1])/factor,'centerXInReferencePx':(b[0]+b[2])/2/factor}
 records[name]={'source':source,'size':list(im.size),'roi':roi,'masks':masks}
def compare(a,b,roi,exclusions=()):
 x=Image.open(ROOT/a).convert('RGB');y=Image.open(ROOT/b).convert('RGB')
 for box in exclusions:
  ImageDraw.Draw(x).rectangle((box[0],box[1],box[2]-1,box[3]-1),fill='black');ImageDraw.Draw(y).rectangle((box[0],box[1],box[2]-1,box[3]-1),fill='black')
 d=ImageChops.difference(x.crop(roi),y.crop(roi));points=list(d.getdata())
 return {'a':a,'b':b,'roi':roi,'exclusions':exclusions,'changedPixels':sum(p!=(0,0,0)for p in points),'diffBboxWithinRoi':d.getbbox(),'exactRGB':not d.getbbox()}
comparisons={
 'old07_to_exact08_outside_compose':compare('docs/verification/android-folder-visual-runtime29/19-after-restart.png','docs/verification/android-compose-anchor-runtime36/04-launch.png',(0,83,1080,2148),[(930,2020,1060,2130)]),
 '08_before_to_after_restart_except_observed_8_to_9':compare('docs/verification/android-compose-anchor-runtime36/04-launch.png','docs/verification/android-compose-anchor-runtime36/15-force-stop-reopen.png',(0,83,1080,2148),[(900,810,970,1010)]),
 'qa_body_before_after_restart':compare('docs/verification/android-compose-anchor-runtime36/12-existing-qa.png','docs/verification/android-compose-anchor-runtime36/17-reopened-qa.png',(0,83,1080,2148)),
}
result={'scope':'Compose-only fixed ROI threshold measures plus three finite same-device RGB controls; no full pixel acceptance','ratio':RATIO,'coordinateRule':'Half-open native image bboxes; 1080/224 is width normalization only; no original CSS/dp/pt/DPR inferred','records':records,'comparisons':comparisons,'limits':['Original224x480 video frames are low resolution and compressed.','Gold thresholds do not identify the original vector path, true stroke, exact color or original slot.','Only fixed regions and captures listed here compared; no complete interface/interaction PASS.']}
(OUT/'measurements.json').write_text(json.dumps(result,indent=2)+'\n')
canvas=Image.new('RGB',(340,len(SOURCES)*265),'#ddd');draw=ImageDraw.Draw(canvas)
for i,name in enumerate(SOURCES):
 im=crops[name]
 if name.startswith('android'):im=im.resize((round(im.width/RATIO),round(im.height/RATIO)),Image.Resampling.LANCZOS)
 draw.text((4,i*265+5),name+' | width-normalized; nearest8x',fill='black');draw.text((4,i*265+20),'Different ROI origins; topology aid only',fill='black');canvas.paste(im.resize((im.width*8,im.height*8),Image.Resampling.NEAREST),(4,i*265+34))
canvas.save(OUT/'compose-comparison.png')
print(json.dumps({'compose':{k:v['masks']for k,v in records.items()},'comparisons':comparisons},indent=2))
