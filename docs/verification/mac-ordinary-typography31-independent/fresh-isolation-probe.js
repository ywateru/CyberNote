await document.fonts.ready;
const wait=()=>new Promise(r=>setTimeout(r,60));await wait();
const sheet=document.querySelector('style');
const full=()=>[...document.querySelectorAll('.smart-form,.smart-form *')].map(e=>{
 const r=e.getBoundingClientRect();
 return {tag:e.tagName,rect:[r.x,r.y,r.width,r.height],computed:Object.fromEntries([...getComputedStyle(e)].map(k=>[k,getComputedStyle(e).getPropertyValue(k)])),selection:{color:getComputedStyle(e,'::selection').color,background:getComputedStyle(e,'::selection').backgroundColor}};
});
const checks=[],check=(name,pass,detail)=>checks.push({name,pass:!!pass,detail});
const outside=[];
for(const option of [{dark:true},{mobile:true},{mobile:true,dark:true},{folder:{id:'independent31',kind:'smart',parentId:null,name:'独立审查',sortOrder:0,createdAt:1,definitionRevision:1,query:{version:1,combine:'all',rules:[{type:'pinned',value:true}]}}}]){
 window.mount(option);await wait();sheet.textContent=window.baselineCss;const b=full();sheet.textContent=window.candidateCss;const c=full();
 outside.push({option,nodes:c.length,baseline:b,candidate:c});
 check('outside ordinary-light full styles '+JSON.stringify(option),JSON.stringify(b)===JSON.stringify(c));
 if(option.dark&&!option.mobile){const input=document.querySelector('.smart-name input'),s=getComputedStyle(input);check('dark actual html scope and contrast',document.documentElement.classList.contains('dark')&&s.webkitFontSmoothing==='antialiased'&&s.color!==s.backgroundColor,{color:s.color,surface:s.backgroundColor,smoothing:s.webkitFontSmoothing});}
}
window.mount();await wait();
let input=document.querySelector('.smart-name input');
check('new ordinary real input selected',input instanceof HTMLInputElement&&document.activeElement===input&&input.selectionStart===0&&input.selectionEnd===input.value.length);
input.setSelectionRange(0,2);input.setRangeText('独审');input.dispatchEvent(new Event('input',{bubbles:true}));await wait();
check('actual input replacement persists',document.querySelector('.smart-name input').value==='独审文件夹');
document.querySelector('.smart-make input').click();await wait();
check('ordinary to smart preserves edited name',!document.querySelector('.smart-ordinary')&&document.querySelector('.smart-name input').value==='独审文件夹');
sheet.textContent=window.baselineCss;const smartBaseline=full();sheet.textContent=window.candidateCss;const smartCandidate=full();
check('smart creation full styles and selection isolated',JSON.stringify(smartBaseline)===JSON.stringify(smartCandidate));
document.querySelector('.smart-make input').click();await wait();
check('smart to ordinary preserves edited name',!!document.querySelector('.smart-ordinary')&&document.querySelector('.smart-name input').value==='独审文件夹');
window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await wait();
check('Escape fixture callback once without save',window.events.cancels===1&&window.events.saves.length===0,{events:window.events,fixtureKeepsMounted:!!document.querySelector('.smart-form')});
return {scope:'Independent finite real DOM checks only; synthetic events and count-only cancellation, not native OS input/unmount',checks,pass:checks.every(x=>x.pass),outside,smartBaseline,smartCandidate,errors:window.fixtureErrors,requests:performance.getEntriesByType('resource').map(e=>e.name),documentFocus:document.hasFocus()};
