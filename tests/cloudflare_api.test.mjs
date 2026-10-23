import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../functions/_lib/cloudflare-api.js';

const call = (path, env = {}) => handle({
  request: new Request('https://haniel-gold.pages.dev' + path, {method:'GET'}), env
});

test('health does not claim D1 when it is disconnected', async () => {
  const r = await call('/api/v1/health');
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.runtime, 'cloudflare-pages-functions');
  assert.equal(body.database, false);
});
test('public catalogue fails closed without D1', async () => {
  const r = await call('/api/v1/catalog/products');
  assert.equal(r.status, 503);
  assert.equal(r.headers.get('cache-control'), 'no-store');
});
test('unpublished products are not leaked, expired pricing is never public', async () => {
  const d = {
    prepare(q) {
      assert.match(q,/p.published=1/);
      return {bind(){return this;},async all(){
        return {results:[{
          slug:'real-pendant',name:'نمونه تست بدون قیمت',category_title:'آویز',
          category_id:1,style:'مینیمال',description:'',weight_mg:1500,karat:18,
          making_fee_bps:null,profit_bps:null,inventory_count:1,
          published:1,price_toman:999999,price_verified_at:Date.now()-3600000,
          price_valid_until:Date.now()-1000,updated_at:Date.now()
        }]};
      }};
    }
  };
  // Return no photos on the second SELECT.
  let calls=0;
  d.prepare=q=>{
    calls++;
    if(calls===1)assert.match(q,/p.published=1/);
    return {bind(){return this;},async all(){
      return {results:calls===1?[{
        slug:'real-pendant',name:'محصول برای تست',category_title:'آویز',
        category_id:1,style:'مینیمال',description:'',weight_mg:1500,karat:18,
        making_fee_bps:null,profit_bps:null,inventory_count:1,published:1,
        price_toman:999999,price_verified_at:Date.now()-3600000,
        price_valid_until:Date.now()-1000,updated_at:Date.now()
      }]:[]};
    }};
  };
  const r=await call('/api/v1/catalog/products',{DB:d});
  assert.equal(r.status,200);
  const {items}=await r.json();
  assert.equal(items.length,1);
  assert.equal(items[0].price.amountToman,null);
  assert.equal(Object.hasOwn(items[0],'priceToman'),false);
});
test('missing market integration does not invent a gold rate',async()=>{
  const r=await call('/api/v1/market/gold',{DB:{}});
  assert.equal(r.status,503);
  assert.equal((await r.json()).priceToman,null);
});
