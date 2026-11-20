// Real production React surfaces; all native/data ports below are local fixtures.
// No native runtime, account store, network service or user note library is read.
// Integration: PreferencesProps owns cloudSync/automaticBackup/softwareUpdate,
// softwareUpdateBadge and syncConflicts. Bind conflictsOpen/onConflictsOpenChange
// in App; AccountSettings.onConflicts opens that disclosure on account. Supply
// SyncSettings conflictsOnly with active={accountActive && conflictsOpen}; route
// Back through its dismiss before closing the disclosure. The compatibility
// synchronization prop is intentionally ignored; legacy sync redirects account.
// Each module owns commands/confirmations and must clean up when unmounted.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

if (process.argv.includes('--typecheck')) {
 const ts = (await import('typescript')).default;
 const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
 if (config.error) throw Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
 const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
 const roots = ['src/vite-env.d.ts','src/Preferences.tsx','src/AccountSettings.tsx','src/PreferencesInterfaceDetails.tsx','src/presentation/PreferencesPresentation.tsx'];
 const program = ts.createProgram(roots, parsed.options);
 const diagnostics = ts.getPreEmitDiagnostics(program);
 if (diagnostics.length) { console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {getCurrentDirectory:()=>process.cwd(),getCanonicalFileName:x=>x,getNewLine:()=>"\n"})); process.exit(1); }
 console.log('Settings121 targeted TypeScript check passed (' + program.getSourceFiles().filter(x=>!x.isDeclarationFile).length + ' source dependencies).');
 process.exit(0);
}

const output = resolve(process.env.SETTINGS121_UI_OUTPUT || '/tmp/cybernote-settings121-ui');
await mkdir(output, { recursive: true });
const fixture = `
import React,{useState,useRef,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import Preferences from '/src/Preferences.tsx';import {NativeMenuContext}from'/src/Menu.tsx';import{PreferenceSelect}from'/src/preferences-menu/PreferenceSelect.tsx';
import AccountSettings from '/src/AccountSettings.tsx';
import AgentSettings from '/src/AgentSettings.tsx';
import DataManagement from '/src/DataManagement.tsx';
import {applyAppearance} from '/src/themes/appearance.ts';
import {defaultInterfaceDetails} from '/src/interface-details.ts';
import '/src/style.css';import '/src/desktop.css';import '/src/themes/tokens.css';import '/src/design-tokens.css';import '/src/design-controls.css';
const devices=[{id:'11111111-1111-4111-8111-111111111111',name:'Mac 工作台',online:true,current:true,connected:true,syncAvailable:true},{id:'22222222-2222-4222-8222-222222222222',name:'Android 备忘录',online:true,current:false,connected:true,syncAvailable:true,summary:{noteCount:12,lastNoteUpdatedAt:1800000000000,capturedAt:1800000000000}}];
window.fixture={calls:[],fail:false,delay:0,accountDelay:0,accountFail:false,closed:0,signed:true,status(){return this.signed?{state:'paused',enabled:false,profile:{subject:'fixture-subject',displayName:'工作账户',username:'notes-user'},devices,pendingCount:0,conflictCount:2,credentialStorage:'encryptedFile'}:{state:'signedOut',enabled:false,devices:[],pendingCount:0,conflictCount:0,credentialStorage:'encryptedFile'}},async invoke(name,{command}){this.calls.push(command);if(command.type==='status'){await new Promise(resolve=>setTimeout(resolve,this.accountDelay));if(this.accountFail)throw Error('fixture account read failed');}if(command.type==='signOut')this.signed=false;return this.status()}};
const agentState={enabled:false,hostSessionId:'fixture-host',workspaceId:'fixture-library',incarnation:'fixture-installation',runtimeDir:'/fixture/runtime',grants:[],recentOperations:[]};
const agentClient={settings:async()=>agentState,setEnabled:async enabled=>({...agentState,enabled}),createGrant:async()=>{throw Error('not used')},revokeGrant:async()=>agentState};
function Fixture(){
 const [tab,setTab]=useState('settings'),[mobile,setMobile]=useState(false),[open,setOpen]=useState(true),[conflictsOpen,setConflictsOpen]=useState(false);
 const [settings,setSettings]=useState({appearance:{version:2,themeId:'classic',schemePreference:'light'},interfaceFontSize:'medium',editorFontSize:'medium',groupDates:true,interfaceDetails:defaultInterfaceDetails});
 const accountHandle=useRef(null),f=window.fixture;
 useEffect(()=>applyAppearance(settings.appearance),[settings.appearance]);
 f.tab=tab;f.settings=settings;f.setTab=setTab;f.setMobile=setMobile;f.open=()=>setOpen(true);f.setSettings=patch=>setSettings(x=>({...x,...patch}));
 const back=()=>{if(tab==='account'&&accountHandle.current?.dismiss())return;if(tab==='account'&&conflictsOpen){setConflictsOpen(false);return;}if(mobile&&tab!=='home')setTab('home');else{f.closed++;setOpen(false)}};
 return open?<NativeMenuContext.Provider value={true}><Preferences mobile={mobile} tab={tab} onTab={next=>{if(!f.rejectNavigation)setTab(next)}} onBack={back} onClose={()=>{f.closed++;setOpen(false)}} returnFocus={document.getElementById('trigger')} settings={settings} onSettings={async patch=>{f.saved=patch;await new Promise(r=>setTimeout(r,f.delay));if(f.fail){f.fail=false;throw Error('模拟保存失败，请重试')}setSettings(x=>({...x,...patch}))}} onCloseLocks={async()=>{f.locks=(f.locks||0)+1}}
 account={<AccountSettings active={tab==='account'} onHandle={h=>accountHandle.current=h} onConflicts={()=>setConflictsOpen(true)}/>}
 agent={<AgentSettings mobile={mobile} folders={[]} client={agentClient} adapter={async()=>'/fixture/cybernote-mcp'}/>}
 data={<DataManagement active={tab==='data'||tab==='backup'} section={tab==='backup'?'backup':'storage'} onHandle={()=>{}} onArchive={async()=>({status:'cancelled'})} backupBlocked={false} archiveBusy={false} accessKey='fixture' accessBlocked={false}/>}
 synchronization={<button>旧配对页面绝不可见</button>}
 syncConflicts={<div><button onClick={()=>{f.conflictQueries=(f.conflictQueries||0)+1}}>查询冲突版本</button><p>没有需要处理的冲突版本。</p></div>}
 conflictsOpen={conflictsOpen} onConflictsOpenChange={setConflictsOpen}
 cloudSync={<div className='preferences-list'><details><summary className='preferences-row'>WebDAV / S3 / GitHub 同步</summary><label className='preferences-row'>服务器地址<input aria-label='fixture云地址'/></label></details></div>}
 automaticBackup={<div className='preferences-group'><div className='settings121-row'><span className='settings121-label'>共享行</span><button type='button' className='settings121-text'>共享常规操作</button></div><label className='preferences-row'><span>自动备份</span><select aria-label='fixture备份频率'><option>关闭</option><option>1 小时</option></select></label></div>}
 softwareUpdate={<div className='preferences-group'><div className='preferences-row'><span>当前版本</span><span>0.1.0</span></div><div className='preferences-row'><span>检查更新</span><button onClick={()=>{f.updateChecks=(f.updateChecks||0)+1}}>重新检查</button><PreferenceSelect label='fixture更新通道' value='stable' mobile={mobile} options={[{value:'stable',label:'稳定版'},{value:'preview',label:'尝鲜版'},{value:'daily',label:'每日版'},{value:'unavailable',label:'不可用项',disabled:true}]} onChange={()=>{}}/></div></div>}
 softwareUpdateBadge={openAbout=><button className='preferences-update-action' type='button' onClick={openAbout}><span className='preferences-update-pill'><svg className='lucide-arrow-up' aria-hidden='true'/>更新 <small>1</small></span></button>}/></NativeMenuContext.Provider>:null
}createRoot(document.getElementById('root')).render(<Fixture/>);`;
const dataPort = `export const clearAttachmentMediaCache=async()=>{};export const getDataManagement=async()=>({version:1,capturedAt:1800000000000,rootPath:'/fixture/CyberNote',files:[{relativePath:'notes.db',category:'database',size:4096,modifiedAt:1800000000000,exists:true,status:'file'}],totals:{databaseBytes:4096,auxiliaryBytes:0,attachmentBytes:0,otherBytes:0,totalBytes:4096,declaredAttachmentBytes:0},counts:{notes:12,folders:3,attachments:0,physicalFiles:1,missingAttachments:0},warnings:[]});`;
const server = await createServer({configFile:false,cacheDir:resolve(output,'vite-cache'),plugins:[react(),{
 name:'settings121-ui-isolated-fixture',enforce:'pre',
 resolveId(id,importer){if(id==='/__settings121.tsx')return id;if(id==='@tauri-apps/api/core'&&importer?.endsWith('/src/account-client.ts'))return '\0settings121-account-port';if(id==='./bridge'&&importer?.endsWith('/src/DataManagement.tsx'))return '\0settings121-data-port';},
 load(id){if(id==='/__settings121.tsx')return fixture;if(id==='\0settings121-account-port')return 'export const isTauri=()=>true;export const invoke=(...args)=>window.fixture.invoke(...args);';if(id==='\0settings121-data-port')return dataPort;},
 configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(req.url?.split('?')[0]!=='/__settings121')return next();try{res.setHeader('content-type','text/html');res.end(await vite.transformIndexHtml(req.url,'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Settings121 isolated UI verification</title><button id="trigger">设置入口</button><div id="root"></div><script type="module" src="/__settings121.tsx"></script></html>'));}catch(e){next(e)}})}
}],server:{host:'127.0.0.1',port:0,hmr:false,watch:{ignored:['**/src-tauri/**','**/artifacts/**']}}});
await server.listen();
const {chromium,webkit}=await import(pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH||'/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright-core/index.mjs'));
let browser;
const checks=[],errors=[];
try{
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:900}});page.on('pageerror',error=>errors.push(String(error)));page.setDefaultTimeout(8000);
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__settings121`);
 await page.getByRole('dialog').waitFor();
 const shot=async name=>page.screenshot({path:resolve(output,`${name}.png`)});
 const tab=async id=>{await page.evaluate(id=>window.fixture.setTab(id),id);await page.locator(`.preferences[data-preferences-tab="${id==='sync'?'account':id}"]`).waitFor()};
 const noOverflow=async name=>assert(await page.locator('.preferences-workspace').evaluate(el=>el.scrollWidth<=el.clientWidth+1),`${name}: horizontal overflow`);
 const saveIdle=()=>page.waitForFunction(()=>document.querySelector('.preferences-form')?.getAttribute('aria-busy')==='false');
 const themeLabels={classic:'Classic · 经典',paper:'Paper · 纸感','high-contrast':'High Contrast · 高对比',ocean:'Ocean · 海洋',forest:'Forest · 森林',rose:'Rose · 玫瑰',lavender:'Lavender · 薰衣草',graphite:'Graphite · 石墨'};
 const choose=async(label,text)=>{await page.getByRole('button',{name:label,exact:true}).click();await page.getByRole('menuitemradio',{name:text,exact:true}).click();};
 const segment=(label,text)=>page.getByRole('radiogroup',{name:label,exact:true}).getByRole('radio',{name:text,exact:true});
 const selectedSort=()=>page.getByRole('radiogroup',{name:'排序方式'}).getByRole('radio',{checked:true});
 const find=async query=>{await page.getByRole('searchbox',{name:'查找设置'}).fill(query);await page.getByRole('region',{name:'设置查找结果'}).waitFor()};
 assert.equal(await page.getByRole('tab').count(),7);assert.equal(await page.getByText('设备同步',{exact:true}).count(),0);assert.equal(await page.getByText('旧配对页面绝不可见').count(),0);
 const sidebar=await page.locator('.preferences-navigation').evaluate(el=>({width:el.getBoundingClientRect().width,gap:getComputedStyle(el).gap,selected:getComputedStyle(el.querySelector('[aria-selected="true"]')).backgroundColor}));
 assert.equal(sidebar.width,196);assert.equal(sidebar.gap,'8px');assert.equal(sidebar.selected,'rgb(255, 241, 204)');
 assert.equal(await page.locator('.preferences-workspace').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(244, 244, 246)');
 await page.getByRole('button',{name:'主题',exact:true}).click();assert.equal(await page.getByRole('menuitemradio').count(),8);await page.keyboard.press('Escape');await shot('desktop-light-appearance');
 const metrics=await page.evaluate(()=>{
 const style=selector=>getComputedStyle(document.querySelector(selector));
 const row=style('.preferences-row'),segment=style('.preferences-segments > button');
 return {bodyFont:style('.preferences-workspace').fontSize,bodyLineHeight:style('.preferences-workspace').lineHeight,sidebarFont:style('.preferences-navigation').fontSize,rowMin:row.minHeight,rowPadding:row.padding,rowGap:row.gap,segmentHeight:segment.height,segmentFont:segment.fontSize};
 });
 assert(Math.abs(parseFloat(metrics.bodyFont)-13)<.02);assert(Math.abs(parseFloat(metrics.sidebarFont)-14)<.02);
 assert.equal(metrics.rowMin,'48px');assert.equal(metrics.rowPadding,'12px 12px 12px 14px');assert.equal(metrics.rowGap,'14px');assert.equal(metrics.segmentHeight,'22px');assert(Math.abs(parseFloat(metrics.segmentFont)-12)<.02);
 await writeFile(resolve(output,'metrics.json'),JSON.stringify(metrics,null,2)+'\n');
 for(const theme of ['classic','paper','high-contrast','ocean','forest','rose','lavender','graphite']){await choose('主题',themeLabels[theme]);await saveIdle();assert.equal(await page.evaluate(()=>window.fixture.settings.appearance.themeId),theme);await noOverflow(theme)}
 await choose('主题',themeLabels.classic);await saveIdle();
 await page.evaluate(()=>{window.fixture.fail=true;window.fixture.delay=100});await choose('主题',themeLabels.ocean);await page.getByRole('alert').waitFor();assert.match(await page.getByRole('button',{name:'主题',exact:true}).innerText(),/Classic/);assert.equal(await page.evaluate(()=>window.fixture.settings.appearance.themeId),'classic');
 checks.push('seven sidebar categories, original geometry/yellow selection, eight persisted-receipt theme choices and rejected save retains confirmed theme');
 await find('菜单间距');await page.getByRole('button',{name:/界面细节.*外观与字号/}).click();await page.getByRole('button',{name:'菜单间距',exact:true}).waitFor();assert.equal(await page.locator('.preferences-details-toggle').getAttribute('aria-expanded'),'true');
 await page.evaluate(()=>{window.fixture.fail=true});await page.getByRole('slider',{name:'图标大小',exact:true}).focus();await page.keyboard.press('ArrowRight');await page.locator('.preferences-details-error').waitFor();assert.equal(await page.getByRole('slider',{name:'图标大小',exact:true}).inputValue(),'100');
 await find('不存在的设置xyz');assert.match(await page.getByRole('region',{name:'设置查找结果'}).innerText(),/未找到/);await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),1);
 await find('排序');await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>window.fixture.tab),'notes');assert(await selectedSort().evaluate(el=>el===document.activeElement));await shot('desktop-light-notes');
 await page.keyboard.press('End');await page.waitForFunction(()=>window.fixture.settings.sort==='title');
 await segment('按日期分组','关闭').click();await page.waitForFunction(()=>window.fixture.settings.groupDates===false);
 checks.push('search empty state/Escape, cross-category Enter navigation/focus, details expansion, sort and explicit false preserved');
 await find('检查更新');await page.keyboard.press('Enter');
 await page.getByRole('tabpanel',{name:'关于',exact:true}).waitFor();
 await page.getByRole('button',{name:/更新.*1/}).click();
 await page.getByRole('button',{name:'fixture更新通道',exact:true}).click();
 await page.keyboard.press('End');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'每日版');
 assert.equal(await page.getByRole('menuitemradio',{name:'不可用项'}).isDisabled(),true);
 await page.keyboard.press('Escape');assert.equal(await page.getByRole('menu').count(),0);assert.equal(await page.getByRole('tabpanel',{name:'关于',exact:true}).count(),1);assert.equal(await page.getByRole('dialog').count(),1);
 checks.push('About is searchable, and Escape closes its inner dropdown and restores its trigger focus');
 // R2: first account mount returns asynchronously; destination must eventually own focus.
 await page.evaluate(()=>{window.fixture.accountDelay=250;window.fixture.setTab('settings')});
 await find('我的设备');await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.activeElement?.matches('.account-device-group'));
 await shot('fixed-delayed-search-device-focus');
 // Cancel an in-flight search by changing pages before its response arrives.
 await tab('settings');await find('我的设备');await page.keyboard.press('Enter');
 await page.getByRole('tab',{name:'备忘录',exact:true}).click();
 await selectedSort().focus();
 await page.waitForTimeout(300);
 assert(await selectedSort().evaluate(el=>el===document.activeElement));
 // A second search replaces the first intent rather than allowing a late focus steal.
 await tab('settings');await find('我的设备');await page.keyboard.press('Enter');
 await find('排序');await page.keyboard.press('Enter');
 await page.waitForTimeout(300);
 assert(await selectedSort().evaluate(el=>el===document.activeElement));
 // A failed load has a bounded actionable outcome, not a silent missing target.
 await page.evaluate(()=>{window.fixture.accountFail=true;window.fixture.setTab('settings')});
 await find('我的设备');await page.keyboard.press('Enter');
 await page.getByText('账户状态读取失败，未能定位设置。请在账户页重试读取后重新查找。',{exact:true}).waitFor();
 await page.evaluate(()=>{window.fixture.accountFail=false;window.fixture.accountDelay=0;window.fixture.setTab('settings')});
 checks.push('R2: delayed destination focus, cancelled navigation, replaced search and failed-load outcome');
 await tab('account');await page.getByRole('button',{name:'退出账户',exact:true}).waitFor();await shot('desktop-light-account');
 await page.getByRole('switch',{name:'允许此设备同步'}).click();await page.getByRole('alertdialog').waitFor();assert.equal(await page.evaluate(()=>window.fixture.calls.filter(c=>c.type==='setEnabled').length),0);await page.keyboard.press('Escape');assert.equal(await page.getByRole('alertdialog').count(),0);assert.equal(await page.getByRole('dialog').count(),1);assert(await page.getByRole('switch').evaluate(el=>el===document.activeElement));
 await page.getByRole('button',{name:'Android 备忘录',exact:true}).click();await page.getByRole('alertdialog').waitFor();assert.equal(await page.evaluate(()=>window.fixture.calls.filter(c=>c.type==='syncDevice').length),0);await page.getByRole('button',{name:'取消',exact:true}).click();
 await page.getByRole('button',{name:'退出账户',exact:true}).click();await page.getByRole('alertdialog').waitFor();assert.equal(await page.evaluate(()=>window.fixture.calls.filter(c=>c.type==='signOut').length),0);await page.keyboard.press('Escape');
 await page.locator('.preferences-conflicts > summary').click();await page.getByRole('button',{name:'查询冲突版本'}).click();assert.equal(await page.evaluate(()=>window.fixture.conflictQueries),1);assert.equal(await page.getByText('旧配对页面绝不可见').count(),0);
 await tab('sync');await page.waitForFunction(()=>window.fixture.tab==='account');assert.equal(await page.locator('.preferences-conflicts').getAttribute('open'),'');
 checks.push('real account enable/target/signout confirmations cancel without mutation, inner Escape returns focus, legacy sync redirects and pairing slot never mounts');
 await page.getByRole('button',{name:/更新.*1/}).click();await page.getByRole('button',{name:'重新检查',exact:true}).click();assert.equal(await page.evaluate(()=>window.fixture.updateChecks),1);await shot('desktop-about');
 const styleOf=selector=>page.locator(selector).evaluate(el=>{const s=getComputedStyle(el);return {color:s.color,bg:s.backgroundColor,font:parseFloat(s.fontSize),weight:s.fontWeight,padding:s.padding,radius:s.borderRadius,height:el.getBoundingClientRect().height,shadow:s.boxShadow}});
 const lightPill=await styleOf('.preferences-update-pill');assert.equal(lightPill.height,22);assert.equal(lightPill.radius,'999px');assert.equal(lightPill.bg,'rgb(238, 237, 253)');assert.equal(lightPill.weight,'560');assert(Math.abs(lightPill.font-11.5)<.02);assert.equal(lightPill.padding,'0px 9px 0px 7px');assert.match(lightPill.shadow,/inset/);assert.equal(await page.locator('.preferences-update-pill .lucide-arrow-up').count(),1);
 await tab('notes');const lightAction=await styleOf('.preferences-lock-action');assert.equal(lightAction.color,'rgb(99, 99, 107)');assert(Math.abs(lightAction.font-12)<.02);assert.equal(lightAction.padding,'3px 7px');assert.equal(lightAction.radius,'6px');
 await page.locator('.preferences-lock-action').hover();assert.equal((await styleOf('.preferences-lock-action')).bg,'rgb(241, 241, 244)');
 await tab('settings');await page.getByRole('button',{name:'主题',exact:true}).focus();await page.keyboard.press('ArrowDown');
 assert.equal(await page.getByRole('menu').count(),1);assert.equal(await page.locator('.native-menu-surface').count(),0);assert(await page.getByRole('menuitemradio',{name:'Classic · 经典'}).evaluate(el=>el===document.activeElement));
 await page.keyboard.press('End');assert(await page.getByRole('menuitemradio',{name:'Graphite · 石墨'}).evaluate(el=>el===document.activeElement));await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await saveIdle();assert.equal(await page.evaluate(()=>window.fixture.settings.appearance.themeId),'paper');
 await choose('主题',themeLabels.classic);await saveIdle();
 await page.getByRole('button',{name:'主题',exact:true}).click();await shot('fixed-desktop-menu-light');const menuBox=await page.getByRole('menu').boundingBox();assert(menuBox.x>=0&&menuBox.y>=0&&menuBox.x+menuBox.width<=1280&&menuBox.y+menuBox.height<=900);await page.getByRole('searchbox',{name:'查找设置'}).click();assert.equal(await page.getByRole('menu').count(),0);assert(await page.getByRole('searchbox',{name:'查找设置'}).evaluate(el=>el===document.activeElement));
 await page.getByRole('button',{name:'主题',exact:true}).click();await tab('notes');await page.waitForFunction(()=>!document.querySelector('[role="menu"]'));assert.equal(await page.locator('#preferences-panel-notes select').count(),0);
 await tab('settings');await page.getByRole('button',{name:'主题',exact:true}).click();await page.keyboard.type('gra');assert(await page.getByRole('menuitemradio',{name:'Graphite · 石墨'}).evaluate(el=>el===document.activeElement));await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'主题',exact:true}).click();await page.keyboard.press('Tab');assert.equal(await page.getByRole('menu').count(),0);assert(await page.locator('.preferences').evaluate(el=>el.contains(document.activeElement)));
 await page.getByRole('button',{name:'主题',exact:true}).click();await page.keyboard.press('End');await page.keyboard.press('Space');await saveIdle();assert.equal(await page.evaluate(()=>window.fixture.settings.appearance.themeId),'graphite');await choose('主题',themeLabels.classic);await saveIdle();
 await page.setViewportSize({width:800,height:400});await page.getByRole('button',{name:'主题',exact:true}).click();const shortBox=await page.getByRole('menu').boundingBox();assert(shortBox.x>=7&&shortBox.y>=7&&shortBox.x+shortBox.width<=793&&shortBox.y+shortBox.height<=393,JSON.stringify(shortBox));await shot('fixed-desktop-short-menu');await page.keyboard.press('Escape');await page.setViewportSize({width:1280,height:900});
 await find('菜单间距');await page.keyboard.press('Enter');await choose('菜单间距','宽松');await page.waitForFunction(()=>window.fixture.settings.interfaceDetails.menuSpacing==='comfortable');
 await tab('notes');await segment('桌面显示方式','画廊').click();await page.waitForFunction(()=>window.fixture.settings.presentation?.desktop.collectionView==='gallery');await segment('桌面密度','紧凑').click();await page.waitForFunction(()=>window.fixture.settings.presentation?.desktop.density==='compact');
 await tab('settings');await page.evaluate(()=>{window.fixture.delay=250});await choose('主题',themeLabels.ocean);assert(await page.getByRole('button',{name:'主题',exact:true}).isDisabled());assert.equal(await page.getByRole('menu').count(),0);await saveIdle();await page.evaluate(()=>{window.fixture.delay=0});await choose('主题',themeLabels.classic);await saveIdle();
 checks.push('R4/R5/R6: desktop DOM radio menu despite native context, selected focus/arrows/Home/End/Enter, outside dismissal/page cleanup, viewport placement, exact gray actions and update pill');
 await tab('agent');await page.getByRole('button',{name:'创建授权',exact:true}).waitFor();await shot('desktop-light-agent');await noOverflow('agent');
 await tab('data');await page.getByRole('region',{name:'本地存储占用'}).waitFor();await shot('desktop-light-storage');await noOverflow('storage');
 await tab('backup');await page.getByLabel('fixture备份频率').waitFor();await shot('desktop-light-backup');await noOverflow('backup');const publicAction=await styleOf('.settings121-text');assert.equal(publicAction.color,'rgb(99, 99, 107)');assert.equal(publicAction.padding,'3px 7px');assert(Math.abs(publicAction.font-12)<.02);
 checks.push('update toolbar badge opens About; real Agent, storage and archive components render through parent adapters; backup slot only in backup');
 await tab('settings');await page.getByRole('radio',{name:'深色',exact:true}).click();await saveIdle();assert.equal(await page.locator('.preferences-workspace').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(26, 26, 30)');await shot('desktop-dark-appearance');
 await page.getByRole('button',{name:'主题',exact:true}).click();await shot('fixed-desktop-menu-dark');assert.equal((await styleOf('.preferences-select-menu')).bg,'rgb(35, 35, 39)');await page.keyboard.press('Escape');
 assert.equal((await styleOf('.preferences-update-pill')).bg,'rgb(43, 44, 71)');await tab('notes');assert.equal((await styleOf('.preferences-lock-action')).color,'rgb(161, 161, 170)');await tab('backup');assert.equal((await styleOf('.settings121-text')).color,'rgb(161, 161, 170)');
 await tab('account');assert.equal((await styleOf('.account-refresh')).color,'rgb(161, 161, 170)');await shot('desktop-dark-account');
 await page.setViewportSize({width:800,height:650});await tab('notes');await noOverflow('desktop-narrow');await shot('desktop-narrow');
 await page.evaluate(()=>{document.documentElement.style.setProperty('--ui-font-scale','1.1')});await noOverflow('desktop-large-font');await shot('desktop-large-font');
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{document.documentElement.style.removeProperty('--ui-font-scale');window.fixture.setMobile(true);window.fixture.setTab('home')});await page.getByRole('button',{name:'账户与同步',exact:true}).waitFor();await shot('mobile-dark-home');
 await page.getByRole('button',{name:/外观与字号/}).click();await page.getByLabel('主题',{exact:true}).waitFor();await page.locator('#preferences-panel-settings').evaluate(el=>el.scrollTop=0);await noOverflow('mobile appearance');await shot('mobile-dark-appearance');
 await segment('外观','浅色').click();await saveIdle();await shot('mobile-light-appearance');
 await page.getByRole('button',{name:'返回设置',exact:true}).click();assert(await page.getByRole('button',{name:/外观与字号/}).evaluate(el=>el===document.activeElement));
 await find('排序');await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>window.fixture.tab),'notes');await noOverflow('mobile notes');await shot('mobile-light-notes');
 await page.getByRole('button',{name:'返回设置',exact:true}).click();await page.getByRole('button',{name:'账户与同步',exact:true}).click();await page.getByRole('switch').waitFor();await noOverflow('mobile account');await shot('mobile-light-account');
 const touch=await page.locator('.preferences-workspace button:visible,.preferences-workspace select:visible,.preferences-workspace summary:visible').evaluateAll(nodes=>nodes.map(el=>({text:el.textContent,height:el.getBoundingClientRect().height})).filter(x=>x.height<44));assert.deepEqual(touch,[]);
 await page.evaluate(()=>{window.fixture.signed=false;window.fixture.setTab('notes')});await tab('account');await page.getByRole('button',{name:'登录',exact:true}).waitFor();await shot('mobile-signed-out');await noOverflow('signed out');
 for(const width of [320,390]){await page.setViewportSize({width,height:740});await noOverflow(`mobile ${width}`);await tab('notes');await noOverflow(`notes ${width}`);await tab('backup');await noOverflow(`backup ${width}`);await tab('account')}
 checks.push('desktop light/dark, 800px narrow/large font, mobile home/back/focus/search, 320/390px account/notes/backup, all mobile button/select/summary hit heights >=44px');
 await find('我的设备');assert.match(await page.getByRole('region',{name:'设置查找结果'}).innerText(),/未找到/);await page.keyboard.press('Escape');
 const android=await browser.newContext({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36'});
 const androidPage=await android.newPage();await androidPage.goto(`http://127.0.0.1:${server.httpServer.address().port}/__settings121`);await androidPage.evaluate(()=>{window.fixture.setMobile(true);window.fixture.signed=false});
 await androidPage.getByRole('searchbox',{name:'查找设置'}).fill('登录与安全');assert.equal(await androidPage.getByRole('button',{name:/登录与安全/}).count(),0);
 await androidPage.getByRole('searchbox',{name:'查找设置'}).fill('我的设备');assert.match(await androidPage.getByRole('region',{name:'设置查找结果'}).innerText(),/登录后查看/);await androidPage.keyboard.press('Enter');await androidPage.getByText('请先登录账户，再查看我的设备。',{exact:true}).waitFor();assert.equal(await androidPage.locator('.account-device-group').count(),0);
 await androidPage.screenshot({path:resolve(output,'fixed-android-signedout-search.png')});await android.close();checks.push('R3: Android UA hides unavailable credentials; unknown account gives login prerequisite and known signed-out hides devices');
 await page.getByRole('button',{name:'关闭设置',exact:true}).focus();await page.keyboard.press('Shift+Tab');assert(await page.locator('.preferences').evaluate(el=>el.contains(document.activeElement)));await page.getByRole('button',{name:'关闭设置',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.preferences'));assert(await page.locator('#trigger').evaluate(el=>el===document.activeElement));
 const timeoutPage=await browser.newPage({viewport:{width:1280,height:900}});await timeoutPage.goto(`http://127.0.0.1:${server.httpServer.address().port}/__settings121`);await timeoutPage.getByRole('dialog').waitFor();await timeoutPage.clock.install();await timeoutPage.evaluate(()=>{window.fixture.accountDelay=10000});await timeoutPage.getByRole('searchbox',{name:'查找设置'}).fill('我的设备');await timeoutPage.keyboard.press('Enter');await timeoutPage.locator('.account-settings[data-settings-account-search="loading"]').waitFor();await timeoutPage.clock.fastForward(5001);await timeoutPage.getByText('设置尚未加载完成，请检查当前页面的加载状态后重新查找。',{exact:true}).waitFor();await timeoutPage.getByRole('searchbox',{name:'查找设置'}).focus();await timeoutPage.clock.fastForward(6000);assert(await timeoutPage.getByRole('searchbox',{name:'查找设置'}).evaluate(el=>el===document.activeElement));await timeoutPage.evaluate(()=>{window.fixture.setTab('settings');window.fixture.rejectNavigation=true});await timeoutPage.getByRole('searchbox',{name:'查找设置'}).fill('我的设备');await timeoutPage.keyboard.press('Enter');await timeoutPage.clock.fastForward(5001);await timeoutPage.getByText('设置尚未加载完成，请检查当前页面的加载状态后重新查找。',{exact:true}).waitFor();await timeoutPage.close();checks.push('R2 bounded five-second timeout cancels late destination focus; R4 disabled options/typeahead/short-window/menu-family/receipt waiting');
 assert.deepEqual(errors,[]);
 const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 await writeFile(resolve(output,'fix-metrics.json'),JSON.stringify({lightPill,lightAction,publicAction,shortViewportMenu:shortBox},null,2)+'\n');
 const result={passed:true,revision,dirty:execFileSync('git',['diff','--stat'],{encoding:'utf8'}).trim(),checks,errors,output,scope:'Chromium with real React production components and local synthetic account/data/Agent ports. No native WebKit, Android device, real account, sync, backup or update acceptance.'};
 await writeFile(resolve(output,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
 // Inventory only: never download a browser as part of verification.
 console.log('WebKit executable candidate:',webkit.executablePath());
}catch(error){await browser?.contexts()[0]?.pages()[0]?.screenshot({path:resolve(output,'failure.png')});throw error}finally{await browser?.close();await server.close()}
