import json,os,pathlib,shutil,signal,subprocess,time
controller='/private/tmp/account109-mac-72513d12-build-controller.py'
root='/private/tmp/cybernote-account109-android-72513d12-01'
out=pathlib.Path('/Users/water/work/2026/Apple-Notes-Clone/artifacts/account109/mac-72513d12-debug-e2e-01')
limit=10*1024**3
initial=shutil.disk_usage(root).free
assert initial>=limit
samples=0;minimum=initial
p=subprocess.Popen(['python3',controller])
while True:
    free=shutil.disk_usage(root).free
    minimum=min(minimum,free);samples+=1
    if free<limit:
        os.kill(p.pid,signal.SIGSTOP)
        rows=subprocess.check_output(['ps','-axo','pid=,ppid='],text=True).splitlines()
        children=[tuple(map(int,row.split())) for row in rows]
        owned={p.pid}
        while True:
            found={pid for pid,parent in children if parent in owned}-owned
            if not found:break
            owned.update(found)
        for pid in owned-{p.pid}:
            try:os.kill(pid,signal.SIGSTOP)
            except ProcessLookupError:pass
        record={'schema':1,'status':'paused-low-disk','pauseBelowFreeBytes':limit,'initialFreeBytes':initial,'minimumObservedFreeBytes':minimum,'samples':samples,'pausedOwnedProcessCount':len(owned)}
        (out/'disk-monitor.json').write_text(json.dumps(record,indent=2)+'\n')
        print(json.dumps(record),flush=True)
        raise SystemExit(75)
    try:code=p.wait(timeout=1);break
    except subprocess.TimeoutExpired:pass
record={'schema':1,'status':'completed','pauseBelowFreeBytes':limit,'initialFreeBytes':initial,'minimumObservedFreeBytes':minimum,'finalFreeBytes':shutil.disk_usage(root).free,'samples':samples,'controllerExitCode':code}
(out/'disk-monitor.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record),flush=True)
raise SystemExit(code)
