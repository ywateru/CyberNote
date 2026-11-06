import { resolve } from 'node:path';
import { openRuntime, api, idle, saveJSON } from '../../../scripts/debug/runtime.mjs';
const runtime = await openRuntime({mobile:true});
const {page} = runtime;
const output = resolve('docs/verification/quick-home83-focus-followup');
const rows=[];
try {
  await api(page,'note.select',{id:'note-a'});await idle(page);
  await page.setViewportSize({width:1280,height:844});
  await api(page,'settings.update',{settings:{theme:'dark'}});await idle(page);
  await api(page,'data.open');await idle(page);
  await page.evaluate(()=>{
    window.__focusTrace=[];
    const focus=HTMLElement.prototype.focus;
    HTMLElement.prototype.focus=function(...args){window.__focusTrace.push({t:performance.now(),target:this.outerHTML.slice(0,200),stack:new Error().stack});return focus.apply(this,args);};
  });
  for(let i=0;i<5;i++) {
    await page.locator('[data-storage-category="all"]').click();
    await page.waitForSelector('.data-management[data-storage-view="all"]');
    await page.getByRole('button',{name:'返回数据管理总览',exact:true}).click();
    await page.waitForSelector('.storage-summary');
    const close=page.getByRole('button',{name:'关闭设置',exact:true});
    await close.focus();await page.keyboard.press('Shift+Tab');
    rows.push(await page.evaluate(()=>({step:'reverse',active:document.activeElement.outerHTML.slice(0,200),trace:[...window.__focusTrace]})));
    await page.keyboard.press('Tab');
    rows.push(await page.evaluate(()=>({step:'forward',active:document.activeElement.outerHTML.slice(0,200),trace:[...window.__focusTrace]})));
  }
  await saveJSON(resolve(output,'natural-focus-trace.json'),{rows,pageErrors:runtime.errors});
} finally {await runtime.cleanup();}
