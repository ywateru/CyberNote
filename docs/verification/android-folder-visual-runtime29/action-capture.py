import subprocess,sys,json,time,shlex
from pathlib import Path
root=Path('/Users/water/work/2026/Apple-Notes-Clone/docs/verification/android-folder-visual-runtime29')
name=sys.argv[1]
assert '/' not in name and '..' not in name
acts=json.loads(sys.argv[2])
b=['/Users/water/Library/Android/sdk/platform-tools/adb','-s','emulator-5580']
records=[]
for a in acts:
 if a[0]=='wait':
  assert 0<=float(a[1])<=2;time.sleep(float(a[1]));continue
 assert a[0]=='input' and a[1] in ['tap','swipe','keyevent','text']
 r=subprocess.run(b+['shell',shlex.join(a)],capture_output=True,check=True)
 records.append({'action':a,'exit':r.returncode,'stdout':r.stdout.decode(errors='replace'),'stderr':r.stderr.decode(errors='replace')})
time.sleep(.3)
with (root/(name+'.png')).open('xb') as f:f.write(subprocess.check_output(b+['exec-out','screencap','-p']))
with (root/(name+'.json')).open('x') as f:json.dump(records,f,ensure_ascii=False,indent=2)
print(str(root/(name+'.png')))
