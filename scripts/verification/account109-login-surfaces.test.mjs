import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {resolve} from 'node:path';
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
const window={document,HTMLElement:HostElement,HTMLIFrameElement:class {},addEventListener(){},removeEventListener(){},
  setInterval(fn){const id=++timerId;intervals.set(id,fn);return id;},clearInterval(id){intervals.delete(id);}};
document.defaultView=window;
Object.assign(globalThis,{window,document,HTMLElement:HostElement,IS_REACT_ACT_ENVIRONMENT:true});
const React=await import('react');
const {createRoot}=await import('react-dom/client');
const {act}=React;
const require=createRequire(import.meta.url);
const {build}=createRequire(require.resolve('vite'))('esbuild');
const built=await build({stdin:{contents:`export {default as AccountSettings} from './src/AccountSettings'; export * from './src/account-client'; export {catalog} from './src/debug/catalog';`,resolveDir:resolve('.'),loader:'ts'},
  bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime'],loader:{'.css':'empty'},
  define:{'import.meta.env.DEV':'true','import.meta.env.VITE_NOTES_DEBUG':'"1"','import.meta.env.VITE_NOTES_ACCOUNT_NATIVE':'"1"','import.meta.env.VITE_NOTES_ACCOUNT_UI':'"0"'},
  plugins:[{name:'fixed-ipc-fixture',setup(b){
    b.onResolve({filter:/^@tauri-apps\/api\/core$/},()=>({path:'ipc',namespace:'fixture'}));
    b.onResolve({filter:/^lucide-react$/},()=>({path:'icons',namespace:'fixture'}));
    b.onResolve({filter:/^\.\/data-management$/},()=>({path:'time',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path==='ipc'
      ? 'export const isTauri=()=>true; export const invoke=(name,args)=>globalThis.__invoke(name,args);'
      : path==='icons'?'export const UserRound=()=>null,Laptop=()=>null,Smartphone=()=>null;'
      : 'export const formatFileTime=()=>"Fixture time";'}));
  }}]});

function descendants(node) {return node.childNodes.flatMap(c=>[c,...descendants(c)]).filter(n=>n.nodeType===1);}
function props(node) {const key=Object.keys(node).find(k=>k.startsWith('__reactProps$'));assert(key);return node[key];}
function deferred() {let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
const authorizing=surface=>({...signedOutAccount(),state:'authorizing',...(surface?{authorizationSurface:surface}:{})});
const adoptionRecoveryGuidance='若旧同步来自“设备同步”，可退出当前账户，再前往“设备同步”恢复并处理旧同步。若旧账户仍有待接收内容，可退出当前账户并重新登录旧账户；身份及同步空间验证通过且原同步凭证仍可用时，会恢复旧设备身份，同步仍保持暂停。请确认开启原同步空间并处理待接收内容，完成后再退出，登录目标账户并确认开启合并。';

function setup(t,{initial=signedOutAccount(),reply,onConflicts=()=>{}}={}) {
  let native=structuredClone(initial),handle;
  const calls=[],context=vm.createContext({module:{exports:{}},require,window,document,HTMLElement:HostElement,queueMicrotask,
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
    all,handle:()=>handle,text:()=>container.textContent,
    panel:()=>all().find(e=>props(e).className==='account-settings'),
    radio:value=>all().find(e=>e.localName==='input'&&props(e).name==='account-login-surface'&&props(e).value===value),
    buttons:()=>all().filter(e=>e.localName==='button'),
    button:label=>all().find(e=>e.localName==='button'&&e.textContent===label),
    actionLabels:()=>{const section=all().find(e=>props(e)['aria-label']==='CyberNote 账户');return descendants(section).filter(e=>e.localName==='button').map(e=>e.textContent);},
    async click(label){const button=h.button(label);assert(button,`Missing ${label}`);assert(!props(button).disabled);const modal=all().find(e=>e.localName==='dialog'&&e.open);assert(!modal||modal.contains(button),'host actions must respect native modal isolation');await act(async()=>{props(button).onClick({currentTarget:button});});},
    async choose(value){const radio=h.radio(value);assert(radio);const fieldset=all().find(e=>e.localName==='fieldset');assert(!props(fieldset).disabled);await act(async()=>{props(radio).onChange();});},
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
 assert(h.text().includes('本库当前已有的全部备忘录及附件（包括先前同步后保留的内容）将与当前账户其他设备的备忘录合并'));
 await h.click('开启并合并');assert.deepEqual(h.calls.at(-1),{type:'setEnabled',enabled:true});
 assert.equal(h.calls.filter(c=>c.type==='setEnabled').length,1);
});

test('switch opens a labelled native modal without enabling; local Tab/Escape handling protects the parent trap',async t=>{
 const h=setup(t,{initial:{...signedOutAccount(),state:'paused',profile:{subject:'fixture-B',displayName:'B'}}});
 await h.mount();const toggle=h.all().find(e=>e.localName==='input'&&props(e).id==='account-enabled');
 assert.equal(props(toggle).type,'checkbox');assert.equal(props(toggle).role,'switch');
 assert.equal(props(toggle).checked,false);assert.equal(props(toggle).disabled,false);
 assert(h.all().some(e=>e.localName==='label'&&props(e).htmlFor==='account-enabled'&&e.textContent==='同步此设备'));
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
 await key('Tab',true);assert.equal(document.activeElement,h.button('开启并合并'));
 await key('Tab');assert.equal(document.activeElement,h.button('取消'));
 await key('Tab');assert.equal(document.activeElement,h.button('开启并合并'));
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
 await act(async()=>props(toggle).onChange({target:{checked:true}}));await h.click('开启并合并');
 const modal=h.all().find(e=>e.localName==='dialog');
 assert.equal(props(toggle).checked,false);assert.equal(props(toggle).disabled,true);
 assert(props(h.button('取消')).disabled);assert(props(h.button('开启并合并')).disabled);
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
 toggle.focus();await act(async()=>props(toggle).onChange({target:{checked:true}}));await h.click('开启并合并');
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
  assert(!h.button('重试登录'));assert(!h.button('重试连接'));assert(props(h.button('立即同步')).disabled);
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
 await h.click('开启并合并');assert(h.text().includes('开启同步前需要处理旧同步内容'));
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
