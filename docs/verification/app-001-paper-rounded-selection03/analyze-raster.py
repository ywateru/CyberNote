"""Compare retained production App rasters, without inferring original device DPR."""
import json
import math
import sys
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw

root = Path(__file__).resolve().parent
run = root / (sys.argv[1] if len(sys.argv) > 1 else 'run04')
data = json.loads((run / 'result.json').read_text())
report = {'scope': 'Exact saved headless PNG pixels, fixture DPR 2; not native Android or source video pixel acceptance.', 'run': run.name, 'pairs': [], 'desktop': []}

for pair in data['paintPairs']:
    name = pair['style']
    images = {v: Image.open(run / f'mobile-{name}-{v}.png').convert('RGB') for v in ['baseline', 'candidate']}
    difference = ImageChops.difference(images['baseline'], images['candidate'])
    x, y, w, h = next(o['rect'] for o in pair['candidate'] if o['selected'])
    # .modal-paper has top=20 CSS px in the complete production CSS.
    bounds = (math.floor((x-4)*2), math.floor((y-20-4)*2), math.ceil((x+w+4)*2), math.ceil((y-20+h+4)*2))
    item = {'style': name, 'changedPixelBounds': difference.getbbox(), 'changedPixels': sum(pixel != (0, 0, 0) for pixel in difference.getdata()), 'cardRectCSS': [x,y,w,h], 'cropBoundsRaster': bounds, 'paint': {}}
    for version, image in images.items():
        crop = image.crop(bounds)
        gold = [(a,b) for b in range(crop.height) for a in range(crop.width) if (lambda c: c[0]>100 and c[1]>60 and c[0]>c[1] and c[2]<80)(crop.getpixel((a,b)))]
        assert gold, f'{name} {version}: no gold outline pixels in actual selected-card crop'
        l,t,r,b = min(x for x,y in gold),min(y for x,y in gold),max(x for x,y in gold),max(y for x,y in gold)
        corners = {'topLeft': (l,t), 'topRight': (r,t), 'bottomLeft': (l,b), 'bottomRight': (r,b)}
        item['paint'][version] = {'goldPixels': len(gold), 'goldBoundsRaster': [l+bounds[0],t+bounds[1],r+bounds[0],b+bounds[1]], 'nearestGoldDistanceFromBoundingBoxCorners': {k: min(math.hypot(a-c[0],b-c[1]) for a,b in gold) for k,c in corners.items()}}
        assert all(distance>0 for distance in item['paint'][version]['nearestGoldDistanceFromBoundingBoxCorners'].values()), 'Both retained Chrome rasters are already rounded; do not call baseline square'
        if name == 'plain':
            crop.resize((crop.width*3,crop.height*3),Image.Resampling.NEAREST).save(root/f'plain-{version}-3x.png')
    assert item['paint']['baseline']['goldBoundsRaster'] == item['paint']['candidate']['goldBoundsRaster'], 'Actual outline outer raster boundary preserved'
    # Every unselected white card and mask must be byte-for-byte unchanged.
    item['unselectedCardPixelsEqual'] = []
    for option in pair['candidate']:
        if option['selected']:
            continue
        a,b,c,d=option['rect']
        rect=(math.floor((a-3)*2),math.floor((b-20-3)*2),math.ceil((a+c+3)*2),math.ceil((b-20+d+3)*2))
        equal=ImageChops.difference(images['baseline'].crop(rect),images['candidate'].crop(rect)).getbbox() is None
        item['unselectedCardPixelsEqual'].append({'style':option['id'],'equal':equal})
        assert equal
    report['pairs'].append(item)

for version in ['baseline','candidate']:
    a=Image.open(run/f'desktop-{version}-baseline.png').convert('RGB')
    b=Image.open(run/f'desktop-{version}-candidate.png').convert('RGB')
    same=ImageChops.difference(a,b).getbbox() is None
    assert same
    report['desktop'].append({'realAppRun':version,'exactRasterEqual':same})

report['pass']=True
(root/f'raster-analysis-{run.name}.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
