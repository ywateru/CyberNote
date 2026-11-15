import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {IncomingMessage} from 'node:http';
import {functionClientIP} from '../src/function-client-ip.js';
import {MemoryStore} from '../src/memory.js';
import {createService} from '../src/service.js';
import {FixtureIdentity,FixtureDirectory,SPA} from './fixtures.js';

function request(value?:string|string[],raw?:string[]):Pick<IncomingMessage,'headers'|'rawHeaders'> {
 return {headers:{'x-vercel-forwarded-for':value,'x-forwarded-for':'198.51.100.200',
  'x-real-ip':'198.51.100.201',forwarded:'for=198.51.100.202'},
  rawHeaders:raw??(value===undefined?[]:['x-vercel-forwarded-for',String(value)])};
}

test('Function trusts a strict single platform IP only under VERCEL=1; otherwise uses socket address',()=>{
 for(const ip of ['192.0.2.1','2001:db8::1','::ffff:192.0.2.1']) {
  assert.equal(functionClientIP(request(ip),'127.0.0.1',{VERCEL:'1'}),ip);
  for(const env of [{},{VERCEL:'true'},{VERCEL:'0'}])assert.equal(functionClientIP(request(ip),'127.0.0.1',env),'127.0.0.1');
 }
 assert.equal(functionClientIP(request('attacker-controlled'),'127.0.0.1',{}),'127.0.0.1');
 assert.equal(functionClientIP(request(),undefined,{}),'unknown');
 for(const invalid of [undefined,'',' 192.0.2.1','192.0.2.1 ','192.0.2.1, 192.0.2.2',
  'example.com','192.0.2.1:443','[2001:db8::1]','fe80::1%lo0','999.2.3.4',['192.0.2.1']]) {
  assert.throws(()=>functionClientIP(request(invalid),'127.0.0.1',{VERCEL:'1'}),{code:'INVALID_CLIENT_IP'});
 }
 assert.throws(()=>functionClientIP(request('192.0.2.1',[
  'X-Vercel-Forwarded-For','192.0.2.1','x-vercel-forwarded-for','192.0.2.1',
 ]),'127.0.0.1',{VERCEL:'1'}),{code:'INVALID_CLIENT_IP'});
 assert.throws(()=>functionClientIP(request('192.0.2.1',['x-vercel-forwarded-for','192.0.2.2']),
  '127.0.0.1',{VERCEL:'1'}),{code:'INVALID_CLIENT_IP'});
});

test('actual auth limiter gives distinct platform IPs separate ten-attempt buckets',async t=>{
 const store=new MemoryStore();t.after(()=>store.close());
 const service=createService({store,identity:new FixtureIdentity(),directory:new FixtureDirectory(),browserClientId:SPA});
 const attempt=(ip:string)=>service(new Request('https://fixture.example/api/v1/auth/exchange',{
  method:'POST',headers:{'content-type':'application/json'},body:'{}',
 }),functionClientIP(request(ip),'127.0.0.1',{VERCEL:'1'}));
 // Intentionally invalid identity input exercises the real auth-ip rate check first.
 for(let i=0;i<10;i++)for(const ip of ['192.0.2.1','192.0.2.2'])assert.equal((await attempt(ip)).status,400);
 for(const ip of ['192.0.2.1','192.0.2.2'])assert.equal((await attempt(ip)).status,429);
});
