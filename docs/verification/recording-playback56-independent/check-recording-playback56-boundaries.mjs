// Actual NoteEditor -> MediaView/useAttachmentMedia -> AudioPlayer/controller.
// Authorized read responses and HTML media events are controlled; no database,
// audio file or native GUI is accessed, and synthetic bytes are not valid audio.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
const output = resolve(
  process.argv[2] || "docs/verification/recording-playback56/components",
);
await mkdir(output, { recursive: true });
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import NoteEditor from'/src/Editor.tsx';import'/src/style.css';
const h=window.host={reads:[],created:[],revoked:[],events:[],violations:[],audioNodes:new Set()};
const states=new WeakMap();const state=a=>{if(!states.has(a)){states.set(a,{src:'',paused:true,duration:NaN,time:0,ready:0,error:null});h.audioNodes.add(a)}return states.get(a)};
const proto=HTMLMediaElement.prototype;
for(const [name,field]of[['src','src'],['paused','paused'],['duration','duration'],['currentTime','time'],['readyState','ready'],['error','error']])Object.defineProperty(proto,name,{configurable:true,get(){return state(this)[field]},set(value){state(this)[field]=value}});
proto.pause=function(){state(this).paused=true;h.events.push({kind:'pause',src:this.src});this.dispatchEvent(new Event('pause'))};
proto.play=function(){const a=this;h.events.push({kind:'play',src:a.src});if(h.rejectPlay)return Promise.reject(Error('controlled play rejection'));if(h.holdPlay)return new Promise(resolve=>h.resolvePlay=()=>{state(a).paused=false;resolve()});state(a).paused=false;a.dispatchEvent(new Event('play'));return Promise.resolve()};
proto.load=function(){const s=state(this);h.events.push({kind:'load',src:s.src});s.error=null;s.ready=0;s.duration=NaN};
const remove=Element.prototype.removeAttribute;proto.removeAttribute=function(name){if(name==='src'){h.events.push({kind:'clear',src:this.src});state(this).src=''}return remove.call(this,name)};
const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
URL.createObjectURL=blob=>{if(h.failCreate){h.failCreate=false;throw Error('controlled URL creation failure')}const src=create(blob);h.created.push({src,blob});h.events.push({kind:'create',src});return src};
URL.revokeObjectURL=src=>{const active=[...h.audioNodes].filter(a=>a.src===src);if(active.length)h.violations.push('revoke before controller cleared '+active.length+' media elements');h.revoked.push(src);h.events.push({kind:'revoke',src});revoke(src)};
h.state=state;h.ready=(duration=4)=>{const a=document.querySelector('audio');Object.assign(state(a),{duration,ready:1});a.dispatchEvent(new Event('loadedmetadata'))};h.fail=()=>{const a=document.querySelector('audio');state(a).error={code:4};a.dispatchEvent(new Event('error'))};
const root=createRoot(document.querySelector('#root'));h.mount=(id='audio-a',kind='audio')=>{const note={id:'note-a',folderId:'folder',document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Unrelated editor text'}]},{type:'attachment',attrs:{id,kind,name:id+'.m4a'}}]},revision:1,locked:false,paperStyle:'plain'};flushSync(()=>root.render(<NoteEditor note={note} onChange={()=>{}} onReady={e=>{h.editor=e;if(e&&!h.originalEditor)h.originalEditor=e}} onFocus={()=>{}}/>))};
h.swap=(id,kind='audio')=>{let position;h.editor.state.doc.descendants((node,pos)=>{if(node.type.name==='attachment')position=pos});flushSync(()=>h.editor.view.dispatch(h.editor.state.tr.setNodeMarkup(position,undefined,{id,kind,name:id+'.m4a'})))};h.unmount=()=>flushSync(()=>root.render(null));h.resolve=(index,value)=>h.reads[index].resolve(value);h.payload=(data=[0,255,128,0,42,11],mime='audio/mp4')=>({data:btoa(String.fromCharCode(...data)),mime,name:'Saved recording.m4a',recordedAt:1793743199123});h.mount();`;
const vite = await createViteServer({
  configFile: false,
  cacheDir: resolve(output, "vite-cache"),
  plugins: [
    react(),
    {
      name: "playback56-controlled-read",
      enforce: "pre",
      resolveId(id, importer) {
        if (id === "/__playback56.tsx") return id;
        if (
          id === "./bridge" &&
          /\/(Editor|use-attachment-media)\.(tsx|ts)$/.test(importer || "")
        )
          return "\0playback56:bridge";
      },
      load(id) {
        if (id === "/__playback56.tsx") return entry;
        if (id === "\0playback56:bridge")
          return "export const native=false;export const readAttachment=id=>new Promise((resolve,reject)=>window.host.reads.push({id,resolve,reject}));";
      },
    },
  ],
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
const server = createServer((req, res) => {
  if (req.url === "/__check") {
    res.setHeader("Content-Type", "text/html");
    vite
      .transformIndexHtml(
        req.url,
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div class="app desktop separate" style="padding:20px"><div id="root"></div></div><script type="module" src="/__playback56.tsx"></script>',
      )
      .then((html) => res.end(html))
      .catch((e) => {
        res.statusCode = 500;
        res.end(String(e));
      });
  } else vite.middlewares(req, res);
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH)
);
const checks = [],
  errors = [],
  external = [];
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (
      url.startsWith(origin) ||
      url.startsWith("blob:") ||
      url.startsWith("data:")
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
  const reads = (count) =>
    page.waitForFunction((count) => window.host.reads.length === count, count);
  const resolveRead = async (index, mime = "audio/mp4") => {
    await page.evaluate(
      ({ index, mime }) =>
        window.host.resolve(index, window.host.payload(undefined, mime)),
      { index, mime },
    );
    await page.waitForFunction(() =>
      document.querySelector("audio")?.src.startsWith("blob:"),
    );
  };
  await page.goto(origin + "/__check");
  await reads(1);
  await test("authorized saved-audio bytes and MIME create a Blob URL without changing editor or metadata", async () => {
    await resolveRead(0);
    const result = await page.evaluate(async () => {
      const h = window.host,
        c = h.created[0];
      return {
        src: document.querySelector("audio").src,
        created: c.src,
        mime: c.blob.type,
        bytes: [...new Uint8Array(await c.blob.arrayBuffer())],
        reads: h.reads.map((r) => r.id),
        sameEditor: h.editor === h.originalEditor,
        text: h.editor.getText(),
        date: document.querySelector(".audio-recorded-at").textContent,
      };
    });
    assert.equal(result.src, result.created);
    assert.ok(result.src.startsWith("blob:"));
    assert.equal(result.mime, "audio/mp4");
    assert.deepEqual(result.bytes, [0, 255, 128, 0, 42, 11]);
    assert.deepEqual(result.reads, ["audio-a"]);
    assert.equal(result.sameEditor, true);
    assert.match(result.text, /Unrelated editor text/);
    assert.ok(result.date);
  });
  await test("existing controller exposes real MediaError4 and retry; it does not invent duration or playability", async () => {
    await page.evaluate(() => window.host.fail());
    await page.getByRole("button", { name: "重试录音" }).waitFor();
    assert.match(
      await page.locator(".inline-error").textContent(),
      /当前设备无法播放此录音格式/,
    );
    assert.match(
      await page.locator(".audio-duration-desktop").textContent(),
      /时长未知/,
    );
    assert.equal(await page.locator(".audio-play-toggle").isDisabled(), true);
    await page.getByRole("button", { name: "重试录音" }).click();
    await page.waitForFunction(() => !document.querySelector(".inline-error"));
    await page.evaluate(() => window.host.ready(4));
    assert.match(
      await page.locator(".audio-duration-desktop").textContent(),
      /0:04/,
    );
    await page.locator(".audio-play-toggle").click();
    await page.waitForFunction(() =>
      document.querySelector(".audio-play-toggle").textContent.includes("暂停"),
    );
    assert.equal(await page.evaluate(() => window.host.created.length), 1);
  });
  await test("attachment swap disposes actual playing controller and duration probe before revoking its URL", async () => {
    await page.evaluate(() => window.host.ready(Infinity));
    await page.waitForFunction(() => window.host.audioNodes.size >= 2);
    await page.evaluate(() => window.host.swap("audio-b"));
    await reads(2);
    assert.equal(await page.evaluate(() => window.host.revoked.length), 1);
    assert.deepEqual(await page.evaluate(() => window.host.violations), []);
    const ordering = await page.evaluate(() => {
      const h = window.host,
        src = h.created[0].src,
        events = h.events.filter((e) => e.src === src);
      return {
        last: events.at(-1).kind,
        cleared: events.filter((e) => e.kind === "clear").length,
        active: [...h.audioNodes].filter((a) => a.src === src).length,
      };
    });
    assert.equal(ordering.last, "revoke");
    assert.equal(ordering.cleared, 2);
    assert.equal(ordering.active, 0);
    await resolveRead(1, "audio/webm;codecs=opus");
    assert.equal(
      await page.evaluate(() => window.host.created[1].blob.type),
      "audio/webm;codecs=opus",
    );
  });
  await test("late generation read cannot allocate or replace a newer attachment; same editor stays mounted", async () => {
    await page.evaluate(() => window.host.swap("audio-slow"));
    await reads(3);
    await page.evaluate(() => window.host.swap("audio-current"));
    await reads(4);
    await resolveRead(3);
    const before = await page.evaluate(() => window.host.created.length);
    await page.evaluate(() =>
      window.host.resolve(2, window.host.payload([1, 2, 3], "audio/ogg")),
    );
    await page.waitForTimeout(20);
    assert.equal(await page.evaluate(() => window.host.created.length), before);
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector("audio").src ===
          window.host.created.at(-1).src,
      ),
      true,
    );
    assert.equal(
      await page.evaluate(
        () => window.host.editor === window.host.originalEditor,
      ),
      true,
    );
  });
  await test("read failure and URL creation failure show retry in the actual MediaView without remounting editor", async () => {
    await page.evaluate(() => window.host.swap("audio-failure"));
    await reads(5);
    await page.evaluate(() =>
      window.host.reads[4].reject(Error("controlled attachment read failure")),
    );
    await page.getByRole("button", { name: "重试录音" }).waitFor();
    assert.match(
      await page.locator(".inline-error").textContent(),
      /controlled attachment read failure/,
    );
    await page.getByRole("button", { name: "重试录音" }).click();
    await reads(6);
    await page.evaluate(() => {
      window.host.failCreate = true;
      window.host.resolve(5, window.host.payload());
    });
    await page.waitForFunction(() =>
      document
        .querySelector(".inline-error")
        ?.textContent.includes("URL creation failure"),
    );
    await page.getByRole("button", { name: "重试录音" }).click();
    await reads(7);
    await resolveRead(6);
    assert.equal(
      await page.evaluate(
        () => window.host.editor === window.host.originalEditor,
      ),
      true,
    );
  });
  await test("invalid base64 fails visibly without allocating a URL; retry reuses authorized attachment identity", async () => {
    await page.evaluate(() => window.host.swap("audio-invalid"));
    await reads(8);
    const before = await page.evaluate(() => window.host.created.length);
    await page.evaluate(() =>
      window.host.resolve(7, {
        ...window.host.payload(),
        data: "%% invalid base64 %%",
      }),
    );
    await page.getByRole("button", { name: "重试录音" }).waitFor();
    assert.equal(await page.evaluate(() => window.host.created.length), before);
    await page.getByRole("button", { name: "重试录音" }).click();
    await reads(9);
    assert.equal(
      await page.evaluate(() => window.host.reads[8].id),
      "audio-invalid",
    );
    await resolveRead(8);
  });
  await test("non-audio image retains its exact data URL; late read after unmount allocates nothing", async () => {
    await page.evaluate(() => window.host.swap("image", "image"));
    await reads(10);
    const before = await page.evaluate(() => window.host.created.length);
    await page.evaluate(() =>
      window.host.resolve(9, {
        data: "aW1hZ2U=",
        mime: "image/png",
        name: "image.png",
      }),
    );
    await page.waitForFunction(
      () =>
        document.querySelector("img")?.getAttribute("src") ===
        "data:image/png;base64,aW1hZ2U=",
    );
    assert.equal(await page.evaluate(() => window.host.created.length), before);
    await page.evaluate(() => window.host.swap("late-on-unmount"));
    await reads(11);
    await page.evaluate(() => window.host.unmount());
    await page.evaluate(() => window.host.resolve(10, window.host.payload()));
    await page.waitForTimeout(20);
    assert.equal(await page.evaluate(() => window.host.created.length), before);
  });
  await test("unmount stops pending play before URL release, ignores late promise, and releases every created URL once", async () => {
    await page.evaluate(() => window.host.mount("final-audio"));
    await reads(12);
    await resolveRead(11);
    await page.evaluate(() => {
      window.host.ready(3);
      window.host.holdPlay = true;
    });
    await page.locator(".audio-play-toggle").click();
    await page.evaluate(() => window.host.unmount());
    await page.evaluate(() => window.host.resolvePlay());
    await page.waitForTimeout(20);
    const result = await page.evaluate(() => ({
      created: window.host.created.map((c) => c.src),
      revoked: window.host.revoked,
      violations: window.host.violations,
    }));
    assert.deepEqual(result.revoked, result.created);
    assert.equal(new Set(result.revoked).size, result.revoked.length);
    assert.deepEqual(result.violations, []);
  });
  await test("independent: same attachment id across audio/video/file generations rejects late failure and preserves non-audio data URLs", async () => {
    await page.evaluate(() => window.host.mount("same-kind-switch"));
    await reads(13);
    await page.evaluate(() => window.host.swap("same-kind-switch", "video"));
    await reads(14);
    await page.evaluate(() => window.host.reads[12].reject(Error("obsolete audio read rejection")));
    await page.evaluate(() => window.host.resolve(13, {data:"dmlkZW8=",mime:"video/mp4",name:"video.mp4"}));
    await page.waitForFunction(() => document.querySelector("video")?.getAttribute("src") === "data:video/mp4;base64,dmlkZW8=");
    assert.equal(await page.locator(".inline-error").count(), 0);
    const before = await page.evaluate(() => window.host.created.length);
    await page.evaluate(() => window.host.swap("same-kind-switch", "audio"));
    await reads(15);
    await resolveRead(14);
    await page.evaluate(() => {window.host.holdPlay = false;window.host.ready(7)});
    await page.locator(".audio-play-toggle").click();
    await page.waitForFunction(() => document.querySelector(".audio-play-toggle").textContent.includes("暂停"));
    await page.evaluate(() => window.host.swap("same-kind-switch", "file"));
    await reads(16);
    await page.evaluate(() => window.host.resolve(15, {data:"ZmlsZQ==",mime:"application/pdf",name:"file.pdf"}));
    await page.waitForFunction(() => document.querySelector("a.file-card")?.getAttribute("href") === "data:application/pdf;base64,ZmlsZQ==");
    assert.equal(await page.evaluate(() => window.host.created.length), before + 1);
    assert.deepEqual(await page.evaluate(() => window.host.revoked), await page.evaluate(() => window.host.created.map(c=>c.src)));
    assert.deepEqual(await page.evaluate(() => window.host.violations), []);
  });
  await test("independent: invalid attachment metadata fails before URL allocation and visible retry keeps same authorized id", async () => {
    const before = await page.evaluate(() => window.host.created.length);
    await page.evaluate(() => window.host.swap("metadata-invalid", "audio"));
    await reads(17);
    await page.evaluate(() => window.host.resolve(16,{...window.host.payload(),recordedAt:-1}));
    await page.getByRole("button",{name:"重试录音"}).waitFor();
    assert.match(await page.locator(".inline-error").textContent(),/附件录音日期无效/);
    assert.equal(await page.evaluate(() => window.host.created.length),before);
    await page.getByRole("button",{name:"重试录音"}).click();
    await reads(18);
    assert.equal(await page.evaluate(() => window.host.reads[17].id),"metadata-invalid");
    await resolveRead(17);
    await page.evaluate(() => window.host.unmount());
    assert.deepEqual(await page.evaluate(() => window.host.revoked), await page.evaluate(() => window.host.created.map(c=>c.src)));
    assert.deepEqual(await page.evaluate(() => window.host.violations), []);
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  const result = {
    status: "pass",
    checks,
    errors,
    external,
    limits: [
      "Actual NoteEditor/ReactNodeView/MediaView/hook/resource/AudioPlayer and production createAudioPlayback; only authorized read responses and HTML media events controlled.",
      "Synthetic byte constants establish byte/MIME equality and resource lifecycle only; no real encoded audio, WebKit playback, database, native GUI or device claim.",
    ],
  };
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
} catch (error) {
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
