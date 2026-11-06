import assert from 'node:assert/strict';
import { chooseTarget,parseNodes,nativeWebViewRect } from './client.mjs';
const good={id:'ABCD-123',type:'page',url:'http://tauri.localhost/',webSocketDebuggerUrl:'ws://127.0.0.1:19400/devtools/page/ABCD-123'};
assert.deepEqual(chooseTarget([good],19400),good);
for(const list of [[],[good,good],[{...good,url:'http://elsewhere/'}],[{...good,webSocketDebuggerUrl:'ws://evil:19400/devtools/page/ABCD-123'}],[{...good,webSocketDebuggerUrl:'ws://localhost:19401/devtools/page/ABCD-123'}],[{...good,webSocketDebuggerUrl:'ws://localhost:19400/devtools/page/OTHER'}],[{...good,webSocketDebuggerUrl:'ws://localhost:19400/devtools/page/ABCD-123?secret=1'}]])assert.throws(()=>chooseTarget(list,19400));
const nodes=parseNodes('<hierarchy><node text="A &amp; B" resource-id="id" class="android.widget.TextView" package="com.android.documentsui" bounds="[0,20][100,70]" clickable="true" /></hierarchy>');
assert.equal(nodes.length,1);assert.equal(nodes[0].text,'A & B');assert.deepEqual(nodes[0].rect,{x:0,y:20,width:100,height:50});
console.log(JSON.stringify({passed:10,scope:'host-only CDP target identity and native XML parser; no ADB or emulator'}));

const single=parseNodes('<node class="android.webkit.WebView" package="com.local.notesclone" bounds="[0,48][720,1184]" />');
assert.deepEqual(nativeWebViewRect(single),{x:0,y:48,width:720,height:1136});
const nested=parseNodes('<node class="android.webkit.WebView" package="com.local.notesclone" bounds="[0,48][720,1184]"><node class="android.webkit.WebView" package="com.local.notesclone" bounds="[0,48][720,1184]" /></node>');
assert.deepEqual(nativeWebViewRect(nested),single[0].rect);
for(const xml of ['<node class="android.webkit.WebView" package="other" bounds="[0,48][720,1184]"/>','<node class="android.webkit.WebView" package="com.local.notesclone" bounds="[0,48][720,1184]"/><node class="android.webkit.WebView" package="com.local.notesclone" bounds="[0,48][720,1184]"/>','<node class="android.webkit.WebView" package="com.local.notesclone" bounds="[0,48][720,1184]"><node class="android.webkit.WebView" package="com.local.notesclone" bounds="[0,48][700,1184]"/></node>','<node class="android.webkit.WebView" package="com.local.notesclone" bounds="[0,48][720,1184]"><node><node class="android.webkit.WebView" package="com.local.notesclone" bounds="[0,48][720,1184]"/></node></node>'])assert.throws(()=>nativeWebViewRect(parseNodes(xml)));
assert.throws(()=>parseNodes('<node class="android.webkit.WebView">'));
console.log(JSON.stringify({passed:7,scope:'host-only unique native WebView direct ancestor chain; sibling/foreign/different bounds/intermediate/unbalanced rejected'}));

assert.throws(()=>parseNodes('<node><node class="android.webkit.WebView" package="com.local.notesclone" bounds="[0,48][720,1184]"/>'));
for(const xml of ['<node class="android.webkit.WebView" package="other" bounds="[0,48][720,1184]"><node class="android.webkit.WebView" package="com.local.notesclone" bounds="[0,48][720,1184]"/></node>','<node class="android.webkit.WebView" package="com.local.notesclone" bounds="[0,48][720,1184]"/><node class="android.webkit.WebView" package="other" bounds="[0,48][720,1184]"/>','<node class="android.webkit.WebView" package="com.local.notesclone" bounds="[0,48][720,1184]"/><node class="android.webkit.WebView" package="com.local.notesclone"/>'])assert.throws(()=>nativeWebViewRect(parseNodes(xml)));
console.log(JSON.stringify({passed:4,scope:'independent review counterexamples: unclosed attrless parent and foreign/malformed WebView may not be hidden'}));
