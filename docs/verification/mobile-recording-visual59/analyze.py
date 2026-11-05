from PIL import Image, ImageChops, ImageDraw
from pathlib import Path
import json, hashlib, subprocess

root = Path.cwd()
p = root / 'docs/verification/mobile-recording-visual59'
o = p / 'comparison'
o.mkdir(exist_ok=True)
refpath = root / 'docs/research/mobile-recording-sequence-01/representative/frame-n0960.png'
ref = Image.open(refpath).convert('RGB')
old = Image.open(p/'baseline-attempt02/mobile-paused-392x840.png').convert('RGB').resize((224,480), Image.Resampling.LANCZOS)
new = Image.open(p/'final/mobile-paused-392x840.png').convert('RGB').resize((224,480), Image.Resampling.LANCZOS)
rois = {'full-no-mask':[0,0,224,480], 'timer':[60,324,165,350], 'playback':[53,365,173,401], 'back':[55,365,85,400], 'play':[100,365,127,398], 'forward':[140,365,171,400], 'timeline-unchanged':[0,102,224,283]}

def metric(a,b,box):
    values=list(ImageChops.difference(a.crop(box),b.crop(box)).getdata()); n=len(values)
    return {'mae_0_255':round(sum(sum(v) for v in values)/(n*3),4),'changed_ratio_any':round(sum(max(v)>0 for v in values)/n,5),'changed_ratio_over16':round(sum(max(v)>16 for v in values)/n,5)}

def ink(im,box,threshold):
    x0,y0,x1,y1=box
    pts=[(x,y) for y in range(y0,y1) for x in range(x0,x1) if max(im.getpixel((x,y)))<threshold]
    return {'count':len(pts),'bounds_half_open':[min(x for x,y in pts),min(y for x,y in pts),max(x for x,y in pts)+1,max(y for x,y in pts)+1]} if pts else {'count':0,'bounds_half_open':None}

report = {'source':'99dbb95ed0d4f796a71fcb40d5179ed6d90eeaa6','base':'a4af6b8f7f05f59b997e5df3abda25f9521aeec8','boundary':{'source':[224,480],'logical':[392,840],'render':[784,1680],'scale':'whole image exact aspect LANCZOS; no fitting or masks','precision':'lossy video, coarse geometry only; excludes no pixels from full metrics','dynamic':'controlled current-day10:26 timestamp; empty samples, no invented silent waveform; source recording data differs','source_dpr':'unknown'},'rois':rois,'geometry':{},'metrics':{},'candidates':{},'desktop':{}}
for label,im in [('reference',ref),('old',old),('new',new)]:
    im.save(o/(label+'-224x480.png'))
    report['geometry'][label]={k:{str(t):ink(im,box,t) for t in [96,160]} for k,box in rois.items() if k in ['timer','back','play','forward']}
for label,im in [('old',old),('new',new)]:
    report['metrics'][label]={k:metric(ref,im,b) for k,b in rois.items()}
    Image.blend(ref,im,.5).save(o/(label+'-overlay.png'))
    ImageChops.difference(ref,im).save(o/(label+'-diff.png'))
contact=Image.new('RGB',(672,505),'white');draw=ImageDraw.Draw(contact)
for i,(label,im) in enumerate([('Apple n0960',ref),('Old a4af6b8',old),('New 99dbb95',new)]):
    contact.paste(im,(224*i,25));draw.text((224*i+6,7),label,fill='black')
contact.save(o/'three-way.png')
annotated=ref.copy();draw=ImageDraw.Draw(annotated)
for name in ['timer','back','play','forward']:
    draw.rectangle(rois[name],outline='#0070cc');draw.text((rois[name][0],rois[name][1]-10),name,fill='#0070cc')
annotated.save(o/'rois.png')
for weight in [600,650,700]:
    im=Image.open(p/f'baseline-attempt02/candidate-timer-{weight}.png').convert('RGB').resize((224,480),Image.Resampling.LANCZOS)
    report['candidates'][str(weight)]={str(t):ink(im,rois['timer'],t) for t in [96,160]}
    im.save(o/f'timer-{weight}-224x480.png')
for name in ['desktop-280x467','desktop-320x600-dark']:
    a=(p/'baseline-computed'/f'{name}.png').read_bytes();b=(p/'final'/f'{name}.png').read_bytes()
    report['desktop'][name]={'png_bytes_equal':a==b,'sha256_old':hashlib.sha256(a).hexdigest(),'sha256_new':hashlib.sha256(b).hexdigest(),'dom_bytes_equal':(p/'baseline-computed'/f'{name}.dom.txt').read_bytes()==(p/'final'/f'{name}.dom.txt').read_bytes()}
first_a=Image.open(p/'baseline-attempt02/desktop-320x600-dark.png').convert('RGB');first_b=Image.open(p/'new-attempt01/desktop-320x600-dark.png').convert('RGB');values=list(ImageChops.difference(first_a,first_b).getdata())
report['first_desktop_raster_residual']={'changed_pixels':sum(max(v)>0 for v in values),'max_channel_difference':max(max(v) for v in values),'bounds_half_open':ImageChops.difference(first_a,first_b).getbbox(),'final_exact_byte_equal':True}
ImageChops.difference(first_a,first_b).save(o/'first-desktop-dark-diff.png')
(o/'metrics.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
files=['src/RecordingView.tsx','src/RecordingPanel.css','scripts/check-mobile-recording-visual59.mjs']
protected=['src/recording-waveform.tsx','src/recording-session.ts','src/recording-coordinator.ts','src/RecordingDock.tsx','src/RecordingPanel.tsx','src/recording-window-transport.ts','src/App.tsx','src/style.css']
sha=lambda b:hashlib.sha256(b).hexdigest()
manifest={'source':report['source'],'base':report['base'],'source_files':{f:sha((root/f).read_bytes()) for f in files},'protected':{f:{'sha256':sha((root/f).read_bytes()),'matches_base':(root/f).read_bytes()==subprocess.check_output(['git','show','a4af6b8:'+f])} for f in protected},'reference_sha256':sha(refpath.read_bytes())}
(p/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'geometry':report['geometry'],'metrics':report['metrics'],'desktop':report['desktop']},ensure_ascii=False,indent=2))
