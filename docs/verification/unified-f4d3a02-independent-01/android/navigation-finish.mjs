import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {connect,snapshot,tap,save,store,out} from './runtime-probe.mjs';
const c=await connect();
try{
 const baseline=JSON.parse(readFileSync(out+'/02-baseline-store.json'));
 await tap(c,'button.back-button','备忘录','25-paper-to-list');
 const media=await tap(c,'button.note-row','MEDIA02-PERMISSION-20261103B2026/11/3附件','26-media-reopen');
 assert.deepEqual(media.document,baseline.notes.find(n=>n.id==='a9d1bbe7-a0ee-4f46-ba3e-e0889085cac3').document);assert.equal(media.audio[0].paused,true);assert.equal(media.audio[0].currentTime,0);assert(media.keyed.some(k=>k.key.startsWith('a9d1bbe7-a0ee-4f46-ba3e-e0889085cac3')));
 await tap(c,'button.back-button','备忘录','27-media-to-list');
 const paper=await tap(c,'button.note-row','QA-PAPER-INDEPENDENT-20261103C2026/11/3Alpha Beta Gamma','28-paper-final');assert.deepEqual(paper.document,baseline.notes.find(n=>n.id==='1a0718dd-c71c-4192-89b6-bd58cb9ba475').document);assert.equal(paper.audio.length,0);assert(paper.keyed.some(k=>k.key.startsWith('1a0718dd-c71c-4192-89b6-bd58cb9ba475')));assert.equal(paper.imeShown,false);assert.equal(paper.sheet,null);
 const final=await store(c,'29-final-store');assert.deepEqual(final,baseline);
 save('30-navigation-result',{nativeSequence:'paper → list → media → list → paper → format → paperPickerCancel/reopenBack → list → media → list → paper',mediaDocumentOwned:true,paperDocumentOwned:true,reopenedAudioPausedAtZero:true,fullFixtureStoreEqual:true,paperRevision:final.notes.find(n=>n.id==='1a0718dd-c71c-4192-89b6-bd58cb9ba475').revision,mediaRevision:final.notes.find(n=>n.id==='a9d1bbe7-a0ee-4f46-ba3e-e0889085cac3').revision,finalNote:'1a0718dd-c71c-4192-89b6-bd58cb9ba475',imeShown:paper.imeShown,sheet:paper.sheet});console.log('PASS native navigation and complete fixture equality');
}finally{await c.close()}
