await document.fonts.ready;
const units = [...document.querySelectorAll('.smart-form,.smart-form h2,.smart-name input,.smart-make input,.smart-make p,.smart-form footer,.smart-form footer button')].map(e => {
  const r=e.getBoundingClientRect(), s=getComputedStyle(e);
  return {tag:e.tagName, className:e.className, text:e.textContent, type:e.type,
    rect:{x:r.x,y:r.y,width:r.width,height:r.height},
    styles:Object.fromEntries(['color','background-color','border-color','border-width','border-radius','appearance'].map(k=>[k,s.getPropertyValue(k)]))};
});
return {devicePixelRatio, viewport:[innerWidth,innerHeight], units, requests:performance.getEntriesByType('resource').map(r=>r.name)};
