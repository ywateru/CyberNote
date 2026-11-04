import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const out='docs/verification/mobile-folder-visual28-independent',author='docs/verification/mobile-folder-visual28';
const read=p=>readFile(p,'utf8'),sha=s=>createHash('sha256').update(s).digest('hex');
const checks=[];const check=(name,value)=>checks.push({name,pass:!!value});
const baseline=await read(author+'/baseline-App.tsx'),current=await read('src/App.tsx'),style=await read('src/style.css'),baseStyle=await read(author+'/baseline-style.css');
let expected=baseline.replace('import { SmartFolderForm, type FolderFormHandle } from "./SmartFolderForm";','import { SmartFolderForm, type FolderFormHandle } from "./SmartFolderForm";\nimport {\n  MobileQuickFolderIcon,\n  MobileClosedFolderIcon,\n  MobileAddFolderIcon,\n} from "./MobileFolderIcons";')
 .replace('className={`folder-row ${tagFilter === undefined && folderId === f.id ? "selected" : ""}`}','className={`folder-row ${mobile && f.kind === "quick" ? "mobile-quick-folder-row" : ""} ${tagFilter === undefined && folderId === f.id ? "selected" : ""}`}')
 .replace('          <StickyNote />','          mobile ? <MobileQuickFolderIcon /> : <StickyNote />')
 .replace('        ) : f.kind === "trash" ? (\n          <Trash2 />\n        ) : (','        ) : f.kind === "trash" ? (\n          <Trash2 />\n        ) : mobile ? (\n          <MobileClosedFolderIcon />\n        ) : (')
 .replace('            <FolderPlus size={21} />','            {mobile ? <MobileAddFolderIcon /> : <FolderPlus size={21} />}');
check('App has only declared import/class/mobile icon changes',current===expected);
expected=baseStyle.replace('  .mobile-folder-search,\n  .mobile-list-search {','  .mobile.page-folders .folder-large-title {\n    font-size: 31.5px;\n  }\n  .mobile.page-folders .mobile-quick-folder-row > svg:first-child {\n    margin-right: 7px;\n  }\n  .mobile-folder-search,\n  .mobile-list-search {');
check('CSS only two page-folders declarations inside existing mobile media',style===expected);
for(const [path,expected] of [['src/App.tsx','d7b20f13b2ee076ab2708c0e837be60f8b2387a2bdeccc6d2fa8ae9e06526911'],['src/style.css','df752ab5f04beb94372b25349a78e027028818eb6c4d75b25c77f46634916008'],['src/MobileFolderIcons.tsx','bcfb1e37dc95761342ec3c4669c3444a432c7236c90ea239160f5b9d4283395f'],['src/smart-folders.css','cdbfde60942488be5e9b4002924162d4d21850a1d71fc352176e86cb122a160c']])check('exact '+path,sha(await read(path))===expected);
function events(source){const file=ts.createSourceFile('App.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),found={};function visit(n){if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&['folderRow','startLong','stopLong'].includes(n.name.text)){if(n.name.text!=='folderRow')found[n.name.text]=n.initializer.getText(file);else{function attr(x){if(ts.isJsxAttribute(x)&&['onClick','onContextMenu','onTouchStart','onTouchEnd','onTouchMove'].includes(x.name.getText(file)))found[x.name.getText(file)]=x.initializer.getText(file);ts.forEachChild(x,attr)}attr(n.initializer)}}ts.forEachChild(n,visit)}visit(file);return found}
const before=events(baseline),after=events(current),eventChecks=Object.keys(before).sort().map(name=>({name,unchanged:before[name]===after[name],sha256:sha(before[name])}));
check('independent AST all seven event bodies preserved',eventChecks.length===7&&eventChecks.every(x=>x.unchanged));
check('long press timeout remains520ms',after.startLong.includes('setTimeout(callback, 520)'));
const icons=await read('src/MobileFolderIcons.tsx'),ast=ts.createSourceFile('MobileFolderIcons.tsx',icons,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let svgCount=0,bad=[];
function iconVisit(n){if(ts.isJsxOpeningElement(n)||ts.isJsxSelfClosingElement(n)){const tag=n.tagName.getText(ast);if(tag==='svg'){svgCount++;for(const [k,v] of [['stroke','currentColor'],['aria-hidden','true'],['focusable','false'],['pointerEvents','none']]){const attr=n.attributes.properties.find(x=>ts.isJsxAttribute(x)&&x.name.getText(ast)===k);if(!attr||attr.initializer?.text!==v)bad.push(k)}}if(!['svg','rect','path','circle'].includes(tag))bad.push(tag);for(const p of n.attributes.properties)if(ts.isJsxAttribute(p)&&/^(on|href|xlinkHref|dangerously)/.test(p.name.getText(ast)))bad.push(p.name.getText(ast))}ts.forEachChild(n,iconVisit)}iconVisit(ast);
check('three local decorative SVG trees without own events or external refs',svgCount===3&&bad.length===0&&!ast.statements.some(ts.isImportDeclaration));
const a=JSON.parse(await read(author+'/baseline-attempt06/result.json')),b=JSON.parse(await read(author+'/candidate-attempt03/result.json'));check('author seven-class actual App records bounded pass',[a,b].every(x=>x.status==='pass'&&x.checks.length===7&&x.errors.length===0&&x.externalRequests.length===0));
const ar=a.snapshots.mobile,br=b.snapshots.mobile,eq=(x,y)=>JSON.stringify(x)===JSON.stringify(y);
check('title41px row/search/footer and footer button rectangles preserved',ar.title.rect.height===41&&br.title.rect.height===41&&['title','search','footer'].every(k=>eq(ar[k].rect,br[k].rect))&&eq(ar.buttons.map(x=>x.rect),br.buttons.map(x=>x.rect)));
check('only quick text slot moves; rows/counts/chevrons remain',eq(ar.rows.map(r=>r.rect),br.rows.map(r=>r.rect))&&eq(ar.rows.slice(1).map(r=>r.children[1].rect),br.rows.slice(1).map(r=>r.children[1].rect))&&eq(ar.rows.map(r=>r.children.slice(2).map(x=>x.rect)),br.rows.map(r=>r.children.slice(2).map(x=>x.rect))));
const result=JSON.parse(await read(out+'/app-result.json'));check('five fresh bounded checks pass',result.status==='pass'&&result.checks.length===5&&result.checks.every(x=>x.pass));
const h=result.footerHit;const blocker={severity:'P2',blocking:true,name:'Painted add-folder plus is outside production button hit region',confirmed:!h.plusCenterWithinButton&&!h.plusCenterResolvesToButton&&!h.plusCenterClickOpensDialog,record:h};
check('dead plus reproduced by coordinate click and hit-test',blocker.confirmed);
await writeFile(out+'/static-checks.json',JSON.stringify({checks,failed:checks.filter(x=>!x.pass).length,eventChecks,blocker},null,2)+'\n');
console.log(JSON.stringify({checks:checks.length,failed:checks.filter(x=>!x.pass),blocker},null,2));
