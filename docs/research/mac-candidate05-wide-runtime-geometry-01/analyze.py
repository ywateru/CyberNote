from pathlib import Path
from PIL import Image, ImageChops, ImageDraw
import hashlib, json, shutil

ROOT = Path('/Users/water/work/2026/Apple-Notes-Clone')
OUT = Path(__file__).resolve().parent
SOURCE = ROOT / 'docs/verification/mac-candidate05-wide-toolbar-runtime-02'
assert shutil.disk_usage(ROOT).free >= 2 * 1024**3
IDENTITIES = {
    '09-wide-body-focus.cua-image': '5a8eb558efeb1e6eab583c7c8bb9d8cdd326f11076651ac6d31daa3c951c7a1e',
    '09-wide-body-focus.ax.txt': 'f0ce9ac3f101a68075df656258f7bcbc5fac44d844f5af8f4bc6deba1f579679',
    '11-original-wide-columns-matched.cua-image': 'bbf0ea2a743a374eed3372f03142956100af54eb880f45eafc841d00bddfd544',
    '11-original-wide-columns-matched.ax.txt': 'ed971c74f3fbdacd156825279fa91d9446ffd3e5231517d87ba799a251b18f1f',
}
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
identities = {}
for name, expected in IDENTITIES.items():
    p = SOURCE / name
    assert sha(p) == expected
    identities[name] = {'path': str(p), 'bytes': p.stat().st_size, 'sha256': expected}

rois = {'toolbar': [1176, 0, 2784, 112], 'body': [1200, 155, 1600, 280]}
features = {'edit': [1190, 20, 1280, 85], 'format': [1430, 20, 1768, 85], 'share': [1920, 20, 2092, 85], 'search': [2110, 20, 2780, 85]}
lines = [[1200, 165, 1600, 200], [1200, 200, 1600, 234], [1200, 234, 1600, 270]]
images = {}
result = {'coordinateSystem': 'Decoded source image pixels; top-left origin; boxes [x0,y0,x1,y1) exclusive. No DPR/point/frame inference.', 'rois': rois, 'featureSearchRois': features, 'lineSearchRois': lines, 'method': 'Neutral dark ink iff 299R+587G+114B < threshold*1000 and max(R,G,B)-min(R,G,B)<25. Threshold sensitivity 120/160/200. All qualifying pixels within each explicit ROI, no registration/resampling/ICC conversion.', 'sources': identities, 'measurements': {}}

def coords(im, box, threshold):
    p = im.load()
    return [(x, y) for y in range(box[1], box[3]) for x in range(box[0], box[2]) if sum(v*w for v,w in zip(p[x,y], (299,587,114))) < threshold*1000 and max(p[x,y])-min(p[x,y]) < 25]

def bbox(points):
    if not points:
        return None
    return [min(x for x,y in points), min(y for x,y in points), max(x for x,y in points)+1, max(y for x,y in points)+1]

def xsegments(points):
    runs = []
    for x in sorted(set(x for x,y in points)):
        if not runs or x > runs[-1][-1]+1:
            runs.append([x])
        else:
            runs[-1].append(x)
    return [bbox([(x,y) for x,y in points if run[0] <= x <= run[-1]]) for run in runs]

for key, stem in [('clone', '09-wide-body-focus'), ('original', '11-original-wide-columns-matched')]:
    opened = Image.open(SOURCE / (stem+'.cua-image'))
    assert opened.format == 'JPEG' and opened.size == (2784,1806)
    im = opened.convert('RGB')
    images[key] = im
    m = {'format': opened.format, 'size': list(opened.size), 'imageMode': opened.mode, 'embeddedIccSha256': hashlib.sha256(opened.info['icc_profile']).hexdigest() if opened.info.get('icc_profile') else None, 'thresholds': {}}
    for t in [120,160,200]:
        m['thresholds'][str(t)] = {'toolbarInk': {name: bbox(coords(im, box, t)) for name,box in features.items()}, 'bodyLineInk': [bbox(coords(im, box, t)) for box in lines]}
    line_boxes = m['thresholds']['160']['bodyLineInk']
    m['lineInkTopDifferences'] = [line_boxes[i+1][1]-line_boxes[i][1] for i in range(2)]
    segs = [xsegments(coords(im, box, 160)) for box in lines]
    m['selectedGlyphInk160'] = {'Q': segs[0][0], 'A': segs[0][1], '宽': segs[1][0], '仅': segs[2][0]}
    # Vertical split evidence from a flat region, away from text and pointer halos.
    gray = im.convert('L').load()
    columns = {x: sum(gray[x,y] for y in range(400,800))/400 for x in range(1172,1184)}
    band = [x for x,v in columns.items() if v < 240]
    m['dividerEvidence'] = {'roi': [1172,400,1184,800], 'columnMeanLuma': columns, 'darkBandX': [min(band),max(band)+1]}
    result['measurements'][key] = m
    for name, box in rois.items():
        im.crop(box).save(OUT / (key+'-'+name+'-crop.png'))
        annotated = im.crop(box)
        draw = ImageDraw.Draw(annotated)
        candidates = m['thresholds']['160']['toolbarInk'].items() if name == 'toolbar' else [(str(i+1),b) for i,b in enumerate(line_boxes)]
        for label,b in candidates:
            local = [b[0]-box[0],b[1]-box[1],b[2]-box[0]-1,b[3]-box[1]-1]
            draw.rectangle(local,outline=(230,65,40) if key=='clone' else (0,140,210),width=1)
        annotated.save(OUT / (key+'-'+name+'-ink-annotated.png'))

for name, box in rois.items():
    c,o = images['clone'].crop(box), images['original'].crop(box)
    Image.blend(o,c,0.5).save(OUT / (name+'-overlay-50.png'))
    diff = ImageChops.difference(c,o)
    diff.save(OUT / (name+'-jpeg-decoded-absdiff.png'))
    diff.point(lambda p: min(255,p*4)).save(OUT / (name+'-jpeg-decoded-absdiff-x4.png'))

# Manual readings of the visible rounded surfaces, approximate ±2 px, not frames.
result['visibleSurfaceEstimates'] = {'method': 'Visual reading of rounded white face boundaries in native-size crops, approximate +/-2 image px; material/shadow/color/JPEG prevent frame inference.', 'clone': {'edit':[1197,16,1270,88], 'format':[1436,16,1760,88], 'share':[1926,16,2086,88], 'search':[2118,16,2768,88]}, 'original': {'edit':[1194,16,1268,88], 'format':[1436,16,1758,88], 'share':[1926,16,2086,88], 'search':[2118,16,2768,88]}}
result['limits'] = ['Exactly two source screenshots, same three-line QA body and body focus confirmed by their AX text.', 'JPEG-derived PNG crops/overlays/differences are not lossless capture evidence and cannot establish pixel PASS.', 'No full-page similarity score; sidebar accounts/counts/list data/times differ.', 'Window screen positions, DPR, AppKit frames, font descriptors and true text baselines are not established.', 'Visible pointer halos at approximately clone(1980,900), original(1020,956) lie outside both selected ROIs; clone gold caret near (1448,250) is within body ROI but excluded from neutral ink mask.', 'Toolbar symbols and text differ in darkness/material/AA and may reflect active/color states; decoded JPEG differences include those effects.', 'Static glyph segmentation uses blank columns; selected initial Q/A/宽/仅 are isolated in these images only, not a general OCR/font identity claim.']
for name, expected in IDENTITIES.items():
    assert sha(SOURCE / name) == expected
result['sourcesUnchangedAfter'] = True
(OUT/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:{'toolbarInk':v['thresholds']['160']['toolbarInk'],'bodyLineInk':v['thresholds']['160']['bodyLineInk'],'topDifferences':v['lineInkTopDifferences'],'glyphs':v['selectedGlyphInk160'],'divider':v['dividerEvidence']['darkBandX']} for k,v in result['measurements'].items()},ensure_ascii=False,indent=2))
