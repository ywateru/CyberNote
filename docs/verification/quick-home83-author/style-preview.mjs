import {openRuntime,idle,api,saveJSON,snapshot} from '../../../scripts/debug/runtime.mjs';
const runtime=await openRuntime({mobile:true});
try {
 const samples=[['记下一个想法','今天把零散想法整理在这里。\n快速打开，随手记录，之后再慢慢完善。'],['周末计划','散步、读书，整理书桌。'],['本地附件检查','照片、文件和录音都由现有保存流程管理。\n这条笔记只用于展示文字长短不同的卡片。'],['读书摘记','用自己的话复述刚刚读到的内容。'],['一份很长的合成笔记标题用于验证手机两列卡片不会发生横向溢出','标题应当适当截断；正文独立显示，日期只出现一次。\n页面保持阅读顺序。'],['简短记录','下午三点见。'],['下一步','先完成草稿，再回来补充细节。'],['最后一张卡片','可以滚动到添加按钮上方，内容和操作都能到达。']];
 const prototype=runtime.backend.workspace.notes[0];
 runtime.backend.workspace.notes=samples.map(([title,text],i)=>({...structuredClone(prototype),id:'preview83-'+i,title,plainText:title+'\n'+text,document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:title}]},...text.split('\n').map(text=>({type:'paragraph',content:[{type:'text',text}]}))]},updatedAt:1793923200000-i*86400000,pinned:i===0}));
 await runtime.page.reload();await runtime.page.waitForFunction(()=>window.__NOTES_DEBUG__?.version===1);await idle(runtime.page);
 await runtime.page.screenshot({animations:"disabled",path:process.cwd()+'/docs/verification/quick-home83-author/style-home-390.png'});
 await saveJSON(process.cwd()+'/docs/verification/quick-home83-author/style-home-390.snapshot.json',await snapshot(runtime.page,{selector:'.notes-pane',maxChars:30000}));
 await api(runtime.page,'note.select',{id:'preview83-0'});await idle(runtime.page);
 await runtime.page.screenshot({animations:"disabled",path:process.cwd()+'/docs/verification/quick-home83-author/style-editor-390.png'});
} finally {await runtime.cleanup();}
