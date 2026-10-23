import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../frontend/app.js',import.meta.url),'utf8');
const block=(start,end)=>{
 const i=source.indexOf(start);
 if(i<0)throw Error('Missing start '+start);
 const j=source.indexOf(end,i);
 if(j<0)throw Error('Missing end '+end);
 return source.slice(i,j);
};
const normalizer=block('function normalizeProduct(raw){','async function hydrateCatalog()');
const normal=(raw)=>vm.runInNewContext(normalizer+'\nnormalizeProduct(raw);',{raw,URL,Date,Number,String,Array,RegExp,Math,encodeURI});
const future=new Date(Date.now()+20*60_000).toISOString(),past=new Date(Date.now()-20*60_000).toISOString(),now=new Date().toISOString();
const base={id:'ring-01',name:'انگشتر تست',category:'انگشتر',style:'مینیمال',weightGrams:2.456,images:['https://example.org/real-ring.webp'],price:{amountToman:1240000,updatedAt:now,validUntil:future}};
test('fresh, explicitly time-bounded price displays from Cloudflare D1',()=>{
 const p=normal(base);
 assert.equal(p.priceToman,1240000);
 assert.equal(p.weightGrams,2.456);
 assert.equal(p.images[0],'https://example.org/real-ring.webp');
});
test('old price cannot be rendered even if D1 supplies a numeric amount',()=>{
 const p=normal({...base,price:{amountToman:1240000,updatedAt:past,validUntil:past}});
 assert.equal(p.priceToman,null);
});
test('price missing expiry or verification is never trusted',()=>{
 assert.equal(normal({...base,price:{amountToman:1240000}}).priceToman,null);
});
test('relative R2 media paths and absolute media image URLs are supported',()=>{
 const media='/api/v1/media/products/01234567-89ab-4cde-ab12-0123456789ab.webp';
 const p=normal({...base,images:[media]});
 assert.equal(p.images[0],media);
});
test('URL values cannot break out of HTML attributes',()=>{
 const malicious='https://example.com/" onerror="alert(1).jpg';
 const p=normal({...base,images:[malicious]});
 assert.equal(p.images[0].includes('"'),false);
});
test('backend request path stays off unless flag or full build enabled',()=>{
 assert.match(source,/get\('catalog'\)==='live'/);
 assert.match(source,/COMMERCE_READY=false/);
});
