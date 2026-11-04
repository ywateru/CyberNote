"""Own bounded offline browser rerun; no platform build or target access."""
from pathlib import Path
import importlib.util,json,os
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('boundary_common',ROOT/'docs/verification/unified-candidate06/preparation/common.py')
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
link=ROOT/'node_modules';target='/Users/water/work/2026/Apple-Notes-Clone/node_modules'
if link.exists() or link.is_symlink(): raise RuntimeError('Do not replace existing dependencies')
link.symlink_to(target,target_is_directory=True)
owned=link.lstat();result={'startedAt':c.now(),'cwd':str(ROOT),'argv':['node','scripts/check-body-typography-browser.mjs',str(OUT/'render-run01'),'e44dba736e377ea7abd2969f6c9ea1a5b24b3cc4'],'environmentOverrides':{'PLAYWRIGHT_CORE_PATH':'/Users/water/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs','CHROME_PATH':'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'},'dependencyLink':{'path':str(link),'target':target,'inode':owned.st_ino}}
try:
    env=os.environ.copy();env.update(result['environmentOverrides'])
    c.monitored(result['argv'],ROOT,env,OUT/'render-run01.txt',result,deadline=120)
finally:
    current=link.lstat()
    if (current.st_dev,current.st_ino)==(owned.st_dev,owned.st_ino) and link.is_symlink() and os.readlink(link)==target:
        link.unlink();result['ownDependencyLinkRemoved']=True
    else:result['dependencyLinkChangedPreserved']=True
    result['endedAt']=c.now();c.record_new(OUT/'render-command.json',result)
print(json.dumps(result,ensure_ascii=False))
if result.get('exitCode')!=0 or result.get('ownedGroupStopped') is not True or not result.get('ownDependencyLinkRemoved'):raise SystemExit(1)
