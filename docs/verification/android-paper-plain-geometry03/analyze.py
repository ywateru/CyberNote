"""Finite image geometry from saved native plain-selected capture and video frame.

No app/runtime code, target/cache, device, downloads, or source mutation. All image
coordinates are decoded source pixels; width ratios are illustrative, not DPR.
"""
from pathlib import Path
import hashlib, json, shutil, subprocess
import PIL
from PIL import Image, ImageDraw
import numpy as np

ROOT = Path('/Users/water/work/2026/Apple-Notes-Clone')
OUT = ROOT / 'docs/verification/android-paper-plain-geometry03'
SOURCE = '347660b352f6becb1f52a9c79fdf5372b50f1f12'
CLONE = OUT / '04-plain-saved-reopened.png'
REF = ROOT / 'references/mobile/frames-2s/frame-044.png'
assert shutil.disk_usage(ROOT).free >= 2 * 1024**3

def ident(p):
    b = p.read_bytes()
    return {'path': str(p.relative_to(ROOT)), 'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest()}

before = [ident(CLONE), ident(REF)]

def region(a, roi):
    x0,y0,x1,y1 = roi
    return a[y0:y1,x0:x1]

def bbox(mask, roi):
    y,x = np.where(mask)
    return None if len(x)==0 else [int(x.min()+roi[0]),int(y.min()+roi[1]),int(x.max()+1+roi[0]),int(y.max()+1+roi[1])]

def gold(a, variant):
    r,g,b = a[:,:,0],a[:,:,1],a[:,:,2]
    if variant=='loose': return (r>150)&(g>95)&(r-g>8)&(g-b>15)
    if variant=='strict': return (r>170)&(g>100)&(r-g>12)&(g-b>25)
    return (r>180)&(g>110)&(r-g>20)&(g-b>50)

def spans(mask, box, count=6):
    x0,y0,x1,y1 = box
    def row(y):
        xs=np.where(mask[y,x0:x1])[0]
        return {'y':y,'leftInset':int(xs.min()) if len(xs) else None,
                'rightInset':int(x1-x0-1-xs.max()) if len(xs) else None,'count':int(len(xs))}
    def col(x):
        ys=np.where(mask[y0:y1,x])[0]
        return {'x':x,'topInset':int(ys.min()) if len(ys) else None,
                'bottomInset':int(y1-y0-1-ys.max()) if len(ys) else None,'count':int(len(ys))}
    return {'topRows':[row(y) for y in range(y0,min(y0+count,y1))],
            'bottomRows':[row(y) for y in range(max(y0,y1-count),y1)],
            'leftColumns':[col(x) for x in range(x0,min(x0+count,x1))],
            'rightColumns':[col(x) for x in range(max(x0,x1-count),x1)]}

def clusters(values):
    groups=[]
    for v in values:
        if not groups or v>groups[-1][-1]+1: groups.append([int(v)])
        else: groups[-1].append(int(v))
    return [[g[0],g[-1]+1] for g in groups]

specs = {
 'clone': {'path':CLONE,'panelTop':138,'goldROI':[105,520,495,840],
           'descriptionROI':[160,380,920,460],
           'cards':{'plain':[110,525,490,835], 'lines-small':[115,940,490,1248],
                    'lines-medium':[595,940,970,1248],'lines-large':[115,1355,490,1663],
                    'grid-small':[595,1355,970,1663],'grid-medium':[115,1770,490,2078],
                    'grid-large':[595,1770,970,2078]}},
 'reference': {'path':REF,'panelTop':32,'goldROI':[18,108,108,182],
               'descriptionROI':[30,80,195,102],
               'cards':{'plain':[22,110,105,180],'lines-small':[22,198,103,264],
                        'lines-medium':[122,198,203,264],'lines-large':[22,283,103,350],
                        'grid-small':[122,283,203,350],'grid-medium':[22,368,103,435],
                        'grid-large':[122,368,203,435]}}
}
result={'source':SOURCE,'coordinateConvention':'[x0,y0,x1,y1), decoded image pixels; no DPR inference',
        'widthRatioIllustration':224/1080,'pillow':PIL.__version__,'numpy':np.__version__,'images':{}}
images={}
for name,spec in specs.items():
    image=Image.open(spec['path']).convert('RGB');images[name]=image
    a=np.array(image,dtype=np.int32)
    out={'input':ident(spec['path']),'dimensions':list(image.size),'panelTopObserved':spec['panelTop'],
         'goldROI':spec['goldROI'],'gold':{},'description':{},'cards':{}}
    for variant in ['loose','strict','strong']:
        roi=spec['goldROI'];m=gold(region(a,roi),variant);box=bbox(m,roi)
        full=np.zeros(a.shape[:2],dtype=bool);full[roi[1]:roi[3],roi[0]:roi[2]]=m
        out['gold'][variant]={'bbox':box,'edgeSpans':spans(full,box)}
    roi=spec['descriptionROI'];sub=region(a,roi)
    luminance=299*sub[:,:,0]+587*sub[:,:,1]+114*sub[:,:,2]
    neutral=(sub.max(axis=2)-sub.min(axis=2))<25
    for threshold in [120,160,200,220]:
        out['description'][str(threshold)]={'bbox':bbox(neutral&(luminance<threshold*1000),roi)}
    for style,roi in spec['cards'].items():
        sub=region(a,roi);white=(sub.min(axis=2)>=250)&((sub.max(axis=2)-sub.min(axis=2))<=4)
        whitebox=bbox(white,roi);card={'whiteFillBbox':whitebox}
        if style!='plain':
            pad=8 if name=='clone' else 3
            inner=[whitebox[0]+pad,whitebox[1]+pad,whitebox[2]-pad,whitebox[3]-pad]
            sub=region(a,inner);gray=((sub.max(axis=2)-sub.min(axis=2))<16)&(sub.max(axis=2)<243)&(sub.min(axis=2)>100)
            card['internalSearchROI']=inner;card['internalGrayBbox']=bbox(gray,inner)
            card['horizontalLineBands']=clusters(np.where(gray.sum(axis=1)>gray.shape[1]*0.4)[0]+inner[1])
            card['verticalLineBands']=clusters(np.where(gray.sum(axis=0)>gray.shape[0]*0.4)[0]+inner[0])
        out['cards'][style]=card
    result['images'][name]=out

css=subprocess.check_output(['git','show',SOURCE+':src/style.css'],cwd=ROOT).decode()
app=subprocess.check_output(['git','show',SOURCE+':src/App.tsx'],cwd=ROOT).decode()
start=css.index('  .mobile .modal-paper .paper-option {')
end=css.index('  .mobile .modal-paper .paper-blank {',start)
selection_css=css[start:end]
assert 'outline: 1.5px solid var(--accent)' in selection_css and 'border-radius: 5px' in selection_css and 'border: 0' in selection_css
result['sourceEvidence']={'styleCssSHA256':hashlib.sha256(css.encode()).hexdigest(),
    'AppSHA256':hashlib.sha256(app.encode()).hexdigest(),'selectionCss':selection_css,
    'evidenceType':'Exact source bytes only, no native computed CSS or paint-tree capture',
    'selectionPaintCandidate':'Mobile selected rule uses outline with offset, separate from white-card border-radius. Native screenshot shows square gold contour. Narrow candidate is a rounded explicit selection border/pseudo-element preserving slot and offsets; requires separate real-package test. No engine-internal cause or original radius proven.'}

# Derivative only: source-pixel crops, enlarged nearest-neighbor, no alignment or
# resampling of either original full image. Different crop sizes are labeled.
sheet=Image.new('RGB',(840,530),'#eeeef1');draw=ImageDraw.Draw(sheet)
crop_records=[]
for row,name in enumerate(['reference','clone']):
    image=images[name];box=result['images'][name]['gold']['strict']['bbox']
    size,margin=(14,2) if name=='reference' else (64,10)
    x0,y0,x1,y1=box
    crops=[(x0-margin,y0-margin,x0-margin+size,y0-margin+size),
           (x1+margin-size,y0-margin,x1+margin,y0-margin+size),
           (x0-margin,y1+margin-size,x0-margin+size,y1+margin),
           (x1+margin-size,y1+margin-size,x1+margin,y1+margin)]
    draw.text((12,row*265+5),f'{name}: source crops {size}x{size}; NEAREST enlarged to192px. Not DPR.',fill='black')
    for col,(label,roi) in enumerate(zip(['top-left','top-right','bottom-left','bottom-right'],crops)):
        draw.text((12+col*208,row*265+28),label,fill='black')
        sheet.paste(image.crop(roi).resize((192,192),Image.Resampling.NEAREST),(12+col*208,row*265+48))
        crop_records.append({'image':name,'corner':label,'sourceCrop':list(roi),'display':[192,192]})
sheet.save(OUT/'corners-nearest-derivative.png')
result['derivative']={'identity':ident(OUT/'corners-nearest-derivative.png'),'crops':crop_records,
    'limitation':'Illustration of original decoded pixels only. Does not increase reference detail or establish matched physical scale.'}
assert before==[ident(CLONE),ident(REF)]
result['inputsUnchanged']=True
with (OUT/'analysis.json').open('x') as f:f.write(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'analysis':ident(OUT/'analysis.json'),'goldBboxes':{k:v['gold']['strict']['bbox'] for k,v in result['images'].items()},
 'description200':{k:v['description']['200'] for k,v in result['images'].items()},'sourceEvidence':result['sourceEvidence']},ensure_ascii=False))
