// Independent component-lifecycle probe: real production React component,
// deliberately deferred settings receipts. No native or persisted-data claim.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import react from '@vitejs/plugin-react';
import { createServer as createViteServer } from 'vite';

const out = resolve('artifacts/design100a-independent');
await mkdir(out, {recursive:true});
const compiled = resolve(out, 'interface-details.mjs');
await writeFile(compiled, ts.transpileModule(await readFile('src/interface-details.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const {parseInterfaceDetails,defaultInterfaceDetails,interfaceDetailVariables} = await import(pathToFileURL(compiled));
let invalidCount = 0;
for (const key of Object.keys(defaultInterfaceDetails)) {
  const missing = {...defaultInterfaceDetails}; delete missing[key];
  assert.throws(()=>parseInterfaceDetails(missing)); invalidCount++;
  for (const value of [null,true,{},[],undefined]) {
    assert.throws(()=>parseInterfaceDetails({...defaultInterfaceDetails,[key]:value})); invalidCount++;
  }
}
const d = parseInterfaceDetails({...defaultInterfaceDetails,desktopHitScale:130,mobileHitScale:101});
assert.equal(interfaceDetailVariables(d,false)['--interface-hit-min'],'36.4px');
assert.equal(interfaceDetailVariables(d,true)['--interface-hit-min'],'44.44px');
assert.ok(Object.isFrozen(d));
const entry = `import React,{useState}from'react';import{createRoot}from'react-dom/client';import Details from'/src/PreferencesInterfaceDetails.tsx';import{defaultInterfaceDetails}from'/src/interface-details.ts';
function Fixture(){const[value,setValue]=useState(defaultInterfaceDetails);window.external=(iconScale)=>{window.sent={...defaultInterfaceDetails,iconScale};setValue(window.sent)};window.current=value;return <Details value={value} mobile={false} disabled={false} onSettings={patch=>{window.patch=patch.interfaceDetails;setValue(patch.interfaceDetails);return new Promise((resolve,reject)=>{window.ack=()=>resolve();window.reject=()=>reject(Error('controlled delayed failure'))})}}/>}createRoot(document.getElementById('root')).render(<Fixture/>);`;
const vite = await createViteServer({configFile:false,cacheDir:resolve(out,'vite-cache'),plugins:[react(),{name:'independent-details',resolveId:id=>id==='/__review.tsx'?id:undefined,load:id=>id==='/__review.tsx'?entry:undefined}],server:{middlewareMode:true,hmr:false},appType:'custom'});
const server = createServer(async(req,res)=>{if(new URL(req.url,'http://localhost').pathname==='/__check'){res.setHeader('content-type','text/html');res.end(await vite.transformIndexHtml(req.url,'<!doctype html><div id="root"></div><script type="module" src="/__review.tsx"></script>'));}else vite.middlewares(req,res);});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH||'/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright-core/index.mjs'));
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results=[];
try {
  for (const receipt of ['ack','reject']) {
    const page=await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/__check`);
    await page.getByRole('button',{name:'界面细节',exact:true}).click();
    const slider=page.getByRole('slider',{name:'图标大小',exact:true});
    await slider.focus(); await page.keyboard.press('ArrowRight');
    await page.waitForFunction(()=>typeof window.ack==='function'&&window.current.iconScale===101);
    await page.evaluate(()=>window.external(111));
    await page.waitForFunction(()=>window.current.iconScale===111);
    await page.evaluate(receipt=>window[receipt](),receipt);
    await page.waitForFunction(()=>document.querySelector('.preferences-details-content').getAttribute('aria-busy')==='false');
    const observed=Number(await slider.inputValue());
    results.push({receipt,parentActual:111,observed,ok:observed===111});
    await page.close();
  }
  for (const receipt of ['ack','reject']) for(const scenario of ['external-then-echo','echo-only']) {
    const page=await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/__check`);
    await page.getByRole('button',{name:'界面细节',exact:true}).click();
    const slider=page.getByRole('slider',{name:'图标大小',exact:true});
    await slider.focus(); await page.keyboard.press('ArrowRight');
    await page.waitForFunction(()=>typeof window.ack==='function'&&window.current.iconScale===101);
    if(scenario==='external-then-echo') {
      for(const n of [109,111,101]) {
        await page.evaluate(n=>window.external(n),n);
        await page.waitForFunction(n=>window.current.iconScale===n,n);
      }
    } else {
      await page.evaluate(()=>window.external(101));
      await page.waitForFunction(()=>window.current===window.sent);
    }
    await page.evaluate(receipt=>window[receipt](),receipt);
    await page.waitForFunction(()=>document.querySelector('.preferences-details-content').getAttribute('aria-busy')==='false');
    const expected=scenario==='external-then-echo'?111:receipt==='ack'?101:100;
    const observed=Number(await slider.inputValue());
    assert.equal(await page.getByRole('alert').count(),receipt==='reject'?1:0,`${receipt}/${scenario}`);
    assert.equal(await page.locator('.preferences-details-example').evaluate(el=>el.style.getPropertyValue('--interface-icon-size')),`${expected*20/100}px`);
    let nextExpected=expected;
    if(scenario==='echo-only'&&receipt==='reject') {
      await page.evaluate(()=>window.external(101));
      await page.waitForFunction(()=>document.querySelector('input[aria-label="图标大小"]').value==='101');
      assert.equal(await page.getByRole('alert').count(),0);
      nextExpected=101;
      results.push({receipt,scenario:'post-reject-new-same-content-external',expected:101,observed:101,ok:true});
    }
    // An unrelated detail must preserve the latest acknowledged outside value.
    await page.getByRole('combobox',{name:'菜单间距',exact:true}).selectOption('comfortable');
    await page.waitForFunction(()=>window.patch.menuSpacing==='comfortable');
    assert.equal(await page.evaluate(()=>window.patch.iconScale),nextExpected);
    await page.evaluate(()=>window.ack());
    await page.waitForFunction(()=>document.querySelector('.preferences-details-content').getAttribute('aria-busy')==='false');
    results.push({receipt,scenario,expected,observed,nextPatchPreserved:true,ok:observed===expected});
    await page.close();
  }
  const result={parserInvalidCases:invalidCount,independentPlatformScales:true,frozen:true,results,scope:'Real component with controlled deferred settings receipts, not native or storage evidence.'};
  await writeFile(resolve(out,'lifecycle.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
  if(results.some(r=>!r.ok))process.exitCode=1;
} finally {await browser.close();await new Promise(done=>server.close(done));await vite.close();}
