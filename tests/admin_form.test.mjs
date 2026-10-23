import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const js=fs.readFileSync(new URL('../frontend/admin.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../frontend/admin.html',import.meta.url),'utf8');
const start=js.indexOf('const field=(f,n)=>');
const end=js.indexOf('function resetForm(){',start);
assert.ok(start>=0&&end>start,'Missing percentage conversion function');
const helper=js.slice(start,end);
function basisPoints(input){
  const f={elements:{namedItem:()=>({value:input})}};
  return vm.runInNewContext(helper+'\npercentToBps(f,"makingFeeBps")',{f,Number,Math,Error});
}
test('admin percentages use visible percent and store basis points',()=>{
 assert.equal(basisPoints('10'),1000);
 assert.equal(basisPoints('8'),800);
 assert.equal(basisPoints('0.25'),25);
 assert.equal(basisPoints('100'),10000);
 assert.equal(basisPoints(''),null);
});
test('invalid precision and out-of-range percentage values are rejected',()=>{
 for(const n of ['-1','100.01','10.001','abc'])assert.throws(()=>basisPoints(n));
});
test('admin labels are percentages, not raw basis point multipliers',()=>{
 assert.match(html,/اجرت \(درصد ٪، اختیاری\)/);
 assert.match(html,/سود \(درصد ٪، اختیاری\)/);
 assert.match(html,/0\.244/);
 assert.match(js,/makingFeeBps==null\?null:p\.makingFeeBps\/100/);
 assert.match(js,/profitBps==null\?null:p\.profitBps\/100/);
});
test('selecting a photo and pressing save uploads before persisting product',()=>{
 const save=js.slice(js.indexOf('async function submitProduct(e){'),js.indexOf('async function submitCategory(e){'));
 assert.ok(save.indexOf('await storeSelectedPhoto()')>=0);
 assert.ok(save.indexOf('await storeSelectedPhoto()')<save.indexOf('await api(store.editing?'));
 const upload=js.slice(js.indexOf('async function storeSelectedPhoto(){'),js.indexOf('async function login(e){'));
 assert.match(upload,/api\('\/admin\/uploads'/);
 assert.match(upload,/target\.value\+=/);
});


test('admin shows source timestamp and refuses stale, future or missing pending rate',()=>{
 const start=js.indexOf('function pendingRateIsStale(iso,now=Date.now()){');
 const end=js.indexOf('async function refreshMarket(){',start);
 assert.ok(start>=0 && end>start, 'pending rate validation must exist');
 const now=Date.parse('2026-10-23T12:00:00Z');
 const stale=(iso)=>vm.runInNewContext(js.slice(start,end)+'\npendingRateIsStale(iso, now)',{iso,now,Number,Date});
 assert.equal(stale('2026-10-23T11:55:00Z'),false);
 assert.equal(stale('2026-10-23T11:19:00Z'),true);
 assert.equal(stale('2026-10-23T12:03:00Z'),true);
 assert.equal(stale('invalid-date'),true);
 assert.equal(stale(null),true);
 assert.match(js,/approve\.disabled=hasPending&&pendingExpired/);
 assert.match(js,/timeZone:'Asia\/Tehran'/);
 assert.match(js,/زمان ثبت منبع \(تهران\)/);
});
