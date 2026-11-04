from pathlib import Path
from PIL import Image,ImageCms
from io import BytesIO
import json,hashlib,datetime
R=Path(__file__).resolve().parents[3];O=Path(__file__).resolve().parent
checks=[]
def ck(n,p):checks.append({'name':n,'pass':bool(p)})
manifest=json.loads((O/'input-open.json').read_text());now=[]
for e in manifest['files']:
 f=R/e['path'];d={'path':e['path'],'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'mtimeNs':f.stat().st_mtime_ns};now.append(d);ck('protected:'+e['path'],d==e)
(O/'input-close.json').write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'count':len(now),'unchanged':all(c['pass'] for c in checks),'files':now},indent=2)+'\n')
d=json.loads((O/'image-analysis.json').read_text())
for n,p in d['reproduced'].items():ck('reproduced:'+n,p)
ck('common720',all(v['commonCorePixels']==720 for v in d['commonDarkCore'].values()))
ck('sameICC',len({v['iccSHA256']for v in d['sources'].values()})==1)
ck('JPEG4:2:0',all(v['format']=='JPEG' and v['jpegComponents']==[[1,2,2,0],[2,1,1,1],[3,1,1,1]]for v in d['sources'].values()))
ck('natural-balanced-residual',d['thresholdCounts']['caret']['name']['160']['onlyOriginal']==94 and d['thresholdCounts']['caret']['name']['160']['onlyMac13']==98)
ck('glyph-residual-sum',sum(e['xor160']for e in d['fixedGlyphCells']['caret'])==192 and sum(e['xor160']for e in d['fixedGlyphCells']['selected'])==201)
for n in ['probe-selection-selected','probe-smoothing-selected']:
 p=R/('docs/verification/mac-ordinary-typography31/'+n+'.json');x=json.loads(p.read_text())['metrics'];
 ck('prior31:'+n+':selection',x['selection']==[0,5])
 expected='antialiased' if n=='probe-selection-selected' else 'auto';ck('prior31:'+n+':smoothing',x['nodes']['nameInput']['computed']['webkitFontSmoothing']==expected)
 expectedColor='rgb(0, 0, 0)' if n=='probe-selection-selected' else 'rgb(32, 32, 32)';ck('prior31:'+n+':selectionColor',x['selectionStyle']['color']==expectedColor)
qa=[]
for f in sorted(O.glob('*.png')):
 im=Image.open(f);im.load();profile=im.info.get('icc_profile');srgb='srgb' in f.stem
 if srgb:ck('PNG:'+f.name+':sRGB',profile is not None and 'sRGB' in ImageCms.getProfileDescription(ImageCms.ImageCmsProfile(BytesIO(profile))))
 else:ck('PNG:'+f.name+':rawNoProfile',profile is None)
 qa.append({'path':str(f.relative_to(R)),'size':im.size,'format':im.format,'mode':im.mode,'profile':'sRGB' if srgb else 'raw/unmanaged','decoded':True})
(O/'derived-image-qa.json').write_text(json.dumps(qa,indent=2)+'\n')
result={'status':'PASS' if all(c['pass']for c in checks)else 'FAIL','stop':'READY STOP','scope':'Saved-image evidence consistency only; no product/full-pixel PASS','protectedFiles':len(now),'assertions':len(checks),'passed':sum(c['pass']for c in checks),'candidate':'Only selected text color black with current auto smoothing in light ordinary Mac input; unrendered, no CSS implementation authorized','open':['natural192 glyph residual; exact font/weight/raster cause unknown','selection background residual and active-host color/capture processing unknown','actual product/UI and keyboard parity not tested'],'checks':checks}
(O/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items()if k!='checks'},ensure_ascii=False))
if result['status']!='PASS':print([c for c in checks if not c['pass']]);raise SystemExit(1)
