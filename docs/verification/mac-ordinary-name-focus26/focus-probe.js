await document.fonts.ready;
await new Promise(r=>setTimeout(r,100));
const input=document.querySelector('.smart-name input');
if(!input)return {errors:window.fixtureErrors,markup:document.body.innerHTML.slice(0,500)};
const before={active:document.activeElement===input,value:input.value,selection:[input.selectionStart,input.selectionEnd],hasFocus:document.hasFocus()};
input.focus();input.select();await new Promise(r=>setTimeout(r,50));
const p=document.querySelector('.smart-form').getBoundingClientRect();
return {before,after:{active:document.activeElement===input,selection:[input.selectionStart,input.selectionEnd],hasFocus:document.hasFocus()},panel:{x:p.x,y:p.y,width:p.width,height:p.height},inputStyle:Object.fromEntries(['paddingLeft','borderColor','outlineColor','outlineWidth','outlineOffset','boxShadow'].map(k=>[k,getComputedStyle(input)[k]])),selectionStyle:{background:getComputedStyle(input,'::selection').backgroundColor,color:getComputedStyle(input,'::selection').color},requests:performance.getEntriesByType('resource').map(r=>r.name)};
