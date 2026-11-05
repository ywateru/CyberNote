from pathlib import Path
import hashlib, json, subprocess

ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
AUTHOR=ROOT/'docs/verification/mac-ordinary-option-insertion42'
BASE='f2bc755f854938c3d6bdcf8e1f6f40fa200de0f5'
PRODUCT='5fe06e13a681a80bf9fc7b0dc89aeaf853346696'
HEAD='6b85c75fb745731c27304d613ee0e6c7b53c16f2'
CONTRACT='a87cb8b2fbc2d818ff305925d5c2d40aec18488d'
TASK='docs/plan/tasks/app-mac-ordinary-option-insertion42.md'
checks=[]
def load(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def check(n,v,detail=None):checks.append({'name':n,'pass':bool(v),'detail':detail})
def dump(n,v):(OUT/n).write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT)
def rec(p):return {'path':str(p),'bytes':p.stat().st_size,'sha256':sha(p),'mtimeNs':p.stat().st_mtime_ns}
catalog=load(AUTHOR/'all-product-inputs.json')
index=load(AUTHOR/'evidence-index.json')
local=load(AUTHOR/'local-artifacts.json')
protected={ROOT/e['path'] for e in catalog['files']}
protected.update(AUTHOR/e['path'] for e in index['files'])
protected.update(AUTHOR/e['path'] for e in local['files'])
protected.update([AUTHOR/'evidence-index.json',ROOT/TASK,ROOT/'docs/ui/smart-folders-macos.md',ROOT/'docs/INDEX.md',ROOT/'README.md',ROOT/'.gitignore'])
refdirs=[ROOT/'docs/research'/n for n in ['mac-folder-option-history-original41','mac-folder-option-sequence-original43']]
for folder in refdirs:
    protected.update(ROOT/e['path'] for e in load(folder/'evidence-index.json')['files'])
    protected.add(folder/'evidence-index.json')
before=[rec(p) for p in sorted(protected)]
dump('protected-inputs.before.json',before)
contract=git('show',CONTRACT+':'+TASK)
main_task=Path('/Users/water/work/2026/Apple-Notes-Clone')/TASK
main_contract=main_task.read_bytes()
(OUT/'root-contract-a87cb8b.md').write_bytes(contract)
check('current explicit main task equals fixed root contract',main_contract==contract)
check('author tree old task is kept unchanged',git('show',BASE+':'+TASK)==(ROOT/TASK).read_bytes())
check('DOM-only exception explicit in contract','仅用原生value setter改DOM而无input'.encode() in contract and '不能承诺DOM现值/选区/历史事务一致'.encode() in (AUTHOR/'README.md').read_bytes())
check('fixed HEAD',git('rev-parse','HEAD').decode().strip()==HEAD)
check('product parent',git('rev-parse',PRODUCT+'^').decode().strip()==BASE)
check('evidence parent',git('rev-parse',HEAD+'^').decode().strip()==PRODUCT)
changed=git('diff','--name-only',BASE,PRODUCT).decode().splitlines()
check('only two product files',changed==['src/SmartFolderForm.tsx','src/ordinary-folder-option.ts'])
patch=git('diff',BASE,PRODUCT)
check('exact source patch',patch==(AUTHOR/'source.patch').read_bytes())
dump('source-identity.json',{'base':BASE,'product':PRODUCT,'head':HEAD,'rootContractCommit':CONTRACT,'rootContractSHA256':hashlib.sha256(contract).hexdigest(),'patch':patch.decode()})
for name,expected in [('product-source.json','c148cd6026b1ebf923f73e92700947857bb5cd09944375d5e79105aab8b5bc9a'),('all-product-inputs.json','7a00e6963d0493b4db118d7434fb726fc9c8d956c5c65466048f4b69595018c8')]:
    d=load(AUTHOR/name)
    aggregate=hashlib.sha256(''.join(e['sha256']+'  '+e['path']+'\n' for e in d['files']).encode()).hexdigest()
    check('aggregate '+name,aggregate==d['productAggregate']==expected)
    check('catalog count '+name,len(d['files'])==d['count'])
    for e in d['files']:
        p=ROOT/e['path'];content=p.read_bytes()
        check('source size/hash '+name+' '+e['path'],len(content)==e['bytes'] and sha(p)==e['sha256'])
        blob=hashlib.sha1(b'blob '+str(len(content)).encode()+b'\0'+content).hexdigest()
        check('Git blob '+name+' '+e['path'],blob==git('rev-parse',PRODUCT+':'+e['path']).decode().strip())
noncatalog=[p for p in git('ls-tree','-r','--name-only',PRODUCT).decode().splitlines() if not p.startswith(('docs/','references/')) and p not in {e['path'] for e in catalog['files']}]
check('catalog covers entire product except root docs',noncatalog==['.gitignore','README.md'])
check('author index exact hash',sha(AUTHOR/'evidence-index.json')=='4f2424b060e925654d91ebb96b115363c4a6e7c7061bb9f2adeabe0da274e188')
check('author index184',len(index['files'])==index['count']==184)
for e in index['files']:
    p=AUTHOR/e['path'];check('author indexed '+e['path'],p.stat().st_size==e['bytes'] and sha(p)==e['sha256'])
for e in local['files']:
    p=AUTHOR/e['path'];check('retained local artifact '+e['path'],p.stat().st_size==e['bytes'] and sha(p)==e['sha256'])
for folder in refdirs:
    d=load(folder/'evidence-index.json')
    check('original index count '+folder.name,len(d['files'])==d['count'])
    for e in d['files']:
        p=ROOT/e['path'];check('original indexed '+e['path'],p.stat().st_size==e['bytes'] and sha(p)==e['sha256'])
form=(ROOT/'src/SmartFolderForm.tsx').read_text();helper=(ROOT/'src/ordinary-folder-option.ts').read_text()
check('same onChange to update draft', 'onChange={(e) => update({ name: e.target.value })}' in form)
check('trusted native main caller gate', 'nativeMainKeyboardAvailable() && !mobile && !folder && !draft.smart && !busy' in form)
check('busy/warning guard', 'if (!keyboardActive || busyRef.current || warning) return;' in form)
check('real native event and current input', 'insertOrdinaryFolderOptionTab(event.nativeEvent, event.currentTarget)' in form)
check('existing37 form handler retained', 'onKeyDown={(event) => ordinaryKeyboard.current?.handle(event.nativeEvent)}' in form)
check('helper one literal TAB editing command',helper.count('document.execCommand(')==1 and 'document.execCommand("insertText", false, "\\t")' in helper)
check('helper no forbidden fallback',all(s not in helper for s in ['setRangeText','setDraft','dispatchEvent','new InputEvent','.focus(','.select(','.setSelectionRange(','.value =','execCommand("undo"','execCommand("redo"']))
check('strict true and real event validation','inserted === true && beforeInput && actualInput' in helper and helper.count('edit.isTrusted')==2)
check('observer lifetime always cleaned', 'finally {' in helper and helper.count('removeEventListener(')==2)
check('composition/modifier exclusions',all(s in helper for s in ['!event.altKey','event.ctrlKey','event.metaKey','event.isComposing','event.keyCode === 229','event.defaultPrevented']))
check('target/editability/selection preflight',all(s in helper for s in ['event.target !== input','document.activeElement !== input','!input.isConnected','input.type !== "text"','input.readOnly','input.matches(":disabled")','input.closest("[inert]")','!Number.isInteger(start)','end > input.value.length']))
for p in ['src/ordinary-folder-keyboard.ts','src/native-keyboard.ts','src/style.css','src/smart-folders.css','pnpm-lock.yaml']:
    check('unchanged37/style/lock '+p,git('show',BASE+':'+p)==(ROOT/p).read_bytes())
for attempt in ['02','03','04','05']:
    js=(AUTHOR/f'wk-attempt{attempt}/fixture.js').read_text()
    check('production helper present bundle'+attempt,'function insertOrdinaryFolderOptionTab(event, input)' in js and 'insertOrdinaryFolderOptionTab(event.nativeEvent, event.currentTarget)' in js and 'onChange: (e) => update({ name: e.target.value })' in js)
    check('real onSave fixture bundle'+attempt,'requestSubmit()' in js and 'structuredClone(draft)' in js)
    meta=load(AUTHOR/f'wk-attempt{attempt}/metafile.json')['inputs']
    for p in ['src/SmartFolderForm.tsx','src/ordinary-folder-option.ts','src/ordinary-folder-keyboard.ts','src/native-keyboard.ts','src/style.css','src/smart-folders.css']:
        check('bundle exact source length'+attempt+' '+p,p in meta and meta[p]['bytes']==(ROOT/p).stat().st_size)

# Parse raw original stdout, independently reconstruct endpoints/events, do not rerun author assertions.
author_result=load(AUTHOR/'verification-result.json');selected=[]
check('selected scenario count30',len(author_result['wkResults'])==30 and len({r['scenario'] for r in author_result['wkResults']})==30)
check('selected assertion total237',sum(r['checks'] for r in author_result['wkResults'])==237)
for entry in author_result['wkResults']:
    path=AUTHOR/entry['path'];stem=path.with_name(path.name.removesuffix('.result.json'))
    result=load(path);raw=json.loads(stem.with_suffix('.stdout').read_text());meta=load(stem.with_suffix('.json'));stderr=stem.with_suffix('.stderr').read_text()
    scenario=entry['scenario'];row=result['rows'][0]
    check('raw stdout equals parsed result '+scenario,raw==result)
    check('bounded real hidden WK completion '+scenario,meta['exit']==0 and meta['status']=='finished' and meta['elapsedSeconds']<35 and 'Own host visible=0 key=0 main=0 undoManager=1' in stderr)
    check('selected checks retained '+scenario,result['status']=='PASS' and result['scenario']==scenario and len(result['checks'])==entry['checks'] and all(c['pass'] for c in result['checks']))
    initial=result['checks'][0]['detail']
    check('isolated empty initial history '+scenario,not initial['undo'] and not initial['redo'])
    check('hidden focus limit retained '+scenario,not row['before']['documentFocus'] and not row['after']['documentFocus'])
    before=row['before'];after=row['after'];events=row.get('events',[])
    if not scenario.startswith('exclude-'):
        check('all recorded editing events trusted '+scenario,all(e['isTrusted'] for e in events))
        check('events paired beforeinput/input '+scenario,len(events)%2==0 and all(events[i]['kind']=='beforeinput' and events[i+1]['kind']=='input' and events[i]['inputType']==events[i+1]['inputType'] for i in range(0,len(events),2)))
    if scenario in ['select-all','caret-middle','replace-CD41','shift-end','sequence43']:
        expected=before['value'][:before['start']]+'\t'+before['value'][before['end']:]
        check('reconstructed single TAB/current selection '+scenario,after['value']==expected and after['start']==after['end']==before['start']+1 and after['focused'] and not after['error'])
        insert=[e for e in events if e['inputType']=='insertText' and e['kind']=='input' and e['data']=='\t']
        check('exact TAB input event count '+scenario,len(insert)==(2 if scenario=='sequence43' else 1))
        for typ in ['historyUndo','historyRedo']:
            check('one real history pair '+scenario+' '+typ,len([e for e in events if e['inputType']==typ])==2)
        check('redo visible endpoint '+scenario,row['undoReturn'] and row['redoReturn'] and row['redo']['value']==(row['second']['value'] if row['second'] else expected) and row['redo']['focused'])
        if scenario=='replace-CD41':
            check('41 exact undo value and CD selection',row['undo']['value']=='QA-OPT41-ABCD' and row['undo']['start']==11 and row['undo']['end']==13 and row['undo']['focused'])
        if scenario in ['select-all','sequence43']:
            check('default full-selection grouped undo '+scenario,row['undo']['value']=='新建文件夹' and row['undo']['start']==0 and row['undo']['end']==5)
        if scenario=='sequence43':
            check('43 two literal tabs and one grouped undo',row['second']['value']=='QA-OPT43-ABCD\t\t' and row['second']['start']==row['second']['end']==15 and not row['undo']['undo'] and row['undo']['redo'])
        if scenario!='select-all':
            detail=next(c['detail'] for c in result['checks'] if c['name']=='existing onChange/update/draft reaches production onSave')
            check('actual production save captures edited draft '+scenario,detail['saves'][0]['name']==row['redo']['value'])
    elif scenario.startswith('failure-'):
        mode=scenario.removeprefix('failure-');partial=mode in ['partial-false','partial-throw','wrong-success']
        check('failure single command or zero preflight '+scenario,after['attempts']==(0 if mode in ['missing','readonly'] else 1) and after['error']=='无法完成输入，请检查名称后重试。')
        if partial:
            check('partial preserves real edited state '+scenario,after['value']=='QA-OPT41-ABP' and after['start']==after['end']==12 and after['focused'])
            inputs=[e for e in events if e['kind']=='input']
            check('partial history restores CD then redoes P '+scenario,[(e['inputType'],e['value'],e['start'],e['end']) for e in inputs][-3:]==[('insertText','QA-OPT41-ABP',12,12),('historyUndo','QA-OPT41-ABCD',11,13),('historyRedo','QA-OPT41-ABP',12,12)])
        else:
            check('no-edit failure original selection/value '+scenario,after['value']==before['value'] and after['start']==before['start'] and after['end']==before['end'] and after['focused'] and len(events)==2)
        detail=next(c['detail'] for c in result['checks'] if c['name']=='failure retains true production draft onSave')
        check('failure true draft reaches save '+scenario,detail['saves'][0]['name']==after['value'])
    elif scenario=='anomaly-dom-only':
        check('DOM-only explicitly failure observation',entry['anomalyIsProductFailureObservation'])
        check('DOM-only inside differs but last real draft restored',row['inside']['value']=='QA-OPT41-ABP' and row['inside']['start']==row['inside']['end']==12 and after['value']==before['value']=='QA-OPT41-ABCD' and after['start']==after['end']==13 and after['error'])
        check('DOM-only no insertion event pair',len(events)==6 and [(e['inputType'],e['data']) for e in events if e['kind']=='input']==[('insertText','QA-OPT41-ABCD'),('historyUndo',None),('historyRedo',None)])
        check('DOM-only history effect retained',row['undoReturn'] and row['redoReturn'] and row['undo']['value']==row['redo']['value']==before['value'] and not row['undo']['undo'] and row['undo']['redo'] and row['redo']['undo'] and not row['redo']['redo'])
    else:
        check('excluded path command0/unchanged/default '+scenario,after['attempts']==0 and after['value']==before['value'] and not after['error'] and row['prevented']==(scenario=='exclude-prevented'))
    selected.append({'scenario':scenario,'path':entry['path'],'checks':entry['checks'],'elapsedSeconds':meta['elapsedSeconds'],'before':before,'after':after,'eventSequence':[(e['kind'],e['inputType'],e['data'],e['value'],e['start'],e['end']) for e in events],'scope':'Independent interpretation of sealed raw logs, not a fresh native run'})
reg=load(AUTHOR/'chromium-attempt02/result.json')
check('37 regression7 retained',reg['status']=='PASS' and len(reg['checks'])==7 and all(c['pass'] for c in reg['checks']) and reg['errors']==reg['externalRequests']==[])
details=[c.get('detail') for c in reg['checks']]
check('37 query counts exact main command',len(details[1]['calls'])==1 and len(details[2]['calls'])==2 and all(c=={'cmd':'plugin:notes-ui|keyboard_navigation','args':{'windowLabel':'main'}} for c in details[2]['calls']))
check('37 normal input/save/Escape',details[4]['saves'][0]['name']=='正常输入' and details[5]['cancels']==1)
failure=load(AUTHOR/'failure-ledger.json')
check('seven failure records retained',len(failure['failures'])==7 and all((AUTHOR/e['attempt']).is_file() for e in failure['failures']))
check('DOM-only early FAIL retained',load(AUTHOR/'wk-attempt04/anomaly-dom-only.result.json')['status']=='FAIL')
check('busy early FAIL retained',load(AUTHOR/'wk-attempt04/exclude-busy.result.json')['status']=='FAIL')
for folder,count in [(refdirs[0],1),(refdirs[1],2)]:
    file=folder/('04-after-redo.ax.txt' if count==1 else '05-redo.ax.txt')
    expected=('QA-OPT41-AB' if count==1 else 'QA-OPT43-ABCD')+'\t'*count
    check('original AX literal TAB endpoint '+folder.name,expected in file.read_text())
check('original41 CD undo selection','Selected text: ```\nCD\n```' in (refdirs[0]/'03-after-undo.ax.txt').read_text())
check('original43 default selected undo','Selected text: ```\n新建文件夹\n```' in (refdirs[1]/'04-undo.ax.txt').read_text())
dump('independent-log-analysis.json',{'method':'Parse raw stdout, compare parsed records/metadata, independently reconstruct selection replacement, event pairs, draft save and undo endpoints. No new WK/browser/native execution.','scenarios':selected,'scenarioCount':len(selected),'authorSelectedAssertions':237,'chromiumRegression':reg,'limits':['Synthetic DOM key routing, controlled Tauri metadata/transport','Hidden WK document.hasFocus false; OS Option/Cmd key path untested','DOM-only anomaly explicit product failure; natural React render changes selection/history']})
after=[rec(p) for p in sorted(protected)];dump('protected-inputs.after.json',after)
unchanged=[a==b for a,b in zip(before,after)]
check('protected bytes/SHA/mtime unchanged',all(unchanged))
dump('integrity-result.json',{'status':'PASS' if all(unchanged) else 'FAIL','protectedCount':len(before),'unchangedCount':sum(unchanged),'bytesSHA256MtimeAllUnchanged':all(unchanged)})
result={'status':'PASS' if all(c['pass'] for c in checks) else 'FAIL','stop':'SOURCE-READY READY STOP','scope':'Fixed source, source/evidence identity, independent semantic review of sealed real WK/native-history logs; no fresh runtime or actual package acceptance','base':BASE,'sourceCommit':PRODUCT,'evidenceHead':HEAD,'rootContractCommit':CONTRACT,'assertions':len(checks),'passed':sum(c['pass'] for c in checks),'productSeedFiles':308,'authorIndexFiles':184,'retainedLocalArtifacts':len(local['files']),'reviewedWKScenarios':30,'authorWKAssertions':237,'authorChromiumAssertions':7,'protectedInputs':len(before),'checks':checks}
dump('verification-result.json',result)
print(json.dumps({k:v for k,v in result.items() if k!='checks'},ensure_ascii=False))
if not all(c['pass'] for c in checks):
    print(json.dumps([c for c in checks if not c['pass']],ensure_ascii=False));raise SystemExit(1)
