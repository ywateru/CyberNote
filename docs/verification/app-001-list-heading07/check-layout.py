from pathlib import Path
import hashlib,json,shutil,subprocess
r=Path.cwd();o=Path(__file__).resolve().parent;out=o/'layout02';out.mkdir(exist_ok=False)
def dump(p,x):p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
actions=['newFolder','toggleSidebar','viewOptions','newNote','format','checklist','table','attachment','share','more']
cases=[]
def case(chain,phase,**kw):
 c=dict(name=chain+'-'+phase,chain=chain,phase=phase,layout='threeColumn',width=1394,side=228,visible=True,full=True,zero=False,missingSearch=False,actions=actions);c.update(kw);cases.append(c)
for chain,width,side,full in [('wide228',1394,228,True),('compact208',1088,208,True),('narrow160',700,160,True),('nonfull',1088,208,False)]:
 for phase,visible in [('visible',True),('hidden',False),('restored',True)]:case(chain,phase,width=width,side=side,full=full,visible=visible)
for phase,zero,visible in [('ordinary',False,True),('zero',True,True),('zeroHidden',True,False),('zeroRestored',True,True),('ordinaryRestored',False,True)]:case('zero-switch',phase,zero=zero,visible=visible)
for phase,layout,visible in [('three', 'threeColumn',True),('browse','galleryBrowse',False),('expanded','galleryExpanded',False),('independent','independentNote',False),('restored','threeColumn',True)]:
 aa=['newNote','format','checklist','table','attachment','share','more']
 if layout!='independentNote':aa=['newFolder','toggleSidebar']+(['backToGallery'] if layout=='galleryExpanded' else ['viewOptions'])+aa
 case('cross-layout',phase,layout=layout,visible=visible,actions=aa,zero=True)
for layout in ['threeColumn','galleryBrowse','galleryExpanded','independentNote']:case('missing-'+layout,'only',layout=layout,missingSearch=True,zero=True)
dump(out/'cases.json',cases);results={}
try:
 for label,path in [('baseline',o/'baseline-toolbar.m'),('candidate',r/'plugins/tauri-plugin-notes-ui/macos/toolbar.m')]:
  assert shutil.disk_usage(r).free>=2*1024**3
  source=out/(label+'.m');source.write_text(path.read_text()+'\n'+(o/'layout-main.m').read_text());binary=out/label
  argv=['xcrun','clang','-fobjc-arc','-fblocks','-mmacosx-version-min=12.0','-Wall','-Wextra','-Werror','-I',str(r/'plugins/tauri-plugin-notes-ui/macos'),'-framework','AppKit','-framework','QuartzCore',str(source),str(r/'plugins/tauri-plugin-notes-ui/macos/format.m'),'-o',str(binary)]
  p=subprocess.run(argv,text=True,capture_output=True,timeout=60);dump(out/(label+'-compile.json'),dict(argv=argv,exitCode=p.returncode,stdout=p.stdout,stderr=p.stderr));assert p.returncode==0
  p=subprocess.run([str(binary)],input=json.dumps(cases),text=True,capture_output=True,timeout=60);dump(out/(label+'-run.json'),dict(exitCode=p.returncode,stdout=p.stdout,stderr=p.stderr));assert p.returncode==0;results[label]=json.loads(p.stdout)
 checks=[]
 for c,old,new in zip(cases,results['baseline'],results['candidate']):
  stripped=lambda x:{k:v for k,v in x.items() if k not in ('title','count')}
  assert stripped(old)==stripped(new),(c['name'],'changed beyond label frames')
  for key,y in [('title',11),('count',27)]:
   assert [v for i,v in enumerate(new[key]) if i!=1]==[v for i,v in enumerate(old[key]) if i!=1],(c['name'],key,'x/size changed')
   assert new[key][1]==(y if c['layout']=='threeColumn' else old[key][1]),(c['name'],key,'baseline')
   if c['layout']!='threeColumn':assert old[key][1]==(9 if key=='title' else 28)
  if c['layout']=='threeColumn' and c['zero'] and c['visible'] and not c['missingSearch']:assert old['title']==new['title'] and old['count']==new['count'],c['name']
  checks.append(c['name'])
 for label,items in results.items():
  by={x['name']:x for x in items}
  for chain in ['wide228','compact208','narrow160','nonfull']:
   # Retained hidden views keep their last frames; compare visible restoration.
   def restored(x):
    x={k:v for k,v in x.items() if k!='name'}
    for collection in ['groups','buttons']:x[collection]={k:({'hidden':True} if v['hidden'] else v) for k,v in x[collection].items()}
    return x
   assert restored(by[chain+'-visible'])==restored(by[chain+'-restored']),(label,chain,'restore')
 dump(out/'result.json',dict(status='pass',states=len(cases),checks=checks,sourceSha256=hashlib.sha256((r/'plugins/tauri-plugin-notes-ui/macos/toolbar.m').read_bytes()).hexdigest(),limits='Full production controller and actual AppKit controls; stub window, no NSWindow/input/field editor/pixel claim.'))
 print(f'PASS {len(cases)} full production AppKit states; retained objects; all other fields exact; ordinary/zero/hidden/restored/non-three verified')
except BaseException as e:dump(out/'failure.json',dict(error=repr(e)));raise
