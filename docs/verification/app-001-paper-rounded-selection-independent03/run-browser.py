from pathlib import Path
import subprocess,os,json,time,datetime
out=Path(__file__).resolve().parent
identity=json.loads((out/'source-identity.json').read_text())
env=dict(os.environ);env.update(PLAYWRIGHT_CORE_PATH='/Users/water/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs',CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
argv=['node',str(out/'check-real-app.mjs'),str(out/'run02')]
start=time.time()
with (out/'run02.stdout.txt').open('w') as stdout,(out/'run02.stderr.txt').open('w') as stderr:
 p=subprocess.run(argv,cwd=identity['fixtureRoot'],env=env,stdout=stdout,stderr=stderr)
record={'argv':argv,'cwd':identity['fixtureRoot'],'environment':{k:env[k] for k in ['PLAYWRIGHT_CORE_PATH','CHROME_PATH']},'startedUTC':datetime.datetime.fromtimestamp(start,datetime.timezone.utc).isoformat(),'durationSeconds':time.time()-start,'exitCode':p.returncode}
(out/'run02-command.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record));raise SystemExit(p.returncode)
