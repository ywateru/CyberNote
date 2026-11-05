from pathlib import Path
import subprocess,json,time,os
R=Path(__file__).resolve().parents[3];O=Path(__file__).resolve().parent
cases=[('baseline','baseline-all','all',True),('candidate','candidate-all','all',True),('baseline','baseline-partial','partial',True),('candidate','candidate-partial','partial',True),('baseline','baseline-natural','none',False),('candidate','candidate-natural','none',False),('candidate','isolation','none',False)]
for phase,name,selection,diagnostic in cases:
 prefix=O/name
 if prefix.with_suffix('.json').exists():raise RuntimeError('Refuse overwrite '+name)
 if name=='isolation':script=O/'isolation-probe.js'
 else:
  script=O/(name+'-probe.js');script.write_text((O/'render-probe-template.js').read_text().replace('__CONFIG__',json.dumps({'name':name,'selection':selection,'diagnostic':diagnostic})))
 cmd=[str(R/'docs/verification/mac-folder-form-geometry15/webkit-render'),str(O/(phase+'.html')),str(prefix),str(script)];t=time.time()
 try:
  p=subprocess.run(cmd,capture_output=True,text=True,timeout=25,env=dict(os.environ,TMPDIR=str(O/'temporary')))
  record={'command':cmd,'exitCode':p.returncode,'elapsedSeconds':round(time.time()-t,3),'stdout':p.stdout,'stderr':p.stderr,'permissionMode':'require_escalated','round':'One planned baseline/candidate comparison; mapping explicit'}
 except subprocess.TimeoutExpired as e:
  record={'command':cmd,'exitCode':None,'elapsedSeconds':round(time.time()-t,3),'timeoutSeconds':25,'stdout':str(e.stdout),'stderr':str(e.stderr)}
 (O/(name+'-command.json')).write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'name':name,**record}),flush=True)
 if record['exitCode']!=0:raise SystemExit(1)
 result=json.loads(prefix.with_suffix('.json').read_text());metrics=result.get('metrics',{})
 print(json.dumps({'name':name,'status':result.get('status'),'snapshotSaved':result.get('snapshotSaved'),'pass':metrics.get('pass'),'selection':metrics.get('selection'),'selectionStyle':metrics.get('selectionStyle'),'checks':metrics.get('checks'),'errors':metrics.get('errors'),'requests':metrics.get('requests')},ensure_ascii=False),flush=True)
 if result['status']!='metrics-ok' or metrics.get('errors') or metrics.get('requests') or metrics.get('pass') is False:raise SystemExit(1)
