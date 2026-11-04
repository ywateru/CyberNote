from pathlib import Path
from PIL import Image, ImageChops, ImageDraw
import hashlib
import json
import shutil

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
SOURCE = ROOT / 'docs/verification/mac-body-typography-runtime-01'
MIN_FREE = 2 * 1024**3
assert shutil.disk_usage(OUT).free >= MIN_FREE
STEMS = {'original': '07-original-blank-area-click', 'clone': '03-candidate-corpus-wide'}
EXPECTED = {
    '01-original-corpus.cua-image': '4241ccf4b60821246b5b48aea0694ded0cd7d4216a21b5a7f7610b7fb2f75a2d',
    '01-original-corpus.ax.txt': 'ff3d144ed5fce0fe647f0894de2d31792cbbc15b48efd1516792171932693945',
    '03-candidate-corpus-wide.cua-image': '07065a1e1a33d253d37d7bfa640a6a9fb5294892994a4b10e79ee95f85924d64',
    '03-candidate-corpus-wide.ax.txt': '215af39e6ef51f7fb273e59c33a085e33634b7f886509fad02b148d5d2a087d9',
    '05-original-corpus-pointer-away.cua-image': '428198e55f5ccd4ad820cacc86ca51579358701b66ca38e25b6426edc74cc58a',
    '05-original-corpus-pointer-away.ax.txt': 'ff3d144ed5fce0fe647f0894de2d31792cbbc15b48efd1516792171932693945',
    '07-original-blank-area-click.cua-image': 'd05c5a049e7237799efabd283a25c334d4541a6205147291352d4ecdfe367d42',
    '07-original-blank-area-click.ax.txt': 'ff3d144ed5fce0fe647f0894de2d31792cbbc15b48efd1516792171932693945',
}

def identity(p):
    b = p.read_bytes()
    return {'path': str(p.relative_to(ROOT)), 'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest()}

sources = {name: identity(SOURCE / name) for name in EXPECTED}
for name, expected in EXPECTED.items():
    assert sources[name]['sha256'] == expected
sources['corpus.json'] = identity(SOURCE / 'corpus.json')
sources['04-candidate-process.json'] = identity(SOURCE / '04-candidate-process.json')
candidate_identity = json.loads((SOURCE / '04-candidate-process.json').read_text())
assert candidate_identity['sourceHead'] == 'a90e55f484149be562b2aa8a6f6f298bd953c203'
assert candidate_identity['sha256'] == 'b3c9013f48e6bbfbe466a9f0089e80b9fce9448a02074441bf3e97839c782587'
corpus = json.loads((SOURCE / 'corpus.json').read_text())['text']
lines = corpus.splitlines()
focus = {}
for key, stem in STEMS.items():
    ax = (SOURCE / (stem + '.ax.txt')).read_text()
    tail = ax.split('The focused UI element is ', 1)[1]
    focus[key] = {'exactCorpusPresentInFocusedValue': tail.rstrip().endswith('Value: ' + corpus),
                  'focusedElementDeclaration': tail.splitlines()[0]}
    assert focus[key]['exactCorpusPresentInFocusedValue']

BODY = [1200, 160, 2740, 585]
FIRST_FIVE = [1200, 155, 2100, 340]
ROW_ROIS = [[1210,165,2100,202], [1210,202,2100,234], [1210,234,2100,270],
            [1210,270,2100,304], [1210,304,2100,338], [1210,338,1750,373],
            [1210,373,1750,407], [1210,407,1750,442], [1210,473,1750,509],
            [1210,509,2740,543], [1210,543,2740,580]]
SUFFIX_ROIS = [[1356,338,1455,373], [1356,373,1455,407], [1356,407,1455,442]]
EMPTY_ROI = [1210,442,1750,473]
DIVIDER_ROI = [1170,650,1187,1050]
PREFIX_ROIS = [[1210,165,1485,202], [1210,202,1485,234]]

def points(im, box, threshold):
    px = im.load()
    result = []
    for y in range(box[1], box[3]):
        for x in range(box[0], box[2]):
            r,g,b = px[x,y]
            if 299*r+587*g+114*b < threshold*1000 and max(r,g,b)-min(r,g,b)<25:
                result.append((x,y))
    return result

def bbox(pts):
    return [min(x for x,y in pts), min(y for x,y in pts), max(x for x,y in pts)+1,
            max(y for x,y in pts)+1] if pts else None

def dimensions(box):
    return {'width': box[2]-box[0], 'height': box[3]-box[1]} if box else None

def xsegments(pts):
    runs = []
    for x in sorted({x for x,y in pts}):
        if not runs or x>runs[-1][-1]+1:
            runs.append([x])
        else:
            runs[-1].append(x)
    return [bbox([(x,y) for x,y in pts if run[0]<=x<=run[-1]]) for run in runs]

def save_image(im, filename):
    assert shutil.disk_usage(OUT).free >= MIN_FREE
    im.save(OUT / filename)

images = {}
measurements = {}
for key, stem in STEMS.items():
    opened = Image.open(SOURCE / (stem+'.cua-image'))
    assert opened.format == 'JPEG' and opened.size == (2786,1806)
    im = opened.convert('RGB')
    images[key] = im
    m = {'encoding': opened.format, 'size': list(opened.size), 'sourceMode': opened.mode,
         'embeddedIccSha256': hashlib.sha256(opened.info['icc_profile']).hexdigest() if opened.info.get('icc_profile') else None,
         'thresholds': {}}
    for threshold in [120,160,200]:
        row_boxes = [bbox(points(im, roi, threshold)) for roi in ROW_ROIS]
        suffix_boxes = [bbox(points(im, roi, threshold)) for roi in SUFFIX_ROIS]
        m['thresholds'][str(threshold)] = {
            'rowInk': row_boxes, 'rowDimensions': [dimensions(b) for b in row_boxes],
            'repeatAgChineseInk': suffix_boxes,
            'repeatAgChineseTopAdvances': [suffix_boxes[i+1][1]-suffix_boxes[i][1] for i in range(2)],
            'afterEmptyLineTopMinusThirdRepeatTop': row_boxes[8][1]-suffix_boxes[2][1],
            'emptyLineInk': bbox(points(im, EMPTY_ROI, threshold)),
            'safePrefixInk': [bbox(points(im, roi, threshold)) for roi in PREFIX_ROIS]}
    glyphs = [xsegments(points(im, roi, 160)) for roi in
              [[1210,165,1272,202], [1210,202,1255,234], [1210,234,1255,270]]]
    m['selectedInitialGlyphs160'] = {'Q': glyphs[0][0], 'A': glyphs[0][1],
                                   '宽': glyphs[1][0], '仅': glyphs[2][0]}
    gray = im.convert('L').load()
    means = {x: sum(gray[x,y] for y in range(DIVIDER_ROI[1],DIVIDER_ROI[3])) /
             (DIVIDER_ROI[3]-DIVIDER_ROI[1]) for x in range(DIVIDER_ROI[0],DIVIDER_ROI[2])}
    dark = [x for x,v in means.items() if v<240]
    assert dark
    m['divider'] = {'roi': DIVIDER_ROI, 'columnMeanGray': means, 'darkBandX': [min(dark),max(dark)+1]}
    m['firstRowLeftMinusDividerStart160'] = m['thresholds']['160']['rowInk'][0][0] - min(dark)
    measurements[key] = m
    save_image(im.crop(FIRST_FIVE), key+'-first-five-crop.png')
    save_image(im.crop(BODY), key+'-body-crop.png')
    annotated = im.crop(BODY)
    draw = ImageDraw.Draw(annotated)
    for i, b in enumerate(m['thresholds']['160']['rowInk']):
        if b:
            draw.rectangle([b[0]-BODY[0],b[1]-BODY[1],b[2]-BODY[0]-1,b[3]-BODY[1]-1],
                           outline=(230,65,40) if key=='clone' else (0,140,210),width=1)
    save_image(annotated,key+'-body-ink-annotated.png')

original, clone = images['original'].crop(BODY), images['clone'].crop(BODY)
save_image(Image.blend(original,clone,0.5),'body-overlay-50.png')
diff = ImageChops.difference(original,clone)
save_image(diff,'body-jpeg-decoded-absdiff.png')
save_image(diff.point(lambda v:min(255,v*4)),'body-jpeg-decoded-absdiff-x4.png')
old = Image.open(SOURCE/'01-original-corpus.cua-image').convert('RGB')
save_image(old.crop(FIRST_FIVE),'01-pointer-overlap-first-five.png')

deltas = {}
for t in ['120','160','200']:
    o=measurements['original']['thresholds'][t]
    c=measurements['clone']['thresholds'][t]
    deltas[t] = [{'row':i+1,'bboxDelta':[cv-ov for cv,ov in zip(cb,ob)],
                  'widthDelta':(cb[2]-cb[0])-(ob[2]-ob[0]),
                  'heightDelta':(cb[3]-cb[1])-(ob[3]-ob[1]),
                  'originalPointerContamination':False}
                 for i,(cb,ob) in enumerate(zip(c['rowInk'],o['rowInk']))]
result = {
    'coordinateSystem':'Decoded source image pixels, top-left origin; bbox [x0,y0,x1,y1) exclusive. No CSS/AppKit point or DPR inference.',
    'method':'Neutral ink: 299R+587G+114B < threshold*1000 and max(R,G,B)-min(R,G,B)<25. Thresholds120/160/200. Explicit fixed ROIs. No registration, geometry normalization, resampling or color conversion beyond RGB JPEG decoding.',
    'sources': sources, 'primaryPair': STEMS, 'focus': focus, 'sameCanvas':True,
    'recordedCandidateIdentity':candidate_identity,
    'identityScope':'04 recorded process/package identity reused, no live process or artifact inspection in this image analysis.',
    'corpusText':corpus, 'rowMapping':lines[:8]+[lines[9], 'long paragraph visual row1', 'long paragraph visual row2'],
    'rois':{'body':BODY,'firstFive':FIRST_FIVE,'rows':ROW_ROIS,'repeatAgChinese':SUFFIX_ROIS,'emptyLine':EMPTY_ROI,'safePrefixes':PREFIX_ROIS},
    'measurements':measurements,'cloneMinusOriginal':deltas,
    'pointerContamination':{'original01':'Arrow/halo around x1515,y202 overlaps first two row endings.',
                            'original05':'Despite pointer-away name, actual saved image still has arrow/halo at first two row endings. Not used for final geometry.',
                            'original07':'Actual full image inspected: arrow/halo around x1300,y700, outside body ROI. Primary original for final geometry.',
                            'clone03':'Visible pointer/halo around x1980,y778, outside body ROI.',
                            'noMaskingOrInpainting':True},
    'lineBreakObservation':{'method':'Manual visual reading of known corpus; not OCR or DOM layout inspection.',
                            'bothVisualRows':2,'sameVisibleBreak':True,
                            'row1EndsWith':'这是用于本','row2StartsWith':'地界面对照的合成内容。',
                            'rightEdgeContentBoxNotEstablished':True},
    'limits':['JPEG-derived images do not establish lossless pixel PASS or font identity.',
              'Same canvas does not establish same screen origin, DPR, actual content frames or font descriptors.',
              'Divider differs2 image pixels, retained without alignment.',
              'Initial01 and attempted05 first two original rows are pointer-contaminated at160/200; final07 removes this overlap without image masking.',
              'Original spellcheck underline is colored; neutral mask filters most color but JPEG/AA affect ink thresholds.',
              'Original/clone dates, account, note count and list content differ; whole-window similarity excluded.',
              'Visible ink top advances are not true baseline or CSS/native line-height measurements.',
              'Candidate05 comparison uses previous corpus partly different; only shared Chinese lines/isolated initial glyph dimensions are a bounded cross-round comparison, not normalized A/B.'],
}
previous_path=ROOT/'docs/research/mac-candidate05-wide-runtime-geometry-01/result.json'
previous=json.loads(previous_path.read_text())
previous_comparison={}
for label,index in [('宽三栏工具栏与搜索对照。',1),('仅本地合成内容。',2)]:
    old_clone=previous['measurements']['clone']['thresholds']['160']['bodyLineInk'][index]
    old_original=previous['measurements']['original']['thresholds']['160']['bodyLineInk'][index]
    new_clone=measurements['clone']['thresholds']['160']['rowInk'][index]
    new_original=measurements['original']['thresholds']['160']['rowInk'][index]
    previous_comparison[label]={'previousCloneDimensions':dimensions(old_clone),
        'previousOriginalDimensions':dimensions(old_original),
        'newCloneDimensions':dimensions(new_clone),'newOriginalDimensions':dimensions(new_original)}
result['boundedPreviousComparison']={'source':identity(previous_path),'commonChineseLines':previous_comparison,
    'caution':'Different round and corpus; only shared strings and same threshold method compared. No normalized controlled A/B claim.'}
for name, expected in sources.items():
    assert identity(SOURCE/name)==expected
result['sourcesUnchangedAfter']=True
assert shutil.disk_usage(OUT).free >= MIN_FREE
(OUT/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'rowInk160':{k:v['thresholds']['160']['rowInk'] for k,v in measurements.items()},
                  'glyphs160':{k:v['selectedInitialGlyphs160'] for k,v in measurements.items()},
                  'repeatAdvances':{k:v['thresholds']['160']['repeatAgChineseTopAdvances'] for k,v in measurements.items()},
                  'divider':{k:v['divider']['darkBandX'] for k,v in measurements.items()},
                  'delta120':deltas['120'],'delta160':deltas['160']},ensure_ascii=False,indent=2))
