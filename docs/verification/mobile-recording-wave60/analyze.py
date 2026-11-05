from pathlib import Path
from PIL import Image, ImageChops, ImageDraw
import hashlib, json, math, subprocess

root = Path.cwd()
p = root / 'docs/verification/mobile-recording-wave60'
out = p / 'comparison'
out.mkdir(exist_ok=True)
old_run, new_run = p/'baseline-attempt02', p/'final'
old_result = json.loads((old_run/'result.json').read_text())
new_result = json.loads((new_run/'result.json').read_text())
reference = root/'docs/research/mobile-recording-sequence-01/representative/frame-n0960.png'
ref = Image.open(reference).convert('RGB')
def scaled(path):
    return Image.open(path).convert('RGB').resize((224,480),Image.Resampling.LANCZOS)
old = scaled(old_run/'mobile-paused-392x840.png')
new = scaled(new_run/'mobile-paused-392x840.png')
sha = lambda b: hashlib.sha256(b).hexdigest()
rois = {
    'full-no-mask':[0,0,224,480],
    'timeline-full':[0,100,224,283],
    'playhead':[108,100,117,273],
    'first-label-all-positions':[15,255,40,282],
    'axis-label-band':[0,255,224,283],
    'timer-protected':[60,324,165,350],
    'playback-protected':[53,365,173,401],
}
def metrics(a,b,box):
    d=ImageChops.difference(a.crop(box),b.crop(box));v=list(d.getdata());n=len(v)
    return {'mae_0_255':round(sum(sum(x) for x in v)/(3*n),6),
            'changed_pixels':sum(max(x)>0 for x in v),
            'changed_ratio_any':round(sum(max(x)>0 for x in v)/n,7),
            'changed_ratio_over16':round(sum(max(x)>16 for x in v)/n,7),
            'maximum_channel_difference':max(map(max,v))}
def ink(im,box,predicate):
    x0,y0,x1,y1=box;pts=[(x,y) for y in range(y0,y1) for x in range(x0,x1) if predicate(im.getpixel((x,y)))]
    return {'pixels':len(pts),'bounds_half_open':[min(x for x,y in pts),min(y for x,y in pts),max(x for x,y in pts)+1,max(y for x,y in pts)+1] if pts else None}
def label_band(result):
    label=next(x for x in result['layouts']['mobile-paused-392x840']['timeline']['labels'] if x['text']=='00:01')
    b=label['textBox']
    return [15,math.floor(b['y']/1.75),40,math.ceil((b['y']+b['height'])/1.75)]
yellow=lambda rgb:rgb[0]>150 and rgb[1]>100 and rgb[2]<160 and rgb[0]-rgb[2]>45 and rgb[1]-rgb[2]>20
report={
    'source':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),
    'base':'46e45e4f85c4c0d95720ea1e3e40ca5440aded03',
    'baselineProduct':'99dbb95ed0d4f796a71fcb40d5179ed6d90eeaa6',
    'boundary':{'reference':[224,480],'logical':[392,840],'render':[784,1680],
                'scale':'Entire image exact aspect LANCZOS; no fit, masks, shifts or waveform fabrication',
                'precision':'Lossy video edges approximately +/-1-2 pixels; source DPR and native fonts unknown',
                'differencesRetained':'System bars, date, excluded transcription, native material, and true waveform differences remain in full images and metrics',
                'labelExtraction':'Full fixed ROI metrics retain ticks. Label ink is measured separately within text-row bands: old/new derived from actual DOM Range; reference explicit [15,271,40,280]. These bands do not alter any image/diff/full metric.',
                'yellowPredicate':'Outer: R>150,G>100,B<160,R-B>45,G-B>20; core: R>170,G>110,B<90,R-B>100 within fixed playhead ROI. Lossy neutral fringes can extend the outer bound by one row.'},
    'rois':rois,'geometry':{},'metricsAgainstReference':{},'oldNewMetrics':{},'candidates':{},'desktop':{},'mobileProtected':{},'sampleRegression':{},'axisClearance':{},
}
for name,im,band in [('reference',ref,[15,271,40,280]),('old59',old,label_band(old_result)),('new60',new,label_band(new_result))]:
    im.save(out/(name+'-224x480.png'))
    report['geometry'][name]={'yellow':ink(im,rois['playhead'],yellow),'yellowCore':ink(im,rois['playhead'],lambda rgb:rgb[0]>170 and rgb[1]>110 and rgb[2]<90 and rgb[0]-rgb[2]>100),'labelTextRowBand':band,
        'labelInk':{str(t):ink(im,band,lambda rgb,t=t:max(rgb)<t) for t in [200,220,235]},
        'rawFirstLabelRoiInkIncludingTicks':{str(t):ink(im,rois['first-label-all-positions'],lambda rgb,t=t:max(rgb)<t) for t in [220,235]}}
for name,im in [('old59',old),('new60',new)]:
    report['metricsAgainstReference'][name]={k:metrics(ref,im,roi) for k,roi in rois.items()}
    Image.blend(ref,im,.5).save(out/(name+'-overlay.png'))
    ImageChops.difference(ref,im).save(out/(name+'-raw-diff.png'))
report['oldNewMetrics']={k:metrics(old,new,roi) for k,roi in rois.items()}
ImageChops.difference(old,new).save(out/'old-new-raw-diff.png')
contact=Image.new('RGB',(672,505),'white');draw=ImageDraw.Draw(contact)
for i,(name,im) in enumerate([('Apple n0960',ref),('Old 59 99dbb95',old),('New 60 '+report['source'][:7],new)]):
    contact.paste(im,(i*224,25));draw.text((i*224+6,7),name,fill='black')
contact.save(out/'three-way.png')
for name in ['axis-pad5','axis-pad7','axis-pad8']:
    im=scaled(old_run/('candidate-'+name+'.png'))
    im.save(out/('candidate-'+name+'-224x480.png'))
    report['candidates'][name]={'firstLabelAt220':ink(im,rois['first-label-all-positions'],lambda rgb:max(rgb)<220),'yellow':ink(im,rois['playhead'],yellow)}
for name in ['desktop-280x467','desktop-320x600-dark']:
    a,b=old_run/(name+'.png'),new_run/(name+'.png')
    ai,bi=Image.open(a).convert('RGB'),Image.open(b).convert('RGB')
    diff=ImageChops.difference(ai,bi);diff.save(out/(name+'-raw-diff.png'))
    before,after=old_result['layouts'][name],new_result['layouts'][name]
    report['desktop'][name]={'pngBytesEqual':a.read_bytes()==b.read_bytes(),'oldPngSha256':sha(a.read_bytes()),'newPngSha256':sha(b.read_bytes()),
        'domBytesEqual':before['dom']==after['dom'],'allComputedEqual':before['computed']==after['computed'],
        'geometryEqual':before['regions']==after['regions'],'timelineCommonFieldsEqual':all(before['timeline'][k]==after['timeline'][k] for k in before['timeline']),'timelineFieldsNotArchivedInFirstBaseline':sorted(set(after['timeline'])-set(before['timeline'])),
        'buttonsEqual':before['buttons']==after['buttons'],'raster':metrics(ai,bi,[0,0,ai.width,ai.height]),'rasterBoundsHalfOpen':diff.getbbox()}
protected_regions=['.recording-sheet','.waveform','.wave-samples','.recording-time','.recording-playback','.recording-primary','.recording-done','.recording-notice','.recording-playback-retry']
for name,after in new_result['layouts'].items():
    if name not in old_result['layouts'] or name.startswith('desktop'):continue
    before=old_result['layouts'][name]
    report['mobileProtected'][name]={k:before['regions'][k]==after['regions'][k] for k in protected_regions}
    assert all(report['mobileProtected'][name].values()),name
for w,h in [(392,840),(320,568),(280,600)]:
    name=f'samples-{w}x{h}'
    before,after=old_result['layouts'][name],new_result['layouts'][name]
    assert before['timeline']['sampleBoxes']==after['timeline']['sampleBoxes']
    ai,bi=Image.open(old_run/(name+'.png')).convert('RGB'),Image.open(new_run/(name+'.png')).convert('RGB')
    reg=after['regions']['.wave-samples'];box=[int(reg['x']*2),int(reg['y']*2),math.ceil((reg['x']+reg['width'])*2),math.ceil((reg['y']+reg['height'])*2)]
    red=lambda rgb:rgb[0]>180 and rgb[0]-rgb[1]>60 and rgb[0]-rgb[2]>50
    aset={(x,y) for y in range(box[1],box[3]) for x in range(box[0],box[2]) if red(ai.getpixel((x,y)))}
    bset={(x,y) for y in range(box[1],box[3]) for x in range(box[0],box[2]) if red(bi.getpixel((x,y)))}
    assert aset==bset
    report['sampleRegression'][name]={'regionEqual':before['regions']['.wave-samples']==after['regions']['.wave-samples'],'sampleBoxesEqual':True,'redSamplePixelPositionsEqual':True,'redSamplePixels':len(aset),'boundary':'Test input geometry/clipping regression only; no source waveform or amplitude equivalence'}
    l=new_result['layouts'][f'axis-error-{w}x{h}'];axis=l['regions']['.wave-axis'];notice=l['regions']['.recording-notice']
    report['axisClearance'][f'{w}x{h}']={'axisTop':axis['y'],'axisHeight':axis['height'],'axisBottom':axis['y']+axis['height'],'noticeTop':notice['y'],'gap':notice['y']-axis['y']-axis['height'],'rangeAndTicksChecked':True}
(out/'metrics.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'source':report['source'],'geometry':report['geometry'],'metricsAgainstReference':report['metricsAgainstReference'],'desktop':report['desktop'],'axisClearance':report['axisClearance']},ensure_ascii=False,indent=2))
