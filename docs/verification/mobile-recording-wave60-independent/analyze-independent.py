from pathlib import Path
from PIL import Image, ImageChops
import json,math,hashlib,gzip,subprocess
root=Path.cwd();out=root/'docs/verification/mobile-recording-wave60-independent';comp=out/'comparison';comp.mkdir(exist_ok=True)
ref=root/'docs/research/mobile-recording-sequence-01/representative/frame-n0960.png'
base=json.loads((out/'baseline-02/result.json').read_text());new=json.loads((out/'candidate-02/result.json').read_text())
assert base['baseline'] is True and base['status']=='PASS';assert new['baseline'] is False and new['status'] in ['PASS','VIEW_PASS_DESKTOP_RASTER_OPEN']
images={'reference':Image.open(ref).convert('RGB')}
for k,directory in [('old59','baseline-02'),('new60','candidate-02')]:
    image=Image.open(out/directory/'mobile-paused-392x840.png').convert('RGB');assert image.size==(784,1680)
    images[k]=image.resize((224,480),Image.Resampling.LANCZOS)
for k,im in images.items():im.save(comp/(k+'.png'))
three=Image.new('RGB',(224*3,480),'white')
for i,k in enumerate(images):three.paste(images[k],(i*224,0))
three.save(comp/'three-way.png')
rois={'full-no-mask':(0,0,224,480),'timeline-full':(0,100,224,283),'first-label-all-positions':(15,255,40,282),'axis-label-band':(0,255,224,283),'playhead':(108,100,117,273)}
def stats(a,b,roi=None):
    if roi:a,b=a.crop(roi),b.crop(roi)
    d=ImageChops.difference(a,b); pixels=list(d.getdata());changed=sum(any(p) for p in pixels);bbox=d.getbbox()
    if bbox and roi:bbox=(bbox[0]+roi[0],bbox[1]+roi[1],bbox[2]+roi[0],bbox[3]+roi[1])
    return {'pixels':len(pixels),'changedPixels':changed,'above16Pixels':sum(max(p)>16 for p in pixels),'mae':sum(sum(p) for p in pixels)/(len(pixels)*3),'maxChannelDelta':max(max(p) for p in pixels),'differenceBoundsHalfOpen':bbox}
def ink(im,roi,predicate):
    points=[(x,y) for y in range(roi[1],roi[3]) for x in range(roi[0],roi[2]) if predicate(im.getpixel((x,y)))]
    return {'pixels':len(points),'boundsHalfOpen':(min(x for x,y in points),min(y for x,y in points),max(x for x,y in points)+1,max(y for x,y in points)+1) if points else None}
metrics={};geometry={}
for k,im in images.items():
    if k=='reference':band=(15,271,40,280)
    else:
        layout=(base if k=='old59' else new)['layouts']['mobile-paused-392x840']
        label=next(l for l in layout['timeline']['labels'] if l['text']=='00:01');b=label['textBox'];band=(15,math.floor(b['y']*4/7),40,math.ceil((b['y']+b['height'])*4/7))
    geometry[k]={'labelRowBand':band,'labels':{str(t):ink(im,band,lambda p,t=t:max(p)<t) for t in [200,220,235]},'yellowOuter':ink(im,rois['playhead'],lambda p:p[0]>150 and p[1]>100 and p[2]<160 and p[0]-p[2]>45 and p[1]-p[2]>20),'yellowCore':ink(im,rois['playhead'],lambda p:p[0]>170 and p[1]>110 and p[2]<90 and p[0]-p[2]>100)}
    if k!='reference':
        metrics[k]={n:stats(images['reference'],im,roi) for n,roi in rois.items()}
        ImageChops.difference(images['reference'],im).save(comp/(k+'-raw-diff.png'));Image.blend(images['reference'],im,.5).save(comp/(k+'-overlay.png'))
ImageChops.difference(images['old59'],images['new60']).save(comp/'old-new-raw-diff.png')
desktop={}
for n in ['desktop-280x467','desktop-320x600-dark']:
    a=Image.open(out/'baseline-02'/(n+'.png')).convert('RGB');b=Image.open(out/'candidate-02'/(n+'.png')).convert('RGB')
    desktop[n]=stats(a,b);desktop[n]['domEqual']=base['layouts'][n]['dom']==new['layouts'][n]['dom'];desktop[n]['computedEqual']=base['layouts'][n]['computed']==new['layouts'][n]['computed']
    desktop[n]['regionsEqual']=base['layouts'][n]['regions']==new['layouts'][n]['regions'];desktop[n]['buttonsEqual']=base['layouts'][n]['buttons']==new['layouts'][n]['buttons']
    assert all(desktop[n][k] for k in ['domEqual','computedEqual','regionsEqual','buttonsEqual'])
    ImageChops.difference(a,b).save(comp/(n+'-independent-raw-diff.png'))
authorDesktop={}
for n in ['desktop-280x467','desktop-320x600-dark']:
    directory=root/'docs/verification/mobile-recording-wave60'
    a=Image.open(directory/'baseline-attempt02'/(n+'.png')).convert('RGB');b=Image.open(directory/'final'/(n+'.png')).convert('RGB')
    authorDesktop[n]=stats(a,b);ImageChops.difference(a,b).save(comp/(n+'-author-raw-diff.png'))
sampleRegression={}
for w,h in [(392,840),(320,568),(280,600)]:
    n=f'samples-{w}x{h}';a=Image.open(out/'baseline-02'/(n+'.png')).convert('RGB');b=Image.open(out/'candidate-02'/(n+'.png')).convert('RGB')
    red=lambda im:{(x,y) for y in range(im.height) for x in range(im.width) if (lambda p:p[0]>180 and p[1]<110 and p[2]<110)(im.getpixel((x,y)))}
    wave=base['layouts'][n]['regions']['.wave-samples'];roi=(0,math.floor(wave['y']*2),a.width,math.ceil((wave['y']+wave['height'])*2))
    aa=a.crop(roi);bb=b.crop(roi);ar=red(aa);br=red(bb);assert ar==br
    sampleRegression[n]={'sampleArea':wave,'sampleBoxesExact':base['layouts'][n]['timeline']['sampleBoxes']==new['layouts'][n]['timeline']['sampleBoxes'],'redPixels':len(ar),'redPixelPositionsExact':True,'wholeArea':stats(aa,bb)}
unclip={};axisGeometry={} 
for name,l in new['layouts'].items():
    if 'axisUnclippedSha256' not in l:continue
    a=Image.open(out/'candidate-02'/(name+'.png')).convert('RGB');b=Image.open(out/'candidate-02'/(name+'.axis-unclipped.png')).convert('RGB');axis=l['regions']['.wave-axis'];top=axis['y'];bottom=top+axis['height']
    # Exact pixels in the complete axis bounds, plus an expanded envelope that includes antialiasing outside it.
    roi=(0,math.ceil(top*2),a.width,math.floor(bottom*2));envelope=(0,math.floor(top*2)-2,a.width,math.ceil(bottom*2)+2)
    full=stats(a,b);content=stats(a,b,roi);expanded=stats(a,b,envelope)
    ImageChops.difference(a,b).save(comp/(name+'-unclip-full-raw-diff.png'))
    ImageChops.difference(a,b).crop(envelope).save(comp/(name+'-unclip-expanded-raw-diff.png'))
    unclip[name]={'full':full,'axisContentRoi':roi,'axisContent':content,'expandedRoi':envelope,'expanded':expanded}
    assert content['changedPixels']==0,'axis content raster changed after removing clip: '+name
    labels=l['timeline']['labels'];minors=l['timeline']['minorTicks'];notice=l['regions']['.recording-notice'];retry=l['regions']['.recording-playback-retry']
    extents=[]
    for label in labels:
        box=label['box'];text=label['textBox'];tickTop=box['y']+float(label['tick']['top'].removesuffix('px'));tickBottom=tickTop+float(label['tick']['height'].removesuffix('px'))
        assert box['y']>=top-.02 and box['y']+box['height']<=bottom+.02
        assert text['y']>=top-.02 and text['y']+text['height']<=bottom+.02
        assert tickTop>=top-.02 and tickBottom<=bottom+.02
        assert float(label['lineHeight'].removesuffix('px'))+float(label['paddingTop'].removesuffix('px'))<=axis['height']+.02
        extents.extend([box['y'],box['y']+box['height'],text['y'],text['y']+text['height'],tickTop,tickBottom])
    for tick in minors:
        assert tick['y']>=top-.02 and tick['y']+tick['height']<=bottom+.02;extents.extend([tick['y'],tick['y']+tick['height']])
    axisGeometry[name]={'axisTop':top,'axisBottom':bottom,'labelCount':len(labels),'minorCount':len(minors),'allContentTop':min(extents),'allContentBottom':max(extents),'noticeGap':notice['y']-bottom if notice else None,'retryGap':retry['y']-bottom if retry else None,'lineHeight':labels[0]['lineHeight'],'paddingTop':labels[0]['paddingTop'],'labelFullHeight':labels[0]['box']['height'],'textRangeHeight':labels[0]['textBox']['height'],'horizontalOffViewportLabels':sum(label['box']['x']<0 or label['box']['x']+label['box']['width']>a.width/2 for label in labels),'interactions':l.get('interactions')}
report={'source':'b5d008a25a9424f14f2e995cfd2557400cdb4614','originalFrameSha256':hashlib.sha256(ref.read_bytes()).hexdigest(),'boundary':'392x840 CSS px at DPR2, entire image resized LANCZOS to 224x480; full images and raw differences retained without masks or alignment shifts. No native/media/device proof.','rois':rois,'geometry':geometry,'againstOriginal':metrics,'desktopIndependent':desktop,'desktopAuthorFrozen':authorDesktop,'sampleRegression':sampleRegression,'axisUnclip':unclip,'axisGeometry':axisGeometry,'baselineStatus':base['status'],'candidateStatus':new['status']}
(comp/'metrics-independent.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({'geometry':geometry,'desktop':desktop,'unclipFullDifferences':{n:d['full'] for n,d in unclip.items()},'axisBottomAndNoticeGap':{n:[d['axisBottom'],d['noticeGap']] for n,d in axisGeometry.items()},'status':new['status']},indent=2,ensure_ascii=False))
