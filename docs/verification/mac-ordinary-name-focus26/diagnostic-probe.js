await document.fonts.ready;await new Promise(r=>setTimeout(r,50));
const input=document.querySelector('.smart-name input');input.classList.add('controlled-focus');
const sheet=document.querySelector('style');sheet.textContent=sheet.textContent.replaceAll(':focus {','.controlled-focus {').replaceAll(':focus::selection','.controlled-focus::selection');
input.focus();input.select();await new Promise(r=>setTimeout(r,50));
const s=getComputedStyle(input),r=input.getBoundingClientRect();
return {scope:'DIAGNOSTIC ONLY: production focus declarations remapped to a test class to inspect paint. Not real active WK focus/selection, not package acceptance.',documentFocus:document.hasFocus(),matchesRealFocus:input.matches(':focus'),rect:[r.x,r.y,r.width,r.height],style:{border:s.borderColor,outline:s.outline,offset:s.outlineOffset},selection:{background:getComputedStyle(input,'::selection').backgroundColor,color:getComputedStyle(input,'::selection').color},requests:performance.getEntriesByType('resource').map(r=>r.name)};
