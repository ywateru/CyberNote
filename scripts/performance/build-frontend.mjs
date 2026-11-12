#!/usr/bin/env node
// Build in its own process so compiler/module memory is absent from bridge RSS.
import {build} from 'vite';
import react from '@vitejs/plugin-react';
import {writeFile,statfs} from 'node:fs/promises';
import {resolve} from 'node:path';
import {sourceIdentity} from '../build-info.mjs';
const [rootArg,outArg]=process.argv.slice(2);if(!rootArg||!outArg)throw Error('Usage: node scripts/performance/build-frontend.mjs SOURCE OUTPUT');
const root=resolve(rootArg),out=resolve(outArg),s=await statfs(root);if(s.bavail*s.bsize<2.5*1024**3)throw Error('STOP: less than 2.5GiB free');
const source=sourceIdentity(root);
await build({root,configFile:false,plugins:[react()],logLevel:'error',define:{'import.meta.env.DEV':'true','import.meta.env.VITE_NOTES_DEBUG':JSON.stringify('1'),'process.env.NODE_ENV':JSON.stringify('development')},build:{outDir:out,emptyOutDir:true,minify:false,sourcemap:false}});
if(sourceIdentity(root).sourceFingerprint!==source.sourceFingerprint)throw Error('Source changed during frontend build');
await writeFile(resolve(out,'source.json'),JSON.stringify({source,mode:'isolated-static-debug-bundle',note:'Real App; development/debug branches enabled for semantic navigation. No Vite HMR, no simulated attachment bytes.'},null,2)+'\n');
