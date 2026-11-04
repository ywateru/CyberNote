import {build} from 'vite';import react from '@vitejs/plugin-react';import {readFile,writeFile,mkdir} from 'node:fs/promises';import{resolve}from'node:path';
const dir=resolve('docs/verification/mac-ordinary-name-focus26'),phase=process.argv[2];
const result=await build({configFile:false,define:{'process.env.NODE_ENV':JSON.stringify('production')},cacheDir:resolve(dir,'vite-cache'),plugins:[react()],logLevel:'error',build:{write:false,minify:false,copyPublicDir:false,lib:{entry:resolve(dir,'harness-entry.tsx'),name:'Focus26',formats:['iife']},rollupOptions:{output:{inlineDynamicImports:true}}}});
const js=(Array.isArray(result)?result[0]:result).output.find(x=>x.type==='chunk').code;
const baseline=await readFile(resolve(dir,'baseline-smart-folders.css'),'utf8');
const base=await readFile('src/style.css','utf8'),css=await readFile(phase==='baseline'?resolve(dir,'baseline-smart-folders.css'):'src/smart-folders.css','utf8');
await writeFile(resolve(dir,phase+'.html'),'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>'+base+'\n'+css+'</style><div id="root"></div><script>window.baselineCss='+JSON.stringify(base+'\n'+baseline)+';window.candidateCss='+JSON.stringify(base+'\n'+css)+';window.fixtureErrors=[];window.onerror=(m)=>{window.fixtureErrors.push(String(m))};</script><script>'+js.replaceAll('</script','<\\/script')+'</script></html>');
console.log(JSON.stringify({phase,bytes:js.length,actualComponent:true,fullCss:true}));
