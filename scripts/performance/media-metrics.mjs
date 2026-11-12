// Required actual production counters; unknown metrics never become zero.
export const counterFields=['bytesRead','readOperations','originalBytesRead','originalReadOperations','thumbnailBytesRead','thumbnailReadOperations','thumbnailGenerationAttempts','thumbnailSourceLogicalBytes','thumbnailOutputBytes','thumbnailGenerations','thumbnailHits'];
export const gaugeFields=['peakReadBlock','activeStreams','activeLeases','cacheBytes','cacheFiles','cacheQuota'];
export function validateMediaMetrics(value){
 if(value?.schema!==2)throw Error('Required production media metrics schema2 absent');
 for(const key of [...counterFields,...gaugeFields])if(!Number.isSafeInteger(value[key])||value[key]<0)throw Error('Missing/invalid production media metric: '+key);
 if(typeof value.scope!=='string')throw Error('Media metrics scope absent');
 return value;
}
export function mediaMetricsDelta(start,end){
 validateMediaMetrics(start);validateMediaMetrics(end);
 const counters=Object.fromEntries(counterFields.map(k=>{if(end[k]<start[k])throw Error('Media counter regressed: '+k);return [k,end[k]-start[k]];}));
 return {counters,gauges:{start:Object.fromEntries(gaugeFields.map(k=>[k,start[k]])),end:Object.fromEntries(gaugeFields.map(k=>[k,end[k]]))}};
}
