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
  products:[product],state:{productImage:0,favorites:[],theme:'light',inquiry:{enabled:false}},BACKEND_READY:backend,
  I:()=>'',img:()=>'<img alt="تصویر واقعی">',esc:x=>String(x),
  productPrice:p=>p.priceToman!=null&&p.priceExpiresAt>Date.now()?'قیمت معتبر':'نیازمند استعلام قیمت',
  productLedger:()=>'<span>ریز قیمت معتبر</span>',notFound:()=>'<p>یافت نشد</p>',
  Number,Date
 };
 return vm.runInNewContext(detailCode+'\nproductPage("threehearth")',ctx);
}
test('live showcase keeps the cart available for stock inquiry without enabling checkout',()=>{
 const html=detail(true,1234567);
 assert.match(html,/data-action="cart-add"/);
 assert.doesNotMatch(html,/data-action="collection-open"/);
 assert.match(html,/افزودن به سبد خرید/);
 assert.doesNotMatch(html,/ثبت سفارش و پرداخت/);
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

test('live cart remains usable when inquiry intake is disabled and collects no customer data',()=>{
 const cartCode=snippet('function inquiryCartPage(){','function cartPage(){');
 const product={id:'threehearth',name:'سه قلب',category:'دستبند',style:'مینیمال',
  weightGrams:0.244,karat:18,light:'same.webp',dark:'same.webp',images:['same.webp'],
  priceToman:1234567,priceExpiresAt:Date.now()+10000};
 const ctx={products:[product],state:{cart:{threehearth:1},inquiry:{enabled:false,accepting:false,receipt:null,error:'',contactName:'',contactPhone:'',submitting:false}},
  pImage:()=>'<img>',esc:x=>String(x),productPrice:()=> 'قیمت معتبر',formatMoney:x=>String(x),
  countCart:()=>1,I:()=>'',linkButton:()=>'<a>محصولات</a>',BACKEND_READY:true};
 const html=vm.runInNewContext(cartCode+'\\ninquiryCartPage()',ctx);
 assert.match(html,/سبد خرید/);
 assert.match(html,/استعلام موجودی و قیمت/);
 assert.match(html,/ثبت استعلام هنوز فعال نشده است/);
 assert.doesNotMatch(html,/id="inquiry-form"/);
 assert.doesNotMatch(html,/checkout-form|نشانی دقیق|کد پستی/);
});
test('enabled inquiry requires explicit privacy consent and does not silently drop cart items',()=>{
 assert.match(source,/name="consent" type="checkbox" required/);
 assert.match(source,/consent:form\.elements\.consent\?\.checked===true/);
 assert.match(source,/if\(lines\.length>8\)/);
 assert.match(source,/استعلام موجودی و قیمت · بدون پرداخت/);
});
