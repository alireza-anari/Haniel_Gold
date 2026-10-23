import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../frontend/app.js',import.meta.url),'utf8');
function snippet(from,to){
 const a=source.indexOf(from),b=source.indexOf(to,a+from.length);
 assert.ok(a>=0&&b>a,'Missing expected site function '+from);
 return source.slice(a,b);
}
const detailCode=snippet('function productPage(id){','function cartPage(){');
const routeCode=snippet('function routeInfo(){','function menu(){');
function detail(backend,price){
 const product={id:'threehearth',name:'سه قلب',category:'دستبند',style:'مینیمال',
  weightGrams:0.244,karat:18,light:'same.webp',dark:'same.webp',images:['same.webp'],
  alt:'تصویر واقعی',priceToman:price,priceExpiresAt:Date.now()+(price?10000:-10000),
  priceSource:'servix_18k'};
 const ctx={
  products:[product],state:{productImage:0,favorites:[],theme:'light'},BACKEND_READY:backend,
  I:()=>'',img:()=>'<img alt="تصویر واقعی">',esc:x=>String(x),
  productPrice:p=>p.priceToman!=null&&p.priceExpiresAt>Date.now()?'قیمت معتبر':'نیازمند استعلام قیمت',
  productLedger:()=>'<span>ریز قیمت معتبر</span>',notFound:()=>'<p>یافت نشد</p>',
  Number,Date
 };
 return vm.runInNewContext(detailCode+'\nproductPage("threehearth")',ctx);
}
test('real showcase does not show a nonfunctional purchase button',()=>{
 const html=detail(true,1234567);
 assert.match(html,/data-action="collection-open"/);
 assert.doesNotMatch(html,/data-action="cart-add"/);
 assert.doesNotMatch(html,/افزودن به سبد/);
 assert.match(html,/مشاهده مجموعه محصولات/);
 assert.match(html,/۰٫۲۴۴ گرم/);
 assert.match(html,/عیار: 18/);
 assert.match(html,/مشخصات ثبت‌نشده را حدس نمی‌زنیم/);
 assert.match(html,/قیمت محاسبه‌شده از نرخ معتبر/);
});
test('demo remains interactive without modifying its user experience',()=>{
 const html=detail(false,null);
 assert.match(html,/data-action="cart-add"/);
 assert.match(html,/افزودن به سبد/);
});
test('an expired price is not described as currently valid',()=>{
 const html=detail(true,null);
 assert.match(html,/نرخ معتبر فعلاً در دسترس نیست/);
 assert.doesNotMatch(html,/قیمت محاسبه‌شده از نرخ معتبر/);
});
test('direct product deep link resolves to an actual product route',()=>{
 const route=vm.runInNewContext(routeCode+'\nrouteInfo()',{
  location:{hash:'#/product/threehearth'},decodeURI,String
 });
 assert.equal(route.name,'product');
 assert.equal(route.id,'threehearth');
});
test('live category menu uses categories from D1 and hides inactive controls',()=>{
 assert.match(source,/BACKEND_READY\?\[\.\.\.new Set\(products\.map\(p=>p\.category\)\)\]/);
 assert.match(source,/case 'collection-open':location\.hash='#\/collection';return;/);
 assert.match(source,/document\.body\.classList\.toggle\('showcase-only',BACKEND_READY\)/);
 const css=readFileSync(new URL('../frontend/styles.css',import.meta.url),'utf8');
 assert.match(css,/\.showcase-only \.cart-icon/);
});
