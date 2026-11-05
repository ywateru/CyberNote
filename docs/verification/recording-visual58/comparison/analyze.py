from PIL import Image,ImageChops,ImageDraw
import json,hashlib
from pathlib import Path
p=Path.cwd();o=p/'docs/verification/recording-visual58';c=o/'comparison'
ref=Image.open(p/'references/desktop/recording-20261105/user-recording-sidebar.png').convert('RGB').crop((1999,164,2559,1098));ref.save(c/'desktop-reference-crop.png')
old=Image.open(o/'baseline-clean/desktop-paused-280x467.png').convert('RGB');new=Image.open(o/'final-source/desktop-paused-280x467.png').convert('RGB')
rois={'full':[0,0,560,934],'title-date':[24,38,260,120],'top-controls':[414,40,536,94],'waveform-dynamic':[0,128,560,542],'time-axis':[0,528,560,590],'timer':[160,650,400,716],'playback':[150,735,410,795],'continue-state-difference':[126,816,434,912],'done':[442,815,536,912]}
def metrics(a,b,boxes):
 r={}
 for name,box in boxes.items():
  pixels=list(ImageChops.difference(a.crop(box),b.crop(box)).getdata());n=len(pixels)
  r[name]={'bounds':box,'mean_absolute_channel_error_0_255':round(sum(sum(v) for v in pixels)/(n*3),3),'changed_pixel_ratio_any_channel':round(sum(max(v)>0 for v in pixels)/n,5),'changed_pixel_ratio_channel_error_over_16':round(sum(max(v)>16 for v in pixels)/n,5)}
 return r
def bbox(im,box,predicate):
 x0,y0,x1,y1=box; pts=[(x,y) for y in range(y0,y1) for x in range(x0,x1) if predicate(im.getpixel((x,y)))];return [min(x for x,y in pts),min(y for x,y in pts),max(x for x,y in pts)+1,max(y for x,y in pts)+1] if pts else None
ink=lambda a:max(a)<120
yellow=lambda a:a[0]>180 and a[1]>120 and a[2]<80
geometry={}
for name,im in [('reference',ref),('old',old),('new',new)]:
 geometry[name]={'title_ink':bbox(im,[25,35,135,85],ink),'timer_ink':bbox(im,[160,590,400,716],ink),'play_triangle_ink':bbox(im,[255,728,310,795],ink),'done_gold':bbox(im,[440,810,535,915],yellow),'playhead_gold':bbox(im,[270,125,290,550],yellow),'second2_label_ink':bbox(im,([195,510,255,545] if name=='old' else [125,550,215,585]),lambda a:max(a)<180)}
for name,im in [('old',old),('new',new)]:
 Image.blend(ref,im,.5).save(c/f'desktop-overlay-{name}.png');ImageChops.difference(ref,im).save(c/f'desktop-diff-{name}.png')
contact=Image.new('RGB',(560*3,964),'white');draw=ImageDraw.Draw(contact)
for i,(name,im) in enumerate([('Apple preserved crop',ref),('Old 50144de',old),('New 8a30547',new)]):
 contact.paste(im,(i*560,30));draw.text((i*560+12,9),name,fill='black')
contact.save(c/'desktop-three-way.png')
annotated=ref.copy();draw=ImageDraw.Draw(annotated)
for k,box in rois.items():
 if k=='full':continue
 draw.rectangle(box,outline='#0070cc',width=1);draw.text((box[0]+2,box[1]+2),k,fill='#0070cc')
annotated.save(c/'desktop-rois.png')
mr=Image.open(p/'docs/research/mobile-recording-sequence-01/representative/frame-n0960.png').convert('RGB')
mo=Image.open(o/'baseline-clean/mobile-paused-392x840.png').convert('RGB').resize((224,480),Image.Resampling.LANCZOS)
mn=Image.open(o/'final-source/mobile-paused-392x840.png').convert('RGB').resize((224,480),Image.Resampling.LANCZOS)
mobile_rois={'full-source-system-differences':[0,0,224,480],'title-date':[65,59,158,93],'waveform-dynamic':[0,104,224,270],'axis-coarse':[0,270,224,283],'timer':[60,326,164,349],'playback':[50,365,175,400],'continue':[68,413,157,450]}
for name,im in [('reference',mr),('old',mo),('new',mn)]:im.save(c/f'mobile-{name}-224x480.png')
contact=Image.new('RGB',(672,505),'white');draw=ImageDraw.Draw(contact)
for i,(name,im) in enumerate([('Apple video n0960',mr),('Old projection',mo),('New projection',mn)]):contact.paste(im,(224*i,25));draw.text((224*i+5,7),name,fill='black')
contact.save(c/'mobile-three-way.png')
Image.blend(mr,mn,.5).save(c/'mobile-overlay-new.png');ImageChops.difference(mr,mn).save(c/'mobile-diff-new.png')
report={'boundary':{'desktop_source_crop':[1999,164,560,934],'desktop_logical':[280,467],'render_dpr':2,'desktop_source_dpr':'not independently proven; explicit 2x engineering comparison only','mobile_source':[224,480],'mobile_logical':[392,840],'mobile_render':[784,1680],'mobile_downsample':'exact aspect LANCZOS to224x480; lossy reference supports coarse geometry only','no_masks':True,'dynamic_differences':'3 controlled sample props, real date formatted from current day08:53; source amplitudes/date differ. Original desktop Continue gray state unknown; ordinary paused remains enabled red. Source mobile has native status/Home/ellipsis/transcription absent in controlled projection.'},'desktop_metrics':{'old':metrics(ref,old,rois),'new':metrics(ref,new,rois)},'desktop_ink_geometry_image_pixels':geometry,'mobile_metrics':{'old':metrics(mr,mo,mobile_rois),'new':metrics(mr,mn,mobile_rois)}}
(c/'metrics.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(geometry,indent=2));print('desktop ROI MAE old -> new')
for k in rois:print(k,report['desktop_metrics']['old'][k]['mean_absolute_channel_error_0_255'],report['desktop_metrics']['new'][k]['mean_absolute_channel_error_0_255'])
