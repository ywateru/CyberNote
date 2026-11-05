import {build} from '../../../node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild/lib/main.js';
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const out=resolve('docs/verification/mac-ordinary-option-insertion42',process.argv[2]);await mkdir(out,{recursive:false});
const r=await build({entryPoints:[resolve('docs/verification/mac-ordinary-option-insertion42/fixture.tsx')],bundle:true,write:false,format:'iife',platform:'browser',metafile:true,jsx:'automatic',outfile:'fixture.js',define:{'process.env.NODE_ENV':'"development"'}});
for(const f of r.outputFiles)await writeFile(resolve(out,f.path.endsWith('.css')?'fixture.css':'fixture.js'),f.contents);
await writeFile(resolve(out,'metafile.json'),JSON.stringify(r.metafile,null,2)+'\n');
await writeFile(resolve(out,'fixture.html'),'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><input id="search" aria-label="外部搜索"><div id="root"></div><script src="fixture.js"></script>');
console.log(JSON.stringify({inputs:Object.keys(r.metafile.inputs).length,outputBytes:r.outputFiles.map(f=>f.contents.length)}));
