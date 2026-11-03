const exp=n=>Module.getGlobalExportByName(n);
const cls=new NativeFunction(exp('objc_getClass'),'pointer',['pointer']);
const sel=new NativeFunction(exp('sel_registerName'),'pointer',['pointer']);
const sends={};
const call=(o,s,ret='pointer',...args)=>{let key=ret+args.length;let f=sends[key]||(sends[key]=new NativeFunction(exp('objc_msgSend'),ret,['pointer','pointer',...args.map(_=>'pointer')]));return f(o,sel(Memory.allocUtf8String(s)),...args);};
const str=o=>o.isNull()?null:call(o,'UTF8String').readUtf8String();
const cl=n=>cls(Memory.allocUtf8String(n));
const out={pid:Process.id,windows:[],webviews:[],errors:[]};
const main=new NativeCallback(()=>{try{
const a=call(cl('NSApplication'),'sharedApplication');const ws=call(a,'windows');const len=Number(call(ws,'count','ulong'));
const walk=(v,d)=>{if(d>30)return;try{if(call(v,'isKindOfClass:','bool',cl('WKWebView'))){let u=call(v,'URL');out.webviews.push({url:u.isNull()?null:str(call(u,'absoluteString')),loading:call(v,'isLoading','bool'),title:str(call(v,'title'))});}let cs=call(v,'subviews');let n=Number(call(cs,'count','ulong'));for(let i=0;i<n;i++)walk(call(cs,'objectAtIndex:','pointer',ptr(i)),d+1);}catch(e){out.errors.push(String(e));}};
for(let i=0;i<len;i++){let w=call(ws,'objectAtIndex:','pointer',ptr(i));out.windows.push({number:Number(call(w,'windowNumber','long')),title:str(call(w,'title')),visible:call(w,'isVisible','bool')});walk(call(w,'contentView'),0);}
send(out);}catch(e){send({error:String(e),stack:e.stack});}},'void',['pointer']);
const q=exp('_dispatch_main_q');
new NativeFunction(exp('dispatch_async_f'),'void',['pointer','pointer','pointer'])(q,ptr(0),main);
