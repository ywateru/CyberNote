import {createAccountProfile,workspaceSeed} from './account-profile.js';
import {createConfiguredCoordinator} from './config.js';
import {coordinatorAuthConfiguration} from './deployment-config.js';
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
 const profile=createAccountProfile({identity:new LogtoIdentity(auth),products,issuer:auth.issuer,seed});
 const coordinator=createConfiguredCoordinator(env);
 const handle:Handler=(request,ip)=>new URL(request.url).pathname==='/api/v1/account/profile'
  ?profile(request,ip):coordinator.handle(request,ip);
 return {...coordinator,handle};
}
