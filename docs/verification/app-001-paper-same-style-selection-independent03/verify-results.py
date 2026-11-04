from pathlib import Path
import json
out=Path(__file__).resolve().parent
read=lambda p:json.loads((out/p).read_text())
old=read('baseline01/result.json');new=read('candidate01/result.json');pending=read('pending01/result.json')
assert old['pass'] and old['observe'] and old['sourceSHA256']=='99a6df4a9e06998f85122810a61359d251110fe73022e0372fec9ef87a8c0d5e'
assert new['pass'] and not new['observe'] and new['sourceSHA256']=='6eff8e958057e79fa9968a5e89e936197a78567b1e1e58c101e2e99f74671fd4'
assert new['cssSHA256']=='d7facf680ee801c348fd2ed0619213e0fc916d276f8fb3ddef1a78d11acf44d7'
report={'scope':'Independent saved mounted-App results and production-closure test checks. Browser transport and instrumented handler scope; no native acceptance.','baselineFailures':[],'candidatePaths':[],'pendingPaths':[]}
for s in old['scenarios']:
 step=s['steps'][0];assert step['kind']=='choose' and step['preserved']['document']
 assert all(not step['preserved'][x] for x in ['identity','key','selection','history'])
 after=step['after'];clears=[x for x in after['trace'] if x['stage']=='clearSensitive'];assert clears
 hydrates=[x for x in after['trace'] if x['stage']=='hydrate'];assert hydrates and hydrates[-1]['pending']==[]
 assert all(x['same'] for x in hydrates[-1]['documents'])
 report['baselineFailures'].append({'scenario':s['scenario'],'firstChoice':step['style'],'preserved':step['preserved'],'selectionBefore':step['before']['selection'],'selectionAfter':after['selection'],'historyBefore':step['before']['history'],'historyAfter':after['history'],'clearSensitiveCalls':clears,'lastHydrate':hydrates[-1]})
for s,expected in zip(new['scenarios'],[[0,0,1,0,1],[1,0,1]]):
 choices=[x for x in s['steps'] if x['kind']=='choose'];closes=[x for x in s['steps'] if x['kind']=='close'];assert [x['actionCount'] for x in choices]==expected
 for step in choices:
  assert all(step['preserved'].values()) and all(step['after']['identity'].values())
  assert step['after']['editable'] and not step['after']['focused']
  if step['actionCount']==0:assert step['before']['stored']==step['after']['stored']
  assert not [x for x in step['after']['trace'] if x['stage']=='clearSensitive']
 assert [x['method'] for x in closes]==['cancel','Escape','backdrop-handler','Back-handler']
 for step in closes:assert step['after']==step['before']
 report['candidatePaths'].append({'scenario':s['scenario'],'actionCounts':expected,'allRealIdentitiesSelectionsHistoryDocumentsPreserved':True,'closeMethods':[x['method'] for x in closes]})
for c in pending['cases']:
 a,b,ack=c['before'],c['closedBeforeACK'],c['afterACK'];assert a==b and len(a['save']['pending'])==1 and a['waiting']==1
 assert a['document']!=a['stored']['document'] and all(b['identity'].values())
 assert ack['document']==a['document']==ack['stored']['document'] and ack['selection']==a['selection'] and ack['keys']==a['keys'] and ack['history']==a['history']
 assert ack['stored']['revision']==a['stored']['revision']+1 and ack['save']['pending']==[] and ack['save']['failures']==[] and all(ack['identity'].values())
 u=c['undoRedo'];assert u['undo'] and u['redo'] and u['afterUndo']!=a['document'] and u['afterRedo']==a['document']
 report['pendingPaths'].append({'style':c['style'],'entireClosedBeforeACKStateEqual':True,'singleBodyRevisionIncreaseAfterRelease':True,'realUndoRedoPassed':True})
for result in [old,new,pending]:assert result['errors']==[] and result['externalRequests']==[]
identity=read('identity01/result.json');assert identity['tests']==30 and all(x['status']=='pass' for x in identity['results'])
recording=read('recording01.stdout.txt');assert recording['tests']==21 and all(x['pass'] for x in recording['results'])
report.update({'productionIdentityTests':30,'productionSaveBoundaryTests':21,'pass':True})
(out/'analysis.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'pass':True,'oldFailures':len(report['baselineFailures']),'candidateChoices':8,'candidateClosePaths':8,'pendingCases':len(report['pendingPaths']),'productionIdentityTests':30,'productionSaveBoundaryTests':21}))
