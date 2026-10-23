import test from 'node:test';
import assert from 'node:assert/strict';
import {
 SERVIX_URL,parseServixQuote,fetchServix,calculatePrice,MarketError,
 marketPublic,approvePricingPolicy,syncRate,normalizeRialValue
} from '../functions/_lib/gold-market.js';

const now=Date.parse('2026-10-23T08:00:00Z');
const valid={code:'GOLD_18_RLS',quoteUnit:'RLS',value:'123456780',businessTime:'2026-10-23T07:55:00Z'};
test('official Servix symbol, unit and source timestamp are verified',()=>{
 assert.deepEqual(parseServixQuote(valid,now),{rialPerGram:123456780,observedAt:now-5*60_000});
 for(const item of [
  {...valid,code:'GOLD_24_RLS'},
  {...valid,quoteUnit:'TOMAN'},
  {...valid,value:'NaN'},
  {...valid,value:-1},
  {...valid,value:null},
  {...valid,value:'invalid'},
  {...valid,value:'270,128,875.50'},
  {...valid,value:-1.5},
  {...valid,value:Infinity},
  {...valid,value:0},
  {...valid,value:'0.001'},
  {...valid,businessTime:'2026-10-23T07:55:00'},
  {...valid,businessTime:'2026-10-23T07:00:00Z'},
  {...valid,businessTime:'2026-10-23T09:00:00Z'},
  {...valid,stale:true}
 ]) assert.throws(()=>parseServixQuote(item,now),MarketError);
});
test('Servix numerical JSON decimals round to the nearest whole rial (half up)',()=>{
 // All values below are SYNTHETIC, not quotes from the real provider.
 for(const [received,expected] of [
  [270128875.5,270128876],
  ['270128875.50',270128876],
  [270128875.49,270128875],
  ['270128875.0000',270128875],
  [270128875,270128875],
  ['270128875',270128875],
  [0.5,1]
 ]){
  assert.equal(normalizeRialValue(received),expected);
  assert.equal(parseServixQuote({...valid,value:received},now).rialPerGram,expected);
 }
});
test('no fabricated quote from null, locale formatted or unsafe values',()=>{
 for(const invalid of [null,undefined,'','270,128,875.5','NaN',NaN,Infinity,
  -100,0,'0','0.49',true,{},[],Number.MAX_SAFE_INTEGER+100]){
  assert.equal(normalizeRialValue(invalid),null);
  assert.throws(()=>parseServixQuote({...valid,value:invalid},now),MarketError);
 }
 assert.throws(()=>parseServixQuote({...valid,value:null},now),{code:'MISSING_VALUE'});
 assert.throws(()=>parseServixQuote({...valid,value:'270,128,875.50'},now),{code:'BAD_AMOUNT'});
});
test('a Servix HTTP request uses only X-API-Key, not query strings',async()=>{
 let called=0;
 const observed=await fetchServix({SERVIX_API_KEY:'fake-test-api-key'},async (url,opts)=>{
  called++;assert.equal(url,SERVIX_URL);
  assert.equal(opts.headers['X-API-Key'],'fake-test-api-key');
  assert.equal(opts.redirect,'manual');
  return {status:200,headers:new Headers(),async text(){return JSON.stringify(valid);}};
 },now);
 assert.equal(called,1);assert.equal(observed.rialPerGram,123456780);
});
test('quota is detected, not retried, and invalid key does not make requests',async()=>{
 await assert.rejects(()=>fetchServix({SERVIX_API_KEY:'fake-test-api-key'},async()=>({status:429}),now),{code:'QUOTA'});
 await assert.rejects(()=>fetchServix({},async()=>assert.fail('should never call provider'),now),{code:'NOT_CONFIGURED'});
});
test('product pricing uses half-up BigInt accounting on approved 18K weight and fees',()=>{
 // SYNTHETIC fixture only; never a market quote.
 const product={karat:18,weight_mg:244,making_fee_bps:1000,profit_bps:800};
 const p=calculatePrice(product,100000000,900);
 // raw: 0.244 * 10,000,000 toman = 2,440,000
 // work 10% = 244,000; profit 8% * (raw+work) = 214,720
 // tax 9% * (work+profit) = 41,285 (HALF_UP)
 assert.deepEqual(p,{
  amountToman:2940005,
  breakdown:{rawGoldToman:2440000,makingFeeToman:244000,profitToman:214720,taxToman:41285},
  currency:'TOMAN',source:'servix_18k'
 });
});
test('missing/other karat or policy values never produce automatic pricing',()=>{
 const p={karat:18,weight_mg:244,making_fee_bps:1000,profit_bps:800};
 assert.equal(calculatePrice({...p,karat:21},100000000,900),null);
 assert.equal(calculatePrice({...p,making_fee_bps:null},100000000,900),null);
 assert.equal(calculatePrice({...p,weight_mg:null},100000000,900),null);
 assert.equal(calculatePrice(p,100000000,null),null);
});
test('policy cannot be approved without owner review',async()=>{
 await assert.rejects(()=>approvePricingPolicy({DB:{prepare(){throw Error('Must not write');}}},{
  taxPercent:9,maxRateChangePercent:5,taxBasis:'fee_profit',confirmReviewed:false
 },now),{code:'POLICY_INVALID'});
});
test('public market stays unavailable when the database is missing',async()=>{
 const info=await marketPublic({});
 assert.equal(info.tomanPerGram,null);
 assert.equal(info.pricingReady,false);
});


test('scheduled sync records a safe AUTH code after provider rejection without exposing secrets',async()=>{
 let recorded='';
 const env={SERVIX_API_KEY:'fake-test-api-key',DB:{prepare(sql){
  return {bind(...args){this.args=args;return this;},
   async first(){assert.match(sql,/SELECT \* FROM gold_market_state/);return {version:0,last_attempt_at:null,paused_until:null};},
   async run(){
    if(sql.includes('last_error='))recorded=this.args[0];
    return {meta:{changes:1}};
   }};
 }}};
 const r=await syncRate(env,{now,fetcher:async()=>({status:401})});
 assert.equal(r.status,'failed');
 assert.equal(r.errorCode,'AUTH');
 assert.equal(recorded,'AUTH');
 assert.doesNotMatch(JSON.stringify(r),/fake-test-api-key/);
});
test('scheduled sync uses quota status distinctly from provider errors',async()=>{
 let recorded='',pause=null;
 const env={SERVIX_API_KEY:'fake-test-api-key',DB:{prepare(sql){
  return {bind(...args){this.args=args;return this;},
   async first(){return {version:0,last_attempt_at:null,paused_until:null};},
   async run(){if(sql.includes('last_error=')){recorded=this.args[0];pause=this.args[1];}
    return {meta:{changes:1}};}};
 }}};
 const r=await syncRate(env,{now,fetcher:async()=>({status:429})});
 assert.equal(r.status,'quota_exceeded');
 assert.equal(r.errorCode,'QUOTA');
 assert.equal(recorded,'QUOTA');
 assert.equal(pause,now+24*60*60*1000);
});
