import assert from 'node:assert/strict';
import {connect,snapshot,tap,pause,save} from './runtime-probe.mjs';
const c=await connect();
try{
 const before=await snapshot(c,'05-audio-before-play');assert.equal(before.audio[0].currentTime,0);assert.equal(before.audio[0].paused,true);assert(before.text.includes('录音 · 1:06'));
 const playing=await tap(c,'button','播放','06-native-play');assert.equal(playing.audio[0].paused,false);assert(playing.audio[0].currentTime>0);
 await pause(700);
 const paused=await tap(c,'button','暂停','07-native-pause');assert.equal(paused.audio[0].paused,true);assert(paused.audio[0].currentTime>playing.audio[0].currentTime);assert.equal(paused.audio[0].error,null);
 await pause(600);const stable=await snapshot(c,'08-paused-stable');assert.equal(stable.audio[0].currentTime,paused.audio[0].currentTime);
 save('09-audio-finite-result',{initial:before.audio[0],playing:playing.audio[0],paused:paused.audio[0],stable:stable.audio[0],initialReadAfterDurationResolution:true,priorTransientEventsNotObserved:true,rangeAnd15s:'not exercised; known hidden expansion blocker, no repeated attempt',audibleAcceptance:false});
 console.log(JSON.stringify({initial:before.audio,playing:playing.audio,paused:paused.audio,stable:stable.audio},null,2));
}finally{await c.close()}
