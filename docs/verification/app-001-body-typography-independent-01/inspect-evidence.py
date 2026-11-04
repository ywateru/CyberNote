"""Independent assertions on exact CSS bytes and the newly observed computed samples."""
from pathlib import Path
import json,hashlib,subprocess,shutil
ROOT=Path(__file__).resolve().parents[3];OUT=Path(__file__).resolve().parent
CANDIDATE='0d3d52776f92503b356449ae651853565b9c025f';BASE='e44dba736e377ea7abd2969f6c9ea1a5b24b3cc4'
checks=[]
def check(name,ok):
 checks.append({'name':name,'pass':bool(ok)})
 if not ok:raise AssertionError(name)
def load(p):return json.loads(p.read_text())
def ident(p):
 b=p.read_bytes();return {'path':str(p.relative_to(ROOT)),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
css=(ROOT/'src/style.css').read_bytes();before=subprocess.check_output(['git','show',BASE+':src/style.css'],cwd=ROOT)
block=b'''/* Mac ordinary-body size candidate; keep the previous static paragraph advance. */
.desktop.native-toolbar:not(.separate) .note-document .tiptap > p {
  font-size: 13px;
  line-height: 17.22px;
  min-height: 17.22px;
}
'''
check('only exact six-line CSS addition',css.count(block)==1 and css.replace(block,b'',1)==before)
check('CSS exact candidate commit bytes',css==subprocess.check_output(['git','show',CANDIDATE+':src/style.css'],cwd=ROOT))
changed=subprocess.check_output(['git','diff','--name-only',BASE,CANDIDATE,'--','src','src-tauri','plugins','assets','package.json','pnpm-lock.yaml','index.html'],cwd=ROOT,text=True).splitlines()
check('sole product delta is shared CSS',changed==['src/style.css'])
inputs=['src/style.css','scripts/check-body-typography-browser.mjs','src/editor-schema.ts','src/Editor.tsx','src/App.tsx','src/native-toolbar.ts','package.json','pnpm-lock.yaml']
for p in inputs:
 check('current exact candidate '+p,(ROOT/p).read_bytes()==subprocess.check_output(['git','show',CANDIDATE+':'+p],cwd=ROOT))
for p in inputs[2:]:check('unchanged production context '+p,(ROOT/p).read_bytes()==subprocess.check_output(['git','show',BASE+':'+p],cwd=ROOT))
author=ROOT/'docs/verification/app-001-body-typography-01';identity=load(author/'identity.json')
for row in identity['product']+[identity['checkScript']]+identity['evidenceFiles']:
 actual=ident(ROOT/row['path']);check('author frozen identity '+row['path'],actual==row)
agg=hashlib.sha256(''.join(x['sha256']+'  '+x['path']+'\n' for x in sorted(identity['evidenceFiles'],key=lambda x:x['path'])).encode()).hexdigest()
recorded_order_aggregate=hashlib.sha256(''.join(x['sha256']+'  '+x['path']+'\n' for x in identity['evidenceFiles']).encode()).hexdigest()
check('author recorded aggregate reproduces array order',recorded_order_aggregate==identity['evidenceAggregate'])
check('author order label discrepancy identified',agg=='8566c746e4c3ba39f6257bc2280e860972ac46f264683726587f86884e146581' and agg!=identity['evidenceAggregate'])
build=load(author/'frontend-build.json');log=(author/'frontend-build.txt').read_text()
check('existing frontend build succeeds with cleanup and space',build['argv']==['pnpm','build'] and build['exitCode']==0 and build['ownedGroupStopped'] is True and build['remainingOwnedGroupMembers']==[] and build['minimumFreeBytes']>=2*1024**3 and not any(k in build for k in ['error','stopReason','groupCleanupError']))
check('existing build raw TS/Vite result and warning retained','tsc -b && vite build' in log and '✓ built in' in log and 'Some chunks are larger than 500 kB' in log)
command=load(OUT/'render-command.json');check('independent actual run completed with cleanup',command['exitCode']==0 and command['ownedGroupStopped'] is True and command['remainingOwnedGroupMembers']==[] and command['ownDependencyLinkRemoved'] is True and command['minimumFreeBytes']>=2*1024**3 and not any(k in command for k in ['error','stopReason','groupCleanupError']))
check('no node_modules link remains',not (ROOT/'node_modules').exists() and not (ROOT/'node_modules').is_symlink())
run=load(OUT/'render-run01/result.json')
check('new rendering records exact CSS and baseline identity',run['baselineHead']==BASE and run['candidateCssSha256']==ident(ROOT/'src/style.css')['sha256'] and run['baselineCssSha256']==hashlib.sha256(before).hexdigest() and run['errors']==[] and run['external']==[])
observations=[]
for name in ['mac-main','phone','wide-android','independent']:
 x=load(OUT/'render-run01'/f'{name}.json');b=x['before'];a=x['after'];main=name=='mac-main'
 check(name+' document preserved',a['document']==b['document'])
 check(name+' exclusions and ancestors preserved',a['excluded']==b['excluded'] and len(a['excluded'])==12 and a['ancestors']==b['ancestors'])
 check(name+' count5 paragraphs9 marks',len(a['targets'])==5 and len(a['marks'])==9)
 for i,(old,new) in enumerate(zip(b['targets'],a['targets'])):
  check(name+f' paragraph{i} matching scope',new['matches']==main)
  if main:
   check(name+f' paragraph{i}13px/17.22px',new['style']['fontSize']=='13px' and new['style']['lineHeight']==new['style']['minHeight']=='17.22px' and old['style']['fontSize']=='14px')
   check(name+f' paragraph{i} other samples equal',{k:v for k,v in new['style'].items() if k!='fontSize'}=={k:v for k,v in old['style'].items() if k!='fontSize'})
  else:check(name+f' paragraph{i} complete sampled object equal',new==old)
 for i,(old,new) in enumerate(zip(b['marks'],a['marks'])):
  check(name+f' mark{i} sampled preservation',all(new['style'][k]==v for k,v in old['style'].items() if k!='fontSize') and new['style']['fontSize']==('13px' if main else old['style']['fontSize']))
 check(name+' excluded nodes do not match target',all(not n['matches'] for n in a['excluded']))
 if main:check('main width actually smaller',a['firstLineWidth']<b['firstLineWidth'])
 else:check(name+' width unchanged',a['firstLineWidth']==b['firstLineWidth'])
 observations.append({'name':name,'classes':x['classes'],'width':x['width'],'paragraphFontSize':a['targets'][0]['style']['fontSize'],'paragraphLineHeight':a['targets'][0]['style']['lineHeight'],'firstLineWidthBefore':b['firstLineWidth'],'firstLineWidthAfter':a['firstLineWidth'],'excludedTags':[z['tag'] for z in a['excluded']]})
check('CSS stable after independent render',ident(ROOT/'src/style.css')==identity['product'][0])
result={'candidateCommit':CANDIDATE,'baselineCommit':BASE,'decision':'SOURCE-READY for experimental CSS only; native WebKit and Apple comparison remain open','checks':checks,'assertionsPassed':len(checks),'sourceIdentities':[ident(ROOT/p) for p in inputs],'authorIdentity':ident(author/'identity.json'),'authorAggregate':{'recordedArrayOrder':recorded_order_aggregate,'independentlyPathSorted':agg,'metadataIssue':'evidenceAggregateAlgorithm says path sorted, but recorded aggregate follows evidenceFiles array order; all individual files match'},'independentRunResult':ident(OUT/'render-run01/result.json'),'observations':observations,'freeBytesAfter':shutil.disk_usage(ROOT).free,'limits':'Complete shared CSS and real production schema rendered in isolated Chromium samples. Not a React NodeView, native input, persisted row, WebKit/font identity, actual AppKit sample, or Apple pixel acceptance. Inline style fields are sampled, not an exhaustive CSS style enumeration.'}
(OUT/'source-checks.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'decision':result['decision'],'assertionsPassed':len(checks),'observations':observations,'freeBytesAfter':result['freeBytesAfter']},ensure_ascii=False))
