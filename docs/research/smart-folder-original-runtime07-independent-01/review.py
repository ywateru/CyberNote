"""Offline review of original Notes smart-folder saved evidence; no app access."""
from pathlib import Path
import hashlib,json,re,difflib
from PIL import Image
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
SRC=ROOT/'docs/research/smart-folder-original-runtime07'
sha=lambda b:hashlib.sha256(b).hexdigest()
load=lambda n:json.loads((SRC/n).read_text())
freeze=json.loads((OUT/'input-freeze.json').read_text())
for r in freeze['files']:
 b=(ROOT/r['path']).read_bytes();assert len(b)==r['bytes'] and sha(b)==r['sha256']
assert sorted(p.relative_to(ROOT).as_posix() for p in SRC.iterdir() if p.is_file())==[r['path'] for r in freeze['files']]
definitions=[]
for n in ['02-definition-reopened','05-definition-after-cancel','10-cold-definition']:
 t=(SRC/(n+'.ax.txt')).read_text()
 fields={'name':re.search(r'^\t2 文本栏 \(settable\) (.+)$',t,re.M).group(1),'popups':re.findall(r'^\t\d+ 弹出式按钮 (.+)$',t,re.M),'folderTokens':re.findall(r'^\t+\d+ 附带的文本 (.+)$',t,re.M),'buttons':re.findall(r'^\t\d+ 按钮 (.+)$',t,re.M)}
 assert fields['name']=='QA-SMART-20261104-IN-A'
 assert fields['popups']==['任意','文件夹','包含','置顶备忘录','包含']
 assert fields['folderTokens']==['QA-SMART-20261104-A']
 assert fields['buttons']==['移除','添加','移除','添加','取消','好']
 definitions.append({'file':n+'.ax.txt','sha256':sha(t.encode()),**fields})
results=[]
for n in ['01-in-a-current','04-cancelled-results','08-cold-in-a-results']:
 t=(SRC/(n+'.ax.txt')).read_text()
 items=re.findall(r'^\t+\d+ text Value: QA-SMART-20261104-A (QA-SMART-20261104-A-(?:PIN|PLAIN)), Details: 位于文件夹：QA-SMART-20261104-A$',t,re.M)
 assert items==['QA-SMART-20261104-A-PIN','QA-SMART-20261104-A-PLAIN']
 assert '单元格 (selected) QA-SMART-20261104-IN-A, 智能文件夹, 2个备忘录' in t
 assert '单元格 QA-SMART-20261104-PIN, 智能文件夹, 1个备忘录' in t
 assert not re.search(r'^0 表单',t,re.M)
 results.append({'file':n+'.ax.txt','selectedSmartFolder':'QA-SMART-20261104-IN-A','selectedCount':2,'results':items,'otherSmartFolder':'QA-SMART-20261104-PIN','otherSmartFolderCount':1,'sha256':sha(t.encode())})
candidate=(SRC/'03-qa-folder-candidates.ax.txt').read_text()
assert re.search(r'^\t8 文本栏 \(settable\) QA$',candidate,re.M)
assert re.search(r'^The focused UI element is 8 文本栏 \(settable\) QA$',candidate,re.M)
assert '附带的文本' not in candidate
before=load('06-original-before-quit-identity.json');exitrecord=load('07-known-pid-exit.json');cold=load('09-original-cold-identity.json')
expectedsha='9e20c23a979367362c50edf8fb28bb1988be7e7384254cc3dce38a4a8373df02'
expectedexe='/System/Applications/Notes.app/Contents/MacOS/Notes'
assert before['sha256']==cold['sha256']==expectedsha
assert before['executable']==cold['executable']==expectedexe
assert before['processes']==['70207 '+expectedexe] and cold['processes']==['86322 '+expectedexe]
assert exitrecord=={'phase':'after-CUA-normal-CmdQ','knownPID':70207,'psExitCode':1,'stdout':'','stderr':''}
assert cold['priorPID70207Exited'] is True
restored=(SRC/'11-original-qa-restored.ax.txt').read_text()
assert [int(x) for x in re.findall(r'分离器 [^\n]*\) (\d+)',restored)]==[228,360]
body_match=re.search(r'^\t+\d+ 文本输入区 [^\n]*Note Body Text View[^\n]*Value: (.*?)(?=\n\t)',restored,re.M|re.S)
assert body_match
body=body_match.group(1)
assert body.startswith('QA-TYPE-20261104-01\n') and len(body)==257
assert sha(body.encode())=='69fc53a7926291444f2a846074f92f625c945d997fa8e33c7c957038ff90cd82'
assert not re.search(r'^0 表单',restored,re.M)
images=[]
for p in sorted(SRC.glob('*.cua-image')):
 with Image.open(p) as im:
  im.load();assert im.format=='JPEG'
  images.append({'file':p.name,'format':im.format,'size':list(im.size),'mode':im.mode})
assert len(images)==8
report={
 'verdict':'SUPPORTED_FINITE_ORIGINAL_ENDPOINTS_WITH_EXPLICIT_EVIDENCE_GAPS',
 'definitions':definitions,
 'definitionAxBytesEqual':len({x['sha256'] for x in definitions})==1,
 'resultStates':results,
 'resultAxBytesEqual':len({x['sha256'] for x in results})==1,
 'resultAxDifferences':{'01_vs_04_equal':(SRC/'01-in-a-current.ax.txt').read_bytes()==(SRC/'04-cancelled-results.ax.txt').read_bytes(),'01_vs_08_diff':list(difflib.unified_diff((SRC/'01-in-a-current.ax.txt').read_text().splitlines(),(SRC/'08-cold-in-a-results.ax.txt').read_text().splitlines(),fromfile='01',tofile='08',n=1)),'scope':'Cold08 has disabled Format/Search declarations and different selected-row footer; only result names/counts and saved definition equality accepted, not whole AX/window state equality.'},
 'candidate':{'queryFromAx':'QA','queryFocused':True,'selectedFolderTokenPresent':False,'visibleCandidateNamesManualImageRead':['QA-SMART-20261104-A','QA-SMART-20261104-A1','QA-SMART-20261104-B'],'existingMatchingSmartFoldersFrom01Ax':['QA-SMART-20261104-IN-A','QA-SMART-20261104-PIN'],'smartNamesVisibleIn03Popup':False,'scope':'Manual read of frozen03 image plus AX query; AX omits candidate rows. Only this visible QA-prefix popup is supported; no global folder capability claim, no candidate selection/commit.'},
 'identity':{'before':before,'exit':exitrecord,'cold':cold,'scope':'Saved identity and ps result reviewed, normal CmdQ action described in README/phase. No live executable read or process query/replay; no independent timestamps or full action journal.'},
 'restoredQa':{'file':'11-original-qa-restored.ax.txt','splitterValues':[228,360],'bodyCodePoints':len(body),'bodyUtf8Bytes':len(body.encode()),'bodySha256Utf8':sha(body.encode()),'scope':'Visible final synthetic QA body; no write-count or all-note integrity assertion.'},
 'images':images,
 'authorRecollectionsWithoutDedicatedRawFiles':['Initial zero-size CUA capture error and bound-surface refresh.','End/typeText produced QASMART and no match; select-all/paste did not replace text.','BackSpace then typeText QA; exact gesture order is author narrative;03 finalQA state is captured.','Wrong context menu from reused row index, Escape and corrected folder index.','No create/delete/rule-submit/body-edit and final form cancellation are action-scope narratives, with finite endpoints consistent but no exhaustive write audit.','Project screenshot preflight permission_required; no preflight raw file in this input set.'],
 'limits':['Original Notes only; no clone behavior or Apple pixel parity verdict.','Definitions/results at finite endpoints plus recorded process change support persistence of existing saved definition; no new changed rule was submitted.','Cancel path is endpoint-supported plus root action narrative; no database revision/no-write proof.','iCloud account may be active; no independent offline-local database conclusion.','Physical-folder deletion, smart-definition deletion, all filters, all candidate sources and mobile form remain unknown.','No GUI/ADB/DB/build/product/stage/commit in this review.'],
 'inputsUnchanged':len(freeze['files']),
}
(OUT/'result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'verdict':report['verdict'],'definitionsAxEqual':report['definitionAxBytesEqual'],'resultsAxEqual':report['resultAxBytesEqual'],'images':len(images),'restoredQa':report['restoredQa']},ensure_ascii=False,indent=2))
