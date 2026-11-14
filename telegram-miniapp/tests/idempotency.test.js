import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { insertSaleIdempotently } from '../src/index.js';

function lookupDb(existing){
 return {prepare(sql){return {
  bind(){return this;},
  async first(){assert.match(sql,/SELECT id,request_fingerprint,final_price,net_profit FROM sales WHERE idempotency_key=\?/);return existing;}
 }}};
}
test('first sale request inserts once',async()=>{
 const result=await insertSaleIdempotently(lookupDb(null),{run:async()=>({meta:{last_row_id:42}})},'a','fingerprint-a');
 assert.equal(result.inserted,true);
 assert.equal(result.result.meta.last_row_id,42);
});
test('retry with same idempotency key and same payload returns the original sale',async()=>{
 const original={id:42,request_fingerprint:'fingerprint-a',final_price:'259439000',net_profit:'44939000'};
 let attempts=0;
 const result=await insertSaleIdempotently(lookupDb(original),{run:async()=>{attempts++;throw Error('UNIQUE constraint failed: sales.idempotency_key')}},'same-key','fingerprint-a');
 assert.equal(attempts,1);
 assert.equal(result.inserted,false);
 assert.equal(result.sale.id,42);
 assert.equal(result.sale.final_price,'259439000');
});
test('reusing an idempotency key for a different payload returns HTTP 409',async()=>{
 const original={id:42,request_fingerprint:'fingerprint-a',final_price:'259439000',net_profit:'44939000'};
 await assert.rejects(
  insertSaleIdempotently(lookupDb(original),{run:async()=>{throw Error('UNIQUE constraint failed')}},'same-key','fingerprint-b'),
  e=>e.status===409
 );
});
test('stock errors are not mistaken for duplicate requests',async()=>{
 const failure=Error('INSUFFICIENT_STOCK');
 await assert.rejects(insertSaleIdempotently(lookupDb(null),{run:async()=>{throw failure}},'new-key','fingerprint-a'),e=>e===failure);
});
