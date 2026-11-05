import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
const output = resolve(
  process.argv[2] || "docs/verification/mac-recording-autosave64/author",
);
await mkdir(output, { recursive: true });
const entry = String.raw`import React from'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import RecordingWindow from'/src/RecordingWindow.tsx';import{RecordingOwner}from'/src/recording-coordinator.ts';import{decodeRecordingFile}from'/src/recording-window-transport.ts';import{DesktopRecordingSession}from'/src/desktop-recording-session.ts';import{RecordingPcm}from'/src/recording-pcm.ts';import{Editor}from'@tiptap/core';import{createEditorExtensions}from'/src/editor-schema.ts';import{mountRecordingCard}from'/src/recording-live-card.ts';import{replaceRecordingAttachment}from'/src/recording-replacement.ts';import'/src/style.css';
const h=window.host={messages:[],statuses:[],results:[],states:[],errors:[],starts:0,streams:0,destroyed:0,finishes:[],stopEvents:0};
h.identity={sessionId:'s',operationId:'op',owner:'main',child:'child'};
h.context=new AudioContext({sampleRate:48000});await h.context.resume();h.destination=h.context.createMediaStreamDestination();h.osc=h.context.createOscillator();h.osc.frequency.value=440;h.osc.connect(h.destination);h.osc.start();
Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{h.streams++;return h.destination.stream}});
const NativeRecorder=MediaRecorder;window.MediaRecorder=class extends NativeRecorder{start(...args){h.starts++;return super.start(...args)}stop(){h.stopCalls=(h.stopCalls||0)+1;return super.stop()}constructor(...args){super(...args);this.addEventListener('stop',()=>h.stopEvents++)}};
const nativeDecode=AudioContext.prototype.decodeAudioData;AudioContext.prototype.decodeAudioData=async function(...args){const result=await nativeDecode.apply(this,args);if(h.holdDecode)await new Promise(r=>h.releaseDecode=r);return result};
const NativeReader=FileReader;window.FileReader=class extends NativeReader{readAsDataURL(file){if(h.holdEncode)h.releaseEncode=()=>super.readAsDataURL(file);else super.readAsDataURL(file)}};
const send=async message=>{h.statuses.push(message);h.listener?.({payload:{...h.identity,from:'owner',message}})};
h.owner=new RecordingOwner(h.identity,{send,decode:decodeRecordingFile,submit:async()=>{throw Error('legacy desktop submit')},saveRevision:async r=>{h.results.push(r);if(h.holdSave)await new Promise(resolve=>h.releaseSave=resolve);if(h.failSave){h.failSave=false;throw Error('controlled save failure')}},discard:async()=>{},view:s=>h.states.push(s),reveal:async()=>{},closed:s=>h.closed=s});
h.window={label:'child',listen:async(name,fn)=>{h.listener=fn;return()=>{h.listener=null}},onCloseRequested:async fn=>{h.close=()=>fn({preventDefault(){}});return()=>{}},destroy:async()=>{h.destroyAttempts=(h.destroyAttempts||0)+1;if(h.failDestroy){h.failDestroy=false;throw Error('controlled destroy failure')}h.destroyed++;await h.owner.receive({...h.identity,from:'host',message:{kind:'child-closed'}})}};
h.invoke=async(command,args)=>{if(command==='recording_window_context')return h.identity;if(command==='recording_window_finish'){h.finishes.push(args.revision);const status=h.statuses.at(-1);if(status.status!=='saved'||status.revision!==args.revision)throw Error('inexact final ACK');return}if(command==='recording_window_message'){h.messages.push(args.message);return h.owner.receive({...h.identity,from:'child',message:args.message})}throw Error('unexpected IPC '+command)};
h.root=createRoot(document.getElementById('root'));h.mount=()=>flushSync(()=>h.root.render(<RecordingWindow/>));h.unmount=()=>flushSync(()=>h.root.unmount());h.mount();
h.widget=()=>{const element=document.createElement('div');document.body.append(element);const editor=new Editor({element,extensions:createEditorExtensions(),content:'<p>Original text</p>'});editor.commands.setTextSelection(3);const bookmark=editor.state.selection.getBookmark(),card=mountRecordingCard({editor,bookmark});const attachment=id=>({id,noteId:'a',kind:'audio',displayName:'新录音.wav'});const before=JSON.stringify(editor.getJSON());replaceRecordingAttachment(editor,bookmark,attachment('one'));card.persisted('one');const first={live:element.querySelectorAll('.live-recording-card').length,hidden:element.querySelector('[data-attachment]').style.display};replaceRecordingAttachment(editor,bookmark,attachment('two'),attachment('one'));card.persisted('two');const json=editor.getJSON(),second={live:element.querySelectorAll('.live-recording-card').length,hidden:element.querySelector('[data-attachment]').style.display,cards:element.querySelectorAll('[data-attachment]').length};card.dispose();const final={live:element.querySelectorAll('.live-recording-card').length,visible:getComputedStyle(element.querySelector('[data-attachment]')).display!=='none',id:json.content.find(n=>n.type==='attachment').attrs.id,text:editor.getText()};editor.destroy();element.remove();return{first,second,final,before}};
h.direct=async()=>{
 const errors=[],events=[];const context=new AudioContext({sampleRate:48000});await context.resume();const dest=context.createMediaStreamDestination(),osc=context.createOscillator();osc.frequency.value=440;osc.connect(dest);osc.start();let streams=0,auth=0,recorders=0;const s=new DesktopRecordingSession({onRecording:()=>events.push('recording'),onLevel:()=>{},onError:e=>errors.push(String(e))},{authorize:async()=>{auth++},getStream:async()=>{streams++;return dest.stream},createRecorder:stream=>{recorders++;const r=new NativeRecorder(stream,{mimeType:'audio/webm;codecs=opus'});r.addEventListener('stop',()=>events.push('stop'));return r},createContext:()=>new AudioContext(),setInterval:(f,t)=>setInterval(f,t),clearInterval:t=>clearInterval(t)});
 await s.start();await new Promise(r=>setTimeout(r,430));const first=await s.checkpoint();events.push('checkpoint1');const decode=async blob=>{const c=new AudioContext({sampleRate:24000});try{return await c.decodeAudioData(await blob.arrayBuffer())}finally{await c.close()}};const a=await decode(first);await new Promise(r=>setTimeout(r,330));osc.frequency.value=880;if(!s.resume())throw Error('resume refused');await new Promise(r=>setTimeout(r,470));const final=await s.checkpoint();events.push('checkpoint2');const b=await decode(final),bytes=await final.arrayBuffer(),view=new DataView(bytes);const freq=(data,start,end)=>{let crosses=0;for(let i=start+1;i<end;i++)if(data[i-1]<=0&&data[i]>0)crosses++;return crosses*24000/(end-start)};const samples=b.getChannelData(0),f1=freq(samples,Math.floor(a.length*.2),Math.floor(a.length*.8)),f2=freq(samples,a.length+Math.floor((b.length-a.length)*.2),a.length+Math.floor((b.length-a.length)*.8));s.dispose();osc.stop();await context.close();return{errors,events,auth,streams,recorders,firstDuration:a.duration,duration:b.duration,firstFrames:a.length,frames:b.length,rate:b.sampleRate,channels:b.numberOfChannels,f1,f2,header:{channels:view.getUint16(22,true),rate:view.getUint32(24,true),bits:view.getUint16(34,true),data:view.getUint32(40,true),size:final.size}};
};
h.boundaries=async()=>{
 const errors=[],makeStream=()=>h.destination.stream.clone(),callbacks={onRecording:()=>{},onLevel:()=>{},onError:e=>errors.push(String(e))};let release;const late=new Promise(r=>release=r),timer=setTimeout;window.setTimeout=(f,ms,...args)=>timer(f,ms===45000?15:ms,...args);const s=new DesktopRecordingSession(callbacks,{getStream:()=>late,createContext:()=>{throw Error('must not create')},createRecorder:()=>{throw Error('must not record')},setInterval:(f,t)=>setInterval(f,t),clearInterval:t=>clearInterval(t)});await s.start();window.setTimeout=timer;const stream=makeStream();release(stream);await Promise.resolve();await Promise.resolve();const lateStopped=stream.getTracks().every(t=>t.readyState==='ended');s.dispose();
 const startup=[];for(const failure of ['context','analyser','recorder','start']){const st=makeStream();const ctx={createAnalyser(){if(failure==='analyser')throw Error(failure);return{fftSize:0,disconnect(){}}},createMediaStreamSource(){return{connect(){},disconnect(){}}},close:async()=>{}};const session=new DesktopRecordingSession(callbacks,{getStream:async()=>st,createContext:()=>{if(failure==='context')throw Error(failure);return ctx},createRecorder:()=>{if(failure==='recorder')throw Error(failure);return{state:'inactive',start(){throw Error(failure)}}},setInterval:(f,t)=>setInterval(f,t),clearInterval:t=>clearInterval(t)});await session.start();startup.push({failure,stopped:st.getTracks().every(t=>t.readyState==='ended')});session.dispose()}
 const pcm=new RecordingPcm();let empty=false,limit=false,nonfinite=false;try{pcm.wav()}catch{empty=true}try{pcm.append({sampleRate:24000,numberOfChannels:1,length:(100*1024*1024-44)/2+1})}catch{limit=true}try{pcm.append({sampleRate:24000,numberOfChannels:1,length:1,getChannelData:()=>new Float32Array([NaN])})}catch{nonfinite=true}pcm.append({sampleRate:24000,numberOfChannels:2,length:4,getChannelData:i=>new Float32Array(i?[1,-1,.5,-.5]:[1,-1,-.5,.5])});const wav=await pcm.wav().arrayBuffer(),v=new DataView(wav);return{lateStopped,startup,empty,limit,nonfinite,samples:[0,1,2,3].map(i=>v.getInt16(44+i*2,true)),errors};
};`;
const modules = {
  "@tauri-apps/api/core":
    "export const isTauri=()=>true;export const invoke=(c,a)=>window.host.invoke(c,a)",
  "@tauri-apps/api/window":
    "export const getCurrentWindow=()=>window.host.window",
  "@tauri-apps/api/event":
    "export const listen=async()=>()=>{};export const emit=async()=>{};export const emitTo=async()=>{}",
};
const vite = await createViteServer({
  configFile: false,
  cacheDir: resolve(output, "vite-cache64"),
  plugins: [
    {
      name: "autosave64-boundary",
      enforce: "pre",
      resolveId(id) {
        if (id === "/__autosave64.tsx") return id;
        if (modules[id]) return "\0autosave64:" + id;
      },
      load(id) {
        if (id === "/__autosave64.tsx") return entry;
        if (id.startsWith("\0autosave64:")) return modules[id.slice(12)];
      },
    },
    react(),
  ],
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
const server = createServer((req, res) => {
  if (req.url.startsWith("/__check"))
    vite
      .transformIndexHtml(
        req.url,
        '<!doctype html><div id="root"></div><script type="module" src="/__autosave64.tsx"></script>',
      )
      .then((s) => res.end(s))
      .catch((e) => {
        res.statusCode = 500;
        res.end(String(e));
      });
  else vite.middlewares(req, res);
});
await new Promise((r, j) => {
  server.once("error", j);
  server.listen(0, "127.0.0.1", r);
});
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH)
);
const checks = [],
  pageErrors = [];
let browser, page, context;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  const origin = "http://127.0.0.1:" + server.address().port;
  const open = async () => {
    await context?.close();
    context = await browser.newContext();
    page = await context.newPage();
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    await page.goto(origin + "/__check?recording=s&operation=op");
    await page.locator(".recording-primary").waitFor();
    return page;
  };
  const test = async (name, run) => {
    console.log("RUN", name);
    checks.push({ name, pass: true, ...(await run()) });
  };
  await test("real MediaRecorder complete oscillator segments decode to ordered 24k mono PCM without pause gap", async () => {
    await open();
    const r = await page.evaluate(() => window.host.direct());
    assert.deepEqual(r.errors, []);
    assert.equal(r.auth, 1);
    assert.equal(r.streams, 1);
    assert.equal(r.recorders, 2);
    assert.equal(r.rate, 24000);
    assert.equal(r.channels, 1);
    assert(r.duration > 0.65 && r.duration < 1.2);
    assert(Math.abs(r.f1 - 440) < 20);
    assert(Math.abs(r.f2 - 880) < 20);
    assert.deepEqual(r.events, [
      "recording",
      "stop",
      "checkpoint1",
      "recording",
      "stop",
      "checkpoint2",
    ]);
    assert.equal(r.header.size, r.header.data + 44);
    assert.equal(r.header.bits, 16);
    return r;
  });
  await test("actual editor live projection hides durable revisions and disposal reveals exactly the latest card", async () => {
    const r = await page.evaluate(() => window.host.widget());
    assert.deepEqual(r.first, { live: 1, hidden: "none" });
    assert.deepEqual(r.second, { live: 1, hidden: "none", cards: 1 });
    assert.equal(r.final.live, 0);
    assert(r.final.visible);
    assert.equal(r.final.id, "two");
    assert(r.final.text.replace(/\s/g, "").includes("Originaltext"));
    return r;
  });
  await test("startup timeout late stream and preparation failures stop tracks; WAV numeric and 100MiB admission boundaries", async () => {
    const r = await page.evaluate(() => window.host.boundaries());
    assert(r.lateStopped);
    assert(r.startup.every((v) => v.stopped));
    assert(r.empty && r.limit && r.nonfinite);
    assert.deepEqual(r.samples, [32767, -32768, 0, 0]);
    return r;
  });
  await test("production Window/Panel/Owner pause ACK leaves capture window open and continuation uses original stream", async () => {
    await open();
    await page.locator(".recording-primary").click();
    await page.waitForFunction(() => window.host.starts === 1);
    await page.waitForTimeout(350);
    await page.locator(".recording-primary").click();
    await page.waitForFunction(() =>
      window.host.statuses.some((s) => s.status === "checkpoint-saved"),
    );
    await page.waitForFunction(
      () => window.host.states.at(-1)?.phase === "paused",
    );
    assert.equal(await page.evaluate(() => window.host.destroyed), 0);
    await page.locator(".recording-primary").click();
    await page.waitForFunction(() => window.host.starts === 2);
    await page.waitForTimeout(350);
    await page.evaluate(() => {
      window.host.close();
      window.host.close();
    });
    await page.waitForFunction(() => window.host.destroyed === 1);
    const r = await page.evaluate(() => ({
      streams: window.host.streams,
      starts: window.host.starts,
      results: window.host.results.map((r) => ({
        revision: r.revision,
        intent: r.intent,
        size: r.file.size,
        date: r.recordedAt,
      })),
      finishes: window.host.finishes,
      destroyAttempts: window.host.destroyAttempts,
    }));
    assert.equal(r.streams, 1);
    assert.deepEqual(
      r.results.map((r) => r.intent),
      ["checkpoint", "final"],
    );
    assert(r.results[1].size > r.results[0].size);
    assert.equal(r.results[0].date, r.results[1].date);
    assert.deepEqual(r.finishes, [2]);
    assert.equal(r.destroyAttempts, 1);
    return r;
  });
  for (const gate of ["Decode", "Encode", "Save"])
    await test(
      "Close queues during " +
        gate +
        " checkpoint and exact later final ACK destroys once",
      async () => {
        await open();
        await page.locator(".recording-primary").click();
        await page.waitForFunction(() => window.host.starts === 1);
        await page.waitForTimeout(300);
        await page.evaluate((g) => (window.host["hold" + g] = true), gate);
        await page.locator(".recording-primary").click();
        await page.waitForFunction(
          (g) => typeof window.host["release" + g] === "function",
          gate,
        );
        await page.evaluate(() => {
          window.host.close();
          window.host.close();
        });
        assert.equal(await page.evaluate(() => window.host.destroyed), 0);
        await page.evaluate((g) => {
          window.host["hold" + g] = false;
          window.host["release" + g]();
        }, gate);
        await page.waitForFunction(() => window.host.destroyed === 1);
        const r = await page.evaluate(() => ({
          results: window.host.results.map((r) => ({
            revision: r.revision,
            intent: r.intent,
            size: r.file.size,
          })),
          finishes: window.host.finishes,
          destroyAttempts: window.host.destroyAttempts,
        }));
        assert.equal(r.results.at(-1).intent, "final");
        assert.equal(r.destroyAttempts, 1);
        assert.deepEqual(r.finishes, [r.results.at(-1).revision]);
        return r;
      },
    );
  await test("failed save and destroy retain same revision/File and retry without repeated encoding or audio capture", async () => {
    await open();
    await page.locator(".recording-primary").click();
    await page.waitForFunction(() => window.host.starts === 1);
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      window.host.failSave = true;
      window.host.close();
    });
    await page.waitForFunction(
      () => window.host.states.at(-1)?.phase === "retry",
    );
    await page.evaluate(() => {
      window.host.failDestroy = true;
      window.host.close();
    });
    await page.waitForFunction(() => window.host.destroyAttempts === 1);
    await page.waitForFunction(
      () => window.host.states.at(-1)?.phase === "retry",
    );
    await page.evaluate(() => window.host.close());
    await page.waitForFunction(() => window.host.destroyed === 1);
    const r = await page.evaluate(() => ({
      results: window.host.results.length,
      same: window.host.results[0].file === window.host.results[1].file,
      starts: window.host.starts,
      submits: window.host.messages
        .filter((m) => m.kind === "revision-submit")
        .map((m) => ({ revision: m.revision, transfer: !!m.transfer })),
      destroyAttempts: window.host.destroyAttempts,
    }));
    assert(r.same);
    assert.equal(r.results, 2);
    assert.equal(r.starts, 1);
    assert.equal(r.destroyAttempts, 2);
    assert.equal(r.submits.filter((m) => m.transfer).length, 1);
    return r;
  });
  assert.deepEqual(pageErrors, []);
  await writeFile(
    resolve(output, "browser.json"),
    JSON.stringify({ pass: true, checks, pageErrors }, null, 2),
  );
  console.log(JSON.stringify({ pass: true, checks }, null, 2));
} catch (error) {
  await writeFile(
    resolve(output, "browser-failure.json"),
    JSON.stringify(
      {
        pass: false,
        checks,
        pageErrors,
        snapshot: await page
          ?.evaluate(() => ({
            states: window.host?.states,
            statuses: window.host?.statuses,
            results: window.host?.results?.map((r) => ({
              revision: r.revision,
              intent: r.intent,
            })),
            finishes: window.host?.finishes,
            destroyAttempts: window.host?.destroyAttempts,
          }))
          .catch(() => null),
        error: String(error),
        stack: error.stack,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
  await vite.close();
}
