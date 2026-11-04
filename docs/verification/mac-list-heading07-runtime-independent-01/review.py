"""Offline independent audit of sealed root Mac07 runtime records. Never operates GUI/process/DB/build."""
from pathlib import Path
from PIL import Image
import hashlib,json,re,datetime,shutil
ROOT=Path('/Users/water/work/2026/Apple-Notes-Clone')
SRC=ROOT/'docs/verification/mac-list-heading07-runtime-01'
OUT=ROOT/'docs/verification/mac-list-heading07-runtime-independent-01'
EXPECTED_BODY='69fc53a7926291444f2a846074f92f625c945d997fa8e33c7c957038ff90cd82'
EXE_SHA='0de1ab851b06f6da59fe3d37a3843af0b0cf46557effe69d2c72bb7bcf63ffd1'
checks=[]
def sha(b): return hashlib.sha256(b).hexdigest()
def ck(name,ok):
 checks.append({'name':name,'pass':bool(ok)})
 if not ok: raise AssertionError(name)
def path(n,suffix): return next(SRC.glob(f'{n:02d}-*'+suffix))
def ax(n): return path(n,'.ax.txt').read_text()
def load(n): return json.loads(path(n,'.json').read_text())
def body(s,original=False):
 pattern=r'文本输入区[^\n]*Note Body Text View[^\n]*Value: ([\s\S]*?)(?=\n\t+\d+ )' if original else r'text entry area[^\n]*备忘录正文, Value: ([\s\S]*?)(?=\n\t+\d+ text \(settable\)|\Z)'
 m=re.search(pattern,s)
 return m.group(1) if m else None
started=datetime.datetime.now(datetime.timezone.utc).isoformat()
frozen=json.loads((OUT/'input-manifest.json').read_text())
actual=[{'path':str(p.relative_to(SRC)),'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())} for p in sorted(SRC.rglob('*')) if p.is_file()]
ck('51 exact first-frozen root files before audit',actual==frozen['files'] and len(actual)==51)
ck('disk >=2GiB',shutil.disk_usage(OUT).free>=2*1024**3)
normal=[7,8,9,10,11,12,14,16,19,20,23,24,25,26,27,29]
body_rows=[]
for n in [1,2,3]+normal:
 s=ax(n); b=body(s,n<4)
 ck(f'{n:02d} full QA body present',b is not None)
 info={'number':n,'path':path(n,'.ax.txt').name,'codepoints':len(b),'bytes':len(b.encode()),'sha256':sha(b.encode())};body_rows.append(info)
 ck(f'{n:02d} full exact257/547 corpus',info['codepoints']==257 and info['bytes']==547 and info['sha256']==EXPECTED_BODY)
 if n>=7:
  ck(f'{n:02d} same7 folder count', 'text Description: Notes Clone UI 对照, Value: Notes Clone UI 对照 7 个备忘录' in s)
  ck(f'{n:02d} same14:19 note date', 'button 2026年11月4日 14:19' in s)
  ck(f'{n:02d} native recovery toolbar button present', 'button 显示或隐藏文件夹' in s)
# Raw saved process identities, not a new live process query.
old,old_exit,live,exited,cold=(load(n) for n in [4,5,6,21,22])
ck('saved Mac06 identity',old['sha256']=='f69b9e3856ebb62ee64c6547d55a420762a31e58ab3b9244391981fff239f8bf' and old['psExitCode']==0 and old['stderr']=='' and len(old['processes'])==1 and old['processes'][0].startswith('74182 '))
for n,v,pid in [(5,old_exit,'74182'),(21,exited,'94925')]:
 ck(f'{n:02d} exact saved exited PID command',v['command']==['/bin/ps','-p',pid,'-o','pid=,comm='])
 ck(f'{n:02d} saved process query exit1 empty streams',v['returncode']==1 and v['stdout']==v['stderr']=='')
expected_path=str(ROOT/'artifacts/unified-candidate06/mac-list-heading-build07/mac-attempt01/mac-sealed.app/Contents/MacOS/notes-clone')
for n,v,pid in [(6,live,'94925'),(22,cold,'95696')]:
 ck(f'{n:02d} exact saved Mac07 path/hash/pid',v['executable']==expected_path and v['sha256']==EXE_SHA and v['psExitCode']==0 and v['stderr']=='' and v['processes']==[pid+' '+expected_path])
ck('saved process PID changed with same path/hash',live['processes']!=cold['processes'] and live['executable']==cold['executable'] and live['sha256']==cold['sha256'])
# Finite accessibility-state paths. Click mechanisms are author descriptions in README.
visible=[7,8,9,12,16,19,20,23,24,26,29];hidden=[10,11,14,25,27]
for n in visible:
 s=ax(n)
 ck(f'{n:02d} visible sidebar folder entry and2 splitters',bool(re.search(r'\d+ button Notes Clone UI 对照 7\n',s)) and len(re.findall(r'\d+ splitter ',s))==2)
for n in hidden:
 s=ax(n)
 ck(f'{n:02d} hidden sidebar with1 splitter',not re.search(r'\d+ button Notes Clone UI 对照 7\n',s) and len(re.findall(r'\d+ splitter ',s))==1)
 ck(f'{n:02d} hidden native recovery button26',bool(re.search(r'(?m)^\t26 button 显示或隐藏文件夹$',s)))
for n,label in [(13,'隐藏文件夹'),(15,'显示文件夹'),(28,'显示文件夹')]:
 ck(f'{n:02d} exact view menu action',bool(re.search(r'(?m)^\t\t2 '+label+r', ID: customAction:$',ax(n))))
 ck(f'{n:02d} menu only has no QA body',body(ax(n)) is None)
ck('original visible restored contain folder outline',all('外框 文件夹' in ax(n) for n in [1,3]))
ck('original hidden no folder outline but folder toolbar recovery remains','外框 文件夹' not in ax(2) and '按钮 Description: 文件夹' in ax(2))
ck('original01/03 numeric splitters228/360',all(re.findall(r'分离器 \(disabled, settable, float\) (\d+)',ax(n))==['228','360'] for n in [1,3]))
ck('17 failed empty folder state retained','无备忘录' in ax(17) and '未选择备忘录' in ax(17) and 'Value: 备忘录 0 个备忘录' in ax(17) and body(ax(17)) is None)
ck('18 different QA body retained',body(ax(18)) is not None and sha(body(ax(18)).encode())!=EXPECTED_BODY and 'QA-VERTICAL-INPUT-20261104-04' in body(ax(18)))
ck('19 footer text selection retained','Selected text: ```' in ax(19) and '新建文件夹' in ax(19).split('Selected text: ```',1)[1])
ck('20 list text selection retained','Selected text: ```' in ax(20) and all(t in ax(20).split('Selected text: ```',1)[1] for t in ['今天','QA-VERTICAL-LONG-20261104-03','QA-TYPE-20261104-01','QA-WIDE-20261104-05']) and '新建文件夹' not in ax(20).split('Selected text: ```',1)[1])
ck('final29 normal closed menu/body focus','The focused UI element is 2 HTML content' in ax(29) and '0 显示, Secondary Actions: Cancel, Pick' not in ax(29))
images=[]
for p in sorted(SRC.glob('*.cua-image')):
 with Image.open(p) as im:
  n=int(p.name[:2]); info={'path':p.name,'format':im.format,'size':list(im.size)}; images.append(info)
  ck(p.name+' actual JPEG',im.format=='JPEG')
  ck(p.name+' actual saved dimensions',im.size==((2176,1320) if n in [7,23] else (2788,1806)))
ck('21 JPEG originals',len(images)==21)
# Original and clone represent different list data: preserve this as a scope limit.
ck('original11 vs clone7 counts differ','Notes Clone UI 对照 11个备忘录' in ax(1) and 'Notes Clone UI 对照 7 个备忘录' in ax(9))
closing=[{'path':str(p.relative_to(SRC)),'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())} for p in sorted(SRC.rglob('*')) if p.is_file()]
ck('all frozen root files unchanged at audit end',closing==actual)
result={'schema':1,'startedAt':started,'endedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'conclusion':'PASS: finite saved Mac07 process identity, QA body and sidebar restoration states; with retained failed/selection states','source':str(SRC),'sourceFiles':len(actual),'sourceBytes':sum(r['bytes'] for r in actual),'sourceAggregate':frozen['aggregate'],'checks':checks,'normalCloneBodySamples':len(normal),'bodyRows':body_rows,'images':images,'savedProcessIdentity':{'oldMac06PID':74182,'firstMac07PID':94925,'exitedKnownPID':94925,'coldMac07PID':95696,'sameMac07ExecutableSHA256':EXE_SHA,'independentLiveProcessQuery':False},'finitePaths':{'direct':[9,10,11,12],'menu':[13,14,15,16],'coldDirect':[23,24,25,26],'coldMenu':[27,28,29]},'excludedStates':{'17':'Wrong-coordinate attempt selected empty folder; no intended resize PASS.','18':'Different QA selected after folder reselection; excluded from QA-TYPE body equality.','19':'QA-TYPE body correct but footer New Folder text selection retained; no full drag/selection experience PASS.','20':'QA-TYPE body correct but list heading and multiple preview text selected; no full drag/selection experience PASS.'},'manualImageReview':{'19-mac07-sidebar208.cua-image':'QA-TYPE visible with footer New Folder text selected. No pixel measurement.'},'limits':['Offline review of saved root records; no new GUI/process/DB/ADB/build actions.','CmdQ, exact click/drag coordinates, no-edit recollection, system authorization and caffeinate observations are root README descriptions, not independently replayed action traces.','Full body equality plus count/date after ordinary process reopen supports finite UI persistence only; no DB identity or save ACK observed.','Sidebar visible before quit; hidden-state persistence not tested.','Screenshot format JPEG; original/clone counts and dates differ, and small/zoomed windows differ. No full-window pixel PASS or new geometry measurements.']}
(OUT/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'conclusion':result['conclusion'],'checks':len(checks),'normalCloneBodySamples':len(normal),'originalBodySamples':3,'sourceFiles':len(actual)},ensure_ascii=False))
