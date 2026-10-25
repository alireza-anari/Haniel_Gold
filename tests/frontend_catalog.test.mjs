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


test('storefront normalizer ignores private margin inputs even in legacy public data',()=>{
 const p=normal({...base,makingFeeBps:1000,profitBps:800,
  price:{amountToman:1340000,updatedAt:now,validUntil:future,source:'servix_18k',
   breakdown:{rawGoldToman:1000000,makingFeeToman:100000,profitToman:80000,taxToman:160000}}});
 assert.equal(p.priceToman,1340000);
 assert.equal(p.priceSource,'servix_18k');
 assert.equal(Object.hasOwn(p,'makingFeeBps'),false);
 assert.equal(Object.hasOwn(p,'profitBps'),false);
 assert.equal(Object.hasOwn(p,'priceBreakdown'),false);
});
test('stale prices never appear with rate attribution',()=>{
 const stale=normal({...base,price:{amountToman:1340000,updatedAt:past,validUntil:past,source:'servix_18k'}});
 assert.equal(stale.priceToman,null);
 assert.equal(stale.priceSource,null);
});
test('public price information avoids internal cost, margin and profit',()=>{
 const a=source.indexOf('function productLedger(p){'),b=source.indexOf('function productPage(id){',a);
 assert.ok(a>0&&b>a);
 const ledger=source.slice(a,b);
 const formatMoney=x=>Number.isSafeInteger(x)?x.toLocaleString('fa-IR')+' تومان':'—';
 const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
 const prod=normal({...base,price:{amountToman:1340000,updatedAt:now,validUntil:future,source:'servix_18k'}});
 const html=vm.runInNewContext(ledger+'\nproductLedger(prod)',{prod,Date,Intl,Number,formatMoney,esc});
 assert.match(html,/قیمت اعلامی ویترین/);
 assert.match(html,/زمان نرخ/);
 assert.match(html,/منبع نرخ/);
 assert.ok(html.includes('https://servix.cc/'));
 assert.doesNotMatch(html,/سود این محصول|مبلغ سود|درصد سود|مبلغ اجرت|درصد اجرت|مالیات طبق سیاست/);
 const old=vm.runInNewContext(ledger+'\nproductLedger(prod)',{
  prod:{...prod,priceExpiresAt:Date.now()-1000},Date,Intl,Number,formatMoney,esc
 });
 assert.doesNotMatch(old,/قیمت اعلامی ویترین/);
 assert.match(old,/تأیید سیاست قیمت‌گذاری/);
});
