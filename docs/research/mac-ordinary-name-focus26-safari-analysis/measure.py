from pathlib import Path
from PIL import Image,ImageCms,ImageDraw
from collections import deque
import io,json,hashlib,statistics
ROOT=Path(__file__).resolve().parents[3];OUT=Path(__file__).resolve().parent
SOURCES={'original-all':'docs/research/mac-ordinary-name-focus26-original-runtime/00-original-active-all-selected.cua-image','original-partial':'docs/research/mac-ordinary-name-focus26-original-runtime/01-original-active-partial-selected.cua-image','old-mac11-all':'docs/verification/mac-ordinary-sidebar-runtime23/12-mac11-ordinary-open.cua-image','safari-all':'docs/verification/mac-ordinary-name-focus26-safari-preview/00-candidate-active-all-selected.cua-image','safari-partial':'docs/verification/mac-ordinary-name-focus26-safari-preview/01-candidate-active-partial-selected.cua-image','safari-replaced':'docs/verification/mac-ordinary-name-focus26-safari-preview/02-candidate-name-replaced.cua-image','safari-after-escape':'docs/verification/mac-ordinary-name-focus26-safari-preview/03-candidate-after-escape.cua-image'}
SRGB=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB'));IMS={};RAW={};META={};DETECTIONS={}
def component(im,threshold,roi,seed):
 q=deque([seed]);seen={seed};xs=[];ys=[];pix=im.load()
 while q:
  x,y=q.popleft()
  if min(pix[x,y])<threshold:continue
  xs.append(x);ys.append(y)
  for xx,yy in[(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
   if roi[0]<=xx<roi[2]and roi[1]<=yy<roi[3]and(xx,yy)not in seen:seen.add((xx,yy));q.append((xx,yy))
 return[min(xs),min(ys),max(xs)+1,max(ys)+1]
for name,rel in SOURCES.items():
 data=(ROOT/rel).read_bytes();src=Image.open(io.BytesIO(data));icc=src.info['icc_profile'];im=src.convert('RGB');META[name]={'path':rel,'sha256':hashlib.sha256(data).hexdigest(),'sourcePixels':list(im.size),'iccBytes':len(icc),'iccSha256':hashlib.sha256(icc).hexdigest(),'jpegComponents':src.layer}
 if im.size!=(800,414):
  roi,seed=((800,650,1850,1330),(1324,1060))if name.startswith('safari')else((650,400,1520,900),(1088,720))
  boxes={str(t):component(im,t,roi,seed)for t in[190,195,200]};DETECTIONS[name]={'searchROI':roi,'seed':seed,'method':'4-connected minRGB>=threshold, shadow excluded','results':boxes};assert len({tuple(b)for b in boxes.values()})==1,boxes
  im=im.crop(boxes['190'])
 assert im.size==(800,414),(name,im.size)
 RAW[name]=im;IMS[name]=ImageCms.profileToProfile(im,ImageCms.ImageCmsProfile(io.BytesIO(icc)),SRGB,outputMode='RGB')
 if name in['original-all','original-partial','old-mac11-all','safari-all','safari-partial']:IMS[name].save(OUT/(name+'-srgb.png'),icc_profile=SRGB.tobytes())
def maskbox(im,roi,pred):
 pts=[(x,y)for y in range(roi[1],roi[3])for x in range(roi[0],roi[2])if pred(im.getpixel((x,y)))]
 return{'bbox':[min(x for x,y in pts),min(y for x,y in pts),max(x for x,y in pts)+1,max(y for x,y in pts)+1]if pts else None,'pixels':len(pts)}
def median(im,roi):return[statistics.median(p[c]for p in im.crop(roi).getdata())for c in range(3)]
# Conservative common exclusion covers the visible cursor halo in Safari00/01 and original01.
HALO=(350,70,540,205)
def in_halo(x,y):return HALO[0]<=x<HALO[2]and HALO[1]<=y<HALO[3]
CENTER=(300,104,600,116)
centerpts=[(x,y)for y in range(CENTER[1],CENTER[3])for x in range(CENTER[0],CENTER[2])if not in_halo(x,y)]
CORNERS={'TL':(115,100,155,132),'TR':(734,100,774,132),'BL':(115,140,155,172),'BR':(734,140,774,172)}
def gold(p,t=35):return p[0]>170 and p[1]>140 and p[0]-p[2]>t and p[1]-p[2]>t/2
ref=IMS['original-all'];records={}
for name in['original-all','original-partial','old-mac11-all','safari-all','safari-partial']:
 im=IMS[name];raw=RAW[name];pairRefName='original-partial' if 'partial' in name else 'original-all';pairRef=IMS[pairRefName];top=(222,120,265,124)if'partial'in name else(145,120,265,124)
 corners={}
 for k,r in CORNERS.items():
  pts=[(x,y)for y in range(r[1],r[3])for x in range(r[0],r[2])if not (138<=x<750 and 118<=y<155)]
  corners[k]={'roi':r,'goldPixels':sum(gold(im.getpixel(pt))for pt in pts),'goldMaskDisagreementVsPairedOriginal':sum(gold(im.getpixel(pt))!=gold(pairRef.getpixel(pt))for pt in pts),'meanAbsoluteChannelDifferenceVsPairedOriginal':sum(abs(a-b)for pt in pts for a,b in zip(im.getpixel(pt),pairRef.getpixel(pt)))/(len(pts)*3),'samplePixels':len(pts),'pairedOriginal':pairRefName}
 records[name]={'inkRaw':{k:{str(t):maskbox(raw,r,lambda p,t=t:max(p)<t)for t in[100,160,200]}for k,r in{'name':(135,115,280,158),'nameLabel':(35,115,115,157),'smartLabel':(75,190,330,230)}.items()},'selectionBackground':{'roi':top,'rawMedianRGB':median(raw,top),'srgbMedianRGB':median(im,top),'samplePixels':(top[2]-top[0])*(top[3]-top[1])},'cleanCoreRingSrgbROI':[300,107,340,111],'cleanCoreRingSrgbMedian':median(im,(300,107,340,111)),'centerBand':{'roi':CENTER,'commonExcludedHaloROI':HALO,'remainingPixels':len(centerpts),'meanAbsoluteChannelDifferenceVsOriginalAll':sum(abs(a-b)for pt in centerpts for a,b in zip(im.getpixel(pt),ref.getpixel(pt)))/(len(centerpts)*3)},'cleanVerticalSrgbScans':{str(x):[{'y':y,'rgb':list(im.getpixel((x,y)))}for y in range(100,170)]for x in[300,600]},'ringCornerMetrics':corners,'neutralGrayInnerBands':{key:{'roi':roi,'pixels':maskbox(im,roi,lambda p:145<=min(p) and max(p)<=215 and max(p)-min(p)<=6)['pixels']}for key,roi in {'top':(300,110,340,115),'bottom':(300,157,340,161)}.items()},'strongGoldRowsX300':{'top':[y for y in range(100,117)if gold(im.getpixel((300,y)))],'bottom':[y for y in range(154,170)if gold(im.getpixel((300,y)))]},'strongGoldRawBbox35':maskbox(raw,(110,95,780,180),gold)}
result={'scope':'finite active Safari preview screenshots, not exact Mac12 app or pixel PASS','coordinates':'native pixels, half-open; each full-window form detected and integer cropped, no resize/per-control registration','sources':META,'formDetection':DETECTIONS,'colorHandling':'Each embedded Display ICC converted with Pillow/LittleCMS to same sRGB; raw metrics named explicitly; JPEG edge/antialiasing uncertainty retained','commonCursorHaloExclusion':HALO,'measurements':records,'cornersMethod':'Four fixed40x32 input-ring corner ROIs, excluding common interior[138,118,750,155) to avoid selection contamination; sRGB gold35 and channelMAE versus same-selection original. Not native radius or complete ring pixel score.','escapeBoundary':'02/03 AX same replacement value/form present. No cancel PASS, no production lifecycle inference.'}
(OUT/'measurements.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
# Honest full-form comparisons preserve visible cursor halos.
for filename,names in [('all-selected-original-old-safari-native-srgb.png',['original-all','old-mac11-all','safari-all']),('partial-original-safari-native-srgb.png',['original-partial','safari-partial'])]:
 canvas=Image.new('RGB',(800*len(names),450),'#ddd');d=ImageDraw.Draw(canvas)
 for n,name in enumerate(names):d.text((n*800+8,10),name+' | native800x414 | ICC->sRGB',fill='black');canvas.paste(IMS[name],(n*800,36))
 canvas.save(OUT/filename,icc_profile=SRGB.tobytes())
focus=Image.new('RGB',(670,555),'#ddd');d=ImageDraw.Draw(focus)
for n,name in enumerate(['original-all','old-mac11-all','safari-all','original-partial','safari-partial']):d.text((5,n*111+5),name+' | native input crop[110,95,780,180)',fill='black');focus.paste(IMS[name].crop((110,95,780,180)),(0,n*111+26))
focus.save(OUT/'focus-all-and-partial-native-srgb.png',icc_profile=SRGB.tobytes())
corners=Image.new('RGB',(480,542),'#ddd');d=ImageDraw.Draw(corners)
for n,name in enumerate(['original-all','old-mac11-all','safari-all']):
 d.text((n*160+5,5),name,fill='black')
 for j,(k,r)in enumerate(CORNERS.items()):corners.paste(IMS[name].crop(r).resize((160,128),Image.Resampling.NEAREST),(n*160,30+j*128))
corners.save(OUT/'input-ring-corners-nearest4x-srgb.png',icc_profile=SRGB.tobytes())
annotated=IMS['safari-all'].copy();d=ImageDraw.Draw(annotated);d.rectangle((HALO[0],HALO[1],HALO[2]-1,HALO[3]-1),outline='#ef3355',width=1);d.rectangle((CENTER[0],CENTER[1],CENTER[2]-1,CENTER[3]-1),outline='#0044dd',width=1);annotated.save(OUT/'safari-all-exclusion-guide-srgb.png',icc_profile=SRGB.tobytes())
print(json.dumps({'detectedForms':DETECTIONS,'finite':{name:{'ink160':{k:v['160']['bbox']for k,v in r['inkRaw'].items()},'selection':r['selectionBackground'],'coreRing':r['cleanCoreRingSrgbMedian'],'grayInnerBandPixels':r['neutralGrayInnerBands'],'strongGoldRows':r['strongGoldRowsX300'],'cleanCenterBandMAE':r['centerBand']['meanAbsoluteChannelDifferenceVsOriginalAll'],'cornerMaskError':sum(v['goldMaskDisagreementVsPairedOriginal']for v in r['ringCornerMetrics'].values()),'cornerMeanChannelMAE':sum(v['meanAbsoluteChannelDifferenceVsPairedOriginal']for v in r['ringCornerMetrics'].values())/4}for name,r in records.items()}},ensure_ascii=False,indent=2))
