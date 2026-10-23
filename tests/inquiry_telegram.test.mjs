import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inquiryClock,publicInquiry} from '../functions/_lib/request-inquiries.js';
import {parseTelegramCandidate,telegramWebhook} from '../functions/_lib/telegram-drafts.js';
import {handle} from '../functions/_lib/cloudflare-api.js';

test('inquiries open precisely at 10:00 and close exactly at 17:00 Asia/Tehran',()=>{
 const at=hour=>new Date('2026-10-23T'+hour+'Z').getTime();
 assert.equal(inquiryClock(at('06:29:00')).withinHours,false);
 assert.equal(inquiryClock(at('06:30:00')).withinHours,true);
 assert.equal(inquiryClock(at('13:29:00')).withinHours,true);
 assert.equal(inquiryClock(at('13:30:00')).withinHours,false);
 assert.equal(inquiryClock().timezone,'Asia/Tehran');
});
test('supplier weekday schedule must be explicit before intake can activate',async()=>{
 const env={DB:{},REQUESTS_ENABLED:'1',TURNSTILE_SECRET:'test',TURNSTILE_SITE_KEY:'public-test',INQUIRY_RATE_SALT:'abcdefghabcdefghabcdefgh'};
 const url='https://example.com/api/v1/inquiries/settings';
 let response=await handle({request:new Request(url),env});
 assert.equal((await response.json()).enabled,false);
 env.INQUIRY_OPEN_DAYS='FRI';
 response=await handle({request:new Request(url),env});
 const data=await response.json();
 assert.equal(data.enabled,true);
 assert.deepEqual(data.days,['fri']);
});
test('payment-less request intake is disabled unless actively opted in',async()=>{
 const r=await handle({request:new Request('https://example.com/api/v1/inquiries',{
  method:'POST',body:JSON.stringify({name:'نام معتبر'})}),env:{DB:{}}});
 assert.equal(r.status,503);assert.equal((await r.json()).code,'NOT_ENABLED');
});
test('request settings never reveal secrets or imply stock is reserved',async()=>{
 const env={DB:{},REQUESTS_ENABLED:'1',TURNSTILE_SECRET:'PRIVATE',
  TURNSTILE_SITE_KEY:'public-test-site-key',INQUIRY_RATE_SALT:'01234567890123456789012345',INQUIRY_OPEN_DAYS:'sat,sun,mon,tue,wed,thu,fri'};
 const result=await handle({request:new Request('https://example.com/api/v1/inquiries/settings'),env});
 assert.equal(result.status,200);
 const x=await result.json();
 assert.equal(x.enabled,true);assert.equal(x.open,'10:00');assert.equal(x.close,'17:00');
 assert.equal(x.turnstileSiteKey,'public-test-site-key');
 assert.equal(JSON.stringify(x).includes('PRIVATE'),false);
 assert.match(x.notice,/قطعی نیست/);
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
