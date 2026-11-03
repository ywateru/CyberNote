import subprocess,sys,json
from pathlib import Path
p=Path(__file__).parent
name=sys.argv[1]
r=subprocess.run(sys.argv[2:],capture_output=True)
(p/(name+'.stdout.txt')).write_bytes(r.stdout)
(p/(name+'.stderr.txt')).write_bytes(r.stderr)
(p/(name+'.exit.json')).write_text(json.dumps({'command':sys.argv[2:],'exitCode':r.returncode},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'name':name,'exitCode':r.returncode,'stdoutBytes':len(r.stdout),'stderrBytes':len(r.stderr)}))
sys.exit(r.returncode)
