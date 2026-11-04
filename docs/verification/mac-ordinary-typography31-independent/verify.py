from pathlib import Path
from PIL import Image, ImageCms
from io import BytesIO
import json, hashlib, subprocess, re, difflib

ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
AUTHOR=ROOT/'docs/verification/mac-ordinary-typography31'
COMMIT='e687ea6ceaa02c57e511c4a97a6187cba5f5acf0'
CSS_SHA='7e7a7bfa274858cbb1449e55e96026427dfa398489613dc60592e2608dc48005'
CHECKS=[]
def check(name,condition,detail=None):
    CHECKS.append({'name':name,'pass':bool(condition),**({'detail':detail} if detail is not None else {})})
def read(p): return json.loads(Path(p).read_text())
def digest(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def entries(value): return value if isinstance(value,list) else value.get('files',value.get('entries',[]))
def resolve(index,item):
    p=Path(item['path'])
    if p.is_absolute():return p
    p=ROOT/p
    return p if p.exists() else index.parent/item['path']
def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT)

head=git('rev-parse','HEAD').decode().strip()
check('fixed full commit',head==COMMIT,head)
css=(ROOT/'src/smart-folders.css').read_bytes()
baseline=git('show',COMMIT+'^:src/smart-folders.css')
committed=git('show',COMMIT+':src/smart-folders.css')
check('current CSS equals committed bytes and expected SHA',css==committed and hashlib.sha256(css).hexdigest()==CSS_SHA)
check('sealed baseline CSS equals exact parent bytes',(AUTHOR/'baseline-smart-folders.css').read_bytes()==baseline)
addition=b':root:not(.dark) .smart-mac .smart-ordinary .smart-name,\n:root:not(.dark) .smart-mac .smart-ordinary .smart-make label {\n  -webkit-font-smoothing: auto;\n}\n'
check('sole CSS addition is two selectors and one smoothing declaration',css.count(addition)==1 and css.replace(addition,b'',1)==baseline)
expected_patch=''.join(difflib.unified_diff(baseline.decode().splitlines(True),css.decode().splitlines(True),fromfile='a/src/smart-folders.css',tofile='b/src/smart-folders.css'))
check('author patch exactly reproduces byte diff',(AUTHOR/'source.patch').read_text()==expected_patch)
initial=read(AUTHOR/'input-initial.json')['files']
product=initial[:303]
check('initial product list excludes research/task evidence',all(not x['path'].startswith('docs/plan/') for x in product))
product_delta=[]
for item in product:
    p=ROOT/item['path']
    if len(p.read_bytes())!=item['bytes'] or digest(p)!=item['sha256']:product_delta.append(item['path'])
check('303 current product inputs only CSS changed from baseline',product_delta==['src/smart-folders.css'],product_delta)
committed_delta=git('diff','--name-only',COMMIT+'^',COMMIT,'--',*[x['path'] for x in product]).decode().splitlines()
check('commit product diff only CSS',committed_delta==['src/smart-folders.css'],committed_delta)
all_delta=[x['path'] for x in initial if digest(ROOT/x['path'])!=x['sha256']]
check('current initial315 differences limited to CSS and root-updated task',set(all_delta)=={'src/smart-folders.css','docs/plan/tasks/app-mac-ordinary-typography31.md'},all_delta)
for item in read(AUTHOR/'source-manifest.json')['files']:
    p=ROOT/item['path'];check('source manifest '+item['path'],len(p.read_bytes())==item['bytes'] and digest(p)==item['sha256'])
index=AUTHOR/'evidence-index.json'
check('sealed author index identity',digest(index)=='053500ca106618985f9802c4b4ac4f33b05dfda201c54232e9652cb53f75da26')
check('sealed author index count78',len(entries(read(index)))==78)
index_counts={}
for rel in ['docs/verification/mac-ordinary-typography31/evidence-index.json','docs/research/mac-ordinary-typography-readiness30/evidence-index.json','docs/research/mac-name-focus-runtime29-analysis/evidence-index.json','docs/verification/mac-ordinary-name-focus26/evidence-index.json','docs/research/mac-ordinary-original31/evidence-index.json']:
    idx=ROOT/rel;items=entries(read(idx));index_counts[rel]=len(items)
    for item in items:
        p=resolve(idx,item)
        check('sealed input '+str(p.relative_to(ROOT)),len(p.read_bytes())==item['bytes'] and digest(p)==item['sha256'])

global_css=(ROOT/'src/style.css').read_text()
baseline_full=global_css+'\n'+baseline.decode()
candidate_full=global_css+'\n'+css.decode()
bundles=[]
fixture_setup={}
for phase,style in [('baseline',baseline_full),('candidate',candidate_full)]:
    html=(AUTHOR/(phase+'.html')).read_text()
    first_style=re.search(r'<style>(.*?)</style>',html,re.S).group(1)
    scripts=re.findall(r'<script>(.*?)</script>',html,re.S)
    check(phase+' HTML style is exact full source CSS',first_style==style)
    values={}
    for key in ['baselineCss','candidateCss']:
        values[key]=json.JSONDecoder().raw_decode(scripts[0].split('window.'+key+'=',1)[1])[0]
    check(phase+' embedded baseline exact',values['baselineCss']==baseline_full)
    # Baseline was prepared before the product change, so both of its variables are baseline.
    check(phase+' embedded candidate at creation exact',values['candidateCss']==(baseline_full if phase=='baseline' else candidate_full))
    fixture_setup[phase]={'baselineSha':hashlib.sha256(values['baselineCss'].encode()).hexdigest(),'candidateSha':hashlib.sha256(values['candidateCss'].encode()).hexdigest()}
    bundles.append(scripts[1])
theme_line='    document.documentElement.classList.toggle("dark", !!options.dark);\n'
check('only compiled fixture difference is disclosed html.dark adaptation',bundles[1].count(theme_line)==1 and bundles[1].replace(theme_line,'',1)==bundles[0])
app_source=(ROOT/'src/App.tsx').read_text()
check('actual App theme ownership matches candidate html.dark adaptation','document.documentElement.classList.toggle(' in app_source and 'theme === "dark" || (theme === "system" && media.matches)' in app_source)
check('fixture retains real component and real name handlers','function SmartFolderForm(' in bundles[0] and 'e.target.select()' in bundles[0] and 'onChange: (e) => update({ name: e.target.value })' in bundles[0])

runs=['baseline-native','baseline-selected','probe-color-native','probe-selection-selected','probe-smoothing-native','probe-smoothing-selected','probe-rendering-native','candidate-native','candidate-selected']
for name in runs+['interaction-final']:
    j=read(AUTHOR/(name+'.json'));m=j['metrics']
    check(name+' author native completion and inactive boundary',j['status']=='metrics-ok' and j['snapshotSaved'] and not j['appActive'] and not j['webViewAttachedToWindow'] and all(not w['visible'] and not w['key'] and not w['main'] for w in j['windowDiagnostics']))
    check(name+' no fixture errors or external requests',not m['errors'] and not m['requests'])
    command=read(AUTHOR/(name+'-command.json'))
    check(name+' author command successful',command['exitCode']==0 and not command['stdout'] and not command['stderr'])
    if name!='interaction-final':
        check(name+' exact rect preservation',m['beforeRects']==m['afterRects'] and m['panel'][2:]==[400,207] and m['window']=={'dpr':2,'innerHeight':660,'innerWidth':1088,'visualViewportScale':1})
        diagnostic='selected' in name
        check(name+' natural versus diagnostic boundary',m['config']['diagnostic']==diagnostic and not m['documentFocus'] and not m['actualFocus'] and m['selection']==([0,5] if diagnostic else [0,0]))
interaction=read(AUTHOR/'interaction-final.json')['metrics']
check('author thirteen finite checks all pass',len(interaction['checks'])==13 and all(x['pass'] for x in interaction['checks']) and interaction['pass'])
check('author rect pair exact',interaction['candidateRects']==interaction['baselineRects'])

fresh_names=['fresh-baseline-native-attempt02','fresh-candidate-native','fresh-isolation']
for name in fresh_names:
    j=read(OUT/(name+'.json'));m=j['metrics']
    check(name+' completed inactive unattached with no visible windows',j['status']=='metrics-ok' and j['snapshotSaved'] and not j['appActive'] and not j['webViewAttachedToWindow'] and all(not w['visible'] and not w['key'] and not w['main'] for w in j['windowDiagnostics']))
    check(name+' no errors or requests',not m['errors'] and not m['requests'])
fresh=read(OUT/'fresh-candidate-native.json')['metrics']
check('fresh candidate exactly four inherited smoothing differences',[(d['index'],d['key'],d['baseline'],d['candidate']) for d in fresh['changed']]==[(i,'-webkit-font-smoothing','antialiased','auto') for i in [4,5,7,8]],fresh['changed'])
check('fresh all rectangles and text invariant',fresh['rectsEqual'] and fresh['textEqual'] and fresh['sheetRestored'])
fi=read(OUT/'fresh-isolation.json')['metrics']
check('fresh eleven actual DOM and isolation checks pass',len(fi['checks'])==11 and all(x['pass'] for x in fi['checks']) and fi['pass'])

ROIS={'name':(135,115,280,158),'nameLabel':(35,115,115,157),'smartLabel':(75,190,330,230)}
CARET=(268,115,280,158)
raw={};srgb={};profiles={};forms={}
srgb_profile=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB'))
for name,rel in [('ref-all29','docs/verification/mac-name-focus-runtime29/03-original-default-selected.cua-image'),('ref-all31','docs/research/mac-ordinary-original31/01-name-click-select-all.cua-image'),('ref-caret31','docs/research/mac-ordinary-original31/02-name-caret-end.cua-image')]:
    im=Image.open(ROOT/rel);b=im.info['icc_profile'];raw[name]=im.convert('RGB')
    srgb[name]=ImageCms.profileToProfile(im,ImageCms.ImageCmsProfile(BytesIO(b)),srgb_profile,outputMode='RGB')
    profiles[name]={'source':rel,'format':im.format,'size':im.size,'iccSha256':hashlib.sha256(b).hexdigest()}
    check(name+' raw decoded directly matches sealed derived',raw[name].tobytes()==Image.open(AUTHOR/(name+'-raw.png')).convert('RGB').tobytes())
    check(name+' independently ICC-converted source matches sealed sRGB',srgb[name].tobytes()==Image.open(AUTHOR/(name+'-srgb.png')).convert('RGB').tobytes())
for name in runs+fresh_names[:2]:
    base=AUTHOR if name in runs else OUT
    j=read(base/(name+'.json'));im=Image.open(base/(name+'.png'));r=j['metrics']['panel']
    rect=tuple(round(v*2) for v in [r[0],r[1],r[0]+r[2],r[1]+r[3]])
    raw[name]=im.convert('RGB').crop(rect);srgb[name]=raw[name];forms[name]=raw[name]
    check(name+' declared sRGB and native800x414 crop',im.info.get('srgb')==0 and raw[name].size==(800,414))
    if name in runs:check(name+' direct crop equals author form pixels',raw[name].tobytes()==Image.open(AUTHOR/(name+'-form.png')).convert('RGB').tobytes())
    else:raw[name].save(OUT/(name+'-form.png'),icc_profile=srgb_profile.tobytes())

def points(roi,exclude=None):
    return [(x,y) for y in range(roi[1],roi[3]) for x in range(roi[0],roi[2]) if not(exclude and exclude[0]<=x<exclude[2] and exclude[1]<=y<exclude[3])]
def coverage(image,roi,t):
    coords=[xy for xy in points(roi) if all(v<t for v in image.getpixel(xy))]
    return {'pixels':len(coords),'bbox':[min(x for x,y in coords),min(y for x,y in coords),max(x for x,y in coords)+1,max(y for x,y in coords)+1] if coords else None}
measures={}
author_measure=read(AUTHOR/'measurements.json')
for name in raw:
    measures[name]={space:{key:{str(t):coverage(image,roi,t) for t in [100,160,200]} for key,roi in ROIS.items()} for space,image in [('raw',raw[name]),('srgb',srgb[name])]}
    if name in author_measure['measurements']:check(name+' all raw/sRGB ROI thresholds and bbox reproduced',measures[name]==author_measure['measurements'][name])
native=['baseline-native','probe-color-native','probe-smoothing-native','probe-rendering-native','candidate-native']
selected=['baseline-selected','probe-selection-selected','probe-smoothing-selected','candidate-selected']
errors={}
for names,reference in [(native,'ref-caret31'),(selected,'ref-all31')]:
    for key,roi in ROIS.items():
        exclude=CARET if names is native and key=='name' else None
        sample=points(roi,exclude)
        union=[xy for xy in sample if any(max(srgb[n].getpixel(xy))<200 for n in [reference]+names)]
        for name in names:
            def error(pts):return sum(sum(abs(a-b) for a,b in zip(srgb[name].getpixel(xy),srgb[reference].getpixel(xy))) for xy in pts)/(len(pts)*3)
            record={'reference':reference,'roi':list(roi),'commonCaretExcluded':list(exclude) if exclude else None,'sameSamplePixels':len(sample),'fullRoiMeanAbsChannelErrorSrgb':error(sample),'commonGlyphUnionPixels':len(union),'commonGlyphUnionMeanAbsChannelErrorSrgb':error(union),'maskDisagreementRaw':{str(t):sum((max(raw[name].getpixel(xy))<t)!=(max(raw[reference].getpixel(xy))<t) for xy in sample) for t in [100,160,200]}}
            errors.setdefault(name,{})[key]=record
            check(name+' '+key+' paired ROI errors and mask differences reproduced',record==author_measure['errorsVsPairedOriginal'][name][key])

pixel_comparisons={}
for a,b in [('baseline-native','fresh-baseline-native-attempt02'),('candidate-native','fresh-candidate-native'),('probe-rendering-native','baseline-native'),('probe-smoothing-native','candidate-native'),('probe-smoothing-selected','candidate-selected')]:
    changed=sum(x!=y for x,y in zip(raw[a].getdata(),raw[b].getdata()));pixel_comparisons[a+' vs '+b]={'changedPixels':changed,'size':raw[a].size}
    check(a+' versus '+b+' whole form RGB exact',changed==0)
checkbox=(38,192,76,230)
for a,b in [('baseline-native','candidate-native'),('fresh-baseline-native-attempt02','fresh-candidate-native')]:
    changed=sum(raw[a].getpixel(xy)!=raw[b].getpixel(xy) for xy in points(checkbox));pixel_comparisons[a+' checkbox '+b]={'roi':checkbox,'changedPixels':changed}
    check(a+' versus '+b+' checkbox RGB exact',changed==0)
check('original31 and29 whole images differ',raw['ref-all29'].tobytes()!=raw['ref-all31'].tobytes())
check('original31 and29 three glyph ROIs exact',all(raw['ref-all29'].crop(roi).tobytes()==raw['ref-all31'].crop(roi).tobytes() for roi in ROIS.values()))
result={'scope':'Independent source and finite offscreen production WK evidence review; not active packaged Mac13 or full pixel acceptance','commit':head,'checks':CHECKS,'checkCount':len(CHECKS),'passed':sum(x['pass'] for x in CHECKS),'failed':[x for x in CHECKS if not x['pass']],'indexCounts':index_counts,'productBaselineChanges':product_delta,'initial315CurrentDifferences':all_delta,'fixtureCssIdentity':fixture_setup,'freshInteractionChecks':fi['checks'],'profiles':profiles,'roiMeasurements':measures,'pairedErrors':errors,'pixelComparisons':pixel_comparisons,'limits':['Selected captures remap focus declarations into diagnostic class; not actual active-window focus.','Natural candidates compared with JPEG/ICC original; no glyph font identity or exact equality claim.','Original gold caret exclusion is identical across natural candidates; no alignment or resizing.','Fixture cancellation increments callback without unmounting; input and Escape events are scripted DOM operations.','First restricted helper launch failed; preserved separately; three narrow-authorized launches succeeded.','Source stage only; accurate new package and Computer Use remain pending.']}
(OUT/'verification-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
(OUT/'source.patch').write_text(expected_patch)
(OUT/'git-identity.json').write_text(json.dumps({'commit':head,'parent':git('rev-parse',COMMIT+'^').decode().strip(),'productCommitDiff':committed_delta,'note':'Only read-only Git queries; unrelated root32/33 documentation excluded from product delta.'},indent=2)+'\n')
print(json.dumps({'checks':len(CHECKS),'passed':result['passed'],'failed':result['failed'],'freshInteractionChecks':len(fi['checks']),'pixelComparisons':pixel_comparisons},ensure_ascii=False,indent=2))
