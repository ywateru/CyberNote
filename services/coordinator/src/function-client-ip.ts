import type {IncomingMessage} from 'node:http';
import {isIP} from 'node:net';
import {ApiError} from './types.js';

/** Vercel overwrites this header at its edge. It is trusted only on that platform. */
export function functionClientIP(
 request:Pick<IncomingMessage,'headers'|'rawHeaders'>,
 socketIP:string|undefined,
 env:NodeJS.ProcessEnv=process.env,
):string {
 if(env.VERCEL!=='1')return socketIP??'unknown';
 const name='x-vercel-forwarded-for',values:string[]=[];
 for(let i=0;i<request.rawHeaders.length;i+=2) {
  if(request.rawHeaders[i]!.toLowerCase()===name)values.push(request.rawHeaders[i+1]!);
 }
 const value=request.headers[name];
 if(values.length!==1||typeof value!=='string'||value!==values[0]||value.length>45||
    /[\s,%]/.test(value)||!isIP(value)) {
  throw new ApiError(400,'INVALID_CLIENT_IP','请求来源地址无效');
 }
 return value;
}
