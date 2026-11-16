// Inspect actual rendered text styles, including ancestor surfaces and selected
// inset feedback. Disabled/hidden UI and user-chosen document colors are excluded.
export async function auditThemeText(page, label) {
 const result=await page.evaluate(()=>{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const rgba=s=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=s;ctx.fillRect(0,0,1,1);const a=[...ctx.getImageData(0,0,1,1).data];a[3]/=255;return a;};
  const over=(fg,bg)=>fg.slice(0,3).map((n,i)=>n*fg[3]+bg[i]*(1-fg[3]));
  const lum=c=>{const a=c.map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return a[0]*.2126+a[1]*.7152+a[2]*.0722;};
  const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
  const failures=[],pairs=[];const walker=document.createTreeWalker(document.querySelector('.recording-layout'),NodeFilter.SHOW_TEXT);
  while(walker.nextNode()){
   const node=walker.currentNode,e=node.parentElement;if(!node.textContent.trim()||!e?.getClientRects().length||e.closest('[hidden],[inert],[disabled],[aria-disabled="true"],.drawing-overlay canvas,.tiptap [style*="color"]'))continue;
   const path=[];let current=e,skip=false;
   for(;current;current=current.parentElement){const s=getComputedStyle(current);if(s.visibility!=='visible'||s.display==='none'||Number(s.opacity)<.99){skip=true;break;}path.push(s);}
   if(skip)continue;let bg=[255,255,255];
   for(const s of path.reverse()){
    bg=over(rgba(s.backgroundColor),bg);
    if(s.boxShadow.includes('inset')&&s.boxShadow.includes('999px')){const color=s.boxShadow.match(/^(rgba?\([^)]*\)|color\([^)]*\))/)?.[0];if(color)bg=over(rgba(color),bg);}
   }
   const s=getComputedStyle(e),fg=over(rgba(s.color),bg),ratio=contrast(fg,bg),large=parseFloat(s.fontSize)>=24||(parseFloat(s.fontSize)>=18.66&&Number(s.fontWeight)>=700);
   const entry={text:node.textContent.trim().slice(0,50),class:e.className,ratio,fg,bg};pairs.push(entry);
   if(ratio+0.01<(large?3:4.5))failures.push(entry);
  }
  return {pairs,failures};
 });
 return {label,...result};
}
