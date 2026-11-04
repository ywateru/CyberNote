// Detached views can throttle animation frames. Synchronous reads force layout.
const rect = r => Object.fromEntries(['x','y','width','height','top','right','bottom','left'].map(k => [k,r[k]]));
const measure = el => {
 const s=getComputedStyle(el),range=document.createRange();range.selectNodeContents(el);
 return {text:el.textContent,rect:rect(el.getBoundingClientRect()),textRect:rect(range.getBoundingClientRect()),style:Object.fromEntries(['fontFamily','fontSize','fontWeight','lineHeight','height','paddingTop','paddingRight','paddingBottom','paddingLeft','borderBottomWidth','borderBottomStyle','display'].map(k=>[k,s[k]]))};
};
const run = (name,classes,width) => {
 const app=document.querySelector('.app');app.className='app '+classes;
 app.style.width=width+'px';
 document.querySelector('.notes-scroll').classList.toggle('gallery',classes.includes('gallery-'));
 document.querySelectorAll('.note-entry').forEach(el=>el.classList.toggle('gallery-entry',classes.includes('gallery-')));
 return {name,classes,width,first:measure(document.querySelector('#first')),later:measure(document.querySelector('#later')),row:measure(document.querySelector('#row')),zero:measure(document.querySelector('.search-zero-section'))};
};
const cases=[
 run('native-visible','desktop native-toolbar',1394),
 run('native-hidden','desktop native-toolbar sidebar-hidden',1394),
 run('native-compact','desktop native-toolbar',1088),
 run('browser','desktop',1394),
 run('phone','mobile page-notes',390),
 run('wide-android','desktop',1088),
 run('gallery-browse','desktop native-toolbar gallery-browse',1394),
 run('gallery-edit','desktop native-toolbar gallery-edit',1394),
 run('separate','desktop native-toolbar separate',1394),
 run('native-restored','desktop native-toolbar',1394),
];
// Snapshot the same production first-group DOM in native mode after transitions.
return {userAgent:navigator.userAgent,dpr:devicePixelRatio,viewport:{width:innerWidth,height:innerHeight},cases,requests:performance.getEntriesByType('resource').map(x=>x.name)};
