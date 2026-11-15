import {mkdir,writeFile} from 'node:fs/promises';
const output=new URL('../.vercel-static/',import.meta.url);
await mkdir(output,{recursive:true});
await writeFile(new URL('robots.txt',output),'User-agent: *\nAllow: /\n');
