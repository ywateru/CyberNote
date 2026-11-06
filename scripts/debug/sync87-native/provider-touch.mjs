/** Normal CDP touch for two fixed visible provider controls on the owned final02 note. */
import assert from 'node:assert/strict';
export const providerStages=Object.freeze(['menu-read','attachment-read','attachment-start','attachment-end','menu-wait','file-read','file-start','file-end']);
const imageActions=Object.freeze(['open','info','save','close']);
export const imageStages=Object.freeze(imageActions.flatMap(action=>['read','start','end'].map(stage=>'image-'+action+'-'+stage)));

async function touch(client, control, checkpoint, mouse) {
  assert(['attachment','file',...imageActions.map(action=>'image-'+action)].includes(control));
  checkpoint(control+'-read');
  const point = await client.read(`(()=>{
    if(!document.querySelector('.mobile.page-editor')||document.querySelector('.tiptap h1')?.textContent!=='SYNC87-74da049123-1')throw Error('owned editor required');
    const control=${JSON.stringify(control)};
    if(control.startsWith('image-')&&control!=='image-open'&&document.querySelectorAll('.image-preview[data-preview-id="0f515289-764d-460e-90ca-95637ebc3676"]').length!==1)throw Error('owned image preview required');
    const selector={attachment:'button[aria-label="添加附件"]',file:'.menu-media[role="menu"] button','image-open':'button.image-open[aria-label="预览图片 sync87-74da049123.png"]','image-info':'.image-preview[data-preview-id="0f515289-764d-460e-90ca-95637ebc3676"] [aria-label="图片信息"]','image-save':'.image-preview[data-preview-id="0f515289-764d-460e-90ca-95637ebc3676"] .save-image','image-close':'.image-preview[data-preview-id="0f515289-764d-460e-90ca-95637ebc3676"] [aria-label="关闭图片预览"]'}[control];
    const found=[...document.querySelectorAll(selector)].filter(e=>{
      const r=e.getBoundingClientRect(),s=getComputedStyle(e);
      return !e.disabled&&s.visibility==='visible'&&s.display!=='none'&&r.width>0&&r.height>0&&(control!=='file'||e.textContent.trim()==='附加文件');
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
  checkpoint(control+'-start');
  if(mouse)await client.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
  else await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  checkpoint(control+'-end');
  if(mouse)await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});
  else await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}

async function openProvider(client,mouse) {
  let stage='menu-read';const checkpoint=value=>{assert(providerStages.includes(value));stage=value;};
  try {
    const menu=await client.read('!!document.querySelector(".menu-media[role=menu]")');
    assert(typeof menu==='boolean');
    if(!menu)await touch(client,'attachment',checkpoint,mouse);
    checkpoint('menu-wait');
    await client.wait('!!document.querySelector(".menu-media[role=menu]")','fixed attachment menu');
    await touch(client,'file',checkpoint,mouse);
    return mouse?{normalMouse:true}:{normalTouch:true};
  } catch { const error=Error('owned provider touch refused');Object.defineProperty(error,'stage',{value:stage,enumerable:true});throw error; }
}
export const openOwnedProvider=client=>openProvider(client,false);
export const openOwnedProviderMouse=client=>openProvider(client,true);
export async function ownedImageControl(client,action){
  let stage='image-control';
  try{
    assert(imageActions.includes(action));
    await touch(client,'image-'+action,value=>{assert(imageStages.includes(value));stage=value;},true);
    return {normalMouse:true,control:action};
  }catch{const error=Error('owned image control refused');Object.defineProperty(error,'stage',{value:stage,enumerable:true});throw error;}
}
