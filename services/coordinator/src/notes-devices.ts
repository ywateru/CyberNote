import {createHash} from 'node:crypto';
import {accountFailure,accountJSON,verifiedAccount,type AccountOptions,type AccountProfile} from './account-profile.js';
import {BodyCapacityError,limited,type Handler} from './http.js';
import {ApiError,type Store} from './types.js';

export const NOTES_DEVICE_LIMIT=64;
export const NOTES_PRESENCE_MS=65_000;
export interface NotesSummary {noteCount:number;lastNoteUpdatedAt:number|null;capturedAt:number}
export interface NotesDeviceUpdate {
 deviceId:string;name:string;summary:NotesSummary|null;syncAvailable:boolean;
 protocolDeviceId:string|null;noisePublicKey:string|null;
}
export interface NotesDevice {
 id:string;name:string;online:boolean;syncAvailable:boolean;summary:NotesSummary|null;
 transportDeviceId:string|null;protocolDeviceId:string|null;noisePublicKey:string|null;
}
export type NotesScope=Pick<AccountProfile,'issuer'|'subject'|'productId'>;
export interface NotesRegistration {keyHash:string;revision:number;requestDigest:string}
/** Private storage only. Neither the raw transport key nor bearer is retained. */
export interface NotesDeviceRecord extends NotesDeviceUpdate,NotesRegistration {
 sessionHash:string;transportDeviceId:string;incarnation:string;
 leaseUntil:number;
}
export const notesScope=(s:NotesScope)=>createHash('sha256').update(JSON.stringify([s.issuer,s.subject,s.productId])).digest('hex');
export function notesProjection(record:NotesDeviceRecord,online:boolean):NotesDevice {
 return {id:record.deviceId,name:record.name,online,syncAvailable:online&&record.syncAvailable,
  summary:online?record.summary:null,transportDeviceId:online?record.transportDeviceId:null,
  protocolDeviceId:online?record.protocolDeviceId:null,noisePublicKey:online?record.noisePublicKey:null};
}
const invalid=()=>new ApiError(400,'INVALID_INPUT','设备目录请求无效');
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const key=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{43}$/.test(v)&&Buffer.from(v,'base64url').toString('base64url')===v;
const uint=(v:unknown):v is number=>Number.isSafeInteger(v)&&(v as number)>=0;
function object(v:unknown,fields:string[]):Record<string,unknown> {
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!==[...fields].sort().join(','))throw invalid();
 return v as Record<string,unknown>;
}
/** Validate again at the storage boundary; exported stores cannot bypass HTTP schema limits. */
export function notesUpdate(value:unknown):NotesDeviceUpdate {
 const v=object(value,['deviceId','name','summary','syncAvailable','protocolDeviceId','noisePublicKey']);
 if(!uuid(v.deviceId)||typeof v.name!=='string'||/[\u0000-\u001f\u007f-\u009f]/.test(v.name)||/[\uD800-\uDFFF]/u.test(v.name))throw invalid();
 const name=v.name.trim();if(!name||Array.from(name).length>96||typeof v.syncAvailable!=='boolean')throw invalid();
 let summary:NotesSummary|null=null;
 if(v.summary!==null){const s=object(v.summary,['noteCount','lastNoteUpdatedAt','capturedAt']);
  if(!uint(s.noteCount)||!uint(s.capturedAt)||(s.lastNoteUpdatedAt!==null&&!uint(s.lastNoteUpdatedAt))||
   (s.noteCount===0?s.lastNoteUpdatedAt!==null:s.lastNoteUpdatedAt===null))throw invalid();
  summary={noteCount:s.noteCount,lastNoteUpdatedAt:s.lastNoteUpdatedAt as number|null,capturedAt:s.capturedAt};
 }
 if(v.syncAvailable?(!uuid(v.protocolDeviceId)||!key(v.noisePublicKey)):(v.protocolDeviceId!==null||v.noisePublicKey!==null))throw invalid();
 return {deviceId:v.deviceId,name,summary,syncAvailable:v.syncAvailable,protocolDeviceId:v.protocolDeviceId as string|null,noisePublicKey:v.noisePublicKey as string|null};
}
export function notesRegistration(value:NotesRegistration):NotesRegistration {
 const v=object(value,['keyHash','revision','requestDigest']);
 if(typeof v.keyHash!=='string'||!/^[a-f0-9]{64}$/.test(v.keyHash)||typeof v.requestDigest!=='string'||!/^[a-f0-9]{64}$/.test(v.requestDigest)||!uint(v.revision)||v.revision<1)throw invalid();
 return {keyHash:v.keyHash,revision:v.revision,requestDigest:v.requestDigest};
}

export function createNotesDevices(options:AccountOptions&{store:Store;now?:()=>number}):Handler {
 return async(request,ip='unknown')=>{
  try{
   const url=new URL(request.url),self=url.pathname==='/api/v1/notes/devices/self';
   if(url.pathname!=='/api/v1/notes/devices'&&!self)throw new ApiError(404,'NOT_FOUND','设备目录接口不存在');
   const method=self?'PUT':'GET';
   if(request.method!==method)return accountJSON({error:{code:'METHOD_NOT_ALLOWED',message:'请求方法不支持'}},405,{allow:method});
   if(url.search)throw invalid();
   const now=()=>options.now?.()??Date.now();
   if(!await options.store.rate('notes-ip:'+createHash('sha256').update(ip).digest('hex'),now(),300))throw new ApiError(429,'RATE_LIMITED','设备目录请求过于频繁',60);
   const account=await verifiedAccount(request,options);
   if(!await options.store.rate('notes-owner:'+notesScope(account),now(),600))throw new ApiError(429,'RATE_LIMITED','设备目录请求过于频繁',60);
   if(!self){
    if(request.body!==null||request.headers.has('transfer-encoding')||(request.headers.has('content-length')&&request.headers.get('content-length')!=='0'))throw invalid();
    return accountJSON({schemaVersion:1,devices:await options.store.notesDevices(account,now())});
   }
   if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')??''))throw new ApiError(415,'JSON_REQUIRED','请使用 application/json');
   let raw:Uint8Array;try{raw=await limited(request.body,8192,request.signal);}catch(e){if(e instanceof BodyCapacityError)throw new ApiError(413,'BODY_TOO_LARGE','设备目录请求超过8KiB');throw e;}
   let parsed:unknown;try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{throw invalid();}
   const v=object(parsed,['deviceId','registryKey','revision','name','summary','syncAvailable','transportSessionKey','protocolDeviceId','noisePublicKey']);
   if(!key(v.transportSessionKey)||!key(v.registryKey)||!uint(v.revision)||v.revision<1)throw invalid();
   const {transportSessionKey,registryKey,revision,...rest}=v,update=notesUpdate(rest);
   // Canonical field order, but preserve caller values (including untrimmed name).
   // Even changing only the SDK session requires a newer persisted revision.
   const requestDigest=createHash('sha256').update(JSON.stringify([v.deviceId,registryKey,revision,v.name,update.summary,v.syncAvailable,transportSessionKey,v.protocolDeviceId,v.noisePublicKey])).digest('hex');
   const registration={keyHash:createHash('sha256').update(registryKey as string).digest('hex'),revision,requestDigest};
   const sessionHash=createHash('sha256').update(transportSessionKey as string).digest('hex');
   const session=await options.store.session(sessionHash);
   if(!session||session.purpose!=='device')throw new ApiError(401,'INVALID_TRANSPORT_SESSION','请重新连接设备目录');
   if(session.policyMode!=='static'||!session.authClientId||options.products.native(session.authClientId)?.id!==account.productId)throw new ApiError(403,'TRANSPORT_ACCOUNT_MISMATCH','设备连接与当前账户产品不匹配');
   request.signal.throwIfAborted();
   const device=await options.store.putNotesDevice(account,sessionHash,update,registration,now());
   return accountJSON({schemaVersion:1,device});
  }catch(error){return accountFailure(error);}
 };
}
