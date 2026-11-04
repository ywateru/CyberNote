from pathlib import Path
import os,subprocess,time,json,sys,datetime
out=Path(__file__).resolve().parent
i=json.loads((out/'source-identity.json').read_text());env=dict(os.environ);env.update(PLAYWRIGHT_CORE_PATH='/Users/water/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs',CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
name=sys.argv[1]
commands={'candidate01':['node',str(out/'check-real-app.mjs'),str(out/'candidate01')],'baseline01':['node',str(out/'check-real-app.mjs'),str(out/'baseline01')],'pending01':['node',str(out/'check-pending-app.mjs'),str(out/'pending01')],'identity01':['node',str(out/'check-identity-adapted.mjs')],'recording01':['node','scripts/check-recording-submit.mjs'],'build01':['pnpm','build']}
if name=='baseline01':env.update(SAME_SOURCE_REF=i['baselineRef'],SAME_OBSERVE='1')
start=time.time()
with (out/(name+'.stdout.txt')).open('w') as stdout,(out/(name+'.stderr.txt')).open('w') as stderr:
 p=subprocess.run(commands[name],cwd=i['fixtureRoot'],env=env,stdout=stdout,stderr=stderr)
r={'argv':commands[name],'cwd':i['fixtureRoot'],'environment':{k:env[k] for k in ['PLAYWRIGHT_CORE_PATH','CHROME_PATH','SAME_SOURCE_REF','SAME_OBSERVE'] if k in env},'startedUTC':datetime.datetime.fromtimestamp(start,datetime.timezone.utc).isoformat(),'durationSeconds':time.time()-start,'exitCode':p.returncode};(out/(name+'-command.json')).write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r));raise SystemExit(p.returncode)
