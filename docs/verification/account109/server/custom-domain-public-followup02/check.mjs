import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';

assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED,'0','TLS verification must remain enabled');
assert(!process.env.NODE_EXTRA_CA_CERTS,'No additional CA input allowed');
const root=new URL('../../../../../',import.meta.url);
const source=await readFile(new URL('src-tauri/src/account/config.rs',root),'utf8');
const fixed=name=>source.match(new RegExp(`pub const ${name}: &str = "([^"]+)";`))[1];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const parentPaths=['/private/tmp/account109-domain-host-comparison02.json','/private/tmp/account109-domain-alias-verify02.json'];
const parentBytes=await Promise.all(parentPaths.map(p=>readFile(p)));
const [parentComparison,parentVerification]=parentBytes.map(b=>JSON.parse(b));
assert.equal(parentVerification.status,200);
assert.deepEqual(parentVerification.domain,{name:'cybernote-sync.aixgg.com',verified:true,redirect:null,gitBranch:null});
assert.equal(parentComparison.authConfigDeepEqual,true);assert.equal(parentComparison.publicJwksDeepEqual,true);
const hosts=['cybernote-sync.aixgg.com','cybernote-sync.vercel.app'];
const client=fixed('CLIENT_ID'),issuer=fixed('ISSUER'),resource=fixed('RESOURCE');
const rows=await Promise.all(hosts.flatMap(host=>['config','jwks'].map(async endpoint=>{
  const started=performance.now();let stage='fetch';
  const result={host,endpoint,attempts:1,redirectsFollowed:0};
  try{
    const path=endpoint==='config'?'/api/v1/auth/config?appId='+encodeURIComponent(client):'/api/v1/account/jwks';
    const response=await fetch('https://'+host+path,{redirect:'error',signal:AbortSignal.timeout(10000),headers:{accept:'application/json'}});
    result.httpStatus=response.status;result.redirected=response.redirected;
    assert.equal(response.redirected,false);assert.equal(response.status,200);stage='body';
    const chunks=[];let size=0;
    for await(const chunk of response.body){size+=chunk.length;assert(size<=65536,'Response size limit');chunks.push(chunk);}
    const bytes=Buffer.concat(chunks);result.bodyBytes=size;result.bodySha256=digest(bytes);stage='contract';
    const data=JSON.parse(bytes);
    if(endpoint==='config'){
      const checks={issuer:data.issuer===issuer,clientId:data.clientId===client,resource:data.resource===resource,productId:data.productId===client,provider:data.provider==='logto',scope:data.scope==='openid offline_access profile connect',loginFlow:data.loginFlow==='authorization_code'};
      for(const [field,suffix] of Object.entries({authorizationEndpoint:'/auth',tokenEndpoint:'/token',jwksUri:'/jwks',revocationEndpoint:'/token/revocation'}))checks[field]=data[field]===issuer+suffix;
      result.fixedMatches=checks;assert(Object.values(checks).every(Boolean));
    }else{
      assert.deepEqual(Object.keys(data),['keys']);assert.equal(data.keys.length,1);
      const key=data.keys[0];assert.equal(key.kty,'EC');assert.equal(key.crv,'P-384');assert.equal(key.alg,'ES384');assert.equal(key.use,'sig');
      assert(!['d','p','q','dp','dq','qi','k'].some(k=>Object.hasOwn(key,k)));
      for(const field of ['x','y']){assert.match(key[field],/^[A-Za-z0-9_-]{64}$/);assert.equal(Buffer.from(key[field],'base64url').length,48);}
      const thumb=digest(JSON.stringify({crv:key.crv,kty:key.kty,x:key.x,y:key.y}));
      assert.equal(key.kid,Buffer.from(thumb,'hex').toString('base64url'));
      const prior=JSON.parse(await readFile(new URL('../custom-domain-public-review01/result.json',import.meta.url),'utf8'));
      result.publicKey={kid:key.kid,rfc7638Sha256Hex:thumb,matchesPriorNewDomain:thumb===prior.requests.find(r=>r.host===hosts[0]&&r.endpoint==='jwks').publicSigningKeys[0].rfc7638Sha256Hex};
      assert.equal(result.publicKey.matchesPriorNewDomain,true);
    }
    result.status='pass';return {result,data};
  }catch(error){result.status='fail';result.errorStage=stage;result.errorClass=error.name;return {result};}
  finally{result.durationMs=Math.round(performance.now()-started);}
})));
const comparisons=Object.fromEntries(['config','jwks'].map(endpoint=>{
  const pair=rows.filter(r=>r.result.endpoint===endpoint);
  const available=pair.every(r=>r.result.status==='pass');
  return [endpoint,{parsedDeepEqual:available?isDeepStrictEqual(pair[0].data,pair[1].data):null,rawBodyShaEqual:available?pair[0].result.bodySha256===pair[1].result.bodySha256:null}];
}));
const receipt={schema:1,recordedAt:new Date().toISOString(),status:rows.every(r=>r.result.status==='pass')&&Object.values(comparisons).every(c=>c.parsedDeepEqual&&c.rawBodyShaEqual)?'pass':'fail',method:'Independent Node built-in fetch; default TLS; redirect:error; timeout10s; body64KiB; each endpoint once; no retry',nodeVersion:process.version,credentialsSent:false,requests:rows.map(r=>r.result),comparisons,parentReceipts:parentPaths.map((p,i)=>({path:p,sha256:digest(parentBytes[i])})),vercelManagementVerification:{evidence:'parent finite receipt; no reviewer API call',verified:true,redirect:null,gitBranch:null},enrollmentIssuer:{sourcePinned:fixed('ENROLLMENT_ISSUER'),liveSignedClaimVerified:false}};
await writeFile(new URL('result.json',import.meta.url),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({status:receipt.status,comparisons,requests:receipt.requests.map(({host,endpoint,status,httpStatus,errorStage,errorClass})=>({host,endpoint,status,httpStatus,errorStage,errorClass}))},null,2));
