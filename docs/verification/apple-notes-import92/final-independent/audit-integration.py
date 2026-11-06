"""Read-only evidence audit of final synthetic App/real Store integration."""
from pathlib import Path
import json,hashlib,subprocess,base64,re,time
ROOT=Path('/Users/water/work/2026/Apple-Notes-Clone');OUT=Path(__file__).resolve().parent
E=ROOT/'docs/verification/apple-notes-import92/final-integration';EXEC=Path('/private/tmp/apple-notes-import92-final-dom01')
load=lambda p:json.loads(p.read_text());sha=lambda b:hashlib.sha256(b).hexdigest();start=time.monotonic()
s=load(E/'source-inventory.json');checks=load(E/'checks.json');d=load(E/'app-dom-result.json');b=load(E/'lean-build.json')
assert s['sourceHead']==checks['sourceHead']==b['sourceHead']=='7a602ccaefe34aa357b8fc6cd384f9d51d35a30e'
paths=set(subprocess.check_output(['git','ls-files','-z','--','src','src-tauri','plugins','scripts','assets','package.json','pnpm-lock.yaml','tsconfig.json','vite.config.ts'],cwd=ROOT).decode().strip('\0').split('\0'))
assert set(s['files'])==paths and len(paths)==s['fileCount']==505 and s['allMatchGitBlob']
for path,row in s['files'].items():
 raw=(ROOT/path).read_bytes();assert len(raw)==row['bytes'] and sha(raw)==row['sha256']
 assert raw==subprocess.check_output(['git','show',s['sourceHead']+':'+path],cwd=ROOT)
assert all(c['exitCode']==0 for c in checks['commands'])
assert d==load(EXEC/'result.json') and d['passed'] and len(d['checks'])==20
assert d['checks']==[x[5:] for x in (E/'app-dom.stdout.txt').read_text().splitlines() if x.startswith('PASS ')]
assert sha((EXEC/'import-core-transport').read_bytes())==b['binary']['sha256']=='75abd375fad6277cae5453d50b48fb9bd52b9018410da0a538ba05e3ba6abb3b'
assert (E/'app-dom.stderr.txt').read_bytes()==b''
rust=(E/'affected-rust.stdout.txt').read_text();assert '28 passed; 0 failed; 1 ignored' in rust
src=(ROOT/'scripts/debug/mobile-attachments.mjs').read_text();m=re.search(r'export const tinyPNG = Buffer.from\(\s*["\']([^"\']+)["\'],\s*["\']base64',src);assert m
png=(EXEC/'original.png').read_bytes();assert png==base64.b64decode(m[1])
a=load(EXEC/'complete.notesbackup');assert len(a['notes'])==3 and len(a['attachments'])==5 and len(a['blobs'])==5
assert set(a['blobs'])=={x['id'] for x in a['attachments']}
assert all(x['noteId'] in {n['id'] for n in a['notes']} for x in a['attachments'])
raws=[x for x in a['attachments'] if x['mime']=='application/vnd.local-notes.apple-import+json'];assert len(raws)==2
assert all('<' in json.loads(base64.b64decode(a['blobs'][x['id']]))['snapshot']['html'] for x in raws)
for path in ['preview.png','complete.png','preview-panel.png','complete-panel.png','complete.html']:
 assert (E/('app-dom-'+path)).read_bytes()==(EXEC/path).read_bytes()
# Existing final runner awaits cleanup; backend close fails on force/nonzero and
# browser close fails on non-natural exit. No more detailed per-child exit log
# is reconstructed from the outer result.
run=(ROOT/'scripts/debug/apple-notes-import92.mjs').read_text();assert 'await rt.cleanup({ keep: true })' in run and 'failure ||= e' in run
rt=(ROOT/'scripts/debug/runtime.mjs').read_text();assert 'Owned browser process did not close naturally' in rt
back=(ROOT/'scripts/debug/rust-backend.mjs').read_text();assert 'if (failure || forced || info.code !== 0)' in back
prod=load(Path('/private/tmp/apple-notes-import92-final-exclusion/summary.json'));assert prod['result']['productionAPIAbsent'] and prod['result']['urlCannotEnable'] and not prod['result']['bundle']['matches'] and not prod['pageErrors']
result={'status':'PASS-READONLY-FINAL-APP-INTEGRATION-EVIDENCE','sourceHead':s['sourceHead'],'broadTrackedInputs':len(paths),'allCurrentGitBytesEqual':True,'immutableExecutedBinary':b['binary'],'authorChecks':checks['commands'],'appChecks':d['checks'],'actualBackupNotes':3,'actualBackupManagedFiles':5,'actualBackupRawRecords':2,'PNGOriginalBytes':len(png),'exportedPNGOriginalSHA256':sha(png),'sourceFixtureOnly':True,'cleanupScope':'Outer natural0 plus awaited cleanup implementation rejects forced/nonzero backend/browser; no invented separate PID-exit receipts','productionExclusion':prod['result'],'wallSeconds':time.monotonic()-start,'limits':['Independent read-only evidence/source/known synthetic files audit; no duplicated App/Rust run, Notes, devices or private source snapshot read','Data inventory assertion is UI content smoke, not exact size-total proof','Author tests use synthetic OS Source; real02 and offline retained-snapshot review separate','Mac package entitlements/TCC/native launch not covered']}
(OUT/'integration-result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'status':result['status'],'broadTrackedInputs':len(paths),'appChecks':len(d['checks']),'wallSeconds':result['wallSeconds']}))
