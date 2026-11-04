from pathlib import Path
from PIL import Image, ImageCms
from io import BytesIO
import json, hashlib, difflib

ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
AUTHOR=ROOT/'docs/verification/mac-ordinary-name-focus26'
SAFARI=ROOT/'docs/verification/mac-ordinary-name-focus26-safari-preview'
ORIGINAL=ROOT/'docs/research/mac-ordinary-name-focus26-original-runtime'
checks=[]
def check(name,value):checks.append({'name':name,'pass':bool(value)})
def load(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(name,d):(OUT/name).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')

current=(ROOT/'src/smart-folders.css').read_text()
baseline=(AUTHOR/'baseline-smart-folders.css').read_text()
expected=baseline.replace('height: 24px;\n}\n.smart-mac .smart-ordinary .smart-name input:focus {\n  outline-width: 2px;','height: 24px;\n  padding-inline: 5px;\n}\n.smart-mac .smart-ordinary .smart-name input:focus {\n  border-color: transparent;\n  outline: 3.5px solid #f6d499;\n  outline-offset: -0.5px;\n}\n.smart-mac .smart-ordinary .smart-name input:focus::selection {\n  background: #fceac1;\n  color: #202020;').replace('.smart-mac .smart-ordinary .smart-make label {\n  line-height:', '.smart-mac .smart-ordinary .smart-make label {\n  gap: 6px;\n  line-height:')
check('exact candidate CSS identity',sha(ROOT/'src/smart-folders.css')=='cdbfde60942488be5e9b4002924162d4d21850a1d71fc352176e86cb122a160c')
check('only allowed four declaration groups changed',current==expected)
(OUT/'independent-source.patch').write_text(''.join(difflib.unified_diff(baseline.splitlines(True),current.splitlines(True),fromfile='fixed-baseline',tofile='current-candidate')))
form=(ROOT/'src/SmartFolderForm.tsx').read_text()
check('unchanged actual production form',sha(ROOT/'src/SmartFolderForm.tsx')=='b2e4d60e5cbe0265b1bca7a67cd5c2d7412b3697e34152d870c0d0344770c15c')
check('native controlled input and existing focus logic',all(s in form for s in ['<input\n                  autoFocus','onFocus={(e) => e.target.select()}','onChange={(e) => update({ name: e.target.value })}']))
check('ordinary exclusion contract present','!mobile && !folder && !draft.smart ? "smart-ordinary"' in form)
html=(OUT/'candidate.html').read_text()
check('fresh HTML includes exact complete production CSS',('<style>'+(ROOT/'src/style.css').read_text()+'\n'+current+'</style>') in html)
check('harness equals author real production import',sha(OUT/'harness-entry.tsx')==sha(AUTHOR/'harness-entry.tsx') and "from '../../../src/SmartFolderForm'" in (OUT/'harness-entry.tsx').read_text())
check('Vite own dedicated cache configuration',"cacheDir:resolve(dir,'vite-cache')" in (OUT/'prepare.mjs').read_text() and not (OUT/'vite-cache').exists())
check('fresh prepare success',load(OUT/'prepare-command.json')['exitCode']==0)
check('first WK environment failure preserved',load(OUT/'wk-command.json')['exitCode']==1 and load(OUT/'independent-wk.json')['status']=='process-terminated')
check('controlled retry success',load(OUT/'wk-attempt02-command.json')['exitCode']==0 and load(OUT/'wk-attempt02-command.json')['stderr']=='')
wk=load(OUT/'independent-wk-attempt02.json');m=wk['metrics']
check('fresh14 bounded DOM checks',wk['status']=='metrics-ok' and len(m['checks'])==14 and m['pass'] and all(x['pass'] for x in m['checks']) and m['errors']==[] and m['requests']==[])
check('inactive unattached environment boundary',not m['documentFocus'] and not m['matchesRealFocus'] and m['activeInput'] and not wk['appActive'] and not wk['webViewAttachedToWindow'] and all(not w['visible'] and not w['key'] and not w['main'] for w in wk['windowDiagnostics']))
author=load(AUTHOR/'candidate-interaction-final-wk.json')
check('author23 preserved bounded checks',len(author['metrics']['checks'])==23 and all(x['pass'] for x in author['metrics']['checks']) and not author['metrics']['documentFocus'] and author['metrics']['errors']==[] and author['metrics']['requests']==[])
diag=load(AUTHOR/'candidate-diagnostic-wk.json')['metrics']
check('class-remap diagnostic explicitly separate',not diag['documentFocus'] and not diag['matchesRealFocus'] and 'DIAGNOSTIC ONLY' in diag['scope'])
loaded=load(SAFARI/'loaded-input.json')
check('Safari exact stable candidate HTML',sha(ROOT/loaded['path'])==loaded['sha256'] and loaded['sourceCSS']['sha256']==sha(ROOT/'src/smart-folders.css'))
for folder in [SAFARI, ORIGINAL]:
 for prefix,selection in [('00','新建文件夹'),('01','件夹')]:
  t=next(folder.glob(prefix+'-*.ax.txt')).read_text()
  check(folder.name+prefix+' actual selected range',('Selected text: ```\n'+selection+'\n```') in t)
 check(folder.name+'02 replacement AX', 'QA-FOCUS-26-CANCEL' in next(folder.glob('02-*.ax.txt')).read_text())
check('Safari03 retains fixture form', 'container 新建文件夹' in next(SAFARI.glob('03-*.ax.txt')).read_text())
orig03=next(ORIGINAL.glob('03-*.ax.txt')).read_text()
check('original03 cancels to finite main endpoint','0 标准窗口' in orig03 and 'Notes Clone UI 对照' in orig03 and '11个备忘录' in orig03 and 'QA-TYPE-20261104-01' in orig03 and 'QA-FOCUS-26-CANCEL' not in orig03)
check('original reference remains one identical sample',sha(next(ORIGINAL.glob('00-*.cua-image')))==sha(ROOT/'docs/verification/mac-ordinary-sidebar-runtime23/01-original-ordinary-active.cua-image'))

# Two independent ink bboxes on the fresh inactive production snapshot; no focus-paint claim.
def ink(im,box):
 points=[(x,y) for y in range(box[1],box[3]) for x in range(box[0],box[2]) if max(im.getpixel((x,y)))<160]
 return [min(x for x,y in points),min(y for x,y in points),max(x for x,y in points)+1,max(y for x,y in points)+1]
with Image.open(OUT/'independent-wk-attempt02.png') as im:
 x,y,w,h=m['geometry']['candidate'][0][1:];box=[round(x*2),round(y*2),round((x+w)*2),round((y+h)*2)];native=im.convert('RGB').crop(box)
 measurements={'crop':box,'nativeSize':list(native.size),'nameInk':ink(native,[135,120,300,153]),'smartLabelInk':ink(native,[80,194,280,224]),'method':'Fresh inactive production WK screenshot, geometry-derived2x crop; maxRGB<160 ink only. No new active-focus, font/AA or all-pixel claim.'}
check('fresh measured ink target boxes',measurements['nativeSize']==[800,414] and measurements['nameInk']==[142,125,268,149] and measurements['smartLabelInk']==[85,197,262,221])
save('fresh-ink-measurements.json',measurements)
save('static-checks.json',{'checkCount':len(checks),'failed':sum(not x['pass'] for x in checks),'checks':checks})
print(json.dumps({'checks':len(checks),'failed':[x for x in checks if not x['pass']],'freshInk':measurements},ensure_ascii=False))
