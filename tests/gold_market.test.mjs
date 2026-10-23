import test from 'node:test';
import assert from 'node:assert/strict';
import {
 SERVIX_URL,parseServixQuote,fetchServix,calculatePrice,MarketError,
 marketPublic,approvePricingPolicy
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
  {...valid,value:1.5},
  {...valid,businessTime:'2026-10-23T07:55:00'},
  {...valid,businessTime:'2026-10-23T07:00:00Z'},
  {...valid,businessTime:'2026-10-23T09:00:00Z'},
  {...valid,stale:true}
 ]) assert.throws(()=>parseServixQuote(item,now),MarketError);
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
