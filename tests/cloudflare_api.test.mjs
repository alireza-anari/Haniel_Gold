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
