// Group HTTP/grant observations without implying isolated per-subset RSS.
export function mediaPopulation(mapping,rows,network) {
 const byId=new Map(mapping.attachments.map(a=>[a.id,a]));
 const group=a=>!a?'unmapped':a.mime==='image/svg+xml'?'svg':a.mime.startsWith('image/')?'raster':a.mime.startsWith('audio/')?'audio':a.mime.startsWith('video/')?'video':'file';
 const coverage=(samples,grants)=>{
  const successful=new Set(grants.filter(r=>r.ok).map(r=>r.attachmentId)),observed=new Set(grants.map(r=>r.attachmentId)),failed=new Set(grants.filter(r=>!r.ok).map(r=>r.attachmentId));
  const errors={};for(const r of grants.filter(r=>!r.ok))errors[r.error||'unknown']=(errors[r.error||'unknown']||0)+1;
  return {acquireRequests:grants.length,successfulAcquires:grants.filter(r=>r.ok).length,uniqueAttemptedAttachments:observed.size,uniqueSuccessfulAttachments:successful.size,uniqueFailedOnlyAttachments:[...failed].filter(id=>!successful.has(id)).length,unattemptedSamples:samples.length-observed.size,errors};
 };
 const traffic=http=>{
  const known=http.filter(r=>Number.isFinite(r.encodedDataLength)&&r.encodedDataLength>=0),unknown=http.length-known.length;
  return {httpRequests:http.length,httpEncodedBytesIncludingHeaders:unknown?null:known.reduce((n,r)=>n+r.encodedDataLength,0),httpKnownEncodedBytesIncludingHeaders:known.reduce((n,r)=>n+r.encodedDataLength,0),httpUnknownEncodedLengthRequests:unknown};
 };
 return Object.fromEntries(['raster','svg','audio','video','file','unmapped'].map(kind=>{
  const samples=mapping.attachments.filter(a=>group(a)===kind),grants=rows.filter(r=>r.command==='acquire_attachment_source'&&group(byId.get(r.attachmentId))===kind),http=network.filter(r=>r.kind==='loopback-media'&&group(byId.get(r.attachmentId))===kind);
  return [kind,{registeredSamples:samples.length,...coverage(samples,grants),...traffic(http),byPurpose:Object.fromEntries(['original','thumbnail'].map(p=>[p,{...coverage(samples,grants.filter(r=>r.purpose===p)),...traffic(http.filter(r=>r.purpose===p))}])),originalHTTPRequests:http.filter(r=>r.purpose==='original').length,thumbnailHTTPRequests:http.filter(r=>r.purpose==='thumbnail').length,memoryScope:'Mixed-population run RSS; not an isolated '+kind+' memory measurement.'}];
 }));
}
