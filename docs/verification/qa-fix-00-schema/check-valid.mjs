import { getSchema } from '@tiptap/core';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const out=fileURLToPath(new URL('./',import.meta.url));
const root=resolve(out,'../../..');
// pnpm test:schema transpiles the committed production factory at this path.
const {createEditorExtensions}=await import(pathToFileURL(resolve(root,'artifacts/editor-schema/editor-schema.mjs')));
const schema=getSchema(createEditorExtensions({attachment:()=>{},drawing:()=>{}}));
const results=[];
for(const name of (await readdir(resolve(out,'valid-fixtures'))).filter(x=>x.endsWith('.notesbackup')).sort()){
  const v=JSON.parse(await readFile(resolve(out,'valid-fixtures',name),'utf8'));
  const node=schema.nodeFromJSON(v.notes[0].document);
  node.check();
  results.push({fixture:name,schemaAccepted:true,normalizedDocument:node.toJSON()});
}
assert.equal(results.length,5);
await writeFile(resolve(out,'valid-schema-result.json'),JSON.stringify(results,null,2)+'\n');
console.log(`Actual production editor factory accepted ${results.length} independent default/mark/custom-node documents.`);
