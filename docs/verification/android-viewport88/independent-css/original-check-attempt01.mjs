import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from '/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright-core/index.mjs';
const source='/private/tmp/apple-notes-viewport88';
const out=process.argv[2];await mkdir(out,{recursive:true});
const fixed=await readFile(source+'/src/Preferences.css','utf8');
const baseline=execFileSync('git',['show','51978a26:src/Preferences.css'],{cwd:source,encoding:'utf8'});
const extra=await readFile(source+'/src/DataManagement.css','utf8')+'\n'+await readFile(source+'/src/SyncSettings.css','utf8');
assert.equal(fixed.replace(/^.*(?:height: min\(760px, calc\(100vh|height: 100vh|max-height: 100vh).*\n/gm,''),baseline);
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results=[];
try{
 for(const shape of [{name:'mobile',width:360,height:568,top:0},{name:'desktop-small',width:1000,height:568,top:48},{name:'desktop-large',width:1200,height:1000,top:0}]){
  const observations={};
  for(const [variant,original] of [['baseline',baseline],['fixed',fixed]])for(const legacy of [false,true]){
   const css=legacy?original.replace(/^.*dvh.*\n/gm,''):original;
   const page=await browser.newPage({viewport:{width:shape.width,height:shape.height}});
   await page.setContent(`<!doctype html><style>*{box-sizing:border-box}body{margin:0;--native-top:${shape.top}px;--paper:white;--ink:black;--line:#ccc;--accent:orange;--grouped:#eee}${css}${extra}</style><div class="preferences-backdrop"><section class="preferences"><header class="preferences-header"><h2>设置</h2></header><nav class="preferences-tabs"><button>设置</button><button aria-selected="true">数据</button></nav><div class="preferences-panel preferences-data"><div class="data-management"><header class="data-management-header"><h2>数据管理</h2></header><div class="data-management-scroll"><div style="height:1100px">合成数据占位</div><section class="sync-settings"><h3>多端同步</h3><label class="sync-field"><span>设备名称</span><input aria-label="同步设备名称"></label><div style="height:200px">同步信息</div></section></div></div></div></section></div>`);
   const measure=()=>page.evaluate(()=>{const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}};const panel=document.querySelector('.preferences'),scroll=document.querySelector('.data-management-scroll'),input=document.querySelector('input');return{panel:rect(panel),scroller:rect(scroll),overflow:getComputedStyle(scroll).overflowY,scrollHeight:scroll.scrollHeight,clientHeight:scroll.clientHeight,input:rect(input),focused:document.activeElement===input,viewport:{width:innerWidth,height:innerHeight},supportsDvh:CSS.supports('height','100dvh')};});
   const before=await measure();
   if(variant==='fixed'||!legacy){await page.getByLabel('同步设备名称').fill('SYNC88 synthetic');const after=await measure();assert(after.focused);assert(after.input.y>=0&&after.input.y+after.input.height<=shape.height);assert.equal(after.overflow,'auto');assert(after.scrollHeight>after.clientHeight);assert(before.panel.y>=-0.5);assert(before.panel.y+before.panel.height<=shape.height+.5);const expected=shape.width<700?shape.height:Math.min(760,shape.height-Math.max(24,shape.top)-24);assert.equal(before.panel.height,expected);observations[variant+'-'+legacy]=before;results.push({shape:shape.name,variant,unsupportedDvhSimulated:legacy,before,after});}
   else {assert(before.panel.height>shape.height);assert(before.input.y>shape.height);observations[variant+'-'+legacy]=before;results.push({shape:shape.name,variant,unsupportedDvhSimulated:true,expectedFailure:before});}
   await page.close();
  }
  assert.deepEqual(observations['baseline-false'],observations['fixed-false']);
  assert.deepEqual(observations['fixed-false'],observations['fixed-true']);
 }
 await writeFile(out+'/result.json',JSON.stringify({ok:true,scope:'real host Chromium layout of structural fixture using actual product CSS; legacy unsupported unit behavior simulated by removing dvh declarations; no device operations',sourceSha256:createHash('sha256').update(fixed).digest('hex'),results},null,2)+'\n');
 console.log(JSON.stringify({ok:true,cases:results.length,modernBrowser:await browser.version(),scope:'narrow CSS structural fixture; legacy simulated, no Android operation'}));
}finally{await browser.close();}
