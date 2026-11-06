import assert from 'node:assert/strict';
import { chooseTarget,parseNodes } from './client.mjs';
const good={id:'ABCD-123',type:'page',url:'http://tauri.localhost/',webSocketDebuggerUrl:'ws://127.0.0.1:19400/devtools/page/ABCD-123'};
assert.deepEqual(chooseTarget([good],19400),good);
for(const list of [[],[good,good],[{...good,url:'http://elsewhere/'}],[{...good,webSocketDebuggerUrl:'ws://evil:19400/devtools/page/ABCD-123'}],[{...good,webSocketDebuggerUrl:'ws://localhost:19401/devtools/page/ABCD-123'}],[{...good,webSocketDebuggerUrl:'ws://localhost:19400/devtools/page/OTHER'}],[{...good,webSocketDebuggerUrl:'ws://localhost:19400/devtools/page/ABCD-123?secret=1'}]])assert.throws(()=>chooseTarget(list,19400));
const nodes=parseNodes('<hierarchy><node text="A &amp; B" resource-id="id" class="android.widget.TextView" package="com.android.documentsui" bounds="[0,20][100,70]" clickable="true" /></hierarchy>');
assert.equal(nodes.length,1);assert.equal(nodes[0].text,'A & B');assert.deepEqual(nodes[0].rect,{x:0,y:20,width:100,height:50});
console.log(JSON.stringify({passed:10,scope:'host-only CDP target identity and native XML parser; no ADB or emulator'}));
