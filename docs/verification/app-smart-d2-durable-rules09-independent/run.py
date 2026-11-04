from pathlib import Path
import hashlib,json,os,shutil,subprocess,time
ROOT=Path('/Users/water/work/2026/Apple-Notes-Clone')
OUT=Path(__file__).resolve().parent
AUTHOR=ROOT/'docs/verification/app-smart-d2-durable-rules09'
H=OUT/'harness'
assert not H.exists(), 'Keep every previous attempt'
assert shutil.disk_usage(ROOT).free >= 2*1024**3
identity=json.loads((AUTHOR/'source-identity.json').read_text())
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
for p,h in identity['files'].items():
    assert sha(ROOT/p)==h, p
    assert hashlib.sha256(subprocess.check_output(['git','show','98fc5b8:'+p],cwd=ROOT)).hexdigest()==h,p
sourcepaths=[ROOT/'src-tauri/src/store.rs',ROOT/'src-tauri/src/session.rs',ROOT/'src-tauri/src/lib.rs']
sourcepaths+=sorted((ROOT/'src-tauri/src/store').rglob('*'))+sorted((ROOT/'src-tauri/src/session').rglob('*'))
def sources():return {str(p.relative_to(ROOT)):sha(p) for p in sourcepaths if p.is_file()}
before=sources()
(H/'src').mkdir(parents=True)
for name in ['Cargo.toml','Cargo.lock']:shutil.copyfile(AUTHOR/'harness02'/name,H/name)
for name in ['store.rs','store','session.rs','session']:
    source=ROOT/'src-tauri/src'/name
    (H/'src'/name).symlink_to(source,target_is_directory=source.is_dir())
(H/'src/extra.rs').symlink_to(OUT/'extra.rs')
(H/'src/main.rs').write_text('mod store;\nmod session;\n#[cfg(test)] mod extra;\nfn main() {}\n')
(OUT/'docs').symlink_to(ROOT/'docs',target_is_directory=True)
inputs={'reviewedSourceCommit':'98fc5b8b25ab34c053ca6de9f3b47ea5f0d5775f','currentHead':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'authorTenHashesMatched':True,'sourceBefore':before,'harnessManifest':sha(H/'Cargo.toml'),'harnessLock':sha(H/'Cargo.lock'),'independentProbe':sha(OUT/'extra.rs'),'freeBefore':shutil.disk_usage(ROOT).free}
(OUT/'inputs.json').write_text(json.dumps(inputs,indent=2)+'\n')
records=[]
startAll=time.monotonic()
for i,fil in enumerate(['smart::tests::','session::smart_tests::','extra::'],1):
    assert time.monotonic()-startAll < 600
    assert shutil.disk_usage(ROOT).free >= 2*1024**3
    argv=['cargo','test','--locked','--offline','--features','rusqlite/hooks','--manifest-path',str(H/'Cargo.toml'),fil,'--','--nocapture']
    log=OUT/f'run{i:02d}.txt'; start=time.monotonic()
    env=dict(os.environ,CARGO_NET_OFFLINE='true',CARGO_BUILD_JOBS='2',CARGO_TARGET_DIR=str(ROOT/'src-tauri/target'))
    with log.open('xb') as f:
        result=subprocess.run(argv,cwd=ROOT,env=env,stdout=f,stderr=subprocess.STDOUT,timeout=max(1,600-(time.monotonic()-startAll)))
    record={'argv':argv,'exitCode':result.returncode,'seconds':round(time.monotonic()-start,3),'log':log.name,'freeAfter':shutil.disk_usage(ROOT).free}
    records.append(record)
    unchanged=before==sources()
    (OUT/'result.json').write_text(json.dumps({'runs':records,'sourceUnchanged':unchanged,'sourceAfter':sources(),'jobs':2,'offline':True,'scope':'Real temporary Store/Session; static lib integration review. No Tauri runtime, platform package, GUI, or user database.'},indent=2)+'\n')
    print(json.dumps(record),flush=True)
    assert result.returncode==0,log
    assert unchanged
