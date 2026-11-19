// Verify a Cloudflare Access JWT; never rely on user-supplied email.
const enc=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const safeTeam=/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+cloudflareaccess\.com$/i;
function b64url(input){
 if(typeof input!=='string'||!/^[-_\w]+$/.test(input))throw Error('INVALID_BASE64URL');
 let s=input.replace(/-/g,'+').replace(/_/g,'/');s+='='.repeat((4-s.length%4)%4);
 return Uint8Array.from(atob(s),x=>x.charCodeAt(0));
}
function parsePart(v){const b=b64url(v);if(b.length>10000)throw Error('JWT_TOO_LONG');return JSON.parse(decoder.decode(b));}
export async function verifyOwnerAccess(req,env,{fetchImpl=fetch,now=Math.floor(Date.now()/1000)}={}){
 const domain=String(env.ACCESS_TEAM_DOMAIN||'').trim().toLowerCase();
 const owner=String(env.ACCESS_OWNER_EMAIL||'').trim().toLowerCase();
 const aud=String(env.ACCESS_AUD||'').trim();
 if(!safeTeam.test(domain)||!owner.includes('@')||aud.length<8)return {ok:false,reason:'NOT_CONFIGURED'};
 const jwt=req.headers.get('Cf-Access-Jwt-Assertion');if(!jwt||jwt.length>14000)return {ok:false,reason:'NO_TOKEN'};
 const parts=jwt.split('.');if(parts.length!==3)return {ok:false,reason:'BAD_TOKEN'};
 try{
  const header=parsePart(parts[0]),c=parsePart(parts[1]),issuer='https://'+domain;
  if(header.alg!=='RS256'||typeof header.kid!=='string'||header.kid.length>300)return {ok:false,reason:'BAD_ALGORITHM'};
  if(c.iss!==issuer||!(Array.isArray(c.aud)?c.aud.includes(aud):c.aud===aud))return {ok:false,reason:'BAD_AUDIENCE'};
  if(typeof c.exp!=='number'||c.exp<=now||typeof c.iat!=='number'||c.iat>now+60||
     (c.nbf!==undefined&&(typeof c.nbf!=='number'||c.nbf>now+60))||!c.sub)return {ok:false,reason:'INVALID_TIME'};
  if(typeof c.email!=='string'||c.email.toLowerCase()!==owner)return {ok:false,reason:'WRONG_OWNER'};
  const res=await fetchImpl(issuer+'/cdn-cgi/access/certs',{redirect:'error'});if(!res.ok)return {ok:false,reason:'CERTS_UNAVAILABLE'};
  const keys=await res.json();const jwk=(keys.keys||[]).find(k=>k.kid===header.kid&&k.kty==='RSA'&&(k.use===undefined||k.use==='sig'));
  if(!jwk)return {ok:false,reason:'UNKNOWN_KID'};
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const ok=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,b64url(parts[2]),enc.encode(parts[0]+'.'+parts[1]));
  return ok?{ok:true,owner:c.email.toLowerCase()}:{ok:false,reason:'BAD_SIGNATURE'};
 }catch{return {ok:false,reason:'VERIFY_FAILED'};}
}
