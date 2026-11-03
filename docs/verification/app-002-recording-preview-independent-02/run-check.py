import subprocess,sys,json,hashlib
from pathlib import Path
p=Path(__file__).parent
name=sys.argv[1]
paths=['src/RecordingPanel.tsx','src/RecordingPanel.css','src/recording-session.ts','src/recording-playback.ts','scripts/check-recording-panel-browser.mjs','scripts/check-recording-preview.mjs']
def inputs():return {x:hashlib.sha256(Path(x).read_bytes()).hexdigest() for x in paths}
before=inputs()
r=subprocess.run(sys.argv[2:],capture_output=True)
(p/(name+'.stdout.txt')).write_bytes(r.stdout)
(p/(name+'.stderr.txt')).write_bytes(r.stderr)
after=inputs()
(p/(name+'.exit.json')).write_text(json.dumps({'command':sys.argv[2:],'exitCode':r.returncode,'sourceHashesBefore':before,'sourceHashesAfter':after,'sourceHashesUnchanged':before==after},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'name':name,'exitCode':r.returncode,'stdoutBytes':len(r.stdout),'stderrBytes':len(r.stderr),'sourceHashesUnchanged':before==after}))
assert before==after
sys.exit(r.returncode)
