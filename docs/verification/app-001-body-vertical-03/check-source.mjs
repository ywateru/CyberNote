import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const sha = value => createHash('sha256').update(value).digest('hex');
const baseline = '8463ed896847f891fd4fd5579affb253a11d681b';
const gitFile = path => execFileSync('git',['show',baseline+':'+path]);
const css = await readFile('src/style.css','utf8');
const addition = `/* Vertical candidate only while every direct editor element is a paragraph. */
.desktop.native-toolbar:not(.separate) .note-document .tiptap:has(> p):not(:has(> :not(p))) {
  padding-top: 2px;
}
.desktop.native-toolbar:not(.separate) .note-document .tiptap:has(> p):not(:has(> :not(p))) > p {
  line-height: 17px;
  min-height: 17px;
}
`;
assert.equal(css.split(addition).length,2);
assert.equal(css.replace(addition,''),gitFile('src/style.css').toString());
const productDiffPaths=execFileSync('git',['diff','--name-only',baseline,'--','src','src-tauri','package.json','pnpm-lock.yaml'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
assert.deepEqual(productDiffPaths,['src/style.css']);
const unchanged=[];
for(const path of ['src/App.tsx','src/editor-schema.ts','package.json','pnpm-lock.yaml']) {
 const current=await readFile(path); assert(current.equals(gitFile(path)),path+' must be unchanged');
 unchanged.push({path,sha256:sha(current)});
}
const original=await readFile('scripts/check-body-typography-browser.mjs','utf8');
const adapted=await readFile('docs/verification/app-001-body-vertical-03/check-body-typography-regression.mjs','utf8');
const expected=original.replace('readFile, mkdir, writeFile','readFile, mkdir, writeFile, mkdtemp').replace('const vite = await createViteServer({','const isolatedCache = await mkdtemp("/private/tmp/notes-body-vertical-03-regression-");\nconst vite = await createViteServer({').replace('cacheDir: resolve("artifacts/body-typography-vite-cache"),','cacheDir: isolatedCache + "/vite-cache",');
assert.equal(adapted,expected);
const result={pass:true,baseline,headAtAudit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),css:{beforeSHA256:sha(gitFile('src/style.css')),afterSHA256:sha(css),onlyTwoRulesAdded:true,addition},productDiffPaths,unchanged,regressionAdaptation:{originalSHA256:sha(original),adaptedSHA256:sha(adapted),onlyChanges:['import mkdtemp','create unique /private/tmp cache directory','use unique cacheDir']}};
await writeFile('docs/verification/app-001-body-vertical-03/source-audit.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
