from pathlib import Path
from PIL import Image, ImageCms, ImageDraw
from collections import deque
import io, json, hashlib, statistics

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
BASE = 'docs/verification/mac-name-focus-runtime29/'
SOURCES = {
    'original-all': '03-original-default-selected',
    'original-partial': '04-original-partial-selected',
    'mac12-all': '08-mac12-default-selected',
    'mac12-partial': '09-mac12-partial-selected',
    'mac12-blurred': '10-mac12-name-blurred',
    'mac12-refocused': '11-mac12-name-refocused',
}
SRGB = ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB'))
IMS, RAW, META, DETECTIONS = {}, {}, {}, {}

def component(im, threshold, roi, seed):
    q, seen, xs, ys, pix = deque([seed]), {seed}, [], [], im.load()
    while q:
        x, y = q.popleft()
        if min(pix[x, y]) < threshold:
            continue
        xs.append(x); ys.append(y)
        for xx, yy in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
            if roi[0] <= xx < roi[2] and roi[1] <= yy < roi[3] and (xx,yy) not in seen:
                seen.add((xx,yy)); q.append((xx,yy))
    assert xs, 'No bright connected component'
    return [min(xs), min(ys), max(xs)+1, max(ys)+1]

for name, stem in SOURCES.items():
    rel = BASE + stem + '.cua-image'
    data = (ROOT / rel).read_bytes()
    src = Image.open(io.BytesIO(data)); icc = src.info['icc_profile']
    im = src.convert('RGB')
    META[name] = {'path': rel, 'sha256': hashlib.sha256(data).hexdigest(),
                  'sourcePixels': list(im.size), 'sourceFormat': src.format,
                  'iccBytes': len(icc), 'iccSha256': hashlib.sha256(icc).hexdigest(),
                  'jpegComponents': src.layer}
    if im.size != (800,414):
        roi, seed = (650,400,1520,900), (1088,720)
        boxes = {str(t): component(im,t,roi,seed) for t in [190,195,200]}
        assert len({tuple(b) for b in boxes.values()}) == 1, boxes
        DETECTIONS[name] = {'method': '4-connected minRGB threshold, no shadow',
                            'roi': roi, 'seed': seed, 'thresholdResults': boxes}
        im = im.crop(boxes['190'])
    assert im.size == (800,414), (name, im.size)
    RAW[name] = im
    IMS[name] = ImageCms.profileToProfile(im, ImageCms.ImageCmsProfile(io.BytesIO(icc)),
                                         SRGB, outputMode='RGB')
    IMS[name].save(OUT / (name+'-srgb.png'), icc_profile=SRGB.tobytes())

# New partial cursor halo covers the right part of the name, unlike Safari26.
# This deliberately excludes the established partial-selection color ROI too.
HALO = (190,85,350,225)
CENTER = (300,104,600,116)
CORNERS = {'TL':(115,100,155,132), 'TR':(734,100,774,132),
           'BL':(115,140,155,172), 'BR':(734,140,774,172)}
INK = {'name':(135,115,280,158), 'nameLabel':(35,115,115,157),
       'smartLabel':(75,190,330,230)}

def inside(x,y,r):
    return r[0] <= x < r[2] and r[1] <= y < r[3]

def points(r, exclude=None):
    return [(x,y) for y in range(r[1],r[3]) for x in range(r[0],r[2])
            if exclude is None or not inside(x,y,exclude)]

def maskbox(im, pts, pred):
    found = [pt for pt in pts if pred(im.getpixel(pt))]
    return {'bbox': [min(x for x,y in found),min(y for x,y in found),
                     max(x for x,y in found)+1,max(y for x,y in found)+1] if found else None,
            'pixels': len(found)}

def median(im, r):
    return [statistics.median(p[c] for p in im.crop(r).getdata()) for c in range(3)]

def gold(p):
    return p[0]>170 and p[1]>140 and p[0]-p[2]>35 and p[1]-p[2]>17.5

def mae(im, ref, pts):
    return sum(abs(a-b) for pt in pts for a,b in zip(im.getpixel(pt),ref.getpixel(pt)))/(len(pts)*3)

records = {}
for name, im in IMS.items():
    partial = 'partial' in name
    refname = 'original-partial' if partial else 'original-all'
    ref = IMS[refname]
    # Ring metrics exclude the same conservative partial-halo ROI in every state.
    centerpts = points(CENTER, HALO)
    corners = {}
    for key, roi in CORNERS.items():
        pts = [pt for pt in points(roi,HALO) if not inside(*pt,(138,118,750,155))]
        corners[key] = {'roi':roi, 'samplePixels':len(pts),
                        'goldMaskDisagreementVsPairedOriginal':sum(gold(im.getpixel(pt)) != gold(ref.getpixel(pt)) for pt in pts),
                        'meanAbsoluteChannelDifferenceVsPairedOriginal':mae(im,ref,pts)}
    rec = {'pairedOriginal':refname,
           'centerBand':{'roi':CENTER,'excludedHaloROI':HALO,'remainingPixels':len(centerpts),
                         'meanAbsoluteChannelDifferenceVsPairedOriginal':mae(im,ref,centerpts)},
           'ringCornerMetrics':corners,
           'cleanVerticalSrgbScans':{str(x):[{'y':y,'rgb':list(im.getpixel((x,y)))} for y in range(100,170)] for x in [600]},
           'strongGoldRowsX600':{'top':[y for y in range(100,117) if gold(im.getpixel((600,y)))],
                                 'bottom':[y for y in range(154,170) if gold(im.getpixel((600,y)))]}}
    # Whole-name/smart-label coverage is measured only on the clean all-selected pair.
    if name in ['original-all','mac12-all']:
        rec['inkRaw'] = {key:{str(t):maskbox(RAW[name],points(roi),lambda p,t=t:max(p)<t)
                             for t in [100,160,200]} for key,roi in INK.items()}
        rec['inkMaskDisagreementVsOriginalAllRaw'] = {
            key:{str(t):sum((max(RAW[name].getpixel(pt))<t) != (max(RAW['original-all'].getpixel(pt))<t)
                           for pt in points(roi)) for t in [100,160,200]} for key,roi in INK.items()}
        roi = (145,120,265,124)
        rec['selectionBackground'] = {'roi':roi,'samplePixels':480,
                                      'rawMedianRGB':median(RAW[name],roi),'srgbMedianRGB':median(im,roi)}
        roi = (300,107,340,111)
        rec['cleanCoreRingSrgb'] = {'roi':roi,'median':median(im,roi)}
        rec['neutralGrayInnerBands'] = {key:{'roi':roi,'pixels':maskbox(im,points(roi),lambda p:145<=min(p) and max(p)<=215 and max(p)-min(p)<=6)['pixels']}
                                       for key,roi in {'top':(300,110,340,115),'bottom':(300,157,340,161)}.items()}
    else:
        rec['wholeGlyphCoverage'] = 'Not measured; only clean matched original-all/mac12-all is used for glyph comparison'
        rec['selectionBackground'] = 'Not measured; partial fixed ROI intersects cursor halo, blur/refocus not promoted to clean matching reference'
    if name == 'mac12-blurred':
        rec['pairedOriginal'] = None
        rec['centerBand']['meanAbsoluteChannelDifferenceVsPairedOriginal'] = None
        rec['centerBand']['comparisonLimit'] = 'No original blurred-state reference; focus absence is an endpoint, not a pixel defect'
        for corner in rec['ringCornerMetrics'].values():
            corner['goldMaskDisagreementVsPairedOriginal'] = None
            corner['meanAbsoluteChannelDifferenceVsPairedOriginal'] = None
    records[name] = rec

result = {'scope':'Finite actual Mac12 runtime29 fixed-state comparison; not full application pixel or interaction acceptance',
          'coordinates':'Native pixels, half-open; independent bright-component integer crop; no resize or per-control registration',
          'colorHandling':'Each identical embedded Display ICC independently converted to sRGB with Pillow/LittleCMS; raw explicitly named',
          'sources':META,'formDetection':DETECTIONS,'partialCursorHaloExclusion':HALO,
          'fixed26Rois':{'ink':INK,'center':CENTER,'corners':CORNERS,'cornerInteriorExcluded':(138,118,750,155)},
          'measurements':records,
          'limits':'Partial halo deliberately excluded, no partial-name bbox/coverage or selection-color result. Blur/refocus image and AX endpoints only; no fresh original blur/refocus pair. JPEG/AA and host differences retained; no native font/weight inference.'}
(OUT/'measurements.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')

for filename, names in [('default-original-mac12-native-srgb.png',['original-all','mac12-all']),
                        ('partial-original-mac12-native-srgb.png',['original-partial','mac12-partial'])]:
    canvas = Image.new('RGB',(1600,450),'#ddd'); d=ImageDraw.Draw(canvas)
    for i,name in enumerate(names):
        d.text((800*i+8,10),name+' | native800x414 | ICC->sRGB',fill='black')
        canvas.paste(IMS[name],(800*i,36))
    canvas.save(OUT/filename,icc_profile=SRGB.tobytes())
names = ['original-all','mac12-all','original-partial','mac12-partial','mac12-blurred','mac12-refocused']
canvas=Image.new('RGB',(670,111*len(names)),'#ddd');d=ImageDraw.Draw(canvas)
for i,name in enumerate(names):
    d.text((5,i*111+5),name+' | native input[110,95,780,180)',fill='black')
    canvas.paste(IMS[name].crop((110,95,780,180)),(0,i*111+26))
canvas.save(OUT/'six-state-focus-native-srgb.png',icc_profile=SRGB.tobytes())
canvas=Image.new('RGB',(640,542),'#ddd');d=ImageDraw.Draw(canvas)
for i,name in enumerate(['original-all','mac12-all','original-partial','mac12-partial']):
    d.text((i*160+3,5),name,fill='black')
    for j,(k,r) in enumerate(CORNERS.items()):
        canvas.paste(IMS[name].crop(r).resize((160,128),Image.Resampling.NEAREST),(i*160,30+j*128))
canvas.save(OUT/'ring-corners-nearest4x-srgb.png',icc_profile=SRGB.tobytes())
canvas=Image.new('RGB',(840,212),'#ddd');d=ImageDraw.Draw(canvas)
for i,name in enumerate(['original-all','mac12-all']):
    d.text((i*420+3,4),name+' | nearest2x; no glyph registration',fill='black')
    canvas.paste(IMS[name].crop((130,115,280,158)).resize((300,86),Image.Resampling.NEAREST),(i*420,28))
    canvas.paste(IMS[name].crop((75,190,280,230)).resize((410,80),Image.Resampling.NEAREST),(i*420,126))
canvas.save(OUT/'clean-name-smart-label-nearest2x-srgb.png',icc_profile=SRGB.tobytes())
guide=IMS['mac12-partial'].copy();d=ImageDraw.Draw(guide)
d.rectangle((HALO[0],HALO[1],HALO[2]-1,HALO[3]-1),outline='#ef3355',width=1)
d.rectangle((CENTER[0],CENTER[1],CENTER[2]-1,CENTER[3]-1),outline='#0044dd',width=1)
guide.save(OUT/'partial-exclusion-guide-srgb.png',icc_profile=SRGB.tobytes())
print(json.dumps({'detected':DETECTIONS,'finite':{name:{
    'inkRaw':r.get('inkRaw'),'selection':r['selectionBackground'],
    'core':r.get('cleanCoreRingSrgb'),'gray':r.get('neutralGrayInnerBands'),
    'centerMAE':r['centerBand']['meanAbsoluteChannelDifferenceVsPairedOriginal'],
    'cornerGoldError':sum(v['goldMaskDisagreementVsPairedOriginal'] for v in r['ringCornerMetrics'].values()) if name != 'mac12-blurred' else None,
    'cornerMeanMAE':sum(v['meanAbsoluteChannelDifferenceVsPairedOriginal'] for v in r['ringCornerMetrics'].values())/4 if name != 'mac12-blurred' else None,
    'goldRows600':r['strongGoldRowsX600']} for name,r in records.items()}},ensure_ascii=False,indent=2))
