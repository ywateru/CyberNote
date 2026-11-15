import {createHmac} from 'node:crypto';
import type {Handler} from './http.js';
import {ApiError, type Identity} from './types.js';
import {ProductPolicy} from './products.js';

export interface AccountProfile {
 schemaVersion:1;
 subject:string;
 issuer:string;
 productId:string;
 workspaceId:string;
}

/** The seed is a persistent deployment secret: canonical base64url, >=256 bits. */
export function workspaceSeed(raw:string|undefined):Buffer {
 if(!raw||!/^[A-Za-z0-9_-]{43,128}$/.test(raw))throw Error('Explicit CYBERNOTE_WORKSPACE_SEED required (base64url, 32–96 bytes)');
 const seed=Buffer.from(raw,'base64url');
 if(seed.length<32||seed.length>96||seed.toString('base64url')!==raw)throw Error('Invalid CYBERNOTE_WORKSPACE_SEED');
 return seed;
}

/** UUIDv8, RFC 9562 variant; no request authority or unverified claim enters it. */
export function accountWorkspace(seed:Uint8Array,issuer:string,subject:string,productId:string):string {
 const bytes=createHmac('sha256',seed)
  .update(JSON.stringify(['cybernote.account.workspace',1,issuer,subject,productId]))
  .digest().subarray(0,16);
 bytes[6]=(bytes[6]!&0x0f)|0x80;
 bytes[8]=(bytes[8]!&0x3f)|0x80;
 const hex=bytes.toString('hex');
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export function accountJSON(body:unknown,status=200,extra:Record<string,string>={}) {
 return new Response(JSON.stringify(body),{status,headers:{
  'content-type':'application/json; charset=utf-8','cache-control':'no-store',
  'x-content-type-options':'nosniff','referrer-policy':'no-referrer',...extra,
 }});
}

export interface AccountOptions {identity:Identity;products:ProductPolicy;issuer:string;seed:Uint8Array}
export async function verifiedAccount(request:Request,options:AccountOptions):Promise<AccountProfile> {
 const authorization=request.headers.get('authorization');
 const match=authorization&&/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(authorization);
 if(!match||match[1]!.length>16384)throw new ApiError(401,'INVALID_IDENTITY','请通过 Logto 重新授权');
 const verified=await options.identity.verify(match[1]!);
 const product=options.products.native(verified.clientId);
 if(!product)throw new ApiError(403,'APPLICATION_MISMATCH','客户端未获原生产品允许');
 return {schemaVersion:1,subject:verified.id,issuer:options.issuer,productId:product.id,
  workspaceId:accountWorkspace(options.seed,options.issuer,verified.id,product.id)};
}

export function accountFailure(error:unknown):Response {
 if(error instanceof ApiError)return accountJSON({error:{code:error.code,message:error.message}},error.status,{
  ...(error.status===401?{'www-authenticate':'Bearer realm="cybernote", error="invalid_token"'}:{}),
  ...(error.retryAfter?{'retry-after':String(error.retryAfter)}:{}),
 });
 return accountJSON({error:{code:'ACCOUNT_UNAVAILABLE',message:'账户服务暂时不可用'}},503);
}

export function createAccountProfile(options:AccountOptions):Handler {
 const seed=Buffer.from(options.seed);
 return async request=>{
  try {
   if(request.method!=='GET')return accountJSON({error:{code:'METHOD_NOT_ALLOWED',message:'账户资料仅支持 GET'}},405,{allow:'GET'});
   if(new URL(request.url).search||request.body!==null||request.headers.has('transfer-encoding')||
      (request.headers.has('content-length')&&request.headers.get('content-length')!=='0')) {
    throw new ApiError(400,'INVALID_INPUT','账户资料请求不接受查询参数或请求体');
   }
   return accountJSON(await verifiedAccount(request,{...options,seed}));
  }catch(error) {
   return accountFailure(error);
  }
 };
}
