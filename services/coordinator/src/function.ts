import type {IncomingMessage,ServerResponse} from 'node:http';
import {resolve} from 'node:path';
import {createAccountCoordinator} from './account-config.js';
import {coordinatorAuthConfiguration,publicOrigin} from './deployment-config.js';
import {createWebsiteHandler} from './node-server.js';
import {serveAPI} from './http.js';
import {functionClientIP} from './function-client-ip.js';
import {ApiError} from './types.js';
// A warm function may reuse connections; all authorization/state remain in Redis.
let handle:ReturnType<typeof createWebsiteHandler>|undefined;
export default async function handler(req:IncomingMessage,res:ServerResponse){
 try{
  const clientIP=functionClientIP(req,req.socket.remoteAddress);
  const origin=publicOrigin(process.env.CYBERGRID_PUBLIC_ORIGIN);
  if(!handle){const coordinator=createAccountCoordinator(),auth=coordinatorAuthConfiguration(process.env);handle=createWebsiteHandler(coordinator.handle,{publicOrigin:origin,issuer:auth.issuer,callbackUri:auth.redirectUri,publicRoot:resolve(process.cwd(),'services/coordinator/public'),ready:()=>coordinator.store.ready!()});}
  await serveAPI(req,res,(request)=>handle!(request,clientIP),origin);
 }catch(error){if(!res.headersSent){res.writeHead(error instanceof ApiError?error.status:503,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:error instanceof ApiError?{code:error.code,message:error.message}:{code:'COORDINATOR_UNAVAILABLE',message:'协调服务暂时不可用'}}));}else res.destroy();}
}
