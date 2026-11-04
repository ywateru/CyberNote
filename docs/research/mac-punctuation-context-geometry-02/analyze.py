from pathlib import Path
from PIL import Image, ImageDraw
import hashlib
import json
import shutil

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
SOURCE = ROOT / 'docs/verification/mac-punctuation-context-runtime-02'
MIN_FREE = 2 * 1024**3
MAX_OUTPUT = 2 * 1024**2
STEMS = {'original': '01-original', 'clone': '02-clone-baseline'}
EXPECTED = {
    '01-original.ax.txt': (7802, '543b88278c660fbea97f69b2bdf617310d3f93dfb6ccdbea04a769f57e6a7bce'),
    '01-original.cua-image': (275073, '298f15037793d82fd7c496a3fa3c6d3f01edd306822c32e22af63a113e5d3bc5'),
    '02-clone-baseline.ax.txt': (3338, '5586c9b603e675a0021b693626643e2dae588844a5c5db641fd05bbc5bcba66e'),
    '02-clone-baseline.cua-image': (260490, 'd64b851dcc084e25f8b0c74bba6f58f761322e64e7e5b25f79a6a78e8bf32dd7'),
    'corpus.json': (393, '572d1d4ef54bf19089c9c9515cc6d222137d0c973303765231ce7f5e51b33e17'),
}
ROW_ROIS = [[1210,155,2000,200], [1210,200,2000,235], [1210,235,2000,270],
            [1210,270,1600,304], [1210,304,1600,338], [1210,338,1600,373],
            [1210,373,1600,408], [1210,440,1600,475], [1210,475,1600,509],
            [1210,509,1600,544]]
EMPTY_ROI = [1210,408,1600,440]
CROP = [1200,155,1740,550]

def gate():
    free = shutil.disk_usage(OUT).free
    assert free >= MIN_FREE, free
    return free

def identity(path):
    data = path.read_bytes()
    return {'path': str(path.relative_to(ROOT)), 'bytes': len(data),
            'sha256': hashlib.sha256(data).hexdigest()}

def points(im, roi, threshold):
    px = im.load()
    return [(x,y) for y in range(roi[1],roi[3]) for x in range(roi[0],roi[2])
            if 299*px[x,y][0]+587*px[x,y][1]+114*px[x,y][2] < threshold*1000
            and max(px[x,y])-min(px[x,y]) < 25]

def bbox(pts):
    return [min(x for x,y in pts), min(y for x,y in pts),
            max(x for x,y in pts)+1, max(y for x,y in pts)+1] if pts else None

def segments(pts):
    runs = []
    for x in sorted({x for x,y in pts}):
        if not runs or x > runs[-1][-1]+1:
            runs.append([x])
        else:
            runs[-1].append(x)
    return [bbox([(x,y) for x,y in pts if run[0] <= x <= run[-1]]) for run in runs]

def dimensions(box):
    return {'width': box[2]-box[0], 'height': box[3]-box[1]} if box else None

def output_image(im, filename):
    gate()
    im.save(OUT / filename)

free_before = gate()
sources = {name: identity(SOURCE/name) for name in EXPECTED}
for name, (size, sha) in EXPECTED.items():
    assert sources[name]['bytes'] == size and sources[name]['sha256'] == sha
corpus = json.loads((SOURCE/'corpus.json').read_text())
lines = corpus['text'].splitlines()
assert lines[1] == '，。！？；：《》' and lines[2] == '中，中。中！中？中；中：中《中》中'
assert len(lines[1]) == 8 and len(lines[2]) == 17
assert lines[3:7] == ['Ag中文']*4 and lines[7] == '' and lines[8:] == ['Ag中文']*3
focus = {}
images = {}
measurements = {}
for key, stem in STEMS.items():
    ax = (SOURCE/(stem+'.ax.txt')).read_text()
    tail = ax.split('The focused UI element is ', 1)[1]
    focus[key] = {'focusedElementDeclaration': tail.splitlines()[0],
                  'exactCorpusInFocusedValue': tail.rstrip().endswith('Value: '+corpus['text'])}
    assert focus[key]['exactCorpusInFocusedValue']
    opened = Image.open(SOURCE/(stem+'.cua-image'))
    assert opened.format == 'JPEG' and opened.size == (2786,1806)
    im = opened.convert('RGB')
    images[key] = im
    measurements[key] = {'encoding': opened.format, 'size': list(opened.size), 'thresholds': {}}
    for threshold in [120,160,200]:
        row_boxes = [bbox(points(im, roi, threshold)) for roi in ROW_ROIS]
        repeat_boxes = row_boxes[3:]
        m = {'rowInk': row_boxes, 'rowDimensions': [dimensions(b) for b in row_boxes],
             'repeatAgChineseInk': repeat_boxes,
             'repeatTopAdvances': [b[1]-a[1] for a,b in zip(repeat_boxes, repeat_boxes[1:])],
             'repeatBottomAdvances': [b[3]-a[3] for a,b in zip(repeat_boxes, repeat_boxes[1:])],
             'emptyLineInk': bbox(points(im, EMPTY_ROI, threshold)), 'contextRows': {}}
        assert m['emptyLineInk'] is None
        for label, index in [('continuous',1), ('interleaved',2)]:
            text = lines[index]
            boxes = segments(points(im, ROW_ROIS[index], threshold))
            assert len(boxes) == len(text)
            entries = [{'index': i, 'character': char, 'codepoint': f'U+{ord(char):04X}',
                        'bbox': b, **dimensions(b), 'inkStartRelativeToFirstGlyph': b[0]-boxes[0][0],
                        'inkEndRelativeToFirstGlyph': b[2]-boxes[0][0],
                        'blankColumnsBefore': b[0]-boxes[i-1][2] if i else None}
                       for i,(char,b) in enumerate(zip(text,boxes))]
            ink = sum(e['width'] for e in entries)
            gaps = sum(e['blankColumnsBefore'] or 0 for e in entries)
            width = boxes[-1][2]-boxes[0][0]
            assert ink+gaps == width
            m['contextRows'][label] = {'text': text, 'entries': entries,
                'wholeRowInkWidth': width, 'glyphInkWidthSum': ink, 'blankColumnSum': gaps}
        measurements[key]['thresholds'][str(threshold)] = m
    output_image(im.crop(CROP), key+'-body-native-crop.png')

comparisons = {}
for t in ['120','160','200']:
    o = measurements['original']['thresholds'][t]
    c = measurements['clone']['thresholds'][t]
    comparisons[t] = {'rowDeltas': [], 'contextRows': {}}
    for i,(ob,cb) in enumerate(zip(o['rowInk'],c['rowInk'])):
        comparisons[t]['rowDeltas'].append({'visualRowIndex': i, 'corpusLineIndex': i if i<7 else i+1,
            'bboxDelta': [cv-ov for ov,cv in zip(ob,cb)],
            'widthDelta': dimensions(cb)['width']-dimensions(ob)['width'],
            'heightDelta': dimensions(cb)['height']-dimensions(ob)['height']})
    for label in ['continuous','interleaved']:
        om,cm = o['contextRows'][label],c['contextRows'][label]
        entries = []
        for oe,ce in zip(om['entries'],cm['entries']):
            entries.append({'index': oe['index'], 'character': oe['character'], 'codepoint': oe['codepoint'],
                'absoluteInkStartDelta': ce['bbox'][0]-oe['bbox'][0],
                'normalizedInkStartDelta': ce['inkStartRelativeToFirstGlyph']-oe['inkStartRelativeToFirstGlyph'],
                'normalizedInkEndDelta': ce['inkEndRelativeToFirstGlyph']-oe['inkEndRelativeToFirstGlyph'],
                'inkWidthDelta': ce['width']-oe['width'],
                'blankColumnsBeforeDelta': ce['blankColumnsBefore']-oe['blankColumnsBefore'] if oe['index'] else None})
        punct = [e for e in entries if e['character'] != '中']
        anchor = punct[0]['absoluteInkStartDelta']
        comparisons[t]['contextRows'][label] = {
            'wholeRowInkWidthDelta': cm['wholeRowInkWidth']-om['wholeRowInkWidth'],
            'glyphInkWidthSumDelta': cm['glyphInkWidthSum']-om['glyphInkWidthSum'],
            'blankColumnSumDelta': cm['blankColumnSum']-om['blankColumnSum'],
            'entries': entries,
            'punctuationInkStartDeltaRelativeToFirstPunctuation': [e['absoluteInkStartDelta']-anchor for e in punct]}

# Presentation only: original source coordinates and native-size crops are retained.
strip_roi = [1210,200,1700,270]
canvas = Image.new('RGB',(490,180),'white')
draw = ImageDraw.Draw(canvas)
for key,y in [('original',18),('clone',108)]:
    draw.text((1,y-16),key+'; source x1210, native scale',fill='black')
    canvas.paste(images[key].crop(strip_roi),(0,y))
output_image(canvas,'context-rows-same-x-native-strips.png')

for name, value in sources.items():
    assert identity(SOURCE/name) == value
result = {'schema': 'notesclone.mac.punctuation-context-geometry.v1',
    'sources': sources, 'focus': focus, 'primaryPair': STEMS, 'corpus': corpus,
    'coordinateSystem': 'Decoded JPEG image pixels, top-left origin, bbox[x0,y0,x1,y1) exclusive. Not CSS pixels, AppKit points, DPR or true baselines.',
    'rois': {'rows': ROW_ROIS, 'emptyLine': EMPTY_ROI, 'bodyCrop': CROP, 'strip': strip_roi},
    'rowMapping': [{'visualRowIndex': i, 'corpusLineIndex': i if i<7 else i+1,
                    'text': lines[i if i<7 else i+1]} for i in range(10)],
    'method': 'Neutral ink:299R+587G+114B<threshold*1000 and max-min<25; thresholds120/160/200. Fixed shared ROIs, blank x-column segmentation, no image registration, scaling, resampling, masking, joining, inpainting or OCR.',
    'association': 'All three thresholds and both images yield8 and17 x-runs for the known8 and17 codepoints; ordered visual association checked against known corpus. This is a bounded corpus association, not general glyph recognition.',
    'normalization': 'Numeric relative coordinates subtract the first glyph or first punctuation ink x only; no image pixels are moved. Ink starts include glyph sidebearings and are not advance widths.',
    'measurements': measurements, 'cloneMinusOriginal': comparisons,
    'verticalMethod': 'Seven identical Ag中文 rows; successive ink-top and ink-bottom differences measure visible placement of identical strings. Fourth-to-fifth includes one empty paragraph. No baseline identity assumed.',
    'sourceIdentitiesUnchangedAfter': True, 'freeBytesBefore': free_before,
    'limits': ['JPEG and antialiasing make thresholds approximate; no pixel PASS or font identity.',
               'Same image dimensions do not establish same DPR, app frames or body content origin.',
               'Input newNote/plain-text/focus/pointer controls are supplied by parent capture record; focused complete corpus was independently checked in AX files.',
               'Ink width and blank columns cannot isolate per-glyph advance, font fallback, sidebearings or a particular font feature.',
               'CoreText system13/PingFangSC advance context is a hypothesis only; this script neither probes CoreText nor establishes point-to-image scale.',
               'This analysis does not inspect GUI, REA, live process, app package, target/cache or modify product source.'],
    'minimumFreeBytes': MIN_FREE, 'maximumNewBytes': MAX_OUTPUT}
gate()
(OUT/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
assert sum(p.stat().st_size for p in OUT.rglob('*') if p.is_file()) < MAX_OUTPUT
print(json.dumps({'context160': comparisons['160']['contextRows'],
    'repeat160': {k: {n:v['thresholds']['160'][n] for n in ['repeatAgChineseInk','repeatTopAdvances','repeatBottomAdvances']} for k,v in measurements.items()},
    'freeAfter': gate(), 'bytesNow': sum(p.stat().st_size for p in OUT.rglob('*') if p.is_file())},ensure_ascii=False,indent=2))
