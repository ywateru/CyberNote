import{build}from'vite';import react from'@vitejs/plugin-react';import{readFile,writeFile}from'node:fs/promises';import{resolve}from'node:path';
const dir=resolve('docs/verification/mac-ordinary-typography31'),phase=process.argv[2]||'baseline';
const result=await build({configFile:false,define:{'process.env.NODE_ENV':JSON.stringify('production')},cacheDir:resolve(dir,'temporary/vite-cache'),plugins:[react()],logLevel:'error',build:{write:false,minify:false,copyPublicDir:false,lib:{entry:resolve(dir,'harness-entry.tsx'),name:'Typography31',formats:['iife']},rollupOptions:{output:{inlineDynamicImports:true}}}});
const js=(Array.isArray(result)?result[0]:result).output.find(x=>x.type==='chunk').code;
const globalCss=await readFile('src/style.css','utf8'),baselineCss=globalCss+'\n'+await readFile(resolve(dir,'baseline-smart-folders.css'),'utf8'),candidateCss=globalCss+'\n'+await readFile('src/smart-folders.css','utf8');
const content=phase==='baseline'?baselineCss:candidateCss;
await writeFile(resolve(dir,phase+'.html'),'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>'+content+'</style><div id="root"></div><script>window.baselineCss='+JSON.stringify(baselineCss)+';window.candidateCss='+JSON.stringify(candidateCss)+';window.fixtureErrors=[];window.onerror=(m)=>window.fixtureErrors.push(String(m));</script><script>'+js.replaceAll('</script','<\\/script')+'</script></html>');
console.log(JSON.stringify({phase,bytes:js.length,actualProductionComponent:true,fullProductionCss:true}));
