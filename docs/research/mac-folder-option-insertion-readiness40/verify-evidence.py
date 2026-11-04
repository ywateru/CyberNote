from pathlib import Path
import hashlib,json,datetime
root=Path(__file__).resolve().parents[3]
p=Path(__file__).resolve().parent
checks=[]
def check(name,condition,detail=None):
 checks.append({'name':name,'pass':bool(condition),'detail':detail})
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
rows={}
for scenario in ['caret-middle','replace-CD','append','setRangeText-control','setDraft-control']:
 run=json.loads((p/('wk-attempt05-'+scenario+'.json')).read_text())
 data=json.loads((p/('wk-result05-'+scenario+'.json')).read_text())
 check(scenario+':process',run['exitCode']==0 and 'visible=0 key=0 main=0 undoManager=1' in run['stderr'])
 check(scenario+':payload',data['status']=='COMPLETE' and len(data['rows'])==1 and json.loads(run['stdout'])==data)
 row=data['rows'][0];rows[scenario]=row
 check(scenario+':fresh-history',not row['before']['undoEnabled'] and not row['before']['redoEnabled'])
original='QA-OPT40-ABCD'
check('literal-name-length',len(original)==13 and original[11:13]=='CD')
for scenario,start,end in [('caret-middle',3,3),('replace-CD',11,13),('append',13,13)]:
 row=rows[scenario];expected=original[:start]+'\t'+original[end:];pos=start+1
 check(scenario+':initial',row['before']['value']==row['before']['state']==row['before']['output']==original and (row['before']['start'],row['before']['end'])==(start,end))
 for stage in ['after','afterUnrelatedRender','redo']:
  snap=row[stage]
  check(scenario+':'+stage,snap['value']==snap['state']==snap['output']==expected and (snap['start'],snap['end'])==(pos,pos) and snap['focused'])
 snap=row['undo']
 check(scenario+':undo',snap['value']==snap['state']==snap['output']==original and (snap['start'],snap['end'])==(start,end) and snap['focused'])
 check(scenario+':command-returns',row['insertReturn'] is True and row['undoReturn'] is True and row['redoReturn'] is True)
 for eventKey,inputType in [('insertEvents','insertText'),('undoEvents','historyUndo'),('redoEvents','historyRedo')]:
  events=row[eventKey]
  check(scenario+':'+eventKey,[e['kind'] for e in events]==['beforeinput','input','react-onChange'] and all(e['inputType']==inputType and e['isTrusted'] for e in events))
 check(scenario+':native-history',row['after']['undoEnabled'] and row['undo']['redoEnabled'] and not row['undo']['undoEnabled'] and row['redo']['undoEnabled'] and not row['redo']['redoEnabled'])
row=rows['setRangeText-control']
check('setRangeText:dom-only',row['after']['value']=='QA-OPT40-AB\t' and row['after']['state']==row['after']['output']==original)
check('setRangeText:render-reverts',row['afterUnrelatedRender']['value']==original)
for scenario in ['setRangeText-control','setDraft-control']:
 row=rows[scenario]
 check(scenario+':no-edit-events',not row['insertEvents'] and not row['undoEvents'] and not row['redoEvents'])
 check(scenario+':no-native-history',row['undoReturn'] is False and row['redoReturn'] is False and not row['after']['undoEnabled'])
row=rows['setDraft-control']
check('setDraft:state-is-not-native-history',row['after']['value']==row['after']['state']==row['after']['output']=='QA-OPT40-AB\t' and row['undo']['value']=='QA-OPT40-AB\t')
openData=json.loads((p/'input-open.json').read_text())
closeFiles=[]
for e in openData['files']:
 f=root/e['path'];now={'path':e['path'],'bytes':f.stat().st_size,'sha256':sha(f)};closeFiles.append(now)
 check('protected:'+e['path'],now==e)
freeze=json.loads((root/'docs/verification/unified-candidate06/android-compose-anchor-build08/input-freeze.json').read_text())
for e in freeze['files']:
 f=root/e['path'];check('freeze:'+e['path'],f.stat().st_size==e['bytes'] and sha(f)==e['sha256'])
origIndex=root/'docs/research/mac-folder-option-insertion-original40/evidence-index.json'
check('original40:index',sha(origIndex)=='33e0b5c02996a179635d1461b2b3500745d2ec7ba9d27f248b1419714f2ca275')
orig=json.loads(origIndex.read_text())
for e in orig['files']:
 f=root/e['path'];check('original40:'+e['path'],f.stat().st_size==e['bytes'] and sha(f)==e['sha256'])
(p/'input-close.json').write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'count':len(closeFiles),'files':closeFiles,'unchanged':all(a==b for a,b in zip(openData['files'],closeFiles))},indent=2)+'\n')
supplement=json.loads((p/'supplemental41-open.json').read_text())
for e in supplement['files']:
 f=root/e['path'];check('original41:'+e['path'],f.stat().st_size==e['bytes'] and sha(f)==e['sha256'])
(p/'supplemental41-close.json').write_text(json.dumps({'count':len(supplement['files']),'unchanged':all(c['pass'] for c in checks if c['name'].startswith('original41:')),'files':supplement['files']},indent=2)+'\n')
base41=root/'docs/research/mac-folder-option-history-original41'
initial41=(base41/'01-before-suffix-selection.ax.txt').read_text()
after41=(base41/'02-after-option-tab.ax.txt').read_text()
undo41=(base41/'03-after-undo.ax.txt').read_text()
redo41=(base41/'04-after-redo.ax.txt').read_text()
row=rows['replace-CD']
check('original41:initial-CD-selected','QA-OPT41-ABCD' in initial41 and 'Selected text: ```\nCD\n```' in initial41)
check('original41:insert-endpoint',row['after']['value'].replace('OPT40','OPT41') in after41 and 'The focused UI element is 2 文本栏' in after41)
check('original41:undo-value-selected-CD',row['undo']['value'].replace('OPT40','OPT41') in undo41 and 'Selected text: ```\nCD\n```' in undo41 and (row['undo']['start'],row['undo']['end'])==(11,13))
check('original41:redo-endpoint',row['redo']['value'].replace('OPT40','OPT41') in redo41 and 'The focused UI element is 2 文本栏' in redo41)
result={'status':'PASS' if all(c['pass'] for c in checks) else 'FAIL','stop':'READY STOP','scope':'Implementation readiness of document insertText in own hidden WK controlled React19 input only; no product/native-routing/original-undo parity PASS','assertions':len(checks),'passed':sum(c['pass'] for c in checks),'protectedFiles':len(closeFiles),'frozenFiles':len(freeze['files']),'originalFiles':len(orig['files']),'supplemental41ProtectedFiles':len(supplement['files']),'recommendation':'execCommand insertText is the only tested candidate retaining real WK editing history and React synchronization; separate narrowly scoped product implementation and runtime verification required','checks':checks}
(p/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='checks'},ensure_ascii=False))
if result['status']!='PASS':
 print(json.dumps([c for c in checks if not c['pass']],ensure_ascii=False));raise SystemExit(1)
