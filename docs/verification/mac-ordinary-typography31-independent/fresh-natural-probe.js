await document.fonts.ready;
const wait=()=>new Promise(r=>setTimeout(r,80));
await wait();
const sheet=document.querySelector('style'),original=sheet.textContent;
const input=document.querySelector('.smart-name input');
const capture=()=>[...document.querySelectorAll('.smart-form,.smart-form *')].map((e,i)=>({
  index:i,tag:e.tagName,type:e.getAttribute('type'),text:e===input?e.value:e.textContent,
  rect:(()=>{const r=e.getBoundingClientRect();return[r.x,r.y,r.width,r.height]})(),
  computed:Object.fromEntries([...getComputedStyle(e)].map(k=>[k,getComputedStyle(e).getPropertyValue(k)]))
}));
sheet.textContent=window.baselineCss;const baseline=capture();
sheet.textContent=window.candidateCss;const candidate=capture();
sheet.textContent=original;
input.setSelectionRange(0,0);input.blur();await wait();
const changed=[];
for(let i=0;i<candidate.length;i++)for(const key of Object.keys(candidate[i].computed)){
  if(candidate[i].computed[key]!==baseline[i].computed[key])changed.push({index:i,tag:candidate[i].tag,type:candidate[i].type,key,baseline:baseline[i].computed[key],candidate:candidate[i].computed[key]});
}
const r=document.querySelector('.smart-form').getBoundingClientRect();
return {scope:'Independent natural unselected production fixture; inactive unattached snapshot, not OS focus or packaged app acceptance',
  panel:[r.x,r.y,r.width,r.height],baseline,candidate,changed,
  rectsEqual:baseline.every((x,i)=>JSON.stringify(x.rect)===JSON.stringify(candidate[i].rect)),
  textEqual:baseline.every((x,i)=>x.text===candidate[i].text),
  sheetRestored:sheet.textContent===original,selection:[input.selectionStart,input.selectionEnd],
  documentFocus:document.hasFocus(),actualFocus:input.matches(':focus'),
  dpr:devicePixelRatio,scale:visualViewport.scale,errors:window.fixtureErrors,
  requests:performance.getEntriesByType('resource').map(e=>e.name)};
