#!/usr/bin/env python3
"""Compile exact production widthFor/layout over retained recording ports; no real window."""
import ast,hashlib,json,shutil,subprocess
from pathlib import Path
R=Path.cwd();O=Path(__file__).resolve().parent;S=R/'plugins/tauri-plugin-notes-ui/macos/toolbar.m'
def guard():
 if shutil.disk_usage(R).free<2*1024**3: raise RuntimeError('Less than2GiB')
def dump(p,x): p.write_text(json.dumps(x,indent=2)+'\n')
ports={}
for n in ast.parse((R/'scripts/check-wide-toolbar-geometry.py').read_text()).body:
 if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in ('PREFIX','SUFFIX') for t in n.targets):ports[n.targets[0].id]=ast.literal_eval(n.value)
prefix=ports['PREFIX'].replace('@property GeometryView *root;','@property GeometryView *root;\n@property GeometryView *sidebarBackground;')
suffix=ports['SUFFIX'].replace('@"groups":c.recorded','@"groups":[c.recorded copy]')
suffix=suffix.replace('for(NSDictionary *item in cases) {','NSMutableDictionary *retained=[NSMutableDictionary dictionary];\n    for(NSDictionary *item in cases) {')
suffix=suffix.replace('GeometryController *c=[GeometryController new];','GeometryController *c=retained[item[@"chain"]];\n if(!c){c=[GeometryController new];retained[item[@"chain"]]=c;')
suffix=suffix.replace('NSMutableDictionary *state=','c.sidebarBackground=[GeometryView new];}\n ((GeometryView *)c.window.contentView).bounds=NSMakeRect(0,0,[item[@"width"] doubleValue],900);\n c.window.styleMask=[item[@"fullSize"] boolValue]?NSWindowStyleMaskFullSizeContentView:0;\n [c.recorded removeAllObjects];\n NSMutableDictionary *state=')
suffix=suffix.replace('@"name":item[@"name"],','@"name":item[@"name"],@"backgroundHidden":@(c.sidebarBackground.hidden),')
actions=['newNote','format','checklist','table','attachment','share','more'];cases=[]
for layout in ['threeColumn','galleryBrowse','galleryExpanded']:
 for width in [700,1088,1394]:
  for side in [160,208,228,273,181.999,182]:
   for full in [True,False]:
    chain=f'{layout}-{width}-{side}-{full}'
    allowed=['newFolder','toggleSidebar']+(['viewOptions','newNote'] if layout=='galleryBrowse' else (['backToGallery'] if layout=='galleryExpanded' else ['viewOptions'])+actions)
    for phase,visible in [('visible',True),('hidden',False),('restored',True)]:cases.append(dict(name=chain+'-'+phase,chain=chain,phase=phase,layout=layout,width=width,sidebarWidth=side,sidebarVisible=visible,listWidth=280,actions=allowed,search='present',fullSize=full))
for width in [700,1088,1394]:
 for full in [True,False]:
  chain=f'independent-{width}-{full}'
  for phase in ['visible','hidden','restored']:cases.append(dict(name=chain+'-'+phase,chain=chain,phase=phase,layout='independentNote',width=width,sidebarWidth=228,sidebarVisible=False,listWidth=280,actions=actions,search='present',fullSize=full))
dump(O/'geometry-cases.json',cases);out=O/'geometry02';guard();out.mkdir(exist_ok=False);results={}
try:
 for kind,p in [('baseline',O/'baseline-toolbar.m'),('candidate',S)]:
  text=p.read_text();start=text.index('- (CGFloat)widthFor:');methods=text[start:text.index('- (NSDictionary *)information',start)]
  source=out/f'{kind}.m';source.write_text(prefix+methods+suffix);binary=out/kind
  argv=['xcrun','clang','-fobjc-arc','-fblocks','-mmacosx-version-min=12.0','-Wall','-Wextra','-Werror','-framework','AppKit',str(source),'-o',str(binary)]
  guard();r=subprocess.run(argv,cwd=R,text=True,capture_output=True);dump(out/f'{kind}-compile.json',dict(command=argv,exitCode=r.returncode,stdout=r.stdout,stderr=r.stderr,productionMethodSha256=hashlib.sha256(methods.encode()).hexdigest()));assert r.returncode==0
  r=subprocess.run([str(binary)],input=json.dumps(cases),text=True,capture_output=True);dump(out/f'{kind}-run.json',dict(exitCode=r.returncode,stdout=r.stdout,stderr=r.stderr));assert r.returncode==0;results[kind]=json.loads(r.stdout)
 before={};checks=[];oldMismatch=0;existingOverlaps=[]
 for config,old,new in zip(cases,results['baseline'],results['candidate']):
  name=config['name'];groups=new['groups'];side=config['sidebarWidth'];traffic=94 if config['fullSize'] else 12
  oldComparable={k:v for k,v in old.items() if k!='backgroundHidden'};newComparable={k:v for k,v in new.items() if k!='backgroundHidden'}
  if config['layout']=='independentNote':assert oldComparable==newComparable and not new['visibility']['sidebar'],name
  else:
   g=groups['sidebar'];x,y,width,height=g['frame'];aa=g['actions'];item=width/len(aa)
   assert aa.count('toggleSidebar')==1 and 'toggleSidebar' not in new['overflow'] and new['visibility']['sidebar'],name
   assert height==36 and x>=traffic,name
   assert new['backgroundHidden']==config['sidebarVisible'],name
   if not config['sidebarVisible']:
    assert oldComparable==newComparable and aa==['toggleSidebar'] and item==36 and x==traffic,name
   else:
    assert item==44 and x+width==side,name
    assert ('newFolder' in aa)==(traffic+88<=side),name
    assert ('newFolder' in new['overflow'])==(traffic+88>side),name
    if side>=208:
     assert aa==['newFolder','toggleSidebar'],name
     assert old['groups']['sidebar']['frame']!=g['frame'],name
     oldMismatch+=1
   spans=sorted((v['frame'][0],v['frame'][0]+v['frame'][2],k) for k,v in groups.items() if new['visibility'][k])
   assert all(0<=lo<=hi<=config['width'] for lo,hi,k in spans),name
   for left,right in zip(spans,spans[1:]):assert left[1]<=right[0]+1e-9,(name,left,right)
   if not new['titleHidden']:
    tx,ty,tw,th=new['titleFrame']
    for lo,hi,k in spans:
     if not (tx+tw<=lo+1e-9 or tx>=hi-1e-9):
      assert k!='sidebar' and old['titleFrame']==new['titleFrame'] and old['groups'][k]==groups[k],(name,'new title overlap',k)
      existingOverlaps.append(dict(name=name,group=k,titleFrame=new['titleFrame'],groupFrame=groups[k]['frame'],baselineIdentical=True))
   if 'back' in groups:assert groups['back']['frame'][0]>=x+width+8,name
   # For the requested160/208/228/273 inputs onlysidebar frames/background change.
   if side in [160,208,228,273]:
    ao={**oldComparable,'groups':{k:v for k,v in old['groups'].items() if k!='sidebar'}};an={**newComparable,'groups':{k:v for k,v in groups.items() if k!='sidebar'}}
    assert ao==an,(name,'other group/label/overflow changed')
  if config['phase']=='visible':before[config['chain']]=new
  if config['phase']=='restored':assert new=={**before[config['chain']],'name':name},(name,'restore')
  checks.append(name)
 dump(out/'result.json',dict(status='pass',states=len(cases),chains=len(before),oldVisibleGeometryMismatches=oldMismatch,existingUnchangedTitleOverlaps=existingOverlaps,checks=checks,baseline=results['baseline'],candidate=results['candidate'],limits=['Exact production widthFor/layout, recording placeGroup sink, no actual windows or controls.','AppKit host/actual placeGroup is separate check; no runtime or pixel acceptance.']))
 print(f'PASS {len(cases)} production states / {len(before)} retained hide-restore chains; {oldMismatch} old visible geometry mismatches demonstrated')
except BaseException as e:dump(out/'failure.json',dict(error=repr(e),results=results));raise
