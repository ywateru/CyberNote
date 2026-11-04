import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import ts from "typescript";
const modules = new Map();
async function compiled(name) {
  if (modules.has(name)) return modules.get(name);
  let source = ts.transpileModule(await readFile(`src/${name}.ts`, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  for (const match of [...source.matchAll(/from ["']\.\/([^"']+)["']/g)])
    source = source.replace(match[0], `from '${await compiled(match[1])}'`);
  const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  modules.set(name, url);
  return url;
}

const {parseSmartQuery,matchesSmart}=await import(await compiled('smart-folders'));
const corpus=JSON.parse(await readFile('docs/fixtures/smart-projection09.json','utf8'));
const shared=corpus.cases.filter(c=>c.name.startsWith('mixed-'));
assert.equal(shared.length,2);
assert.deepEqual(shared[0].query.rules,shared[1].query.rules);
assert.deepEqual(shared.map(c=>c.query.combine),['all','any']);
for(const combine of [['all'],['any']])assert.ok(corpus.invalid.some(q=>JSON.stringify(q.combine)===JSON.stringify(combine)));
const rules=shared[0].query.rules, results=[];
for(const [tags,pinned] of [[[],true],[['A'],false],[['A'],true],[[],false]]) {
 for(const combine of ['all','any']) {
  const query=parseSmartQuery({version:1,combine,rules});
  const actual=matchesSmart(query,{eligible:true,tags,pinned});
  const expected=combine==='all'?(tags.length>0&&pinned):(tags.length>0||pinned);
  results.push({combine,tags,pinned,actual,expected});assert.equal(actual,expected);
 }
}
await writeFile(process.argv[2],JSON.stringify({sharedInvalidArrays:true,sameRuleAllAny:true,results},null,2)+'\n');
console.log('8 focused mixed-facts all/any values match the closed primitive combination contract.');
