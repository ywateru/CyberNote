await document.fonts.ready;await new Promise(r=>setTimeout(r,80));
const config={"name": "candidate-selected", "css": "", "diagnostic": true, "selected": true};
const input=document.querySelector('.smart-name input');
const inspect=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return{tag:e.tagName,class:e.className,rect:[r.x,r.y,r.width,r.height],computed:Object.fromEntries(['fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing','color','webkitFontSmoothing','textRendering','zoom','transform'].map(k=>[k,s[k]]))}};
const allRects=()=>[...document.querySelectorAll('.smart-form,.smart-form *')].map(e=>{const r=e.getBoundingClientRect();return[e.tagName,r.x,r.y,r.width,r.height]});
const beforeRects=allRects();
if(config.diagnostic){input.classList.add('controlled-focus');const sheet=document.querySelector('style');sheet.textContent=sheet.textContent.replaceAll(':focus {','.controlled-focus {').replaceAll(':focus::selection','.controlled-focus::selection');}
if(config.css){const sheet=document.createElement('style');sheet.textContent=config.css;document.head.append(sheet);}
if(config.selected){input.focus();input.select()}else{input.setSelectionRange(0,0);input.blur()}
await new Promise(r=>setTimeout(r,60));
const r=document.querySelector('.smart-form').getBoundingClientRect();
return{config,scope:config.diagnostic?'DIAGNOSTIC: production focus declarations remapped to local test class; no actual active window focus claim':'Production component and CSS natural native text, unselected input; no active OS focus claim',documentFocus:document.hasFocus(),actualFocus:input.matches(':focus'),activeInput:document.activeElement===input,selection:[input.selectionStart,input.selectionEnd],panel:[r.x,r.y,r.width,r.height],window:{innerWidth,innerHeight,dpr:devicePixelRatio,visualViewportScale:visualViewport?.scale},nodes:{nameRow:inspect(document.querySelector('.smart-name')),nameInput:inspect(input),smartLabel:inspect(document.querySelector('.smart-make label'))},selectionStyle:{color:getComputedStyle(input,'::selection').color,background:getComputedStyle(input,'::selection').backgroundColor},beforeRects,afterRects:allRects(),errors:window.fixtureErrors,requests:performance.getEntriesByType('resource').map(e=>e.name)};
