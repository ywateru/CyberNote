/** Bounded NDJSON parsing. Never expose input-derived exception text. */
export const MAX_REQUEST_BYTES = 32768;
const actions = new Set(['install','start','pushFixtures','home','createNote','attachments','attachmentsMultiple','attachmentsChooseMultiple','attachmentsAudio','attachmentsVerify','exportImage','pair','observe','background','foreground','reopen','close','connectDesktop','roundtrip','backgroundRoundtrip','coldBootPrepare','coldBootVerify']);
const messages = {
  INVALID_JSON: 'Invalid JSON request; no input recorded',
  INVALID_REQUEST: 'Invalid native request; no input recorded',
  INPUT_TOO_LARGE: 'Native request exceeds byte limit; no input recorded',
};
const rejected = code => ({ok:false,error:code,message:messages[code]});
export function parseRequest(bytes) {
  if (bytes.length > MAX_REQUEST_BYTES) return rejected('INPUT_TOO_LARGE');
  let request;
  try { request = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); }
  catch { return rejected('INVALID_JSON'); }
  if (!request || typeof request !== 'object' || Array.isArray(request) || !actions.has(request.action)) return rejected('INVALID_REQUEST');
  const allowed = request.action === 'pair' ? ['action','requestId','invitation'] : ['action','requestId'];
  if (!Object.keys(request).every(key => allowed.includes(key))) return rejected('INVALID_REQUEST');
  if (request.requestId !== undefined && (typeof request.requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(request.requestId))) return rejected('INVALID_REQUEST');
  if (request.action === 'pair' && (typeof request.invitation !== 'string' || request.invitation.length < 1 || request.invitation.length > 16384)) return rejected('INVALID_REQUEST');
  return {ok:true,request};
}
export async function* readRequests(stream) {
  let pieces=[],length=0;
  for await (const chunk of stream) {
    const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
    let offset=0;
    while(offset < bytes.length) {
      const newline=bytes.indexOf(10,offset),end=newline===-1?bytes.length:newline;
      const part=bytes.subarray(offset,end);
      if(length+part.length > MAX_REQUEST_BYTES) { yield rejected('INPUT_TOO_LARGE'); return; }
      pieces.push(part);length+=part.length;
      if(newline===-1) break;
      const parsed=parseRequest(Buffer.concat(pieces,length));
      yield parsed;
      if(!parsed.ok)return;
      pieces=[];length=0;offset=newline+1;
    }
  }
  if(length)yield parseRequest(Buffer.concat(pieces,length));
}
export function actionFailure(request) {
  return {
    requestId:request.requestId,
    action:request.action,
    ok:false,
    error:'ACTION_FAILED',
    message:request.action==='pair'?'Native UI pairing failed; no input or exception recorded':'Native acceptance action failed; no input or exception recorded',
  };
}
