from pathlib import Path
from PIL import Image,ImageCms
from io import BytesIO
import json,hashlib,datetime,subprocess
R=Path(__file__).resolve().parents[3];O=Path(__file__).resolve().parent;checks=[]
def ck(n,v,detail=None):checks.append({'name':n,'pass':bool(v),'detail':detail})
def sha(f):return hashlib.sha256(f.read_bytes()).hexdigest()
manifest=json.loads((O/'input-open.json').read_text());after=[];changed=[]
for e in manifest['files']:
 f=R/e['path'];now={'path':e['path'],'bytes':f.stat().st_size,'sha256':sha(f),'mtimeNs':f.stat().st_mtime_ns};after.append(now)
 if now!=e:changed.append(e['path'])
 if e['path']!='src/smart-folders.css':ck('protected:'+e['path'],now==e)
ck('sole protected mutation',changed==['src/smart-folders.css'],changed)
base=(O/'baseline-smart-folders.css').read_bytes();candidate=(R/'src/smart-folders.css').read_bytes();addition=b':root:not(.dark) .smart-mac .smart-ordinary .smart-name input:focus::selection {\n  color: #000;\n}\n'
ck('exact3line color override',candidate.count(addition)==1 and candidate.replace(addition,b'',1)==base)
ck('source commit fixed',json.loads((O/'source-commit.json').read_text())['head']=='93d33f692cc3022d14dfe564db7ef460369619ff')
files=subprocess.check_output(['git','diff','--name-only','f2bc755f854938c3d6bdcf8e1f6f40fa200de0f5','93d33f692cc3022d14dfe564db7ef460369619ff'],cwd=R).decode().splitlines();ck('fixed source commit onlyCSS',files==['src/smart-folders.css'])
(O/'input-close.json').write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'count':len(after),'changedPaths':changed,'allowedCSSOnly':changed==['src/smart-folders.css'],'files':after},indent=2)+'\n')
bundle=json.loads((O/'bundle-inputs.json').read_text())
for e in bundle['files']:
 f=R/e['path'];ck('bundle:'+e['path'],f.stat().st_size==e['bytes'] and sha(f)==e['sha256'])
for name,selection,diagnostic in [('candidate-actual-all',[0,5],False),('baseline-all',[0,5],True),('candidate-all',[0,5],True),('baseline-partial',[3,5],True),('candidate-partial',[3,5],True),('baseline-natural',[0,0],False),('candidate-natural',[0,0],False)]:
 d=json.loads((O/(name+'.json')).read_text());m=d['metrics'];ck(name+':completed',d['status']=='metrics-ok' and d['snapshotSaved'] and d['snapshotPixels']==[2176,1320]);ck(name+':hidden',not d['appActive'] and not d['webViewAttachedToWindow'] and all(not w['visible'] and not w['key'] and not w['main'] for w in d['windowDiagnostics']));ck(name+':noerrors/resources',m['errors']==[] and m['requests']==[]);ck(name+':selection/mapping',m['selection']==selection and m['config']['diagnostic']==diagnostic);ck(name+':rectangles',m['beforeRects']==m['afterRects'] and m['panel']==[344,226.5,400,207]);ck(name+':style',m['nodes']['nameInput']['computed']['fontSize']=='13px' and m['nodes']['nameInput']['computed']['fontWeight']=='400' and m['nodes']['nameInput']['computed']['webkitFontSmoothing']=='auto');ck(name+':inactive-boundary',not m['documentFocus'] and not m['actualFocus'])
 if diagnostic:ck(name+':selection-style',m['selectionStyle']=={'color':'rgb(0, 0, 0)' if name.startswith('candidate')else'rgb(32, 32, 32)','background':'rgb(252, 234, 193)'})
actual=json.loads((O/'candidate-actual-all.json').read_text())['metrics'];ck('actual attempt cannot draw active selection',actual['activeInput'] and not actual['actualFocus'] and actual['selectionStyle']['background']=='rgba(0, 0, 0, 0)')
iso=json.loads((O/'isolation-final.json').read_text())['metrics']
for c in iso['checks']:ck('isolation:'+c['name'],c['pass'],c.get('detail'))
ck('isolation12',len(iso['checks'])==12 and iso['pass'] and iso['errors']==[] and iso['requests']==[])
m=json.loads((O/'measurements.json').read_text());comp=m['baselineCandidatePixelComparisons']
ck('natural wholeform zeroRGB',comp['natural']['formChangedPixels']==0)
for state in ['all','partial']:
 ck(state+':outside target zeroRGB',comp[state]['outsideNameRoiChanged']==0 and comp[state]['threeRoiChanged']['nameLabel']==comp[state]['threeRoiChanged']['smartLabel']==0)
 ck(state+':selection strip unchanged',comp[state]['selectionStripChanged']==0)
ck('partial changes onlyselected final2chars',comp['partial']['bbox']==[219,124,269,149])
ck('all core32to0',m['core720SrgbMedians']['baseline-all']==[32,32,32] and m['core720SrgbMedians']['candidate-all']==[0,0,0])
err=m['measurements'];ck('selected sRGBMAE improves',err['candidate-all']['errorsVsFullOrNaturalReference']['name']['srgb']['fullMAE']<err['baseline-all']['errorsVsFullOrNaturalReference']['name']['srgb']['fullMAE'])
ck('adverse thresholdbbox retained',err['candidate-all']['ink']['name']['160']['bbox']==[142,125,269,149] and err['baseline-all']['ink']['name']['160']['bbox']==[142,125,268,149])
ck('adverse srgb160mask retained',err['candidate-all']['errorsVsFullOrNaturalReference']['name']['srgb']['maskXor']['160']==196 and err['baseline-all']['errorsVsFullOrNaturalReference']['name']['srgb']['maskXor']['160']==192)
qa=[]
for f in sorted(O.glob('*.png')):
 im=Image.open(f);im.load();qa.append({'path':str(f.relative_to(R)),'size':im.size,'format':im.format,'decoded':True,'srgbChunk':im.info.get('srgb'),'iccBytes':len(im.info.get('icc_profile',b''))})
 ck('decode:'+f.name,im.format=='PNG' and im.mode in ['RGB','RGBA'])
(O/'derived-image-qa.json').write_text(json.dumps(qa,indent=2)+'\n')
result={'status':'PASS' if all(c['pass']for c in checks)else'FAIL','stop':'SOURCE READY STOP','scope':'Source plus finite declaration-mapped selected text paint only; not active Mac package/full pixel/key routing acceptance','sourceCommit':'93d33f692cc3022d14dfe564db7ef460369619ff','assertions':len(checks),'passed':sum(c['pass']for c in checks),'protectedFiles':len(after),'unchangedProtectedFiles':len(after)-len(changed),'trackedProductFiles':len(manifest['productInputPaths']),'bundleInputs':len(bundle['files']),'productChangedPaths':changed,'open':['actual Mac14 active selection capture','natural glyph residual','selection background/ICC/JPEG/host residual','candidate thresholdbbox expands1px and sRGB160mask slightly worsens'],'checks':checks}
(O/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items()if k!='checks'},ensure_ascii=False))
if result['status']!='PASS':print(json.dumps([c for c in checks if not c['pass']],ensure_ascii=False));raise SystemExit(1)
