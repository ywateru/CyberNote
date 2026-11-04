from pathlib import Path
from PIL import Image,ImageDraw,ImageChops,ImageStat
from collections import Counter,deque
import hashlib,json,statistics
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
SRC=ROOT/'docs/verification/mac-folder-fixes-runtime18'
FILES=[SRC/'00-original-ordinary.cua-image',SRC/'18-ordinary-form-open.cua-image',ROOT/'docs/INDEX.md',ROOT/'docs/plan/tasks/app-mac-folder-form-geometry15.md',ROOT/'docs/plan/reviews/app-mac-folder-form-geometry15.md']
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def identity(p):return {'path':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':sha(p)}
initial=[identity(p) for p in FILES]
original=Image.open(FILES[0]);full=Image.open(FILES[1]);metadata={}
for name,im in [('original',original),('cloneFull',full)]:
 icc=im.info.get('icc_profile',b'')
 metadata[name]={'format':im.format,'mode':im.mode,'size':list(im.size),'iccBytes':len(icc),'iccSha256':hashlib.sha256(icc).hexdigest(),'jpegComponents':im.layer,'jfifDensity':im.info.get('jfif_density')}
original=original.convert('RGB');full=full.convert('RGB')
def connected_bbox(im,roi,threshold,seed):
 pix=im.load();x0,y0,x1,y1=roi;seen=set([seed]);q=deque([seed]);xs=[];ys=[]
 while q:
  x,y=q.popleft()
  if min(pix[x,y])<threshold:continue
  xs.append(x);ys.append(y)
  for xx,yy in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
   if x0<=xx<x1 and y0<=yy<y1 and (xx,yy) not in seen:
    seen.add((xx,yy));q.append((xx,yy))
 return [min(xs),min(ys),max(xs)+1,max(ys)+1],len(xs)
boundaries=[{'thresholdMinRGB':t,'bbox':connected_bbox(full,(650,400,1520,900),t,(1088,700))[0]} for t in [190,195,200]]
assert all(x['bbox']==[688,453,1488,867] for x in boundaries),boundaries
box=boundaries[0]['bbox'];clone=full.crop(box)
original.save(OUT/'original-decoded.png',icc_profile=icc);clone.save(OUT/'clone-native-crop.png',icc_profile=icc)
ims={'original':original,'clone':clone}
def maskbbox(im,roi,pred):
 pts=[]
 for y in range(roi[1],roi[3]):
  for x in range(roi[0],roi[2]):
   if pred(im.getpixel((x,y))):pts.append((x,y))
 return {'bbox':[min(x for x,y in pts),min(y for x,y in pts),max(x for x,y in pts)+1,max(y for x,y in pts)+1] if pts else None,'pixels':len(pts)}
rois={'title':[35,35,190,80],'nameLabel':[35,115,115,157],'nameText':[135,115,280,158],'smartLabel':[75,190,330,230],'subtitle':[75,229,500,268],'cancelText':[450,330,560,370],'okText':[650,330,710,370]}
text={name:{k:{str(t):maskbbox(im,r,lambda p,t=t:max(p)<t) for t in [100,160,200]} for k,r in rois.items()} for name,im in ims.items()}
color_rois={'panel':[200,20,650,90],'inputInterior':[300,122,700,151],'cancelInterior':[440,330,460,365],'okInterior':[620,330,640,365],'checkboxInterior':[45,198,67,218],'selectionBackground':[145,120,265,151],'focusRingTop':[200,106,700,112],'divider':[100,291,700,294]}
colors={}
for name,im in ims.items():
 colors[name]={}
 for k,r in color_rois.items():
  data=list(im.crop(r).getdata());mode,n=Counter(data).most_common(1)[0]
  colors[name][k]={'roi':r,'modeRGB':list(mode),'modeCount':n,'samples':len(data),'medianRGB':[statistics.median(x[i] for x in data) for i in range(3)],'rangeRGB':[[min(x[i] for x in data),max(x[i] for x in data)] for i in range(3)]}
# Gold ring mask includes the enclosed original warm selection; bbox is governed by outer ring.
rings={name:{str(g):maskbbox(im,[110,95,780,180],lambda p,g=g:p[0]>170 and p[1]>140 and p[0]-p[2]>g and p[1]-p[2]>g/2) for g in [15,25,35]} for name,im in ims.items()}
# Highlight background masks exclude dark glyph cores and gold focus ring by using a small inner ROI.
selections={
 'original':maskbbox(original,[140,118,280,155],lambda p:p[0]>180 and p[1]>170 and p[0]-p[2]>15 and p[1]-p[2]>5),
 'clone':maskbbox(clone,[140,118,280,155],lambda p:p[2]>170 and p[2]-p[0]>15 and p[2]-p[1]>5)}
# Constant-line samples and thresholded bboxes characterize painted regions, not CSS boxes.
paint={}
for name,im in ims.items():
 paint[name]={
  'checkbox':maskbbox(im,[35,187,78,230],lambda p,n=name:max(p)<245 if n=='original' else max(p)<220),
  'cancelPaint':maskbbox(im,[418,320,590,380],lambda p,n=name:max(p)<248 if n=='original' else max(p)<242),
  'okGoldPaint':maskbbox(im,[594,320,766,380],lambda p:p[0]>160 and p[1]>100 and p[0]-p[2]>65 and p[1]-p[2]>32.5),
  'divider':maskbbox(im,[35,286,765,300],lambda p,n=name:max(p)<245 if n=='original' else max(p)<230)}
# Median of local 5-pixel horizontal neighborhoods suppresses isolated JPEG noise.
corner={}
for name,im in ims.items():
 corner[name]={}
 for corner_name in ['TL','TR','BL','BR']:
  profile=[]
  for off in [0,1,2,4,8,12,16,20,24,32,40,48,56,64]:
   y=off if corner_name[0]=='T' else 413-off
   values=[]
   for t in ([220,230,240] if name=='original' else [190,200,210]):
    found=None
    for inset in range(100):
     x=inset if corner_name[1]=='L' else 799-inset
     samples=[min(im.getpixel((xx,y))) for xx in range(max(0,x-2),min(800,x+3))]
     if statistics.median(samples)>=t:found=inset;break
    values.append({'thresholdMinRGB':t,'inset':found})
   profile.append({'edgeOffsetY':off,'values':values})
  corner[name][corner_name]=profile
# Common threshold profile measures bright interior independently of contour normalization.
common_corner={}
for name,im in ims.items():
 common_corner[name]=[]
 for y in [4,8,12,16,20,24,32,40]:
  found=next((x for x in range(100) if statistics.median([min(im.getpixel((xx,y))) for xx in range(max(0,x-2),min(800,x+3))])>=230),None)
  common_corner[name].append({'y':y,'thresholdMinRGB':230,'leftInset':found})
focus_scans={name:{str(x):[{'y':y,'rgb':list(im.getpixel((x,y)))} for y in range(100,170)] for x in [400]} for name,im in ims.items()}
highlight_bars={name:{'roi':[145,120,265,124],'medianRGB':[statistics.median(p[i] for p in im.crop((145,120,265,124)).getdata()) for i in range(3)]} for name,im in ims.items()}
button_thresholds={name:{str(g):maskbbox(im,[594,320,766,380],lambda p,g=g:p[0]>160 and p[1]>100 and p[0]-p[2]>g and p[1]-p[2]>g/2) for g in [35,45,65,85,100]} for name,im in ims.items()}
# Unscaled views; labels sit outside native pixels. All colors remain raw decoded RGB without ICC transform.
canvas=Image.new('RGB',(1600,450),(215,215,215));d=ImageDraw.Draw(canvas)
d.text((8,10),'Original: decoded JPEG, native 800x414',fill='black');d.text((808,10),'Clone: native crop [688,453,1488,867)',fill='black');canvas.paste(original,(0,36));canvas.paste(clone,(800,36));canvas.save(OUT/'native-side-by-side.png',icc_profile=icc)
ann=canvas.copy();d=ImageDraw.Draw(ann)
for dx in [0,800]:
 for k,r in rois.items():
  if k in ['title','smartLabel','subtitle']:d.rectangle((r[0]+dx,r[1]+36,r[2]+dx-1,r[3]+35),outline=(220,20,20))
 for r in [[123,106,766,166],[40,192,72,224],[424,326,584,374],[600,326,760,374]]:d.rectangle((r[0]+dx,r[1]+36,r[2]+dx-1,r[3]+35),outline=(0,120,220))
ann.save(OUT/'annotated-native.png',icc_profile=icc)
Image.blend(original,clone,0.5).save(OUT/'aligned-overlay.png',icc_profile=icc)
diff=ImageChops.difference(original,clone);diff.point(lambda x:min(255,x*4)).save(OUT/'raw-difference-amplified4.png')
# Native corner tiles then nearest-neighbor enlarged visual aid.
tiles=Image.new('RGB',(8*80,110),(215,215,215));d=ImageDraw.Draw(tiles)
for n,(name,im) in enumerate(ims.items()):
 for j,(label,r) in enumerate([('TL',(0,0,80,80)),('TR',(720,0,800,80)),('BL',(0,334,80,414)),('BR',(720,334,800,414))]):
  x=(n*4+j)*80;d.text((x+2,6),name[:1]+' '+label,fill='black');tiles.paste(im.crop(r),(x,30))
tiles.save(OUT/'corners-native.png',icc_profile=icc);tiles.resize((1280,220),Image.Resampling.NEAREST).save(OUT/'corners-nearest2x.png',icc_profile=icc)
focus=Image.new('RGB',(800,240),(215,215,215));d=ImageDraw.Draw(focus)
for n,(name,im) in enumerate(ims.items()):
 d.text((5,n*120+5),name+' input crop [110,95,780,180)',fill='black');focus.paste(im.crop((110,95,780,180)),(0,n*120+30))
focus.save(OUT/'focus-native.png',icc_profile=icc)
measure={'scope':'Two fixed runtime18 CUA JPEGs; unscaled 800x414 registration; no platform/pixel PASS','inputs':initial,'imageMetadata':metadata,'cloneBoundaryDetection':{'searchROI':[650,400,1520,900],'seed':[1088,700],'method':'4-connected pixels with all RGB components >= threshold, selected center component','results':boundaries,'coordinateConvention':'integer half-open pixels; painted outer bbox; shadow excluded','uncertaintyPx':1},'textROIs':rois,'textInk':text,'colorsRawDecodedRGB':colors,'focusRingGoldMask':rings,'selectionBackgroundMask':selections,'paintedComponents':paint,'cornerInsetProfiles':corner,'cornerBrightInteriorCommon230':common_corner,'focusVerticalScans':focus_scans,'highlightTopBar':highlight_bars,'okGoldThresholdSensitivity':button_thresholds,'derivedColorHandling':'Native decoded/cropped/composite/overlay views explicitly retain the identical input ICC profile without RGB conversion; diagnostic raw difference has no color meaning.','differenceImageWarning':'Raw RGB abs difference, amplified4 and clipped; contains color, focus, JPEG, platform and paint differences; no pass score','cursorWarning':'Clone full image contains outlined pointer near (126,1272), outside dialog crop; exclude it and app background from component comparisons','closingInputsUnchanged':all(identity(p)==e for p,e in zip(FILES,initial))}
assert measure['closingInputsUnchanged']
(OUT/'measurements.json').write_text(json.dumps(measure,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'boundary':boundaries,'ink160':{n:{k:v['160'] for k,v in x.items()} for n,x in text.items()},'paint':paint,'rings25':{n:x['25'] for n,x in rings.items()},'selection':selections},ensure_ascii=False,indent=2))
