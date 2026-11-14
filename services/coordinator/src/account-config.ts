import {createAccountProfile,workspaceSeed} from './account-profile.js';
import {createConfiguredCoordinator} from './config.js';
import {coordinatorAuthConfiguration,publicOrigin} from './deployment-config.js';
import {createEnrollment,enrollmentSigner} from './account-enrollment.js';
import {createNotesDevices} from './notes-devices.js';
import {LogtoIdentity} from './identity.js';
import {ProductPolicy} from './products.js';
import type {Handler} from './http.js';

/** CyberNote always uses static Native/SPA policy, never Management credentials. */
export function createAccountCoordinator(env:NodeJS.ProcessEnv=process.env) {
 const seed=workspaceSeed(env.CYBERNOTE_WORKSPACE_SEED);
 if(!env.CYBERGRID_PRODUCTS||!env.LOGTO_RESOURCE||!env.CYBERGRID_REDIS_PREFIX) {
  throw Error('Explicit static products, Logto resource and isolated Redis prefix required');
 }
 const products=new ProductPolicy(env.CYBERGRID_PRODUCTS);
 const auth=coordinatorAuthConfiguration(env);
 if(!products.browser(auth.clientId))throw Error('Console client must belong to static product policy');
 const origin=publicOrigin(env.CYBERGRID_PUBLIC_ORIGIN);
 if(!origin)throw Error('Explicit CYBERGRID_PUBLIC_ORIGIN required');
 const signer=enrollmentSigner(env.CYBERNOTE_ENROLLMENT_JWK);
 const options={identity:new LogtoIdentity(auth),products,issuer:auth.issuer,seed};
 const coordinator=createConfiguredCoordinator(env);
 const profile=createAccountProfile(options),enrollment=createEnrollment({...options,origin,signer,
  rate:(key,limit)=>coordinator.store.rate(key,Date.now(),limit)});
 const notes=createNotesDevices({...options,store:coordinator.store});
 const handle:Handler=(request,ip)=>{
  const path=new URL(request.url).pathname;
  if(path==='/api/v1/account/profile')return profile(request,ip);
  if(path==='/api/v1/account/enrollment'||path==='/api/v1/account/jwks')return enrollment(request,ip);
  if(path==='/api/v1/notes/devices'||path.startsWith('/api/v1/notes/devices/'))return notes(request,ip);
  return coordinator.handle(request,ip);
 };
 return {...coordinator,handle};
}
