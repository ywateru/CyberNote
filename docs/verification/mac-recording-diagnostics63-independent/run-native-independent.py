from pathlib import Path
import os, subprocess, time, json, re
out=Path('docs/verification/mac-recording-diagnostics63-independent/native-refinal');out.mkdir(exist_ok=True)
base=os.environ.copy();base.pop('NOTES_RECORDING_DIAGNOSTICS',None)
results=[]
def run(name,args,env=base,stderr=subprocess.PIPE):
 start=time.monotonic();r=subprocess.run(args,env=env,stdout=subprocess.PIPE,stderr=stderr,timeout=5)
 row={'name':name,'command':args,'flag':env.get('NOTES_RECORDING_DIAGNOSTICS'),'exitCode':r.returncode,'elapsedSeconds':time.monotonic()-start};results.append(row)
 (out/(name+'.stdout.txt')).write_bytes(r.stdout);(out/(name+'.stderr.txt')).write_bytes(r.stderr or b'');assert r.returncode==0,(row,r.stdout,r.stderr);return r
try:
 for flag in [None,'0','true','1']:
  e=base.copy()
  if flag is not None:e['NOTES_RECORDING_DIAGNOSTICS']=flag
  r=run('quiet-'+str(flag),['/private/tmp/notes-diagnostics63-independent-bin/sink','quiet'],e)
  assert (len(r.stderr.splitlines())==1 if flag=='1' else r.stderr==b'')
 e={**base,'NOTES_RECORDING_DIAGNOSTICS':'1'}
 r=run('locked',['/private/tmp/notes-diagnostics63-independent-bin/sink','locked'],e);lines=r.stderr.decode().splitlines();m=re.fullmatch(r'notes-recording-diag stage=truncated event_limit=256 emitted=(\d+) queue_dropped=(\d+) budget_dropped=(\d+) t_us=\d+',lines[-1]);assert m;written,queue,budget=map(int,m.groups());assert written==len(lines)-1 and written+queue==256 and budget==9744 and 1<=written<=65
 r=run('late-budget',['/private/tmp/notes-diagnostics63-independent-bin/sink','late-budget'],e);lines=r.stderr.decode().splitlines();assert len(lines)==257 and 'emitted=256 queue_dropped=0 budget_dropped=9 ' in lines[-1]
 rd,wr=os.pipe();os.set_blocking(wr,False);filled=0
 try:
  while True:filled+=os.write(wr,b'X'*4096)
 except BlockingIOError:pass
 os.set_blocking(wr,True)
 try:r=run('full-unread-pipe',['/private/tmp/notes-diagnostics63-independent-bin/sink','blocked'],e,wr)
 finally:os.close(wr);os.close(rd)
 results[-1]['pipePrefilledBytes']=filled;results[-1]['readDuringChild']=False
 rd,wr=os.pipe();os.close(rd)
 try:r=run('failed-writer-epipe',['/private/tmp/notes-diagnostics63-independent-bin/sink','failed'],e,wr)
 finally:os.close(wr)
 results[-1]['readEndClosedBeforeChild']=True
 r=run('native63-lifecycle',['/private/tmp/notes-diagnostics63-independent-bin/native63']);assert b'17 cases per mode; 69 unchanged' in r.stdout and b'134 diagnostic events' in r.stdout
 print('PASS independent on/off, held stderr, saturated queue, late budget, full unread pipe, EPIPE metadata, native 17x2/69/134')
finally:(out/'execution.json').write_text(json.dumps({'source':'78f9f9d896e8c5d75311f3202484ff119f57369c','realDeviceOrAudioOperation':False,'results':results},indent=2)+'\n')
