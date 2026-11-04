from pathlib import Path
import datetime,json,os,shutil,signal,subprocess,sys,time
root=Path.cwd();out=Path(__file__).resolve().parent
name=sys.argv[1];argv=sys.argv[2:];record=out/(name+'.json')
if record.exists():raise RuntimeError('Preserve existing result: '+str(record))
free=shutil.disk_usage(root).free
if free<2*1024**3:raise RuntimeError('Less than 2 GiB available')
started=time.monotonic();result={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'argv':argv,'cwd':str(root),'freeBefore':free}
p=subprocess.Popen(argv,cwd=root,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
try:
 stdout,stderr=p.communicate(timeout=180)
 result.update(exitCode=p.returncode,stdout=stdout,stderr=stderr)
except subprocess.TimeoutExpired:
 os.killpg(p.pid,signal.SIGTERM)
 try:stdout,stderr=p.communicate(timeout=5)
 except subprocess.TimeoutExpired:
  os.killpg(p.pid,signal.SIGKILL);stdout,stderr=p.communicate()
 result.update(exitCode=p.returncode,stdout=stdout,stderr=stderr,timedOut=True)
result.update(seconds=time.monotonic()-started,freeAfter=shutil.disk_usage(root).free)
record.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'result':str(record),'exitCode':result['exitCode'],'seconds':result['seconds'],'stdout':result['stdout'][-2500:],'stderr':result['stderr'][-2500:]},ensure_ascii=False))
raise SystemExit(0 if result['exitCode']==0 else 1)
