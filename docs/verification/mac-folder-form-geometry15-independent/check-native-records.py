"""Independent checks of fresh offscreen WK metrics and unchanged author evidence."""
from pathlib import Path
import hashlib
import json
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).parent
AUTHOR = ROOT / 'docs/verification/mac-folder-form-geometry15'

def load(path):
    return json.loads(path.read_text())

def bbox(image):
    roi = (20,20,220,85)
    crop = image.convert('RGB').crop(roi)
    mask = Image.new('1',crop.size)
    mask.putdata([max(pixel)<160 for pixel in crop.getdata()])
    box = mask.getbbox()
    return [box[0]+roi[0],box[1]+roi[1],box[2]+roi[0],box[3]+roi[1]]

j = load(OUT/'fresh-native.json')
assert j['status']=='metrics-ok' and j['snapshotSaved'] is True
assert j['appActive'] is False and not j['webViewAttachedToWindow']
assert all(not w['visible'] and not w['key'] and not w['main'] for w in j['windowDiagnostics'])
assert j['metrics']['viewport']==[1088,660] and j['metrics']['devicePixelRatio']==2
assert j['snapshotPixels']==[2176,1320] and not j['metrics']['requests']
u={r['selector']:r for r in j['metrics']['units']}
p=u['.smart-form']['rect']
assert (p['width'],p['height'])==(400,207)
local={k:{'x':v['rect']['x']-p['x'],'y':v['rect']['y']-p['y'],'width':v['rect']['width'],'height':v['rect']['height']} for k,v in u.items()}
assert local['.smart-make input']==dict(x=20,y=96,width=16,height=16)
assert local['footer']==dict(x=20,y=146,width=360,height=41)
assert local['footer button']==dict(x=212,y=163,width=80,height=24)
assert local['.smart-name input']['y']==56 and local['.smart-name input']['height']==24
assert u['footer']['styles']['borderTopWidth']=='0.5px'
image=Image.open(OUT/'fresh-native.png')
assert list(image.size)==j['snapshotPixels']
box=tuple(round(v*2) for v in [p['x'],p['y'],p['x']+p['width'],p['y']+p['height']])
crop=image.crop(box)
assert crop.size==(800,414)
crop.save(OUT/'fresh-native-form.png')
original=Image.open(ROOT/'docs/verification/mac-smart-u-runtime09/26-original-new-folder.cua-image')
assert original.size==crop.size
assert bbox(original)==bbox(crop)==[41,45,167,69]
baseline=load(AUTHOR/'baseline-native.json')
bp=next(x['rect'] for x in baseline['metrics']['units'] if x['selector']=='.smart-form')
assert [bp['width'],bp['height']]==[680,191]
assert baseline['metrics']['devicePixelRatio']==2 and baseline['snapshotPixels']==[2176,1320]
assert Image.open(AUTHOR/'baseline-native.png').size==(2176,1320)
assert [bp['width']*2,bp['height']*2]==[1360,382]
browser=load(OUT/'browser-attempt02/browser-result.json')
assert browser['status']=='pass' and len(browser['cases'])==15 and browser['errors']==browser['externalRequests']==[]
first=load(OUT/'browser-attempt01/browser-result.json')
assert first['status']=='fail' and len(first['cases'])==12
assert load(AUTHOR/'browser-attempt01/browser-result.json')['status']=='fail'
assert load(AUTHOR/'browser-attempt02/browser-result.json')['status']=='fail'
assert load(AUTHOR/'browser-attempt03/browser-result.json')['status']=='pass'
result=dict(status='pass',scope='Fresh offscreen WK and actual React DOM geometry only; not installed app/native input/full pixels.',
            browserCases=15,cssToSnapshotFactor=2,baselineCss=[680,191],baselinePixelSize=[1360,382],
            freshCss=[400,207],freshSnapshotCrop=list(box),freshPixelSize=[800,414],localCssRects=local,
            titleDark160Bbox=bbox(crop),windowDiagnostics=j['windowDiagnostics'],appActive=j['appActive'],
            webViewAttachedToWindow=j['webViewAttachedToWindow'],authorFailuresPreserved=True,reviewerFixtureFailurePreserved=True,
            focusLimit='Offscreen unattached WK does not establish focused native pixels. Chromium checks the scoped outline; exact focus ring remains for package CU.')
with (OUT/'native-check-result.json').open('x') as stream:
    stream.write(json.dumps(result,indent=2)+'\n')
print('PASS: 15 actual React cases; fresh offscreen WK 400x207 CSS -> 800x414 snapshot; no visible/key/main window or activation.')
