from pathlib import Path
from PIL import Image,ImageCms,ImageDraw
import hashlib,json,io,re,datetime
R=Path(__file__).resolve().parents[3];O=Path(__file__).resolve().parent;V=R/'docs/verification/mac-typography-keyboard-runtime36';N=R/'docs/research/mac-folder-tab-loop-original37';K=R/'docs/research/mac-folder-keyboard-original35';CHECKS=[]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def load(p):return json.loads(p.read_text())
def write(name,d):(O/name).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def check(name,ok):
 CHECKS.append({'name':name,'passed':bool(ok)})
 if not ok:raise AssertionError(name)
def ax(stem):return(V/(stem+'.ax.txt')).read_text()
def selected(s):
 m=re.search(r'Selected text: ```\n(.*?)\n```',s,re.S);return m.group(1)if m else None
def focused(s):
 m=re.search(r'The focused UI element is (.*)',s);return m.group(1)if m else None
def body(s):
 lines=s.splitlines();start=next((i for i,x in enumerate(lines)if'text entry area (settable) 备忘录正文, Value: 'in x),None)
 if start is None:return None
 found=[lines[start].split('备忘录正文, Value: ',1)[1]]
 for line in lines[start+1:]:
  if re.match(r'^\t*\d+ ',line):break
  found.append(line)
 return'\n'.join(found).rstrip()
def indexcheck(directory,expected,count):
 p=directory/'evidence-index.json';d=load(p);check(str(directory.relative_to(R))+' exact index SHA',sha(p)==expected);check('index count '+directory.name,d['count']==len(d['files'])==count)
 names=[]
 for row in d['files']:
  q=R/row['path'];names.append(q.name);check('sealed member '+row['path'],q.is_file()and not q.is_symlink()and q.stat().st_size==row['bytes']and sha(q)==row['sha256'])
 check('complete bounded directory '+directory.name,{q.name for q in directory.iterdir()if q.is_file()}==set(names)|{'evidence-index.json'})
 return d
try:
 runtime=indexcheck(V,'51382f745bfd7c01dc764cc7e176e9f7374162bf7a651fea75475e4edb0e8695',67)
 native=indexcheck(N,'3f3c2644ad5de5b684191bbcb6e18a1e1136efde921a42f7a1d2655fb9aa8185',8)
 oldNative=load(K/'evidence-index.json')
 for row in oldNative['files']:
  p=R/row['path'];check('original35 member '+row['path'],p.stat().st_size==row['bytes']and sha(p)==row['sha256'])
 result=load(V/'result.json');readme=(V/'README.md').read_text();EXE='b24f87623e49781859166d798dec052cb987692469ad2741847392b13e127812';SOURCE='182464bcc3055caadcd78fe4c7ce1a0ec31eea6a';P=R/'artifacts/unified-candidate06/mac-typography-keyboard-build13/mac-attempt02';exe=P/'mac-sealed.app/Contents/MacOS/notes-clone'
 check('exact immutable Mac13 executable actual bytes',sha(exe)==EXE)
 check('exact immutable Mac13 zip actual bytes',sha(P/'mac-sealed.zip')=='91dec624ade286756cd2eec5b8c0768c738821c8c2829b9089e42fa491001ae6')
 collection=load(R/'docs/verification/unified-candidate06/mac-typography-keyboard-build13/mac-attempt02/collection/result.json');check('sealed collection exact identity',sha(R/'docs/verification/unified-candidate06/mac-typography-keyboard-build13/mac-attempt02/collection/result.json')=='28f4fe004dcf4ce9b12f2bc2d623caf9ebaadcdfdac5661db9c4ee85612f7921'and collection['expectedHead']==SOURCE and collection['sealed']['executable']['sha256']==EXE and collection['ready'])
 packageResult=R/'docs/verification/unified-candidate06/mac-typography-keyboard-independent13/result.json';packageIndex=packageResult.parent/'evidence-index.json';check('prior exact package independent identity',sha(packageResult)=='c4100c407a823db65a9a96513d11ecbbe03ea85b870e299dff8dec48cc5865fa'and sha(packageIndex)=='df4bf669235bea3a68f40374bee8ae3dd8e44476b7b79a0fa7416a7c48207fd2')
 check('runtime summary source and truthful limits',result['sourceHead']==SOURCE and result['exeSha256']==EXE and result['status']=='finite-runtime-complete-with-known-differences'and result['ordinaryTabMatchesOriginal']is False and result['optionTabMatchesOriginal']is False and result['fullPixelParity']is False and result['fullInteractionParity']is False and result['excludedOperatorMisclick']==['08','09','10'])
 processes={}
 for stem,pid in [('03-new13-process','61906'),('25-hidden-restart-process','62539'),('29-visible-restart-process','62696')]:
  d=load(V/(stem+'.json'));check('saved process exact executable '+stem,d['executable']==str(exe)and d['sha256']==EXE and len(d['processes'])==1 and d['processes'][0]==pid+' '+str(exe));processes[stem]=d
 check('saved first process has explicit pid',processes['03-new13-process']['pid']=='61906'and processes['03-new13-process']['exactMac13'])
 check('saved hidden restart old pid gone clean ps',processes['25-hidden-restart-process']['oldPid61906Absent']and processes['25-hidden-restart-process']['psExit']==0 and processes['25-hidden-restart-process']['psError']=='')
 check('saved visible restart old pids gone clean ps',processes['29-visible-restart-process']['oldPidsAbsent']and processes['29-visible-restart-process']['psExit']==0 and processes['29-visible-restart-process']['psError']=='')
 check('saved process sequence timestamps',processes['03-new13-process']['at']<processes['25-hidden-restart-process']['at']<processes['29-visible-restart-process']['at']<result['at'])
 gone=load(V/'02-old12-exited.json');check('saved old12 fully absent before13',gone['allCloneProcessesAbsent']and gone['oldPid53139Absent']and gone['cloneProcesses']==[]and gone['at']<processes['03-new13-process']['at'])
 check('quit raw evidence retained','App quit'in(V/'01-old12-normal-quit.txt').read_text()and'App quit'in(V/'24-hidden-normal-quit.txt').read_text())
 full=['20-synthetic-restored-visible','21-sidebar-hidden-toolbar','23-sidebar-restored-menu','26-hidden-after-restart','27-hidden-restart-toolbar-restored','30-visible-after-restart','34-find-in-note-focus','35-native-search-focused','36-native-search-result','37-final-clear-search-visible'];basebody=body(ax(full[0]));check('QA body exact baseline text',basebody=='QA-SMART-U09-Mac-Tag\n本地智能文件夹验收。\n#QASmartU09')
 endpoints={}
 for stem in full:
  s=ax(stem);b=body(s);visible='button 全部备忘录 41'in s;counter=re.findall(r'button 全部备忘录 (\d+)',s);endpoints[stem]={'body':b,'bodySHA256':hashlib.sha256(b.encode()).hexdigest()if b is not None else None,'allNotesCount':counter,'sidebarVisibleAx':visible,'selectedFolderFooter':'QA-SMART-U09-Mac-Selected 1 个备忘录'in s,'searchResultFooter':'搜索结果 1 个备忘录'in s,'focused':focused(s)};check('same visible QA body '+stem,b==basebody)
  if stem not in ['21-sidebar-hidden-toolbar','26-hidden-after-restart']:check('visible total41 '+stem,counter==['41'])
  else:check('hidden sidebar absent from full AX '+stem,not counter and'button QA 独立验证'not in s)
 check('exact dynamic hidden menu label','\t\t2 显示文件夹, ID: customAction:'in ax('22-sidebar-hidden-display-menu')and'隐藏文件夹'not in ax('22-sidebar-hidden-display-menu'))
 check('exact dynamic visible menu label','\t\t2 隐藏文件夹, ID: customAction:'in ax('28-visible-display-menu')and'显示文件夹'not in ax('28-visible-display-menu'))
 check('both restore routes observed endpoints',endpoints['23-sidebar-restored-menu']['sidebarVisibleAx']and endpoints['27-hidden-restart-toolbar-restored']['sidebarVisibleAx'])
 check('hidden and visible restart endpoints',not endpoints['26-hidden-after-restart']['sidebarVisibleAx']and endpoints['30-visible-after-restart']['sidebarVisibleAx'])
 check('root finite sidebar flags match observations',all(result[k]is True for k in ['sidebarToolbarRestore','sidebarMenuDynamicLabelAndRestore','hiddenPreferenceNormalRestart','visiblePreferenceNormalRestart']))
 focus={}
 for stem in ['05-ordinary-initial-selected','11-clean-explicit-name-selected','12-clean-name-caret-end','13-clean-name-after-tab','14-ax-only-selected','15-ax-only-caret','16-ax-only-after-tab','17-continuous-right-tab','18-continuous-shifttab','19-continuous-tab-only','31-option-tab-draft']:
  s=ax(stem);focus[stem]={'selected':selected(s),'focused':focused(s),'nameDefaultIntact':'名称, Value: 新建文件夹'in s}
 check('default and explicit name full selection',all(focus[k]['selected']=='新建文件夹'for k in ['05-ordinary-initial-selected','11-clean-explicit-name-selected','14-ax-only-selected','18-continuous-shifttab']))
 check('Right caret endpoints keep focused intact name',all(focus[k]['selected']is None and'text field (settable) 名称, Value: 新建文件夹'in focus[k]['focused']for k in ['12-clean-name-caret-end','15-ax-only-caret']))
 check('Tab endpoints actual HTML focus not native checkbox',all(focus[k]['focused']=='2 HTML content Description: 备忘录, URL: tauri://localhost'and focus[k]['selected']is None and focus[k]['nameDefaultIntact']for k in ['13-clean-name-after-tab','16-ax-only-after-tab','17-continuous-right-tab','19-continuous-tab-only']))
 originals={}
 for stem in ['01-continuous-right-tab','02-shift-tab','03-continuous-tab-only']:
  s=(N/(stem+'.ax.txt')).read_text();originals[stem]={'selected':selected(s),'imageSHA256':sha(N/(stem+'.cua-image')),'axSHA256':sha(N/(stem+'.ax.txt'))};check('same-sequence original still full-selected '+stem,selected(s)=='新建文件夹')
 check('original37 duplicate images and AX acknowledged',len({d['imageSHA256']for d in originals.values()})==len({d['axSHA256']for d in originals.values()})==1)
 check('original37 cancelled no sheet endpoint','0 表单'not in(N/'04-escape-cancelled.ax.txt').read_text())
 check('Mac13 OptionTab unchanged name checkbox focus',focus['31-option-tab-draft']['nameDefaultIntact']and focus['31-option-tab-draft']['focused']=='9 checkbox 制作智能文件夹, Value: 0')
 originalOption=(K/'01-option-tab-inserts-tab.ax.txt').read_text();check('original35 literal TAB and name focus',re.search(r'^\t2 文本栏 \(settable\) \t$',originalOption,re.M)is not None and'The focused UI element is 2 文本栏 (settable) \t'in originalOption)
 check('ordinary smart unsaved roundtrip endpoint','名称, Value: 新建智能文件夹'in ax('32-smart-mode-unsaved')and'checkbox 制作智能文件夹, Value: 1'in ax('32-smart-mode-unsaved')and'pop up button 过滤条件类型, Value: 标签'in ax('32-smart-mode-unsaved')and'名称, Value: 新建文件夹'in ax('33-ordinary-mode-return-unsaved')and'checkbox 制作智能文件夹, Value: 0'in ax('33-ordinary-mode-return-unsaved'))
 check('escape sheet gone by next endpoint','container 新建文件夹'not in ax('34-find-in-note-focus')and body(ax('34-find-in-note-focus'))==basebody)
 check('find in note actual AX focus','text field (settable) 在备忘录中查找'in focused(ax('34-find-in-note-focus')))
 check('native search actual AX focus','search text field (settable) Description: 搜索备忘录'in focused(ax('35-native-search-focused')))
 check('native search title and one match','Description: 搜索备忘录, Value: QA-SMART-U09-Mac-Tag, Placeholder: 搜索'in ax('36-native-search-result')and endpoints['36-native-search-result']['searchResultFooter'])
 check('search cleared selected folder restored','Description: 搜索备忘录, Placeholder: 搜索'in ax('37-final-clear-search-visible')and'Description: 搜索备忘录, Value:'not in ax('37-final-clear-search-visible')and endpoints['37-final-clear-search-visible']['selectedFolderFooter']and not endpoints['37-final-clear-search-visible']['searchResultFooter'])
 check('root documents operator error exclusion','08–10排除'in readme and'操作错误不能作为产品点击穿透结论'in readme and'普通名称Tab循环仍不一致'in readme)
 typoIndex=R/'docs/research/mac-ordinary-typography36-runtime-analysis/evidence-index.json';typoResult=typoIndex.parent/'result.json';check('finite typography evidence exact sealed identity',sha(typoIndex)=='311ce2ab0a6f53c76ec0bf24f0b3f05cb0431a4e4d0a3b407ca995162e53bbf4'and sha(typoResult)=='e5e32e66b5f9335983d4e49e9630fb1fe5f98ee4757a5f8149065d1bd6111fb2')
 write('endpoints.json',{'savedProcesses':processes,'visibleBodyAndCounts':endpoints,'nameFocus':focus,'original37SameSequence':originals,'limits':'Saved AX endpoints and saved process records only, no replay. Hidden AX cannot show total count; initial00/04 AX are sparse and require visual reference. Root prose supplies key/menu/quit actions; screenshots do not encode event history.'})
 imageMeta=[];srgb=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB'))
 for directory,idx in [(V,runtime),(N,native)]:
  for row in idx['files']:
   p=R/row['path']
   if p.suffix!='.cua-image':continue
   with Image.open(p)as im:
    im.load();icc=im.info.get('icc_profile',b'');imageMeta.append({'path':row['path'],'format':im.format,'pixels':list(im.size),'iccBytes':len(icc),'iccSHA256':hashlib.sha256(icc).hexdigest(),'excludedOperatorState':directory==V and p.name[:2]in ['08','09','10']})
 check('saved images JPEG with embedded ICC',all(x['format']=='JPEG'and x['iccBytes']==4064 for x in imageMeta))
 # Excluded08-10 images decoded only for container integrity, never compared/used semantically.
 write('source-image-metadata.json',{'images':imageMeta,'limits':'Container/ICC facts, not lossless PNG or pixel parity; excluded08-10 decoded only for integrity.'})
 def normalized(p):
  im=Image.open(p);return ImageCms.profileToProfile(im.convert('RGB'),ImageCms.ImageCmsProfile(io.BytesIO(im.info['icc_profile'])),srgb,outputMode='RGB')
 canvas=Image.new('RGB',(1600,450*3),'#ddd');draw=ImageDraw.Draw(canvas)
 for i,(left,right)in enumerate([('01-continuous-right-tab','17-continuous-right-tab'),('02-shift-tab','18-continuous-shifttab'),('03-continuous-tab-only','19-continuous-tab-only')]):
  for j,(p,label)in enumerate([(N/(left+'.cua-image'),'Original37 '+left),(V/(right+'.cua-image'),'Mac13 '+right)]):
   im=normalized(p)
   if im.size!=(800,414):im=im.crop((688,453,1488,867))
   check('native comparison crop800x414 '+label,im.size==(800,414));draw.text((j*800+8,i*450+8),label+' | native800x414',fill='black');canvas.paste(im,(j*800,i*450+36))
 canvas.save(O/'tab-endpoints-native-srgb.png',icc_profile=srgb.tobytes())
 names=['00-old12-before-switch','04-new13-start-visible','21-sidebar-hidden-toolbar','26-hidden-after-restart','30-visible-after-restart','37-final-clear-search-visible'];canvas=Image.new('RGB',(2176,700*3),'#ddd');draw=ImageDraw.Draw(canvas)
 for i,stem in enumerate(names):
  im=normalized(V/(stem+'.cua-image'));check('full endpoint2176x1320 '+stem,im.size==(2176,1320));x=(i%2)*1088;y=(i//2)*700;draw.text((x+8,y+8),stem+' | diagnostic scale0.5',fill='black');canvas.paste(im.resize((1088,660),Image.Resampling.LANCZOS),(x,y+36))
 canvas.save(O/'sidebar-body-endpoints-halfscale-srgb.png',icc_profile=srgb.tobytes())
 write('result.json',{'status':'PASS limited independent record review, known interaction differences retained','stop':True,'checks':CHECKS,'assertions':len(CHECKS),'failed':[],'runtimeIndexSHA256':sha(V/'evidence-index.json'),'runtimeMembers':67,'original37IndexSHA256':sha(N/'evidence-index.json'),'original37Members':8,'sourceHeadForExactPackage':SOURCE,'executableSHA256':EXE,'findings':{'savedPackageProcessChain':'61906 ->62539 ->62696, exact path/hash, old-process absence retained','sidebarDynamicMenuAndBothRestoreEndpoints':'supported','hiddenAndVisibleRestartEndpoints':'supported by saved root sequence, new PID and AX/image endpoints','visibleQaBody':'same at ten full AX endpoints','visibleTotalCount':'41 at visible-sidebar endpoints; hidden count unobserved','ordinaryTabParity':False,'optionTabParity':False,'misclick08to10':'excluded from product conclusions','typography':'sealed finite analysis supports improvement; residuals retained'},'limits':['No independent replay, OS event trace, PID query or proof process-loaded bytes; saved records linked to current immutable file hashes.','Root prose supplies action sequences; endpoint screenshots do not independently encode key history or graceful shutdown internals.','00/04 AX are sparse; visual image evidence only for initial note/count, not full text extraction.','No DB query, zero-created/deleted fields remain root operation account; visible continuity cannot prove all storage/entity integrity.','No system Full Keyboard Access true/toggle, global key strategy, multiwindow, deep/dark/IME or complete smart rule acceptance.','No whole pixel/Tab PASS; operator errors08-10 retained but semantically excluded.']})
 print(json.dumps({'assertions':len(CHECKS),'status':'PASS limited record review; Tab/Option differences OPEN','imagesDecoded':len(imageMeta)},ensure_ascii=False))
except BaseException as e:
 write('attempt01-failure.json',{'error':repr(e),'checks':CHECKS});raise
