/** Normal CDP touch for two fixed visible provider controls on the owned final02 note. */
import assert from 'node:assert/strict';
export const providerStages=Object.freeze(['menu-read','attachment-read','attachment-start','attachment-end','menu-wait','file-read','file-start','file-end']);

async function touch(client, control, checkpoint) {
  assert(['attachment','file'].includes(control));
  checkpoint(control+'-read');
  const point = await client.read(`(()=>{
    if(!document.querySelector('.mobile.page-editor')||document.querySelector('.tiptap h1')?.textContent!=='SYNC87-74da049123-1')throw Error('owned editor required');
    const control=${JSON.stringify(control)};
    const found=[...document.querySelectorAll(control==='attachment'?'button[aria-label="添加附件"]':'.menu-media[role="menu"] button')].filter(e=>{
      const r=e.getBoundingClientRect(),s=getComputedStyle(e);
      return !e.disabled&&s.visibility==='visible'&&s.display!=='none'&&r.width>0&&r.height>0&&(control==='attachment'||e.textContent.trim()==='附加文件');
    });
    if(found.length!==1)throw Error('one visible fixed control required');
    const e=found[0],r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
    const hit=document.elementFromPoint(x,y);
    if(!(x>=0&&y>=0&&x<innerWidth&&y<innerHeight&&hit&&(hit===e||e.contains(hit))))throw Error('unobscured viewport control required');
    return {x,y,width:innerWidth,height:innerHeight};
  })()`);
  assert(point&&typeof point==='object'&&!Array.isArray(point));
  const descriptors=Object.getOwnPropertyDescriptors(point);
  assert.deepEqual(Object.keys(descriptors).sort(),['height','width','x','y']);
  assert(Object.values(descriptors).every(d=>Object.hasOwn(d,'value')&&typeof d.value==='number'&&Number.isFinite(d.value)));
  const {x,y,width,height}=Object.fromEntries(Object.entries(descriptors).map(([k,d])=>[k,d.value]));
  assert(width>0&&width<=720&&height>0&&height<=1280&&x>=0&&y>=0&&x<width&&y<height);
  checkpoint(control+'-start');await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  checkpoint(control+'-end');await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}

export async function openOwnedProvider(client) {
  let stage='menu-read';const checkpoint=value=>{assert(providerStages.includes(value));stage=value;};
  try {
    const menu=await client.read('!!document.querySelector(".menu-media[role=menu]")');
    assert(typeof menu==='boolean');
    if(!menu)await touch(client,'attachment',checkpoint);
    checkpoint('menu-wait');
    await client.wait('!!document.querySelector(".menu-media[role=menu]")','fixed attachment menu');
    await touch(client,'file',checkpoint);
    return {normalTouch:true};
  } catch { const error=Error('owned provider touch refused');Object.defineProperty(error,'stage',{value:stage,enumerable:true});throw error; }
}
