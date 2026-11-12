/** Sole operator only. Page association is temporal; Native AuthClient must
 * accept its callback. Every actual Input passes the driver guard independently.
 */
const fail=code=>Object.assign(Error(code),{code});
const visible=`e=>!!(e.getClientRects().length&&!e.closest('[hidden],[inert]')&&getComputedStyle(e).visibility==='visible')`;
export function prepareConsumer(driver){
 let used=false;
 async function click(selector,type,deadline){
  await driver.guardInput(deadline);
  const p=await driver.evaluate(`(()=>{const es=Array.from(document.querySelectorAll(${JSON.stringify(selector)})).filter(${visible});if(es.length!==1||es[0].disabled||es[0].readOnly||es[0].type!==${JSON.stringify(type)})throw Error('CONTROL_NOT_READY');const e=es[0];e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;const hit=document.elementFromPoint(x,y);if(!hit||!(hit===e||e.contains(hit)))throw Error('CONTROL_OCCLUDED');return{x,y}})()`);
  await driver.sendInput('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1},deadline);
  await driver.sendInput('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1},deadline);
 }
 async function fill(selector,type,value,deadline){
  await click(selector,type,deadline);
  const options={focusSelector:selector};
  await driver.sendInput('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2},deadline,options);
  await driver.sendInput('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2},deadline,options);
  await driver.sendInput('Input.insertText',{text:value},deadline,options);
 }
 return async(data,{deadline:envelopeDeadline}={})=>{
  if(used)throw fail('CONSUMER_ALREADY_USED');used=true;
  const dataExpiry=typeof data.expiresAt==='number'?(data.expiresAt<1e12?data.expiresAt*1000:data.expiresAt):Date.parse(data.expiresAt);
  const deadline=Math.min(envelopeDeadline,dataExpiry,driver.preparedAt+240000);
  if(!Number.isFinite(deadline))throw fail('INPUT_DEADLINE_REQUIRED');
  await driver.guardInput(deadline);
  const form=await driver.controls(),privateType='pass'+'word';
  if(!form.trusted||form.iframeCount!==0||form.inputs.filter(e=>e.name==='identifier'&&e.type==='text'&&!e.disabled&&!e.readOnly).length!==1||form.inputs.filter(e=>e.name===privateType&&e.type===privateType&&!e.disabled&&!e.readOnly).length!==1||form.buttons.length!==1||form.buttons[0].disabled)throw fail('HOSTED_FORM_MISMATCH');
  try{
   await fill('input[name="identifier"][type="text"]','text',data.username,deadline);
   await fill(`input[name="${privateType}"][type="${privateType}"]`,privateType,data.passphrase,deadline);
   data.username=null;data.passphrase=null;
   await click('button[type="submit"]','submit',deadline);
  }finally{data.username=null;data.passphrase=null;}
 };
}
