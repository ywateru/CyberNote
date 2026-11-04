from pathlib import Path
from PIL import Image,ImageCms,ImageChops
from io import BytesIO
import json,statistics,hashlib
D=Path(__file__).resolve().parent;R=D.parents[2]
raw=R/'docs/verification/mac-ordinary-sidebar-runtime23/01-original-ordinary-active.cua-image'
im=Image.open(raw);icc=im.info['icc_profile'];(D/'reference-display.icc').write_bytes(icc)
srgb=ImageCms.createProfile('sRGB');profile=ImageCms.ImageCmsProfile(srgb).tobytes();(D/'comparison-srgb.icc').write_bytes(profile)
reference=ImageCms.profileToProfile(im,ImageCms.ImageCmsProfile(BytesIO(icc)),srgb,outputMode='RGB');reference.save(D/'reference-srgb.png',icc_profile=profile)
images={'reference':reference}
for key,file in [('baseline','baseline-controlled-wk'),('candidate','candidate-interaction-final-wk'),('baselineDiagnostic','baseline-diagnostic-wk'),('candidateDiagnostic','candidate-diagnostic-wk')]:
 images[key]=Image.open(D/(file+'.png')).convert('RGB').crop((688,453,1488,867));images[key].save(D/(key+'-form-srgb.png'),icc_profile=profile)
def median(im,box):
 ps=list(im.crop(box).getdata());return [statistics.median(p[i] for p in ps) for i in range(3)]
def bbox(im,box):
 ps=[(x,y) for y in range(box[1],box[3]) for x in range(box[0],box[2]) if max(im.getpixel((x,y)))<160];return[min(x for x,y in ps),min(y for x,y in ps),max(x for x,y in ps)+1,max(y for x,y in ps)+1]
measure={}
for key,im in images.items():
 measure[key]={'nameInk':bbox(im,(135,120,300,153)),'smartLabelInk':bbox(im,(80,194,280,224)),'centerRingScan':[[y,list(im.getpixel((400,y)))] for y in range(104,116)],'selectionTopMedian':median(im,(145,120,265,124)),'coreRingMedian':median(im,(300,107,600,112))}
for key in ['baselineDiagnostic','candidateDiagnostic']:
 pixels=list(ImageChops.difference(reference.crop((300,104,600,116)),images[key].crop((300,104,600,116))).getdata());measure[key]['centerBandMeanChannelAbsoluteDifference']=sum(sum(p) for p in pixels)/(len(pixels)*3)
# Native-scale diagnostic triptych; explicit labels remain outside image content.
from PIL import ImageDraw
comparison=Image.new('RGB',(800,3*110),'#ffffff');draw=ImageDraw.Draw(comparison)
for n,(key,label) in enumerate([('reference','Original active: one JPEG reference, ICC converted'),('baselineDiagnostic','Baseline diagnostic: declarations remapped, not active WK'),('candidateDiagnostic','Candidate diagnostic: declarations remapped, not active WK')]):
 draw.text((8,n*110+4),label,fill='black');comparison.paste(images[key].crop((0,95,800,175)),(0,n*110+25))
comparison.save(D/'focus-diagnostic-comparison-srgb.png',icc_profile=profile)
result={'method':'Native800x414 crop at688,453..1488,867, no scaling or per-control registration; reference rawJPEG ICC->sRGB. WK PNG no embedded ICC treated as prior calibrated tool sRGB; compare derived PNGs attached sRGB. Ink maxRGB<160. Ring diagnostic explicitly test-class remapping, not actual active focus proof.','referenceRawSha256':hashlib.sha256(raw.read_bytes()).hexdigest(),'referenceIccSha256':hashlib.sha256(icc).hexdigest(),'limitations':['Single independent original active image; JPEG lossy and edge halo','Real inactive WK paints gray selection and no active outline; true selection colors and reactivation remain Mac12 CUA gate','Diagnostic selection background actual251,233,193 vs CSS252,234,193 demonstrates platform processing; computed value is not pixel proof','Center-band error only local; entire ring corners/font/AA remain open'],'measurements':measure}
(D/'measurements.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'measurements':measure},ensure_ascii=False))
