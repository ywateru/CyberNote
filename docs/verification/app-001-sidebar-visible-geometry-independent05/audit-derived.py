from pathlib import Path
import json,hashlib,subprocess,shutil
R=Path.cwd();O=R/'docs/verification/app-001-sidebar-visible-geometry-independent05';A=R/'docs/verification/app-001-sidebar-visible-geometry05';F=O/'fixture';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
m=json.loads((A/'manifest.json').read_text());entries=m['files']
for x in entries:
 p=A/x['path'];assert p.stat().st_size==x['bytes'] and sha(p)==x['sha256']
assert len(entries)==112
assert set(x['path'] for x in entries)==set(str(p.relative_to(A)) for p in A.rglob('*') if p.is_file() and p.name!='manifest.json')
lines=''.join(f"{x['sha256']}  {x['path']}\n" for x in sorted(entries,key=lambda x:x['path']))
assert hashlib.sha256(lines.encode()).hexdigest()==m['aggregate']=='5827841625f3780b8c9614dc2b408bb7d688f45490c81ecfb1e9abd2c1cfe451'
assert sha(A/'manifest.json')=='f31514eaada49102711113e817995ff91e7321aeb9fb9029c4deec92e604567e'
(O/'author-manifest-audit.json').write_text(json.dumps(dict(status='pass',manifestSha256=sha(A/'manifest.json'),fileCount=len(entries),aggregate=m['aggregate'],formula='sorted sha256 TWO_SPACES relativePath NEWLINE',sourceSha256=m['sourceSha256']),indent=2)+'\n')
cases=json.loads((O/'geometry-cases.json').read_text());g=json.loads((O/'geometry03/result.json').read_text());ap={}
assert len(cases)==len(g['baseline'])==len(g['candidate'])==390
for kind in ['baseline','candidate','candidate-fallback']:
 run=json.loads((O/f'appkit07/{kind}-run.json').read_text());d=json.loads(run['stdout']);assert d['states']==len(d['results'])==390 and d['chains']==120 and not d['createdNSWindow'];ap[kind]=d
 for cp,ax in zip(g['baseline' if kind=='baseline' else 'candidate'],d['results']):
  assert cp['name']==ax['name']
  for key in ['groups','overflow','titleFrame','countFrame','titleHidden','searchFieldFrame']:assert cp[key]==ax[key]
source=(F/'plugins/tauri-plugin-notes-ui/macos/toolbar.m').read_text();main=(O/'appkit-main.m').read_text()
for kind in ap:
 generated=(O/f'appkit07/{kind}.m').read_text();expected=(O/'baseline-toolbar.m').read_text() if kind=='baseline' else source
 assert generated.endswith(expected+'\n'+main)
classes={k:sorted({s['backgroundClass'] for s in d['results']}) for k,d in ap.items()}
assert classes['candidate']==['NSGlassEffectView'] and classes['candidate-fallback']==['NSVisualEffectView']
newhits=sum(len(s['hits']) for s in ap['candidate']['results'])
for kind in ['candidate','candidate-fallback']:assert all(h['rootHitsButton'] and h['localButtonHit'] for s in ap[kind]['results'] for h in s['hits'].values())
ov=g['existingUnchangedTitleOverlaps'];assert len(ov)==4 and all('threeColumn-700-273-' in o['name'] and o['baselineIdentical'] for o in ov)
for o in ov:
 tx,ty,tw,th=o['titleFrame'];gx,gy,gw,gh=o['groupFrame'];assert min(tx+tw,gx+gw)-max(tx,gx)==6
assert '[self.groups.allValues arrayByAddingObject:self.sidebarBackground]' in source
assert 'if([name isEqual:@"sidebar"])self.sidebarBackground.frame=self.contents[name].bounds;' in source
assert 'contentTintColor=![action isEqual:@"toggleSidebar"]' in source
(O/'independent-output-audit.json').write_text(json.dumps(dict(status='pass',states=390,chains=120,appkitBinaries=3,backgroundClasses=classes,candidateHitObservations=newhits,allCandidateAndFallbackCenterHitsPass=True,exactProductionSourceEmbedding=True,knownBaselineTitleOverlaps=ov,limits=['No actual NSWindow/GUI/event/field-editor/IME/runtime-package/pixel acceptance.','Fallback Class resolver forces production old branch on current macOS, not execution on old OS.']),indent=2)+'\n')
opened=json.loads((O/'identity-open.json').read_text());inputs=opened['inputs']+json.loads((O/'supplement-inputs.json').read_text())
for x in inputs:
 p=R/x['path'];f=F/x['path'];assert sha(p)==sha(f)==x['sha256'] and p.stat().st_size==f.stat().st_size==x['bytes']
assert (F/'node_modules').is_symlink();(F/'node_modules').unlink()
(O/'identity-close.json').write_text(json.dumps(dict(status='pass',head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),frozenAndSharedInputsVerified=len(inputs),allInputsEqual=True,free=shutil.disk_usage(R).free,nodeModulesSymlinkRemoved=True,authorManifestSha256=sha(A/'manifest.json')),indent=2)+'\n')
print(json.dumps(dict(status='pass',authorFiles=len(entries),frozenAndSharedInputs=len(inputs),classes=classes,candidateHitObservations=newhits,knownOverlapStates=len(ov)),indent=2))
