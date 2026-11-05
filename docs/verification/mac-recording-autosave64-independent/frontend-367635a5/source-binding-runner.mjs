import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import cp from 'node:child_process';
import ts from 'typescript';
const root=process.cwd();
const git=(...args)=>cp.execFileSync('git',args,{encoding:'utf8'}).trim();
const show=(ref,path)=>cp.execFileSync('git',['show',`${ref}:${path}`],{encoding:'utf8'});
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const head=git('rev-parse','HEAD');
assert.equal(head,'367635a54d781752e8b03051b52ee767c40d7822');
const base='58fe1110eb3316558f83da9ec939f18b56688977';
const previous='8b77a62c47e76fc5c2c52cd18986101fec9f0b7a';
const parse=text=>ts.createSourceFile('source.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const find=(text,predicate)=>{let found=[];const ast=parse(text);const visit=n=>{if(predicate(n))found.push(n);ts.forEachChild(n,visit)};visit(ast);assert.equal(found.length,1);return found[0]};
const fn=(text,name)=>find(text,n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
const variable=(text,name)=>find(text,n=>ts.isVariableDeclaration(n)&&n.name.getText()===name).initializer.getText();
const priorApp=show(base,'src/App.tsx'),app=fs.readFileSync('src/App.tsx','utf8');
const priorPanel=show(base,'src/RecordingPanel.tsx'),panel=fs.readFileSync('src/RecordingPanel.tsx','utf8');
const a=fn(priorPanel,'RecordingPanel'),b=fn(panel,'MobileRecordingPanel');
const mobile={
 panelBodyUnchanged:a.body.getText()===b.body.getText(),
 panelParametersUnchanged:a.parameters.map(n=>n.getText()).join('\n')===b.parameters.map(n=>n.getText()).join('\n'),
 submitRecordingUnchanged:variable(priorApp,'submitRecording')===variable(app,'submitRecording'),
 validatePickerTargetUnchanged:variable(priorApp,'validatePickerTarget')===variable(app,'validatePickerTarget'),
 appRecordingPanelJsxUnchanged:find(priorApp,n=>ts.isJsxSelfClosingElement(n)&&n.tagName.getText()==='RecordingPanel').getText()===find(app,n=>ts.isJsxSelfClosingElement(n)&&n.tagName.getText()==='RecordingPanel').getText(),
 recordingSessionOnlyExportVisibilityChanged:show(base,'src/recording-session.ts').replace('type RecordingCallbacks =','export type RecordingCallbacks =').replace('const browserEnvironment:','export const browserEnvironment:')===fs.readFileSync('src/recording-session.ts','utf8'),
};
Object.values(mobile).forEach(x=>assert.equal(x,true));
const fixture=fs.readFileSync('scripts/check-recording-submit.mjs','utf8');
const fixtureLimitation={
 baselineUsesEditorCommit:priorApp.includes('await waitRecordingEditorCommit(controller.signal)'),
 currentUsesEditorCommit:app.includes('await waitRecordingEditorCommit(controller.signal)'),
 oldFixtureDoesNotInjectOrMentionDependency:!fixture.includes('waitRecordingEditorCommit'),
 baselineAppSha256:hash(priorApp),currentAppSha256:hash(app),fixtureSha256:hash(fixture),
 claim:'The pre-existing picker dependency is absent from the old extraction host. This static evidence explains its missing-name failure; no claim that the entire old generic picker suite passes.'
};
assert(fixtureLimitation.baselineUsesEditorCommit&&fixtureLimitation.currentUsesEditorCommit&&fixtureLimitation.oldFixtureDoesNotInjectOrMentionDependency);
const backendSource=JSON.parse(fs.readFileSync('docs/verification/mac-recording-autosave64-independent/backend-base58fe1110-attempt01/source-copy-verification.json'));
const backend=Object.entries(backendSource.copiedSources).map(([path,expected])=>({path,expectedSha256:expected,currentSha256:hash(fs.readFileSync(path))}));
backend.forEach(x=>assert.equal(x.expectedSha256,x.currentSha256));
const browserPaths=git('ls-tree','-r','--name-only',head,'src').split('\n');
browserPaths.push('package.json','pnpm-lock.yaml','tsconfig.json','vite.config.ts');
const browser=browserPaths.map(path=>({path,previousSha256:hash(show(previous,path)),currentSha256:hash(fs.readFileSync(path))}));
const changed=browser.filter(x=>x.previousSha256!==x.currentSha256);
assert.deepEqual(changed.map(x=>x.path),['src/desktop-recording-session.ts']);
const diff=git('diff',previous,head,'--','src/desktop-recording-session.ts');
assert(diff.includes('void this.seal().catch(() => {});'));
const boundary=JSON.parse(fs.readFileSync('docs/verification/mac-recording-autosave64-independent/frontend-367635a5/boundaries-attempt02/result.json'));
assert(boundary.checks.some(x=>x.startsWith('analyser read failure seals recorder')));
assert.equal(git('rev-parse','HEAD'),head);
const result={startingHead:head,endingHead:head,base,backend:{source:backendSource.baseSource,all20ByteIdentical:true,files:backend},browserReuse:{previousHead:previous,sourceFilesChecked:browser.length,changed,unchangedInputs:browser.filter(x=>x.previousSha256===x.currentSha256),exactProductDiff:diff,errorPathIndependentlyCoveredOnFinalHead:true,claim:'Reuse the frozen 8b77 successful normal-media browser run. Final 367 differs only by analyser-error sealing, covered by final frozen controlled-boundary test.'},mobile,fixtureLimitation};
fs.writeFileSync('docs/verification/mac-recording-autosave64-independent/frontend-367635a5/source-binding.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({head,backendIdentical:backend.length,browserInputs:browser.length,mobile,fixtureLimitation}));
