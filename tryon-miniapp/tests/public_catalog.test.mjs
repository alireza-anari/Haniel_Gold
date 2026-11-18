import { test } from 'node:test';
import assert from 'node:assert/strict';
import { customerApi } from '../src/index.js';

const SKU='HG-D0EB66B628D3';
const PNG=Uint8Array.from([...([137,80,78,71,13,10,26,10]),...new Array(40).fill(0)]);
const item={sku:SKU,name:'نمونه آزمایشی',product_type:'necklace',cutout_mime:'image/png',cutout_blob:PNG,approved:1,reviewed_at:'2026-11-18'};
const request=(uri,method='GET')=>new Request('https://tryon.example.test'+uri,{method});
function fixture(row=item){
 const queries=[];
 const db={prepare(sql){queries.push(sql);return {bind(){return this},async first(){return row}}}};
 return {db,queries};
}
test('public health has no manager data',async()=>{
 const res=await customerApi(request('/api/health'),{});
 assert.equal(res.status,200);
 assert.deepEqual(await res.json(),{status:'ok',service:'haniel-tryon-public'});
});
test('disabled public catalog fails closed',async()=>{
 const {db}=fixture();
 const res=await customerApi(request('/api/v1/products/'+SKU),{CATALOG_DB:db,TRYON_PUBLIC_ENABLED:'0'});
 assert.equal(res.status,404);
});
test('only allowlisted product fields are returned; no financial data',async()=>{
 const {db,queries}=fixture({...item,purchase_gold_rate:'1234567',supplier:'PRIVATE'});
 const res=await customerApi(request('/api/v1/products/'+SKU),{CATALOG_DB:db,TRYON_PUBLIC_ENABLED:'1'});
 assert.equal(res.status,200);
 const payload=await res.json();
 assert.deepEqual(Object.keys(payload).sort(),['sku','name','productType','assetUrl'].sort());
 assert.equal(payload.sku,SKU);
 assert.equal(queries.length,1);
 assert.match(queries[0],/FROM tryon_public_catalog/);
 for(const secret of ['sales','supplier','purchase_gold_rate','images','users','haniel-gold-db']){
  assert.equal(queries[0].includes(secret),false);
  assert.equal(JSON.stringify(payload).includes(secret),false);
 }
});
test('only approved products may be fetched',async()=>{
 for(const row of [null,{...item,approved:0},{...item,reviewed_at:null}]){
  const {db}=fixture(row);
  const res=await customerApi(request('/api/v1/products/'+SKU),{CATALOG_DB:db,TRYON_PUBLIC_ENABLED:'1'});
  assert.equal(res.status,404);
 }
});
test('image bytes served for a valid approved cutout',async()=>{
 const {db}=fixture();
 const res=await customerApi(request('/api/v1/assets/'+SKU),{CATALOG_DB:db,TRYON_PUBLIC_ENABLED:'1'});
 assert.equal(res.status,200);
 assert.equal(res.headers.get('content-type'),'image/png');
 assert.equal((await res.arrayBuffer()).byteLength,PNG.length);
});
test('rejects invalid MIME, image signature and unapproved asset',async()=>{
 for(const row of [{...item,cutout_mime:'image/jpeg'},{...item,cutout_blob:Uint8Array.from(new Array(50).fill(0))}]){
  const {db}=fixture(row);
  const res=await customerApi(request('/api/v1/assets/'+SKU),{CATALOG_DB:db,TRYON_PUBLIC_ENABLED:'1'});
  assert.equal(res.status,404);
 }
});
test('no customer-accessible write methods or manager/accounting routes',async()=>{
 const {db}=fixture();
 for(const path of ['/api/products','/api/sales','/api/session','/api/export','/api/tryon/admin/assets','/api/v1/products/foo']){
  const res=await customerApi(request(path),{CATALOG_DB:db,TRYON_PUBLIC_ENABLED:'1'});
  assert.equal(res.status,404);
 }
 const res=await customerApi(request('/api/v1/products/'+SKU,'POST'),{CATALOG_DB:db,TRYON_PUBLIC_ENABLED:'1'});
 assert.equal(res.status,404);
});
test('catalog read failures never fall back to private manager records',async()=>{
 const db={prepare(){throw Error('no such table')}};
 const res=await customerApi(request('/api/v1/products/'+SKU),{CATALOG_DB:db,TRYON_PUBLIC_ENABLED:'1'});
 assert.equal(res.status,503);
});
