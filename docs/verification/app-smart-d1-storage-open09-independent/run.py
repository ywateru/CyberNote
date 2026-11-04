from pathlib import Path
import os,json,hashlib,subprocess,time,shutil,datetime
ROOT=Path('/Users/water/work/2026/Apple-Notes-Clone')
OUT=Path(__file__).resolve().parent
MANIFEST=ROOT/'docs/verification/app-smart-d1-storage-open09/harness02/Cargo.toml'
TARGET=ROOT/'src-tauri/target'
inputs=json.loads((OUT/'inputs.json').read_text())
def identities():return {r['path']:hashlib.sha256((ROOT/r['path']).read_bytes()).hexdigest() for r in inputs['sourceFiles']}
expected={r['path']:r['sha256'] for r in inputs['sourceFiles']};assert identities()==expected
filters=['store::open::tests::','stale_selection_defaults_without_losing_other_settings','independent_schema_fixtures_are_rejected_and_legacy_archive_still_loads','recorded_at_archive_v2_twice_remaps_ids_and_preserves_date_and_bytes']
records=[]
for number,filter_value in enumerate(filters,1):
 assert shutil.disk_usage(ROOT).free>=2*1024**3
 argv=['cargo','test','--locked','--offline','--features','rusqlite/hooks','--manifest-path',str(MANIFEST),filter_value,'--','--nocapture']
 env=dict(os.environ,CARGO_NET_OFFLINE='true',CARGO_BUILD_JOBS='2',CARGO_TARGET_DIR=str(TARGET))
 log=OUT/f'run{number:02d}.txt';start=time.monotonic()
 with log.open('xb') as stream:r=subprocess.run(argv,cwd=ROOT,env=env,stdout=stream,stderr=subprocess.STDOUT,timeout=600)
 records.append({'argv':argv,'cwd':str(ROOT),'exitCode':r.returncode,'seconds':round(time.monotonic()-start,3),'log':log.name,'freeAfter':shutil.disk_usage(ROOT).free})
 assert r.returncode==0,log
 assert identities()==expected
result={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'fixedSourceCommit':inputs['fixedSourceCommit'],'actualHEADAtStart':inputs['actualHEAD'],'sourceBefore':expected,'sourceAfter':identities(),'sourceUnchanged':identities()==expected,'environment':{'CARGO_NET_OFFLINE':'true','CARGO_BUILD_JOBS':'2','CARGO_TARGET_DIR':str(TARGET)},'runs':records,'scope':'Direct production Store/Session modules from sealed author harness; no platform/Tauri/UI test or product edit.'}
(OUT/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'runs':len(records),'allExit0':all(r['exitCode']==0 for r in records),'seconds':sum(r['seconds'] for r in records),'sourceUnchanged':result['sourceUnchanged']},ensure_ascii=False))
