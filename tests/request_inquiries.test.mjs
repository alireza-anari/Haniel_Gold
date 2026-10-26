import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inquiryClock,inquiryAvailability,publicInquiry,inquirySchemaReady,telegramConfigured,telegramRecipients,dispatchInquiryNotifications} from '../functions/_lib/request-inquiries.js';
import {handle} from '../functions/_lib/cloudflare-api.js';
import {validateQuote,adminQuote,adminQuoteLink,publicQuote,respondToQuote} from '../functions/_lib/purchase-quotes.js';

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
  if(query.includes('sqlite_master'))return {table_count:5};
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
 const incompleteDB={prepare(sql){
  return {async first(){
   if(sql.includes('sqlite_master'))return {table_count:4};
   throw Error('unexpected SQL');
  }};
 }};
 assert.equal(await inquirySchemaReady({DB:incompleteDB}),false);

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


test('confirmed quote validates exact tomans, finite hold, expiry and supply reference',()=>{
 const now=Date.parse('2026-10-24T07:00:00Z');
 const good={
  itemsTotalToman:8200000,deliveryToman:100000,
  validUntilMs:now+5*60_000,supplyHoldUntilMs:now+15*60_000,
  supplyReference:'confirmed-hold-reference',supplySecured:true
 };
 assert.equal(validateQuote(good,now).finalTotalToman,8300000);
 assert.match(validateQuote({...good,supplySecured:false},now).error,/تأیید واقعی/);
 assert.match(validateQuote({...good,itemsTotalToman:2.5},now).error,/اعداد صحیح/);
 assert.match(validateQuote({...good,validUntilMs:now+60*60_000},now).error,/۳۰ دقیقه/);
 assert.match(validateQuote({...good,supplyHoldUntilMs:now+3*60_000},now).error,/اعتبار تأمین/);
 assert.match(validateQuote({...good,supplyReference:'x'},now).error,/تأیید واقعی/);
});
test('unauthenticated visitors cannot open admin quote API or make provider payment requests',async()=>{
 const env={DB:{},ADMIN_SESSION_SECRET:'local-test-only-long-secret-string-abcdef'};
 const id='123e4567-e89b-42d3-a456-426614174000';
 for(const method of ['GET','POST']){
  const result=await handle({request:new Request('https://example.com/api/v1/admin/inquiries/'+id+'/quote',{method}),env});
  assert.equal(result.status,401);
 }
 for(const method of ['GET','POST']){
  const result=await handle({request:new Request('https://example.com/api/v1/payments/snappay',{method}),env});
  assert.equal(result.status,404);
 }
});
test('quote is admin-only and never creates a payment link or fake paid order',async()=>{
 const now=Date.now(),queries=[];
 const DB={prepare(sql){
  queries.push(sql);
  return {bind(...params){this.params=params;return this;},
   async first(){return {status:'supplier_confirmed'};},
   async run(){return {meta:{changes:1}};}
  };
 }};
 const id='123e4567-e89b-42d3-a456-426614174000';
 const r=await adminQuote({
  request:new Request('https://example.com/api/v1/admin/inquiries/'+id+'/quote',{
   method:'POST',body:JSON.stringify({
    itemsTotalToman:9500000,deliveryToman:0,
    validUntilMs:now+5*60_000,supplyHoldUntilMs:now+10*60_000,
    supplySecured:true,supplyReference:'supplier-hold-test'
   })
  }),env:{DB}
 },'admin/inquiries/'+id+'/quote');
 assert.equal(r.status,201);
 const result=await r.json();
 assert.equal(result.paymentEnabled,false);
 assert.equal(result.finalTotalToman,9500000);
 assert.ok(!('paymentUrl' in result));
 assert.ok(queries.some(q=>q.includes('INSERT INTO purchase_inquiry_quotes')));
 assert.ok(queries.every(q=>!/\bpayments\b|\borders\b/i.test(q)));
});
test('quote preparation D1 migration is schema-only and preserves inquiry rows',()=>{
 const sql=readFileSync(new URL('../cloudflare/0006_inquiry_quotes.sql',import.meta.url),'utf8');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS purchase_inquiry_quotes/);
 assert.match(sql,/inquiry_id TEXT NOT NULL UNIQUE/);
 assert.doesNotMatch(sql,/\bDELETE FROM\b|\bINSERT INTO\b|\bDROP TABLE\b|\bUPDATE\b/i);
});


test('secure customer quote link exposes only quote details and records a non-payment response',async()=>{
 const now=Date.now(),inquiryId='123e4567-e89b-42d3-a456-426614174000';
 let status='quote_prepared',storedHash='',expiresAt=0,responseRow=null;
 const quoteRow={valid_until:now+5*60_000,supply_hold_until:now+10*60_000,
  delivery_toman:100000,final_total_toman:8300000,
  items_json:JSON.stringify([{slug:'gold-bracelet',name:'دستبند شبدر',quantity:2,weightMg:1200,karat:18,makingFeeBps:900,profitBps:700,indicativeUnitToman:4000000}])};
 const DB={prepare(sql){
  let args=[];
  return {bind(...values){args=values;return this;},
   async first(){
    if(sql.includes('FROM purchase_inquiries i JOIN purchase_inquiry_quotes q'))
     return {status,valid_until:quoteRow.valid_until,supply_hold_until:quoteRow.supply_hold_until,response:responseRow?.response||null};
    if(sql.includes('FROM purchase_quote_access a')){
     if(!storedHash||args[0]!==storedHash)return null;
     return {inquiry_id:inquiryId,status,items_json:quoteRow.items_json,delivery_toman:quoteRow.delivery_toman,
      final_total_toman:quoteRow.final_total_toman,valid_until:quoteRow.valid_until,
      supply_hold_until:quoteRow.supply_hold_until,expires_at:expiresAt,response:responseRow?.response||null};
    }
    return null;
   },
   async run(){
    if(sql.includes('INSERT INTO purchase_quote_access')){storedHash=args[1];expiresAt=args[3];return {meta:{changes:1}};}
    if(sql.includes('INSERT INTO purchase_quote_responses')){
     if(responseRow)return {meta:{changes:0}};
     responseRow={response:args[1],responded_at:args[2],acknowledged:args[3]};return {meta:{changes:1}};
    }
    return {meta:{changes:1}};
   }
  };
 }};
 const linkResponse=await adminQuoteLink({
  request:new Request('https://shop.example/api/v1/admin/inquiries/'+inquiryId+'/quote-link',{method:'POST'}),
  env:{DB}
 },'admin/inquiries/'+inquiryId+'/quote-link');
 assert.equal(linkResponse.status,201);
 const linkData=await linkResponse.json();
 const url=new URL(linkData.customerQuoteUrl);
 const token=url.hash.split('/').pop();
 assert.match(token,/^[A-Za-z0-9_-]{43}$/);
 assert.equal(url.searchParams.get('catalog'),'live');
 assert.notEqual(storedHash,token);
 status='quote_sent';
 const quoteResponse=await publicQuote({
  request:new Request('https://shop.example/api/v1/quotes/'+token),
  env:{DB}
 },'quotes/'+token);
 assert.equal(quoteResponse.status,200);
 const publicData=await quoteResponse.json();
 assert.equal(publicData.quote.finalTotalToman,8300000);
 assert.deepEqual(publicData.quote.items,[{name:'دستبند شبدر',quantity:2}]);
 assert.equal(publicData.paymentEnabled,false);
 assert.equal(publicData.orderCreated,false);
 assert.doesNotMatch(JSON.stringify(publicData),/customer_phone|customer_name|makingFeeBps|profitBps|09123456789/);
 const accepted=await respondToQuote({
  request:new Request('https://shop.example/api/v1/quotes/'+token+'/respond',{
   method:'POST',headers:{origin:'https://shop.example','content-type':'application/json'},
   body:JSON.stringify({response:'accepted',acknowledged:true})
  }),env:{DB}
 },'quotes/'+token+'/respond');
 assert.equal(accepted.status,201);
 const acceptedData=await accepted.json();
 assert.equal(acceptedData.response,'accepted');
 assert.equal(acceptedData.orderCreated,false);
 assert.equal(acceptedData.paymentEnabled,false);
 const repeated=await respondToQuote({
  request:new Request('https://shop.example/api/v1/quotes/'+token+'/respond',{
   method:'POST',headers:{origin:'https://shop.example','content-type':'application/json'},
   body:JSON.stringify({response:'declined'})
  }),env:{DB}
 },'quotes/'+token+'/respond');
 assert.equal(repeated.status,409);
});
test('quote response rejects cross-origin requests and requires explicit acceptance acknowledgement',async()=>{
 const token='A'.repeat(43),inquiryId='123e4567-e89b-42d3-a456-426614174000';
 const DB={prepare(sql){return {bind(){return this;},async first(){return {
  inquiry_id:inquiryId,status:'quote_sent',valid_until:Date.now()+60_000,
  supply_hold_until:Date.now()+120_000,expires_at:Date.now()+60_000,response:null
 };},async run(){return {meta:{changes:1}};}};}};
 const crossOrigin=await respondToQuote({
  request:new Request('https://shop.example/api/v1/quotes/'+token+'/respond',{
   method:'POST',headers:{origin:'https://attacker.example','content-type':'application/json'},
   body:JSON.stringify({response:'accepted',acknowledged:true})
  }),env:{DB}
 },'quotes/'+token+'/respond');
 assert.equal(crossOrigin.status,403);
 const missingAcknowledgement=await respondToQuote({
  request:new Request('https://shop.example/api/v1/quotes/'+token+'/respond',{
   method:'POST',headers:{origin:'https://shop.example','content-type':'application/json'},
   body:JSON.stringify({response:'accepted',acknowledged:false})
  }),env:{DB}
 },'quotes/'+token+'/respond');
 assert.equal(missingAcknowledgement.status,400);
});
test('quote-sharing migration stores only token hashes and no payment data',()=>{
 const sql=readFileSync(new URL('../cloudflare/0007_quote_sharing.sql',import.meta.url),'utf8');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS purchase_quote_access/);
 assert.match(sql,/token_hash TEXT NOT NULL UNIQUE/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS purchase_quote_responses/);
 assert.match(sql,/CHECK\(response IN \('accepted','declined'\)\)/);
 assert.doesNotMatch(sql,/payment_card|bank_password|payment_verified|token TEXT/i);
});
