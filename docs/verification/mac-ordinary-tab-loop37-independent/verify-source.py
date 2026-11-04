from pathlib import Path
import json,hashlib,subprocess,re
R=Path(__file__).resolve().parents[3];A=R/'docs/verification/mac-ordinary-tab-loop37';O=Path(__file__).resolve().parent;BASE='26648d88021adf3abdcfdfe879453a3b36866613';SOURCE='1a5422fbc089b354b91e3d6b1db64b5e6ec9a2a9';HEAD='6e247ca20a8f29b1bd8358c3ffcce7c046bdb6c3';checks=[];commands=[]
def sha(b):return hashlib.sha256(b).hexdigest()
def load(p):return json.loads(p.read_text())
def check(name,yes):
 checks.append({'name':name,'pass':bool(yes)})
 if not yes:raise AssertionError(name)
def aggregate(rows):return sha(''.join(x['sha256']+'  '+x['path']+'\n'for x in rows).encode())
def git(*args):
 p=subprocess.run(['git',*args],cwd=R,capture_output=True);commands.append({'argv':['git',*args],'exitCode':p.returncode,'stdoutSHA256':sha(p.stdout),'stderr':p.stderr.decode()});check('read-only git command '+str(args[:2]),p.returncode==0);return p.stdout
try:
 check('fixed evidence HEAD',git('rev-parse','HEAD').decode().strip()==HEAD)
 check('head product correction initial base exact chain',git('rev-list','--max-count=4','HEAD').decode().splitlines()==[HEAD,SOURCE,'d3e467b2960075e2cb2749757de488c8cbd18ad1',BASE])
 index=load(A/'evidence-index.json');check('author69 exact root-supplied index SHA',sha((A/'evidence-index.json').read_bytes())=='7dde37e673400a0c25d0d45709842001e4bde45af2f32526b44257f7b178d16c'and len(index['files'])==69)
 for row in index['files']:
  p=R/row['path'];b=p.read_bytes();check('author sealed '+row['path'],len(b)==row['bytes']and sha(b)==row['sha256'])
 check('author exact result SHA',sha((A/'result.json').read_bytes())=='b2c5ccefd9e128bbf44adf35ef12bd353cea947816a1d5e38373df73ee280637')
 product=load(A/'product-source.json');allp=load(A/'all-product-inputs.json');paths=[x['path']for x in product['files']]
 check('exact13 changed catalog aggregate',len(paths)==13 and product['sourceCommit']==SOURCE and aggregate(product['files'])==product['changedProductAggregate']=='db33ed6cdb17b7cc144a1d4681f286a622231f04e75fa0e78e9a7528e0d37b27')
 check('exact307 full product catalog aggregate',len(allp['files'])==307 and allp['sourceCommit']==SOURCE and aggregate(allp['files'])==allp['productAggregate']=='5760f57413d117104dd2fdf3d07fffc0d41578b8d41e58a4a8c6dbefb68855f2')
 check('precisely approved13 changed source paths',git('diff','--name-only',BASE,SOURCE).decode().splitlines()==paths)
 check('author source patch exactly final base diff',git('diff',BASE,SOURCE)==(A/'source.patch').read_bytes())
 tree={}
 for entry in git('ls-tree','-rz','-r',SOURCE).split(b'\0'):
  if not entry:continue
  spec,path=entry.split(b'\t',1);mode,kind,oid=spec.decode().split();tree[path.decode()]=(mode,kind,oid)
 for row in allp['files']:
  p=R/row['path'];b=p.read_bytes();blob=hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest();check('current product exact commit blob '+row['path'],len(b)==row['bytes']and sha(b)==row['sha256']and row['path']in tree and tree[row['path']][1:] ==('blob',blob))
 check('all13 changed current hashes in catalog',all(next(x for x in allp['files']if x['path']==row['path'])==row for row in product['files']))
 correction=git('diff','d3e467b2960075e2cb2749757de488c8cbd18ad1',SOURCE).decode();check('final source correction only removes attach closed rejection',correction.count('\n-        if ([closedKeyboardWindows containsObject:window]) return 2;')==1 and len(git('diff','--name-only','d3e467b2960075e2cb2749757de488c8cbd18ad1',SOURCE).decode().splitlines())==1)
 for path in ['package.json','pnpm-lock.yaml','plugins/tauri-plugin-notes-ui/Cargo.toml','plugins/tauri-plugin-notes-ui/Cargo.lock','src-tauri/Cargo.lock','src-tauri/Cargo.toml','src-tauri/capabilities/macos-notes-ui.json','src/style.css','src/smart-folders.css']:
  check('preserved dependency host style '+path,git('show',BASE+':'+path)==(R/path).read_bytes())
 local=load(A/'local-artifacts.json')
 for row in local['files']:
  p=Path(row['absolutePath']);b=p.read_bytes();check('author preserved local artifact '+row['path'],len(b)==row['bytes']and sha(b)==row['sha256'])
 comp=load(A/'component-attempt08/result.json');check('author52 controlled component preserved',comp['status']=='PASS'and len(comp['checks'])==52 and all(x['pass']for x in comp['checks'])and comp['errors']==[]and comp['externalRequests']==[])
 native=(A/'native-query-attempt03.log').read_text();check('author13 C queries and real false getter preserved','PASS total=13'in native and'OBSERVED actual policy=0'in native and'FAIL 'not in native)
 rustNative=(A/'native-rust-run-attempt03.log').read_text();rn=load(A/'native-rust-run-attempt03.json');check('author5 actual Wry production command chain log',rn['exit']==0 and rn['status']=='finished'and rn['elapsed']<25 and'PASS real Rust/native chain total=5'in rustNative and'window_closed'in rustNative)
 chain=(A/'native-rust-chain.rs').read_text();check('actual Rust chain direct production command not IPC roundtrip','include!("../../../plugins/tauri-plugin-notes-ui/src/lib.rs")'in chain and'Builder::<tauri::Wry>'in chain and'.visible(false).focused(false)'in chain and'keyboard_navigation(main.as_ref().window().clone()'in chain)
 old=(A/'native-policy35-regression-attempt02.log').read_text();check('old35 regression27 preserved',len(re.findall(r'^PASS ',old,re.M))>=27 and'FAIL 'not in old)
 check('author final17 Rust tests preserved','17 passed; 0 failed'in(A/'rust-test-attempt04.log').read_text())
 ledger=load(A/'failure-ledger.json');check('all declared failure paths retained',all((A/x['path']).is_file()for x in ledger['items']))
 lib=(R/'plugins/tauri-plugin-notes-ui/src/lib.rs').read_text();mac=(R/'plugins/tauri-plugin-notes-ui/src/macos.rs').read_text();c=(R/'plugins/tauri-plugin-notes-ui/macos/keyboard.m').read_text();guest=(R/'plugins/tauri-plugin-notes-ui/guest-js/index.ts').read_text();bridge=(R/'src/native-keyboard.ts').read_text();controller=(R/'src/ordinary-folder-keyboard.ts').read_text();form=(R/'src/SmartFolderForm.tsx').read_text()
 cmd=lib[lib.index('async fn keyboard_navigation<R: Runtime>('):lib.index('pub fn init<R: Runtime>()')];check('IPC caller own label before main-only dispatch','own_window(&window, &window_label)?;'in cmd and'if window.label() != "main"'in lib and'Err(unsupported())'in lib)
 query=mac[mac.index('pub(super) async fn keyboard_navigation'):mac.index('fn keyboard_status')];check('main dispatch rechecks live current native identity',all(s in query for s in ['on_main(app, move ||','get_webview_window(window.label())','let native = window','let current_native = current','current_native != native','notes_ui_keyboard_navigation(native, &mut enabled)','0 | 1 => Ok']))
 check('main dispatcher propagates failure instead of bool fallback',all(s in mac for s in ['app.run_on_main_thread','catch_unwind','tx.send(result)','rx.recv()','Error::new("dispatch"']))
 nq=c[c.index('int notes_ui_keyboard_navigation'):c.index('@interface NotesUIKeyboardPolicy')];attach=c[c.index('int notes_ui_keyboard_attach'):c.index('int notes_ui_keyboard_destroy')];check('closed tracking limits query not old attach','[closedKeyboardWindows containsObject:window]'in nq and'[closedKeyboardWindows containsObject:window]'not in attach and'observeKeyboardWindowClose();'in attach)
 check('public getter read no writes in query','*enabled = NSApp.isFullKeyboardAccessEnabled ? 1 : 0;'in nq and'tabFocusesLinks'not in nq and'NSUserDefaults'not in c)
 check('closed observation owned once and windows weak','if (keyboardCloseObserver) return;'in c and'NSHashTable.weakObjectsHashTable'in c and'NSOperationQueue.mainQueue'in c)
 check('guest fixed command current label no binding',"invoke('plugin:notes-ui|keyboard_navigation', { windowLabel: getCurrentWindow().label })"in guest)
 check('bridge native main Mac gate and explicit bool validation',all(s in bridge for s in ['isTauri()','getCurrentWindow().label === "main"','!/Android|iPhone|iPad/','typeof result?.enabled !== "boolean"']))
 check('local ordinary-only form active gate','nativeMainKeyboardAvailable() && !mobile && !folder && !draft.smart && !busy'in form and'() => keyboardActiveRef.current && !busyRef.current'in form and'controller.dispose()'in form and'onKeyDown={(event) => ordinaryKeyboard.current?.handle(event.nativeEvent)}'in form)
 check('no added DOM or style markup beyond ref and handler',git('diff',BASE,SOURCE,'--','src/SmartFolderForm.tsx').decode().count('+              ref={ordinaryForm}')==1)
 for path in ['plugins/tauri-plugin-notes-ui/build.rs','plugins/tauri-plugin-notes-ui/permissions/default.toml','plugins/tauri-plugin-notes-ui/permissions/autogenerated/commands/keyboard_navigation.toml','plugins/tauri-plugin-notes-ui/permissions/autogenerated/reference.md','plugins/tauri-plugin-notes-ui/permissions/schemas/schema.json']:
  check('command permissions/build schema connected '+path,'keyboard-navigation'in(R/path).read_text()or'keyboard_navigation'in(R/path).read_text())
 check('controller local synchronous cancellation and per-request query','event.preventDefault();'in controller and'const enabled = await this.query();'in controller and'if (this.running) return;'in controller and'typeof enabled !== "boolean"'in controller and'target.select();'in controller)
 fresh=load(O/'focused-result.json');nr=load(O/'native-run.json');check('12 fresh meaningful component checks passed',fresh['status']=='PASS'and len(fresh['checks'])==12 and all(x['pass']for x in fresh['checks'])and fresh['errors']==[]and fresh['requests']==[])
 check('11 fresh native boundaries passed',nr['exitCode']==0 and'RESULT 11 independent native boundary checks'in nr['stdout']and'FAIL 'not in nr['stdout'])
 summary={'status':'PASS source review only','sourceReady':True,'actualMacAcceptance':'OPEN','base':BASE,'head':HEAD,'productCommit':SOURCE,'changedProductFiles':13,'allProductFiles':307,'authorSealedFiles':69,'authorLocalArtifacts':len(local['files']),'checks':checks,'passed':len(checks),'failed':[],'freshComponentChecks':12,'freshNativeChecks':11,'readOnlyGitCommands':commands,'limits':['Fresh component transport/system policy replies controlled; real production React/guest but Chromium is not WK/AppKit.','Independent C probe real public getter observed false only, exception and synthetic close are explicit process-local inputs.','Weak ownership tested with ephemeral NSObject sentinel in actual table, not NSApp retaining/releasing actual closed window.','True native Wry command chain is reviewed sealed author evidence, not independently rerun; it invokes production function directly, no permission IPC roundtrip.','No formal Mac build, GUI, actual keyboard focus/system toggle/IME or pixel acceptance.']}
 (O/'verification-result.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'passed':len(checks),'sourceReady':True,'freshComponentChecks':12,'freshNativeChecks':11}))
except BaseException as e:
 (O/'verification-attempt01-error.json').write_text(json.dumps({'error':repr(e),'checks':checks,'commands':commands},ensure_ascii=False,indent=2)+'\n');raise
