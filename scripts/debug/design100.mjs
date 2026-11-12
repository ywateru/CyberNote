// Actual App/Preferences/MenuSurface in Chrome. Optional real production Rust
// Store transport verifies SQLite rejection and reload, with isolated data only.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { openRuntime, api, state, idle } from "./runtime.mjs";
const out=resolve(process.argv[2]||"artifacts/design100");await mkdir(out,{recursive:true});
const buildDir=process.argv[3];let transport;
if(buildDir){
  const build=JSON.parse(await readFile(resolve(buildDir,"build.json"),"utf8"));
  const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
  for(const [file,digest]of Object.entries(build.sources))assert.equal(hash(await readFile(file)),digest,"Backend source "+file);
  assert.equal(hash(await readFile(build.binary.path)),build.binary.sha256);
  transport=resolve(out,"owned-transport");await copyFile(build.binary.path,transport);
}
const checks=[];const pass=name=>{checks.push(name);console.log("PASS "+name);};
const normal={version:1,iconScale:100,desktopHitScale:100,mobileHitScale:100,menuSpacing:"standard",radiusScale:100};
const max={...normal,iconScale:120,desktopHitScale:130,mobileHitScale:120,menuSpacing:"comfortable",radiusScale:150};
const min={...normal,iconScale:80,menuSpacing:"compact",radiusScale:0};
for(const mobile of [false,true]){
 const r=await openRuntime({root:process.cwd(),mobile,transport});const {page,backend}=r;
 try{
  if(transport)await api(page,"note.create");
  if(mobile){await api(page,"note.select",{id:(await state(page)).workspace.notes[0].id});await api(page,"app.back");}
  await api(page,"settings.update",{settings:{interfaceDetails:normal,interfaceFontSize:"medium",editorFontSize:"medium"}});
  const original=await page.locator(mobile?".mobile-home-settings":".desktop-settings").evaluate(e=>({icon:e.querySelector("svg").getBoundingClientRect().width,hit:e.getBoundingClientRect().height}));
  await api(page,"settings.update",{settings:{interfaceDetails:max}});
  const enlarged=await page.locator(mobile?".mobile-home-settings":".desktop-settings").evaluate(e=>({icon:e.querySelector("svg").getBoundingClientRect().width,hit:e.getBoundingClientRect().height}));
  assert.ok(enlarged.icon>original.icon*1.19);assert.ok(enlarged.hit>=original.hit);pass(`${mobile?"mobile":"desktop"} actual main controls consume independent glyph/hit settings`);
  const sizes=mobile?[[320,640],[390,844]]:[[1280,800],[760,500]];
  for(const [width,height]of sizes){
   await page.setViewportSize({width,height});
   for(const font of ["tiny","small","medium","large","huge"]){
    for(const [theme,details]of [["light",min],["dark",max]]){
     if(await page.locator(".preferences").count())await page.getByRole("button",{name:"关闭设置",exact:true}).click();
     await api(page,"settings.update",{settings:{theme,interfaceFontSize:font,interfaceDetails:details}});
     await api(page,"settings.open");if(mobile)await api(page,"settings.tab",{tab:"settings"});
     await idle(page);
     const geometry=await page.evaluate(()=>{
      const app=document.querySelector(".app"),panel=document.querySelector(".preferences"),scroll=document.querySelector(".preferences-settings");
      const buttons=[...panel.querySelectorAll("button")].filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().height);
      const hit=parseFloat(getComputedStyle(app).getPropertyValue("--interface-hit-min"));
      return {hit,small:buttons.filter(e=>{const b=e.getBoundingClientRect();return b.width+.1<hit||b.height+.1<hit;}).map(e=>({label:e.getAttribute("aria-label")||e.textContent.trim(),width:e.offsetWidth,height:e.offsetHeight})),overflow:scroll.scrollWidth-scroll.clientWidth,panel:panel.getBoundingClientRect().toJSON()};
     });
     assert.deepEqual(geometry.small,[],JSON.stringify({width,font,theme,geometry}));assert.ok(geometry.overflow<=1,JSON.stringify({width,font,theme,geometry}));
     assert.ok(geometry.panel.x>=0&&geometry.panel.right<=width+1&&geometry.panel.bottom<=height+1);
    }
   }
   await page.screenshot({path:resolve(out,`${mobile?"mobile":"desktop"}-${width}-max-dark.png`)});
   pass(`${width}x${height} real settings: five font sizes, light/min + dark/max, hit bounds and no horizontal clipping`);
   await page.getByRole("button",{name:"关闭设置",exact:true}).click();
  }
  await page.setViewportSize(mobile?{width:390,height:844}:{width:1280,height:800});
  await api(page,"settings.open");if(mobile)await api(page,"settings.tab",{tab:"settings"});
  await page.getByRole("button",{name:"界面细节",exact:true}).click();
  const previous=await page.getByRole("slider",{name:"图标大小",exact:true}).inputValue();
  if(transport)execFileSync("sqlite3",[resolve(r.directory,"notes.sqlite3"),"CREATE TRIGGER design100_failure BEFORE UPDATE ON settings BEGIN SELECT RAISE(ABORT,'design100 actual write failure'); END;"]);
  else backend.configure({fail:{settings:1}});
  await page.getByRole("slider",{name:"图标大小",exact:true}).focus();await page.keyboard.press("ArrowLeft");
  await page.getByText(/界面细节未保存/).waitFor();
  assert.equal(await page.getByRole("slider",{name:"图标大小",exact:true}).inputValue(),previous);
  assert.equal(await page.locator(".app").evaluate(e=>getComputedStyle(e).getPropertyValue("--interface-icon-scale")),"1.2");
  pass(`${mobile?"mobile":"desktop"} ${transport?"real SQLite":"controlled transport"} rejected setting stays absent from actual global tokens and acknowledged control`);
  if(transport)execFileSync("sqlite3",[resolve(r.directory,"notes.sqlite3"),"DROP TRIGGER design100_failure;"]);
  await api(page,"app.dismissError");
  // A real external Store/backend write, then the actual App refresh path.
  const w=transport?(await backend.call("load_workspace")).value:backend.state();
  const changed={...normal,iconScale:87,desktopHitScale:115,mobileHitScale:110};
  const response=await backend.call("workspace_action",{action:{type:"settings",settings:{interfaceDetails:changed}},expected:{sessionId:w.access.sessionId,epoch:w.access.epoch}});assert.equal(response.ok,true);
  await api(page,"app.refresh");
  assert.equal(await page.locator(".app").evaluate(e=>getComputedStyle(e).getPropertyValue("--interface-icon-scale")),"0.87");
  await page.reload();await page.waitForFunction(()=>window.__NOTES_DEBUG__?.version===1);await idle(page);
  assert.equal(await page.locator(".app").evaluate(e=>getComputedStyle(e).getPropertyValue("--interface-icon-scale")),"0.87");
  pass(`${mobile?"mobile":"desktop"} external confirmed settings and durable reload reach real controls`);
  // Two actual App writes: a rejected older write must not roll back the next
  // successful write, and rejected details must never reach global CSS tokens.
  if(transport)execFileSync("sqlite3",[resolve(r.directory,"notes.sqlite3"),"CREATE TRIGGER design100_order BEFORE UPDATE ON settings WHEN json_extract(NEW.body,'$.interfaceDetails.iconScale')=115 BEGIN SELECT RAISE(ABORT,'design100 rejected older write'); END;"]);
  else backend.configure({fail:{settings:1}});
  await page.evaluate(()=>{window.designTokenHistory=[];window.designTokenObserver=new MutationObserver(records=>{for(const record of records)window.designTokenHistory.push(record.oldValue||"");window.designTokenHistory.push(document.querySelector(".app").getAttribute("style"));});window.designTokenObserver.observe(document.querySelector(".app"),{attributes:true,attributeFilter:["style"],attributeOldValue:true});});
  await page.evaluate(async({normal})=>{await Promise.allSettled([window.__NOTES_DEBUG__.execute("settings.update",{settings:{interfaceDetails:{...normal,iconScale:115}}}),window.__NOTES_DEBUG__.execute("settings.update",{settings:{interfaceDetails:{...normal,iconScale:89}}})]);},{normal});
  await api(page,"app.dismissError");await idle(page);
  assert.equal(await page.locator(".app").evaluate(e=>getComputedStyle(e).getPropertyValue("--interface-icon-scale")),"0.89");
  assert.equal(await page.evaluate(()=>{window.designTokenObserver.disconnect();return window.designTokenHistory.some(style=>/--interface-icon-scale:\s*1\.15(?:;|$)/.test(style));}),false);
  if(transport)execFileSync("sqlite3",[resolve(r.directory,"notes.sqlite3"),"DROP TRIGGER design100_order;"]);
  await api(page,"app.dismissError");
  pass(`${mobile?"mobile":"desktop"} older rejected actual App write cannot publish or overwrite a newer successful write`);
  await page.evaluate(async()=>{window.designProbe=(await import("/scripts/debug/design100-menu-probe.tsx")).mount();});
  const ordinary=page.getByRole("menu",{name:"design ordinary menu",exact:true}), modalMenu=page.getByRole("menu",{name:"design modal menu",exact:true});
  await ordinary.waitFor();
  const layers=await page.evaluate(()=>{
    const css=q=>getComputedStyle(document.querySelector(q));return {menu:+css('[aria-label="design ordinary menu"]').zIndex,modalMenu:+css('[aria-label="design modal menu"]').zIndex,modal:+css('.modal-backdrop').zIndex,preview:+css('.image-preview').zIndex,access:+css('.access-cover').zIndex,scale:css('[aria-label="design modal menu"]').getPropertyValue('--interface-icon-scale')};
  });
  assert.ok(layers.preview<layers.menu&&layers.menu<layers.modal&&layers.modal<layers.modalMenu&&layers.modalMenu<layers.access);assert.equal(layers.scale,"0.89");
  // Remove the independent modal test overlay before interacting with the real
  // nested MenuSurface; both are actual production components and portals.
  await page.locator(".modal-backdrop").evaluate(e=>e.style.display="none");await modalMenu.evaluate(e=>e.style.display="none");
  await page.getByRole("menuitem",{name:"Design move",exact:true}).click();
  const last=page.getByRole("menuitem",{name:"Destination 17",exact:true});await last.scrollIntoViewIfNeeded();
  const bounds=await page.getByRole("menu",{name:"Design move",exact:true}).boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=page.viewportSize().width+1&&bounds.y+bounds.height<=page.viewportSize().height+1);
  await last.click();assert.equal(await page.evaluate(()=>window.designProbe.clicked()),true);
  await page.evaluate(()=>window.designProbe.cleanup());
  await page.evaluate(async()=>{window.designProbe=(await import("/scripts/debug/design100-menu-probe.tsx")).mount();});await ordinary.waitFor();
  await page.evaluate(()=>document.querySelector(".app").classList.add("access-sync"));
  assert.equal(await page.evaluate(()=>{const menu=document.querySelector('[aria-label="design ordinary menu"]');return !menu||getComputedStyle(menu).visibility==="hidden";}),true);
  await page.evaluate(()=>window.designProbe.cleanup());
  pass(`${mobile?"mobile":"desktop"} actual portalled menus inherit tokens, nested long menu scrolls/clicks, modal and access layers hold`);
  assert.deepEqual(r.errors,[]);
 }finally{await r.cleanup();}
}
await writeFile(resolve(out,"result.json"),JSON.stringify({checks,backend:transport?"actual Rust Store + SQLite":"controlled protocol fixture",nativeBundles:false,adb:false},null,2));
