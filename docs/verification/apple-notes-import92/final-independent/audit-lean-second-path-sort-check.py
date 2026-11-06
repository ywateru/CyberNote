"""Read-only final immutable APP92 source/dependency/binary audit, no cargo/runtime."""
import pathlib,subprocess,json,hashlib,stat,time
ROOT=pathlib.Path('/Users/water/work/2026/Apple-Notes-Clone')
BASE=pathlib.Path('/private/tmp/apple-notes-import92-final-lean-immutable01')
OUT=pathlib.Path(__file__).resolve().parent
start=time.monotonic()
load=lambda p:json.loads(p.read_text())
sha=lambda b:hashlib.sha256(b).hexdigest()
b=load(BASE/'build.json');old=load(BASE/'original-build.json');original=load(pathlib.Path('/private/tmp/apple-notes-import92-final-lean01/build.json'))
assert b['sourceHead']=='7a602ccaefe34aa357b8fc6cd384f9d51d35a30e'
assert b['sourcesUnchanged'] and b['sources']==old['sources']==original['sources']
assert {k:v for k,v in b.items() if k!='binary'}=={k:v for k,v in original.items() if k!='binary'}
expected={'src-tauri/src/'+n for n in ['store.rs','session.rs','sync.rs','recording_window.rs','apple_notes_source.js']}
for d in ['store','session','sync','apple_notes_import']:
 for p in (ROOT/'src-tauri/src'/d).rglob('*'):
  if p.is_file(): expected.add(str(p.relative_to(ROOT)))
expected.update('scripts/debug/rust/'+n for n in ['Cargo.toml','Cargo.lock','transport.rs','apple_import.rs'])
expected.add('scripts/debug/build-rust-attachments.mjs')
assert expected==set(b['sources']) and len(expected)==55
for p,h in b['sources'].items():
 raw=(ROOT/p).read_bytes();assert sha(raw)==h,p
 assert subprocess.check_output(['git','show',b['sourceHead']+':'+p],cwd=ROOT)==raw,p
assert b['sources']['src-tauri/src/apple_notes_source.js']=='6d05ee7ec69b0ac5509cfdb29fc335ae6e7c005415bbb6fe83eb715ab274843d'
assert b['sources']['src-tauri/src/store/apple_import/html.rs']==sha(subprocess.check_output(['git','show','6febd39f:src-tauri/src/store/apple_import/html.rs'],cwd=ROOT))
for c in b['commands']:assert c['exitCode']==0 and c['signal'] is None and '--locked' in c['command'] and '--offline' in c['command']
exe=pathlib.Path(b['binary']['path']);before=exe.stat();data=exe.read_bytes()
assert not exe.is_symlink() and stat.S_IMODE(before.st_mode)==0o555
assert len(data)==b['binary']['size']==27899808 and sha(data)==b['binary']['sha256']=='75abd375fad6277cae5453d50b48fb9bd52b9018410da0a538ba05e3ba6abb3b'
literal_present=data.count((ROOT/'src-tauri/src/apple_notes_source.js').read_bytes())>=1
# Saved metadata is inspected directly; no cargo metadata or network invocation.
g=load(pathlib.Path('/private/tmp/apple-notes-import92-final-lean01/dependencies.json'))
assert set(p['id'] for p in g['packages'])==set(p['id'] for p in b['dependencies'])
assert set(p['id'] for p in g['resolve']['nodes'])==set(p['id'] for p in g['packages'])
rows=[]; recorded={p['id']:p for p in b['dependencies']}
for p in g['packages']:
 r=recorded[p['id']]
 for k in ['id','name','version','source']:assert p[k]==r[k]
 if p['source']:
  directory=pathlib.Path(p['manifest_path']).parent
  files=sorted(q for q in directory.rglob('*') if q.is_file() and not q.is_symlink())
  h=hashlib.sha256()
  for f in files:h.update(str(f.relative_to(directory)).encode());h.update(b'\0');h.update(f.read_bytes());h.update(b'\0')
  assert h.hexdigest()==r['sourceSha256'] and len(files)==r['sourceFiles'],p['id']
  side=directory/'.cargo-checksum.json'
  assert (sha(side.read_bytes()) if side.exists() else None)==r['registryChecksumSha256']
  rows.append({'name':p['name'],'version':p['version'],'sourceFiles':len(files),'sourceSha256':h.hexdigest(),'checksumSidecarPresent':side.exists()})
 else:
  assert pathlib.Path(p['manifest_path'])==pathlib.Path(b['harness'])/'Cargo.toml'
  assert pathlib.Path(p['manifest_path']).read_bytes()==(ROOT/'scripts/debug/rust/Cargo.toml').read_bytes()
assert sha(exe.read_bytes())==b['binary']['sha256'] and exe.stat()==before
result={'status':'PASS-READONLY-FROZEN-LEAN-IDENTITY','sourceHead':b['sourceHead'],'sourceInputs':len(expected),'sourceBeforeAfterCurrentGitExact':True,'currentFixedJXA':b['sources']['src-tauri/src/apple_notes_source.js'],'currentSpacingFixExact':True,'binary':b['binary'],'mode':'0555','literalFixedScriptPresent':literal_present,'scriptLiteralScope':'Lean fixture Source does not instantiate SystemSource; absence is not native package evidence','commands':b['commands'],'dependencyPackages':len(g['packages']),'registrySourceDigestsRecomputed':rows,'checksumSidecarsMissing':sum(not x['checksumSidecarPresent'] for x in rows),'wallSeconds':time.monotonic()-start,'limits':['Independent read-only metadata/source/cache/binary audit; no cargo, runtime, Notes, devices or private databases','Missing registry checksum sidecars are explicitly preserved; actual full source digest matched, not a hermetic supply-chain reproducibility proof','DOM and private offline replay acceptance separate']}
(OUT/'lean-result.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='registrySourceDigestsRecomputed'},indent=2))
