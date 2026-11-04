#!/usr/bin/env python3
import hashlib,json,shutil,subprocess
from pathlib import Path
R=Path.cwd();O=Path(__file__).resolve().parent;out=O/'appkit02';out.mkdir(exist_ok=False)
def dump(p,x):p.write_text(json.dumps(x,indent=2)+'\n')
cases=json.loads((O/'geometry-cases.json').read_text());main=(O/'appkit-main.m').read_text();results={}
try:
 for kind,path,fallback in [('baseline',O/'baseline-toolbar.m',False),('candidate',R/'plugins/tauri-plugin-notes-ui/macos/toolbar.m',False),('candidate-fallback',R/'plugins/tauri-plugin-notes-ui/macos/toolbar.m',True)]:
  if shutil.disk_usage(R).free<2*1024**3:raise RuntimeError('Less than2GiB')
  pre='#define CANDIDATE 1\n' if kind.startswith('candidate') else ''
  if fallback:pre+='#import <AppKit/AppKit.h>\nstatic Class harnessClass(NSString *name){return [name isEqual:@"NSGlassEffectView"]?Nil:NSClassFromString(name);}\n#define NSClassFromString harnessClass\n'
  generated=out/f'{kind}.m';generated.write_text(pre+path.read_text()+'\n'+main);binary=out/kind
  argv=['xcrun','clang','-fobjc-arc','-fblocks','-mmacosx-version-min=12.0','-Wall','-Wextra','-Werror','-I',str(R/'plugins/tauri-plugin-notes-ui/macos'),'-framework','AppKit','-framework','QuartzCore',str(generated),str(R/'plugins/tauri-plugin-notes-ui/macos/format.m'),'-o',str(binary)]
  r=subprocess.run(argv,cwd=R,text=True,capture_output=True);dump(out/f'{kind}-compile.json',dict(command=argv,exitCode=r.returncode,stdout=r.stdout,stderr=r.stderr,sourceSha256=hashlib.sha256(path.read_bytes()).hexdigest()));assert r.returncode==0,(kind,'compile')
  r=subprocess.run([str(binary)],cwd=R,input=json.dumps(cases),text=True,capture_output=True);dump(out/f'{kind}-run.json',dict(exitCode=r.returncode,stdout=r.stdout,stderr=r.stderr));assert r.returncode==0,(kind,'run')
  results[kind]=json.loads(r.stdout)
 geometry=json.loads((O/'geometry02/result.json').read_text());comparisons=[]
 for kind,result in results.items():
  expected=geometry['baseline' if kind=='baseline' else 'candidate']
  for want,actual in zip(expected,result['results']):
   for field in ['name','groups','overflow','titleFrame','countFrame','titleHidden','searchFieldFrame','rootFrame']:assert want[field]==actual[field],(kind,want['name'],field,want[field],actual[field])
  comparisons.append(dict(kind=kind,states=result['states'],chains=result['chains'],backgroundClasses=sorted(set(x['backgroundClass'] for x in result['results']))))
 dump(out/'result.json',dict(status='pass',comparisons=comparisons,limits=['Full production source compiled with real AppKit views/buttons/search/glass and actual placeGroup/layout/apply, under fake NSObject window exposing real contentView/styleMask.','No NSApplication or real NSWindow created; no field editor, real window rendering, user event, device, package or pixel acceptance.','Fallback uses explicit Class resolver seam returning Nil only for NSGlassEffectView; not execution on older macOS.']))
 print('PASS actual AppKit host + retained identities / hit tests / routing / AX / tint / background resize / clear-regular style; 3 binaries matched production recording geometry')
except BaseException as e:dump(out/'failure.json',dict(error=repr(e),completed=list(results)));raise
