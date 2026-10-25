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
  // The gold-market D1 lookups must not consume the catalogue's mocked rows.
  let catalogueCalls=0;
  d.prepare=q=>{
    if(q.includes('gold_market_state')||q.includes('pricing_policy'))
      return {bind(){return this;},async first(){return null;}};
    const isProducts=q.includes('FROM products p JOIN categories c');
    if(isProducts){catalogueCalls++;assert.match(q,/p.published=1/);}
    return {bind(){return this;},async all(){
      return {results:isProducts?[{
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


test('free Workers KV serves uploaded product images without R2',async()=>{
 const uuid='01234567-89ab-4cde-ab12-0123456789ab';
 const bytes=Uint8Array.from([137,80,78,71,13,10,26,10,1,2,3,4]).buffer;
 const requested='/api/v1/media/products/'+uuid+'.png';
 const r=await call(requested,{DB:{},MEDIA_KV:{
   async getWithMetadata(key,type) {
     assert.equal(type,'arrayBuffer');
     assert.equal(key,'products/'+uuid+'.png');
     return {value:bytes,metadata:{contentType:'image/png'}};
   }
 }});
 assert.equal(r.status,200);
 assert.equal(r.headers.get('content-type'),'image/png');
 assert.deepEqual(Array.from(new Uint8Array(await r.arrayBuffer())),Array.from(new Uint8Array(bytes)));
});
test('missing KV binding fails closed with setup error',async()=>{
 const r=await call('/api/v1/media/products/01234567-89ab-4cde-ab12-0123456789ab.png',{DB:{}});
 assert.equal(r.status,503);
});
test('admin image upload stores validated binary in KV and returns same-origin relative URL',async()=>{
 const now=Date.now(), cs='csrf-example',secret='local-test-only-strong-secret-is-not-live-abcdef';
 const token='A'.repeat(43);
 let saved=null;
 const DB={prepare(sql){
   assert.match(sql,/SELECT csrf_token,expires_at FROM admin_sessions/);
   return {bind(){return this;},async first(){return {csrf_token:cs,expires_at:now+60_000};}};
 }};
 const data=new FormData();
 data.append('file',new Blob([Uint8Array.from([137,80,78,71,13,10,26,10,...Array(30).fill(0)])],{type:'image/png'}),'photo.png');
 const res=await handle({
   request:new Request('https://haniel-gold.pages.dev/api/v1/admin/uploads',{
     method:'POST',headers:{'origin':'https://haniel-gold.pages.dev','cookie':'haniel_admin_session='+token,'x-haniel-csrf':cs},
     body:data
   }),
   env:{DB,ADMIN_SESSION_SECRET:secret,MEDIA_KV:{async put(key,buffer,options){saved={key,buffer,options};}}}
 });
 assert.equal(res.status,201);
 const output=await res.json();
 assert.match(output.url,/^\/api\/v1\/media\/products\/[a-f0-9-]{36}\.png$/);
 assert.equal(output.storage,'kv');
 assert.equal(saved.options.metadata.contentType,'image/png');
 assert.equal(saved.key,output.url.replace('/api/v1/media/',''));
 assert.equal(saved.buffer.byteLength,38);
});


test('Cloudflare catalogue calculates independent fee and profit amounts for each product', async()=>{
 const now=Date.now();
 const rows=[
  {slug:'gold-item-one',name:'محصول اول',category_title:'دستبند',category_id:1,
   style:'مینیمال',description:'',weight_mg:1000,karat:18,making_fee_bps:1000,profit_bps:800,
   inventory_count:2,published:1,price_toman:null,price_verified_at:null,price_valid_until:null,updated_at:now},
  {slug:'gold-item-two',name:'محصول دوم',category_title:'دستبند',category_id:1,
   style:'مینیمال',description:'',weight_mg:1000,karat:18,making_fee_bps:2000,profit_bps:500,
   inventory_count:1,published:1,price_toman:null,price_verified_at:null,price_valid_until:null,updated_at:now}
 ];
 const mock={prepare(query){
  const statement={
   bind(){return this;},
   async first(){
    if(query.includes('gold_market_state'))return {blocked:0,valid_until:now+20*60_000,
      observed_at:now-60_000,rate_rial_per_gram:100000000};
    if(query.includes('pricing_policy'))return {approved:1,tax_basis:'fee_profit',tax_bps:0};
    throw Error('Unexpected SQL first '+query);
   },
   async all(){
    if(query.includes('FROM products p JOIN categories c'))return {results:rows};
    if(query.includes('FROM product_images'))return {results:[]};
    throw Error('Unexpected SQL all '+query);
   }
  };
  return statement;
 }};
 const r=await call('/api/v1/catalog/products',{DB:mock});
 assert.equal(r.status,200);
 const {items}=await r.json();
 assert.equal(items.length,2);
 assert.equal(items[0].price.source,'servix_18k');
 assert.equal(items[1].price.source,'servix_18k');
 assert.equal(items[0].price.breakdown.rawGoldToman,10000000);
 assert.equal(items[1].price.breakdown.rawGoldToman,10000000);
 assert.equal(items[0].price.breakdown.makingFeeToman,1000000);
 assert.equal(items[1].price.breakdown.makingFeeToman,2000000);
 assert.equal(items[0].price.breakdown.profitToman,880000);
 assert.equal(items[1].price.breakdown.profitToman,600000);
 assert.notEqual(items[0].price.amountToman,items[1].price.amountToman);
});
test('no auto calculation is published with an unapproved global tax policy',async()=>{
 const now=Date.now(),item={slug:'gold-item',name:'محصول',category_title:'دستبند',
  category_id:1,style:'مینیمال',description:'',weight_mg:1000,karat:18,making_fee_bps:1000,
  profit_bps:800,inventory_count:2,published:1,price_toman:null,price_verified_at:null,
  price_valid_until:null,updated_at:now};
 const mock={prepare(query){return {bind(){return this;},async first(){
  if(query.includes('gold_market_state'))return {blocked:0,valid_until:now+20*60_000,observed_at:now-60_000,rate_rial_per_gram:100000000};
  if(query.includes('pricing_policy'))return {approved:0,tax_basis:null,tax_bps:null};
  return null;
 },async all(){return {results:query.includes('FROM products p JOIN categories c')?[item]:[]};}};}};
 const r=await call('/api/v1/catalog/products',{DB:mock});
 assert.equal(r.status,200);
 const {items}=await r.json();
 assert.equal(items[0].price.amountToman,null);
 assert.equal(items[0].price.source,null);
});


test('fresh manually entered staging price never appears as public price when Servix is unavailable',async()=>{
 const now=Date.now(),row={slug:'staging-manual',name:'دستبند تست',category_title:'دستبند',category_id:1,
  style:'مینیمال',description:'',weight_mg:1000,karat:18,making_fee_bps:1000,profit_bps:800,
  inventory_count:1,published:1,price_toman:5000000,price_verified_at:now-60000,
  price_valid_until:now+1800000,updated_at:now};
 const DB={prepare(sql){return {bind(){return this;},
  async first(){return null;},
  async all(){return {results:sql.includes('FROM products p JOIN categories c')?[row]:[]};}
 };}};
 const r=await call('/api/v1/catalog/products?limit=4',{DB});
 assert.equal(r.status,200);
 const out=await r.json();
 assert.equal(out.items.length,1);
 assert.equal(out.items[0].price.amountToman,null);
 assert.equal(out.items[0].price.source,null);
 assert.equal(out.items[0].price.validUntil,null);
});

test('authorized unpublish route changes only published flag and timestamp, never deletes product data',async()=>{
 const secret='local-test-only-strong-secret-is-not-live-abcdef';
 const token='A'.repeat(43),csrf='review-only-csrf';
 const queries=[],runs=[];
 const DB={prepare(sql){
  queries.push(sql);
  return {
   bind(...args){this.args=args;return this;},
   async first(){return {csrf_token:csrf,expires_at:Date.now()+60_000};},
   async run(){runs.push({sql,args:this.args});return {meta:{changes:1}};}
  };
 }};
 const base='https://haniel-gold.pages.dev';
 const response=await handle({
  request:new Request(base+'/api/v1/admin/products/Arrow',{
   method:'DELETE',
   headers:{origin:base,cookie:'haniel_admin_session='+token,'x-haniel-csrf':csrf}
  }),
  env:{DB,ADMIN_SESSION_SECRET:secret}
 });
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{unpublished:true,slug:'Arrow'});
 assert.equal(runs.length,1);
 assert.match(runs[0].sql,/^UPDATE products SET published=0,updated_at=\? WHERE slug=\?$/);
 assert.equal(runs[0].args[1],'Arrow');
 assert.doesNotMatch(runs[0].sql,/DELETE FROM|price|weight|image|name|description|making|profit/i);
 assert.ok(queries.some(q=>q.includes('admin_sessions')));
});
test('unpublish route refuses anonymous requests without changing data',async()=>{
 let didWrite=false;
 const res=await handle({
  request:new Request('https://haniel-gold.pages.dev/api/v1/admin/products/Arrow',{method:'DELETE'}),
  env:{DB:{prepare(){didWrite=true;throw Error('unexpected DB access');}},ADMIN_SESSION_SECRET:'local-test-only-strong-secret-is-not-live-abcdef'}
 });
 assert.equal(res.status,401);
 assert.equal(didWrite,false);
});
