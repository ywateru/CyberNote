#!/usr/bin/env node
// Contract checks only. These values are not runtime/performance evidence.
import assert from 'node:assert/strict';
import {counterFields,gaugeFields,validateMediaMetrics,mediaMetricsDelta} from './media-metrics.mjs';
import {mediaPopulation} from './media-summary.mjs';
const metrics=Object.fromEntries([...counterFields,...gaugeFields].map(k=>[k,0]));Object.assign(metrics,{schema:2,scope:'contract fixture'});
assert.equal(validateMediaMetrics(metrics),metrics);
for(const key of [...counterFields,...gaugeFields]){
 const missing={...metrics};delete missing[key];assert.throws(()=>validateMediaMetrics(missing),new RegExp(key));
 for(const invalid of [null,-1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'0'])assert.throws(()=>validateMediaMetrics({...metrics,[key]:invalid}),new RegExp(key));
}
assert.throws(()=>validateMediaMetrics({...metrics,schema:1}));
const end={...metrics,originalBytesRead:17,bytesRead:17,activeLeases:2,peakReadBlock:17};
const delta=mediaMetricsDelta(metrics,end);assert.equal(delta.counters.originalBytesRead,17);assert.equal(delta.gauges.end.activeLeases,2);assert.equal(delta.counters.activeLeases,undefined);
assert.throws(()=>mediaMetricsDelta(end,metrics),/regressed/);
const mapping={attachments:[{id:'r',mime:'image/jpeg'},{id:'s',mime:'image/svg+xml'}]};
const rows=[{command:'acquire_attachment_source',attachmentId:'s',purpose:'original',ok:true},{command:'acquire_attachment_source',attachmentId:'s',purpose:'thumbnail',ok:false,error:'unsupported_media'}];
const p=mediaPopulation(mapping,rows,[{kind:'loopback-media',attachmentId:'s',purpose:'original',failed:true}]);
assert.equal(p.svg.byPurpose.thumbnail.uniqueFailedOnlyAttachments,1);assert.equal(p.svg.byPurpose.thumbnail.uniqueSuccessfulAttachments,0);assert.equal(p.svg.byPurpose.original.uniqueSuccessfulAttachments,1);assert.equal(p.raster.unattemptedSamples,1);assert.equal(p.svg.httpEncodedBytesIncludingHeaders,null);assert.equal(p.svg.httpUnknownEncodedLengthRequests,1);assert.equal(p.svg.httpKnownEncodedBytesIncludingHeaders,0);
console.log('PASS strict required metrics, no fabricated zero, counters/gauges, per-purpose raster/SVG coverage, unknown HTTP encoded length');
