import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inquiryClock,inquiryAvailability,publicInquiry} from '../functions/_lib/request-inquiries.js';
import {parseTelegramCandidate,telegramWebhook} from '../functions/_lib/telegram-drafts.js';
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
const baseEnv={
 DB:{},REQUESTS_ENABLED:'1',TURNSTILE_SECRET:'test',
 TURNSTILE_SITE_KEY:'public-test-site-key',INQUIRY_RATE_SALT:'abcdefghabcdefghabcdefgh',
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
 const env={DB:{},REQUESTS_ENABLED:'1',TURNSTILE_SECRET:'test',TURNSTILE_SITE_KEY:'public-test',
 INQUIRY_RATE_SALT:'abcdefghabcdefghabcdefgh'};
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
 const env={DB:{},REQUESTS_ENABLED:'1',TURNSTILE_SECRET:'PRIVATE',
  TURNSTILE_SITE_KEY:'public-test-site-key',INQUIRY_RATE_SALT:'01234567890123456789012345',INQUIRY_OPEN_DAYS:'sat,sun,mon,tue,wed,thu',INQUIRY_CALENDAR_VERIFIED_UNTIL:'2099-12-31'};
 const result=await handle({request:new Request('https://example.com/api/v1/inquiries/settings'),env});
 assert.equal(result.status,200);
 const x=await result.json();
 assert.equal(x.enabled,true);assert.equal(x.timezone,'Asia/Tehran');assert.equal(x.close===null||x.close==='17:00'||x.close==='14:00',true);
 assert.equal(x.turnstileSiteKey,'public-test-site-key');
 assert.equal(JSON.stringify(x).includes('PRIVATE'),false);
 assert.match(x.notice,/پس از تأیید هانی‌ال/);
});
test('Telegram requires deliberate opt-in marker with explicit product fields',()=>{
 assert.equal(parseTelegramCandidate('یک دستبند زیبا امروز رسید'),null);
 assert.equal(parseTelegramCandidate('نام: دستبند تست'),null);
 const sample=parseTelegramCandidate('#HANIEL_SITE\nنام: دستبند تست\nشناسه: sample-bracelet\nدسته: دستبند\nوزن: 0.244\nعیار: 18\nاجرت: 10\nسود: 8\nتوضیح: عکس واقعی نمونه');
 assert.equal(sample.name,'دستبند تست');assert.equal(sample.slug,'sample-bracelet');
 assert.equal(sample.weightGrams,'0.244');assert.equal(sample.makingFeePercent,'10');
 assert.equal(sample.needsReview,true);
});
test('Telegram webhook refuses unauthorized traffic and another channel',async()=>{
 const url='https://example.com/api/v1/integrations/telegram';
 const env={DB:{},TELEGRAM_IMPORT_ENABLED:'1',TELEGRAM_WEBHOOK_SECRET:'sample_secret_DO_NOT_USE_LIVE',
  TELEGRAM_CHANNEL_ID:'-100991100'};
 const make=(body,secret)=>handle({request:new Request(url,{
  method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':secret},
  body:JSON.stringify(body)}),env});
 const sample={update_id:200,channel_post:{message_id:1,chat:{id:-100332211},
  text:'#HANIEL_SITE\nنام: تست'}};
 assert.equal((await make(sample,'wrong')).status,403);
 const r=await make(sample,'sample_secret_DO_NOT_USE_LIVE');
 assert.equal(r.status,200);assert.equal((await r.json()).ignored,'not_expected_channel');
});
test('only the supplied haniellgold channel username can create a draft',async()=>{
 const url='https://example.com/api/v1/integrations/telegram';
 const env={TELEGRAM_IMPORT_ENABLED:'1',TELEGRAM_WEBHOOK_SECRET:'test-secret',TELEGRAM_CHANNEL_USERNAME:'haniellgold',
  DB:{prepare(){return {bind(){return this;},async run(){return {meta:{changes:1}};}};}}};
 const send=async username=>{
  const res=await handle({request:new Request(url,{method:'POST',
   headers:{'X-Telegram-Bot-Api-Secret-Token':'test-secret'},
   body:JSON.stringify({update_id:345,channel_post:{message_id:11,chat:{id:-10022,username},
    caption:'#HANIEL_SITE\nنام: گردنبند واقعی'}}) }),env});
  return res.json();
 };
 assert.equal((await send('not_haniellgold')).ignored,'not_expected_channel');
 assert.equal((await send('haniellgold')).queuedForReview,true);
});
test('tagged messages go to moderation queue, duplicate delivery updates only pending draft',async()=>{
 const queries=[];
 const db={prepare(sql){const q={bind(...args){queries.push({sql,args});return this;},
 async run(){return {meta:{changes:1}};}};return q;}};
 const payload={update_id:990,channel_post:{message_id:23,chat:{id:-100991100},
  photo:[{file_id:'telegram-private-photo-id'}],
  caption:'#HANIEL_SITE\nنام: گردنبند نمونه\nشناسه: sample-necklace'}};
 const r=await telegramWebhook({request:new Request('https://example.com',{
  method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':'integration_test_only'},
  body:JSON.stringify(payload)}),env:{DB:db,TELEGRAM_IMPORT_ENABLED:'1',
  TELEGRAM_WEBHOOK_SECRET:'integration_test_only',TELEGRAM_CHANNEL_ID:'-100991100'}});
 assert.equal(r.status,200);
 assert.equal((await r.json()).queuedForReview,true);
 assert.match(queries[0].sql,/review_status='pending'/);
 assert.equal(queries[0].args[0],'-100991100');
 assert.equal(queries[0].args[5],'telegram-private-photo-id');
 assert.ok(!queries[0].sql.includes('published=1'));
});
test('D1 migration contains audit events and no payment collection fields',()=>{
 const sql=readFileSync(new URL('../cloudflare/0003_inquiry_telegram.sql',import.meta.url),'utf8');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS purchase_inquiries/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS purchase_inquiry_events/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS telegram_product_drafts/);
 assert.doesNotMatch(sql,/payment_card|bank_password|payment_verified/);
});
