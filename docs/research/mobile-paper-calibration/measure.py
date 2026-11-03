#!/usr/bin/env python3
"""Offline, deterministic paper-picker geometry audit. No UI/device or production writes.
Coordinates are source-image pixels; boxes are [left,top,right,bottom), edges have ±1–2 px
uncertainty in the 224 px video frame. Width normalization is the only scale transform.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from collections import Counter
import hashlib, json, statistics
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
CONFIG={
 'reference':{'path':'references/mobile/frames-2s/frame-044.png','sheet_top':32,'peek_sheet_top':27,'system_top':[0,27],'system_bottom_indicator':[72,473,153,476],
  'cards':{'blank':[24,114,101,177],'lines-small':[25,201,99,261],'lines-medium':[125,201,199,261],'lines-large':[25,287,99,346],'grid-small':[125,287,199,346],'grid-medium':[25,372,99,432],'grid-large':[125,372,199,432]},
  'text_rois':{'cancel':[5,40,32,57],'title':[75,40,150,58],'description':[30,82,195,99]}},
 'clone':{'path':'docs/verification/app-001-fix-01-paper/android/paper-picker-native.png','sheet_top':138,'system_top':[0,83],'system_bottom':[2148,2280],
  'cards':{'blank':[110,556,492,859],'lines-small':[110,941,492,1244],'lines-medium':[589,941,971,1244],'lines-large':[110,1326,492,1629],'grid-small':[589,1326,971,1629],'grid-medium':[110,1711,492,2014],'grid-large':[589,1711,971,2014]},
  'text_rois':{'cancel':[40,180,160,245],'title':[400,180,700,245],'description':[180,360,900,425]}}
}
def groups(values):
 result=[]
 for v in values:
  if result and v==result[-1][-1]+1: result[-1].append(v)
  else: result.append([v])
 return result

def bbox(points):
 if not points:return None
 return [min(p[0] for p in points),min(p[1] for p in points),max(p[0] for p in points)+1,max(p[1] for p in points)+1]

def rect_info(box,w):
 x0,y0,x1,y1=box
 return {'box':box,'width':x1-x0,'height':y1-y0,'width_fraction':(x1-x0)/w,'height_per_screen_width':(y1-y0)/w,'at_390':[round(x*390/w,3) for x in box]}

def patterns(im,box):
 x0,y0,x1,y1=box;w=x1-x0;h=y1-y0
 def ink(x,y):
  p=im.getpixel((x,y));return max(p)<240 and max(p)-min(p)<13
 hg=groups([y for y in range(y0,y1) if sum(ink(x,y) for x in range(x0,x1))>=w*.6])
 vg=groups([x for x in range(x0,x1) if sum(ink(x,y) for y in range(y0,y1))>=h*.6])
 hs=[round(statistics.mean(g),3) for g in hg];vs=[round(statistics.mean(g),3) for g in vg]
 # Median per-stroke endpoints prevent card-corner shadows becoming pattern extents.
 hbounds=[]
 for g in hg:
  xs=[x for x in range(x0,x1) if any(ink(x,y) for y in g)]
  if xs: hbounds.append([min(xs),max(xs)+1])
 vbounds=[]
 for g in vg:
  ys=[y for y in range(y0,y1) if any(ink(x,y) for x in g)]
  if ys: vbounds.append([min(ys),max(ys)+1])
 px0=statistics.median([a[0] for a in hbounds]) if hbounds else (min(vs) if vs else None)
 px1=statistics.median([a[1] for a in hbounds]) if hbounds else (max(vs)+1 if vs else None)
 py0=statistics.median([a[0] for a in vbounds]) if vbounds else (min(hs) if hs else None)
 py1=statistics.median([a[1] for a in vbounds]) if vbounds else (max(hs)+1 if hs else None)
 pb=[px0,py0,px1,py1] if px0 is not None and py0 is not None else None
 return {'threshold':'neutral RGB max<240, channel spread<13, stroke coverage>=60%; contiguous raster rows/cols grouped',
 'horizontal_centers':hs,'vertical_centers':vs,'horizontal_count':len(hs),'vertical_count':len(vs),
 'horizontal_spacing':round(statistics.median([b-a for a,b in zip(hs,hs[1:])]),3) if len(hs)>1 else None,
 'vertical_spacing':round(statistics.median([b-a for a,b in zip(vs,vs[1:])]),3) if len(vs)>1 else None,
 'pattern_ink_box':pb,'insets_from_card':[round(px0-x0,3),round(py0-y0,3),round(x1-px1,3),round(y1-py1,3)] if pb else None,
 'stroke_raster_runs_y':hg,'stroke_raster_runs_x':vg}

results={'method':{'box_convention':'half-open source image pixels; card boxes manually anchored to visible raster edges then pattern strokes threshold-measured',
 'uncertainty':'reference boundaries ±1–2 px, stroke centers ±0.5–1 px; clone bounds ±1–2 px',
 'DPR':'reference unknown; 390-width mapping is an engineering starting point, not a recovered CSS viewport or DPR',
 'scaling':'isotropic per image: factor=390/image.width; no height fitting, no global pass metric'},'images':{}}
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',13)
for name,c in CONFIG.items():
 p=ROOT/c['path'];im=Image.open(p).convert('RGB');w,h=im.size
 result={'path':c['path'],'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'size':[w,h],'aspect_height_per_width':h/w,
 'isotropic_height_at_390':h*390/w,'sheet_top':c['sheet_top'],'sheet_top_at_390':c['sheet_top']*390/w,
 'system_regions':{k:v for k,v in c.items() if k.startswith('system_')},'cards':{},'text':{},'colors':{'sheet_mode':Counter(im.crop((int(w*.45),int(h*.22),int(w*.55),int(h*.25))).getdata()).most_common(1)[0]}}
 for label,box in c['cards'].items():
  info=rect_info(box,w);info['pattern']=patterns(im,box) if label!='blank' else None;result['cards'][label]=info
 for label,roi in c['text_rois'].items():
  x0,y0,x1,y1=roi;pts=[]
  for y in range(y0,y1):
   for x in range(x0,x1):
    px=im.getpixel((x,y))
    found=(px[0]>130 and px[1]>70 and px[2]<150 and px[0]-px[2]>35) if label=='cancel' else (max(px)<130 if label=='title' else max(px)<190)
    if found:pts.append((x,y))
  b=bbox(pts);result['text'][label]={'roi':roi,'ink':rect_info(b,w),'notes':'ink bbox only; line box/font metrics cannot be recovered from screenshot'}
 result['layout']={'left_margin':c['cards']['lines-small'][0],'right_margin':w-c['cards']['lines-medium'][2],
 'column_gap':c['cards']['lines-medium'][0]-c['cards']['lines-small'][2],
 'row_top_positions':[c['cards'][k][1] for k in ['blank','lines-small','lines-large','grid-medium']],
 'row_gaps':[c['cards']['lines-small'][1]-c['cards']['blank'][3],c['cards']['lines-large'][1]-c['cards']['lines-small'][3],c['cards']['grid-medium'][1]-c['cards']['lines-large'][3]],
 'description_to_blank_gap':c['cards']['blank'][1]-result['text']['description']['ink']['box'][3]}
 # Appearance observations retain low-resolution uncertainty instead of recovering CSS/DPR.
 result['appearance']={'selection':'blank selected; gold outline; no checkmark in either source',
 'card_corner_radius_estimate_raw':([2,4] if name=='reference' else [12,16]),
 'card_corner_radius_estimate_at_390':([3.48,6.96] if name=='reference' else [4.33,5.78]),
 'selection_stroke_note':'reference gold raster footprint 1–3 px incl. compression halo; not reliable physical stroke width' if name=='reference' else 'gold edge about5 px =1.81 under390 width mapping',
 'visible_unselected_border':'none; grid outer border belongs to inset pattern in reference, not card outline',
 'shadow':'both faint; no numeric shadow blur inferred from compressed reference'}
 results['images'][name]=result
 # Same width annotation view. Individual images retain aspect ratios exactly.
 scale=448/w;view=im.resize((448,round(h*scale)),Image.Resampling.NEAREST if name=='reference' else Image.Resampling.LANCZOS)
 d=ImageDraw.Draw(view)
 for idx,(label,b) in enumerate(c['cards'].items()):
  rb=[round(v*scale) for v in b];d.rectangle(rb,outline='#e42943',width=2)
  pattern=result['cards'][label]['pattern']
  if pattern and pattern['pattern_ink_box']:
   pb=[round(v*scale) for v in pattern['pattern_ink_box']];d.rectangle(pb,outline='#008a73',width=1)
  d.rectangle((rb[0],rb[1]-16,rb[0]+min(130,len(label)*8),rb[1]),fill='white');d.text((rb[0]+2,rb[1]-15),label,fill='#a90020',font=font)
 d.line((0,round(c['sheet_top']*scale),448,round(c['sheet_top']*scale)),fill='#2678d8',width=2)
 view.save(OUT/(name+'-annotated.png'))
 # Crop corresponding component only at equal normalized width; never force matching heights.
 crop=im.crop((0,c['sheet_top'],w,c['cards']['grid-medium'][3]+round(w*.03)))
 crop.resize((448,round(crop.height*448/w)),Image.Resampling.NEAREST if name=='reference' else Image.Resampling.LANCZOS).save(OUT/(name+'-component-width448.png'))
# Side by side full screenshots preserve each full image's normalized height and system bars.
ref=Image.open(OUT/'reference-annotated.png');clone=Image.open(OUT/'clone-annotated.png')
canvas=Image.new('RGB',(928,max(ref.height,clone.height)+44),'#e6e8ec');d=ImageDraw.Draw(canvas)
d.text((8,10),'REFERENCE 224x480 / width x2',fill='#222',font=font);d.text((480,10),'CLONE 1080x2280 / width x0.4148',fill='#222',font=font)
canvas.paste(ref,(0,44));canvas.paste(clone,(480,44));canvas.save(OUT/'annotated-comparison.png')
(OUT/'measurements.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:{'layout':v['layout'],'text':v['text'],'patterns':{n:vv['pattern'] for n,vv in v['cards'].items() if vv['pattern']}} for k,v in results['images'].items()},ensure_ascii=False,indent=2))
