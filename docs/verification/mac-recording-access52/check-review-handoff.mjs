import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile('src/recording-session.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {RecordingSession}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
let resolveMedia, stopped=0, recorded=0, errors=0, createRecorder=0;
const pending=new Promise(resolve=>resolveMedia=resolve);
const track={stop(){stopped++},addEventListener(){},removeEventListener(){}};
const session=new RecordingSession({onRecording(){recorded++},onStopped(){},onLevel(){},onError(){errors++}}, {
 getStream:()=>pending,
 createRecorder(){createRecorder++; throw Error('must not start')},
 createContext(){throw Error('must not attach')},setInterval(){return 1},clearInterval(){},
});
const start=session.start();
resolveMedia({getTracks:()=>[track]});
queueMicrotask(()=>session.dispose());
await start;
for(let i=0;i<8;i++) await Promise.resolve();
console.log(JSON.stringify({stopped,recorded,errors,createRecorder}));
assert.equal(stopped,1,'resolved stream must release its track when disposal occurs between cleanup handler and prepare handler');
assert.equal(recorded,0);assert.equal(errors,0);assert.equal(createRecorder,0);
