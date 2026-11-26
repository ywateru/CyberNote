import { resolve } from "node:path";
import { api, idle, state, saveJSON, openRuntime } from "./runtime.mjs";

export async function runPreferences(runtime, { command, check, output }) {
  const { page, backend } = runtime;
  const mobile = runtime.mobile;
  const accountUI = runtime.accountUI;
  const categoryCount = accountUI ? 8 : 7;
  const labels = {system:"跟随系统",light:"浅色",dark:"深色",tiny:"极小",small:"小",medium:"中",large:"大",huge:"极大",updated:"编辑日期",created:"创建日期",title:"标题",gallery:"画廊",list:"列表",compact:"紧凑",standard:"标准",comfortable:"舒适",on:"开启",off:"关闭"};
  const choose = async (name,value) => {
    if (mobile && await page.getByRole("combobox",{name,exact:true}).count()) {
      await page.getByRole("combobox",{name,exact:true}).selectOption(value);
    } else {
      await page.getByRole("radiogroup",{name,exact:true}).getByRole("radio",{name:labels[value],exact:true}).click();
    }
  };
  const choice = async name => {
    if (mobile && await page.getByRole("combobox",{name,exact:true}).count()) return page.getByRole("combobox",{name,exact:true}).inputValue();
    const label = await page.getByRole("radiogroup",{name,exact:true}).getByRole("radio",{checked:true}).innerText();
    return Object.keys(labels).find(value=>labels[value]===label);
  };

  const close = () => page.getByRole("button", {name:"关闭设置", exact:true}).click();
  const select = async id => { await command("settings.tab", {tab:id}); };
  const selected = async id => (await state(page)).preferences?.tab === id;
  const inventories = () => backend.calls.filter(row => row.command === "get_data_management").length;
  const notesBefore = JSON.stringify(backend.workspace.notes.map(note => note.document));
  if (mobile) {
    await page.evaluate(() => {
      window.__systemBarCalls = [];
      window.NotesSystemBars = {
        apply(...args) {
          window.__systemBarCalls.push(args);
        },
      };
    });
    await command("note.select", {id:"note-a"});
    await command("app.back");
    await page.locator(".mobile-folder-navigation").click();
    await page.locator(".mobile-home-settings").click();
  } else await page.locator('.desktop-settings').click();
  await idle(page);
  check("Actual settings entry opens the platform-specific initial page", await selected(mobile ? "home" : "settings"));
  if (mobile) {
    await page.waitForFunction(() => window.__systemBarCalls?.length > 0);
    const projected = await page.evaluate(() => {
      const hex = (value) => {
        const match = value.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
        return match
          ? "#" + match.slice(1, 4).map((part) => Number(part).toString(16).padStart(2, "0")).join("")
          : null;
      };
      const last = window.__systemBarCalls.at(-1);
      return {
        last,
        header: hex(getComputedStyle(document.querySelector(".preferences")).backgroundColor),
        body: hex(getComputedStyle(document.querySelector(".preferences-body")).backgroundColor),
      };
    });
    check(
      "Android settings projects the header and grouped content as separate surfaces",
      projected.last?.[0] === projected.header &&
        projected.last?.[1] === projected.body &&
        projected.header !== projected.body,
    );
  }
  check("Appearance-only visits do not mount data or synchronization", inventories() === 0 && await page.locator(".data-management,.sync-settings").count() === 0);
  check("Default backend has no account UI or account IPC", accountUI || (await page.locator("[data-preferences-page=account]").count() === 0 && !backend.calls.some(row => row.command === "account_command")));
  await select("plugins");
  await page.waitForSelector(".plugin-center");
  check("Plugin center lists the built-in attachment inspector", await page.getByRole("button", {name:"附件详情详情", exact:true}).count() === 1);
  if (mobile) await page.getByRole("button", {name:"附件详情详情", exact:true}).click();
  check("Plugin detail exposes reserved smart-pen and recording-device capabilities", await page.getByText("智能笔点读与手写", {exact:true}).count() === 1 && await page.getByText("未启用", {exact:true}).count() >= 3);
  await page.locator(".plugin-detail-pane .plugin-switch").click();
  await idle(page);
  check("Disabling a plugin persists through the native plugin update contract", backend.pluginState.plugins["cybernote.attachments.inspector"]?.enabled === false && await page.locator(".plugin-detail-pane .plugin-switch").getAttribute("aria-checked") === "false");
  await page.locator(".plugin-detail-pane .plugin-switch").click();
  await idle(page);
  check("Re-enabling a plugin restores its enabled state", backend.pluginState.plugins["cybernote.attachments.inspector"]?.enabled === true && await page.locator(".plugin-detail-pane .plugin-switch").getAttribute("aria-checked") === "true");
  await page.getByRole("radiogroup",{name:"显示精确字节数",exact:true}).getByRole("radio",{name:"关闭",exact:true}).click();
  await idle(page);
  check("Generated plugin settings use the existing confirmed settings controls", backend.pluginState.plugins["cybernote.attachments.inspector"]?.config?.showByteCount === false);
  await page.getByRole("radiogroup",{name:"显示精确字节数",exact:true}).getByRole("radio",{name:"开启",exact:true}).click();
  await idle(page);
  if (mobile) await page.getByRole("button",{name:"插件列表",exact:true}).click();
  await page.getByRole("button",{name:/从 GitHub 安装/}).click();
  const installDialog = page.getByRole("dialog", {name:"安装插件"});
  await installDialog.getByRole("textbox").fill("https://github.com/ywateru/CyberNote/tree/main/examples/plugins/cybernote.sample");
  await installDialog.getByRole("button",{name:"检查仓库"}).click();
  await page.waitForSelector(".plugin-install-preview");
  check("GitHub install preview shows the declarative sample before commit", await installDialog.getByText("示例插件",{exact:true}).count() >= 1 && await installDialog.getByText("1 个宿主渲染区块",{exact:true}).count() === 1);
  await installDialog.getByRole("button",{name:"安装并保持关闭"}).click();
  await page.waitForSelector(".plugin-install-dialog", {state:"detached"});
  await idle(page);
  check("Installing a declarative plugin adds it disabled and opens its detail", !!backend.pluginState.external["cybernote.sample"] && (mobile || await page.getByRole("button",{name:"示例插件详情",exact:true}).count() === 1) && await page.locator(".plugin-detail-pane").getAttribute("aria-label") === "示例插件详情" && await page.locator(".plugin-detail-pane .plugin-switch").getAttribute("aria-checked") === "false");
  await page.locator(".plugin-detail-pane .plugin-switch").click();
  await page.waitForSelector(".plugin-ui-sections");
  check("Enabling the sample renders only the host-owned declarative section", await page.getByText("示例插件已加载",{exact:true}).count() === 1 && await page.getByText("Synthetic host-rendered text.",{exact:true}).count() === 1);
  await page.getByRole("radiogroup",{name:"显示示例面板",exact:true}).getByRole("radio",{name:"关闭",exact:true}).click();
  await idle(page);
  check("Sample visibility setting hides the host-rendered section without disabling the plugin", await page.getByText("Synthetic host-rendered text.",{exact:true}).count() === 0 && await page.getByText("插件界面已被关联的设置隐藏。",{exact:true}).count() === 1);
  await page.getByRole("radiogroup",{name:"显示示例面板",exact:true}).getByRole("radio",{name:"开启",exact:true}).click();
  await idle(page);
  await page.getByRole("button",{name:"卸载插件",exact:true}).click();
  await idle(page);
  check("Uninstalling removes the external plugin and its settings", !backend.pluginState.external["cybernote.sample"] && await page.getByRole("button",{name:"示例插件详情",exact:true}).count() === 0);
  await select("settings");
  await page.getByRole("searchbox",{name:"查找设置",exact:true}).fill("智能笔");
  await page.waitForSelector(".preferences-search-results");
  await page.locator(".preferences-search-results button").filter({hasText:"插件"}).click();
  await page.waitForSelector(".plugin-center");
  await idle(page);
  check("Settings search locates the plugin center through the real navigation path", await selected("plugins") && await page.locator(".plugin-center").isVisible());
  if (mobile) await select("home");
  else await select("settings");
  const names = ["外观与字号", "备忘录", "设备同步", "存储空间", "导入与备份"];
  if (mobile) {
    check("Mobile uses expected category rows instead of desktop tabs", await page.locator(".preferences-navigation > button").count() === categoryCount && await page.getByRole("tablist").count() === 0);
    await page.getByRole("button", {name:/外观与字号/}).click();
  } else {
    check("Desktop exposes expected labelled category tabs", await page.getByRole("tablist",{name:"设置分类"}).count() === 1 && await page.getByRole("tab").count() === categoryCount);
    await page.getByRole("tab", {name:names[0]}).focus();
    await page.keyboard.press("ArrowDown");
    check("Desktop arrow keys switch and focus the next category", await selected("notes") && await page.getByRole("tab",{name:"备忘录",exact:true}).evaluate(n=>n===document.activeElement));
    await page.keyboard.press("End");
    check("Desktop End selects the final available category", await selected("about"));
    await page.keyboard.press("Home");
    check("Desktop Home returns to first available category", await selected(accountUI ? "account" : "settings"));
    await select("settings");
  }
  await choose("外观","dark"); await idle(page);
  const editorBefore = backend.workspace.settings.editorFontSize;
  for (const value of ["tiny","small","medium","large","huge"]) {
    await choose("界面字体大小",value); await idle(page);
    check(`Interface ${value} persists independently`, backend.workspace.settings.interfaceFontSize===value && backend.workspace.settings.editorFontSize===editorBefore);
  }
  await choose("编辑器字体大小","small"); await idle(page);
  check("Both font previews and separate five-step controls are available", await page.locator('.preferences-interface-preview,.preferences-editor-preview').count()===2 && await page.getByRole('radiogroup',{name:'编辑器字体大小',exact:true}).getByRole('radio').count()===5);
  await select("notes");
  if (mobile) await page.locator(".preferences-device-disclosure > summary").click();
  for (const [label,value] of [["排序方式","created"],["桌面显示方式","gallery"]]) {
    await choose(label,value); await idle(page);
  }
  // Controlled settings persist asynchronously; assert after the real save settles.
  await choose("按日期分组","off"); await idle(page);
  check("Date grouping control reflects persisted unchecked state", await page.getByRole("radio",{name:"关闭",exact:true}).isChecked());
  await page.getByRole("button",{name:"全部关闭",exact:true}).click(); await idle(page);
  check("Existing appearance, note ordering, list and lock actions remain connected", backend.workspace.settings.theme==="dark" && backend.workspace.settings.sort==="created" && backend.workspace.settings.view==="gallery" && backend.workspace.settings.groupDates===false && backend.calls.some(row=>row.command==="workspace_action"&&row.type==="closeLocks"));
  await select("settings");
  backend.configure({fail:{settings:1}});
  await choose("外观","light");await idle(page).catch(()=>{});
  check("Settings save failures are reported inside the settings panel",(await page.locator('.preferences-error').innerText()).includes("Controlled settings"));
  await command("app.dismissError");
  await choose("外观","dark");await idle(page);
  await close(); await page.reload(); await page.waitForFunction(()=>window.__NOTES_DEBUG__?.version===1); await idle(page);
  await command("settings.open"); await select("settings");
  check("Appearance and font choices survive renderer reload", await choice("外观")==="dark" && await choice("界面字体大小")==="huge" && await choice("编辑器字体大小")==="small");
  backend.dataExtras=Array.from({length:48},(_,i)=>({relativePath:`other/entry-${i}-`+"很长的本地文件名".repeat(10),category:"other",size:i,modifiedAt:1760000000000,exists:true,status:"file"}));
  await select("data"); await page.waitForSelector(".storage-summary");
  check("Storage and backup have distinct surfaces", await page.locator(".storage-summary").isVisible() && !await page.getByRole("button",{name:"导入…",exact:true}).isVisible());
  await page.evaluate(()=>{window.__preferencesData=document.querySelector('.data-management');window.__preferencesShell=document.querySelector('.preferences');});
  await command("data.navigate",{view:"all"}); await command("data.filter",{query:"entry",page:1});
  await page.locator('.data-management-scroll:not([hidden])').evaluate(n=>{n.scrollTop=90;window.__preferencesScroll=n.scrollTop;});
  const count=inventories();
  await select("backup");
  check("Backup uses the retained module and no new inventory request", await page.getByRole("button",{name:"导出…",exact:true}).isVisible() && inventories()===count && await page.evaluate(()=>window.__preferencesData===document.querySelector('.data-management')));
  await select("settings");
  for(const id of ["data.refresh","data.navigate","data.filter"]) {
    let code;try{await api(page,id,id==="data.navigate"?{view:"all"}:id==="data.filter"?{query:"wrong"}:{});}catch(e){code=e.code;}
    check(`Hidden ${id} cannot start operations`,code==="APP_ERROR");
  }
  await select("data");
  check("Storage query, pagination and scroll survive category changes", inventories()===count && await page.getByRole("textbox",{name:"搜索本地文件"}).inputValue()==="entry" && (await page.locator('.data-pagination').innerText()).includes("第 2 / 3 页") && await page.locator('.data-management-scroll:not([hidden])').evaluate(n=>n.scrollTop===window.__preferencesScroll));
  await command("app.back");
  check("Back from storage details returns to overview first", await selected("data") && await page.locator('.storage-summary').isVisible());
  await select("backup");
  await page.evaluate(()=>window.__DEBUG_PLATFORM__.configure({dialog:{save:[null]}}));
  await page.getByRole("button",{name:"导出…",exact:true}).click();await idle(page);
  check("Cancelled backup stays in settings without success notice", await selected("backup") && !(await page.locator('.local-backup-settings').innerText()).includes("本地备份已导出"));
  backend.configure({fail:{archive:1}});
  await page.getByRole("button",{name:"导出…",exact:true}).click();await idle(page).catch(()=>{});
  check("Backup errors remain visible on the backup page", (await page.locator('.local-backup-settings .local-backup-error').innerText()).includes("Controlled archive"));
  await command("app.dismissError");
  const original=backend.call.bind(backend);let release,started;
  const began=new Promise(r=>started=r);
  backend.call=async(id,args)=>{if(id==="settings_archive"&&args.request?.operation==="export"){started();await new Promise(r=>release=r);}return original(id,args);};
  try {
    await page.getByRole("button",{name:"导出…",exact:true}).click();await began;
    await api(page,"settings.tab",{tab:"settings"});await page.waitForSelector('.preferences[data-preferences-tab="settings"]');release();await idle(page);
    check("In-flight backup completes without replacing the settings shell", await selected("settings") && await page.evaluate(()=>window.__preferencesShell===document.querySelector('.preferences')));
  } finally {release?.();backend.call=original;}
  await select("backup");
  check("Completed backup feedback survives navigation", (await page.locator('.toast').innerText()).includes("本地备份已导出"));
  await page.getByRole("button",{name:"导入…",exact:true}).click();await idle(page);
  check("Backup import retains the selected page", await selected("backup") && (await page.locator('.toast').innerText()).includes("本地备份已导入"));
  await select("sync");await page.waitForSelector('.sync-settings');
  check("Synchronization is an independent category", await page.locator('.sync-settings').isVisible() && !await page.locator('.data-management').isVisible());
  await select("settings");let syncCode;try{await api(page,"sync.status");}catch(e){syncCode=e.code;}
  check("Hidden synchronization cannot start operations",syncCode==="APP_ERROR");
  await select("data");
  const inventoryCall=backend.call.bind(backend);let releaseInventory,inventoryStarted;
  const inventoryBegan=new Promise(resolve=>inventoryStarted=resolve);
  backend.call=async(id,args)=>{const result=await inventoryCall(id,args);if(id==="get_data_management"){result.value.rootPath="/synthetic/stale-hidden-settings";inventoryStarted();await new Promise(resolve=>releaseInventory=resolve);}return result;};
  const pendingInventory=api(page,"data.refresh").catch(error=>({code:error.code}));
  try {
    await inventoryBegan;await api(page,"settings.tab",{tab:"settings"});
    backend.suspended=["note-a"];backend.operationId="settings-redesign-prepare";
    await page.evaluate(value=>window.__DEBUG_PLATFORM__.emit("notes-access",value),{phase:"prepare",operationId:backend.operationId,noteIds:["note-a"],access:backend.state().access});
    await page.waitForFunction(()=>document.querySelectorAll('.storage-summary').length===0);
    releaseInventory();await pendingInventory;
    check("Hidden authority changes clear storage and block late inventory publication",await selected("settings")&&await page.locator('.storage-summary').count()===0&&!(await page.locator('.preferences').innerText()).includes("stale-hidden-settings"));
    backend.call=inventoryCall;backend.suspended=[];backend.operationId=null;backend.accessEpoch++;backend.noteEpochs["note-a"]=(backend.noteEpochs["note-a"]||0)+1;
    await page.evaluate(value=>window.__DEBUG_PLATFORM__.emit("notes-access",value),{phase:"commit",operationId:"settings-redesign-prepare",noteIds:["note-a"],access:backend.state().access});
    await idle(page);await select("data");await page.waitForSelector('.storage-summary');
    check("Authorized recovery refreshes the retained storage module",await page.evaluate(()=>window.__preferencesData===document.querySelector('.data-management'))&&!(await page.locator('.data-management').innerText()).includes("stale-hidden-settings"));
  }finally{releaseInventory?.();backend.call=inventoryCall;}
  await close();await command("settings.open");await select("settings");
  await page.evaluate(()=>document.activeElement?.blur());await page.keyboard.press("Tab");
  check("Body Tab enters only visible settings controls",await page.locator(mobile?'.preferences-back':'.preferences-close').evaluate(n=>n===document.activeElement));
  await page.keyboard.press("Shift+Tab");
  check("Shift Tab wraps to the final visible interface-details control",await page.getByRole("button",{name:"界面细节",exact:true}).evaluate(n=>n===document.activeElement));
  await page.evaluate(()=>document.activeElement?.blur());await page.keyboard.press("Escape");await idle(page);
  if(mobile){check("Mobile Escape returns to category index",await selected("home"));await page.keyboard.press("Escape");await idle(page);}
  check("Escape closes settings and restores an entry control",await page.locator('.preferences').count()===0 && await page.evaluate(()=>document.activeElement!==document.body&&!!document.activeElement?.getClientRects().length));
  check("Settings never rewrite note documents",notesBefore===JSON.stringify(backend.workspace.notes.map(n=>n.document)));
  await runtime.reset();backend.configure({fail:{inventory:100}});await command('data.open');
  check("Failed inventory has a retry action",await page.getByRole('button',{name:'重试读取',exact:true}).count()===1);
  await select('backup');
  check("Backup recovery remains available when storage sampling fails",await page.getByRole('button',{name:'导入…',exact:true}).isEnabled() && await page.getByRole('button',{name:'导出…',exact:true}).isEnabled());
  backend.configure({fail:{inventory:0}});await close();
  const metrics=[];
  for(const width of mobile?[320,390]:[800,1280]) for(const theme of ['light','dark']) for(const font of ['tiny','small','medium','large','huge']) {
    await page.setViewportSize({width,height:mobile?844:800});await command('settings.update',{settings:{theme,interfaceFontSize:font,editorFontSize:font}});await command('settings.open');
    for(const tab of mobile?['home','settings','notes','sync','plugins','data','backup']:['settings','notes','sync','plugins','data','backup']) {
      await select(tab);
      const geometry=await page.locator('.preferences').evaluate(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,overflow:[...n.querySelectorAll('*')].filter(x=>!x.closest('[hidden]')&&x.getClientRects().length&&getComputedStyle(x).visibility!=='hidden'&&(x.getBoundingClientRect().right>innerWidth+1||x.getBoundingClientRect().left< -1)).map(x=>String(x.className))};});
      metrics.push({width,theme,font,tab,geometry});
      check(`${width}px ${theme} ${font} ${tab} stays within viewport`,geometry.left>=0&&geometry.right<=width&&geometry.top>=0&&geometry.bottom<=(mobile?844:800)&&!geometry.overflow.length);
      if(font==='small'&&((width===1280&&theme==='light')||(width===390&&theme==='light')||(width===320&&theme==='dark'&&tab==='settings')))await page.screenshot({path:resolve(output,`settings-${width}-${theme}-${tab}.png`)});
    }
    await close();
  }
  await page.setViewportSize({width:mobile?320:800,height:360});await command('settings.open');await select('settings');
  check("Short screens retain close control and scrollable content",await page.locator('.preferences-close').evaluate(n=>n.getBoundingClientRect().bottom<=innerHeight)&&await page.locator('.preferences-settings:not([hidden])').evaluate(n=>n.scrollHeight>n.clientHeight&&getComputedStyle(n).overflowY==='auto'));
  if (!mobile) {
    await close(); await page.setViewportSize({width:1440,height:1000});
    await command('settings.update',{settings:{theme:'system',interfaceFontSize:'small',editorFontSize:'medium'}});
    await page.locator('.desktop-settings').click();await idle(page);
    check('Desktop reference uses three theme cards and two five-step segmented controls',await page.getByRole('radiogroup').count()===3&&await page.getByRole('radio').count()===13);
    const geometry=await page.locator('.preferences').boundingBox();
    check('Desktop reference panel uses the target 920 by 660 geometry',Math.abs(geometry.width-920)<1&&Math.abs(geometry.height-660)<1&&Math.abs(geometry.x-260)<1&&Math.abs(geometry.y-170)<1);
    await page.evaluate(() => document.activeElement?.blur());
    await page.waitForFunction(()=>!document.querySelector('[data-button-activated]'));
    await page.screenshot({path:resolve(output,'settings-reference-1440.png')});
    await page.getByRole('radiogroup',{name:'界面字体大小',exact:true}).getByRole('radio',{checked:true}).focus();
    await page.keyboard.press('ArrowRight');await idle(page);
    check('Segmented font choices support arrows and retain focus',await choice('界面字体大小')==='medium'&&await page.getByRole('radiogroup',{name:'界面字体大小',exact:true}).getByRole('radio',{checked:true}).evaluate(n=>n===document.activeElement));
  }
  await saveJSON(resolve(output,'settings-layout.json'),{metrics,scope:runtime.metadata});await close();await page.setViewportSize(runtime.viewport);
  if(!mobile){const mac=await openRuntime({nativeToolbar:true,bundleDebug:true});try{
    await api(mac.page,'settings.open');await idle(mac.page);await mac.page.waitForFunction(()=>window.__DEBUG_PLATFORM__.toolbarStates.at(-1)?.contentOverlay===true);
    const overlay=await mac.page.evaluate(()=>window.__DEBUG_PLATFORM__.toolbarStates.at(-1));
    check('Native settings retains protective overlay and stable action inventory',overlay.contentOverlay===true&&overlay.actions.length>0&&overlay.actions.every(a=>!a.enabled));
    await api(mac.page,'modal.cancel');await idle(mac.page);await mac.page.waitForFunction(()=>window.__DEBUG_PLATFORM__.toolbarStates.at(-1)?.contentOverlay===false);
    check('Closing settings restores native toolbar actions',await mac.page.evaluate(()=>window.__DEBUG_PLATFORM__.toolbarStates.at(-1).actions.some(a=>a.enabled)));
    await saveJSON(resolve(output,'settings-native-projection.json'),{scope:'Synthetic native IPC projection; AppKit geometry tested separately',states:await mac.page.evaluate(()=>window.__DEBUG_PLATFORM__.toolbarStates),pageErrors:mac.errors});
  }finally{await mac.cleanup();}}
}
