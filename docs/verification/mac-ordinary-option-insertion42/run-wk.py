from pathlib import Path
import subprocess,json,sys,time,os
base=Path('docs/verification/mac-ordinary-option-insertion42').resolve();attempt=sys.argv[1];scenarios=sys.argv[2:];run=base/attempt
cache=base/'runtime-tmp';cache.mkdir(exist_ok=True)
for scenario in scenarios:
 stem=run/scenario
 assert not stem.with_suffix('.json').exists(),stem
 command=[str(base/'wk-probe'),str(run/'fixture.html'),scenario];start=time.time()
 env=dict(os.environ,TMPDIR=str(cache))
 try:
  p=subprocess.run(command,capture_output=True,text=True,timeout=35,env=env);code=p.returncode;stdout=p.stdout;stderr=p.stderr;status='finished'
 except subprocess.TimeoutExpired as e:code=None;stdout=(e.stdout or b'').decode() if isinstance(e.stdout,bytes) else e.stdout or '';stderr=(e.stderr or b'').decode() if isinstance(e.stderr,bytes) else e.stderr or '';status='timeout'
 stem.with_suffix('.stdout').write_text(stdout);stem.with_suffix('.stderr').write_text(stderr)
 metadata={'command':command,'status':status,'exit':code,'elapsedSeconds':time.time()-start,'ownProcessOnly':True,'isolatedHistory':True,'hiddenNonpersistentWK':True}
 stem.with_suffix('.json').write_text(json.dumps(metadata,indent=2)+'\n')
 if stdout:
  try:result=json.loads(stdout);stem.with_suffix('.result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
  except json.JSONDecodeError:pass
 print(scenario,code,status,flush=True)
 if code!=0:raise SystemExit(1)
