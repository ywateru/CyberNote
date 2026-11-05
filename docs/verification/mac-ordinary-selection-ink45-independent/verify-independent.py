from pathlib import Path
from PIL import Image, ImageCms
from io import BytesIO
import hashlib, json, statistics, subprocess

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
AUTHOR = ROOT / 'docs/verification/mac-ordinary-selection-ink45'
REF = ROOT / 'docs/research/mac-ordinary-visual-readiness44'
BASE = 'f2bc755f854938c3d6bdcf8e1f6f40fa200de0f5'
PRODUCT = '93d33f692cc3022d14dfe564db7ef460369619ff'
HEAD = '7675323329cd0e865b532999e66e83b0471d082c'
checks = []
def load(p): return json.loads(p.read_text())
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def check(name, passed, detail=None):
    checks.append({'name': name, 'pass': bool(passed), 'detail': detail})
def dump(name, obj):
    (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n')
def git(*args): return subprocess.check_output(['git', *args], cwd=ROOT)
def record(p):
    return {'path': str(p), 'bytes': p.stat().st_size, 'sha256': sha(p), 'mtimeNs': p.stat().st_mtime_ns}

# Freeze exact product, sealed evidence, original image inputs, and actual bundle inputs.
protected = set()
for group in [load(AUTHOR/'input-close.json')['files'], load(AUTHOR/'bundle-inputs.json')['files'],
              load(AUTHOR/'evidence-index.json')['files'], load(REF/'evidence-index.json')['files']]:
    protected.update((ROOT/e['path']).absolute() for e in group)
protected.update([AUTHOR/'evidence-index.json', REF/'evidence-index.json'])
source_data = load(ROOT/'docs/research/mac-ordinary-typography36-runtime-analysis/result.json')['sources']
for name in ['original31-selected', 'original31-caret', 'mac13-selected', 'mac13-caret']:
    protected.add(ROOT/source_data[name]['path'])
before = [record(p) for p in sorted(protected)]
dump('protected-inputs.before.json', before)
check('fixed evidence HEAD', git('rev-parse','HEAD').decode().strip()==HEAD)
check('product parent is authorized base', git('rev-parse',PRODUCT+'^').decode().strip()==BASE)
check('evidence parent is fixed product', git('rev-parse',HEAD+'^').decode().strip()==PRODUCT)
check('only product path', git('diff','--name-only',BASE,PRODUCT).decode().splitlines()==['src/smart-folders.css'])
patch = git('diff',BASE,PRODUCT,'--','src/smart-folders.css')
check('sealed patch equals exact Git diff', patch==(AUTHOR/'source.patch').read_bytes())
dump('source-identity.json', {'base':BASE,'product':PRODUCT,'head':HEAD,'patch':patch.decode()})
base_css = git('show',BASE+':src/smart-folders.css')
candidate_css = (ROOT/'src/smart-folders.css').read_bytes()
override = b':root:not(.dark) .smart-mac .smart-ordinary .smart-name input:focus::selection {\n  color: #000;\n}\n'
check('exact sole 3 line override', candidate_css.count(override)==1 and candidate_css.replace(override,b'',1)==base_css)
check('baseline CSS is exact Git base blob', (AUTHOR/'baseline-smart-folders.css').read_bytes()==base_css)
manifest = load(AUTHOR/'input-close.json')
product_paths = load(AUTHOR/'input-open.json')['productInputPaths']
for path in product_paths:
    content = (ROOT/path).read_bytes()
    blob = hashlib.sha1(b'blob '+str(len(content)).encode()+b'\0'+content).hexdigest()
    check('product Git blob: '+path, blob==git('rev-parse',PRODUCT+':'+path).decode().strip())
for e in manifest['files']:
    check('author close input: '+e['path'],record(ROOT/e['path'])==dict(e,path=str(ROOT/e['path'])))
for folder, expected in [(AUTHOR,'bddc4ad992bc8e718d6ab71f03d2c03e29f0280d227b09eb2084d836dd964b9e'),(REF,None)]:
    index=load(folder/'evidence-index.json')
    if expected: check('author sealed index SHA',sha(folder/'evidence-index.json')==expected)
    check('index count '+folder.name,len(index['files'])==index['count'])
    check('index unique '+folder.name,len({e['path'] for e in index['files']})==len(index['files']))
    for e in index['files']:
        p=ROOT/e['path'];check('indexed evidence: '+e['path'],p.stat().st_size==e['bytes'] and sha(p)==e['sha256'])
check('sealed author result SHA',sha(AUTHOR/'result.json')=='1bcfc1888f553499b3a7d03d5c3660a2d9e5820258c907576e87148bae1fca9b')
bundle=load(AUTHOR/'bundle-inputs.json')
for e in bundle['files']:
    p=ROOT/e['path'];check('bundle actual bytes: '+e['path'],p.stat().st_size==e['bytes'] and sha(p)==e['sha256'])
# Inspect rather than execute author's fixture and renderer.
global_css=(ROOT/'src/style.css').read_text()
for phase,css in [('baseline',base_css.decode()),('candidate',candidate_css.decode())]:
    html=(AUTHOR/(phase+'.html')).read_text()
    check('complete production CSS embedded '+phase,'<style id="production-css">'+global_css+'\n'+css+'</style>' in html)
    check('exact production bundle embedded '+phase,(AUTHOR/'bundle.js').read_text().replace('</script','<\\/script') in html)
component=(ROOT/'src/SmartFolderForm.tsx').read_text()
check('ordinary class excludes mobile, editing, smart', '${!mobile && !folder && !draft.smart ? "smart-ordinary" : ""}' in component)
check('fixture imports production component', "from '../../../src/SmartFolderForm'" in (AUTHOR/'harness-entry.tsx').read_text())
check('mapping rewrites focus declarations explicitly', "replaceAll(':focus::selection','.controlled-focus::selection')" in (AUTHOR/'render-probe-template.js').read_text())
for name,selection,diagnostic in [('candidate-actual-all',[0,5],False),('baseline-all',[0,5],True),('candidate-all',[0,5],True),('baseline-partial',[3,5],True),('candidate-partial',[3,5],True),('baseline-natural',[0,0],False),('candidate-natural',[0,0],False)]:
    d=load(AUTHOR/(name+'.json'));m=d['metrics']
    check('retained endpoint '+name,d['status']=='metrics-ok' and d['snapshotSaved'] and m['errors']==[] and m['requests']==[])
    check('inactive host disclosed '+name,not d['appActive'] and not d['webViewAttachedToWindow'] and not m['documentFocus'] and not m['actualFocus'])
    check('selection and mapping '+name,m['selection']==selection and m['config']['diagnostic']==diagnostic)
    check('unchanged endpoint rectangles '+name,m['beforeRects']==m['afterRects'] and m['panel']==[344,226.5,400,207])
actual=load(AUTHOR/'candidate-actual-all.json')['metrics']
check('actual selection unsuccessful for active paint',actual['activeInput'] and actual['selectionStyle']['background']=='rgba(0, 0, 0, 0)')
iso=load(AUTHOR/'isolation-final.json')['metrics']
check('finite isolation12 retained',len(iso['checks'])==12 and all(c['pass'] for c in iso['checks']) and iso['pass'])
failure=load(AUTHOR/'isolation.json')['metrics']
check('failed fixture expectation retained',not failure['pass'] and any(not c['pass'] for c in failure['checks']))
for name in ['input-freeze-attempt01-failure.json','input-freeze-attempt02-failure.json','isolation-attempt01-failure-notes.json']:
    check('failure retained '+name,(AUTHOR/name).stat().st_size>0)

# Independently decode original JPEG bytes and regenerate raw/sRGB references in memory.
refs={};orig={};reference_records=[]
for name in ['original31-selected','original31-caret','mac13-selected','mac13-caret']:
    e=source_data[name];p=ROOT/e['path'];check('original source SHA '+name,sha(p)==e['sourceSHA256'])
    im=Image.open(p);im.load();crop=(688,453,1488,867) if im.size==(2176,1320) else (0,0,800,414)
    raw=im.convert('RGB').crop(crop)
    srgb=ImageCms.profileToProfile(im,ImageCms.ImageCmsProfile(BytesIO(im.info['icc_profile'])),ImageCms.createProfile('sRGB'),outputMode='RGB').crop(crop)
    orig[name]=raw
    for space,img in [('raw',raw),('srgb',srgb)]:
        stored=Image.open(REF/(name+'-'+space+'.png')).convert('RGB')
        check('original derived RGB identity '+name+' '+space,img.size==stored.size and img.tobytes()==stored.tobytes())
    if name.startswith('original31'):refs['natural' if name.endswith('caret') else 'all']={'raw':raw,'srgb':srgb}
    reference_records.append({'name':name,'path':e['path'],'sourceSHA256':sha(p),'format':im.format,'size':im.size,'crop':crop,'iccSHA256':hashlib.sha256(im.info['icc_profile']).hexdigest()})
dump('original-reference-identity.json',reference_records)
images={}
for state in ['all','partial','natural']:
    for phase in ['baseline','candidate']:
        name=phase+'-'+state;im=Image.open(AUTHOR/(name+'.png'));im.load()
        check('source PNG scale/color '+name,im.size==(2176,1320) and im.info.get('srgb')==0)
        images[name]=im.convert('RGB').crop((688,453,1488,867))
        stored=Image.open(AUTHOR/(name+'-form-srgb.png')).convert('RGB')
        check('unresized integer crop identity '+name,images[name].tobytes()==stored.tobytes())
def points(roi):return [(x,y) for y in range(roi[1],roi[3]) for x in range(roi[0],roi[2])]
def box(ps):return [min(x for x,y in ps),min(y for x,y in ps),max(x for x,y in ps)+1,max(y for x,y in ps)+1] if ps else None
def mask(im,ps,t):return {p for p in ps if max(im.getpixel(p))<t}
def error(a,b,ps):return sum(sum(abs(v-w) for v,w in zip(a.getpixel(p),b.getpixel(p))) for p in ps)/(len(ps)*3)
rois={'name':(135,115,280,158),'nameLabel':(35,115,115,157),'smartLabel':(75,190,330,230)}
author_measure=load(AUTHOR/'measurements.json');measurements={};comparisons={}
for name,im in images.items():
    natural=name.endswith('natural');partial=name.endswith('partial');out={'ink':{},'error':{}}
    authored=author_measure['measurements'][name]
    for key,roi in rois.items():
        ps=[p for p in points(roi) if not(natural and key=='name' and p[0]>=268)]
        out['ink'][key]={}
        for t in [100,160,200]:
            m=mask(im,ps,t);v={'pixels':len(m),'bbox':box(m)};out['ink'][key][str(t)]=v
            check('recomputed ink '+name+' '+key+' '+str(t),v==authored['ink'][key][str(t)])
        if not partial:
            out['error'][key]={}
            for space,ref in refs['natural' if natural else 'all'].items():
                union=mask(im,ps,200)|mask(ref,ps,200)
                v={'fullMAE':error(im,ref,ps),'glyphUnionMAE':error(im,ref,union),'maskXor':{str(t):len(mask(im,ps,t)^mask(ref,ps,t)) for t in [100,160,200]}}
                out['error'][key][space]=v;expected=authored['errorsVsFullOrNaturalReference'][key][space]
                check('recomputed error '+name+' '+key+' '+space,abs(v['fullMAE']-expected['fullMAE'])<1e-10 and abs(v['glyphUnionMAE']-expected['glyphUnionMAE'])<1e-10 and v['maskXor']==expected['maskXor'])
    strip=(222,120,265,124) if partial else (145,120,265,124)
    out['stripMedian']=[statistics.median(v[c] for v in im.crop(strip).getdata()) for c in range(3)]
    check('recomputed color strip '+name,out['stripMedian']==authored['selectionStrip']['median'])
    measurements[name]=out
for state in ['all','partial','natural']:
    a,b=images['baseline-'+state],images['candidate-'+state]
    changed={p for p in points((0,0,800,414)) if a.getpixel(p)!=b.getpixel(p)}
    strip=(222,120,265,124) if state=='partial' else (145,120,265,124)
    v={'formChangedPixels':len(changed),'bbox':box(changed),'outsideNameRoiChanged':len(changed-set(points(rois['name']))),'threeRoiChanged':{key:len(changed&set(points(roi))) for key,roi in rois.items()},'selectionStripChanged':len(changed&set(points(strip)))}
    comparisons[state]=v;check('recomputed whole form difference '+state,v==author_measure['baselineCandidatePixelComparisons'][state])
core=[p for p in points((141,125,268,149)) if all(max(im.getpixel(p))<80 for im in orig.values())]
check('fixed common core720',len(core)==720)
cores={name:[statistics.median(im.getpixel(p)[c] for p in core) for c in range(3)] for name,im in images.items() if not name.endswith('partial')}
cores['original-all']=[statistics.median(refs['all']['srgb'].getpixel(p)[c] for p in core) for c in range(3)]
check('independent core medians',cores==author_measure['core720SrgbMedians'])
check('MAE improvement retained',measurements['candidate-all']['error']['name']['srgb']['fullMAE']<measurements['baseline-all']['error']['name']['srgb']['fullMAE'])
check('adverse sRGB160 mask retained',measurements['baseline-all']['error']['name']['srgb']['maskXor']['160']==192 and measurements['candidate-all']['error']['name']['srgb']['maskXor']['160']==196)
check('natural full image and controls unchanged',comparisons['natural']['formChangedPixels']==0 and all(comparisons[s]['outsideNameRoiChanged']==comparisons[s]['selectionStripChanged']==0 for s in ['all','partial']))
dump('independent-image-metrics.json',{'method':'Original JPEG decoded independently, per-file ICC converted; fixed integer crop, no registration or rescale; metrics recalculated without executing author measure.py','references':reference_records,'rois':rois,'measurements':measurements,'comparisons':comparisons,'core720':cores,'scope':'Mapped declaration evidence only, no actual active host acceptance'})
after=[record(p) for p in sorted(protected)];dump('protected-inputs.after.json',after)
unchanged=[a==b for a,b in zip(before,after)]
dump('integrity-result.json',{'status':'PASS' if all(unchanged) else 'FAIL','protectedCount':len(before),'unchangedCount':sum(unchanged),'bytesSHA256MtimeAllUnchanged':all(unchanged)})
check('all protected inputs unchanged bytes/SHA/mtime',all(unchanged))
result={'status':'PASS' if all(c['pass'] for c in checks) else 'FAIL','stop':'SOURCE-READY READY STOP','scope':'Fixed source and independently recomputed finite declaration-mapped evidence only','base':BASE,'product':PRODUCT,'evidenceHead':HEAD,'assertions':len(checks),'passed':sum(c['pass'] for c in checks),'trackedProductPaths':len(product_paths),'authorIndexMembers':69,'reference44IndexMembers':20,'bundleInputs':len(bundle['files']),'protectedInputs':len(before),'open':['Actual active Mac14 selection paint and partial selection reference','Natural glyph residual, selection background, full pixel parity','Real keyboard/IME behavior and all platform acceptance'],'checks':checks}
dump('verification-result.json',result)
print(json.dumps({k:v for k,v in result.items() if k!='checks'},ensure_ascii=False))
if not all(c['pass'] for c in checks):
    print(json.dumps([c for c in checks if not c['pass']],ensure_ascii=False));raise SystemExit(1)
