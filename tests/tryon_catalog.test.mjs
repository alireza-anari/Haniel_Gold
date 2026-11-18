import test from 'node:test';
import assert from 'node:assert/strict';
import {validAssetUrl,validSlug,validProductType,tryonPublicProduct,tryonAdminAsset} from '../functions/_lib/tryon-assets.js';
const good='/api/v1/media/products/12345678-1234-1234-1234-123456789abc.webp';
const data={slug:'rose-necklace',name:'گردنبند رز',asset_url:good,product_type:'necklace'};
const publicContext=(row)=>({env:{DB:{prepare:()=>({bind:()=>({first:async()=>row})})}}});
const body=async r=>r.json();
test('accepts same-origin approved image paths; rejects unsafe URLs and names',()=>{
 assert.equal(validAssetUrl(good),true);
 for(const v of ['https://evil.com/a.webp','/api/v1/media/products/x.webp','/api/v1/media/products/12345678-1234-1234-1234-123456789abc.jpg','//evil.com/x.webp','/api/v1/media/products/12345678-1234-1234-1234-123456789abc.webp?x=1'])assert.equal(validAssetUrl(v),false);
 assert.equal(validSlug('rose-necklace'),true);assert.equal(validSlug('../secret'),false);
 assert.equal(validProductType('necklace'),true);assert.equal(validProductType('t-shirt'),false);
});
test('public returns only approved server-side SKU records, never unpublished data',async()=>{
 const a=await tryonPublicProduct(publicContext(data),'rose-necklace');
 assert.equal(a.status,200);assert.deepEqual(await body(a),{slug:'rose-necklace',name:'گردنبند رز',assetUrl:good,productType:'necklace',productUrl:'/#/product/rose-necklace',status:'approved'});
 const notFound=await tryonPublicProduct(publicContext(null),'rose-necklace');assert.equal(notFound.status,404);
 const invalid=await tryonPublicProduct(publicContext(data),'../secret');assert.equal(invalid.status,404);
 const missing=await tryonPublicProduct({env:{DB:{prepare:()=>{throw Error('no migration');}}}},'rose-necklace');assert.equal(missing.status,503);
});
test('admin cannot approve a product asset without explicit review or correct data',async()=>{
 const ctx=d=>({request:new Request('https://example.com/api/v1/admin/tryon/assets/a',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}),env:{DB:{prepare:()=>{throw Error('must fail before DB');}}}});
 const unreviewed=await tryonAdminAsset(ctx({assetUrl:good,productType:'necklace',approved:true}),'rose-necklace');assert.equal(unreviewed.status,400);
 const unsafe=await tryonAdminAsset(ctx({assetUrl:'https://evil.com/f.png',productType:'necklace',approved:true,confirmReviewed:true}),'rose-necklace');assert.equal(unsafe.status,400);
});

test('public query must require BOTH published product and approved asset',async()=>{
 const c={env:{DB:{prepare:(sql)=>{
  assert.match(sql,/p\.published=1/);
  assert.match(sql,/a\.approved=1/);
  return {bind:()=>({first:async()=>data})};
 }}}};
 const r=await tryonPublicProduct(c,'rose-necklace');
 assert.equal(r.status,200);
});
