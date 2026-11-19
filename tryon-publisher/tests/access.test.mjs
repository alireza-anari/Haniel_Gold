import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {verifyOwnerAccess} from '../src/access.mjs';
const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const domain='haniel-qa.cloudflareaccess.com';
const env={ACCESS_TEAM_DOMAIN:domain,ACCESS_OWNER_EMAIL:'owner@example.test',ACCESS_AUD:'haniel-audience-test-id'};
const now=1800000000;
const keypair=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const key={...(await webcrypto.subtle.exportKey('jwk',keypair.publicKey)),kid:'qa-access-kid'};
const fetchImpl=async()=>new Response(JSON.stringify({keys:[key]}),{status:200});
const claims={iss:'https://'+domain,aud:[env.ACCESS_AUD],exp:now+3600,iat:now-40,sub:'owner-id',email:'owner@example.test'};
async function token(c){const h=b64({alg:'RS256',kid:'qa-access-kid'}),p=b64(c);
 const s=await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5',keypair.privateKey,Buffer.from(h+'.'+p));
 return h+'.'+p+'.'+Buffer.from(s).toString('base64url');
}
const req=t=>new Request('https://owner.example.test/admin',{headers:t?{'Cf-Access-Jwt-Assertion':t}:{}});
test('valid Cloudflare Access signed JWT and exact owner accepted',async()=>{
 const r=await verifyOwnerAccess(req(await token(claims)),env,{fetchImpl,now});assert.equal(r.ok,true);
});
test('missing and malformed identity never accepted',async()=>{
 for(const t of [null,'invalid','a.b.c']){
  const r=await verifyOwnerAccess(req(t),env,{fetchImpl,now});assert.equal(r.ok,false);
 }
});
test('wrong owner, audience, issuer and expired token are rejected',async()=>{
 const f=[{...claims,email:'other@example.test'},{...claims,aud:['different-aud']},{...claims,iss:'https://notourteam.cloudflareaccess.com'},{...claims,exp:now-1}];
 for(const c of f){const r=await verifyOwnerAccess(req(await token(c)),env,{fetchImpl,now});assert.equal(r.ok,false);}
});
test('tampered token signature rejected even if email matches',async()=>{
 const signed=await token(claims);const v=signed.split('.');v[1]=b64({...claims,sub:'forged-id'});
 const r=await verifyOwnerAccess(req(v.join('.')),env,{fetchImpl,now});assert.equal(r.ok,false);
});
test('untrusted Access team domain cannot drive remote key fetch',async()=>{
 let called=false;
 const r=await verifyOwnerAccess(req(await token(claims)),{...env,ACCESS_TEAM_DOMAIN:'attacker.invalid'},{
  now,fetchImpl:async()=>{called=true;return fetchImpl();}
 });
 assert.equal(r.ok,false);assert.equal(called,false);
});
