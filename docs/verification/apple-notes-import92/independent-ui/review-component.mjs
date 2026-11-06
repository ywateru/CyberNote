import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from '/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright-core/index.mjs';
import {resolve} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const root=process.cwd(),out=resolve(root,'docs/verification/apple-notes-import92/independent-ui'),start=performance.now();
let server,browser,observed,error;
try {
 server=await createServer({root,configFile:false,appType:'custom',cacheDir:resolve(out,'vite-cache'),logLevel:'error',plugins:[react(),{name:'review-os-bridge',enforce:'pre',resolveId(source,importer){if(source==='./apple-notes-import'&&importer===resolve(root,'src/AppleNotesImport.tsx'))return resolve(out,'component-bridge.ts')}}],server:{host:'127.0.0.1',port:0}});
 server.middlewares.use(async(req,res,next)=>{if(req.url!=='/')return next();res.setHeader('content-type','text/html');res.end(await server.transformIndexHtml('/','<!doctype html><html><body><div id="root"></div><script type="module" src="/docs/verification/apple-notes-import92/independent-ui/component-entry.tsx"></script></body></html>'))});
 await server.listen();browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--disable-gpu']});const page=await browser.newPage();
 const rendererErrors=[];page.on('pageerror',e=>rendererErrors.push(e.message));await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);await page.waitForFunction(()=>!!window.handle);
 await page.evaluate(async()=>{window.handle.open();await window.handle.scan()});await page.waitForFunction(()=>window.handle.inspect().state?.phase==='preview');await page.evaluate(()=>window.handle.cancel());
 await page.waitForTimeout(1450);observed=await page.evaluate(()=>({state:window.handle.inspect(),polls:window.sourcePolls(),finishes:window.finishes}));
 await writeFile(resolve(out,'component03.observed.html'),await page.locator('.apple-import-section').evaluate(n=>n.outerHTML));observed.rendererErrors=rendererErrors;
 if(observed.state.state.phase!=='cancelled'||observed.polls<3||observed.finishes.length!==1)throw Error('cancelling heartbeat stopped polling before terminal and busy cleanup');
} catch(e){error=e.message;} finally {await browser?.close();await server?.close();}
const result={passed:!error,sourceCommit:'adffa10c',componentSha256:createHash('sha256').update(await readFile(resolve(root,'src/AppleNotesImport.tsx'))).digest('hex'),wallMs:performance.now()-start,scope:'actual React AppleNotesImport component/browser with synthetic import bridge only; no Rust/Notes/App Store',observed,error,cleanup:{browserClosed:!browser?.isConnected(),serverClosed:!server?.httpServer?.listening}};
await writeFile(resolve(out,'component03.result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));if(error)process.exitCode=1;
