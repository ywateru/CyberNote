"""Static verification of sealed Mac18 records; never operates the app."""
from pathlib import Path
from PIL import Image, ImageDraw
import hashlib,json,re
ROOT=Path('/Users/water/work/2026/Apple-Notes-Clone')
SRC=ROOT/'docs/verification/mac-folder-fixes-runtime18'
OUT=ROOT/'docs/verification/mac-folder-fixes-runtime18-independent'
INDEX='f6ffdbc70b9caadcc777eeacabdcae1cb2daad78cc3c1cfc0f0072d4583bb0ef'
EXE='56742e3842b3e3aca03a3bbd3f7fed92f017d5446578334dd7a6cf1b861e1d67'
checks=[]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def load(p):return json.loads(p.read_text())
def check(n,v):
 checks.append({'name':n,'passed':bool(v)})
 if not v:raise AssertionError(n)
def text(n):return (SRC/n).read_text()
def ax(prefix):return text(next(p.name for p in SRC.glob(prefix+'*.ax.txt')))
def body(s):return re.search(r'备忘录正文, Value: (.*?)\n\s*\d+ text \(settable\)',s,re.S).group(1).rstrip()
def folders(s):return re.findall(r'button (.+?) (\d+)\n',s)
idx=load(SRC/'evidence-index.json')
check('sealed source index exact SHA256',sha(SRC/'evidence-index.json')==INDEX)
check('all67 indexed bytes exact',len(idx)==67 and all({'bytes':(SRC/n).stat().st_size,'sha256':sha(SRC/n)}==r for n,r in idx.items()))
check('index covers every original file except itself',set(idx)=={p.name for p in SRC.iterdir() if p.is_file() and p.name!='evidence-index.json'})
old=load(SRC/'03-old09-process-confirmed.json');oldquit=load(SRC/'06-old09-quit-confirmed.json');first=load(SRC/'19-new10-process-identity.json');quit=load(SRC/'33-quit-confirmed.json');last=load(SRC/'36-restarted-process-identity.json')
exe=Path(first['executable']);check('accurate actual executable exists and SHA256 matches both records',exe.is_file() and sha(exe)==first['sha256']==last['sha256']==EXE)
check('exact new package executable absolute path',str(exe)==str(ROOT/'artifacts/unified-candidate06/mac-folder-fixes-build10/mac-attempt01/mac-sealed.app/Contents/MacOS/notes-clone'))
check('old09 process observed then empty exit record',len(old['psRows'])==1 and oldquit['normalQuitViaCUA'] is True and oldquit['matchingRows']==[])
check('Mac10 explicit empty exit record',quit['exit']==0 and quit['matchingRows']==[])
check('new PID same accurate absolute executable path',first['exit']==last['exit']==0 and len(first['matchingRows'])==len(last['matchingRows'])==1 and first['matchingRows'][0].split()[0]=='38681' and last['matchingRows'][0].split()[0]=='39153' and all(r.endswith(str(exe)) for r in first['matchingRows']+last['matchingRows']))
package=load(ROOT/'docs/verification/unified-candidate06/mac-folder-fixes-independent10/result.json')
check('previous independent package pass exact source and executable',package['sourceHead']=='de372d31e0578a7f2619413c0abde6a8439bb3c6' and package['failed']==0 and package['bundles']['sealed']['files'][1]['sha256']==EXE)
baseline=body(ax('07-'))
check('synthetic baseline body exact',baseline=='QA-SMART-U09-Mac-Tag\n本地智能文件夹验收。\n#QASmartU09')
for p in ['08-','10-','14-','15-','16-','17-','23-','27-','29-','31-','32-','34-','37-']:
 check('saved AX complete body unchanged '+p,body(ax(p))==baseline)
for p in ['07-','10-','14-','15-','16-','17-','23-','27-','29-','31-','34-','37-']:
 check('visible count41 and selected smart1 '+p,'button 全部备忘录 41' in ax(p) and 'button QA-SMART-U09-Mac-Selected 1' in ax(p))
check('sidebar hidden08 and visible10; toolbar survives', 'button 全部备忘录' not in ax('08-') and 'button 显示或隐藏文件夹' in ax('08-') and 'button 全部备忘录 41' in ax('10-'))
check('dynamic actual menu labels', '隐藏文件夹' in ax('11-') and '显示文件夹' in ax('13-'))
check('09 display options not sidebar restore','画廊视图' in ax('09-') and '排序方式' in ax('09-') and '显示文件夹' not in ax('09-'))
check('ordinary form opened18 not failed17','container 新建文件夹' in ax('18-') and 'checkbox 制作智能文件夹, Value: 0' in ax('18-') and 'container 新建文件夹' not in ax('17-'))
check('smart toggle20 and ordinary21 preserve draft name',all('Value: QA-FORM18-CANCEL' in ax(p) for p in ['20-','21-']) and 'checkbox 制作智能文件夹, Value: 1' in ax('20-') and 'checkbox 制作智能文件夹, Value: 0' in ax('21-'))
check('post ordinary cancellation visible folder list unchanged',folders(ax('07-'))==folders(ax('23-')))
check('true original smart definition','组合过滤条件, Value: 全部' in ax('24-') and '标签模式, Value: 任何标签' in ax('24-') and '置顶模式, Value: 包含' in ax('24-'))
check('25 stale AX and selected native item retained','置顶模式, Value: 包含' in ax('25-') and '(selected) 不包含' in ax('25-'))
for p in ['26-','28-','30-','35-']:check('false value explicit '+p,'置顶模式, Value: 不包含' in ax(p))
check('false save target count0','button QA-SMART-U09-Mac 0' in ax('27-'))
for p in ['29-','31-','34-','37-']:check('renamed target count0 preserved '+p,'button QA-SMART-U09-Mac-R18 0' in ax(p))
check('rename reopened and after restart exact definition',ax('30-')==ax('35-'))
check('body actual selected text recorded31','Selected text: ```\n本地智能文件夹验收。\n```' in ax('31-'))
check('hidden32 before quit;34 is actually visible','button 全部备忘录' not in ax('32-') and 'button 全部备忘录 41' in ax('34-'))
check('final sidebar restored and no draft modal','button 全部备忘录 41' in ax('37-') and 'container 编辑智能文件夹' not in ax('37-'))
check('retained failed attempts distinguish correct evidence',load(SRC/'03-old09-process-before.json')['pids']==[] and bool(load(SRC/'04-old09-quit-check.json')['matchingRows']) and '0 编辑' in ax('12-') and 'WKMenuItemIdentifierReload' in ax('22-') and 'button 编辑智能文件夹' in ax('23-'))
images=[]
for p in sorted(SRC.glob('*.cua-image')):
 with Image.open(p) as im:im.verify()
 with Image.open(p) as im:images.append({'path':p.name,'format':im.format,'width':im.width,'height':im.height})
check('27 actual JPEG images decode',len(images)==27 and all(r['format']=='JPEG' for r in images))
im=Image.open(SRC/'18-ordinary-form-open.cua-image').convert('L');crop=(600,350,1580,950);mask=im.crop(crop).point(lambda x:255 if x>=210 else 0);ImageDraw.floodfill(mask,(488,150),128,thresh=0);bb=mask.point(lambda x:255 if x==128 else 0).getbbox();bbox=[bb[0]+600,bb[1]+350,bb[2]+600,bb[3]+350]
check('ordinary modal bright component800x414 bbox',bbox==[688,453,1488,867])
check('original captured standalone800x414',Image.open(SRC/'00-original-ordinary.cua-image').size==(800,414))
readme=text('README.md');check('author retains restart visible and geometry limits','实际侧栏可见' in readme and '不能宣称精确复位' in readme and '完整像素未通过' in readme)
initial=load(OUT/'input-manifest.json');check('original indexed files unchanged at close',all((ROOT/r['path']).stat().st_size==r['bytes'] and sha(ROOT/r['path'])==r['sha256'] for r in initial['files']) and sha(SRC/'evidence-index.json')==INDEX)
result={'conclusion':'PASS: finite sealed runtime record consistency only; STOP','sourceHead':package['sourceHead'],'actualExecutable':{'path':str(exe),'bytes':exe.stat().st_size,'sha256':sha(exe)},'sourceIndexSha256':INDEX,'sourceRecords':67,'sourceRecordsUnchanged':True,'checks':checks,'assertions':len(checks),'failed':0,'recordedProcessIds':{'before':38681,'after':39153,'emptyExitRecord':'33-quit-confirmed.json'},'images':images,'ordinaryModalMeasurement':{'method':'JPEG luminance >=210 connected component seeded within modal, bounded ROI [600,350,1580,950]; excludes shadow, not exact color/corner equivalence','bbox':bbox,'size':[800,414],'originalStandaloneCaptureSize':[800,414]},'manualVisualReview':'All27 JPEGs: original00/current18/body31/restart34 viewed directly; remaining23 through four labeled derived contact sheets. AX state and endpoint record consistency reviewed.','findings':[],'limitations':['Reviewer did not operate GUI or app and did not freshly query live processes; exit/restart conclusions are scoped to stored process records plus current exact file hash.','31 captures retained -R18 endpoint and selected body. Intermediate -CANCEL18 text and exact cancellation action exist only in author narrative; static files do not independently prove every keystroke.','Form cancellation supports no new visible directory; no user DB read or complete durable-entity inventory was performed.','Drag endpoints and body preservation visible, but full back-and-forth gesture trajectory is author narrative. Final list boundary differs from initial; no exact restore or width persistence pass.','34 filename includes hidden, actual sidebar is visible. No hidden preference persistence acceptance.','JPEG/active focus/capture scope differ; only finite modal envelope dimension matches, not overall pixels/colors/corners/fonts.','True is initial reopened state, false save/reopen/rename/newPID state verified. No claim of separately saving true again this round.','No product edits, original evidence changes, Git, GUI, ADB, DB, platform builds/shared target/cache operations; Android records not read.'],'stop':True}
with (OUT/'result.json').open('x') as s:s.write(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'assertions':len(checks),'failed':0,'exeSha256':sha(exe),'sourceRecordsUnchanged':True,'modalBBox':bbox},ensure_ascii=False))
