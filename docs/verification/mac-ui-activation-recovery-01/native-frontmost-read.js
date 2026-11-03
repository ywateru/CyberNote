// Read-only ephemeral process observation. No hooks, page globals or UI mutation.
const exp=n=>Module.getGlobalExportByName(n);
const cls=new NativeFunction(exp('objc_getClass'),'pointer',['pointer']);
const sel=new NativeFunction(exp('sel_registerName'),'pointer',['pointer']);
const sends={};
const call=(o,s,ret='pointer',...args)=>{let key=JSON.stringify(ret)+args.length;let f=sends[key]||(sends[key]=new NativeFunction(exp('objc_msgSend'),ret,['pointer','pointer',...args.map(_=>'pointer')]));return f(o,sel(Memory.allocUtf8String(s)),...args);};
const str=o=>o.isNull()?null:call(o,'UTF8String').readUtf8String();
const cl=n=>cls(Memory.allocUtf8String(n));
const ns=s=>call(cl('NSString'),'stringWithUTF8String:','pointer',Memory.allocUtf8String(s));
const roots=[];
function block(fn){const invoke=new NativeCallback(fn,'void',['pointer','pointer','pointer']);const desc=Memory.alloc(16);desc.writeU64(0);desc.add(8).writeU64(32);const b=Memory.alloc(32);b.writePointer(exp('_NSConcreteGlobalBlock'));b.add(8).writeU32(1<<28);b.add(12).writeU32(0);b.add(16).writePointer(invoke);b.add(24).writePointer(desc);roots.push(invoke,desc,b);return b;}
const out={pid:Process.id,at:new Date().toISOString(),windows:[],errors:[]};
const main=new NativeCallback(()=>{try{
const app=call(cl('NSApplication'),'sharedApplication');
const front=call(call(cl('NSWorkspace'),'sharedWorkspace'),'frontmostApplication');
out.application={active:call(app,'isActive','bool'),hidden:call(app,'isHidden','bool'),frontmostBundle:str(call(front,'bundleIdentifier')),frontmostPid:Number(call(front,'processIdentifier','int'))};
const ws=call(app,'windows');const len=Number(call(ws,'count','ulong'));
for(let i=0;i<len;i++){const w=call(ws,'objectAtIndex:','pointer',ptr(i));const number=Number(call(w,'windowNumber','long'));if(number!==1599&&number!==68273)continue;const responder=call(w,'firstResponder');out.windows.push({number,visible:call(w,'isVisible','bool'),key:call(w,'isKeyWindow','bool'),main:call(w,'isMainWindow','bool'),frame:call(w,'frame',['double','double','double','double']),firstResponderClass:responder.isNull()?null:str(call(call(responder,'class'),'description'))});}
send(out);}catch(e){send({error:String(e)});}},'void',['pointer']);roots.push(main);
new NativeFunction(exp('dispatch_async_f'),'void',['pointer','pointer','pointer'])(exp('_dispatch_main_q'),ptr(0),main);
