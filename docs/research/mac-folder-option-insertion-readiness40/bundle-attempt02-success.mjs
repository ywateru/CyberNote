import {build} from '../../../node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild/lib/main.js';
import fs from 'node:fs';
import path from 'node:path';
const out=path.dirname(new URL(import.meta.url).pathname);
const r=await build({entryPoints:[path.join(out,'fixture.jsx')],bundle:true,write:false,format:'iife',platform:'browser',metafile:true,define:{'process.env.NODE_ENV':'"development"'}});
fs.writeFileSync(path.join(out,'fixture.bundle.js'),r.outputFiles[0].contents,{flag:'wx'});
fs.writeFileSync(path.join(out,'bundle-metafile.json'),JSON.stringify(r.metafile,null,2)+'\n',{flag:'wx'});
fs.writeFileSync(path.join(out,'fixture.html'),'<!doctype html><meta charset="utf-8"><div id="root"></div><script src="fixture.bundle.js"></script>',{flag:'wx'});
console.log(JSON.stringify({outputBytes:r.outputFiles[0].contents.length,inputCount:Object.keys(r.metafile.inputs).length}));
