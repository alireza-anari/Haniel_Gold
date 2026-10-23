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


test('separate product fee and profit rates survive catalog normalization without mixing',()=>{
 const a=normal({...base,makingFeeBps:1000,profitBps:800,price:{
  amountToman:1340000,updatedAt:now,validUntil:future,source:'servix_18k',
  breakdown:{rawGoldToman:1000000,makingFeeToman:100000,profitToman:80000,taxToman:160000}
 }});
 const b=normal({...base,id:'ring-02',makingFeeBps:1800,profitBps:500,price:{
  amountToman:1480000,updatedAt:now,validUntil:future,source:'servix_18k',
  breakdown:{rawGoldToman:1000000,makingFeeToman:180000,profitToman:50000,taxToman:250000}
 }});
 assert.equal(a.makingFeeBps,1000);assert.equal(a.profitBps,800);
 assert.equal(b.makingFeeBps,1800);assert.equal(b.profitBps,500);
 assert.equal(a.priceBreakdown.makingFeeToman,100000);
 assert.equal(b.priceBreakdown.makingFeeToman,180000);
 assert.equal(a.priceBreakdown.profitToman,80000);
 assert.equal(b.priceBreakdown.profitToman,50000);
});
test('stale price and inconsistent breakdown are not presented as valid priced ledgers',()=>{
 const stale=normal({...base,price:{amountToman:1340000,updatedAt:past,validUntil:past,source:'servix_18k',
  breakdown:{rawGoldToman:1000000,makingFeeToman:100000,profitToman:80000,taxToman:160000}
 }});
 assert.equal(stale.priceToman,null);
 assert.equal(stale.priceBreakdown,null);
 const tampered=normal({...base,price:{amountToman:1340000,updatedAt:now,validUntil:future,source:'servix_18k',
  breakdown:{rawGoldToman:1,makingFeeToman:2,profitToman:3,taxToman:4}
 }});
 assert.equal(tampered.priceBreakdown,null);
});
test('price details are rendered only for independently verified, unexpired Servix price',()=>{
 const a=source.indexOf('function productLedger(p){'),b=source.indexOf('function productPage(id){',a);
 assert.ok(a>0&&b>a);
 const ledger=source.slice(a,b);
 const formatMoney=x=>Number.isSafeInteger(x)?x.toLocaleString('fa-IR')+' تومان':'—';
 const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
 const prod=normal({...base,makingFeeBps:1000,profitBps:800,price:{
  amountToman:1340000,updatedAt:now,validUntil:future,source:'servix_18k',
  breakdown:{rawGoldToman:1000000,makingFeeToman:100000,profitToman:80000,taxToman:160000}
 }});
 const html=vm.runInNewContext(ledger+'\nproductLedger(prod)',{prod,Date,Intl,Number,formatMoney,esc});
 assert.match(html,/مبلغ اجرت/);
 assert.match(html,/مبلغ سود/);
 assert.match(html,/زمان نرخ/);
 assert.match(html,/منبع نرخ/);
 assert.match(html,/https:\/\/servix\.cc\//);
 const old=vm.runInNewContext(ledger+'\nproductLedger(prod)',{
  prod:{...prod,priceExpiresAt:Date.now()-1000},Date,Intl,Number,formatMoney,esc
 });
 assert.doesNotMatch(old,/مبلغ اجرت/);
 assert.match(old,/تأیید نرخ تازه/);
});
