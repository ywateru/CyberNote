"""Only the two preserved counterexamples and exact allowed actual-dump positive."""
import hashlib,importlib.util,json,re,sys
from pathlib import Path
root=Path.cwd();out=root/'docs/verification/sync87-native/picker-key-independent-recheck'
spec=importlib.util.spec_from_file_location('g',root/'scripts/debug/sync87-native/guard.py');g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
prior=json.loads((root/'docs/verification/sync87-native/picker-key-independent/result.json').read_text())['counterexamples'];results=[]
for label,field in [('Original mixed-user duplicate Resumed','extraResumed'),('Original mixed-user duplicate Focus','extraFocus')]:
 text=prior['base']+prior[field]+'\n'
 try:g.picker_key(text,'ENTER');results.append({'name':label,'pass':False,'error':'still admitted'})
 except g.Refused:results.append({'name':label,'pass':True})
actual=Path('/private/tmp/notes-sync87-native-actual-01/cycle06-foreground.txt');raw=actual.read_bytes();sha=hashlib.sha256(raw).hexdigest();expected='71ab82a6e4b7b1f557fc10c2291565162c48681ae337ed58cbac09db83fe835a'
fields=[line.strip() for line in raw.decode().splitlines() if re.match(r'^\s*(?:mResumedActivity\s*:|mCurrentFocus\s*=)',line)]
try:
 assert sha==expected,'actual raw hash changed';assert g.picker_key(raw.decode(),'ENTER')=='66';results.append({'name':'Exact actual activity dump admits fixed ENTER','pass':True})
except Exception as e:results.append({'name':'Exact actual activity dump admits fixed ENTER','pass':False,'error':str(e)})
result={'status':'PASS' if all(r['pass'] for r in results) else 'BLOCKED','frozenAuthor':'406c76f7','results':results,'preservedOriginalCounterexamples':True,'actualObservation':{'path':str(actual),'sha256':sha,'expectedSha256':expected,'bytes':len(raw),'onlyRelevantFieldsArchived':fields},'hostOnly':True,'adbCalls':0,'deviceActions':0,'limits':'Helper admission only; no actual key sent, file selection or save/export accepted.'}
(out/'result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'status':result['status'],'checks':len(results),'failed':[r['name'] for r in results if not r['pass']],'actualHashMatches':sha==expected,'adbCalls':0}));sys.exit(0 if result['status']=='PASS' else 1)
