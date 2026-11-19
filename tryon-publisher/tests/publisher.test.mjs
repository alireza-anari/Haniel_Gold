import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publishApi} from '../src/publisher.mjs';
import {validRgbaPng} from '../src/images.mjs';
const SKU='HG-AAAAAAAAAAAA';
const B64='iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAABI0lEQVR42u2a0RXCMAhFCyM5hws5gQs5hyvpBq0mPALtvb89DfAKCU2ybQAAAAAXxbINvp63z97z++NtpxLgKOAj1IJY1cCzhLDqgauF8E7BK2x4p+AVtizboaMUjhwrRYBfHB51VDl2SAmoHfzl3dlyMFXw0bO1yl7oKqBcs1V9gEd/DWXntjf2aCl4l+BVIvh2cbx6japteVT6V+FfH73b14+2yRxwpvQf8dU7pn+kbUoAARAAARAAARAgr/de2fdPCbCy4VE2SJRAlVRcZdNVqdXl/+DyR2PMAZEptvp0eKREPbrOlCIotuS9eo2qhTW1U7Mrh9rGVAaoT28zBOaCRMc+ILIp42isqmNZNrgoWb1vb3tVdlSQThsvAAAAAK35ArDjuFB5XQbIAAAAAElFTkSuQmCC';
const PNG=Uint8Array.from(Buffer.from(B64,'base64'));
const ok=async()=>({ok:true,owner:'owner@example.test'});
const denied=async()=>({ok:false,reason:'NO_TOKEN'});
const req=(path,method='GET',data,origin='https://private.example.test')=>new Request('https://private.example.test'+path,{
 method,headers:{...(data?{'content-type':'application/json'}:{}),...(method==='PUT'?{origin}:{})},
 ...(data?{body:JSON.stringify(data)}:{})
});
const draft={action:'draft',productType:'necklace',sourceImageId:7,cutoutBase64:B64};
function fixture(){
 const calls={source:[],catalog:[]},state={asset:null,approved:false};
 const source={prepare(sql){calls.source.push(sql);return {bind(){return this},async first(){
  if(sql.includes('FROM products'))return {id:5,sku:SKU,name:'محصول آزمایشی'};
  if(sql.includes('FROM images'))return {mime:'image/png',image_blob:PNG};
  return null;
 },async all(){return {results:sql.includes('FROM images')?[{id:7,mime:'image/png'}]:[{sku:SKU,name:'محصول آزمایشی'}]}}}}};
 const catalog={prepare(sql){calls.catalog.push(sql);return {args:[],bind(...args){this.args=args;return this},
  async first(){return state.asset;},async all(){return {results:state.asset?[{sku:SKU,name:'محصول آزمایشی',product_type:'necklace',approved:state.approved?1:0}]:[]}},
  async run(){
   if(sql.startsWith('INSERT')){state.asset={product_type:this.args[2],cutout_mime:this.args[3],cutout_blob:this.args[4],source_image_id:this.args[5],source_mime:this.args[6],source_blob:this.args[7]};state.approved=false;}
   if(sql.includes('SET approved=1'))state.approved=true;
   if(sql.includes('SET approved=0'))state.approved=false;
   return {success:true,meta:{changes:1}};
  }
 }}};
 return {env:{SOURCE_DB:source,CATALOG_DB:catalog},state,calls};
}
async function pub(f,path,method='GET',data,origin){return publishApi(req(path,method,data,origin),f.env,{verify:ok});}
const path='/admin/api/catalog/'+SKU;
test('test PNG fixture has correct real RGBA signature',()=>assert.equal(validRgbaPng(PNG),true));
test('not authenticated: no DB queries or private images',async()=>{
 const f=fixture();const r=await publishApi(req('/admin/api/products'),f.env,{verify:denied});
 assert.equal(r.status,403);assert.deepEqual(f.calls,{source:[],catalog:[]});
});
test('missing binding fails closed',async()=>{
 const r=await publishApi(req('/admin/api/products'),{SOURCE_DB:{}},{verify:ok});
 assert.equal(r.status,503);
});
test('product list only selects name and SKU from manager',async()=>{
 const f=fixture();const res=await pub(f,'/admin/api/products?q=HG-');
 assert.equal(res.status,200);assert.deepEqual(await res.json(),{items:[{sku:SKU,name:'محصول آزمایشی'}]});
 assert.ok(f.calls.source.every(x=>x.trim().startsWith('SELECT')));
});
test('owner can select only images belonging to selected product',async()=>{
 const f=fixture();const res=await pub(f,'/admin/api/products/'+SKU+'/images');
 assert.equal(res.status,200);assert.deepEqual((await res.json()).images,[{id:7,mime:'image/png'}]);
 const img=await pub(f,'/admin/api/products/'+SKU+'/images/7');
 assert.equal(img.status,200);assert.equal(img.headers.get('content-type'),'image/png');
 assert.ok(f.calls.source.some(x=>x.includes('WHERE id=? AND product_id=?')));
});
test('CSRF origin is mandatory for writes',async()=>{
 const f=fixture();const res=await pub(f,path,'PUT',draft,'https://attacker.invalid');
 assert.equal(res.status,403);assert.equal(f.calls.source.length,0);assert.equal(f.calls.catalog.length,0);
});
test('draft is unapproved, source DB is SELECT-only',async()=>{
 const f=fixture();const res=await pub(f,path,'PUT',draft);
 assert.equal(res.status,200);assert.deepEqual(await res.json(),{sku:SKU,approved:false,state:'draft'});
 assert.equal(f.state.approved,false);assert.ok(f.calls.source.every(x=>x.startsWith('SELECT')));
});
test('invalid PNG never writes a draft',async()=>{
 const f=fixture();const res=await pub(f,path,'PUT',{...draft,cutoutBase64:'invalid'});
 assert.equal(res.status,422);assert.equal(f.calls.catalog.length,0);
});
test('rejected approval missing visual confirmation',async()=>{
 const f=fixture();await pub(f,path,'PUT',draft);
 const r=await pub(f,path,'PUT',{action:'approve',confirmSku:SKU,confirmVisualReview:false});
 assert.equal(r.status,400);assert.equal(f.state.approved,false);
});
test('owner can fetch both stored images for comparison',async()=>{
 const f=fixture();await pub(f,path,'PUT',draft);
 for(const name of ['source-photo','cutout']){
  const res=await pub(f,path+'/'+name);assert.equal(res.status,200);
  assert.equal(res.headers.get('content-type'),'image/png');
  assert.ok((await res.arrayBuffer()).byteLength>100);
 }
});
test('approved publication requires matching reviewed binary hash and SKU',async()=>{
 const f=fixture();await pub(f,path,'PUT',draft);
 const review=await pub(f,path+'/review');const {fingerprint}=await review.json();
 assert.match(fingerprint,/^[a-f0-9]{64}$/);
 const res=await pub(f,path,'PUT',{action:'approve',confirmSku:SKU,confirmVisualReview:true,confirmReviewHash:fingerprint});
 assert.equal(res.status,200);assert.equal((await res.json()).approved,true);assert.equal(f.state.approved,true);
});
test('wrong image review hash fails closed',async()=>{
 const f=fixture();await pub(f,path,'PUT',draft);
 const res=await pub(f,path,'PUT',{action:'approve',confirmSku:SKU,confirmVisualReview:true,confirmReviewHash:'0'.repeat(64)});
 assert.equal(res.status,409);assert.equal(f.state.approved,false);
});
test('revoke disables public item but never updates private source',async()=>{
 const f=fixture();await pub(f,path,'PUT',draft);
 const rev=await pub(f,path,'PUT',{action:'revoke'});
 assert.equal(rev.status,200);assert.equal((await rev.json()).approved,false);assert.ok(f.calls.source.every(x=>x.startsWith('SELECT')));
});
test('unrecognized route cannot access manager/accounting APIs',async()=>{
 const f=fixture();for(const route of ['/api/sales','/api/users','/api/prices','/admin/api/sales']){
  const res=await pub(f,route);assert.equal(res.status,404);
 }
});
