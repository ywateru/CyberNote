from pathlib import Path
import hashlib,json,os,shutil,subprocess,time
ROOT=Path('/Users/water/work/2026/Apple-Notes-Clone')
OUT=Path(__file__).resolve().parent
AUTHOR=ROOT/'docs/verification/app-smart-d2-name-boundary-fix09'
OLD=ROOT/'docs/verification/app-smart-d2-durable-rules09-independent'
H=OUT/'harness'
assert not H.exists(), 'Keep earlier evidence'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
identity=json.loads((AUTHOR/'source-identity.json').read_text())
expected=identity['allStoreSessionLibInputs']
def sources():return {p:sha(ROOT/p) for p in expected}
assert sources()==expected
for p,h in expected.items():assert hashlib.sha256(subprocess.check_output(['git','show','9bdc441:'+p],cwd=ROOT)).hexdigest()==h,p
old_identity=json.loads((ROOT/'docs/verification/app-smart-d2-durable-rules09/source-identity.json').read_text())['files']
for p,h in old_identity.items():
    if p!='src-tauri/src/store.rs':assert sha(ROOT/p)==h,p
oldfiles=['oversized.rs','run04.txt','run04-result.json']
oldhash={p:sha(OLD/p) for p in oldfiles}
assert shutil.disk_usage(ROOT).free>=2*1024**3
(H/'src').mkdir(parents=True)
for name in ['Cargo.toml','Cargo.lock']:shutil.copyfile(AUTHOR/'harness'/name,H/name)
for name in ['store.rs','store','session.rs','session']:
    source=ROOT/'src-tauri/src'/name
    (H/'src'/name).symlink_to(source,target_is_directory=source.is_dir())
(H/'src/fixed_original.rs').symlink_to(OUT/'fixed_original.rs')
(H/'src/main.rs').write_text('mod store;\nmod session;\n#[cfg(test)] mod fixed_original;\nfn main() {}\n')
(OUT/'docs').symlink_to(ROOT/'docs',target_is_directory=True)
record={'reviewedSourceCommit':'9bdc441f7791a53de99baba58e6d0244d5849f6c','currentHead':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'authorHashesMatched':True,'unchangedD2HashesMatchedExceptStore':True,'sourceBefore':expected,'oldFailureEvidenceBefore':oldhash,'probeSha256':sha(OUT/'fixed_original.rs'),'freeBefore':shutil.disk_usage(ROOT).free,'jobs':2,'offline':True}
(OUT/'inputs.json').write_text(json.dumps(record,indent=2)+'\n')
argv=['cargo','test','--locked','--offline','--features','rusqlite/hooks','--manifest-path',str(H/'Cargo.toml'),'folder_name','--','--nocapture']
env=dict(os.environ,CARGO_NET_OFFLINE='true',CARGO_BUILD_JOBS='2',CARGO_TARGET_DIR=str(ROOT/'src-tauri/target'))
start=time.monotonic()
with (OUT/'run01.txt').open('xb') as f:p=subprocess.run(argv,cwd=ROOT,env=env,stdout=f,stderr=subprocess.STDOUT,timeout=600)
record.update(argv=argv,exitCode=p.returncode,seconds=round(time.monotonic()-start,3),sourceAfter=sources(),sourceUnchanged=sources()==expected,oldFailureEvidenceAfter={p:sha(OLD/p) for p in oldfiles},freeAfter=shutil.disk_usage(ROOT).free)
record['oldFailureEvidenceUnchanged']=record['oldFailureEvidenceBefore']==record['oldFailureEvidenceAfter']
(OUT/'result.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({k:record[k] for k in ['exitCode','seconds','sourceUnchanged','oldFailureEvidenceUnchanged','freeAfter']}))
assert p.returncode==0
assert record['sourceUnchanged'] and record['oldFailureEvidenceUnchanged']
