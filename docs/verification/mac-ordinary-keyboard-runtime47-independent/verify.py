from pathlib import Path
from PIL import Image,ImageCms,ImageDraw
from io import BytesIO
import hashlib,json,re

ROOT=Path('/Users/water/work/2026/Apple-Notes-Clone')
RUN=ROOT/'docs/verification/mac-ordinary-keyboard-runtime47'
OUT=Path(__file__).resolve().parent
PKG=ROOT/'docs/verification/unified-candidate06/mac-ordinary-loop-independent14'
ART=ROOT/'artifacts/unified-candidate06/mac-ordinary-loop-build14/mac-attempt01'
SOURCE='d9ce9c4b864c2d05bf3d2057ec48ae65fb868a46'
EXE='c9f7f35adc675c8058fabeb98f03fa7d1904a2c023e123cc396121264a8e211f'
REFS=[ROOT/'docs/research'/n for n in ['mac-folder-keyboard-original35','mac-folder-tab-loop-original37','mac-folder-option-insertion-original40','mac-folder-option-history-original41','mac-folder-option-sequence-original43']]
checks=[]
def load(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def ck(n,v,detail=None):checks.append({'name':n,'pass':bool(v),'detail':detail})
def save(n,v):(OUT/n).write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
def rec(p):return {'path':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':sha(p),'mtimeNs':p.stat().st_mtime_ns}
idx=load(RUN/'evidence-index.json')
protected={RUN/e['path']for e in idx['files']}|{RUN/'evidence-index.json',PKG/'result.json',PKG/'evidence-index.json',ART/'mac-sealed.app/Contents/MacOS/notes-clone',ART/'mac-sealed.zip'}
for folder in REFS:
    protected.add(folder/'evidence-index.json');protected.update(ROOT/e['path']for e in load(folder/'evidence-index.json')['files'])
frozen_before=[rec(p)for p in sorted(protected)];save('input-manifest.json',{'count':len(frozen_before),'files':frozen_before})
ck('runtime exact index hash',sha(RUN/'evidence-index.json')=='669a6cd95256aaec56fcae8a5bc936c95635880345cfa4597028e82d97d46b63')
ck('runtime74 unique directory-relative members',idx['count']==len(idx['files'])==len({e['path']for e in idx['files']})==74 and idx['pathsRelativeTo']=='evidence directory')
ck('runtime complete directory membership',{p.name for p in RUN.iterdir()if p.is_file()}=={e['path']for e in idx['files']}|{'evidence-index.json'})
ck('source/exe identity metadata',idx['sourceHead']==SOURCE and idx['exeSha256']==EXE)
for e in idx['files']:
    p=RUN/e['path'];ck('runtime member '+e['path'],p.stat().st_size==e['bytes'] and sha(p)==e['sha256'])
refcounts={}
for folder in REFS:
    d=load(folder/'evidence-index.json');refcounts[folder.name]=len(d['files'])
    for e in d['files']:
        p=ROOT/e['path'];ck('original member '+e['path'],p.stat().st_size==e['bytes']and sha(p)==e['sha256'])
ck('linked package result unchanged',sha(PKG/'result.json')=='fb7d27e925f23e44127aebb9e957e472dadf885d0e45a62c2dc67d0eeb4c2ebb')
ck('linked package index unchanged',sha(PKG/'evidence-index.json')=='840d6ea3f9c5e93a9d12f0b7a7e14e65af0b0d6a160b55e423e5001e784c90a6')
ck('immutable sealed executable',sha(ART/'mac-sealed.app/Contents/MacOS/notes-clone')==EXE)
ck('immutable sealed ZIP',sha(ART/'mac-sealed.zip')=='146fdbc67111cd1ae0779337a22af1550d1d9a446c27021bc243415f5dff0605')
processes={p.name:load(p)for p in RUN.glob('*process.json')}
for file,pid in [('01-new14-process.json',81003),('30-hidden-restart-process.json',81221),('32-visible-restart-process.json',81260)]:
    d=processes[file];path=str(ART/'mac-sealed.app/Contents/MacOS/notes-clone')
    ck('exact saved process identity '+file,d['exeSha256']==EXE and d['executable']==path and d['process']==[str(pid)+' '+path])
ck('old13 saved identity',processes['00-old13-process.json']['process']==['62696 '+processes['00-old13-process.json']['executable']] and processes['00-old13-process.json']['exeSha256']=='b24f87623e49781859166d798dec052cb987692469ad2741847392b13e127812')
ck('saved old PID disappearance',processes['01-new14-process.json']['oldPID62696Absent'] and processes['30-hidden-restart-process.json']['oldPIDsAbsent']==[62696,81003] and processes['32-visible-restart-process.json']['oldPIDsAbsent']==[62696,81003,81221])
ck('process record chronology',processes['00-old13-process.json']['at']<processes['01-new14-process.json']['at']<processes['30-hidden-restart-process.json']['at']<processes['32-visible-restart-process.json']['at'])
texts={int(p.name[:2]):p.read_text()for p in RUN.glob('*.ax.txt')}
def selection(s):
    m=re.search(r'Selected text: ```\n(.*?)\n```',s,re.S);return m.group(1)if m else None
def value(s):
    m=re.search(r'text field \(settable\) 名称, Value: ([^\n]*)',s);return m.group(1)if m else None
def body(s):
    m=re.search(r'text entry area \(settable\) 备忘录正文, Value: (.*?)(?=\n\t+\d+ |\Z)',s,re.S);return m.group(1)if m else None
def focus(s):
    m=re.search(r'The focused UI element is (.*)',s);return m.group(1)if m else None
endpoints={n:{'nameValue':value(s),'selectedText':selection(s),'focusLine':focus(s),'sidebarVisible':'button 全部备忘录 41' in s,'body':body(s),'comparisonFooter8':'Value: Notes Clone UI 对照 8 个备忘录'in s}for n,s in texts.items()}
ck('all35 AX endpoints',set(texts)==set(range(35)))
for n,selected in [(2,'新建文件夹'),(3,'建文'),(5,'新建文件夹'),(6,'新建文件夹'),(7,'新建文件夹'),(9,'CD'),(11,'CD'),(18,'新建文件夹')]:
    ck('exact selected text '+str(n),selection(texts[n])==selected)
expected={2:'新建文件夹',3:'新建文件夹',4:'新建文件夹',5:'新建文件夹',6:'新建文件夹',7:'新建文件夹',8:'QA-\tOPT40-ABCD',9:'QA-OPT41-ABCD',10:'QA-OPT41-AB\t',11:'QA-OPT41-ABCD',12:'QA-OPT41-AB\t',13:'QA-OPT40-ABCD\t',15:'QA-OPT43-ABCD',16:'QA-OPT43-ABCD\t',17:'QA-OPT43-ABCD\t\t',18:'新建文件夹',19:'QA-OPT43-ABCD\t\t',20:'QA-DRAFT47',21:'QA-DRAFT47',33:'\t'}
for n,v in expected.items():ck('exact name preserving TAB bytes '+str(n),value(texts[n])==v)
for n in [4,8,10,12,13,15,16,17,19,33]:ck('explicit focused name '+str(n),'text field (settable) 名称, Value: '+expected[n] in (focus(texts[n])or''))
ck('20 smart draft,21 ordinary draft', 'container 新建智能文件夹'in texts[20]and 'checkbox 制作智能文件夹, Value: 1'in texts[20]and 'container 新建文件夹'in texts[21]and 'checkbox 制作智能文件夹, Value: 0'in texts[21])
for n in [14,22,24,25,27,29,30,31,32,34]:ck('sheet gone '+str(n),'container 新建文件夹'not in texts[n]and'container 新建智能文件夹'not in texts[n])
bodypoints=[0,1,14,22,23,24,25,27,29,30,31,32,34]
baseline=body(texts[0]);ck('full QA body baseline',baseline is not None and baseline.startswith('QA-TYPE-20261104-01\n')and'\n\n空行之后 Ag中文\n'in baseline and baseline.count('这是用于本地界面对照的合成内容。')==5)
for n in bodypoints:ck('full visible QA body unchanged '+str(n),body(texts[n])==baseline)
for n in [0,1,14,22,24,27,31,32,34]:ck('visible sidebar41 comparison8 '+str(n),endpoints[n]['sidebarVisible']and endpoints[n]['comparisonFooter8']and'button Notes Clone UI 对照 8'in texts[n])
for n in [25,29,30]:ck('hidden sidebar with direct toggle '+str(n),not endpoints[n]['sidebarVisible']and'button Notes Clone UI 对照 8'not in texts[n]and'button 显示或隐藏文件夹'in texts[n])
ck('dynamic show/hide menu labels','显示文件夹, ID: customAction:'in texts[26]and'隐藏文件夹, ID: customAction:'in texts[28]and'Secondary Actions: Cancel'in texts[28])
ck('no invented menu JPEG endpoints',not(RUN/'26-menu-show-label.cua-image').exists()and not(RUN/'28-menu-hide-label.cua-image').exists())
ck('find field focused','text field (settable) 在备忘录中查找'in(focus(texts[22])or''))
ck('native query focused and one result','search text field (settable) Description: 搜索备忘录, Value: QA-TYPE-20261104-01'in(focus(texts[23])or'')and'Value: 搜索结果 1 个备忘录'in texts[23])
ck('native search cleared restores8','搜索备忘录, Value:'not in texts[24]and endpoints[24]['comparisonFooter8'])
actions=load(RUN/'actions.json');readme=(RUN/'README.md').read_text()
ck('action recollection limitation explicit','recollection'in actions['authorship']and'not raw OS key trace'in actions['authorship'])
ck('28 Escape failure/public Cancel retained as recollection',any('Escape did not close'in r['actions']and'Cancel secondary action'in r['actions']for r in actions['operations'])and'第一次Escape没有收起原生菜单'in readme)
# Original AX endpoint comparison, without converting recollections into OS event traces.
ref37=REFS[1]
for file in ['01-continuous-right-tab.ax.txt','02-shift-tab.ax.txt','03-continuous-tab-only.ax.txt']:
    ck('original37 name selected '+file,selection((ref37/file).read_text())=='新建文件夹')
def original_name(s):
    m=re.search(r'文本栏 \(settable\) ([^\n]*)',s);return m.group(1)if m else None
pairs=[(33,REFS[0]/'01-option-tab-inserts-tab.ax.txt'),(8,REFS[2]/'01-caret-option-tab.ax.txt'),(13,REFS[2]/'04-option-shift-tab.ax.txt'),(10,REFS[3]/'02-after-option-tab.ax.txt'),(11,REFS[3]/'03-after-undo.ax.txt'),(12,REFS[3]/'04-after-redo.ax.txt'),(16,REFS[4]/'02-first-option-tab.ax.txt'),(17,REFS[4]/'03-second-option-tab.ax.txt'),(18,REFS[4]/'04-undo.ax.txt'),(19,REFS[4]/'05-redo.ax.txt')]
for n,p in pairs:ck('original finite value endpoint '+str(n)+' '+p.name,value(texts[n])==original_name(p.read_text()))
ck('original40 suffix replacement shape with explicit fixture ID difference',original_name((REFS[2]/'03-suffix-replaced-option-tab.ax.txt').read_text())=='QA-OPT40-AB\t' and value(texts[10])=='QA-OPT41-AB\t')
ck('original41 CD selection endpoint',selection(texts[11])==selection((REFS[3]/'03-after-undo.ax.txt').read_text())=='CD')
ck('original43 grouped undo selection endpoint',selection(texts[18])==selection((REFS[4]/'04-undo.ax.txt').read_text())=='新建文件夹')
save('endpoints.json',{'source':'Original AX bytes; TAB preserved, selected text and focus reported separately','endpoints':endpoints,'bodyEndpoints':bodypoints,'fullBodySHA256':hashlib.sha256(baseline.encode()).hexdigest(),'bodyCharacters':len(baseline),'processRecords':processes,'originalReferenceCounts':refcounts,'limits':['Recalled actions, not raw OS key trace','Selection endpoints do not include explicit focus lines; saved image supplies visible selected field context','No IPC count, event trust or internal undo grouping instrumentation','Hidden endpoints lack total/footer count; visible restored endpoints carry counts']})
# Decode each raw container. Derived views are sRGB browsing aids only, never pixel measurements.
images={};qa=[];srgb=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB'))
for p in sorted(RUN.glob('*.cua-image')):
    im=Image.open(p);im.load();profile=im.info.get('icc_profile',b'')
    ck('raw JPEG/ICC '+p.name,im.format=='JPEG'and im.size==(2176,1320)and len(profile)==4064)
    qa.append({'path':str(p.relative_to(ROOT)),'format':im.format,'size':im.size,'iccBytes':len(profile),'iccSHA256':hashlib.sha256(profile).hexdigest(),'jpegComponents':im.layer})
    images[int(p.name[:2])]=ImageCms.profileToProfile(im,ImageCms.ImageCmsProfile(BytesIO(profile)),srgb,outputMode='RGB')
ck('33 actual JPEG images',len(images)==33)
rows=[2,3,4,5,6,7,8,9,10,11,12,13,16,17,18,19,33]
sheet=Image.new('RGB',(800,len(rows)*95),'#ececec');draw=ImageDraw.Draw(sheet)
for i,n in enumerate(rows):
    draw.text((4,i*95+3),f'{n:02d} raw endpoint crop, sRGB, original scale, no score',fill='black')
    sheet.paste(images[n].crop((810,557,1470,625)),(0,i*95+23))
sheet.save(OUT/'keyboard-endpoints-srgb.png',icc_profile=srgb.tobytes())
rows=[0,1,25,27,29,30,31,32,34];sheet=Image.new('RGB',(1088,5*354),'#ececec');draw=ImageDraw.Draw(sheet)
for i,n in enumerate(rows):
    x=(i%2)*544;y=(i//2)*354;draw.text((x+3,y+3),f'{n:02d} context at 0.25 scale, browsing only',fill='black')
    sheet.paste(images[n].resize((544,330),Image.Resampling.LANCZOS),(x,y+22))
sheet.save(OUT/'sidebar-context-srgb.png',icc_profile=srgb.tobytes())
save('image-qa.json',{'rawImages':qa,'derivedViews':[{'path':'keyboard-endpoints-srgb.png','crop':[810,557,1470,625],'scale':1},{'path':'sidebar-context-srgb.png','scale':0.25}],'scope':'sRGB visual reference only, no pixel scoring/registration/retouch'})
frozen_after=[rec(p)for p in sorted(protected)];ck('all protected bytes/SHA/mtime unchanged',frozen_before==frozen_after)
save('input-close.json',{'count':len(frozen_after),'unchanged':frozen_before==frozen_after,'files':frozen_after})
result={'status':'PASS finite sealed actual-runtime endpoint consistency only'if all(c['pass']for c in checks)else'FAIL','stop':'READY STOP','sourceHead':SOURCE,'exeSHA256':EXE,'runtimeIndexSHA256':sha(RUN/'evidence-index.json'),'runtimeMembers':74,'rawJPEGs':33,'protectedInputs':len(frozen_before),'assertions':len(checks),'passed':sum(c['pass']for c in checks),'newGUIOrRuntimeOperations':0,'checks':checks,'open':['System keyboard navigation enabled/toggle, multiwindow, IME, dark mode','All save/error/async queue paths and all native interactions','No whole database audit or IPC/internal editing event trace','Typography/background/full pixel parity; independent visual analysis47 not read']}
save('result.json',result);print(json.dumps({k:v for k,v in result.items()if k not in ['checks','open']},ensure_ascii=False))
if not all(c['pass']for c in checks):
    print(json.dumps([c for c in checks if not c['pass']],ensure_ascii=False));raise SystemExit(1)
