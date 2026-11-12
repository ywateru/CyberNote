import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {openRuntime,api,idle} from './runtime.mjs';
const out=resolve(process.argv[2]||'artifacts/design100-table');await mkdir(out,{recursive:true});
const checks=[];
for(const mobile of [false,true]){
 const r=await openRuntime({root:process.cwd(),mobile}); const{page}=r;
 try{
  await page.setViewportSize(mobile?{width:320,height:640}:{width:760,height:500});
  await api(page,'note.create');
  for(const font of ['tiny','small','medium','large','huge']){
   await api(page,'settings.update',{settings:{interfaceFontSize:font,interfaceDetails:{version:1,iconScale:120,desktopHitScale:130,mobileHitScale:120,menuSpacing:'comfortable',radiusScale:150}}});
   if(!(await page.locator('.tiptap table').count()))await api(page,'editor.table',{action:'insert'});
   await page.locator('.tiptap td,.tiptap th').first().click();await idle(page);
   for(const label of ['选择行','选择列']){
    const button=page.getByRole('button',{name:label,exact:true});await button.waitFor();
    await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
    const box=await button.boundingBox(),min=mobile?52.8:36.4;
    assert.ok(box.width+.1>=min&&box.height+.1>=min,JSON.stringify({mobile,font,label,box}));
    assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=page.viewportSize().width+.1,JSON.stringify({mobile,font,label,box}));
    await button.click();await page.getByRole('menu',{name:label==='选择行'?'行操作':'列操作',exact:true}).waitFor();
    await page.keyboard.press('Escape');await page.locator('.tiptap td,.tiptap th').first().click();
   }
   checks.push(`${mobile?'mobile':'desktop'} ${font}: actual row/column hit target, viewport, single-click menu`);
  }
  await page.screenshot({path:resolve(out,`${mobile?'mobile':'desktop'}-table.png`)});
  assert.deepEqual(r.errors,[]);
 }finally{await r.cleanup();}
}
await writeFile(resolve(out,'result.json'),JSON.stringify({checks},null,2));console.log(checks.join('\n'));
