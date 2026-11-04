from pathlib import Path
import json,hashlib,re,zlib
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
AUTHOR=ROOT/'docs/verification/mac-keyboard-policy35'
CHECKS=[]
def check(name,value,detail=None):CHECKS.append({'name':name,'pass':bool(value),**({'detail':detail} if detail is not None else {})})
def read(p):return json.loads(Path(p).read_text())
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
identity=read(OUT/'identity.json')
check('fixed worktree HEAD',identity['resolvedHead']==identity['expectedHead'])
gitdir=Path(identity['gitDir']);common=(gitdir/(gitdir/'commondir').read_text().strip()).resolve()
def object_bytes(oid):
    raw=zlib.decompress((common/'objects'/oid[:2]/oid[2:]).read_bytes())
    assert hashlib.sha1(raw).hexdigest()==oid
    header,data=raw.split(b'\0',1);kind,length=header.split();assert int(length)==len(data)
    return kind.decode(),data
commits={}
for name in ['resolvedHead','productCommitAssigned','baseAssigned']:
    oid=identity[name];kind,data=object_bytes(oid);lines=data.decode().splitlines();commits[oid]={'kind':kind,'tree':lines[0].split()[1],'parents':[x.split()[1] for x in lines if x.startswith('parent ')]}
check('HEAD is log-preservation child of product commit',commits[identity['resolvedHead']]['parents']==[identity['productCommitAssigned']])
check('product commit directly follows assigned base',commits[identity['productCommitAssigned']]['parents']==[identity['baseAssigned']])
def tree(oid):
    kind,data=object_bytes(oid);assert kind=='tree';items=[];position=0
    while position<len(data):
        end=data.index(b'\0',position);mode,name=data[position:end].split(b' ',1);oid=data[end+1:end+21].hex();items.append((mode.decode(),name.decode(),oid));position=end+21
    return items
def descend(oid,path):
    for part in Path(path).parts:oid=next(x[2] for x in tree(oid) if x[1]==part)
    return oid
def walk(oid,prefix):
    result={}
    for mode,name,child in tree(oid):
        path=prefix+'/'+name
        if mode=='40000':result.update(walk(child,path))
        else:result[path]=object_bytes(child)[1]
    return result
prefix='plugins/tauri-plugin-notes-ui'
base_tree=commits[identity['baseAssigned']]['tree']
base_files=walk(descend(base_tree,prefix),prefix)
current_paths={str(p.relative_to(ROOT)) for p in (ROOT/prefix).rglob('*') if p.is_file() and 'target' not in p.parts}
actual_changes=sorted(p for p in set(base_files)|current_paths if p not in base_files or p not in current_paths or base_files[p]!=(ROOT/p).read_bytes())
allowed=sorted(prefix+'/'+p for p in ['src/lib.rs','src/macos.rs','build.rs','Cargo.toml','README.md','macos/keyboard.m'])
check('all plugin files against actual base Git blobs differ only at six approved paths',actual_changes==allowed,actual_changes)
products=read(AUTHOR/'product-files.json')
for item in products:check('product identity '+item['path'],len((ROOT/item['path']).read_bytes())==item['bytes'] and sha(ROOT/item['path'])==item['sha256'])
check('manifest has exactly six changed paths including new helper',sorted(x['path'] for x in products if x.get('changed') or x.get('new'))==allowed)
check('author21 sealed index SHA',sha(AUTHOR/'evidence-index.json')=='c18ae4d28262fb14595bbb6260721a2c414999df63e99590354886583bcdb0a6')
for item in read(AUTHOR/'evidence-index.json')['files']:
    p=ROOT/item['path'];check('sealed author evidence '+item['path'],len(p.read_bytes())==item['bytes'] and sha(p)==item['sha256'])
check('author index has21 files',len(read(AUTHOR/'evidence-index.json')['files'])==21)
initial=read(AUTHOR/'inputs.before.json')['inputs']
unchanged=[x for x in initial if x['path'] not in allowed and x['path']!='docs/plan/tasks/app-mac-keyboard-policy35.md']
for item in unchanged:check('protected baseline input '+item['path'],len((ROOT/item['path']).read_bytes())==item['bytes'] and sha(ROOT/item['path'])==item['sha256'])
for item in read(AUTHOR/'source-boundaries.json'):
    p=Path(item['path']);check('fixed primary API source '+item['label'],len(p.read_bytes())==item['bytes'] and sha(p)==item['sha256'])
    lines=p.read_text().splitlines()
    for excerpt in item['excerpts']:
        expected='\n'.join(str(i)+': '+lines[i-1] for i in range(excerpt['from'],excerpt['to']+1))
        check('primary API excerpt '+item['label']+' '+str(excerpt['from']),expected==excerpt['text'])
lib=(ROOT/prefix/'src/lib.rs').read_text();rust=(ROOT/prefix/'src/macos.rs').read_text();native=(ROOT/prefix/'macos/keyboard.m').read_text();build=(ROOT/prefix/'build.rs').read_text();cargo=(ROOT/prefix/'Cargo.toml').read_text()
check('ready hook Mac-only and separate from toolbar binding','.on_webview_ready(|webview|' in lib and '#[cfg(target_os = "macos")]\n            macos::install_keyboard_policy(webview);' in lib and '.on_drop' in lib)
check('native pair comes from one with_webview callback','webview.with_webview(move |native|' in rust and 'native.inner(),\n                native.ns_window(),' in rust)
check('dispatch failure separate from native completion','installation completed for' in rust and 'installation failed:' in rust and 'dispatch failed:' in rust)
check('destroyed and drop invoke independent keyboard cleanup','macos::destroy_keyboard_policy(app, Some(label));' in lib and 'macos::destroy_keyboard_policy(&app, None);' in lib)
check('native cleanup scheduled on main thread','app.run_on_main_thread(move || {' in rust and 'notes_ui_keyboard_destroy' in rust)
check('same pinned Tauri Mac-only wry feature','[target.\'cfg(target_os = "macos")\'.dependencies]\n# Native WKWebView access' in cargo and 'tauri = { version = "=2.12.5", default-features = false, features = ["wry"] }' in cargo)
check('native helper and WebKit build gated by Mac','if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos")' in build and '.file("macos/keyboard.m")' in build and '"WebKit"' in build)
check('system property queried directly into public preference','view.configuration.preferences.tabFocusesLinks = NSApp.isFullKeyboardAccessEnabled;' in native and not any(x in native for x in ['NSUserDefaults','addObserver:self','setValue:','valueForKey:']))
check('event identity preserved without modifier or DOM rewrite','return event;' in native and 'event.window == self.window' in native and 'event.type == NSEventTypeKeyDown && event.keyCode == 48' in native and not any(x in native for x in ['modifierFlags','sendEvent:','preventDefault','evaluateJavaScript']))
check('weak native targets and weak callback ownership','@property(nonatomic, weak) WKWebView *webview;' in native and '@property(nonatomic, weak) NSWindow *window;' in native and '__weak NotesUIKeyboardPolicy *weakPolicy = policy;' in native)
check('own token cleanup idempotent and registry removal explicit','if (self.disposed) return;' in native and '[NSEvent removeMonitor:self.monitor]' in native and '[NSNotificationCenter.defaultCenter removeObserver:observer]' in native and '[keyboardPolicies removeObjectForKey:key]' in native)

reg=Path('/Users/water/.cargo/registry/src/mirrors.ustc.edu.cn-38d0e5eb5da2abae')
api_specs=[(reg/'tauri-2.12.5/src/plugin.rs',[(515,537),(831,838)]),(reg/'tauri-2.12.5/src/manager/webview.rs',[(634,668)]),(reg/'tauri-runtime-wry-2.12.3/src/lib.rs',[(251,281),(1552,1559),(3891,3918)]),(reg/'tauri-2.12.5/src/webview/mod.rs',[(198,225),(1854,1867)])]
excerpts=[]
for p,ranges in api_specs:
    lines=p.read_text().splitlines()
    for a,b in ranges:excerpts.append({'path':str(p),'sha256':sha(p),'from':a,'to':b,'lines':['%d: %s'%(i,lines[i-1]) for i in range(a,b+1)]})
(OUT/'lifecycle-excerpts.json').write_text(json.dumps(excerpts,ensure_ascii=False,indent=2)+'\n')
manager=(reg/'tauri-2.12.5/src/manager/webview.rs').read_text();runtime=(reg/'tauri-runtime-wry-2.12.3/src/lib.rs').read_text()
check('fixed lifecycle creates registered Webview then calls plugins on main','self\n        .webviews_lock()\n        .insert(webview.label().to_string(), webview.clone());' in manager and 'let _ = webview.run_on_main_thread(move || {' in manager and '.webview_created(webview_);' in manager)
check('fixed runtime main-thread dispatcher inline otherwise enqueues','if current_thread().id() == self.main_thread_id {\n      handle_user_message(' in runtime and 'WebviewMessage::WithWebview(f)' in runtime)

run=read(OUT/'native-run.json');compile_record=read(OUT/'compile-command.json');passes=[line[5:] for line in run['stdout'].splitlines() if line.startswith('PASS ')]
check('fresh strict native compile succeeds',compile_record['exitCode']==0 and not compile_record['stderr'])
check('fresh independent31 runtime checks pass',run['exitCode']==0 and len(passes)==31 and 'RESULT 31 independent native checks' in run['stdout'] and not any(x.startswith('FAIL ') for x in run['stdout'].splitlines()))
check('fresh actual system query remained false with no toggle','REAL_SYSTEM before=0 after=0' in run['stdout'])
check('fresh explicit weak references both clear','RELEASE_BOUNDARY before-pool-drain A=0 B=0' in run['stdout'])
release=read(OUT/'release-only-run.json')
check('independent function-scope cleanup check passes',len(release)==2 and all(x['exitCode']==0 for x in release) and 'afterFunction A=0 B=0' in release[-1]['stdout'])
type_failure=read(OUT/'release-only-run-attempt02.json')[0]
check('original checker weak declaration bug has compiler evidence',type_failure['exitCode']==1 and "NotesUIKeyboardPolicy *__strong *" in type_failure['stderr'] and "__weak *" in type_failure['stderr'])
check('final references separately declared weak','__weak NotesUIKeyboardPolicy *releasedA=nil;\n        __weak NotesUIKeyboardPolicy *releasedB=nil;' in (OUT/'independent-mechanism.m').read_text() and '__weak NotesUIKeyboardPolicy *weakA=nil;\n    __weak NotesUIKeyboardPolicy *weakB=nil;' in (OUT/'release-only.m').read_text())
author_native=(AUTHOR/'native-mechanism.log').read_text();author_rust=(AUTHOR/'rust-test.log').read_text()
check('sealed author27 controlled checks recorded',len(re.findall(r'^PASS ',author_native,re.M))==27 and 'RESULT 27 controlled checks passed' in author_native)
check('sealed author existing16 Rust tests recorded','test result: ok. 16 passed; 0 failed;' in author_rust)
check('sealed retained original factory-event failures remain explicit',all('FAIL Tab boundary' in (AUTHOR/f).read_text() for f in ['native-mechanism-first-failure.log','native-mechanism-second-failure.log']) and 'ownWindowMatch=0' in (AUTHOR/'native-event-diagnostic.log').read_text())
result={'status':'PASS source/mechanism scope only' if all(x['pass'] for x in CHECKS) else 'BLOCKED','identity':identity,'commitObjects':commits,'basePluginFileCount':len(base_files),'sixProductChanges':actual_changes,'checks':CHECKS,'checkCount':len(CHECKS),'passed':sum(x['pass'] for x in CHECKS),'failed':[x for x in CHECKS if not x['pass']],'freshNativeChecks':passes,'sourceReviewLimits':['Native pointer/thread/error lifecycle reviewed against fixed Tauri sources; no actual Tauri/Wry product runtime instantiated.','Real system getter delegates to AppKit and remains false; subsequent true/false/key/notification/event ownership are controlled values.','Actual local monitor registration exists but real AppKit delivery and resulting WebKit focus movement are not exercised.','Status4 is injected by temporary process-local method implementation replacement, restored before next operation; not an observed AppKit failure.','Status5 uses process-local WK subclass configuration exception; not an observed product exception.','Original Option-Tab TAB insertion remains open; event identity/modifiers preserved is not insertion parity.','Fresh early retention failures were checker declaration errors, explicitly evidenced by Clang and retained with originals.','No system settings/GUI/ADB/DB/downloads/product/Git mutations or broad Rust/platform builds.']}
(OUT/'verification-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'status':result['status'],'checks':len(CHECKS),'passed':result['passed'],'failed':result['failed'],'basePluginFiles':len(base_files),'freshNativeChecks':len(passes)},ensure_ascii=False,indent=2))
