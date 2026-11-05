// Mount the actual shared View, dedicated child Panel/Session and subscribed owner Dock.
// Native window/IPC and media events are controlled; this is not dual-window QA.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
import { installControlledRecording } from "../../../scripts/recording-platform-fixture.mjs";
if (!process.env.PLAYWRIGHT_CORE_PATH || !process.env.CHROME_PATH)
  throw Error("Existing browser required");
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH)
);
const output = resolve(
  process.argv[2] || "docs/verification/recording-presentation55/components",
);
await mkdir(output, { recursive: true });
const expectsPreflight =
  /import\(\s*["']\.\/native-recording-access["']\s*\)/.test(
    await readFile(resolve("src/recording-session.ts"), "utf8"),
  );
const identity = {
  sessionId: "123e4567-e89b-42d3-a456-426614174000",
  operationId: "123e4567-e89b-42d3-a456-426614174001",
  owner: "main",
  child: "recording-123e4567-e89b-42d3-a456-426614174000",
};
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import{createPortal}from'react-dom';import App from'/src/App.tsx';import RecordingWindow from'/src/RecordingWindow.tsx';import RecordingDock from'/src/RecordingDock.tsx';import{RecordingOwner,validRecordingState,validRecordingAction}from'/src/recording-coordinator.ts';import{decodeRecordingFile}from'/src/recording-window-transport.ts';import{RecordingWaveformHistory}from'/src/recording-waveform.tsx';import'/src/style.css';
const identity=${JSON.stringify(identity)};const root=createRoot(document.querySelector('#root'));const h=window.host={destroyed:0,finished:0,transfers:0,decoded:0,ownerAlive:true,terminal:false,messages:[],visibility:[],acks:[],errors:[],childVisible:true,ownerVisible:true};
window.__TAURI_INTERNALS__={};Object.defineProperty(navigator,'platform',{value:'MacIntel',configurable:true});h.microphoneAccess=[];
const emit=message=>h.listener?.({payload:{...identity,from:'owner',message}});
h.owner=new RecordingOwner(identity,{send:async message=>{h.messages.push(message);if(['saved','discarded'].includes(message.status))h.terminal=true;emit(message)},decode:transfer=>{h.decoded++;return decodeRecordingFile(transfer)},submit:result=>{window.platform.results.push(result);window.platform.files.push(result.file);return new Promise((resolve,reject)=>window.platform.saves.push({resolve,reject}))},discard:async()=>{window.platform.cancels++},view:state=>h.state=state,reveal:async()=>{},closed:()=>{},visibility:async(target,visible)=>{h.visibility.push({target,visible});if(h.failVisibility===target){h.failVisibility=null;throw Error('injected '+target+' visibility failure')}if(h.holdVisibility===target){h.holdVisibility=null;await new Promise(resolve=>h.releaseVisibility=resolve)}if(target==='child'&&!visible){const ack=h.acks.at(-1),s=h.owner.getSnapshot();if(!ack||ack.serial!==s.serial||ack.sequence!==s.state.sequence)throw Error('hidden before matching latest dock render ACK')}h[target+'Visible']=visible;if(target==='child')document.querySelector('#child').hidden=!visible;}});
const originalAck=h.owner.confirmDock.bind(h.owner);h.owner.confirmDock=(sequence,serial)=>{h.acks.push({sequence,serial});if(!h.suppressAck)originalAck(sequence,serial)};
h.window={label:identity.child,listen:async(name,handler)=>{if(name==='notes-recording')h.listener=handler;return()=>{if(h.listener===handler)h.listener=null}},onCloseRequested:async handler=>{h.close=()=>handler({preventDefault:()=>{}});return()=>{}},destroy:async()=>{h.destroyed++;await h.owner.receive({...identity,from:'host',message:{kind:'child-closed'}});root.render(null)}};
h.invoke=async(command,args)=>{if(command==='plugin:notes-ui|recording_access'){if(args?.windowLabel!==h.window.label||Object.keys(args).join(',')!=='windowLabel')throw Error('invalid microphone preflight identity');h.microphoneAccess.push({command,...args});return{status:'authorized'}}if(command==='recording_window_context')return identity;if(command==='recording_window_finish'){if(!h.terminal)throw Error('missing original document ACK');h.finished++;return}if(command==='recording_window_message'){if(!h.ownerAlive)throw Error('original owner lost; File retained');if(args.message.transfer)h.transfers++;void h.owner.receive({...identity,from:'child',message:args.message}).catch(e=>h.errors.push(String(e)));return}throw Error('unexpected '+command)};
h.query=message=>h.owner.receive({...identity,from:'child',message});h.validState=validRecordingState;h.validAction=validRecordingAction;h.bounded=()=>{const history=new RecordingWaveformHistory();for(let i=0;i<10000;i++)history.append(i*100,i%256);return history.samples()};
function AppDock(){const[el,setEl]=React.useState(null);React.useLayoutEffect(()=>{setEl(document.querySelector(".recording-layout"));},[]);return el?createPortal(<RecordingDock owner={h.owner} fail={e=>h.errors.push(String(e))}/>,el):null;}root.render(<><App/><AppDock/><div id="child"><RecordingWindow/></div></>);`;
const modules = {
  "@tauri-apps/api/core":
    "export const isTauri=()=>false;export const invoke=(command,args)=>window.host.invoke(command,args)",
  "@tauri-apps/api/window":
    "export const getCurrentWindow=()=>window.host.window",
  "@tauri-apps/api/event": "export const listen=async()=>()=>{}",
};
const vite = await createViteServer({
  configFile: false,
  cacheDir: resolve(output, "vite-cache"),
  plugins: [
    react(),
    {
      name: "controlled-native-recording-window",
      enforce: "pre",
      resolveId(id) {
        if (id === "/__presentation55.tsx") return id;
        if (modules[id]) return "\0recording55:" + id;
      },
      load(id) {
        if (id === "/__presentation55.tsx") return entry;
        if (id.startsWith("\0recording55:"))
          return modules[id.slice("\0recording55:".length)];
      },
    },
  ],
  server: { middlewareMode: true, host: "127.0.0.1", hmr: false },
  appType: "custom",
});
const server = createServer((req, res) => {
  if (req.url.split("?")[0] === "/__presentation") {
    res.setHeader("Content-Type", "text/html");
    vite
      .transformIndexHtml(
        req.url,
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>#child{position:absolute;right:0;top:0;width:320px;height:600px}#child[hidden]{display:none}#child .recording-window-host{position:absolute}#other-note{width:100%;height:200px}</style><div id="root"></div><script type="module" src="/__presentation55.tsx"></script>',
      )
      .then((s) => res.end(s))
      .catch((e) => {
        res.statusCode = 500;
        res.end(String(e));
      });
  } else vite.middlewares(req, res);
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const checks = [],
  errors = [],
  external = [];
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1120, height: 600 },
  });
  await context.addInitScript(installControlledRecording);
  await context.addInitScript(()=>{
    const note=(id,text,updatedAt)=>({id,folderId:'default',title:text,plainText:text,document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]},createdAt:1,updatedAt,pinned:false,deletedAt:null,originalFolderId:null,locked:false,paperStyle:'plain',revision:0});
    localStorage.setItem('notes-browser-preview',JSON.stringify({notes:[note('app-a','A seed',2),note('app-b','B seed',1)],folders:[{id:'default',name:'备忘录',kind:'folder',parentId:null,sortOrder:0,createdAt:1},{id:'trash',name:'最近删除',kind:'trash',parentId:null,sortOrder:9,createdAt:1}],attachments:[],settings:{selectedFolder:'default',selectedNote:'app-a'}}));
  });
  const page = await context.newPage();
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (
      url.startsWith(origin) ||
      url.startsWith("data:") ||
      url.startsWith("blob:")
    )
      return route.continue();
    external.push(url);
    return route.abort();
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  const test = async (name, run) => {
    await run();
    checks.push(name);
  };
  const pump = async (ms = 0) => {
    await page.evaluate((ms) => window.platform.advance(ms), ms);
    await page.waitForTimeout(20);
    await page.evaluate(() => window.platform.advance(0));
    await page.waitForTimeout(20);
  };
  const phase = async(expected) => {
    for(let i=0;i<100;i++){
      await page.evaluate(()=>window.platform.advance(0));
      if(await page.evaluate(e=>window.host.state?.phase===e,expected))return;
      await page.waitForTimeout(20);
    }
    assert.equal(await page.evaluate(()=>window.host.state?.phase),expected);
  };
  const mode = (expected) =>
    page.waitForFunction(
      (expected) =>
        window.host.owner.getSnapshot().mode === expected &&
        !window.host.owner.getSnapshot().switching,
      expected,
    );
  const switchMode = async (expected) => {
    await page.evaluate(
      (expected) => window.host.owner.switchPresentation(expected),
      expected,
    );
    await mode(expected);
  };
  const open = async (config = { preview: true }) => {
    await page.goto(
      origin +
        `/__presentation?recording=${identity.sessionId}&operation=${identity.operationId}`,
    );
    await page.locator("#child .recording-primary").waitFor();
    await page.evaluate(
      (config) => Object.assign(window.platform.config, config),
      config,
    );
    await pump();
    await phase("idle");
  };
  const begin = async () => {
    await page.locator("#child .recording-primary").click();
    await pump();
    await phase("recording");
  };
  await test("actual App remains editable, searchable, formattable and can create notes while the same child records in Dock", async()=>{
    await open({preview:true});
    await page.locator('.tiptap:visible').waitFor();
    await begin();await pump(2500);await switchMode('dock');
    await page.locator('.tiptap:visible').fill('A edited while recording');
    assert.equal(await page.locator('.tiptap:visible').textContent(),'A edited while recording');
    const hit=await page.locator('.tiptap:visible').evaluate(node=>{const b=node.getBoundingClientRect();return {width:b.width,hit:document.elementFromPoint(b.left+b.width/2,b.top+Math.min(12,b.height/2))?.closest('.app')!==null}});
    assert(hit.width>100);assert.equal(hit.hit,true);
    await page.getByLabel('搜索备忘录',{exact:true}).fill('B seed');
    await page.waitForFunction(()=>document.querySelectorAll('.note-row').length===1);
    await page.locator('.note-row').click();
    await page.getByLabel('搜索备忘录',{exact:true}).fill('');
    await page.locator('.tiptap:visible').fill('B edited while recording');
    await page.locator('.tiptap:visible').evaluate(node=>node.editor.commands.selectAll());
    await page.getByRole('button',{name:'格式',exact:true}).click();
    await page.getByRole('button',{name:'粗体',exact:true}).click();
    assert.equal(await page.locator('.tiptap:visible strong').textContent(),'B edited while recording');
    await page.getByRole('button',{name:'格式',exact:true}).click();
    await page.getByRole('button',{name:'新建备忘录',exact:true}).first().click();
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('notes-browser-preview')).notes.length===3);
    await page.locator('.tiptap:visible').fill('C newly created while recording');
    await switchMode('float');await switchMode('dock');await pump(500);
    const observation=await page.evaluate(()=>({starts:window.platform.starts,requests:window.platform.requests,pauses:window.platform.pauses,stops:window.platform.stops,trackStops:window.platform.trackStops,recordedAt:window.host.state.recordedAt,phase:window.host.state.phase,notes:JSON.parse(localStorage.getItem('notes-browser-preview')).notes.map(n=>({id:n.id,title:n.title,document:n.document})),app:document.querySelector('.app').getBoundingClientRect().toJSON(),dock:document.querySelector('.recording-dock').getBoundingClientRect().toJSON()}));
    assert.equal(observation.starts,1);assert.equal(observation.requests,1);assert.equal(observation.pauses,0);assert.equal(observation.stops,0);assert.equal(observation.trackStops,0);assert.equal(observation.phase,'recording');assert(observation.app.right<=observation.dock.left);
    await writeFile(resolve(output,'actual-app-observation.json'),JSON.stringify(observation,null,2)+'\n');
    await page.screenshot({path:resolve(output,'actual-app-recording-docked.png')});
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  assert.deepEqual(await page.evaluate(() => window.host.errors), []);
  const result = {
    status: "pass",
    checks,
    errors,
    external,
    limitations: [
      "Actual RecordingView/Dock/RecordingWindow/Panel/Session/Owner; window/IPC/microphone/media events are controlled, serial browser only.",
      "No native window, WebKit remote user gesture, microphone/audio audibility, mobile device or Apple pixel-parity claim. Original App/PM/SaveQueue validation runs separately.",
    ],
  };
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
 } catch (error) {
  const failedPage=browser?.contexts()[0]?.pages()[0];
  if(failedPage){await failedPage.screenshot({path:resolve(output,'failure.png')});await writeFile(resolve(output,'failure-observation.json'),JSON.stringify(await failedPage.evaluate(()=>({state:window.host?.state,errors:window.host?.errors,appText:document.querySelector('.app')?.innerText,body:document.body.innerText,platform:{requests:window.platform?.requests,starts:window.platform?.starts}})),null,2)+'\n');}
  await writeFile(
    resolve(output, "failure.json"),
    JSON.stringify(
      { error: String(error), stack: error.stack, checks, errors, external },
      null,
      2,
    ) + "\n",
  );
  throw error;
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
  await vite.close();
}
