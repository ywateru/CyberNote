from pathlib import Path
import json,hashlib,subprocess,statistics,datetime
from PIL import Image
r=Path.cwd();a=r/'docs/verification/app-001-list-heading07';o=Path(__file__).resolve().parent
H=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def J(p):return json.loads(p.read_text())
def dump(name,d):
 p=o/name;assert not p.exists(),p;p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def ident(p):return dict(path=str(p.relative_to(r)),bytes=p.stat().st_size,sha256=H(p))
assert H(a/'output-manifest.json')=='8c254927c715f40661b2b247e7ce3737cbed82ce92bfa1be2323f46f27654dc0'
m=J(a/'output-manifest.json');actual=sorted(str(x.relative_to(a)) for x in a.rglob('*') if x.is_file() and x.name!='output-manifest.json');assert set(actual)=={x['path'] for x in m['files']} and len(actual)==len(m['files'])
for row in m['files']:
 p=a/row['path'];assert p.stat().st_size==row['bytes'] and H(p)==row['sha256'],p
agg=hashlib.sha256(''.join(f"{x['path']}\t{x['bytes']}\t{x['sha256']}\n" for x in m['files']).encode()).hexdigest();assert agg==m['aggregateSha256']
final=J(a/'inputs-final.json')['files']
for row in final:
 p=r/row['path'];assert p.stat().st_size==row['bytes'] and H(p)==row['sha256'],p
opened=J(a/'inputs-open.json')['inputs'];unchanged=[]
for row in opened:
 if row['path'] in ['plugins/tauri-plugin-notes-ui/macos/toolbar.m','src/style.css','docs/plan/tasks/app-001-list-heading07.md','docs/ui/macos.md']:continue
 assert H(r/row['path'])==row['sha256'];unchanged.append(row['path'])
paths={a/'output-manifest.json',*[a/x['path'] for x in m['files']],*[r/x['path'] for x in final],*[r/x['path'] for x in opened]}
inputs=[ident(p) for p in sorted(paths)];dump('inputs-open.json',dict(head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),files=inputs,authorFiles=len(m['files']),authorAggregate=agg))
# Confirm exact source delta rather than trusting author prose.
tool=r/'plugins/tauri-plugin-notes-ui/macos/toolbar.m';css=r/'src/style.css';baseTool=(a/'baseline-toolbar.m').read_text();newTool=tool.read_text()
expected=baseTool.replace('// This root is flipped: the confirmed zero-result title moves down, its subtitle up.','// This root is flipped; three-column headings share the measured vertical baseline.').replace('NSMakeRect(textX,zeroSearchGeometry?11:9,titleWidth,18)','NSMakeRect(textX,three?11:9,titleWidth,18)').replace('NSMakeRect(textX,zeroSearchGeometry?27:28,titleWidth,15)','NSMakeRect(textX,three?27:28,titleWidth,15)');assert expected==newTool
block='''/* First date group in the measured Mac native list; later groups keep their spacing. */
.desktop.native-toolbar:not(.gallery-browse):not(.gallery-edit):not(.separate)
  .notes-scroll:not(.gallery) > .note-entry:first-child > .date-section {
  font-size: 15.25px;
  line-height: 20px;
  height: 40px;
  padding-top: 9.5px;
  border-bottom-width: 0.5px;
}
'''
newCss=css.read_text();baseCss=(a/'baseline-style.css').read_text();assert newCss.count(block)==1 and newCss.replace(block,'')==baseCss
patch=subprocess.check_output(['git','diff','--','plugins/tauri-plugin-notes-ui/macos/toolbar.m','src/style.css']);assert patch==(a/'product.patch').read_bytes()
assert H(tool)=='be75271f92f9e3d58476962d1a06d7c4a4285c68d5bafa1c9e2d25151a2825c0' and H(css)=='eeff3cc31a139fe48543ed9f7daf013c470fee5d703968acdb61d5c583f7262d'
# Exact combined-source provenance plus independent execution of already sealed binaries, no compilation/window.
helper=(a/'layout-main.m').read_text();cases=J(a/'layout02/cases.json');native={}
assert len(cases)==26
for label,source in [('baseline',baseTool),('candidate',newTool)]:
 assert (a/f'layout02/{label}.m').read_text()==source+'\n'+helper
 compileLog=J(a/f'layout02/{label}-compile.json');assert compileLog['exitCode']==0 and not compileLog['stderr']
 b=a/f'layout02/{label}';assert b.read_bytes()[:4] in [bytes.fromhex('cffaedfe'),bytes.fromhex('feedfacf')]
 p=subprocess.run([str(b)],input=json.dumps(cases),text=True,capture_output=True,timeout=30)
 dump(f'appkit-{label}-run.json',dict(argv=[str(b)],binarySha256=H(b),caseSha256=H(a/'layout02/cases.json'),exitCode=p.returncode,stdout=p.stdout,stderr=p.stderr))
 assert p.returncode==0 and not p.stderr
 native[label]=json.loads(p.stdout);assert native[label]==json.loads(J(a/f'layout02/{label}-run.json')['stdout'])
for c,old,new in zip(cases,native['baseline'],native['candidate']):
 assert old['name']==new['name']==c['name'];assert old['windows']==new['windows']==0
 for k in old:
  if k not in ['title','count']:assert old[k]==new[k],(c['name'],k)
 for key,target,oldY in [('title',11,9),('count',27,28)]:
  assert old[key][0]==new[key][0] and old[key][2:]==new[key][2:]
  assert new[key][1]==(target if c['layout']=='threeColumn' else oldY)
  if c['layout']!='threeColumn' or (c['zero'] and c['visible'] and not c['missingSearch']):assert old[key]==new[key]
for label,items in native.items():
 by={x['name']:x for x in items}
 def visibleState(x):
  x=json.loads(json.dumps(x));x.pop('name')
  for collection in ['groups','buttons']:
   x[collection]={k:dict(hidden=True) if v['hidden'] else v for k,v in x[collection].items()}
  return x
 for chain in ['wide228','compact208','narrow160','nonfull']:assert visibleState(by[chain+'-visible'])==visibleState(by[chain+'-restored'])
# Frozen WK artifacts: full CSS/DOM/helper/metrics provenance and scope comparison, no rerender.
def splitHTML(p):
 s=p.read_text();prefix,tail=s.split('<style>',1);style,dom=tail.split('</style>',1);return prefix,style,dom
pfx,baseStyle,dom=splitHTML(a/'webkit04/baseline.html');pfx2,style,dom2=splitHTML(a/'webkit05/candidate.html');assert baseStyle==baseCss and style==newCss and dom==dom2 and pfx==pfx2
for name in ['webkit-render.m','webkit-metrics.js']:
 assert (a/name).read_bytes()==(a/'webkit05'/name).read_bytes()==(a/'webkit04'/name).read_bytes()
assert H(a/'webkit04/baseline.json')==J(a/'webkit05/reused-baseline.json')['sha256']
old=J(a/'webkit04/baseline.json');new=J(a/'webkit05/candidate.json')
for d in [old,new]:
 assert d['status']=='metrics-ok' and d['snapshotSaved'] and d['snapshotPixels']==[2788,1000]
 assert not d['appActive'] and not d['webViewAttachedToWindow'] and not d['metrics']['requests']
 assert d['metrics']['dpr']==2 and d['metrics']['viewport']==dict(width=1394,height=500)
 assert len(d['windowDiagnostics'])==1 and d['windowDiagnostics'][0]['class']=='TUINSWindow'
 assert all(not w[k] for w in d['windowDiagnostics'] for k in ['visible','key','main'])
checks=[]
assert len(old['metrics']['cases'])==len(new['metrics']['cases'])==14
for b,n in zip(old['metrics']['cases'],new['metrics']['cases']):
 assert b['name']==n['name'];name=n['name'];eligible=name.startswith('native-') and n['first'] is not None
 if not eligible:assert b==n,name
 else:
  expectedStyle=dict(b['first']['style'],fontSize='15.25px',lineHeight='20px',height='40px',paddingTop='9.5px',borderBottomWidth='0.5px');assert n['first']['style']==expectedStyle
  assert n['first']['text']==b['first']['text']
  for k in ['x','y','top','left','right','width']:assert n['first']['rect'][k]==b['first']['rect'][k]
  assert n['first']['rect']['height']-b['first']['rect']['height']==1 and n['first']['rect']['bottom']-b['first']['rect']['bottom']==1
  for key in ['row','later','zero']:
   assert n[key]['style']==b[key]['style'] and n[key]['text']==b[key]['text']
   for box in ['rect','textRect']:
    for k,v in b[key][box].items():assert n[key][box][k]==v+(1 if k in ['y','top','bottom'] else 0),(name,key,box,k)
 checks.append(dict(name=name,eligible=eligible))
for name in ['strict-objc','controller13','frontend-build-final','product-whitespace','production-layout02','webkit-render05-final','final-raster-analysis']:
 assert J(a/(name+'.json'))['exitCode']==0,name
# Independently recompute raw glyph segmentation and row medians at three thresholds.
measurements={}
imagePaths={'baseline':a/'webkit04/baseline.png','final':a/'webkit05/candidate.png','original17':r/'docs/verification/mac-sidebar-optical06-runtime-01/17-original-visible228.cua-image'}
author=J(a/'webkit05/measurements.json')
for label,p in imagePaths.items():
 im=Image.open(p).convert('RGB');ts={}
 for t in [120,160,200]:
  pts=[];cs=[]
  for y in range(110,170):
   for x in range(476,566):
    c=im.getpixel((x,y))
    if 299*c[0]+587*c[1]+114*c[2]<t*1000 and max(c)-min(c)<25:pts.append((x,y));cs.append(c)
  bbox=[min(x for x,y in pts),min(y for x,y in pts),max(x for x,y in pts)+1,max(y for x,y in pts)+1]
  ts[str(t)]={'bbox':bbox,'width':bbox[2]-bbox[0],'height':bbox[3]-bbox[1],'inkPixels':len(pts),'medianRGB':[statistics.median(c[i] for c in cs) for i in range(3)],'meanLuminance':statistics.mean((299*c[0]+587*c[1]+114*c[2])/1000 for c in cs)}
  assert ts[str(t)]==author['records'][label]['thresholds'][str(t)]
 samples={y:statistics.median(sum(im.getpixel((x,y)))/3 for x in range(476,756)) for y in range(170,195)};dark=min(samples.values());rows=[y for y,v in samples.items() if v==dark];assert rows==author['records'][label]['divider']['primaryRows']
 measurements[label]=dict(identity=ident(p),thresholds=ts,dividerRows=rows)
dump('raster-recomputed.json',measurements)
assert measurements['final']['thresholds']['160']['bbox']==measurements['original17']['thresholds']['160']['bbox']==[489,130,546,158]
# Author failure records remain failures and limitations remain explicit.
assert J(a/'production-layout.json')['exitCode']!=0
assert all(x['status']=='timeout' for x in J(a/'webkit01/raw-results.json').values())
assert all(x['status']=='process-terminated' for x in J(a/'webkit02/raw-results.json').values())
assert J(a/'webkit-ink.json')['exitCode']!=0
# Closing read, including all sealed author assets and finite source/contract inputs.
for row in inputs:
 p=r/row['path'];assert p.stat().st_size==row['bytes'] and H(p)==row['sha256'],p
dump('inputs-close.json',dict(files=inputs,unchangedCount=len(inputs),allUnchanged=True))
dump('result.json',dict(status='pass-source-ready-no-blocker',head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),authorManifestSha256=H(a/'output-manifest.json'),authorFiles=len(m['files']),authorAggregateSha256=agg,inputCount=len(inputs),appkitIndependentExecutedStates=2*len(cases),appkitOutputExactToAuthor=True,wkRecomputedCases=checks,sourceDeltaExact=True,sourceHashes={str(p.relative_to(r)):H(p) for p in [tool,css,r/'src/App.tsx']},openingOtherInputsUnchanged=unchanged,limits=['No WK rerender; independently checked frozen actual WK artifacts, provenance, metrics and image pixels.','Existing AppKit exact binaries independently executed with 26 original finite cases each; stub host/no real NSWindow/input/field editor.','WK fixed viewport1394x500, classes emulate excluded phone/Android modes without device or React runtime.','160-threshold bbox equality is not raster/color/font identity. Ink549 vs610 and median38 vs41 persist;120/200 widths differ.','Source-ready only; new exact package and same-condition original/runtime GUI remain pending; no full pixel PASS.']))
print(json.dumps({'status':'pass-source-ready-no-blocker','authorFiles':len(m['files']),'inputs':len(inputs),'independentAppKitStates':52,'wkCases':len(checks),'bbox160':measurements['final']['thresholds']['160']['bbox']},ensure_ascii=False))
