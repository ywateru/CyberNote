import datetime,json,os,subprocess,sys
from pathlib import Path
root=Path('/Users/water/work/2026/Apple-Notes-Clone');os.chdir(root)
stage=sys.argv[1];out=root/'docs/verification/f07-audio-integration/build-candidate02'
commands={'mac':['pnpm','mac:build'],'android':['pnpm','android:build','--debug']}
command=commands[stage];start=datetime.datetime.now(datetime.timezone.utc).isoformat()
print('Starting '+stage+': '+' '.join(command),flush=True)
with (out/(stage+'-build.txt')).open('w') as log:
 code=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT).returncode
result={'stage':stage,'command':command,'startedAt':start,'endedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exitCode':code}
(out/(stage+'-build-exit.json')).write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result),flush=True);raise SystemExit(code)
