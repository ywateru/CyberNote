from pathlib import Path
import subprocess,json,sys,datetime,hashlib
OUT=Path(__file__).resolve().parent;ROOT=OUT.parents[2]
phase,name,cssFile,mode=sys.argv[1:5];css=''if cssFile=='none'else(OUT/cssFile).read_text();config={'name':name,'css':css,'diagnostic':mode=='selected-diagnostic','selected':mode=='selected-diagnostic'}
probe=OUT/(name+'-probe.js');probe.write_text((OUT/'render-probe-template.js').read_text().replace('__CONFIG__',json.dumps(config,ensure_ascii=False)))
prefix=OUT/name;assert not prefix.with_suffix('.json').exists();command=[str(ROOT/'docs/verification/mac-folder-form-geometry15/webkit-render'),str(OUT/(phase+'.html')),str(prefix),str(probe)]
r=subprocess.run(command,cwd=ROOT,capture_output=True);record={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'command':command,'exitCode':r.returncode,'stdout':r.stdout.decode(errors='replace'),'stderr':r.stderr.decode(errors='replace')};(OUT/(name+'-command.json')).write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n');print(json.dumps(record,ensure_ascii=False));sys.exit(r.returncode)
