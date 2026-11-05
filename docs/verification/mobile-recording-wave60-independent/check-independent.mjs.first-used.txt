// Actual shared RecordingView projection; no native/media/device operations.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
const output = resolve(process.argv[2]);
const baseline = process.argv.includes("--baseline");
const compareArg = process.argv.indexOf("--compare");
const compare = compareArg < 0 ? null : resolve(process.argv[compareArg + 1]);
await mkdir(output, { recursive: true });
const oldSources = new Map(
  baseline
    ? ["src/RecordingView.tsx", "src/RecordingPanel.css"].map((p) => [
        resolve(p),
        execFileSync("git", ["show", `99dbb95ed0d4f796a71fcb40d5179ed6d90eeaa6:${p}`], { encoding: "utf8" }),
      ])
    : [],
);
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH)
);
const entry = `import React from'react';import{createRoot}from'react-dom/client';import RecordingView from'/src/RecordingView.tsx';import'/src/style.css';const root=createRoot(document.querySelector('#root'));
const date=new Date();date.setHours(10,26,0,0);const base={sequence:1,phase:'paused',openedAt:date.getTime(),recordedAt:date.getTime(),elapsed:2600,paused:true,canToggle:true,canFinish:true,notice:'',hasError:false,position:2600,duration:2600,previewPosition:true,playing:false,playPending:false,previewPending:false,seeking:false,canPlay:true,canSeek:true,canRetryPreview:false,seekable:[[0,2600]],samples:[]};window.actions=[];window.mount=(mobile,patch={},dark=false)=>{window.actions=[];root.render(<div className={'app '+(mobile?'mobile':'desktop')+(dark?' dark':'')} style={{position:'relative',height:'100vh',width:'100vw',padding:0,display:'block'}}><RecordingView mobile={mobile} state={{...base,...patch}} act={a=>window.actions.push(a)} onPresentation={mobile?undefined:()=>{}}/></div>)};`;
const vite = await createViteServer({
  configFile: false,
  cacheDir: resolve(output, "vite-cache"),
  plugins: [
    react(),
    {
      name: "mobile-recording60",
      enforce: "pre",
      resolveId: (id) => (id === "/__mobile60.tsx" ? id : undefined),
      load: (id) => (id === "/__mobile60.tsx" ? entry : oldSources.get(id)),
    },
  ],
  server: { middlewareMode: true, host: "127.0.0.1", hmr: false },
  appType: "custom",
});
const server = createServer((req, res) => {
  if (req.url === "/__mobile60") {
    res.setHeader("Content-Type", "text/html");
    vite
      .transformIndexHtml(
        req.url,
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/__mobile60.tsx"></script>',
      )
      .then((s) => res.end(s));
  } else vite.middlewares(req, res);
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
let browser;
const result = {
  boundary:
    "actual shared View, controlled valid state projection and action sink; no media/native/device",
  baseline,
  checks: [],
  layouts: {},
  errors: [],
  external: [],
};
const sha = (b) => createHash("sha256").update(b).digest("hex");
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 392, height: 840 },
    deviceScaleFactor: 2,
    hasTouch: true,
  });
  const page = await context.newPage();
  const origin = `http://127.0.0.1:${server.address().port}`;
  page.on("pageerror", (e) => result.errors.push(String(e)));
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (u.startsWith(origin) || u.startsWith("data:")) return route.continue();
    result.external.push(u);
    return route.abort();
  });
  await page.goto(origin + "/__mobile60");
  await page.waitForFunction(() => !!window.mount);
  const mount = async (mobile, patch = {}, dark = false) => {
    await page.evaluate(
      ({ mobile, patch, dark }) => window.mount(mobile, patch, dark),
      { mobile, patch, dark },
    );
    await page.locator(".recording-time").waitFor();
    await page.evaluate(() => {
      document.activeElement?.blur();
      return new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(r)),
      );
    });
  };
  const snap = async (name) => {
    const layout = await page.evaluate(() => {
      const r = (e) => {
        const b = e.getBoundingClientRect();
        return { x: b.x, y: b.y, width: b.width, height: b.height };
      };
      const sels = [
        ".recording-sheet",
        ".waveform",
        ".wave-samples",
        ".recording-playhead",
        ".wave-axis",
        ".recording-time",
        ".recording-playback",
        ".recording-primary",
        ".recording-done",
        ".recording-notice",
        ".recording-playback-retry",
      ];
      return {
        dom: document.querySelector(".recording-backdrop").outerHTML,
        computed: [
          ...document.querySelectorAll(
            ".recording-backdrop, .recording-backdrop *",
          ),
        ].map((e) => {
          const style = getComputedStyle(e);
          return Object.fromEntries(
            [...style].map((k) => [k, style.getPropertyValue(k)]),
          );
        }),
        timeline: {
          sliderValue: document.querySelector('.waveform').getAttribute('aria-valuenow'),
          labels: [...document.querySelectorAll('.wave-axis span')].map(e => {
            const range=document.createRange();range.selectNodeContents(e);
            const text=range.getBoundingClientRect(), style=getComputedStyle(e), tick=getComputedStyle(e,'::before');
            return {text:e.textContent, box:r(e), textBox:{x:text.x,y:text.y,width:text.width,height:text.height},fontSize:style.fontSize,lineHeight:style.lineHeight,paddingTop:style.paddingTop,tick:{top:tick.top,height:tick.height,width:tick.width}};
          }),
          minorTickCount: document.querySelectorAll('.wave-axis i').length,
          minorTicks: [...document.querySelectorAll('.wave-axis i')].map(r),
          majorTickCount: document.querySelectorAll('.wave-axis span').length,
          sampleBoxes: [...document.querySelectorAll('.wave-samples i')].map(r),
        },
        regions: Object.fromEntries(
          sels.map((s) => {
            const e = document.querySelector(s);
            return [
              s,
              e
                ? {
                    ...r(e),
                    color: getComputedStyle(e).color,
                    weight: getComputedStyle(e).fontWeight,
                  }
                : null,
            ];
          }),
        ),
        buttons: [
          ...document.querySelectorAll(".recording-playback button"),
        ].map((e) => ({
          ...r(e),
          label: e.getAttribute("aria-label"),
          disabled: e.disabled,
          hit: [0.15, 0.5, 0.85].every((v) =>
            e.contains(
              document.elementFromPoint(
                e.getBoundingClientRect().x +
                  e.getBoundingClientRect().width * v,
                e.getBoundingClientRect().y +
                  e.getBoundingClientRect().height / 2,
              ),
            ),
          ),
          svg: r(e.querySelector("svg")),
        })),
      };
    });
    await writeFile(resolve(output, name + ".dom.txt"), layout.dom);
    const bytes = await page.screenshot({
      path: resolve(output, name + ".png"),
    });
    layout.pngSha256 = sha(bytes);
    result.layouts[name] = layout;
    if (compare && name.startsWith("desktop")) {
      layout.pngBytesUnchanged =
        sha(await readFile(resolve(compare, name + ".png"))) ===
        layout.pngSha256;
      assert.equal(
        await readFile(resolve(compare, name + ".dom.txt"), "utf8"),
        layout.dom,
      );
      const previous = JSON.parse(
        await readFile(resolve(compare, "result.json"), "utf8"),
      ).layouts[name];
      assert.deepEqual(layout.computed, previous.computed);
      assert.deepEqual(layout.regions, previous.regions);
      assert.deepEqual(layout.buttons, previous.buttons);
    }
  };

  const actions = () => page.evaluate(() => window.actions);
  const resetActions = () => page.evaluate(() => window.actions=[]);
  const fullAxis = (l) => {
    const a=l.regions['.wave-axis'], top=a.y, bottom=a.y+a.height;
    const contained=(y,h,label)=>assert(y>=top-.02 && y+h<=bottom+.02,label+' vertical clipping');
    for(const label of l.timeline.labels){
      contained(label.box.y,label.box.height,'span with padding '+label.text);
      contained(label.textBox.y,label.textBox.height,'Range '+label.text);
      contained(label.box.y+parseFloat(label.tick.top),parseFloat(label.tick.height),'major pseudo tick '+label.text);
      assert(parseFloat(label.lineHeight)+parseFloat(label.paddingTop)<=a.height+.02,'line box plus padding clipped');
    }
    for(const t of l.timeline.minorTicks)contained(t.y,t.height,'minor tick');
    for(const s of ['.recording-notice','.recording-playback-retry','.recording-time']){
      const r=l.regions[s]; if(r)assert(bottom<=r.y,'axis overlaps '+s);
    }
  };
  const noClipScreenshot = async(name) => {
    // Only remove the axis clip, after the frozen canonical screenshot. No position changes.
    const old=await page.locator('.wave-axis').evaluate(e=>{const old=e.style.overflow;e.style.overflow='visible';return old});
    const bytes=await page.screenshot({path:resolve(output,name+'.axis-unclipped.png')});
    await page.locator('.wave-axis').evaluate((e,old)=>e.style.overflow=old,old);
    result.layouts[name].axisUnclippedSha256=sha(bytes);
    assert.equal(sha(bytes),result.layouts[name].pngSha256,'axis hidden clips visible actual ink');
  };
  // Desktop is captured before any mobile interaction in both runs.
  for(const [w,h,dark,patch] of [[280,467,false,{}],[320,600,true,{playing:true,canToggle:false}]]){
    await page.setViewportSize({width:w,height:h});await mount(false,patch,dark);
    await snap(`desktop-${w}x${h}${dark?'-dark':''}`);
  }
  const long='无法回放这段录音，请重试。录音仍保留，完成后可保存。'.repeat(18);
  for(const [w,h] of [[392,840],[320,568],[280,600]]){
    await page.setViewportSize({width:w,height:h});await mount(true);
    const name=`mobile-paused-${w}x${h}`;await snap(name);
    if(!baseline){fullAxis(result.layouts[name]);await noClipScreenshot(name)}
    const fixtureSamples=[{at:2300,peak:25},{at:2500,peak:80},{at:2700,peak:95}];
    await mount(true,{samples:fixtureSamples});await snap(`samples-${w}x${h}`);
    if(compare){
      const previous=JSON.parse(await readFile(resolve(compare,'result.json'),'utf8'));
      for(const sel of ['.recording-sheet','.waveform','.wave-samples','.recording-time','.recording-playback','.recording-primary','.recording-done']){
        assert.deepEqual(result.layouts[name].regions[sel],previous.layouts[name].regions[sel],sel+' moved');
      }
      assert.deepEqual(result.layouts[`samples-${w}x${h}`].timeline.sampleBoxes,previous.layouts[`samples-${w}x${h}`].timeline.sampleBoxes,'sample geometry changed');
    }
    if(baseline)continue;
    for(const retry of [true,false]){
      await mount(true,{hasError:true,notice:long,canRetryPreview:retry,canPlay:false},w===320);
      const err=`axis-error-${w}x${h}${retry?'-retry':'-no-retry'}`;
      await snap(err);const l=result.layouts[err];fullAxis(l);await noClipScreenshot(err);
      const notice=page.locator('.recording-notice');const n=await notice.boundingBox();
      const before=await notice.evaluate(e=>{e.scrollTop=0;return {clientHeight:e.clientHeight,scrollHeight:e.scrollHeight}});
      assert(before.scrollHeight>before.clientHeight);
      await page.mouse.move(n.x+n.width/2,n.y+n.height/2);await page.mouse.wheel(0,160);
      await page.waitForFunction(()=>document.querySelector('.recording-notice').scrollTop>0);
      assert.deepEqual(await actions(),[],'notice scrolling emitted an action');
      const hits=await page.evaluate(()=>{
        const sels=['.recording-notice','.recording-playback-retry','.waveform'];
        return Object.fromEntries(sels.map(sel=>{const e=document.querySelector(sel);if(!e)return [sel,null];const b=e.getBoundingClientRect();return [sel,[.15,.5,.85].every(x=>[.15,.5,.85].every(y=>e.contains(document.elementFromPoint(b.x+b.width*x,b.y+b.height*y))))]}));
      });
      assert(Object.values(hits).every(v=>v===null||v===true));
      const scrollTop=await notice.evaluate(e=>e.scrollTop);assert(scrollTop>0);
      if(retry){
        const rb=await page.getByRole('button',{name:'重试回放',exact:true}).boundingBox();assert(rb.width>=44&&rb.height>=44);
        await page.getByRole('button',{name:'重试回放',exact:true}).tap();
        assert.deepEqual(await actions(),[{action:'preview-retry'}]);await resetActions();
      }
      const wave=l.regions['.waveform'],axis=l.regions['.wave-axis'],cx=wave.x+wave.width/2,wb=wave.y+wave.height;
      await page.touchscreen.tap(cx,axis.y+axis.height-1);
      assert.deepEqual(await actions(),[],'decorative overflow outside slider sought');
      // Real touch at the original slider lower inside edge remains actionable even under axis decoration.
      await page.touchscreen.tap(cx-20,wb-1);
      const lowActions=await actions();assert(lowActions.length>=2&&lowActions.every(a=>a.action==='seek'&&Math.abs(a.milliseconds-2400)<.01));
      assert.equal(await page.locator('.waveform').getAttribute('aria-valuenow'),'2.6');await resetActions();
      const capture=[];await page.exposeFunction('captureEvent60',e=>capture.push(e));
      await page.locator('.waveform').evaluate(e=>{
        e.addEventListener('gotpointercapture',ev=>window.captureEvent60({type:ev.type,id:ev.pointerId}));
        e.addEventListener('lostpointercapture',ev=>window.captureEvent60({type:ev.type,id:ev.pointerId}));
      });
      const cdp=await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx-20,y:wb-2}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx-70,y:wb+20}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
      const dragActions=await actions();assert(dragActions.some(a=>a.action==='seek'&&Math.abs(a.milliseconds-1900)<.01));assert(dragActions.every(a=>a.action==='seek'));
      assert(capture.some(e=>e.type==='gotpointercapture')&&capture.some(e=>e.type==='lostpointercapture'),'pointer capture not observed');
      assert.equal(await page.locator('.waveform').getAttribute('aria-valuenow'),'2.6');
      await page.removeExposedFunction('captureEvent60');await resetActions();
      l.interactions={noticeBefore:before,noticeScrollTop:scrollTop,hits,lowActions,dragActions,capture,confirmedPosition:'2.6'};
    }
  }
  if(!baseline){
    await page.setViewportSize({width:392,height:840});
    for(const [name,patch] of [['initial',{phase:'idle',elapsed:0,position:0,duration:0,canPlay:false,canSeek:false}],['recording',{phase:'recording',elapsed:1070,position:1070,duration:1070,canPlay:false,canSeek:false}],['playing',{playing:true,canToggle:false}],['saving',{phase:'saving',canToggle:false,canPlay:false,canSeek:false}]]){
      await mount(true,patch);await snap('mobile-'+name);fullAxis(result.layouts['mobile-'+name]);
      if(patch.canSeek===false){const w=await page.locator('.waveform').boundingBox();await page.touchscreen.tap(w.x+w.width/2-20,w.y+w.height-1);for(const b of await page.locator('.recording-playback button').all()){const r=await b.boundingBox();await page.touchscreen.tap(r.x+r.width/2,r.y+r.height/2)}assert.deepEqual(await actions(),[],'disabled input emitted actions')}
    }
  }
  assert.deepEqual(result.errors,[]);assert.deepEqual(result.external,[]);
  result.checks.push('Finite task60 review: three viewport full vertical span padding / Range / major pseudo / minor ticks inside axis; exact unclipped raster equality; real notice scroll, retry >=44px, lower-edge seek and pointer capture outside slider; disabled actions inert.');
  result.status=Object.values(result.layouts).some(l=>l.pngBytesUnchanged===false)?'VIEW_PASS_DESKTOP_RASTER_OPEN':'PASS';
} catch(e){result.status='FAIL';result.failure=String(e);throw e}
finally {await writeFile(resolve(output,'result.json'),JSON.stringify(result,null,2)+'\n');await browser?.close();await new Promise(r=>server.close(r));await vite.close()}
