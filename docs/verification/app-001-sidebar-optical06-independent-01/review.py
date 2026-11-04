from pathlib import Path
import json,hashlib,subprocess,shutil,copy
ROOT=Path(__file__).resolve().parents[3];OUT=Path(__file__).resolve().parent
AUTHOR=ROOT/'docs/verification/app-001-sidebar-optical06';SRC=ROOT/'plugins/tauri-plugin-notes-ui/macos/toolbar.m'
EXPECTED='99a24b1ec902c16bb32fe9d2a5cc82887aec62424d9c00c690a464dbf66db46b'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def dump(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
assert shutil.disk_usage(OUT).free>=2*1024**3
inputs=[SRC,ROOT/'plugins/tauri-plugin-notes-ui/macos/format.m',ROOT/'plugins/tauri-plugin-notes-ui/macos/format.h',ROOT/'docs/plan/tasks/app-001-sidebar-optical06.md',ROOT/'docs/ui/macos.md',AUTHOR/'manifest.json']
manifest=json.loads((AUTHOR/'manifest.json').read_text());assert sha(SRC)==EXPECTED
assert sha(AUTHOR/'manifest.json')=='af5345cb74156286f93b609f04dc7c38aa91a01b92b67f1e847995be98f5edf9'
for row in manifest['files']:
 p=AUTHOR/row['path'];assert p.stat().st_size==row['bytes'] and sha(p)==row['sha256'],p;inputs.append(p)
assert len(manifest['files'])==152
before={str(p.relative_to(ROOT)):{'sha256':sha(p),'bytes':p.stat().st_size} for p in inputs}
source=SRC.read_text();base=(AUTHOR/'baseline-toolbar.m').read_text()
assert hashlib.sha256(base.encode()).hexdigest()=='0b9604a73df6f2b1756cfd8489fff133a97c2cc3810df67372ec5ab878067da5'
def methods(s):start=s.index('- (CGFloat)widthFor:');return s[start:s.index('- (NSDictionary *)information',start)]
for kind,text in [('baseline',base),('candidate',source)]:
 generated=(AUTHOR/f'geometry04/{kind}.m').read_text();assert generated.count(methods(text))==1
for kind,text in [('baseline',base),('candidate',source),('candidate-fallback',source),('candidate-contrast-policy',source)]:
 generated=(AUTHOR/f'appkit06/{kind}.m').read_text();assert generated.count(text)==1
 compileLog=json.loads((AUTHOR/f'appkit06/{kind}-compile.json').read_text());assert compileLog['exitCode']==0 and compileLog['sourceSha256']==hashlib.sha256(text.encode()).hexdigest()

configs=json.loads((AUTHOR/'geometry-cases.json').read_text())
def runData(path):r=json.loads(path.read_text());assert r['exitCode']==0;return json.loads(r['stdout'])
old=runData(AUTHOR/'geometry04/baseline-run.json');new=runData(AUTHOR/'geometry04/candidate-run.json');assert len(configs)==len(old)==len(new)==401
changed=[];chainStarts={};restored=0
for cfg,a,b in zip(configs,old,new):
 assert cfg['name']==a['name']==b['name']
 target=cfg['layout']=='threeColumn' and cfg['fullSize'] and not cfg['sidebarVisible']
 bb=copy.deepcopy(b)
 if target:
  assert b['groups']['sidebar']=={'frame':[96,8,40,36],'actions':['toggleSidebar']};bb['groups']['sidebar']=a['groups']['sidebar'];changed.append(cfg['name'])
 assert bb==a,(cfg['name'],'unexpected production layout drift')
 assert b['backgroundHidden']==cfg['sidebarVisible']
 if cfg['layout']!='independentNote':
  assert 'toggleSidebar' not in b['overflow'] and b['visibility']['sidebar']
  if cfg['sidebarVisible']:
   g=b['groups']['sidebar'];assert g['frame'][0]+g['frame'][2]==cfg['sidebarWidth'];assert g['frame'][2]/len(g['actions'])==44
   assert ('newFolder' in b['overflow'])==((94 if cfg['fullSize'] else 12)+88>cfg['sidebarWidth'])
 if cfg['phase']=='visible':chainStarts[cfg['chain']]=b
 if cfg['phase']=='restored':assert {**b,'name':chainStarts[cfg['chain']]['name']}==chainStarts[cfg['chain']];restored+=1
assert len(changed)==21 and restored==len(chainStarts)==122
actualSummary=[]
for kind,want in [('baseline',old),('candidate',new),('candidate-fallback',new),('candidate-contrast-policy',new)]:
 actual=runData(AUTHOR/f'appkit06/{kind}-run.json');assert actual['states']==401 and actual['chains']==122 and actual['createdNSWindow'] is False
 assert len(actual['results'])==401
 for cfg,w,r in zip(configs,want,actual['results']):
  for field in ['name','groups','overflow','titleFrame','countFrame','titleHidden','searchFieldFrame']:assert r[field]==w[field],(kind,cfg['name'],field)
  assert r['rootFrame']==[0,848,cfg['width'],52]
  if kind!='baseline':assert all(hit['localButtonHit'] and hit['rootHitsButton'] for hit in r['hits'].values())
 actualSummary.append({'kind':kind,'states':401,'chains':122})
dump(OUT/'preserved-matrix-review.json',{'status':'pass','authorManifestFilesUnchanged':152,'geometryStates':401,'restoredChains':122,'targetGeometryChanges':changed,'exactProductionSourceEmbedded':True,'actualAppKit':actualSummary,'limits':['Preserved results independently recomputed, not a fresh execution of those four401-state binaries.','Fresh independent focused real AppKit execution is separate.']})

# Independent cases, one controller crossing state boundaries; no author case generator.
cases=[]
for layout,visible,full,side,selected,disable in [
 ('threeColumn',True,True,228,'',False),('threeColumn',True,True,208,'',False),('threeColumn',False,True,208,'',False),
 ('galleryExpanded',False,True,208,'',False),('galleryBrowse',False,True,208,'',False),('threeColumn',False,False,208,'',False),
 ('threeColumn',False,True,208,'',False),('threeColumn',True,True,228,'',False),('threeColumn',True,True,181.999,'',False),
 ('threeColumn',True,True,182,'',False),('threeColumn',True,True,228,'newFolder',False),('threeColumn',True,True,228,'newNote',False),
 ('threeColumn',True,True,228,'',True),('threeColumn',False,True,228,'',True),('threeColumn',True,True,228,'',False),
 ('independentNote',False,True,228,'',False),('threeColumn',True,True,228,'',False)]:
 cases.append(dict(layout=layout,visible=visible,full=full,side=side,selected=selected,disable=disable))
dump(OUT/'independent-cases.json',cases)
main=(OUT/'independent-main.m').read_text();summaries=[]
for kind in ['glass','fallback','mutable-contrast']:
 assert shutil.disk_usage(OUT).free>=2*1024**3
 prefix=''
 if kind=='fallback':prefix='#import <AppKit/AppKit.h>\nstatic Class reviewClass(NSString *s){return [s isEqual:@"NSGlassEffectView"]?Nil:NSClassFromString(s);}\n#define NSClassFromString reviewClass\n'
 if kind=='mutable-contrast':prefix='#import <AppKit/AppKit.h>\nstatic BOOL reviewContrast=NO;\n@interface ReviewWorkspace:NSObject\n+ (instancetype)sharedWorkspace;\n@property(readonly) BOOL accessibilityDisplayShouldIncreaseContrast;\n@end\n@implementation ReviewWorkspace\n+ (instancetype)sharedWorkspace {static ReviewWorkspace *v;if(!v)v=[ReviewWorkspace new];return v;}\n- (BOOL)accessibilityDisplayShouldIncreaseContrast{return reviewContrast;}\n@end\n#define NSWorkspace ReviewWorkspace\n#define REVIEW_MUTABLE_CONTRAST 1\n'
 generated=OUT/f'{kind}.m';generated.write_text(prefix+source+'\n'+main);binary=OUT/kind
 args=['xcrun','clang','-fobjc-arc','-fblocks','-mmacosx-version-min=12.0','-Wall','-Wextra','-Werror','-I',str(ROOT/'plugins/tauri-plugin-notes-ui/macos'),'-framework','AppKit','-framework','QuartzCore',str(generated),str(ROOT/'plugins/tauri-plugin-notes-ui/macos/format.m'),'-o',str(binary)]
 proc=subprocess.run(args,cwd=ROOT,text=True,capture_output=True);dump(OUT/f'{kind}-compile.json',{'args':args,'exitCode':proc.returncode,'stdout':proc.stdout,'stderr':proc.stderr,'productionSourceSha256':EXPECTED});assert proc.returncode==0,(kind,'compile')
 proc=subprocess.run([str(binary)],cwd=ROOT,input=json.dumps(cases),capture_output=True,text=True);dump(OUT/f'{kind}-run.json',{'exitCode':proc.returncode,'stdout':proc.stdout,'stderr':proc.stderr});assert proc.returncode==0,(kind,'run')
 data=json.loads(proc.stdout);assert data['states']==17 and data['windows']==0;dump(OUT/f'{kind}-result.json',data);summaries.append({'kind':kind,'states':17,'status':'pass','windows':0,'retainedContrastResolutions':len(data['retainedContrastRoundtrip'])})
for rel,meta in before.items():assert sha(ROOT/rel)==meta['sha256'] and (ROOT/rel).stat().st_size==meta['bytes'],('input drift',rel)
dump(OUT/'input-manifest.json',{'inputs':before,'authorManifestSha256':sha(AUTHOR/'manifest.json'),'authorDeclaredAggregate':manifest['aggregate'],'allInputsUnchanged':True})
dump(OUT/'result.json',{'status':'pass','sourceSha256':EXPECTED,'authorFilesVerified':152,'preservedProductionStates':401,'preservedRestoredChains':122,'preservedAppKitStates':401*4,'freshIndependentAppKit':summaries,'inputFilesRechecked':len(before),'limits':['No real NSWindow, GUI rendering, IME, real field editor, or pixel acceptance.','High contrast appearance requests normalize on current OS; mutable contrast checks the public-property seam, not real settings.','Fallback explicitly masks only NSGlassEffectView class lookup, not execution on old macOS.']})
print(json.dumps({'status':'pass','preservedStates':401,'preservedChains':122,'authorFiles':152,'freshRuns':summaries},indent=2))
