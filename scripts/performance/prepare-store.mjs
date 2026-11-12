// Clone only the small isolated SQLite state; immutable originals share inodes.
// No user library or native installed application is ever consulted.
import {copyFile,readFile,writeFile,mkdir,link,stat,statfs} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
export async function prepareMeasurementStore(fixture,output) {
 const disk=await statfs(fixture);if(disk.bavail*disk.bsize<2.5*1024**3)throw Error('STOP: less than 2.5GiB free');
 const snapshot=resolve(fixture,'store-baseline.sqlite3'),source=resolve(fixture,'store/notes.sqlite3');
 if(!existsSync(snapshot)){
  if(existsSync(source+'-wal')||existsSync(source+'-shm'))throw Error('Close isolated Store before freezing its SQLite state');
  await copyFile(source,snapshot);await writeFile(resolve(fixture,'store-baseline.json'),JSON.stringify({createdAt:new Date().toISOString(),note:'Quiescent isolated Store metadata snapshot; originals frozen separately by manifest.json. Captured after exploratory runs, before normalized measurement.'},null,2)+'\n');
 }
 const state=await readFile(snapshot),mapping=JSON.parse(await readFile(resolve(fixture,'store-map.json'),'utf8'));
 await mkdir(output,{recursive:false});await copyFile(snapshot,resolve(output,'notes.sqlite3'));
 for(const attachment of mapping.attachments){
  const original=resolve(fixture,attachment.samplePath),relative=attachment.managedPath.slice('store/'.length),target=resolve(output,relative);
  if(!relative.startsWith('attachments/')||!target.startsWith(output+'/attachments/'))throw Error('Invalid isolated attachment path');
  await mkdir(dirname(target),{recursive:true});await link(original,target);
  const [a,b]=await Promise.all([stat(original),stat(target)]);if(a.ino!==b.ino||a.dev!==b.dev||a.size!==attachment.bytes)throw Error('Isolated original hardlink mismatch');
 }
 return {directory:output,sqliteSha256:createHash('sha256').update(state).digest('hex'),attachmentHardlinks:mapping.attachments.length,logicalOriginalBytes:mapping.attachments.reduce((n,x)=>n+x.bytes,0),newOriginalBytes:0};
}
