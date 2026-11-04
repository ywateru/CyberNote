"""Static review of sealed Android18 evidence. No device or product operations."""
from pathlib import Path
from PIL import Image,ImageChops
import hashlib,json,re
ROOT=Path('/Users/water/work/2026/Apple-Notes-Clone')
SRC=ROOT/'docs/verification/android-folder-fixes-runtime18'
OUT=ROOT/'docs/verification/android-folder-fixes-runtime18-independent'
INDEX='8df1ca4d2d328973369bf7933d9a03c95183bfd6207656614055f102bfe153bf'
APK='8609231ff310ffef028c62b20f9774bcb2968f15d21a95ddf87d3f4eb98951ac'
checks=[]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def load(p):return json.loads(p.read_text())
def check(n,v):
 checks.append({'name':n,'passed':bool(v)})
 if not v:raise AssertionError(n)
def data(n):return load(SRC/n)
idx=load(SRC/'evidence-index.json')
check('sealed source index exact SHA256',sha(SRC/'evidence-index.json')==INDEX)
check('all83 indexed byte identities',len(idx)==83 and all((ROOT/n).stat().st_size==r['bytes'] and sha(ROOT/n)==r['sha256'] for n,r in idx.items()))
check('index covers original directory completely',set(idx)=={str(p.relative_to(ROOT)) for p in SRC.iterdir() if p.is_file() and p.name!='evidence-index.json'})
gate=data('01-root-package-gate.json');pkgdir=ROOT/'docs/verification/unified-candidate06/android-folder-fixes-independent06';package=load(pkgdir/'result.json')
check('exact previously sealed independent package index',sha(pkgdir/'evidence-index.json')==gate['independentIndexSha256']=='c167275fc10079a2d7da11b12bf85ca71afd76188a8da3e9a8cd32dbffb4afff')
check('accurate package source from fixed package records',gate['source']==package['sourceHead']=='de372d31e0578a7f2619413c0abde6a8439bb3c6' and gate['independentReview']=='PASS' and package['failed']==0 and package['assertions']==385)
apk=Path(package['apk']['path']);check('current preserved accurate APK bytes',apk.stat().st_size==package['apk']['bytes']==179247354 and sha(apk)==package['apk']['sha256']==gate['apkSha256']==APK)
install=data('02-install-result.json');check('recorded install-r success exact package path',install['command']==['install','-r',str(apk)] and install['exitCode']==0 and install['stdout']=='Performing Streamed Install\nSuccess\n' and install['stderr']=='')
before=(SRC/'00-package-before.txt').read_text();after=(SRC/'02-package-after.txt').read_text();device=(SRC/'02-apk-device-sha.txt').read_text().strip();upgrade=data('09-upgrade-identity-gate.json')
codepath=re.findall(r'^\s*codePath=(.*)$',after,re.M)
check('recorded installed base.apk exact hash/path',len(codepath)==1 and device==APK+'  '+codepath[0]+'/base.apk')
for key,expected in [('userId','10169'),('firstInstallTime','2026-11-03 22:09:17')]:
 a=re.findall(r'^\s*'+key+r'=(.*)$',before,re.M);b=re.findall(r'^\s*'+key+r'=(.*)$',after,re.M)
 check('package dump and09 match preserved '+key,a==b==[expected] and upgrade[key]=={'before':a,'after':b})
check('upgrade identity booleans supported by raw records',upgrade['installed_sha_matches'] is True and upgrade['identity_preserved'] is True)
check('same recorded package data inode',re.findall(r'ceDataInode=(\d+)',before)==re.findall(r'ceDataInode=(\d+)',after)==['123481'])
proc=data('13-cold-start-process.json')
check('stored cold stop before25977 empty exit1 new26347',proc['before_pid']['exit']==proc['after_start_pid']['exit']==0 and proc['before_pid']['stdout'].strip()=='25977' and proc['after_start_pid']['stdout'].strip()=='26347' and proc['after_stop_pid']=={'exit':1,'stdout':'','stderr':''} and proc['stop']['exit']==proc['start']['exit']==0 and 'com.local.notesclone/.MainActivity' in proc['start']['stdout'])
images=[];actions=[]
for p in sorted(SRC.glob('*.png')):
 with Image.open(p) as im:im.verify()
 with Image.open(p) as im:images.append({'path':p.name,'format':im.format,'width':im.width,'height':im.height})
 if not p.name.startswith(('00-','02-')):
  pair=p.with_suffix('.json');check('image has paired action record '+p.stem,pair.is_file())
for p in sorted(SRC.glob('*.json')):
 if p.name=='evidence-index.json':continue
 records=load(p)
 if isinstance(records,list):
  check('captured input JSON valid bounded operations '+p.stem,all(set(r)=={'action','exit','stdout','stderr'} and r['exit']==0 and r['stdout']==r['stderr']=='' and r['action'][0]=='input' and r['action'][1] in ['tap','swipe','keyevent','text'] for r in records))
  actions.extend({'file':p.name,**r} for r in records)
check('all37 actual PNG1080x2280 images decode',len(images)==37 and all(x['format']=='PNG' and [x['width'],x['height']]==[1080,2280] for x in images))
check('03 and14 intentional no-action stable captures',data('03-stable-after-upgrade.json')==data('14-after-cold-start.json')==[])
check('04 exact recorded900ms folder longpress',data('04-longpress-context.json')[0]['action']==['input','swipe','458','1088','458','1088','900'])
check('08 name-only input last-character replacement',[x['action'] for x in data('08-name-only-saved.json')]==[['input','keyevent','123'],['input','keyevent','67'],['input','text','2'],['input','tap','970','225']])
check('12 recorded two cancellation taps',[x['action'] for x in data('12-edit-canceled.json')]==[['input','tap','110','225']]*2)
check('19 confirm then20 actual scroll requests',data('19-empty-tag-error.json')[0]['action']==['input','tap','970','225'] and data('20-empty-error-after-scroll.json')[0]['action']==['input','swipe','550','1800','550','700','500'])
check('21 attempted tag and confirm preserved',[x['action'] for x in data('21-valid-retry.json')]==[['input','tap','700','690'],['input','tap','970','225']])
check('22 return top23 confirm24 cancel requests',data('22-retry-return-top.json')[0]['action']==['input','swipe','550','600','550','1800','500'] and data('23-valid-filter-confirmed.json')[0]['action']==['input','tap','970','225'] and data('24-new-draft-canceled.json')[0]['action']==['input','tap','110','225'])
check('27 actual recorded900ms body selection',data('27-body-selection.json')[0]['action']==['input','swipe','300','553','300','553','900'])
check('29 and35 same menu item coordinate requests',data('29-synthetic-pinned.json')[0]['action']==data('35-synthetic-unpinned.json')[0]['action']==['input','tap','525','300'])
check('37 only opened old note;38 returned',data('37-old-audio-card-visible.json')[0]['action']==['input','tap','500','1020'] and data('38-ordinary-after-audio.json')[0]['action']==['input','tap','100','140'])
helper=(SRC/'action-capture.py').read_text();check('saved helper fixed emulator and exclusive capture files',"'emulator-5580'" in helper and "in ['tap','swipe','keyevent','text']" in helper and "open('xb')" in helper and "open('x')" in helper)
roi=(60,330,1040,680);bodyrois=[]
for n in ['26-synthetic-body','33-synthetic-pinned-open','35-synthetic-unpinned']:
 im=Image.open(SRC/(n+'.png')).convert('RGB').crop(roi);bodyrois.append({'file':n+'.png','roi':list(roi),'rgbSha256':hashlib.sha256(im.tobytes()).hexdigest()})
check('same exact synthetic visible title/body/tag ROI before after pin/unpin',len({x['rgbSha256'] for x in bodyrois})==1)
errors=[]
for n in ['19-empty-tag-error','20-empty-error-after-scroll']:
 im=Image.open(SRC/(n+'.png')).convert('RGB');ps=im.load();coords=[(x,y) for y in range(300,500) for x in range(im.width) if ps[x,y][0]>120 and ps[x,y][0]>ps[x,y][1]*1.35 and ps[x,y][0]>ps[x,y][2]*1.35]
 bb=[min(x for x,y in coords),min(y for x,y in coords),max(x for x,y in coords)+1,max(y for x,y in coords)+1]
 errors.append({'file':n+'.png','redPixelBBox':bb,'redPixels':len(coords),'topHeaderSampleRGB':list(ps[970,225])})
check('error red line currently visible identical before after scroll',all(x['redPixelBBox']==[70,357,665,388] and x['redPixels']==4501 for x in errors))
readme=(SRC/'README.md').read_text();check('README explicitly retains21 partial29 transitional limits','未完成确认' in readme and '不能当完整列表端点' in readme and '不替代完整存储审计' in readme and '未执行另一个true保存重开循环' in readme)
initial=load(OUT/'input-manifest.json');check('all83 source files and old index unchanged at close',all((ROOT/r['path']).stat().st_size==r['bytes'] and sha(ROOT/r['path'])==r['sha256'] for r in initial['files']) and sha(SRC/'evidence-index.json')==INDEX)
result={'conclusion':'PASS: sealed finite Android18 record consistency only; STOP','reviewMode':'static saved records; no device operation or current product source inference','sourceHeadFromFixedPackageRecords':package['sourceHead'],'sourceIndexSha256':INDEX,'sourceRecords':83,'sourceRecordsUnchanged':True,'package':{'path':str(apk),'bytes':apk.stat().st_size,'sha256':sha(apk)},'recordedInstalledBaseApkPath':codepath[0]+'/base.apk','recordedColdStartPids':[25977,26347],'recordedAfterStopExit':1,'checks':checks,'assertions':len(checks),'failed':0,'actionRecordCount':len(actions),'images':images,'manualVisualReview':'All37 full screenshots reviewed through five labeled derived contact sheets;04 folder menu/27 body selection/37 audio card additionally viewed full-size. Saved actions inspected without executing helper.','bodyPixelROI':bodyrois,'errorVisiblePixelEvidence':errors,'findings':[],'limitations':['Action exit0 means Android accepted an input command, not semantic completion.21 failed same-step confirmation and29 blank transition retained;23 and30/31 are valid endpoints.','Reviewer did not operate GUI/ADB or observe live process/device state; installation/hash/UID/PID findings apply to saved records and current host APK bytes.','37 proves visible old card title/date2:03 only; no playback/export/decode or media-byte integrity test.','Counts8 and visible synthetic-body endpoints are finite preservation evidence, not all user entities/database/media integrity.','No true-save-reopen loop, actual iOS host/original touch timing/animation/overall pixel acceptance.','No current activity worktree/source used to infer Android package provenance. No original evidence edits, source/product modification, Git, DB, media export, builds or shared target/cache operations.'],'stop':True}
with (OUT/'result.json').open('x') as s:s.write(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'assertions':len(checks),'failed':0,'sourceFilesUnchanged':83,'screenshots':len(images),'inputActions':len(actions),'actualApkSha256':sha(apk)},ensure_ascii=False))
