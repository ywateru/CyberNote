from pathlib import Path
from PIL import Image,ImageCms,ImageDraw
from collections import deque
import hashlib,io,json,statistics
ROOT=Path(__file__).resolve().parents[3];OUT=Path(__file__).resolve().parent
PATHS={'Original Apple Notes (one reference)':'docs/verification/mac-ordinary-sidebar-runtime23/01-original-ordinary-active.cua-image','Old Mac10 / runtime18':'docs/verification/mac-folder-fixes-runtime18/18-ordinary-form-open.cua-image','New Mac11 / runtime23-12':'docs/verification/mac-ordinary-sidebar-runtime23/12-mac11-ordinary-open.cua-image','New Mac11 / runtime23-13 cursor':'docs/verification/mac-ordinary-sidebar-runtime23/13-mac11-ordinary-active.cua-image'}
NAMES=list(PATHS);srgb=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB'));raw={};images={};metadata={};detection={}
def component(im,threshold):
 roi=(650,400,1520,900);seed=(1088,720);q=deque([seed]);seen={seed};xs=[];ys=[];pix=im.load()
 while q:
  x,y=q.popleft()
  if min(pix[x,y])<threshold:continue
  xs.append(x);ys.append(y)
  for xx,yy in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
   if roi[0]<=xx<roi[2] and roi[1]<=yy<roi[3] and (xx,yy) not in seen:seen.add((xx,yy));q.append((xx,yy))
 return [min(xs),min(ys),max(xs)+1,max(ys)+1]
def maskbox(im,roi,pred):
 pts=[(x,y) for y in range(roi[1],roi[3]) for x in range(roi[0],roi[2]) if pred(im.getpixel((x,y)))]
 return {'bbox':[min(x for x,y in pts),min(y for x,y in pts),max(x for x,y in pts)+1,max(y for x,y in pts)+1] if pts else None,'pixels':len(pts)}
def median(im,roi):return [statistics.median(p[c] for p in im.crop(roi).getdata()) for c in range(3)]
for name,rel in PATHS.items():
 data=(ROOT/rel).read_bytes();src=Image.open(io.BytesIO(data));icc=src.info['icc_profile'];im=src.convert('RGB');metadata[name]={'source':rel,'sha256':hashlib.sha256(data).hexdigest(),'nativeSize':list(im.size),'iccSha256':hashlib.sha256(icc).hexdigest(),'jpegComponents':src.layer}
 if im.size!=(800,414):
  boxes={str(t):component(im,t) for t in [190,195,200]};detection[name]={'method':'4-connected minRGB threshold, seed1088,720 searchROI650,400,1520,900','results':boxes};assert len({tuple(v) for v in boxes.values()})==1,boxes
  im=im.crop(boxes['190'])
 assert im.size==(800,414),im.size
 raw[name]=im;images[name]=ImageCms.profileToProfile(im,ImageCms.ImageCmsProfile(io.BytesIO(icc)),srgb,outputMode='RGB')
 slug=['original','old-mac10','new-mac11-12','new-mac11-13-cursor'][NAMES.index(name)]
 images[name].save(OUT/(slug+'-srgb.png'),icc_profile=srgb.tobytes())
ROIS={'panel':[200,20,650,90],'cancel':[440,330,460,365],'ok':[620,330,640,365],'checkbox':[45,198,67,218]};OFFSETS=[4,8,12,16,20,24,32,40]
def corner_profiles(im):
 out={}
 for corner in ['TL','TR','BL','BR']:
  values=[]
  for off in OFFSETS:
   y=413-off if corner.startswith('B') else off
   values.append(next((x for x in range(100) if statistics.median([min(im.getpixel((799-xx if corner.endswith('R') else xx,y))) for xx in range(max(0,x-2),min(800,x+3))])>=230),None))
  out[corner]=values
 return out
def checkbox_mask(im):return [max(p)<246 for p in im.crop((40,192,72,224)).getdata()]
ref=images[NAMES[0]];refcorners=corner_profiles(ref);refmask=checkbox_mask(ref);records={}
for name in NAMES[:3]:
 im=images[name];rawim=raw[name];corners=corner_profiles(im);mask=checkbox_mask(im)
 cancelThreshold=242 if name==NAMES[1] else 248;checkboxThreshold=220 if name==NAMES[1] else 245
 record={'paintThresholdNote':{'cancelMaxRGB':cancelThreshold,'checkboxMaxRGB':checkboxThreshold,'reason':'old panel247 requires stricter threshold than248 to exclude panel; old checkbox uses220 to exclude JPEG edge noise as sealed19'},'medianRawRGB':{k:median(rawim,r) for k,r in ROIS.items()},'medianSrgb':{k:median(im,r) for k,r in ROIS.items()},'cornerY':OFFSETS,'bright230CornerInsets':corners,'cornerAbsoluteErrorVsReference':sum(abs(v-t) for c in corners for v,t in zip(corners[c],refcorners[c])),'checkbox':{'bbox':[40,192,72,224],'threshold':'sRGB max<246','filledPixels':sum(mask),'maskDisagreementVsReference':sum(a!=b for a,b in zip(mask,refmask))},'paintBboxesRaw':{'cancel':maskbox(rawim,(418,320,590,380),lambda p:max(p)<cancelThreshold),'ok':maskbox(rawim,(594,320,766,380),lambda p:p[0]>160 and p[1]>100 and p[0]-p[2]>65 and p[1]-p[2]>32.5),'checkbox':maskbox(rawim,(35,187,78,230),lambda p:max(p)<checkboxThreshold)},'textInkRaw':{k:{str(t):maskbox(rawim,r,lambda p,t=t:max(p)<t) for t in [100,160,200]} for k,r in {'title':(35,35,190,80),'name':(135,115,280,158),'smartLabel':(75,190,330,230),'subtitle':(75,229,500,268),'cancel':(450,330,560,370),'ok':(650,330,710,370)}.items()},'focus':{'goldBboxRaw35':maskbox(rawim,(110,95,780,180),lambda p:p[0]>170 and p[1]>140 and p[0]-p[2]>35 and p[1]-p[2]>17.5),'selectionTopBarROI':[145,120,265,124],'selectionTopBarRawRGB':median(rawim,(145,120,265,124)),'selectionTopBarSrgb':median(im,(145,120,265,124)),'verticalScanX400Raw':[{'y':y,'rgb':list(rawim.getpixel((400,y)))} for y in range(100,170)]}}
 records[name]=record
cursorraw=raw[NAMES[3]];cursorimg=images[NAMES[3]]
cursorclean={'scope':'13 cursor halo around middle field excluded; only name and top selection bar sampled away from cursor','nameInk160Raw':maskbox(cursorraw,(135,115,280,158),lambda p:max(p)<160),'selectionTopBarRaw':median(cursorraw,(145,120,265,124)),'selectionTopBarSrgb':median(cursorimg,(145,120,265,124))}
result={'scope':'finite actual-package image analysis, no GUI/build/test/source edits or full pixel PASS','coordinateConvention':'native image pixels, half-open bboxes; no resize or per-control registration','inputs':metadata,'cloneBoundaryDetection':detection,'colorHandling':'Each embedded Display ICC converted with Pillow/LittleCMS to same generated sRGB profile; comparisons and labeled images use sRGB. Raw measurements explicitly named. JPEG uncertainty retained.','comparisons':records,'cursor13CleanMeasurements':cursorclean,'limits':['Original23-01 and original18-00 bytes identical, one reference only.','Mac11-12 primary comparison excludes pointer outside form;13 middle-field halo not used for surface/focus scan.','Corner metric measures bright inner-surface contour, not native radius.','Checkbox mask agreement is finite threshold result, not every pixel agreement.','Application rendering/JPEG/subpixel text differences do not identify font weight.']}
(OUT/'measurements.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
canvas=Image.new('RGB',(2400,450),'#ddd');d=ImageDraw.Draw(canvas)
for n,name in enumerate(NAMES[:3]):d.text((n*800+8,10),name+' | native 800x414 | ICC -> sRGB',fill='black');canvas.paste(images[name],(n*800,36))
canvas.save(OUT/'original-old-new-native-srgb.png',icc_profile=srgb.tobytes())
focus=Image.new('RGB',(670,333),'#ddd');d=ImageDraw.Draw(focus)
for n,name in enumerate(NAMES[:3]):d.text((5,n*111+5),name+' | input crop [110,95,780,180)',fill='black');focus.paste(images[name].crop((110,95,780,180)),(0,n*111+26))
focus.save(OUT/'focus-original-old-new-native-srgb.png',icc_profile=srgb.tobytes())
corners=Image.new('RGB',(480,670),'#ddd');d=ImageDraw.Draw(corners)
for n,name in enumerate(NAMES[:3]):
 d.text((n*160+3,3),['Original','Old Mac10','New Mac11'][n],fill='black')
 for j,(x,y) in enumerate([(0,0),(720,0),(0,334),(720,334)]):corners.paste(images[name].crop((x,y,x+80,y+80)).resize((160,160),Image.Resampling.NEAREST),(n*160,30+j*160))
corners.save(OUT/'corners-original-old-new-nearest2x-srgb.png',icc_profile=srgb.tobytes())
checks=Image.new('RGB',(864,312),'#ddd');d=ImageDraw.Draw(checks)
for n,name in enumerate(NAMES[:3]):d.text((n*288+5,5),['Original','Old Mac10','New Mac11'][n],fill='black');checks.paste(images[name].crop((38,190,74,226)).resize((288,288),Image.Resampling.NEAREST),(n*288,24))
checks.save(OUT/'checkbox-original-old-new-nearest8x-srgb.png',icc_profile=srgb.tobytes())
print(json.dumps({'boundaries':detection,'summary':{k:{'sRGB':v['medianSrgb'],'cornerError':v['cornerAbsoluteErrorVsReference'],'cornerTL':v['bright230CornerInsets']['TL'],'checkbox':v['checkbox'],'nameInk160':v['textInkRaw']['name']['160']['bbox'],'paint':v['paintBboxesRaw'],'focusBar':v['focus']['selectionTopBarSrgb']} for k,v in records.items()},'cursor13':cursorclean},ensure_ascii=False,indent=2))
