/** Only normal DOM Input and actual DocumentsUI. No native mutation IPC. */
import assert from 'node:assert/strict';
import { basename,resolve } from 'node:path';
import { guard,parseNodes,nativeNode,pause } from './client.mjs';
const provider=n=>['com.google.android.documentsui','com.android.documentsui'].includes(n.package);
export function exportPlan(state,output,index,file) {
  assert(/^[0-9a-f]{10}$/.test(state.runId));assert.equal(state.remote,'/sdcard/Download/notes-sync87-'+state.runId);
  assert(Number.isInteger(index)&&index>=1&&index<=20);
  assert([...state.files,...(state.desktopFiles||[])].some(f=>f.name===file.name&&f.sha256===file.sha256));
  assert(/^sync87-(?:desktop-)?[0-9a-f]{10}\.(png|txt|wav)$/.test(file.name));
  const folder='exports-'+index;
  return {statePath:resolve(output,'state.json'),index,name:file.name,remoteDirectory:state.remote+'/'+folder,remote:state.remote+'/'+folder+'/'+file.name,path:resolve(output,folder,file.name)};
}
export async function goHome(client) {
  if(await client.read('!!document.querySelector(".preferences")'))await client.tap('button[aria-label="关闭设置"]');
  if(await client.read('!!document.querySelector(".image-preview")'))await client.tap('button[aria-label="关闭图片预览"]');
  if(await client.read('!!document.querySelector(".mobile.page-editor")'))await client.tap('button[aria-label="返回笔记"]');
  await client.wait('!!document.querySelector(".mobile.page-notes .mobile-gallery")','home navigation');
}
export async function openNote(client,id) {
  assert(/^[0-9a-f-]{36}$/.test(id));await goHome(client);
  await client.tap('button.note-row[data-note-id="'+id+'"]');
  await client.wait('!!document.querySelector(".mobile.page-editor .tiptap")','actual mobile note');
}
async function enterRunDirectory(state,leaf) {
  const nodes=parseNodes(await guard('uia'));assert(nodes.some(provider),'actual DocumentsUI required');
  await nativeNode(n=>provider(n)&&/^(Show roots|显示根目录|显示侧栏|打开导航抽屉)$/.test(n['content-desc']||''));
  await nativeNode(n=>provider(n)&&/^(Downloads|下载内容|下载)$/.test(n.text||'')&&n['resource-id']?.endsWith('/title'));
  await nativeNode(n=>provider(n)&&n.text===basename(state.remote));
  if(leaf)await nativeNode(n=>provider(n)&&n.text===leaf);
}
export async function saveImageOriginal(client,state,output,index,file) {
  const plan=exportPlan(state,output,index,file);
  const prepared=await guard('prepare-export',{'run-state':plan.statePath,'export-index':index,name:file.name});
  assert.equal(prepared.remoteDirectory,plan.remoteDirectory);
  await client.tap('button.image-open[aria-label="预览图片 '+file.name+'"]');
  await client.wait('!!document.querySelector(".image-preview")','image preview');
  await client.tap('.image-preview [aria-label="图片信息"]');await client.snapshot(output,'image-info-'+index);
  await client.tap('.image-preview .save-image');await enterRunDirectory(state,'exports-'+index);
  const native=parseNodes(await guard('uia'));
  const names=native.filter(n=>provider(n)&&n.class==='android.widget.EditText'&&n.text===file.name);
  assert.equal(names.length,1,'system filename must equal the known original; no renaming workaround');
  await nativeNode(n=>provider(n)&&(n['resource-id']?.endsWith('/action_menu_select')||/^(SAVE|Save|保存)$/.test(n.text||'')));
  await client.wait('document.querySelector(".image-preview")?.innerText.includes("图片已保存")','native original export acknowledgement');
  const pulled=await guard('pull',{'run-state':plan.statePath,'export-index':index,name:file.name,remote:plan.remote,path:plan.path});
  assert.equal(pulled.sha256,file.sha256);assert.equal(pulled.bytes,file.bytes);assert.equal(pulled.originalBytesVerified,true);
  await client.tap('button[aria-label="关闭图片预览"]');
  return {name:file.name,index,bytes:pulled.bytes,sha256:pulled.sha256,originalBytesVerified:true,path:pulled.path};
}
export async function pairViaUI(client,invitation) {
  assert(typeof invitation==='string'&&invitation.length>0&&invitation.length<=16384);
  await goHome(client);await client.tap('button[aria-label="设置"]');await client.tap('#preferences-tab-data');
  await client.fill('input[aria-label="同步设备名称"]','SYNC87 Android');
  await client.tap('.sync-settings button','加入同步');
  await client.fill('input[aria-label="粘贴完整配对串"]',invitation);await client.tap('.sync-settings button','连接并加入');
  await client.wait('!!document.querySelector(".sync-peer")&&!document.querySelector(".sync-pair")','native UI pair',40000);
  await client.tap('button[aria-label="关闭设置"]');
}
export async function eventually(predicate,label,timeout=40000) {
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){const result=await predicate();if(result)return result;await pause(200);}
  throw Error('timed out: '+label);
}
