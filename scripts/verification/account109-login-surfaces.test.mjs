import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {accountFixture, signedOutAccount} from '../debug/account-fixture.mjs';

// Device-free host for real React DOM commits. User actions below invoke the
// actual committed React props; no browser event routing/layout is claimed.
let document;
class HostNode {
  constructor(type,name) {this.nodeType=type;this.nodeName=name;this.ownerDocument=document;this.parentNode=null;this.childNodes=[];}
  appendChild(node) {node.parentNode?.removeChild(node);this.childNodes.push(node);node.parentNode=this;return node;}
  insertBefore(node,before) {node.parentNode?.removeChild(node);const i=this.childNodes.indexOf(before);assert(i>=0);this.childNodes.splice(i,0,node);node.parentNode=this;return node;}
  removeChild(node) {const i=this.childNodes.indexOf(node);assert(i>=0);this.childNodes.splice(i,1);node.parentNode=null;return node;}
  get firstChild() {return this.childNodes[0]??null;}
  get nextSibling() {return this.parentNode?.childNodes[this.parentNode.childNodes.indexOf(this)+1]??null;}
  get isConnected() {return this===document || !!this.parentNode?.isConnected;}
  contains(node) {return this===node || this.childNodes.some(c=>c.contains(node));}
  get textContent() {return this.nodeType===3?this.nodeValue:this.childNodes.map(c=>c.textContent).join('');}
  set textContent(value) {for(const child of [...this.childNodes])this.removeChild(child);if(value)this.appendChild(new HostText(String(value)));}
  addEventListener() {} removeEventListener() {}
}
class HostText extends HostNode {
  constructor(value) {super(3,'#text');this.nodeValue=value;}
}
class HostElement extends HostNode {
  constructor(name='div') {
    super(1,name.toUpperCase());this.tagName=this.nodeName;this.localName=name;this.namespaceURI='http://www.w3.org/1999/xhtml';this.attributes={};
    this.style={setProperty(k,v){this[k]=v;},removeProperty(k){delete this[k];}};
  }
  setAttribute(key,value) {this.attributes[key]=String(value);if(key==='disabled')this.disabled=true;if(key==='type')this.type=value;}
  removeAttribute(key) {delete this.attributes[key];if(key==='disabled')this.disabled=false;}
  getAttribute(key) {return this.attributes[key]??null;}
  setAttributeNS(_ns,key,value) {this.setAttribute(key,value);}
  removeAttributeNS(_ns,key) {this.removeAttribute(key);}
  focus() {document.activeElement=this;}
  scrollIntoView() {throw Error('account confirmation must not scroll inline');}
  matches(selector) {return selector===':disabled'&&!!this.disabled;}
  querySelector(selector) {return descendants(this).find(e=>selector==='button:not(:disabled)'?e.localName==='button'&&!e.disabled:e.localName===selector)??null;}
  querySelectorAll(selector) {return descendants(this).filter(e=>['button','input','summary'].includes(e.localName)&&!e.disabled&&!descendants(this).some(p=>p.localName==='fieldset'&&p.disabled&&p.contains(e)));}
  // Observe requests to the native dialog API; this host does not simulate
  // browser top-layer rendering, hit testing or automatic background inertness.
  showModal() {assert.equal(this.localName,'dialog');assert(!this.open);this.open=true;this.modalShows=(this.modalShows??0)+1;}
  close() {assert.equal(this.localName,'dialog');this.open=false;}
}
document=new HostNode(9,'#document');document.ownerDocument=document;
document.createElement=name=>new HostElement(name);
document.createElementNS=(_ns,name)=>new HostElement(name);
document.createTextNode=value=>new HostText(value);
document.visibilityState='visible';document.body=document.appendChild(new HostElement('body'));document.activeElement=document.body;
const intervals=new Map();let timerId=0;
const fixtureNavigator={userAgent:'Fixture Mac'};
const window={document,navigator:fixtureNavigator,HTMLElement:HostElement,HTMLIFrameElement:class {},addEventListener(){},removeEventListener(){},
  setInterval(fn){const id=++timerId;intervals.set(id,fn);return id;},clearInterval(id){intervals.delete(id);}};
document.defaultView=window;
Object.assign(globalThis,{window,document,HTMLElement:HostElement,IS_REACT_ACT_ENVIRONMENT:true});
const React=await import('react');
const {createRoot}=await import('react-dom/client');
const {act}=React;
const require=createRequire(import.meta.url);
const {build}=createRequire(require.resolve('vite'))('esbuild');
const built=await build({stdin:{contents:`export {default as AccountSettings} from './src/AccountSettings'; export * from './src/account-client'; export {catalog} from './src/debug/catalog'; export {registerDebug} from './src/debug/runtime';`,resolveDir:resolve('.'),loader:'ts'},
  bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime'],loader:{'.css':'empty'},
  define:{'import.meta.env.DEV':'true','import.meta.env.VITE_NOTES_DEBUG':'"1"','import.meta.env.VITE_NOTES_ACCOUNT_NATIVE':'"1"','import.meta.env.VITE_NOTES_ACCOUNT_UI':'"0"'},
  plugins:[{name:'fixed-ipc-fixture',setup(b){
    b.onResolve({filter:/^@tauri-apps\/api\/core$/},()=>({path:'ipc',namespace:'fixture'}));
    b.onResolve({filter:/^lucide-react$/},()=>({path:'icons',namespace:'fixture'}));
    b.onResolve({filter:/^\.\/data-management$/},()=>({path:'time',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path==='ipc'
      ? 'export const isTauri=()=>true; export const invoke=(name,args)=>globalThis.__invoke(name,args);'
      : path==='icons'?'export const UserRound=()=>null,Laptop=()=>null,Smartphone=()=>null,MonitorSmartphone=()=>null,RefreshCw=()=>null,ChevronRight=()=>null,Pencil=()=>null,FileText=()=>null,Check=()=>null,LoaderCircle=()=>null,KeyRound=()=>null,HardDrive=()=>null;'
      : 'export const formatFileTime=()=>"Fixture time";'}));
  }}]});

function descendants(node) {return node.childNodes.flatMap(c=>[c,...descendants(c)]).filter(n=>n.nodeType===1);}
function props(node) {const key=Object.keys(node).find(k=>k.startsWith('__reactProps$'));assert(key);return node[key];}
function deferred() {let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
const authorizing=surface=>({...signedOutAccount(),state:'authorizing',...(surface?{authorizationSurface:surface}:{})});
const adoptionRecoveryGuidance='若旧同步来自“设备同步”，可退出当前账户，再前往“设备同步”恢复并处理旧同步。若旧账户仍有待接收内容，可退出当前账户并重新登录旧账户；身份及同步空间验证通过且原同步凭证仍可用时，会恢复旧设备身份，同步仍保持暂停。请确认开启原同步空间并处理待接收内容，完成后再退出，登录目标账户并确认开启合并。';

// Extract the real production registration expression, rather than duplicating
// the handler allowlist in a test-only adapter. No App/native process is mounted.
const appAST=ts.createSourceFile('App.tsx',readFileSync('src/App.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const accountMaps=[];
function findAccountMap(node){
 if(ts.isCallExpression(node)&&node.expression.getText(appAST)==='Object.fromEntries'&&node.arguments[0]?.getText(appAST).includes('accountSettingsHandle.current.run'))accountMaps.push(node);
 ts.forEachChild(node,findAccountMap);
}
findAccountMap(appAST);assert.equal(accountMaps.length,1);
const appAccountMap=ts.transpileModule('('+accountMaps[0].getText(appAST)+')',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;

function setup(t,{initial=signedOutAccount(),reply,onConflicts=()=>{}}={}) {
  let native=structuredClone(initial),handle;
  const calls=[],context=vm.createContext({module:{exports:{}},require,window,document,navigator:fixtureNavigator,HTMLElement:HostElement,queueMicrotask,structuredClone,requestAnimationFrame:callback=>{queueMicrotask(()=>callback(0));return 1;},
    __invoke:async(name,{command})=>{
      assert.equal(name,'account_command');calls.push(structuredClone(command));
      if(reply){const result=reply(command,{get:()=>native,set:s=>{native=structuredClone(s);}});if(result!==undefined)return result;}
      if(command.type==='signIn'||command.type==='signUp')native=authorizing(Object.hasOwn(command,'surface')?command.surface:'browser');
      else if(command.type==='cancel'||command.type==='signOut')native=signedOutAccount();
      else if(command.type==='openLoginInBrowser'){assert.equal(native.authorizationSurface,'embedded');native=authorizing('browser');}
      return structuredClone(native);
    }});
  vm.runInContext(built.outputFiles[0].text,context,{timeout:1000});
  const client=context.module.exports;
  const container=document.body.appendChild(new HostElement());const root=createRoot(container);
  t.after(async()=>{await act(async()=>root.unmount());document.body.removeChild(container);});
  const all=()=>descendants(container);
  const h={client,calls,setNative:s=>{native=structuredClone(s);},getNative:()=>native,
    async mount(){await act(async()=>root.render(React.createElement(client.AccountSettings,{active:true,onHandle:h=>{handle=h;},onConflicts})));},
    debug(){
      context.accountUIAvailable=true;context.modal='preferences';context.preferencesTab='account';
      context.accountSettingsHandle={get current(){return handle;}};
      const handlers=vm.runInContext(appAccountMap,context);
      const stop=client.registerDebug(()=>({handlers,state:()=>({failure:{serial:0}})}));t.after(stop);
      return {list:()=>window.__NOTES_DEBUG__.list(),async execute(command,args){
        context.debugArgs=JSON.stringify(args);
        return window.__NOTES_DEBUG__.execute(command,vm.runInContext('JSON.parse(debugArgs)',context));
      },setPage:page=>{context.preferencesTab=page;}};
    },
    all,handle:()=>handle,text:()=>container.textContent,
    panel:()=>all().find(e=>props(e).className==='account-settings'),
    radio:value=>all().find(e=>e.localName==='input'&&props(e).name==='account-login-surface'&&props(e).value===value),
    storageRadio:value=>all().find(e=>e.localName==='input'&&props(e).name==='account-credential-storage'&&props(e).value===value),
    buttons:()=>all().filter(e=>e.localName==='button'),
    button:label=>all().find(e=>e.localName==='button'&&e.textContent===label),
    actionLabels:()=>{const section=all().find(e=>props(e)['aria-label']==='CyberNote 账户');return descendants(section).filter(e=>e.localName==='button').map(e=>e.textContent);},
    async click(label){const button=h.button(label);assert(button,`Missing ${label}`);assert(!props(button).disabled);const modal=all().find(e=>e.localName==='dialog'&&e.open);assert(!modal||modal.contains(button),'host actions must respect native modal isolation');await act(async()=>{props(button).onClick({currentTarget:button});});},
    async choose(value){const radio=h.radio(value);assert(radio);const fieldset=all().find(e=>e.localName==='fieldset');assert(!props(fieldset).disabled);await act(async()=>{props(radio).onChange();});},
    async chooseStorage(value){const radio=h.storageRadio(value);assert(radio);const fieldset=all().find(e=>e.localName==='fieldset'&&descendants(e).includes(radio));assert(!props(fieldset).disabled);await act(async()=>{props(radio).onChange();});},
    async poll(){await act(async()=>{await handle.run({type:'status'});});},
    async tick(){await act(async()=>{for(const fn of intervals.values())fn();});},
  };
  return h;
}

test('IPC preserves omitted browser compatibility and only fixed optional surfaces/transfer',async t=>{
 const h=setup(t);
 for(const type of ['signIn','signUp'])for(const extra of [{},{surface:'embedded'},{surface:'browser'}]){
  await h.client.accountCommand({type,...extra});
  assert.deepEqual(h.calls.at(-1),{type,...extra});
 }
 h.setNative(authorizing('embedded'));await h.client.accountCommand({type:'openLoginInBrowser'});
 assert.deepEqual(h.calls.at(-1),{type:'openLoginInBrowser'});
 for(const surface of [undefined,null,0,false,{},[],'unknown','https://private.invalid'])
  for(const type of ['signIn','signUp'])await assert.rejects(h.client.accountCommand({type,surface}),/无效数据/);
 for(const command of [{type:'signIn',url:'untrusted'},{type:'signUp',clientId:'untrusted'},
  {type:'openLoginInBrowser',surface:'embedded'},{type:'openLoginInBrowser',url:'untrusted'},
  {type:'status',surface:'embedded'},{type:'signOut',token:'untrusted'}])await assert.rejects(h.client.accountCommand(command),/无效数据/);
 assert.equal(h.calls.length,7,'invalid requests never reach invoke');
});

test('real account UI defaults embedded; both radios and both buttons share explicit choice',async t=>{
 for(const type of ['signIn','signUp'])for(const surface of ['embedded','browser']){
  const h=setup(t);await h.mount();assert.deepEqual(h.actionLabels(),['登录','创建账户']);assert(props(h.radio('embedded')).checked);
  assert(h.text().includes('登录用户名区分大小写，请按注册时的写法输入。'));
  const before=h.calls.length;await h.choose(surface);assert.equal(h.calls.length,before,'radio selection has no IPC');
  await h.click(type==='signIn'?'登录':'创建账户');assert.deepEqual(h.calls.at(-1),{type,surface});
  assert.deepEqual(h.actionLabels(),surface==='embedded'?['取消登录','在浏览器中继续']:['取消登录']);
  assert(props(h.all().find(e=>e.localName==='fieldset')).disabled);
 }
});

test('waiting text/data follow only native surface; missing legacy field stays unknown',async t=>{
 for(const surface of [undefined,'embedded','browser']){
  const h=setup(t,{initial:authorizing(surface)});await h.mount();
  assert.equal(h.panel().getAttribute('data-account-authorization-surface'),surface??null);
  assert(h.text().includes(surface==='embedded'?'请在应用内登录窗口中完成授权':surface==='browser'?'请在系统浏览器中完成授权':'请完成登录授权'));
  assert.deepEqual(h.actionLabels(),surface==='embedded'?['取消登录','在浏览器中继续']:['取消登录']);
  await h.tick();assert(h.calls.every(c=>c.type==='status'),'polling never opens or transfers authorization');
 }
});

test('transfer failure retains embedded owner/status and explicit retry never starts another signIn',async t=>{
 let fail=true;
 const h=setup(t,{initial:authorizing('embedded'),reply:(command,model)=>{
  if(command.type==='openLoginInBrowser'&&fail){fail=false;const s={...authorizing('embedded'),error:{code:'account_network',stage:'browserOpen',message:'safe'}};model.set(s);return s;}
 }});await h.mount();await h.click('在浏览器中继续');
 assert(h.text().includes('未能打开系统浏览器'));assert(h.text().includes('你仍可在应用内登录窗口完成授权'));
 assert.equal(h.panel().getAttribute('data-account-authorization-surface'),'embedded');
 assert.deepEqual(h.actionLabels(),['取消登录','在浏览器中继续']);
 await h.tick();assert.equal(h.calls.filter(c=>c.type==='openLoginInBrowser').length,1);
 await h.click('在浏览器中继续');assert.equal(h.panel().getAttribute('data-account-authorization-surface'),'browser');
 assert(!h.text().includes('未能打开系统浏览器'));assert.deepEqual(h.actionLabels(),['取消登录']);
 assert.equal(h.calls.filter(c=>c.type==='signIn'||c.type==='signUp').length,0);
});

test('pending original opener allows status and transfer; its late response cannot undo browser surface',async t=>{
 const opener=deferred();
 const h=setup(t,{reply:(command,model)=>{
  if(command.type==='signIn'){model.set(authorizing('embedded'));return opener.promise;}
 }});await h.mount();await h.click('登录');await h.tick();
 assert.equal(h.panel().getAttribute('data-account-authorization-surface'),'embedded');
 assert(!props(h.button('在浏览器中继续')).disabled);await h.click('在浏览器中继续');
 assert.equal(h.panel().getAttribute('data-account-authorization-surface'),'browser');
 await act(async()=>opener.resolve(authorizing('embedded')));
 assert.equal(h.panel().getAttribute('data-account-authorization-surface'),'browser');
 assert.equal(h.calls.filter(c=>c.type==='signIn').length,1);await h.click('取消登录');assert.deepEqual(h.actionLabels(),['登录','创建账户']);
});

test('cancel during transfer permits a new generation; late old transfer cannot overwrite it',async t=>{
 const transfer=deferred();
 const h=setup(t,{initial:authorizing('embedded'),reply:command=>command.type==='openLoginInBrowser'?transfer.promise:undefined});
 await h.mount();await h.click('在浏览器中继续');assert(!props(h.button('取消登录')).disabled);
 await h.click('取消登录');await h.click('登录');
 await act(async()=>transfer.resolve(authorizing('browser')));
 assert.equal(h.panel().getAttribute('data-account-authorization-surface'),'embedded');
 assert.deepEqual(h.actionLabels(),['取消登录','在浏览器中继续']);
 assert.equal(h.calls.filter(c=>c.type==='signIn').length,1);
});

test('transfer IPC rejection retains embedded; late original reply cannot release transfer operation gate',async t=>{
 const opener=deferred(),transfer=deferred();let firstTransfer=true;
 const h=setup(t,{reply:(command,model)=>{
  if(command.type==='signIn'){model.set(authorizing('embedded'));return opener.promise;}
  if(command.type==='openLoginInBrowser'&&firstTransfer){firstTransfer=false;return transfer.promise;}
 }});await h.mount();await h.click('登录');await h.tick();await h.click('在浏览器中继续');
 await act(async()=>opener.resolve(authorizing('embedded')));
 assert(props(h.button('在浏览器中继续')).disabled,'old signIn completion must not clear current transfer busy');
 await act(async()=>{await h.handle().run({type:'signIn',surface:'browser'});});
 assert.equal(h.calls.filter(c=>c.type==='signIn').length,1);
 await act(async()=>transfer.reject(Error('unexported opener sentinel')));
 assert(!h.text().includes('unexported opener sentinel'));assert.equal(h.panel().getAttribute('data-account-authorization-surface'),'embedded');
 assert(!props(h.button('在浏览器中继续')).disabled);assert(!props(h.button('取消登录')).disabled);
 await h.click('重试');assert.equal(h.panel().getAttribute('data-account-authorization-surface'),'browser');
 assert.equal(h.calls.filter(c=>c.type==='openLoginInBrowser').length,2);await h.click('取消登录');
});

test('cancel before original signIn reply fences that late reply and keeps single pending authorization',async t=>{
 const opener=deferred();let first=true;
 const h=setup(t,{reply:(command,model)=>{
  if(command.type==='signIn'&&first){first=false;model.set(authorizing('embedded'));return opener.promise;}
 }});await h.mount();await h.click('登录');await h.tick();await h.click('在浏览器中继续');await h.click('取消登录');
 assert.equal(h.panel().getAttribute('data-account-state'),'signedOut');
 await act(async()=>{await h.handle().run({type:'signIn',surface:'embedded'});});
 assert.equal(h.calls.filter(c=>c.type==='signIn').length,1);
 await act(async()=>opener.resolve(authorizing('embedded')));
 assert.equal(h.panel().getAttribute('data-account-state'),'signedOut');assert.equal(h.panel().getAttribute('data-account-authorization-surface'),null);
 await h.click('登录');assert.deepEqual(h.calls.at(-1),{type:'signIn',surface:'browser'});
});

test('failed cancel never unlocks a second authorization, before or after the original IPC completes',async t=>{
 const opener=deferred();
 const h=setup(t,{reply:(command,model)=>{
  if(command.type==='signIn'){model.set(authorizing('embedded'));return opener.promise;}
  if(command.type==='cancel')throw Error('unexported cancel sentinel');
 }});await h.mount();await h.click('登录');await h.tick();await h.click('取消登录');
 for(const type of ['signIn','signUp'])await act(async()=>{await h.handle().run({type,surface:'browser'});});
 assert.equal(h.calls.filter(c=>c.type==='signIn'||c.type==='signUp').length,1);
 await act(async()=>opener.resolve(authorizing('embedded')));
 for(const type of ['signIn','signUp'])await act(async()=>{await h.handle().run({type,surface:'browser'});});
 assert.equal(h.calls.filter(c=>c.type==='signIn'||c.type==='signUp').length,1);
 assert.equal(h.panel().getAttribute('data-account-authorization-surface'),'embedded');assert(!h.text().includes('unexported cancel sentinel'));
});

test('failed signUp retry uses current radio while preserving operation; status retry does not authorize',async t=>{
 let fail=true;
 const h=setup(t,{reply:command=>{if(command.type==='signUp'&&fail){fail=false;throw Error('unexported provider sentinel');}}});
 await h.mount();await h.click('创建账户');assert(h.button('重试'));assert(!h.text().includes('unexported provider sentinel'));
 await h.choose('browser');await h.click('重试');
 assert.deepEqual(h.calls.filter(c=>c.type==='signUp'),[{type:'signUp',surface:'embedded'},{type:'signUp',surface:'browser'}]);
 assert.equal(h.calls.filter(c=>c.type==='signIn').length,0);
});

test('connection login retry uses selection; retained network retry remains syncNow without surface',async t=>{
 const h=setup(t,{initial:{...signedOutAccount(),state:'error',error:{code:'account_auth_code_rejected',message:'safe'}}});
 await h.mount();await h.choose('browser');await h.click('重试登录');assert.deepEqual(h.calls.at(-1),{type:'signIn',surface:'browser'});
 h.setNative({...signedOutAccount(),state:'error',profile:{subject:'fixture',displayName:'Fixture'},error:{code:'account_network',stage:'identityProvider',message:'safe'}});
 await h.poll();await h.click('重试连接');assert.deepEqual(h.calls.at(-1),{type:'syncNow'});
});

test('unbound profile failure shows fixed stage/request details; polling never restarts login',async t=>{
 const h=setup(t,{initial:{...signedOutAccount(),state:'error',error:{code:'account_network',stage:'coordinatorProfile',requestReason:'timeout',message:'private-response-sentinel'}}});
 await h.mount();assert(h.text().includes('读取账户资料时请求超时'));assert(!h.text().includes('private-response-sentinel'));
 assert.deepEqual(h.actionLabels(),['登录','创建账户'],'a signed-out restore error must not offer authenticated sign-out');
 const details=h.all().find(e=>e.localName==='details');assert(details);assert(!props(details).open);assert(details.textContent.includes('requestReasontimeout'));
 await h.tick();await h.tick();assert(h.calls.every(c=>c.type==='status'));
 await h.choose('browser');await h.click('重试登录');assert.deepEqual(h.calls.at(-1),{type:'signIn',surface:'browser'});assert(!h.calls.some(c=>c.type==='setEnabled'||c.type==='signOut'));
});

test('terminal service mismatch offers login retry and confirmed cleanup without claiming library ownership',async t=>{
 for(const state of ['error','signedOut']) {
  const h=setup(t,{initial:{...signedOutAccount(),state,error:{code:'account_owner_workspace_mismatch',message:'private-response-sentinel'}}});
  await h.mount();assert(h.button('重试登录'));assert(h.button('退出账户'));
  assert(h.text().includes('账户身份或同步空间校验失败'));
  assert(!/资料库归属|登录原账户|资料库已关联|private-response-sentinel/.test(h.text()));
  await h.tick();assert(h.calls.every(c=>c.type==='status'));
  await h.choose('browser');await h.click('重试登录');
  assert.deepEqual(h.calls.at(-1),{type:'signIn',surface:'browser'});
  assert(!h.calls.some(c=>['signOut','setEnabled'].includes(c.type)));
 }
});

test('old mismatch plus immediate Busy allows explicit login retry and keeps confirmed exit',async t=>{
 const h=setup(t,{initial:{...signedOutAccount(),state:'error',error:{code:'account_owner_workspace_mismatch',message:'safe'}},reply:command=>{
  if(command.type==='signIn')throw {code:'account_busy',message:'private-ipc-sentinel'};
 }});
 await h.mount();await h.click('重试登录');await h.tick();
 assert(h.text().includes('已有账户操作正在进行'));
 await h.click('重试');assert.equal(h.calls.at(-1).type,'signIn');
 assert.equal(h.calls.filter(c=>c.type==='signIn').length,2);
 const before=h.calls.length;await h.click('退出账户');assert.equal(h.calls.length,before);
 assert(h.text().includes('本库全部备忘录及附件会保留'));
 await h.click('确认退出');assert.equal(h.calls.at(-1).type,'signOut');
 assert(h.text().includes('你可以登录其他账户'));
 assert(!h.calls.some(c=>c.type==='setEnabled'));
});

test('authoritative Busy and cleanup-required block new authorization but retain confirmed exit',async t=>{
 for(const state of ['error','signedOut'])for(const error of [{code:'account_busy',message:'safe'},
  {code:'account_authentication',stage:'authorizationProvider',providerReason:'busy',message:'safe'},
  {code:'account_cleanup_required',message:'safe'}]) {
  const h=setup(t,{initial:{...signedOutAccount(),state,error}});await h.mount();
  if(error.code==='account_cleanup_required')assert(!h.button('登录'));
  else assert(props(h.button('登录')).disabled);
  await act(async()=>{await h.handle().run({type:'signIn',surface:'browser'});await h.handle().run({type:'signUp',surface:'embedded'});});
  await h.tick();assert(h.calls.every(c=>c.type==='status'));
  await h.click('退出账户');assert(h.calls.every(c=>c.type==='status'));
  await h.click('确认退出');assert.equal(h.calls.at(-1).type,'signOut');
 }
});

test('a transient action Busy cannot trap explicit login retry behind identical read-only polls',async t=>{
 for(const type of ['signIn','signUp'])for(const initial of [signedOutAccount(),
  {...signedOutAccount(),state:'error',error:{code:'account_owner_workspace_mismatch',message:'safe'}},
  {...signedOutAccount(),state:'error',error:{code:'account_network',stage:'coordinatorProfile',requestReason:'timeout',message:'safe'}}]) {
  let fail=true;
  const h=setup(t,{initial,reply:command=>{
   if(command.type===type&&fail){fail=false;throw {code:'account_busy',message:'private-ipc-sentinel'};}
  }});
  await h.mount();await h.click(type==='signIn'?'登录':'创建账户');
  assert(h.text().includes('已有账户操作正在进行'));
  const count=h.calls.length;await h.tick();await h.poll();
  assert(h.calls.slice(count).every(c=>c.type==='status'));
  assert.equal(h.calls.filter(c=>c.type===type).length,1);
  assert(h.text().includes('已有账户操作正在进行'),'same status must not hide the action failure');
  await h.choose('browser');await h.click('重试');assert.deepEqual(h.calls.at(-1),{type,surface:'browser'});
  assert.equal(h.handle().inspect().status.state,'authorizing');assert.equal(h.calls.filter(c=>c.type===type).length,2);
  await act(async()=>{await h.handle().run({type,surface:'embedded'});});
  await h.tick();assert.equal(h.calls.filter(c=>c.type===type).length,2,'authorizing still fences another attempt');
  assert(!h.calls.some(c=>['signOut','setEnabled','syncNow'].includes(c.type)));
 }
});

test('cached action Busy cannot retry login after polling discovers active authorization or cleanup',async t=>{
 for(const next of [authorizing('embedded'),{...signedOutAccount(),state:'error',error:{code:'account_cleanup_required',message:'safe'}},
  {...signedOutAccount(),state:'paused',profile:{subject:'fixture-B',displayName:'B'}}]) {
  const h=setup(t,{reply:command=>{if(command.type==='signIn')throw {code:'account_busy',message:'private-ipc-sentinel'};}});
  await h.mount();await h.click('登录');h.setNative(next);await h.tick();
  assert(!h.button('重试'),'authoritative progression retires stale action retry');
  await act(async()=>{if(next.state!=='paused')await h.handle().run({type:'signIn',surface:'browser'});});
  assert.equal(h.calls.filter(c=>c.type==='signIn').length,1);
 }
});

test('A exit then B login stays paused; enabling requires explicit consent for retained previous sync content',async t=>{
 const paused=subject=>({...signedOutAccount(),state:'paused',profile:{subject,displayName:subject}});
 const h=setup(t,{initial:paused('fixture-A'),reply:(command,model)=>{
  if(command.type==='signIn') {const next=paused('fixture-B');model.set(next);return next;}
  if(command.type==='setEnabled') {const next={...model.get(),state:'ready',enabled:command.enabled};model.set(next);return next;}
 }});
 await h.mount();await h.click('退出账户');assert(h.calls.every(c=>c.type==='status'));
 await h.click('确认退出');assert.equal(h.calls.at(-1).type,'signOut');
 await h.click('登录');assert.equal(h.handle().inspect().status.profile.subject,'fixture-B');
 assert.equal(h.handle().inspect().status.state,'paused');assert.equal(h.handle().inspect().status.enabled,false);
 await h.tick();assert(!h.calls.some(c=>c.type==='setEnabled'));
 const toggle=h.all().find(e=>e.localName==='input'&&props(e).id==='account-enabled');
 await act(async()=>props(toggle).onChange({target:{checked:true}}));
 assert(!h.calls.some(c=>c.type==='setEnabled'));
 assert(h.text().includes('本库当前已有的全部备忘录及附件（包括先前同步后保留的内容）与当前账户选定设备合并'));
 await h.click('允许同步');assert.deepEqual(h.calls.at(-1),{type:'setEnabled',enabled:true});
 assert.equal(h.calls.filter(c=>c.type==='setEnabled').length,1);
});

test('switch opens a labelled native modal without enabling; local Tab/Escape handling protects the parent trap',async t=>{
 const h=setup(t,{initial:{...signedOutAccount(),state:'paused',profile:{subject:'fixture-B',displayName:'B'}}});
 await h.mount();const toggle=h.all().find(e=>e.localName==='input'&&props(e).id==='account-enabled');
 assert.equal(props(toggle).type,'checkbox');assert.equal(props(toggle).role,'switch');
 assert.equal(props(toggle).checked,false);assert.equal(props(toggle).disabled,false);
 assert(h.all().some(e=>e.localName==='label'&&props(e).htmlFor==='account-enabled'&&e.textContent==='允许此设备同步'));
 assert.equal(props(toggle).onKeyDown,undefined,'native checkbox retains its Space behavior');
 toggle.focus();await act(async()=>props(toggle).onChange({target:{checked:true}}));
 const modal=h.all().find(e=>e.localName==='dialog');assert(modal);assert.equal(modal.open,true);assert.equal(modal.modalShows,1);
 assert.equal(props(modal).role,'alertdialog');assert.equal(props(modal)['aria-modal'],'true');
 assert(descendants(modal).some(e=>props(e).id===props(modal)['aria-labelledby']&&e.textContent==='开启账户同步？'));
 assert(descendants(modal).some(e=>props(e).id===props(modal)['aria-describedby']&&e.textContent.includes('包括先前同步后保留的内容')));
 assert.equal(document.activeElement,h.button('取消'));assert.equal(props(toggle).checked,false);
 const key=async(key,shiftKey=false)=>{
  let prevented=false,stopped=false,parentCalls=0;
  await act(async()=>{
   props(modal).onKeyDown({key,shiftKey,preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});
   // Preferences handles these same keys on document in the bubble phase.
   if(!stopped)parentCalls++;
  });
  assert(prevented);assert(stopped);assert.equal(parentCalls,0);
 };
 await key('Tab',true);assert.equal(document.activeElement,h.button('允许同步'));
 await key('Tab');assert.equal(document.activeElement,h.button('取消'));
 await key('Tab');assert.equal(document.activeElement,h.button('允许同步'));
 await key('Tab',true);assert.equal(document.activeElement,h.button('取消'));
 await key('Escape');assert(!h.all().some(e=>e.localName==='dialog'));assert.equal(modal.open,false);
 assert.equal(document.activeElement,toggle);assert(h.calls.every(c=>c.type==='status'));
});

test('enable and exit share modal cancellation via button, native cancel and handle.dismiss with focus restored',async t=>{
 for(const kind of ['enable','signOut'])for(const method of ['button','native','handle']) {
  const h=setup(t,{initial:{...signedOutAccount(),state:'paused',profile:{subject:'fixture-B',displayName:'B'}}});await h.mount();
  const origin=kind==='enable'?h.all().find(e=>e.localName==='input'&&props(e).id==='account-enabled'):h.button('退出账户');
  origin.focus();
  if(kind==='enable')await act(async()=>props(origin).onChange({target:{checked:true}}));else await h.click('退出账户');
  const modal=h.all().find(e=>e.localName==='dialog');assert.equal(modal.open,true);assert.equal(document.activeElement,h.button('取消'));
  assert(descendants(modal).some(e=>e.localName==='h4'&&e.textContent===(kind==='enable'?'开启账户同步？':'退出账户？')));
  assert(h.calls.every(c=>c.type==='status'));
  if(method==='button')await h.click('取消');
  else if(method==='handle')await act(async()=>assert.equal(h.handle().dismiss(),true));
  else {
   let prevented=false,stopped=false;
   await act(async()=>props(modal).onCancel({preventDefault(){prevented=true;},stopPropagation(){stopped=true;}}));
   assert(prevented);assert(stopped);
  }
  assert.equal(modal.open,false);assert.equal(document.activeElement,origin);
  assert.equal(h.handle().dismiss(),false);assert(h.calls.every(c=>c.type==='status'));
  assert.equal(h.handle().inspect().status.enabled,false);assert.equal(h.handle().inspect().status.profile.subject,'fixture-B');
 }
});

test('pointer openers are restored even when the click never focused them',async t=>{
 for(const kind of ['enable','signOut'])for(const prior of ['body','other-control'])for(const cancellation of ['button','Escape']) {
  const h=setup(t,{initial:{...signedOutAccount(),state:'paused',profile:{subject:'fixture-B',displayName:'B'}}});await h.mount();
  const opener=kind==='enable'?h.all().find(e=>e.localName==='input'&&props(e).id==='account-enabled'):h.button('退出账户');
  const other=kind==='enable'?h.button('退出账户'):h.all().find(e=>e.localName==='input'&&props(e).id==='account-enabled');
  (prior==='body'?document.body:other).focus();assert.notEqual(document.activeElement,opener);
  if(kind==='signOut')await h.click('退出账户');
  else await act(async()=>props(opener).onChange({currentTarget:opener,target:{checked:true}}));
  assert.equal(document.activeElement,h.button('取消'));
  if(cancellation==='button')await h.click('取消');
  else await act(async()=>props(h.all().find(e=>e.localName==='dialog')).onKeyDown({key:'Escape',preventDefault(){},stopPropagation(){}}));
  assert.equal(document.activeElement,opener);assert(h.calls.every(c=>c.type==='status'));
 }
});

test('switch reflects only authoritative enable response; a confirmed in-flight mutation cannot be dismissed as cancelled',async t=>{
 const enabling=deferred(),initial={...signedOutAccount(),state:'paused',profile:{subject:'fixture-B',displayName:'B'}};
 const h=setup(t,{initial,reply:command=>command.type==='setEnabled'?enabling.promise:undefined});await h.mount();
 const toggle=h.all().find(e=>e.localName==='input'&&props(e).id==='account-enabled');toggle.focus();
 await act(async()=>props(toggle).onChange({target:{checked:true}}));await h.click('允许同步');
 const modal=h.all().find(e=>e.localName==='dialog');
 assert.equal(props(toggle).checked,false);assert.equal(props(toggle).disabled,true);
 assert(props(h.button('取消')).disabled);assert(props(h.button('允许同步')).disabled);
 await act(async()=>assert.equal(h.handle().dismiss(),true));assert.equal(modal.open,true);
 let prevented=false;await act(async()=>props(modal).onCancel({preventDefault(){prevented=true;},stopPropagation(){}}));
 assert(prevented);assert.equal(modal.open,true);assert.equal(h.calls.filter(c=>c.type==='setEnabled').length,1);
 await act(async()=>enabling.resolve({...initial,state:'ready',enabled:true}));
 assert.equal(modal.open,false);assert.equal(props(toggle).checked,true);assert.equal(props(toggle).disabled,false);
 assert.equal(document.activeElement,toggle);
});

test('switch off pauses directly and stays checked until the authoritative paused response',async t=>{
 const pausing=deferred(),initial={...signedOutAccount(),state:'ready',enabled:true,profile:{subject:'fixture-B',displayName:'B'}};
 const h=setup(t,{initial,reply:command=>command.type==='setEnabled'?pausing.promise:undefined});await h.mount();
 const toggle=h.all().find(e=>e.localName==='input'&&props(e).id==='account-enabled');
 await act(async()=>props(toggle).onChange({target:{checked:false}}));
 assert.deepEqual(h.calls.at(-1),{type:'setEnabled',enabled:false});assert(!h.all().some(e=>e.localName==='dialog'));
 assert.equal(props(toggle).checked,true);assert.equal(props(toggle).disabled,true);
 await act(async()=>pausing.resolve({...initial,state:'paused',enabled:false}));
 assert.equal(props(toggle).checked,false);assert.equal(props(toggle).disabled,false);
});

test('failed confirmed enable remains off with a visible fixed error in the modal; cancelling never replays it',async t=>{
 const h=setup(t,{initial:{...signedOutAccount(),state:'paused',profile:{subject:'fixture-B',displayName:'B'}},reply:command=>{
  if(command.type==='setEnabled')throw {code:'account_busy',message:'private-ipc-sentinel'};
 }});await h.mount();const toggle=h.all().find(e=>e.localName==='input'&&props(e).id==='account-enabled');
 toggle.focus();await act(async()=>props(toggle).onChange({target:{checked:true}}));await h.click('允许同步');
 const modal=h.all().find(e=>e.localName==='dialog');assert.equal(modal.open,true);assert.equal(props(toggle).checked,false);
 assert(descendants(modal).some(e=>props(e).role==='alert'&&e.textContent.includes('已有账户操作正在进行')));
 assert(!modal.textContent.includes('private-ipc-sentinel'));
 await h.click('取消');assert.equal(modal.open,false);assert.equal(document.activeElement,toggle);
 await h.tick();assert.equal(h.calls.filter(c=>c.type==='setEnabled').length,1);
});

test('blocked adoption retains paused login and exposes only actual conflicts without starting any account operation',async t=>{
 for(const conflictCount of [0,2]) {
  let opened=0;
  const h=setup(t,{initial:{...signedOutAccount(),state:'paused',profile:{subject:'fixture-B',displayName:'B'},conflictCount,
   error:{code:'account_sync_adoption_blocked',message:'private-response-sentinel'}},onConflicts:()=>{opened++;}});
  await h.mount();assert(h.text().includes('开启同步前需要处理旧同步内容'));
  assert(h.text().includes('当前账户已登录且同步暂停，本机内容会保留'));
  assert(h.text().includes(adoptionRecoveryGuidance),'status error explains both explicit recovery paths and their preconditions');
  assert(!h.text().includes('private-response-sentinel'));assert(!h.button('登录'));assert(h.button('退出账户'));
  assert(!h.button('重试登录'));assert(!h.button('重试连接'));assert(!h.button('立即同步'));assert(h.button('刷新设备'));
  const links=h.buttons().filter(b=>b.textContent.startsWith('查看冲突'));
  assert.equal(links.length,conflictCount?1:0);
  if(conflictCount) {await h.click('查看冲突（2）');assert.equal(opened,1);}
  await h.tick();assert(h.calls.every(c=>c.type==='status'));
  assert.equal(h.handle().inspect().status.enabled,false);
 }
});

test('immediate adoption rejection keeps full enable confirmation and retries status instead of replaying enable',async t=>{
 let opened=0;
 const h=setup(t,{initial:{...signedOutAccount(),state:'paused',profile:{subject:'fixture-B',displayName:'B'},conflictCount:1},
  onConflicts:()=>{opened++;},reply:command=>{
   if(command.type==='setEnabled')throw {code:'account_sync_adoption_blocked',message:'private-response-sentinel'};
  }});
 await h.mount();const toggle=h.all().find(e=>e.localName==='input'&&props(e).id==='account-enabled');
 await act(async()=>props(toggle).onChange({target:{checked:true}}));
 assert(h.text().includes('包括先前同步后保留的内容'));assert(!h.calls.some(c=>c.type==='setEnabled'));
 await h.click('允许同步');assert(h.text().includes('开启同步前需要处理旧同步内容'));
 assert(h.text().includes('当前账户已登录且同步暂停'));assert(!h.text().includes('private-response-sentinel'));
 assert(h.text().includes(adoptionRecoveryGuidance),'IPC rejection gives the same safe recovery guidance');
 await h.click('取消');
 assert.equal(h.buttons().filter(b=>b.textContent.startsWith('查看冲突')).length,1);
 await h.click('查看冲突（1）');assert.equal(opened,1);
 await h.click('读取账户状态');assert.equal(h.calls.at(-1).type,'status');
 await h.tick();assert.equal(h.calls.filter(c=>c.type==='setEnabled').length,1);
 assert(!h.calls.some(c=>['signIn','signUp','syncNow','signOut'].includes(c.type)));
 assert.equal(h.handle().inspect().status.enabled,false);
});

test('explicit adoption timeouts show stage and retry guidance without claiming an old conflict or retrying automatically',async t=>{
 for(const [adoptionStage,label] of [['probe','检查同步窗口'],['prepare','保存并冻结本地更改'],['media','准备附件']])for(const mode of ['status','IPC']) {
  const error={code:'account_sync_adoption_blocked',message:'private-response-sentinel',adoptionStage,adoptionReason:'timeout'};
  const initial={...signedOutAccount(),state:'paused',profile:{subject:'fixture-B',displayName:'B'}};
  const h=setup(t,{initial:mode==='status'?{...initial,error}:initial,reply:command=>{
   if(mode==='IPC'&&command.type==='setEnabled')throw error;
  }});await h.mount();
  if(mode==='IPC') {
   const toggle=h.all().find(e=>e.localName==='input'&&props(e).id==='account-enabled');
   await act(async()=>props(toggle).onChange({currentTarget:toggle,target:{checked:true}}));await h.click('允许同步');
   const modal=h.all().find(e=>e.localName==='dialog');assert(modal.textContent.includes(`${label}超时`));
   await h.click('取消');
  }
  assert(h.text().includes('开启同步准备超时'));assert(h.text().includes(`${label}超时`));
  assert(h.text().includes('请稍后重新确认开启同步'));assert(h.text().includes(`adoptionStage${adoptionStage}adoptionReasontimeout`));
  assert(!h.text().includes('开启同步前需要处理旧同步内容'));assert(!h.text().includes('未解决冲突'));assert(!h.text().includes('private-response-sentinel'));
  await h.tick();if(mode==='IPC')await h.click('读取账户状态');
  assert.equal(h.calls.filter(c=>c.type==='setEnabled').length,mode==='IPC'?1:0);
  assert(!h.calls.some(c=>['signIn','signOut','syncNow'].includes(c.type)));assert.equal(h.handle().inspect().status.enabled,false);
 }
});

test('instant Busy stays separate from old status across same-error polls, then clears on real progress',async t=>{
 for(const change of ['error','state']) {
  let failStatus=false;
  const initial={...signedOutAccount(),state:'error',error:{code:'account_network',stage:'coordinatorProfile',requestReason:'timeout',message:'private-response-sentinel'}};
  const h=setup(t,{initial,reply:command=>{
   if(command.type==='signIn')throw {code:'account_busy',message:'private-ipc-sentinel',commit:null};
   if(command.type==='status'&&failStatus)throw Error('private-status-sentinel');
  }});
  await h.mount();await h.click('重试登录');assert(h.text().includes('本次登录未完成'));assert(h.text().includes('已有账户操作正在进行'));assert(h.text().includes('读取账户资料时请求超时'));
  h.setNative({...initial,pendingCount:9,error:{...initial.error,message:'another-private-sentinel'}});await h.tick();await h.poll();assert(h.text().includes('本次登录未完成'));
  failStatus=true;await h.tick();assert(h.text().includes('已有账户操作正在进行'));failStatus=false;
  h.setNative(change==='error'?{...initial,error:{...initial.error,requestReason:'connect'}}:authorizing('browser'));await h.tick();assert(!h.text().includes('本次登录未完成'));assert(!h.text().includes('private-'));
  assert.equal(h.calls.filter(c=>c.type==='signIn').length,1);assert(!h.calls.some(c=>c.type==='setEnabled'||c.type==='signOut'));
 }
});

test('a successful identical status read retires only the prior read failure, including manual retry',async t=>{
 for(const state of ['signedOut','ready','paused'])for(const recovery of ['poll','retry']) {
  let fail=false;
  const initial={...signedOutAccount(),state,enabled:state==='ready',...(state==='signedOut'?{}:{profile:{subject:'fixture-owner',displayName:'Fixture'}})};
  const h=setup(t,{initial,reply:command=>{if(command.type==='status'&&fail){fail=false;throw Error('private-status-sentinel');}}});
  await h.mount();fail=true;await h.tick();assert(h.text().includes('本次读取账户状态未完成'));
  if(recovery==='poll')await h.tick();else await h.click('重试');
  assert(!h.text().includes('本次读取账户状态未完成'));assert.equal(h.handle().inspect().error,'');assert(h.calls.every(c=>c.type==='status'));assert(!h.text().includes('private-'));
 }
});

test('finite IPC rejection copy discards legacy message; unknown rejection never becomes a network claim',async t=>{
 for(const [cause,expected] of [[{code:'account_window_invalid',message:'private-ipc-sentinel'},'当前窗口不能管理账户'],[{code:'account_busy',message:'private-ipc-sentinel',commit:null},'已有账户操作正在进行'],['timeout https://private.invalid/token','具体原因尚未确认'],[{code:'private-ipc-sentinel',message:'private-ipc-sentinel'},'具体原因尚未确认']]) {
  const h=setup(t,{reply:command=>{if(command.type==='signIn')throw cause;}});await h.mount();await h.click('登录');assert(h.text().includes(expected));assert(!h.text().includes('private'));assert(!h.text().includes('请检查网络'));
 }
 const h=setup(t,{initial:{...signedOutAccount(),state:'error',error:{code:'private-owner-sync-sentinel',message:'private-ipc-sentinel'}}});await h.mount();assert(h.text().includes('未知错误'));assert(!h.text().includes('private'));assert(!h.button('重试连接'));assert(!h.button('重试登录'));
});

test('catalog allows optional enum only for authorization; transfer is fixed and argument-free',t=>{
 const {catalog}=setup(t).client;
 for(const type of ['signIn','signUp']){
  const descriptor=catalog.find(c=>c.id==='account.'+type);assert.deepEqual(Object.keys(descriptor.args),['surface']);
  assert.equal(descriptor.args.surface.required,false);assert.equal(descriptor.args.surface.type,'string');
  assert.deepEqual(Array.from(descriptor.args.surface.enum),['embedded','browser']);
 }
 assert.deepEqual(Object.keys(catalog.find(c=>c.id==='account.openLoginInBrowser').args),[]);
});

test('JS IPC fixture preserves legacy omission, finite failure and same current authorization',async()=>{
 const events=[];let fail=false;
 const backend={boundary:async kind=>{events.push(kind);if(fail){fail=false;throw Error('unexported');}}};
 assert.equal((await accountFixture(backend,{type:'signIn'})).authorizationSurface,'browser');
 await assert.rejects(accountFixture(backend,{type:'openLoginInBrowser'}));
 await accountFixture(backend,{type:'cancel'});await accountFixture(backend,{type:'signUp',surface:'embedded'});
 fail=true;const s=await accountFixture(backend,{type:'openLoginInBrowser'});assert.equal(s.state,'authorizing');assert.equal(s.authorizationSurface,'embedded');
 assert.deepEqual(s.error,{code:'account_network',stage:'browserOpen',message:'Fixture browser unavailable'});
 assert.equal((await accountFixture(backend,{type:'openLoginInBrowser'})).authorizationSurface,'browser');
 assert.equal(events.filter(e=>e==='account-signUp').length,1);
 for(const surface of [undefined,null,0,'unknown'])await assert.rejects(accountFixture(backend,{type:'signIn',surface}));
});

// Account110 tests exercise production UI dispatch and authoritative DTO replies.
// They do not claim native discovery, peer transfer or data application.
const SELF='10000000-0000-4000-8000-000000000001', PEER='10000000-0000-4000-8000-000000000002', OTHER='10000000-0000-4000-8000-000000000003';
const device=(id,extra={})=>({id,name:id===SELF?'本机名称':'同名设备',online:true,current:id===SELF,connected:false,syncAvailable:true,...extra});
const directory=(extra={})=>({...signedOutAccount(),state:'ready',enabled:true,profile:{subject:'fixture-A',displayName:'A'},devices:[device(SELF),device(PEER),device(OTHER)],...extra});
const row=(h,id)=>h.all().find(e=>props(e)['data-device-id']===id);
const openPeer=async(h,id=PEER)=>{const opener=descendants(row(h,id)).find(e=>e.localName==='button');await act(async()=>props(opener).onClick({currentTarget:opener}));return opener;};
const chooseDirection=async(h,direction)=>{const radio=h.all().find(e=>e.localName==='input'&&props(e).name==='account-device-direction'&&props(e).value===direction);await act(async()=>props(radio).onChange());return radio;};

test('device directory survives pause; offline summaries stay hidden and unknown is distinct from an empty library',async t=>{
 const emptyPeer='10000000-0000-4000-8000-000000000004';
 const h=setup(t,{initial:directory({state:'paused',enabled:false,devices:[
  device(SELF,{summary:{noteCount:0,lastNoteUpdatedAt:null,capturedAt:999}}),
  device(PEER,{online:false,summary:{noteCount:777,lastNoteUpdatedAt:111,capturedAt:999}}),device(OTHER),
  device(emptyPeer,{summary:{noteCount:0,lastNoteUpdatedAt:null,capturedAt:999}}),
 ]})});await h.mount();
 assert(row(h,SELF).textContent.includes('此设备'));assert(!row(h,SELF).textContent.includes('在线'));
 assert(!row(h,SELF).textContent.includes('篇笔记'),'local card does not repeat the current library summary');
 assert(row(h,emptyPeer).textContent.includes('0 篇笔记'));assert(row(h,emptyPeer).textContent.includes('暂无笔记更新时间'));
 assert(row(h,PEER).textContent.includes('离线'));assert(!row(h,PEER).textContent.includes('777'));assert(!row(h,PEER).textContent.includes('笔记更新于'));
 assert(row(h,OTHER).textContent.includes('笔记信息暂不可用'));assert(!row(h,OTHER).textContent.includes('0 篇'));
 assert(!h.button('立即同步'));await h.tick();assert(h.calls.every(c=>c.type==='status'));
 await h.click('刷新设备');assert.deepEqual(h.calls.at(-1),{type:'syncNow'});assert(!h.calls.some(c=>c.type==='syncDevice'));
 await openPeer(h);assert(props(h.button('开始同步')).disabled);assert(h.text().includes('同步许可已关闭'));
 await h.click('取消');assert(!h.calls.some(c=>c.type==='syncDevice'));
});

test('each direction confirms exactly one stable target despite duplicate names; opening and cancelling are read-only',async t=>{
 for(const direction of ['push','pull','both']) {
  const h=setup(t,{initial:directory()});await h.mount();const opener=await openPeer(h,OTHER);
  assert.equal(document.activeElement,h.button('取消'));assert(h.calls.every(c=>c.type==='status'));
  const defaultRadio=h.all().find(e=>props(e).name==='account-device-direction'&&props(e).value==='both');assert(props(defaultRadio).checked);
  await chooseDirection(h,direction);await h.click('取消');assert.equal(document.activeElement,opener);assert(h.calls.every(c=>c.type==='status'));
  await openPeer(h,OTHER);await chooseDirection(h,direction);await h.click('开始同步');
  assert.deepEqual(h.calls.filter(c=>c.type==='syncDevice'),[{type:'syncDevice',deviceId:OTHER,direction}]);
  assert(!h.text().includes('本次传输完成'),'an ACK without a new durable operation is not success');
  await h.click('取消');await h.tick();assert.equal(h.calls.filter(c=>c.type==='syncDevice').length,1);
 }
});

test('device action latches invalidation for offline, missing, paused, account and local identity changes without replay',async t=>{
 for(const change of [
  s=>{s.enabled=false;},s=>{s.devices[1].online=false;},s=>{s.devices[1].syncAvailable=false;},
  s=>{s.devices.splice(1,1);},s=>{s.profile.subject='fixture-B';},s=>{s.devices[0].id='20000000-0000-4000-8000-000000000001';},
 ]) {
  const h=setup(t,{initial:directory()});await h.mount();await openPeer(h);const changed=directory();change(changed);h.setNative(changed);await h.tick();
  assert(props(h.button('开始同步')).disabled);assert(!h.calls.some(c=>c.type==='syncDevice'));
  h.setNative(directory());await h.tick();assert(props(h.button('开始同步')).disabled,'restoration must not silently re-arm the dialog');
  await h.click('取消');await openPeer(h);assert(!props(h.button('开始同步')).disabled);await h.click('取消');
 }
});

test('in-flight device transfer observes status but rejects repeat confirm; durable receipt remains separate from application/conflicts',async t=>{
 const pending=deferred(),initial=directory();
 const h=setup(t,{initial,reply:command=>command.type==='syncDevice'?pending.promise:undefined});await h.mount();await openPeer(h);await h.click('开始同步');
 assert(!h.button('开始同步'),'a running transfer hides the duplicate confirm action');
 assert(h.button('收起，后台继续'));assert(!props(h.button('收起，后台继续')).disabled);
 await act(async()=>{await h.handle().run({type:'syncDevice',deviceId:PEER,direction:'both'});});
 assert.equal(h.calls.filter(c=>c.type==='syncDevice').length,1);
 const running={...initial,deviceOperation:{deviceId:PEER,direction:'both',phase:'running',startedAt:100}};h.setNative(running);await h.tick();
 assert(h.text().includes('正在连接设备'));assert(h.text().includes('与 同名设备 · 双向同步'));
 const succeeded={...initial,pendingCount:3,conflictCount:2,deviceOperation:{...running.deviceOperation,phase:'succeeded',finishedAt:200}};
 await act(async()=>pending.resolve(succeeded));assert(h.text().includes('本次传输完成'));assert(h.text().includes('已保存接收内容'));
 assert(h.text().includes('待应用'));assert(h.text().includes('查看冲突（2）'));assert(!h.text().includes('全部笔记已应用'));
 await h.click('关闭');await h.tick();assert.equal(h.calls.filter(c=>c.type==='syncDevice').length,1);
});

test('prior or mismatched operation receipts never claim this dialog completed; retry keeps target and direction explicit',async t=>{
 for(const receipt of [
  {deviceId:PEER,direction:'both',phase:'succeeded',startedAt:100,finishedAt:200},
  {deviceId:OTHER,direction:'pull',phase:'succeeded',startedAt:100,finishedAt:200},
 ]) {
  const h=setup(t,{initial:directory({deviceOperation:receipt})});await h.mount();await openPeer(h);
  const modal=h.all().find(e=>e.localName==='dialog');
  assert(!modal.textContent.includes('本次传输完成'));
  await h.click('开始同步');assert(!modal.textContent.includes('本次传输完成'));await h.click('取消');
 }
 const h=setup(t,{initial:directory(),reply:command=>{if(command.type==='syncDevice')throw {code:'account_sync_failed',message:'private-peer-error'};}});
 await h.mount();await openPeer(h);await chooseDirection(h,'pull');await h.click('开始同步');assert(h.text().includes('同步未完成'));assert(!h.text().includes('private-peer-error'));
 await h.tick();assert.equal(h.calls.filter(c=>c.type==='syncDevice').length,1);assert(props(h.button('开始同步')).disabled===false);assert.equal(h.calls.filter(c=>c.type==='syncDevice').length,1);
 await h.click('开始同步');assert.deepEqual(h.calls.filter(c=>c.type==='syncDevice'),Array(2).fill({type:'syncDevice',deviceId:PEER,direction:'pull'}));
});

test('typed sync failures show fixed Chinese details in status and actual device-command modal without replay',async t=>{
 for(const [syncStage,label] of [['pair','配对'],['recoverPairing','恢复配对'],['transfer','传输'],['retirement','收尾']])for(const mode of ['status','IPC']) {
  const error={code:'account_sync_failed',message:'private-peer-sentinel',syncStage,syncReason:'timeout'};
  const h=setup(t,{initial:directory(mode==='status'?{error}:{}),reply:command=>{if(mode==='IPC'&&command.type==='syncDevice')throw error;}});
  await h.mount();await openPeer(h);await chooseDirection(h,'push');
  if(mode==='IPC')await h.click('开始同步');
  const modal=h.all().find(e=>e.localName==='dialog');
  assert(modal.textContent.includes(`设备同步在${label}阶段未完成：操作超时`));
  assert(modal.textContent.includes(`同步阶段${label}失败原因操作超时`));
  assert(descendants(modal).some(e=>e.localName==='details'&&e.textContent.includes('错误详情')));
  assert(!h.text().includes('private-peer-sentinel'));assert(!h.text().includes('本次传输完成'));
  await h.tick();assert(modal.textContent.includes(`同步阶段${label}失败原因操作超时`));
  assert.equal(h.calls.filter(c=>c.type==='syncDevice').length,mode==='IPC'?1:0);
  await h.click('取消');assert(!h.calls.some(c=>['signIn','setEnabled','syncNow','signOut'].includes(c.type)));
 }
});

test('sync diagnostic progress retires an immediate error while invalid diagnostic payloads never leak',async t=>{
 const first={code:'account_sync_failed',message:'private-first-sentinel',syncStage:'pair',syncReason:'timeout'};
 const next={...first,message:'private-next-sentinel',syncStage:'transfer',syncReason:'transport'};
 const h=setup(t,{initial:directory(),reply:command=>{if(command.type==='syncDevice')throw first;}});
 await h.mount();await openPeer(h);await h.click('开始同步');assert(h.text().includes('操作超时'));
 h.setNative(directory({error:next}));await h.tick();assert.equal(h.handle().inspect().error,'');
 assert(h.text().includes('传输阶段未完成：同步传输连接未完成'));assert(!h.text().includes('操作超时'));assert(!h.text().includes('private-'));
 assert.equal(h.calls.filter(c=>c.type==='syncDevice').length,1);await h.click('取消');
 for(const error of [{...first,syncReason:undefined},{...first,syncStage:'private-stage-sentinel'},{...first,syncReason:'invalidInput'},{...first,code:'account_network'}]) {
  const invalid=setup(t,{initial:directory({error})});await invalid.mount();assert(invalid.text().includes('无效数据'));
  assert(!invalid.text().includes('同步阶段'));assert(!invalid.text().includes('private-'));assert(invalid.calls.every(c=>c.type==='status'));
 }
});

test('rename is local-only, validates before IPC and waits for authoritative saved name; modal focus includes the input',async t=>{
 const h=setup(t,{initial:directory(),reply:(command,model)=>{
  if(command.type==='renameDevice'){const next=structuredClone(model.get());next.devices[0].name=command.name;model.set(next);return next;}
 }});await h.mount();const opener=h.button('更改名称');await h.click('更改名称');assert.equal(document.activeElement,h.button('取消'));
 const input=h.all().find(e=>e.localName==='input'&&props(e).value==='本机名称');assert(input);
 const modal=h.all().find(e=>e.localName==='dialog');await act(async()=>props(modal).onKeyDown({key:'Tab',shiftKey:true,preventDefault(){},stopPropagation(){}}));assert(document.activeElement===input);
 await act(async()=>props(modal).onKeyDown({key:'Tab',shiftKey:true,preventDefault(){},stopPropagation(){}}));assert(document.activeElement===h.button('保存名称'));
 await act(async()=>props(modal).onKeyDown({key:'Tab',shiftKey:false,preventDefault(){},stopPropagation(){}}));assert(document.activeElement===input);
 for(const value of ['   ','x'.repeat(97),'bad\u0001name']) {
  await act(async()=>props(input).onChange({target:{value}}));await h.click('保存名称');assert(h.text().includes('请输入 1–96'));assert(!h.calls.some(c=>c.type==='renameDevice'));
 }
 await act(async()=>props(input).onChange({target:{value:'  新的本机名称  '}}));await h.click('保存名称');
 assert.deepEqual(h.calls.at(-1),{type:'renameDevice',name:'新的本机名称'});assert(row(h,SELF).textContent.includes('新的本机名称'));assert.equal(document.activeElement,opener);
 assert(h.getNative().devices.slice(1).every(d=>d.name==='同名设备'));assert(!h.calls.some(c=>c.type==='syncDevice'));
});

test('enabling permission and refreshing never dispatch a peer transfer',async t=>{
 const h=setup(t,{initial:directory({state:'paused',enabled:false}),reply:(command,model)=>{
  if(command.type==='setEnabled'){const next={...model.get(),state:'ready',enabled:command.enabled};model.set(next);return next;}
 }});await h.mount();const toggle=h.all().find(e=>props(e).id==='account-enabled');
 await act(async()=>props(toggle).onChange({currentTarget:toggle,target:{checked:true}}));assert(h.text().includes('开启本身不会自动传输'));
 await h.click('允许同步');await h.tick();await h.click('刷新设备');await h.tick();
 assert(h.calls.some(c=>c.type==='setEnabled'));assert(!h.calls.some(c=>c.type==='syncDevice'));assert(h.text().includes('选择设备并确认方向后才会传输'));assert(h.text().includes('刷新仅更新设备列表'));
});

test('IPC constructs only exact rename and target/direction requests; invalid input never reaches native',async t=>{
 const h=setup(t,{initial:directory()});
 await h.client.accountCommand({type:'renameDevice',name:'  Mac 工作台  '});assert.deepEqual(h.calls.at(-1),{type:'renameDevice',name:'Mac 工作台'});
 for(const direction of ['push','pull','both']) {await h.client.accountCommand({type:'syncDevice',deviceId:PEER,direction});assert.deepEqual(h.calls.at(-1),{type:'syncDevice',deviceId:PEER,direction});}
 const before=h.calls.length;
 for(const command of [
  {type:'renameDevice',name:''},{type:'renameDevice',name:'x'.repeat(97)},{type:'renameDevice',name:'bad\nname'},
  {type:'renameDevice',name:'valid',deviceId:PEER},{type:'renameDevice',name:'valid',owner:'another-account'},
  {type:'syncDevice',deviceId:'http://private.invalid',direction:'push'},
  {type:'syncDevice',deviceId:PEER,direction:'all'},{type:'syncDevice',deviceId:PEER,direction:'both',url:'private'},
  {type:'syncDevice',deviceId:PEER,direction:'both',owner:'another-account'},
 ]) await assert.rejects(h.client.accountCommand(command),/无效数据/);
 assert.equal(h.calls.length,before);
});

test('credential storage IPC accepts only the two finite values and exact command shape',async t=>{
 const h=setup(t,{initial:{...signedOutAccount(),credentialStorage:'keychain'}});
 for(const storage of ['keychain','encryptedFile']) {
  await h.client.accountCommand({type:'setCredentialStorage',storage});
  assert.deepEqual(h.calls.at(-1),{type:'setCredentialStorage',storage});
 }
 const before=h.calls.length;
 for(const command of [
  {type:'setCredentialStorage'},
  {type:'setCredentialStorage',storage:'keychainFile'},
  {type:'setCredentialStorage',storage:'encrypted_file'},
  {type:'setCredentialStorage',storage:null},
  {type:'setCredentialStorage',storage:'encryptedFile',confirmed:true},
  {type:'setCredentialStorage',storage:'encryptedFile',path:'/private/vault'},
 ]) await assert.rejects(h.client.accountCommand(command),/无效数据/);
 assert.equal(h.calls.length,before);
});

test('credential storage UI requires confirmation, sends one exact IPC and reflects the authoritative selection',async t=>{
 const initial={...signedOutAccount(),credentialStorage:'keychain'};
 const h=setup(t,{initial,reply:(command,model)=>{
  if(command.type==='setCredentialStorage'){const next={...model.get(),credentialStorage:command.storage};model.set(next);return next;}
 }});
 await h.mount();assert(props(h.storageRadio('keychain')).checked);assert(props(h.storageRadio('encryptedFile')).checked===false);
 await h.chooseStorage('encryptedFile');assert(h.calls.every(c=>c.type==='status'));
 await h.click('应用存储方式');
 assert(h.handle().inspect().confirmation);assert(h.calls.every(c=>c.type==='status'));
 assert(h.text().includes('切换凭据存储'));
 assert(h.text().includes('新方式使用独立的 CyberBus 安装身份'));
 await h.click('取消');assert.equal(h.handle().inspect().status.credentialStorage,'keychain');assert(h.calls.every(c=>c.type==='status'));
 await h.click('应用存储方式');await h.click('切换并退出当前身份');
 assert.deepEqual(h.calls.filter(c=>c.type==='setCredentialStorage'),[{type:'setCredentialStorage',storage:'encryptedFile'}]);
 assert.equal(h.handle().inspect().status.credentialStorage,'encryptedFile');
 assert(props(h.storageRadio('encryptedFile')).checked);
 assert(h.text().includes('凭据存储已切换为本机加密文件'));
 assert(h.text().includes('原存储数据已保留'));
});

test('new-install storage UI presents encrypted file as the default and Keychain as optional',async t=>{
 const h=setup(t,{initial:{...signedOutAccount(),credentialStorage:'encryptedFile'}});
 await h.mount();
 assert(props(h.storageRadio('encryptedFile')).checked);
 assert(props(h.storageRadio('keychain')).checked===false);
 assert(h.text().includes('登录与安全'));
 assert(h.text().includes('默认方式，登录信息加密保存在此设备'));
 assert(h.text().includes('系统钥匙串'));
 assert(!h.text().includes('AES-GCM'));
 assert(!h.text().includes('0600'));
 assert(!h.button('应用存储方式'),'unchanged storage needs no redundant apply action');
});

test('credential storage changes are fenced for signed-in, authorizing, busy and cleanup-required states',async t=>{
 const base={...signedOutAccount(),credentialStorage:'keychain'};
 const states=[
  {...base,state:'paused',profile:{subject:'fixture-owner',displayName:'Fixture'}},
  {...base,state:'authorizing',authorizationSurface:'embedded'},
  {...base,state:'error',error:{code:'account_busy',message:'safe'}},
  {...base,state:'error',error:{code:'account_cleanup_required',message:'safe'}},
 ];
 for(const initial of states) {
  const h=setup(t,{initial});await h.mount();const fieldset=h.all().find(e=>e.localName==='fieldset'&&descendants(e).some(e=>props(e).name==='account-credential-storage'));
  assert(props(fieldset).disabled);assert(!h.button('应用存储方式'));
  const before=h.calls.length;
  await act(async()=>{await h.handle().run({type:'setCredentialStorage',storage:'encryptedFile'});});
  assert.equal(h.handle().inspect().confirmation,false);assert.equal(h.calls.length,before);
 }
});

test('late device receipt after an observed account change cannot overwrite new-account status or claim success',async t=>{
 const pending=deferred(),initial=directory();const h=setup(t,{initial,reply:command=>command.type==='syncDevice'?pending.promise:undefined});
 await h.mount();await openPeer(h);await h.click('开始同步');const changed=directory({profile:{subject:'fixture-B',displayName:'B'}});
 h.setNative(changed);await h.tick();assert.equal(h.handle().inspect().status.profile.subject,'fixture-B');
 await act(async()=>pending.resolve({...initial,deviceOperation:{deviceId:PEER,direction:'both',phase:'succeeded',startedAt:100,finishedAt:200}}));
 assert.equal(h.handle().inspect().status.profile.subject,'fixture-B');assert(!h.text().includes('本次传输完成'));assert(props(h.button('开始同步')).disabled);
});

test('device direction controls join the modal Tab loop and Escape restores the exact remote opener',async t=>{
 const h=setup(t,{initial:directory()});await h.mount();const opener=await openPeer(h,OTHER),modal=h.all().find(e=>e.localName==='dialog');
 const push=h.all().find(e=>props(e).name==='account-device-direction'&&props(e).value==='push');
 const both=h.all().find(e=>props(e).name==='account-device-direction'&&props(e).value==='both');
 const key=async(key,shiftKey=false)=>{let stopped=false;await act(async()=>props(modal).onKeyDown({key,shiftKey,preventDefault(){},stopPropagation(){stopped=true;}}));assert(stopped);};
 await key('Tab',true);assert(document.activeElement===both);await key('Tab');assert(document.activeElement===h.button('取消'));
 await key('Tab');assert(document.activeElement===h.button('开始同步'));await key('Tab');assert(document.activeElement===push);
 await key('Escape');assert(document.activeElement===opener);assert(h.calls.every(c=>c.type==='status'));
});

test('JS device fixture renames only the local row and never invents a transfer receipt',async()=>{
 const backend={account:directory(),async boundary(){}};
 await accountFixture(backend,{type:'renameDevice',name:'  Fixture Mac  '});assert.equal(backend.account.devices[0].name,'Fixture Mac');
 assert(backend.account.devices.slice(1).every(d=>d.name==='同名设备'));
 const before=structuredClone(backend.account);await accountFixture(backend,{type:'syncNow'});
 await accountFixture(backend,{type:'syncDevice',deviceId:PEER,direction:'pull'});assert.deepEqual(backend.account,before);assert.equal(backend.account.deviceOperation,undefined);
 await assert.rejects(accountFixture(backend,{type:'renameDevice',name:'valid',deviceId:PEER}));
 await assert.rejects(accountFixture(backend,{type:'syncDevice',deviceId:PEER,direction:'broadcast'}));
});

test('JS credential fixture validates exact input and rejects every active identity state',async()=>{
 const backend={account:{...signedOutAccount(),credentialStorage:'keychain'},async boundary(){}};
 await accountFixture(backend,{type:'setCredentialStorage',storage:'encryptedFile'});
 assert.equal(backend.account.state,'signedOut');assert.equal(backend.account.credentialStorage,'encryptedFile');
 for(const command of [
  {type:'setCredentialStorage'},
  {type:'setCredentialStorage',storage:'keychainFile'},
  {type:'setCredentialStorage',storage:'encryptedFile',confirmed:true},
  {type:'setCredentialStorage',storage:'encryptedFile',path:'/private/vault'},
 ]) await assert.rejects(accountFixture(backend,command));
 for(const account of [
  directory({credentialStorage:'keychain'}),
  {...signedOutAccount(),credentialStorage:'keychain',state:'authorizing',authorizationSurface:'embedded'},
  {...signedOutAccount(),credentialStorage:'keychain',state:'error',error:{code:'account_busy',message:'safe'}},
  {...signedOutAccount(),credentialStorage:'keychain',state:'error',error:{code:'account_cleanup_required',message:'safe'}},
 ]) {
  backend.account=account;
  await assert.rejects(accountFixture(backend,{type:'setCredentialStorage',storage:'encryptedFile'}));
  assert.equal(backend.account.credentialStorage,'keychain');
 }
});

test('an older matching receipt after confirm is not new success, and invalidated dialogs cannot regain success by polling',async t=>{
 const receipt={deviceId:PEER,direction:'both',phase:'succeeded',startedAt:100,finishedAt:200};
 const h=setup(t,{initial:directory({deviceOperation:receipt}),reply:command=>command.type==='syncDevice'?directory({deviceOperation:{...receipt,startedAt:90}}):undefined});
 await h.mount();await openPeer(h);await h.click('开始同步');
 const modal=h.all().find(e=>e.localName==='dialog');
 assert(!modal.textContent.includes('本次传输完成'));
 for(const change of [s=>{s.profile.subject='fixture-B';},s=>{s.devices[0].id='20000000-0000-4000-8000-000000000001';}]) {
  await h.click('取消');h.setNative(directory());await h.tick();await openPeer(h);await h.click('开始同步');
  const changed=directory();change(changed);h.setNative(changed);await h.tick();assert(props(h.button('开始同步')).disabled);
  h.setNative(directory({deviceOperation:{...receipt,startedAt:300,finishedAt:400}}));await h.tick();
  assert(!h.all().find(e=>e.localName==='dialog').textContent.includes('本次传输完成'));assert(props(h.button('开始同步')).disabled);
 }
});

test('a late device rejection cannot write an old account error into the new owner view',async t=>{
 const pending=deferred(),initial=directory();const h=setup(t,{initial,reply:command=>command.type==='syncDevice'?pending.promise:undefined});
 await h.mount();await openPeer(h);await h.click('开始同步');h.setNative(directory({profile:{subject:'fixture-B',displayName:'B'}}));await h.tick();
 await act(async()=>pending.reject({code:'account_sync_failed',message:'private-old-owner-error'}));
 assert.equal(h.handle().inspect().status.profile.subject,'fixture-B');assert.equal(h.handle().inspect().error,'');
 assert(!h.text().includes('本次设备同步未完成'));assert(!h.text().includes('private-old-owner-error'));
});

test('registered debug account actions validate exact parameters before dispatching through the real UI confirmation gate',async t=>{
 const h=setup(t,{initial:directory()});await h.mount();const api=h.debug();
 for(const id of ['account.renameDevice','account.syncDevice']) {
  const descriptor=api.list().find(c=>c.id===id);assert(descriptor);assert.equal(descriptor.available,true);assert.equal(descriptor.mode,'semantic');
 }
 const rename=api.list().find(c=>c.id==='account.renameDevice');assert.deepEqual(Object.keys(rename.args),['name']);assert(rename.args.name.required);
 const sync=api.list().find(c=>c.id==='account.syncDevice');assert.deepEqual(Object.keys(sync.args),['deviceId','direction']);assert(sync.args.deviceId.required);assert(sync.args.direction.required);
 assert.deepEqual(Array.from(sync.args.direction.enum),['push','pull','both']);
 const before=h.calls.length;
 for(const [id,args] of [
  ['account.renameDevice',{}],['account.renameDevice',{name:3}],['account.renameDevice',{name:'  '}],
  ['account.renameDevice',{name:'x'.repeat(97)}],['account.renameDevice',{name:'bad\nname'}],
  ['account.renameDevice',{name:'valid',deviceId:OTHER}],
  ['account.syncDevice',{deviceId:OTHER}],['account.syncDevice',{deviceId:OTHER,direction:'broadcast'}],
  ['account.syncDevice',{deviceId:'protocol-id',direction:'push'}],
  ['account.syncDevice',{deviceId:OTHER,direction:'both',owner:'another-account'}],
  ['account.syncDevice',{deviceId:OTHER,direction:'both',confirmed:true}],
 ]) await assert.rejects(api.execute(id,args),e=>e.code==='INVALID_ARGUMENT');
 assert.equal(h.calls.length,before);assert.equal(h.handle().inspect().confirmation,false);
 api.setPage('settings');await assert.rejects(api.execute('account.syncDevice',{deviceId:OTHER,direction:'push'}),e=>e.code==='APP_ERROR');
 assert.equal(h.calls.length,before);api.setPage('account');
 await act(async()=>{await api.execute('account.syncDevice',{deviceId:OTHER,direction:'pull'});});
 assert(h.handle().inspect().confirmation);assert(h.all().some(e=>props(e).name==='account-device-direction'&&props(e).value==='pull'&&props(e).checked));
 assert.equal(h.calls.length,before);await h.click('取消');assert.equal(h.calls.length,before);
 await act(async()=>{await api.execute('account.syncDevice',{deviceId:OTHER,direction:'push'});});await h.click('开始同步');
 assert.deepEqual(h.calls.at(-1),{type:'syncDevice',deviceId:OTHER,direction:'push'});await h.click('取消');
});

test('debug rename pre-fills the requested local name and cannot save before explicit UI confirmation',async t=>{
 const h=setup(t,{initial:directory(),reply:(command,model)=>{
  if(command.type==='renameDevice'){const next=structuredClone(model.get());next.devices[0].name=command.name;model.set(next);return next;}
 }});await h.mount();const api=h.debug();
 await act(async()=>{await api.execute('account.renameDevice',{name:'  CLI Mac  '});});
 assert(h.handle().inspect().confirmation);assert(h.all().some(e=>e.localName==='input'&&props(e).value==='  CLI Mac  '));assert(!h.calls.some(c=>c.type==='renameDevice'));
 await h.click('取消');assert(!h.calls.some(c=>c.type==='renameDevice'));
 await act(async()=>{await api.execute('account.renameDevice',{name:'  CLI Mac  '});});await h.click('保存名称');
 assert.deepEqual(h.calls.at(-1),{type:'renameDevice',name:'CLI Mac'});assert(h.getNative().devices.slice(1).every(d=>d.name==='同名设备'));
});

test('debug credential storage uses the real confirmation gate and never dispatches while active',async t=>{
 const initial={...signedOutAccount(),credentialStorage:'keychain'};
 const h=setup(t,{initial,reply:(command,model)=>{
  if(command.type==='setCredentialStorage'){const next={...model.get(),credentialStorage:command.storage};model.set(next);return next;}
 }});await h.mount();const api=h.debug();
 const descriptor=api.list().find(c=>c.id==='account.setCredentialStorage');
 assert(descriptor);assert.equal(descriptor.available,true);assert.equal(descriptor.mode,'semantic');
 assert.deepEqual(Object.keys(descriptor.args),['storage']);assert(descriptor.args.storage.required);
 assert.deepEqual(Array.from(descriptor.args.storage.enum),['keychain','encryptedFile']);
 const before=h.calls.length;
 for(const args of [{},{storage:'keychainFile'},{storage:'encrypted_file'},{storage:'encryptedFile',confirmed:true}])
  await assert.rejects(api.execute('account.setCredentialStorage',args),e=>e.code==='INVALID_ARGUMENT');
 assert.equal(h.calls.length,before);assert.equal(h.handle().inspect().confirmation,false);
 await act(async()=>{await api.execute('account.setCredentialStorage',{storage:'encryptedFile'});});
 assert(h.handle().inspect().confirmation);assert.equal(h.calls.length,before);
 await h.click('取消');assert.equal(h.calls.length,before);
 await act(async()=>{await api.execute('account.setCredentialStorage',{storage:'encryptedFile'});});
 await h.click('切换并退出当前身份');
 await h.tick();
 assert.deepEqual(h.calls.slice(before).filter(c=>c.type==='setCredentialStorage'),[{type:'setCredentialStorage',storage:'encryptedFile'}]);
 h.setNative({...initial,state:'paused',profile:{subject:'fixture-owner',displayName:'Fixture'}});await h.poll();
 const pausedCalls=h.calls.length;
 await act(async()=>{await api.execute('account.setCredentialStorage',{storage:'keychain'});});
 assert.equal(h.handle().inspect().confirmation,false);assert.equal(h.calls.length,pausedCalls);
});
