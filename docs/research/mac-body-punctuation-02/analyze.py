from pathlib import Path
from PIL import Image, ImageDraw
import hashlib
import json
import shutil

ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
SOURCE=ROOT/'docs/verification/mac-body-typography-runtime-01'
MIN_FREE=2*1024**3
MAX_OUTPUT=5*1024**2
assert shutil.disk_usage(OUT).free>=MIN_FREE
STEMS={'original':'07-original-blank-area-click','clone':'03-candidate-corpus-wide'}
EXPECTED={'07-original-blank-area-click.cua-image':'d05c5a049e7237799efabd283a25c334d4541a6205147291352d4ecdfe367d42',
          '03-candidate-corpus-wide.cua-image':'07065a1e1a33d253d37d7bfa640a6a9fb5294892994a4b10e79ee95f85924d64',
          '07-original-blank-area-click.ax.txt':'ff3d144ed5fce0fe647f0894de2d31792cbbc15b48efd1516792171932693945',
          '03-candidate-corpus-wide.ax.txt':'215af39e6ef51f7fb273e59c33a085e33634b7f886509fad02b148d5d2a087d9'}
ROI=[1210,302,1800,338]

def identity(p):
    b=p.read_bytes()
    return {'path':str(p.relative_to(ROOT)),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}

sources={name:identity(SOURCE/name) for name in EXPECTED}
for name,expected in EXPECTED.items():
    assert sources[name]['sha256']==expected
sources['corpus.json']=identity(SOURCE/'corpus.json')
geometry_path=ROOT/'docs/research/mac-body-candidate06-geometry-01/result.json'
geometry_identity=identity(geometry_path)
geometry=json.loads(geometry_path.read_text())
assert geometry['primaryPair']==STEMS
corpus=json.loads((SOURCE/'corpus.json').read_text())['text']
text=corpus.splitlines()[4]
assert text=='0123456789 中文标点，。！？；：《》 — () []'
chars=[{'index':i,'character':c,'codepoint':f'U+{ord(c):04X}','isSpace':c==' '}
       for i,c in enumerate(text)]
assert len(chars)==31 and sum(c['isSpace'] for c in chars)==4
nonspace=[c for c in chars if not c['isSpace']]

def neutral_points(im,threshold):
    px=im.load()
    pts=[]
    for y in range(ROI[1],ROI[3]):
        for x in range(ROI[0],ROI[2]):
            r,g,b=px[x,y]
            if 299*r+587*g+114*b<threshold*1000 and max(r,g,b)-min(r,g,b)<25:
                pts.append((x,y))
    return pts

def bbox(pts):
    return [min(x for x,y in pts),min(y for x,y in pts),max(x for x,y in pts)+1,
            max(y for x,y in pts)+1] if pts else None

def segment(pts):
    runs=[]
    for x in sorted({x for x,y in pts}):
        if not runs or x>runs[-1][-1]+1:runs.append([x])
        else:runs[-1].append(x)
    return [bbox([(x,y) for x,y in pts if run[0]<=x<=run[-1]]) for run in runs]

images={}
measurements={}
for key,stem in STEMS.items():
    opened=Image.open(SOURCE/(stem+'.cua-image'))
    assert opened.format=='JPEG' and opened.size==(2786,1806)
    im=opened.convert('RGB');images[key]=im
    ax=(SOURCE/(stem+'.ax.txt')).read_text()
    assert ax.split('The focused UI element is ',1)[1].rstrip().endswith('Value: '+corpus)
    measurements[key]={}
    for threshold in [120,160,200]:
        boxes=segment(neutral_points(im,threshold))
        assert len(boxes)==len(nonspace)==27
        entries=[]
        for n,(c,b) in enumerate(zip(nonspace,boxes)):
            entries.append({**c,'segmentOrdinal':n,'bbox':b,'width':b[2]-b[0],'height':b[3]-b[1],
                            'inkStartRelativeToFirstGlyph':b[0]-boxes[0][0],
                            'inkEndRelativeToFirstGlyph':b[2]-boxes[0][0],
                            'blankColumnsBefore':b[0]-boxes[n-1][2] if n else None,
                            'interveningTextSincePriorInk':text[nonspace[n-1]['index']+1:c['index']] if n else ''})
        measurements[key][str(threshold)]=entries
    assert shutil.disk_usage(OUT).free>=MIN_FREE
    im.crop(ROI).save(OUT/(key+'-row5-native-crop.png'))

comparisons={}
decomposition={}
for t in ['120','160','200']:
    original,clone=measurements['original'][t],measurements['clone'][t]
    comparisons[t]=[]
    for o,c in zip(original,clone):
        comparisons[t].append({'index':o['index'],'character':o['character'],'codepoint':o['codepoint'],
                              'absoluteInkStartDelta':c['bbox'][0]-o['bbox'][0],
                              'normalizedInkStartDelta':c['inkStartRelativeToFirstGlyph']-o['inkStartRelativeToFirstGlyph'],
                              'normalizedInkEndDelta':c['inkEndRelativeToFirstGlyph']-o['inkEndRelativeToFirstGlyph'],
                              'glyphInkWidthDelta':c['width']-o['width'],
                              'blankColumnsBeforeDelta':c['blankColumnsBefore']-o['blankColumnsBefore'] if o['blankColumnsBefore'] is not None else None})
    decomposition[t]={}
    for key in STEMS:
        entries=measurements[key][t]
        ink=sum(e['width'] for e in entries)
        gaps=sum(e['blankColumnsBefore'] or 0 for e in entries)
        width=entries[-1]['bbox'][2]-entries[0]['bbox'][0]
        assert ink+gaps==width
        decomposition[t][key]={'glyphInkWidthSum':ink,'blankColumnSum':gaps,'wholeRowInkWidth':width}
    decomposition[t]['cloneMinusOriginal']={name:decomposition[t]['clone'][name]-decomposition[t]['original'][name]
                                           for name in ['glyphInkWidthSum','blankColumnSum','wholeRowInkWidth']}

groups={'digits':(0,9),'ChineseWord':(11,14),'ChinesePunctuation':(15,22),
        'emDash':(24,24),'asciiParentheses':(26,27),'asciiBrackets':(29,30)}
group_measurements={}
for key in STEMS:
    group_measurements[key]={}
    for name,(first,last) in groups.items():
        entries=[e for e in measurements[key]['160'] if first<=e['index']<=last]
        b=[min(e['bbox'][0] for e in entries),min(e['bbox'][1] for e in entries),
           max(e['bbox'][2] for e in entries),max(e['bbox'][3] for e in entries)]
        group_measurements[key][name]={'codepointIndexInclusive':[first,last],
                                       'text':text[first:last+1],'bbox':b,'width':b[2]-b[0]}

# Presentation only: crops keep their original x origin and native pixel scale.
canvas=Image.new('RGB',(ROI[2]-ROI[0],130),'white')
draw=ImageDraw.Draw(canvas)
for key,y in [('original',18),('clone',86)]:
    canvas.paste(images[key].crop(ROI),(0,y))
    draw.text((2,y-16),key+' (native x origin 1210)',fill='black')
    for e in measurements[key]['160']:
        if e['index'] in [0,11,15,16,17,18,19,20,21,22,24,26,29]:
            x=e['bbox'][0]-ROI[0]
            draw.line((x,y+36,x,y+41),fill=(220,60,40) if key=='clone' else (0,110,190))
assert shutil.disk_usage(OUT).free>=MIN_FREE
canvas.save(OUT/'row5-same-x-checkpoints.png')

vertical={}
for t in ['120','160','200']:
    o=geometry['measurements']['original']['thresholds'][t]
    c=geometry['measurements']['clone']['thresholds'][t]
    indices=[0,1,2,3,4,5,6,7,9,10,11]
    vertical[t]=[{'logicalVisualRowIndex':n,'originalTop':ob[1],'cloneTop':cb[1],
                  'topDelta':cb[1]-ob[1],'bottomDelta':cb[3]-ob[3],
                  'heightDelta':(cb[3]-cb[1])-(ob[3]-ob[1])}
                 for n,ob,cb in zip(indices,o['rowInk'],c['rowInk'])]

result={'schema':'notesclone.mac.body.punctuation-position-analysis.v1',
        'sourceHeadAtResearch':'58378ed644df3bec1e421108169f2ca6c33ceb66',
        'sources':sources,'priorGeometryResult':geometry_identity,'primaryPair':STEMS,
        'coordinateSystem':'Decoded source image pixels, top-left origin, bbox[x0,y0,x1,y1) exclusive; no point/DPR/baseline inference.',
        'roi':ROI,'method':'Neutral ink uses299R+587G+114B<threshold*1000 and max-min<25; thresholds120/160/200. Segment full row by entirely blank x columns, with no joining, registration, scaling, masking or OCR.',
        'corpusRow':text,'codepoints':chars,
        'association':'Each threshold in both images yields exactly27 x-runs. Known text has27 nonspace codepoints; ordered association was manually checked visually against the known corpus. This is not OCR or general glyph recognition. If another image splits/merges runs this mapping must not be reused automatically.',
        'measurements':measurements,'cloneMinusOriginal':comparisons,'groups160':group_measurements,
        'widthDecomposition':decomposition,
        'normalization':'Reported relative position differences subtract each row first glyph ink x from numeric coordinates only. No image pixels are shifted. This removes the1px first-glyph absolute offset from cumulative ink-start differences, not font sidebearings or true advance.',
        'spaces':'Indices10,23,25,28 are U+0020, no ink. Blank-column gaps include preceding/trailing sidebearings, punctuation layout and spaces where present; image-only evidence cannot assign their separate advances.',
        'verticalFromFrozenGeometry':vertical,
        'sameGlyphEvidence160':geometry['measurements']['original']['selectedInitialGlyphs160'],
        'sameGlyphCandidate160':geometry['measurements']['clone']['selectedInitialGlyphs160'],
        'limits':['Ink widths/gaps are not glyph advances, text layout boxes or font feature identity.',
                  'All sources are JPEG; threshold sensitivity and AA remain; no pixel PASS.',
                  'Original/clone ink-left differs1px at t160 and divider2px; images remain in original coordinates.',
                  'Vertical row tops mix glyph metrics and row placement; identical repeated AgChinese provides bounded advances but no true baseline measurement.',
                  'No GUI, REA, target/cache/worktree/dependency operations, product modification or main commit.'],
        'minimumFreeBytes':MIN_FREE,'maximumNewBytes':MAX_OUTPUT}
for name,e in sources.items():assert identity(SOURCE/name)==e
assert identity(geometry_path)==geometry_identity
result['sourceIdentitiesUnchangedAfter']=True
assert shutil.disk_usage(OUT).free>=MIN_FREE
(OUT/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
assert sum(p.stat().st_size for p in OUT.rglob('*') if p.is_file())<=MAX_OUTPUT
print(json.dumps({'segmentsPerRow':27,'spaces':[c['index'] for c in chars if c['isSpace']],
                  'cumulative160':comparisons['160'],'group160':group_measurements,
                  'outputBytes':sum(p.stat().st_size for p in OUT.rglob('*') if p.is_file()),
                  'freeAfter':shutil.disk_usage(OUT).free},ensure_ascii=False,indent=2))
