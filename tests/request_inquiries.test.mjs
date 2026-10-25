import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inquiryClock,inquiryAvailability,publicInquiry,inquirySchemaReady,telegramConfigured,telegramRecipients,dispatchInquiryNotifications} from '../functions/_lib/request-inquiries.js';
import {handle} from '../functions/_lib/cloudflare-api.js';

test('Tehran trading schedule: Sat–Wed 10–17, Thu 10–14, Friday closed',()=>{
 const time=t=>new Date(t).getTime();
 assert.equal(inquiryClock(time('2026-10-24T06:29:00Z')).withinHours,false); // Saturday 09:59
 assert.equal(inquiryClock(time('2026-10-24T06:30:00Z')).withinHours,true); // Saturday 10:00
 assert.equal(inquiryClock(time('2026-10-24T13:29:00Z')).withinHours,true); // Saturday 16:59
 assert.equal(inquiryClock(time('2026-10-24T13:30:00Z')).withinHours,false); // Saturday 17:00
 assert.equal(inquiryClock(time('2026-10-22T10:29:00Z')).withinHours,true); // Thursday 13:59
 assert.equal(inquiryClock(time('2026-10-22T10:30:00Z')).withinHours,false); // Thursday 14:00
 assert.equal(inquiryClock(time('2026-10-23T06:30:00Z')).withinHours,false); // Friday 10:00
 assert.equal(inquiryClock(time('2026-10-23T06:30:00Z')).start,null);
 assert.equal(inquiryClock().timezone,'Asia/Tehran');
});
const readyDb={prepare(query){
 return {bind(){return this;},async first(){
  if(query.includes('sqlite_master'))return {table_count:4};
  return {csrf_token:'test-csrf',expires_at:Date.now()+60_000};
 }};
}};
const baseEnv={
 DB:{},REQUESTS_ENABLED:'1',TURNSTILE_SECRET:'test',
 TURNSTILE_SITE_KEY:'public-test-site-key',INQUIRY_RATE_SALT:'abcdefghabcdefghabcdefgh',
 TELEGRAM_BOT_TOKEN:'123456:abcdefghijklmnopqrstuvwxyzABCDE123456',TELEGRAM_ADMIN_CHAT_IDS:'12345678,-1001234567890',
 INQUIRY_OPEN_DAYS:'sat,sun,mon,tue,wed,thu',
 INQUIRY_CALENDAR_VERIFIED_UNTIL:'2026-11-30',
 INQUIRY_CLOSED_DATES:'2026-10-26'
};
test('calendar expiry, explicitly closed holiday and emergency switch prevent new requests',()=>{
 const t=x=>new Date(x).getTime();
 assert.equal(inquiryAvailability(baseEnv,t('2026-10-24T06:30:00Z')).accepting,true);
 assert.equal(inquiryAvailability(baseEnv,t('2026-10-26T06:30:00Z')).accepting,false);
 assert.equal(inquiryAvailability(baseEnv,t('2026-10-23T06:30:00Z')).accepting,false);
 assert.equal(inquiryAvailability(baseEnv,t('2026-12-01T06:30:00Z')).accepting,false);
 assert.equal(inquiryAvailability({...baseEnv,INQUIRY_EMERGENCY_CLOSED:'1'},t('2026-10-24T06:30:00Z')).accepting,false);
 assert.equal(inquiryAvailability({...baseEnv,INQUIRY_CALENDAR_VERIFIED_UNTIL:''},t('2026-10-24T06:30:00Z')).enabled,false);
 assert.equal(inquiryAvailability({...baseEnv,INQUIRY_OPEN_DAYS:'sat,sun,mon,tue,wed,thu,fri'},t('2026-10-24T06:30:00Z')).enabled,false);
});
test('supplier schedule must be explicitly configured before intake can activate',async()=>{
 const env={DB:readyDb,REQUESTS_ENABLED:'1',TURNSTILE_SECRET:'test',TURNSTILE_SITE_KEY:'public-test',
 INQUIRY_RATE_SALT:'abcdefghabcdefghabcdefgh',TELEGRAM_BOT_TOKEN:'123456:abcdefghijklmnopqrstuvwxyzABCDE123456',TELEGRAM_ADMIN_CHAT_IDS:'12345678'};
 const url='https://example.com/api/v1/inquiries/settings';
 let response=await handle({request:new Request(url),env});
 assert.equal((await response.json()).enabled,false);
 env.INQUIRY_OPEN_DAYS='sat,sun,mon,tue,wed,thu';
 env.INQUIRY_CALENDAR_VERIFIED_UNTIL='2026-12-15';
 response=await handle({request:new Request(url),env});
 const data=await response.json();
 assert.equal(data.enabled,true);
 assert.deepEqual(data.days,['sat','sun','mon','tue','wed','thu']);
 assert.equal(data.timezone,'Asia/Tehran');
});
test('payment-less request intake is disabled unless actively opted in',async()=>{
 const r=await handle({request:new Request('https://example.com/api/v1/inquiries',{
  method:'POST',body:JSON.stringify({name:'نام معتبر'})}),env:{DB:{}}});
 assert.equal(r.status,503);assert.equal((await r.json()).code,'NOT_ENABLED');
});
test('request settings never reveal secrets or imply stock is reserved',async()=>{
 const env={DB:readyDb,REQUESTS_ENABLED:'1',TURNSTILE_SECRET:'PRIVATE',
  TURNSTILE_SITE_KEY:'public-test-site-key',INQUIRY_RATE_SALT:'01234567890123456789012345',TELEGRAM_BOT_TOKEN:'123456:abcdefghijklmnopqrstuvwxyzABCDE123456',TELEGRAM_ADMIN_CHAT_IDS:'12345678',INQUIRY_OPEN_DAYS:'sat,sun,mon,tue,wed,thu',INQUIRY_CALENDAR_VERIFIED_UNTIL:'2099-12-31'};
 const result=await handle({request:new Request('https://example.com/api/v1/inquiries/settings'),env});
 assert.equal(result.status,200);
 const x=await result.json();
 assert.equal(x.enabled,true);assert.equal(x.timezone,'Asia/Tehran');assert.equal(x.close===null||x.close==='17:00'||x.close==='14:00',true);
 assert.equal(x.turnstileSiteKey,'public-test-site-key');
 assert.equal(JSON.stringify(x).includes('PRIVATE'),false);
 assert.match(x.notice,/پس از تأیید هانی‌ال/);
});
test('D1 migration contains audit events and no payment collection fields',()=>{
 const sql=readFileSync(new URL('../cloudflare/0003_inquiry_telegram.sql',import.meta.url),'utf8');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS purchase_inquiries/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS purchase_inquiry_events/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS inquiry_rate_limits/);
 assert.doesNotMatch(sql,/payment_card|bank_password|payment_verified/);
});

test('retired Telegram webhook endpoint is no longer registered',async()=>{
 const response=await handle({request:new Request('https://example.com/api/v1/integrations/telegram',{
  method:'POST',body:'{}'}),env:{DB:{}}});
 assert.equal(response.status,404);
});
test('D1 migration 0004 removes the retired Telegram draft table',()=>{
 const sql=readFileSync(new URL('../cloudflare/0004_remove_telegram.sql',import.meta.url),'utf8');
 assert.match(sql,/DROP INDEX IF EXISTS idx_telegram_product_drafts_status/i);
 assert.match(sql,/DROP TABLE IF EXISTS telegram_product_drafts/i);
});

test('D1 inquiry schema is mandatory even if the user enables every other feature flag',async()=>{
 assert.equal(await inquirySchemaReady({DB:{}}),false);
 assert.equal(await inquirySchemaReady({DB:readyDb}),true);
 const env={...baseEnv,DB:{},INQUIRY_CLOSED_DATES:''};
 const status=await handle({request:new Request('https://example.com/api/v1/inquiries/settings'),env});
 assert.equal(status.status,200);
 assert.equal((await status.json()).enabled,false);
 const request=await handle({request:new Request('https://example.com/api/v1/inquiries',{
  method:'POST',body:JSON.stringify({name:'نام نمونه',phone:'09123456789'})}),env});
 assert.equal(request.status,503);
 assert.equal((await request.json()).code,'NOT_ENABLED');
});
test('private readiness checklist is available only to authenticated admin and reveals no secrets',async()=>{
 const url='https://example.com/api/v1/admin/inquiries/readiness';
 const env={...baseEnv,DB:readyDb,ADMIN_SESSION_SECRET:'local-test-only-strong-secret-is-not-live-abcdef',
  REQUESTS_ENABLED:'0',TURNSTILE_SECRET:'PRIVATE-TURNSTILE',INQUIRY_RATE_SALT:'SALT-PRIVATE-LONG-RANDOM-UNIT-TEST'};
 const anon=await handle({request:new Request(url),env});
 assert.equal(anon.status,401);
 const allowed=await handle({request:new Request(url,{
  headers:{cookie:'haniel_admin_session='+'A'.repeat(43)}}),env});
 assert.equal(allowed.status,200);
 const report=await allowed.json();
 assert.equal(report.enabled,false);
 assert.equal(report.accepting,false);
 assert.equal(report.checks.find(c=>c.id==='opt_in').ready,false);
 assert.equal(report.checks.find(c=>c.id==='schema').ready,true);
 assert.equal(report.checks.find(c=>c.id==='rate').ready,true);
 assert.equal(JSON.stringify(report).includes('PRIVATE'),false);
});
test('short rate-limiting salt must not enable intake',()=>{
 assert.equal(inquiryAvailability({...baseEnv,INQUIRY_RATE_SALT:'too-short'},Date.parse('2026-10-24T06:30:00Z')).enabled,false);
});

test('Telegram notification configuration requires a valid token and one to five unique chat IDs',()=>{
 assert.equal(telegramConfigured(baseEnv),true);
 assert.deepEqual(telegramRecipients({...baseEnv,TELEGRAM_ADMIN_CHAT_IDS:'12345678,12345678'}),[]);
 assert.deepEqual(telegramRecipients({...baseEnv,TELEGRAM_ADMIN_CHAT_IDS:'12345678,abc'}),[]);
 assert.equal(telegramConfigured({...baseEnv,TELEGRAM_BOT_TOKEN:''}),false);
});
test('new inquiry Telegram alerts exclude customer contact details and track each admin delivery',async t=>{
 const deliveries=[],updates=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  deliveries.push({url:String(url),payload:JSON.parse(options.body)});
  return new Response(JSON.stringify({ok:true,result:{message_id:42}}),{status:200,headers:{'content-type':'application/json'}});
 });
 const inquiryId='123e4567-e89b-12d3-a456-426614174000';
 const items=JSON.stringify([{slug:'gold-bracelet',name:'دستبند شبدر',quantity:2}]);
 const DB={prepare(sql){
  let args=[];
  return {bind(...values){args=values;return this;},
   async all(){return {results:[
    {id:'n1',recipient_chat_id:'12345678',items_json:items},
    {id:'n2',recipient_chat_id:'-1001234567890',items_json:items}
   ]};},
   async run(){updates.push({sql,args});return {meta:{changes:1}};}
  };
 }};
 const env={...baseEnv,DB,TELEGRAM_ADMIN_CHAT_IDS:'12345678,-1001234567890',ADMIN_PANEL_URL:'https://haniel.example/admin'};
 const result=await dispatchInquiryNotifications(env,inquiryId);
 assert.deepEqual(result,{sent:2,failed:0});
 assert.equal(deliveries.length,2);
 for(const delivery of deliveries){
  assert.match(delivery.url,/api\.telegram\.org\/bot123456:/);
  assert.match(delivery.payload.text,/استعلام موجودی جدید/);
  assert.match(delivery.payload.text,/دستبند شبدر/);
  assert.match(delivery.payload.text,/پنل مدیریت/);
  assert.doesNotMatch(delivery.payload.text,/09123456789|نام مشتری|customer_phone/);
 }
 assert.equal(updates.filter(x=>x.sql.includes("status='sent'")).length,2);
});
test('missing consent is rejected before Turnstile or database writes',async t=>{
 t.mock.method(Date,'now',()=>Date.parse('2026-10-24T06:30:00Z'));
 const response=await handle({request:new Request('https://example.com/api/v1/inquiries',{
  method:'POST',headers:{'cf-connecting-ip':'203.0.113.10','content-type':'application/json'},
  body:JSON.stringify({name:'نام معتبر',phone:'09123456789',items:[{slug:'gold-bracelet',quantity:1}],turnstileToken:'not-a-real-token'})
 }),env:{...baseEnv,DB:readyDb}});
 assert.equal(response.status,400);
 assert.match((await response.json()).error,/تأیید استفاده از اطلاعات تماس/);
});
test('failed Telegram sends remain retryable and store only a generic error code',async t=>{
 const updates=[];
 t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({ok:false}),{status:200,headers:{'content-type':'application/json'}}));
 const DB={prepare(sql){
  let args=[];
  return {bind(...values){args=values;return this;},
   async all(){return {results:[{id:'n-failed',recipient_chat_id:'12345678',items_json:JSON.stringify([{name:'گوشواره شبدر',quantity:1}])}]}},
   async run(){updates.push({sql,args});return {meta:{changes:1}};}
  };
 }};
 const result=await dispatchInquiryNotifications({...baseEnv,DB,TELEGRAM_ADMIN_CHAT_IDS:'12345678'},'123e4567-e89b-12d3-a456-426614174000');
 assert.deepEqual(result,{sent:0,failed:1});
 const failure=updates.find(x=>x.sql.includes("status='failed'"));
 assert.ok(failure);
 assert.equal(failure.args[0],'telegram_rejected');
 assert.doesNotMatch(failure.args.join(' '),/09123456789|PRIVATE|customer_name/i);
});
test('new migration creates retryable Telegram notification delivery records',()=>{
 const sql=readFileSync(new URL('../cloudflare/0005_inquiry_notifications.sql',import.meta.url),'utf8');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS purchase_inquiry_notifications/);
 assert.match(sql,/recipient_chat_id TEXT NOT NULL/);
 assert.match(sql,/status IN \('pending','sent','failed'\)/);
 assert.match(sql,/UNIQUE\(inquiry_id,channel,recipient_chat_id\)/);
});
