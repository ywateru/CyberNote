from pathlib import Path
import subprocess,itertools,json,sys
# source commit is explicit; product bodies remain unchanged. Tauri attributes
# and inner documentation are removed to substitute only the host boundary.
commit=sys.argv[1];out=Path(sys.argv[2]).resolve();out.mkdir(parents=True,exist_ok=True)
here=Path(__file__).resolve().parent
source=subprocess.check_output(['git','show',commit+':src-tauri/src/recording_window.rs']).decode()
import re,hashlib
(out/'production-recording-window.rs').write_text(re.sub(r'^//!','//',source,flags=re.M).replace('#[tauri::command]\n',''))
(out/'check-registry.rs').write_bytes((here/'check-registry-recovery.rs').read_bytes())
(out/'source.json').write_text(json.dumps({'commit':commit,'originalSha256':hashlib.sha256(source.encode()).hexdigest(),'transform':'remove command attributes; inner docs to ordinary comments; no function body modification'},indent=2)+'\n')
deps=Path('/private/tmp/apple-notes-recording-window50-independent-target/debug/deps')
for index,libs in enumerate(itertools.product(*(sorted(deps.glob('lib'+name+'-*.rlib')) for name in ['serde','serde_json','uuid']))):
 args=['rustc','--edition=2021',str(out/'check-registry.rs'),'-L','dependency='+str(deps),'-o',str(out/'registry-probe.bin')]
 for name,lib in zip(['serde','serde_json','uuid'],libs):args+=['--extern',name+'='+str(lib)]
 p=subprocess.run(args,capture_output=True,text=True);(out/f'compile-{index}.stdout.log').write_text(p.stdout);(out/f'compile-{index}.stderr.log').write_text(p.stderr)
 if p.returncode==0:
  (out/'compile-command.json').write_text(json.dumps(args,indent=2)+'\n')
  p=subprocess.run([str(out/'registry-probe.bin')],capture_output=True,text=True);(out/'stdout.log').write_text(p.stdout);(out/'stderr.log').write_text(p.stderr)
  (out/'execution.json').write_text(json.dumps({'compileExit':0,'runExit':p.returncode},indent=2)+'\n');print(p.stdout);sys.exit(0 if p.returncode==0 else 1)
raise RuntimeError('no compatible existing artifact combination; compile failures retained')
