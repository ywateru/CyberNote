import assert from 'node:assert/strict';
import {assertHomeVisible} from './client.mjs';
import {guardFailureSummary} from './protocol.mjs';
const visible={app:'app mobile page-notes',viewport:{width:360,height:568},gallery:{x:16,y:172,width:328,height:330},galleryDisplay:'grid',galleryVisibility:'visible',editor:{x:0,y:0,width:0,height:0},add:{x:284,y:492,width:56,height:56},addColor:'rgb(255, 188, 0)',columns:'158px 158px'};
assert.equal(assertHomeVisible(visible),visible);
for(const v of [{...visible,app:'app mobile page-editor'},{...visible,gallery:{...visible.gallery,width:0}},{...visible,galleryDisplay:'none'},{...visible,galleryVisibility:'hidden'},{...visible,editor:{x:24,y:98,width:312,height:88}},{...visible,gallery:{...visible.gallery,y:600}},{...visible,add:{...visible.add,width:30}},{...visible,columns:'328px'}])assert.throws(()=>assertHomeVisible(v));
const secret='SYNTHETIC_PRIVATE_SENTINEL_916';
for(const stdout of [JSON.stringify({ok:false,error:'Refused',message:secret}),JSON.stringify({ok:false,error:secret,message:'bounded subprocess failed 137: '}),secret,JSON.stringify({ok:true,error:'Refused',message:'bounded subprocess failed 137: '})]){const actual=guardFailureSummary(stdout);assert.deepEqual(actual,{event:'GUARD_FAILURE_REDACTED'});assert(!JSON.stringify(actual).includes(secret));}
assert.deepEqual(guardFailureSummary(JSON.stringify({ok:false,error:'Refused',message:'bounded subprocess failed 137: '})),{event:'GUARD_BOUNDED_EXIT_137'});
console.log(JSON.stringify({passed:14,scope:'host-only actual gallery visibility gates and guard-log sentinel redaction'}));
