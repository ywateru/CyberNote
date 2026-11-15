import {createECDH,createHash,createPrivateKey,createPublicKey,randomUUID,type KeyObject,type JsonWebKey} from 'node:crypto';
import {SignJWT,type JWK} from 'jose';
import {accountJSON,accountFailure,verifiedAccount,type AccountOptions} from './account-profile.js';
import {ApiError} from './types.js';
import type {Handler} from './http.js';

export const ENROLLMENT_AUDIENCE='cybernote-enrollment-v1';
export const ENROLLMENT_TTL=300;
export interface EnrollmentSigner {privateKey:KeyObject;publicJWK:JWK;kid:string}

/** Stable deployment key, independent of workspace derivation and Noise X25519 keys. */
export function enrollmentSigner(raw:string|undefined):EnrollmentSigner {
 if(!raw||raw.length>4096)throw Error('Explicit CYBERNOTE_ENROLLMENT_JWK required');
 let jwk:JWK;
 try{jwk=JSON.parse(raw);}catch{throw Error('Invalid enrollment signing key');}
 if(jwk.kty!=='EC'||jwk.crv!=='P-384'||!canonical(jwk.x,48)||!canonical(jwk.y,48)||!canonical(jwk.d,48)||
  (jwk.alg!==undefined&&jwk.alg!=='ES384')||(jwk.use!==undefined&&jwk.use!=='sig')||
  (jwk.key_ops!==undefined&&(!Array.isArray(jwk.key_ops)||!jwk.key_ops.includes('sign'))))throw Error('ES384 private enrollment key required');
 try{
  const ecdh=createECDH('secp384r1');ecdh.setPrivateKey(Buffer.from(jwk.d!,'base64url'));
  const point=ecdh.getPublicKey();
  if(point.subarray(1,49).toString('base64url')!==jwk.x||point.subarray(49,97).toString('base64url')!==jwk.y)throw Error('Key mismatch');
  const privateKey=createPrivateKey({key:jwk as JsonWebKey,format:'jwk'});
  const exported=createPublicKey(privateKey).export({format:'jwk'});
  if(exported.x!==jwk.x||exported.y!==jwk.y)throw Error('Key mismatch');
  const kid=createHash('sha256').update(JSON.stringify({crv:'P-384',kty:'EC',x:jwk.x,y:jwk.y})).digest('base64url');
  return {privateKey,kid,publicJWK:{kty:'EC',crv:'P-384',x:jwk.x,y:jwk.y,alg:'ES384',use:'sig',kid}};
 }catch{throw Error('Invalid enrollment signing key');}
}
function canonical(value:unknown,length:number):value is string {
 if(typeof value!=='string'||!/^[A-Za-z0-9_-]+$/.test(value))return false;
 const bytes=Buffer.from(value,'base64url');return bytes.length===length&&bytes.toString('base64url')===value;
}
function invalid():never {throw new ApiError(400,'INVALID_INPUT','设备授权请求无效');}
async function body(request:Request):Promise<{deviceId:string;noisePublicKey:string}> {
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')??''))throw new ApiError(415,'JSON_REQUIRED','请使用 application/json');
 const reader=request.body?.getReader();if(!reader)return invalid();
 const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){request.signal.throwIfAborted();const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2048){void reader.cancel().catch(()=>{});throw new ApiError(413,'BODY_TOO_LARGE','设备授权请求过大');}chunks.push(value);}}finally{reader.releaseLock();}
 let value:unknown;try{value=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return invalid();}
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='deviceId,noisePublicKey')return invalid();
 const {deviceId,noisePublicKey}=value as Record<string,unknown>;
 if(typeof deviceId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(deviceId)||!canonical(noisePublicKey,32))return invalid();
 return {deviceId,noisePublicKey};
}

export function createEnrollment(options:AccountOptions&{origin:string;signer:EnrollmentSigner;now?:()=>number;rate:(key:string,limit:number)=>Promise<boolean>}):Handler {
 const origin=new URL(options.origin);if(origin.protocol!=='https:'||origin.origin!==options.origin)throw Error('Pinned coordinator HTTPS origin required');
 return async (request,clientIP='unknown')=>{
  try{
   const path=new URL(request.url);
   if(path.search)invalid();
   if(path.pathname==='/api/v1/account/jwks'){
    if(request.method!=='GET')return accountJSON({error:{code:'METHOD_NOT_ALLOWED',message:'公钥仅支持 GET'}},405,{allow:'GET'});
    if(request.body!==null)invalid();
    return accountJSON({keys:[options.signer.publicJWK]});
   }
   if(request.method!=='POST')return accountJSON({error:{code:'METHOD_NOT_ALLOWED',message:'设备授权仅支持 POST'}},405,{allow:'POST'});
   const source=createHash('sha256').update(clientIP).digest('hex');
   if(!await options.rate('enrollment-ip:'+source,30))throw new ApiError(429,'RATE_LIMITED','设备授权请求过于频繁，请稍后重试',60);
   const account=await verifiedAccount(request,options);
   const owner=createHash('sha256').update(JSON.stringify([account.issuer,account.subject,account.productId])).digest('hex');
   if(!await options.rate('enrollment-owner:'+owner,60))throw new ApiError(429,'RATE_LIMITED','账户设备授权请求过于频繁，请稍后重试',60);
   const device=await body(request),now=Math.floor(options.now?.()??Date.now()/1000),expiresAt=now+ENROLLMENT_TTL;
   const token=await new SignJWT({accountIssuer:account.issuer,productId:account.productId,
    workspaceId:account.workspaceId,...device,purpose:'pair'})
    .setProtectedHeader({alg:'ES384',typ:'JWT',kid:options.signer.kid})
    .setIssuer(options.origin).setAudience(ENROLLMENT_AUDIENCE).setSubject(account.subject)
    .setIssuedAt(now).setExpirationTime(expiresAt).setJti(randomUUID()).sign(options.signer.privateKey);
   return accountJSON({schemaVersion:1,token,expiresAt});
  }catch(error){return accountFailure(error);}
 };
}
