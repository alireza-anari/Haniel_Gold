import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import nodeCrypto from 'node:crypto';
import {verifyTelegram} from '../src/index.js';

function signedInitData(token,authDate,firstName='آرزو',signature){
 const params=new URLSearchParams();
 params.set('auth_date',String(authDate));
 params.set('user',JSON.stringify({id:123456789,first_name:firstName}));
 if(signature)params.set('signature',signature);
 const text=[...params].sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>k+'='+v).join('\n');
 const secret=nodeCrypto.createHmac('sha256','WebAppData').update(token).digest();
 const hash=nodeCrypto.createHmac('sha256',secret).update(text).digest('hex');
 params.set('hash',hash);
 return params.toString();
}
const token='123456789:example-unpublished-test-only';
test('accepts valid recent Telegram Mini App initData',async()=>{
 const now=1800000000;
 const parsed=await verifyTelegram(signedInitData(token,now-20),token,86400,now);
 assert.equal(parsed.id,'123456789');
 assert.equal(parsed.name,'آرزو');
});
test('rejects tampered initData',async()=>{
 const now=1800000000;let data=signedInitData(token,now-20,'مریم');
 data=data.replace(/%D9%85%D8%B1%DB%8C%D9%85/i,'FAKE');
 await assert.rejects(()=>verifyTelegram(data,token,86400,now));
});
test('rejects expired signatures',async()=>{
 const now=1800000000;
 await assert.rejects(()=>verifyTelegram(signedInitData(token,now-86401),token,86400,now));
});

test('accepts real-world initData with a signature field included in bot-token HMAC',async()=>{
 const now=1800000000;
 const data=signedInitData(token,now-20,'آرزو','demo-signature_base64url');
 const parsed=await verifyTelegram(data,token,86400,now);
 assert.equal(parsed.id,'123456789');
});
test('rejects altered signature field after hashing',async()=>{
 const now=1800000000;
 const data=signedInitData(token,now-20,'آرزو','signed-value');
 const tampered=data.replace('signature=signed-value','signature=changed-value');
 await assert.rejects(()=>verifyTelegram(tampered,token,86400,now),/امضای ورود تلگرام معتبر نیست/);
});
test('rejects valid initData when using a different bot token',async()=>{
 const now=1800000000;
 const data=signedInitData(token,now-20,'آرزو','signed-value');
 await assert.rejects(()=>verifyTelegram(data,'another-bot-token',86400,now),/امضای ورود تلگرام معتبر نیست/);
});
