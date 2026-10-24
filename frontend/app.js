/* HANI-EL GOLD — functioning client-side demo. No real pricing/inventory/payments. */
'use strict';
const A = 'assets/';
const assetUrl = file => {
 if(!file)return A+'clover-gold.png';
 if(/^https:\/\//i.test(file)||String(file).startsWith('data:image/')||/^\/api\/v1\/media\/products\/[a-f0-9-]{36}\.(?:jpe?g|png|webp)$/i.test(file))return file;
 return (typeof window !== 'undefined' && window.__hanielPreviewAssets && window.__hanielPreviewAssets[file]) || A + file;
};
const CONFIG=Object.assign({apiBaseUrl:'',apiTimeout:10000},window.HANIEL_CONFIG||{});
// Owner-only catalogue preview: opt-in via ?catalog=live before enabling public live mode.
const CATALOG_PREVIEW=new URLSearchParams(location.search).get('catalog')==='live';
if(CATALOG_PREVIEW)CONFIG.apiBaseUrl='/api';
const BACKEND_READY=!!String(CONFIG.apiBaseUrl||'').trim();
const COMMERCE_READY=false; // No customer login, SMS, checkout or support API in Pages yet.
let csrfToken='';
let csrfPromise=null;
async function refreshCsrf(){
 if(!BACKEND_READY)throw new Error('BACKEND_NOT_CONFIGURED');
 if(csrfPromise)return csrfPromise;
 csrfPromise=fetch(String(CONFIG.apiBaseUrl).replace(/\/$/,'')+'/v1/auth/csrf',{
   credentials:'include',headers:{Accept:'application/json'},cache:'no-store'
 }).then(async r=>{
   if(!r.ok)throw new Error('CSRF_HTTP_'+r.status);
   const result=await r.json();
   if(!result.csrfToken)throw new Error('MISSING_CSRF_TOKEN');
   csrfToken=result.csrfToken;
   return csrfToken;
 }).finally(()=>{csrfPromise=null});
 return csrfPromise;
}
async function requestAPI(endpoint,options={}){
 if(!BACKEND_READY)throw new Error('BACKEND_NOT_CONFIGURED');
 const method=String(options.method||'GET').toUpperCase();
 const mutating=!['GET','HEAD','OPTIONS'].includes(method);
 if(mutating&&!csrfToken)await refreshCsrf();
 const ctrl=new AbortController(); const timeout=setTimeout(()=>ctrl.abort(),CONFIG.apiTimeout);
 try{
  const res=await fetch(String(CONFIG.apiBaseUrl).replace(/\/$/,'')+endpoint,{
    credentials:'include',method,...options,
    headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),
      ...(mutating?{'X-CSRFToken':csrfToken}:{}),...(options.headers||{})},
    signal:ctrl.signal,
  });
  if(res.status===403&&mutating)csrfToken='';
  if(!res.ok)throw new Error('HTTP_'+res.status);
  return res.status===204?null:res.json();
 } finally {clearTimeout(timeout)}
}
const formatMoney=v=>Number.isFinite(Number(v))&&v!==null&&v!==undefined?`${Number(v).toLocaleString('fa-IR')} تومان`:'—';
const productPrice=p=>p?.priceToman!=null&&Number.isFinite(Number(p.priceToman))&&(!p.priceExpiresAt||p.priceExpiresAt>Date.now())?formatMoney(p.priceToman):'نیازمند استعلام قیمت';
const visiblePhone=v=>String(v||'').replace(/[^0-9۰-۹]/g,'').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
const isIranMobile=v=>/^09\d{9}$/.test(visiblePhone(v));

const PLACEHOLDER_NOTICE = BACKEND_READY?'اطلاعات و وضعیت سفارش فقط پس از تأیید نهایی توسط سرور معتبر است.':'تصاویر و نام محصولات در نسخه نمایشی صرفاً نمونه هستند؛ اطلاعات واقعی متصل نشده است.';
let products = [
  {id:'sample-necklace',name:'گردنبند طرح شبدر',category:'گردنبند',style:'مینیمال',light:'necklace-ivory.webp',dark:'necklace-night.webp',alt:'گردنبند طلایی با آویز چهارپر شبدر روی زمینه روشن',images:['necklace-ivory.webp','model-ivory.webp','hero-silk.webp']},
  {id:'sample-bracelet',name:'دستبند طرح شبدر',category:'دستبند',style:'کلاسیک',light:'bracelet-ivory.webp',dark:'bracelet-night.webp',alt:'دستبند ظریف طلایی با نقش شبدر',images:['bracelet-ivory.webp','gallery-ivory.webp','bracelet-night.webp']},
  {id:'sample-earring',name:'گوشواره طرح شبدر',category:'گوشواره',style:'چشمگیر',light:'earring-ivory.webp',dark:'earring-night.webp',alt:'گوشواره آویز طلایی با طرح شبدر روی گوش',images:['earring-ivory.webp','earring-night.webp']},
  {id:'sample-necklace-soft',name:'گردنبند ظریف شبدر',category:'گردنبند',style:'کلاسیک',light:'model-ivory.webp',dark:'model-night.webp',alt:'گردنبند شبدر ظریف بر گردن مدل',images:['model-ivory.webp','necklace-ivory.webp']},
  {id:'sample-bracelet-slim',name:'دستبند شبدر ظریف',category:'دستبند',style:'مینیمال',light:'gallery-ivory.webp',dark:'gallery-night.webp',alt:'دستبند شبدر در صحنه سنگی',images:['gallery-ivory.webp','bracelet-ivory.webp']},
  {id:'sample-pendant',name:'آویز شبدر',category:'آویز',style:'چشمگیر',light:'hero-silk.webp',dark:'hero-night.webp',alt:'آویز شبدر طلایی روی حریر',images:['hero-silk.webp','necklace-night.webp']}
];
const categories=['همه','گردنبند','دستبند','گوشواره','انگشتر','آویز'];
const styles=['مینیمال','کلاسیک','چشمگیر'];
const getStore=(key,def)=>{try{let t=localStorage.getItem(key);return t===null?def:JSON.parse(t)}catch{return def}};
const state={catalogStatus:BACKEND_READY?'loading':'demo',apiError:'',addressFormOpen:false,addressPreview:null,addressDraft:{},contactDraft:{},contactFeedback:'',contactBusy:false,accountPhone:'',accountStep:'phone',accountBusy:false,accountMessage:'',checkoutStep:1,checkoutErrors:{},checkoutDraft:{},trackingCode:'',theme:getStore('haniel-theme','light'),menu:false,searchOverlay:false,filter:false,cartOpen:false,trust:null,hero:0,featured:0,selectedStyle:'مینیمال',styleIndex:0,macroIndex:0,productImage:0,query:'',category:'همه',sort:'default',filterCategory:'همه',filterStyle:'همه',cart:getStore('haniel-cart',{}),favorites:getStore('haniel-favorites',[]),notice:false,lightbox:false};
state.inquiry={enabled:false,accepting:false,siteKey:null,turnstileToken:'',submitting:false,error:'',receipt:null,contactName:'',contactPhone:''};
if(state.theme!=='dark')state.theme='light';
const iconPaths={
 menu:'<path d="M4 7h16M4 12h16M4 17h16"/>', close:'<path d="M18 6 6 18M6 6l12 12"/>', search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>', bag:'<path d="M4 8h16l-1 13H5L4 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>',
 left:'<path d="m14 5-7 7 7 7"/>',right:'<path d="m10 5 7 7-7 7"/>',down:'<path d="m6 9 6 6 6-6"/>',up:'<path d="m6 15 6-6 6 6"/>',
 heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
 filter:'<path d="M4 7h16M7 12h10M10 17h4"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="12" r="2"/>',
 check:'<path d="m5 12 4 4 10-10"/>',plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',trash:'<path d="M4 7h16M10 4h4M7 7l1 13h8l1-13"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2m10-10h-2M4 12H2m17-7-1.5 1.5M6.5 17.5 5 19m14 0-1.5-1.5M6.5 6.5 5 5"/>',moon:'<path d="M20 15.4A8 8 0 0 1 8.6 4a8 8 0 1 0 11.4 11.4Z"/>',
 chevronUp:'<path d="m6 15 6-6 6 6"/>', package:'<path d="m12 2 9 5-9 5-9-5 9-5ZM3 7v10l9 5 9-5V7M12 12v10"/>', gift:'<path d="M3 9h18v12H3zM12 9v12M2 5h20v4H2zM12 5C4-2 3 7 12 9c9-2 8-11 0-4Z"/>', phone:'<path d="M22 16v4a2 2 0 0 1-2 2C10 22 2 14 2 4a2 2 0 0 1 2-2h4l2 5-3 2c1 3 5 7 8 8l2-3 5 2Z"/>', info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',shield:'<path d="M12 2 4 6v5c0 5.1 3 8.5 8 11 5-2.5 8-5.9 8-11V6l-8-4Z"/><path d="m9 12 2 2 4-4"/>',tag:'<path d="M3 11V4h7l11 11-7 7L3 11Z"/><circle cx="7.5" cy="7.5" r="1"/>',doc:'<path d="M6 3h9l4 4v14H6V3Z"/><path d="M14 3v5h5M9 12h7M9 16h7"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 5 1c-.5 1-2.5 1.5-2.5 3.3M12 17h.01"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-5 3.5-8 8-8s8 3 8 8"/>',arrow:'<path d="M19 12H5m7-7-7 7 7 7"/>',mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',sparkle:'<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z"/>',
 location:'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',truck:'<path d="M2 6h12v11H2zM14 10h4l4 4v3h-8"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',list:'<path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/>', camera:'<path d="M4 7h4l2-3h4l2 3h4v13H4V7Z"/><circle cx="12" cy="13" r="4"/>',sliders:'<path d="M4 7h16M4 12h16M4 17h16"/><circle cx="8" cy="7" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="10" cy="17" r="2"/>'};
function I(name,size=20){return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name]||iconPaths.info}</svg>`}
function esc(s){return String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]))}
function img(file,alt='',cls='',attrs=''){return `<img src="${esc(assetUrl(file))}" alt="${esc(alt)}" class="${cls}" loading="lazy" decoding="async" ${attrs}>`}
function art(light,dark,alt='',cls=''){return `<picture class="${cls}"><img src="${esc(assetUrl(state.theme==='dark'?dark:light))}" data-theme-light="${esc(light)}" data-theme-dark="${esc(dark)}" alt="${esc(alt)}" loading="${cls==='hero-art'?'eager':'lazy'}" decoding="async"></picture>`}
function brand(){return `<a href="#/" class="brand-link" aria-label="صفحه اصلی HANI-EL GOLD">${img('brand-gold.png','HANI-EL GOLD','brand-img')}</a>`}
function btn(action,icon,label='',cls='',attrs=''){return `<button type="button" class="icon-button ${cls}" data-action="${action}" aria-label="${label}" title="${label}" ${attrs}>${I(icon)}</button>`}
function linkButton(text,url,secondary=true){return `<a class="${secondary?'link-button':'button-main'}" href="${url}">${esc(text)} ${I('left',16)}</a>`}

function normalizeProduct(raw){
 if(!raw||typeof raw!=='object'||!raw.id||!raw.name)return null;
 const safeText=v=>String(v??'').replace(/[<>"'&]/g,'').slice(0,150);
 const safeImg=v=>{
  if(typeof v!=='string'||v.length>800)return null;
  if(/^[a-z0-9_-]+\.(webp|png|jpe?g)$/i.test(v))return v;
  if(/^\/api\/v1\/media\/products\/[a-f0-9-]{36}\.(webp|png|jpe?g)$/i.test(v))return v;
  if(/^https:\/\//i.test(v)){try{const url=new URL(v);return !url.username&&!url.password?url.href:null;}catch{return null;}}
  return null;
 };
 if(!/^[a-zA-Z0-9_-]{1,80}$/.test(String(raw.id)))return null;
 const imgs=Array.isArray(raw.images)?raw.images.map(safeImg).filter(Boolean):[];
 const first=imgs[0]||safeImg(raw.imageUrl)||'gallery-ivory.webp';
 const price=raw.price?.amountToman,expiresAt=Date.parse(raw.price?.validUntil||''),verifiedAt=Date.parse(raw.price?.updatedAt||'');
 const validPrice=Number.isSafeInteger(price)&&price>0&&Number.isFinite(expiresAt)&&expiresAt>Date.now()&&Number.isFinite(verifiedAt)&&verifiedAt<=Date.now();
 const source=validPrice&&raw.price?.source==='servix_18k'?'servix_18k'
  :validPrice&&raw.price?.source==='manual_staging'?'manual_staging':null;
 const components=raw.price?.breakdown;
 const amounts=components&&[components.rawGoldToman,components.makingFeeToman,
  components.profitToman,components.taxToman];
 const verifiedBreakdown=source==='servix_18k'&&amounts&&amounts.every(v=>Number.isSafeInteger(v)&&v>=0)
  &&amounts.reduce((total,v)=>total+v,0)===price?{
   rawGoldToman:amounts[0],makingFeeToman:amounts[1],profitToman:amounts[2],taxToman:amounts[3]
  }:null;
 return {id:String(raw.id),name:safeText(raw.name),category:safeText(raw.category||'سایر'),
  style:safeText(raw.style||'مینیمال'),light:first,dark:first,images:imgs.length?imgs:[first],
  alt:safeText(raw.alt||raw.name),priceToman:validPrice?price:null,priceExpiresAt:validPrice?expiresAt:null,
  priceVerifiedAt:validPrice?verifiedAt:null,priceSource:source,priceBreakdown:verifiedBreakdown,
  makingFeeBps:Number.isSafeInteger(raw.makingFeeBps)?raw.makingFeeBps:null,
  profitBps:Number.isSafeInteger(raw.profitBps)?raw.profitBps:null,
  weightGrams:typeof raw.weightGrams==='number'?raw.weightGrams:null,
  karat:raw.karat??null,inventoryStatus:String(raw.inventoryStatus||'unknown')};
}

async function hydrateCatalog(){
 if(!BACKEND_READY)return;
 try{
  const data=await requestAPI('/v1/catalog/products?limit=100');
  const list=Array.isArray(data?.items)?data.items:Array.isArray(data)?data:[];
  products=list.map(normalizeProduct).filter(Boolean);
  state.catalogStatus='ready';state.apiError='';if(!(state.inquiry.enabled&&routeInfo().name==='cart'))render();
 }catch(err){state.catalogStatus='error';state.apiError=String(err.message||'خطای ارتباط');products=[];render()}
}
async function hydrateInquiryConfig(){
 if(!BACKEND_READY)return;
 try{
  const result=await requestAPI('/v1/inquiries/settings');
  const enabled=result?.enabled===true,accepting=result?.accepting===true;
  const changed=enabled!==state.inquiry.enabled||accepting!==state.inquiry.accepting;
  state.inquiry.enabled=enabled;
  state.inquiry.accepting=accepting;
  state.inquiry.siteKey=enabled?result.turnstileSiteKey:null;
  if(!enabled)state.inquiry.turnstileToken='';
  if(changed)render();
 }catch{
  state.inquiry.enabled=false;state.inquiry.accepting=false;state.inquiry.siteKey=null;
 }
}
function renderInquiryCaptcha(){
 if(!state.inquiry.enabled||!state.inquiry.accepting||routeInfo().name!=='cart'||!document.querySelector('#inquiry-challenge'))return;
 if(!state.inquiry.siteKey)return;
 const mount=()=>{
  const node=document.querySelector('#inquiry-challenge');
  if(!node||node.dataset.widgetReady)return;
  if(!window.turnstile?.render)return;
  node.dataset.widgetReady='1';
  state.inquiry.turnstileToken='';
  window.turnstile.render(node,{sitekey:state.inquiry.siteKey,
   callback:token=>{state.inquiry.turnstileToken=token;},
   'expired-callback':()=>{state.inquiry.turnstileToken='';},
   'error-callback':()=>{state.inquiry.turnstileToken='';}
  });
 };
 if(window.turnstile?.render){mount();return;}
 if(!document.querySelector('#haniel-turnstile-script')){
  const script=document.createElement('script');
  script.id='haniel-turnstile-script';
  script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.async=true;script.defer=true;script.addEventListener('load',mount);
  document.head.append(script);
 }else document.querySelector('#haniel-turnstile-script').addEventListener('load',mount,{once:true});
}
async function submitInquiry(event){
 event.preventDefault();
 if(!BACKEND_READY||!state.inquiry.enabled||!state.inquiry.accepting||state.inquiry.submitting)return;
 const form=event.currentTarget;const name=form.elements.name?.value.trim()||'';
 const phone=visiblePhone(form.elements.phone?.value||'');
 state.inquiry.contactName=name;state.inquiry.contactPhone=phone;
 if(!name||!isIranMobile(phone)){state.inquiry.error='نام و موبایل معتبر وارد کن.';render();return;}
 if(!state.inquiry.turnstileToken){state.inquiry.error='لطفاً تأیید امنیتی را کامل کن.';render();return;}
 const lines=Object.entries(state.cart).filter(([slug,count])=>count>0&&products.some(p=>p.id===slug))
  .map(([slug,count])=>({slug,quantity:Math.min(5,Math.max(1,Number(count)))})).slice(0,8);
 if(!lines.length){state.inquiry.error='سبد انتخاب‌ها خالی است.';render();return;}
 state.inquiry.submitting=true;state.inquiry.error='';
 try{
  const res=await fetch(String(CONFIG.apiBaseUrl).replace(/\/$/,'')+'/v1/inquiries',{
   method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},
   body:JSON.stringify({name,phone,items:lines,turnstileToken:state.inquiry.turnstileToken}),credentials:'same-origin'
  });
  const data=await res.json();
  if(!res.ok)throw new Error(data.error||'ثبت درخواست ممکن نشد.');
  if(!data.inquiryId)throw new Error('شناسه درخواست دریافت نشد.');
  state.inquiry.receipt=data;state.cart={};state.inquiry.contactName='';state.inquiry.contactPhone='';save();
 }catch(x){state.inquiry.error=String(x.message||'خطا در ثبت درخواست');}
 finally{state.inquiry.submitting=false;state.inquiry.turnstileToken='';render();}
}
function countCart(){return Object.values(state.cart).reduce((t,n)=>t+Number(n||0),0)}
function header(){return `<header class="site-header"><div class="header-inner">
<div class="header-left">${btn('menu-open','menu','باز کردن فهرست')}${btn('theme',state.theme==='dark'?'sun':'moon','تغییر تم روشن و تاریک','theme-button')}</div>
${brand()}<div class="header-right"><a href="#/favorites" class="icon-button header-favorites" aria-label="علاقه‌مندی‌ها">${I('heart',20)}${state.favorites.length?`<span class="cart-count">${state.favorites.length.toLocaleString('fa-IR')}</span>`:''}</a><a href="#/account" class="icon-button header-account" aria-label="حساب کاربری">${I('user',20)}</a>${btn('search','search','جست‌وجو')}
<button type="button" data-action="cart-open" class="icon-button cart-icon" aria-label="${BACKEND_READY&&state.inquiry.enabled?'سبد درخواست بررسی':'سبد خرید'}">${I('bag',22)}${countCart()?`<span class="cart-count">${countCart()}</span>`:''}</button></div></div></header>`}
function footer(){return `<footer class="site-footer"><div class="footer-inner">
<div class="footer-copy"><div class="footer-goldmark">${img('clover-gold.png','نشان رسمی هانی‌ال')}</div><p>زیبایی، در انتخاب تو</p><small>نسخه پیش‌نمایش سایت HANI-EL GOLD</small></div>
<div class="footer-links"><a href="#/collection">مجموعه‌ها</a><a href="#/favorites">علاقه‌مندی‌ها</a><a href="#/account">حساب من</a><a href="#/orders">پیگیری سفارش‌ها</a><a href="#/guide">راهنمای خرید</a><a href="#/faq">پرسش‌های متداول</a><a href="#/contact">ارتباط با ما</a><a href="#/policies">شرایط خرید</a><a href="#/privacy">حریم خصوصی</a><a href="#/about">داستان هانی‌ال</a></div>
</div><p class="prototype-disclosure">${PLACEHOLDER_NOTICE} پرداخت آنلاین و ثبت سفارش واقعی در این نسخه فعال نیست.</p></footer>`}
function hero(){const items=[products[0],products[1],products[2],products[5]].filter(Boolean);if(!items.length)return '';const selected=state.hero%items.length;const p=items[selected];return `<section class="hero-section"><div class="hero-stage">
<div class="hero-visual">${art(selected===0&&!BACKEND_READY?'hero-silk.webp':p.light,selected===0&&!BACKEND_READY?'hero-night.webp':p.dark,p.alt,'hero-art')}<span class="hero-number">HANI-EL / MAISON</span></div>
<div class="hero-body"><span class="eyebrow">THE HANI-EL EDIT</span><h1>زیبایی،<br>همیشه با توست</h1><p>زیورآلاتی برای لحظه‌هایی که به تو شبیه‌اند.</p>${linkButton('کشف مجموعه‌ها','#/collection')}<span class="hero-aside">AN EVERYDAY SIGNATURE</span></div></div>
<div class="hero-bottom"><span class="hero-bottom-intro">دسته‌بندی‌ها</span><div class="hero-switcher" role="tablist" aria-label="ویترین دسته‌بندی‌ها">${items.map((it,i)=>`<button role="tab" aria-selected="${i===selected}" data-action="hero-set" data-index="${i}" class="${i===selected?'selected':''}">${it.category}</button>`).join('')}</div><span class="hero-bottom-index">${(selected+1).toLocaleString('fa-IR')} <i> / </i> ${items.length.toLocaleString('fa-IR')}</span></div></section>`}
const trustSections=[{key:'price',name:'شفافیت قیمت‌گذاری',sub:'اجزای قیمت را بشناسید',icon:'tag',body:'در نسخه نهایی، وزن، عیار، نرخ مبنا و اجزای قابل اعمال قیمت هر محصول بر اساس اطلاعات واقعی فروشگاه نمایش داده می‌شوند.'},
{key:'product',name:'مشخصات دقیق محصول',sub:'وزن، عیار و ویژگی‌ها',icon:'doc',body:'مشخصات ثبت‌شده، تصاویر واقعی و جزئیات هر قطعه در صفحه اختصاصی محصول قرار می‌گیرند تا پیش از تصمیم‌گیری بتوانید آن‌ها را بررسی کنید.'},
{key:'guide',name:'راهنمای خرید',sub:'پاسخ به پرسش‌های شما',icon:'help',body:'اطلاعات مراحل سفارش، تأیید قیمت، ارسال و شیوه ارتباط با فروشگاه پس از نهایی‌شدن فرایندهای واقعی فروش در این قسمت قرار خواهند گرفت.'}];
function trust(){return `<section class="section trust-section" id="trust"><div class="section-heading"><span class="eyebrow">THE DETAILS MATTER</span><h2>اعتماد، در جزئیات</h2><p>انتخاب آگاهانه از اطلاعات روشن آغاز می‌شود.</p></div>
<div class="trust-rows">${trustSections.map(t=>`<article class="trust-row ${state.trust===t.key?'expanded':''}"><button class="trust-trigger" data-action="trust" data-key="${t.key}" aria-expanded="${state.trust===t.key}"><span class="trust-icon">${I(t.icon,25)}</span><span class="trust-title"><strong>${t.name}</strong><small>${t.sub}</small></span><span class="trust-chevron">${I(state.trust===t.key?'up':'down')}</span></button>${state.trust===t.key?`<div class="trust-content"><p>${t.body}</p><a href="#/guide" class="subtle-link">اطلاعات بیشتر ${I('left',15)}</a></div>`:''}</article>`).join('')}</div></section>`}
function featured(){const choices=[products[1],products[0],products[2]].filter(Boolean);if(!choices.length)return '';const p=choices[state.featured%choices.length];return `<section class="section featured-section"><div class="featured-head"><div class="section-heading right"><span class="eyebrow">THE EDITED SELECTION</span><h2>انتخاب‌های هانی‌ال</h2></div><div class="carousel-controls">${btn('featured-prev','right','محصول قبل')}${btn('featured-next','left','محصول بعد')}</div></div>
<div class="featured-frame"><div class="featured-image">${art(p.light,p.dark,p.alt,'feature-art')}</div><div class="featured-info"><span class="eyebrow muted">۰${state.featured+1} / ۰۳</span><div><h3>${p.name}</h3>${linkButton('مشاهده جزئیات',`#/product/${p.id}`)}</div></div></div></section>`}
function stylesSection(){const s=state.selectedStyle;const list=products.filter(p=>p.style===s);if(!list.length){return `<section class="section styles-section"><div class="section-heading"><h2>سبک تو، انتخاب تو</h2><p>این سبک فعلاً محصولی برای نمایش ندارد.</p></div><div class="style-tabs">${styles.map(st=>`<button data-action="style-set" data-style="${st}" class="${s===st?'selected':''}">${st}</button>`).join('')}</div></section>`;}const p=list[state.styleIndex%list.length];return `<section class="section styles-section"><div class="section-heading"><span class="eyebrow">FIND YOUR STYLE</span><h2>سبک تو، انتخاب تو</h2><p>کدام ظرافت به تو نزدیک‌تر است؟</p></div><div class="style-tabs" role="tablist" aria-label="انتخاب سبک">${styles.map(st=>`<button type="button" role="tab" aria-selected="${s===st}" class="${s===st?'selected':''}" data-action="style-set" data-style="${st}">${st}</button>`).join('')}</div>
<div class="style-showcase"><div class="style-photo">${art(p.light,p.dark,p.alt,'style-art')}<div class="on-photo-note">${s}</div></div><div class="style-description"><span class="eyebrow">A PERSONAL SELECTION</span><h3>${s==='مینیمال'?'زیبایی در سادگی':s==='کلاسیک'?'ظرافت ماندگار':'جلوه‌ای متفاوت'}</h3><p>${s==='مینیمال'?'جزئیاتی ظریف، برای هر روز.':s==='کلاسیک'?'انتخاب‌هایی آرام و همیشگی.':'زیورآلاتی با حضور چشمگیر.'}</p><div class="style-arrows">${btn('style-prev','right','تصویر قبل')}${btn('style-next','left','تصویر بعد')} <small>${(state.styleIndex%list.length+1).toLocaleString('fa-IR')} / ${list.length.toLocaleString('fa-IR')}</small></div>${linkButton('مشاهده همه محصولات این سبک',`#/collection?style=${encodeURIComponent(s)}`)}</div></div><div class="style-rail" aria-label="محصولات سبک انتخاب‌شده">${list.map((item,i)=>`<button type="button" data-action="style-thumbnail" data-index="${i}" aria-pressed="${i===state.styleIndex%list.length}" class="style-rail-item ${i===state.styleIndex%list.length?'active':''}">${pImage(item,'style-rail-art')}<span>${item.name}</span></button>`).join('')}</div></section>`}
function macroSection(){
 const steps=[
  {title:'پیوند زنجیر',body:'نگاهی نزدیک به محل اتصال زنجیر و آویز؛ بخشی ظریف از ساختار هر قطعه.'},
  {title:'فرم آویز',body:'خطوط، انحناها و تناسب فرم؛ جزئیاتی که در نمای نزدیک بهتر دیده می‌شوند.'},
  {title:'هماهنگی اجزا',body:'از فاصله‌ی قطعات تا شیوه‌ی قرارگیری آن‌ها، هر جزء ارزش دیدن دارد.'}
 ];
 const n=Math.max(0,Math.min(steps.length-1,state.macroIndex));
 const productLink=`#/product/${encodeURIComponent(products[0]?.id||'sample-necklace')}`;
 return `<section class='section macro-section' id='detail-room' aria-label='زیبایی در جزئیات'>
  <div class='section-heading'><span class='eyebrow'>A CLOSER LOOK</span><h2>زیبایی در جزئیات</h2><p>برای کشف ظرافت‌های هر قطعه، نقاط را لمس کن.</p></div>
  <div class='macro-layout'><div class='macro-photo detail-focus-${n}'>
   ${art('hero-silk.webp','necklace-night.webp','نمای مفهومی گردنبند روی پارچه','macro-art')}
   <div class='droom-overline' aria-hidden='true'><span>HANI-EL / DETAIL STUDY</span><span>05</span></div>
   ${steps.map((step,k)=>`<button type='button' class='hotspot hotspot-${k+1} droom-point ${n===k?'active':''}' data-action='macro' data-index='${k}' aria-label='نمایش جزئیات: ${step.title}' aria-controls='droom-information' aria-pressed='${n===k}'><span aria-hidden='true'>${(k+1).toLocaleString('fa-IR')}</span></button>`).join('')}
   <div class='macro-details droom-bottom-bar' id='droom-information'>
    <div class='droom-meta'><span>THE DETAIL ROOM</span><span data-droom-count>۰${n+1} / ۰۳</span></div>
    <div class='droom-copy' aria-live='polite' aria-atomic='true'>
     ${steps.map((step,k)=>`<div class='droom-panel' data-droom-panel='${k}' ${k!==n?'hidden':''}><h3>${step.title}</h3><p>${step.body}</p></div>`).join('')}
    </div>
    <a class='droom-product-link' href='${productLink}'>مشاهده محصول <span aria-hidden='true'>←</span></a>
   </div>
   <span class='droom-demo-note'>تصویر نمونهٔ مفهومی است</span>
  </div></div>
 </section>`;
}
function storySection(){return `<section class="section story-section"><div class="story-picture">${art('story-ivory.webp','story-night.webp','گردنبند شبدر در صحنه‌ای ادیتوریال','story-art')}</div><div class="story-copy"><span class="eyebrow">OUR POINT OF VIEW</span><h2>داستان هانی‌ال</h2><p class="story-tagline">زیبایی، از نگاه ما</p><p>برای ما، زیبایی در انتخاب‌هایی‌ست که با سلیقه و شخصیت هر فرد هماهنگ‌اند.</p>${linkButton('آشنایی با هانی‌ال','#/about')}</div></section>`}
function home(){return `${hero()}<main>${trust()}${featured()}${stylesSection()}${macroSection()}${storySection()}</main>`}
function pImage(p,cls=''){return art(p.light,p.dark,p.alt,cls)}
function productRow(p){const liked=state.favorites.includes(p.id);return `<article class="product-row"><a href="#/product/${p.id}" class="product-row-media">${pImage(p,'row-photo')}</a><div class="product-row-copy"><span class="eyebrow">${p.category} / ${p.style}</span><h2><a href="#/product/${p.id}">${p.name}</a></h2><p class="product-row-note">${BACKEND_READY?'برای مشخصات کامل وارد صفحه محصول شوید':'نمونه نمایشی · جزئیات واقعی ثبت نشده'}</p><div class="row-meta"><span>وزن و عیار: ${p.weightGrams!=null&&p.karat?`${esc(p.weightGrams)} گرم · ${esc(p.karat)} عیار`:'—'}</span><span>قیمت: ${productPrice(p)}</span></div><div class="row-actions">${linkButton('مشاهده جزئیات',`#/product/${p.id}`)}<button data-action="favorite" data-id="${p.id}" class="favorite-btn ${liked?'liked':''}" aria-label="${liked?'حذف از علاقه‌مندی':'افزودن به علاقه‌مندی'}">${I('heart',18)}</button></div></div></article>`}
function getParams(){return new URLSearchParams((location.hash.split('?')[1]||''))}
function collection(){const params=getParams();let cat=params.get('category')||'همه'; let sty=params.get('style')||'همه';state.category=cat;const q=params.get('q')||'';let list=products.filter(p=>(cat==='همه'||p.category===cat)&&(sty==='همه'||p.style===sty)&&(!q||(p.name+' '+p.category+' '+p.style).includes(q)));if(state.sort==='alpha')list=[...list].sort((a,b)=>a.name.localeCompare(b.name,'fa'));if(state.sort==='reverse')list=[...list].sort((a,b)=>b.name.localeCompare(a.name,'fa'));
const displayCategories=BACKEND_READY?['همه',...new Set(products.map(p=>p.category))]:categories;
const title=cat==='همه'?(sty==='همه'?'مجموعه محصولات':`سبک ${sty}`):`مجموعه ${cat}`;return `<main class="inner-main"><div class="collection-intro"><div class="breadcrumb"><a href="#/">صفحه اصلی</a>${I('left',12)} <span>مجموعه‌ها</span></div><span class="eyebrow">THE HANI-EL EDIT</span><h1>${esc(title)}</h1><p>جست‌وجویی آرام میان طرح‌هایی ظریف.</p></div>
<div class="catalog-toolbar"><button data-action="filter-open" class="toolbar-button">${I('filter',17)} فیلترها</button><button data-action="sort-toggle" class="toolbar-button">${I('sliders',17)} مرتب‌سازی</button><span class="results-label">${list.length.toLocaleString('fa-IR')} ${BACKEND_READY?'محصول':'نمونه'}</span></div>
${state.sortMenu?`<div class="sort-popup"><button data-action="sort-set" data-sort="default">ترتیب پیش‌فرض</button><button data-action="sort-set" data-sort="alpha">نام: الف تا ی</button><button data-action="sort-set" data-sort="reverse">نام: ی تا الف</button><small>مرتب‌سازی بر اساس قیمت پس از دریافت قیمت واقعی فعال می‌شود.</small></div>`:''}
<div class="category-chips">${displayCategories.map(c=>{const sp=new URLSearchParams();if(c!=='همه')sp.set('category',c);if(sty!=='همه')sp.set('style',sty);if(q)sp.set('q',q);return `<a href="#/collection${sp.size?'?'+sp.toString():''}" class="chip ${cat===c?'active':''}">${c}</a>`}).join('')}</div>${cat!=='همه'||sty!=='همه'?`<div class="applied-filters"><span>فیلترهای فعال</span>${cat!=='همه'?`<a href="#/collection${sty!=='همه'?'?style='+encodeURIComponent(sty):''}">${cat} ${I('close',13)}</a>`:''}${sty!=='همه'?`<a href="#/collection${cat!=='همه'?'?category='+encodeURIComponent(cat):''}">${sty} ${I('close',13)}</a>`:''}<a class="clear-filters" href="#/collection">پاک کردن همه</a></div>`:''}
${list.length?`<div class="catalog-list">${list.map(productRow).join('')}</div>`:`<div class="empty-state">${I('search',28)}<h2>محصولی در این گروه ثبت نشده است</h2><p>${BACKEND_READY?'در این دسته هنوز محصولی منتشر نشده است.':'این دسته در نسخه آزمایشی هنوز نمونه‌ای ندارد.'}</p>${linkButton('دیدن همه محصولات','#/collection')}</div>`}
${state.catalogStatus==='error'?`<div class="catalog-error" role="alert">${I('info',18)} دریافت محصولات از سرور ناموفق بود. <button type="button" data-action="catalog-retry">تلاش مجدد</button></div>`:''}<p class="catalog-disclaimer">${state.catalogStatus==='demo'?PLACEHOLDER_NOTICE:''}</p></main>`}
function productLedger(p){
 const fresh=p?.priceToman!=null&&p.priceExpiresAt>Date.now();
 const rows=[['وزن محصول',p.weightGrams!=null?Number(p.weightGrams).toLocaleString('fa-IR')+' گرم':'—'],
  ['اجرت این محصول',p.makingFeeBps!=null?(p.makingFeeBps/100).toLocaleString('fa-IR')+'٪':'—'],
  ['سود این محصول',p.profitBps!=null?(p.profitBps/100).toLocaleString('fa-IR')+'٪':'—']];
 if(fresh&&p.priceSource==='servix_18k'&&p.priceBreakdown){
  rows.push(['ارزش طلای خام',formatMoney(p.priceBreakdown.rawGoldToman)],
   ['مبلغ اجرت',formatMoney(p.priceBreakdown.makingFeeToman)],
   ['مبلغ سود',formatMoney(p.priceBreakdown.profitToman)],
   ['مالیات طبق سیاست تأییدشده',formatMoney(p.priceBreakdown.taxToman)],
   ['قیمت محاسبه‌شده',formatMoney(p.priceToman)]);
  const checked=p.priceVerifiedAt?new Intl.DateTimeFormat('fa-IR',{
   timeZone:'Asia/Tehran',dateStyle:'medium',timeStyle:'short'
  }).format(new Date(p.priceVerifiedAt)):'نامشخص';
  return '<p>قیمت بر اساس نرخ معتبر طلای ۱۸ عیار و اطلاعات اختصاصی این محصول محاسبه شده است. زمان نرخ (تهران): '+checked+
   '. قیمت تنها تا پایان اعتبار نرخ قابل نمایش است. <span class="price-source-credit">منبع نرخ: <a href="https://servix.cc/" target="_blank" rel="noopener noreferrer">Servix</a></span></p><div class="price-ledger">'+
   rows.map(([label,value])=>'<div><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join('')+'</div>';
 }
 const note=fresh&&p.priceSource==='manual_staging'
  ?'این مبلغ به‌صورت دستی تأیید شده است؛ ریز محاسبه خودکار برای آن وجود ندارد.'
  :'تا تأیید نرخ تازه و سیاست قیمت‌گذاری، مبلغ و ریز محاسبه محصول نمایش داده نمی‌شود.';
 return '<p>'+note+'</p><div class="price-ledger">'+
  rows.map(([label,value])=>'<div><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join('')+'</div>';
}
function productPage(id){const p=products.find(x=>x.id===id);if(!p)return notFound();const imgs=p.images||[p.light];let shown=imgs[state.productImage%imgs.length]||p.light;const liked=state.favorites.includes(p.id);return `<main class="inner-main product-page"><div class="breadcrumb"><a href="#/">خانه</a>${I('left',12)}<a href="#/collection?category=${encodeURIComponent(p.category)}">${p.category}</a>${I('left',12)}<span>${p.name}</span></div>
<div class="detail-grid"><div class="detail-media"><button type="button" class="detail-main-art" data-action="lightbox-open" aria-label="بزرگنمایی تصویر محصول">${img(state.theme==='dark'&&(shown===p.light||shown===p.images[0])?p.dark:shown,p.alt)}${!BACKEND_READY?'<span class="demo-label">تصویر مفهومی</span>':''}<span class="image-zoom-indicator">${I('search',16)} مشاهده بزرگ‌تر</span></button><div class="detail-thumbs ${imgs.length===1?'single-image':''}">${imgs.map((src,i)=>`<button class="detail-thumb ${i===state.productImage?'active':''}" data-action="product-img" data-index="${i}">${img(src,`نمای ${i+1} از محصول`)}</button>`).join('')}</div></div>
<div class="detail-info"><span class="eyebrow">HANI-EL / THE COLLECTION</span><h1>${p.name}</h1><p class="detail-subtitle">${BACKEND_READY?'اطلاعات واقعی همین قطعه، شفاف و بدون جزئیات حدسی.':'پیش‌نمایش یک زیور با نقش شبدر'}</p><div class="price-missing"><strong>${productPrice(p)}</strong><span>${(p.priceToman!=null&&p.priceExpiresAt>Date.now())?'قیمت محاسبه‌شده از نرخ معتبر طلا؛ تا انقضای نرخ قابل نمایش است.':'نرخ معتبر فعلاً در دسترس نیست؛ قیمت قبلی نمایش داده نمی‌شود.'}</span></div>
<div class="detail-spec-list"><div><span>دسته‌بندی</span><strong>${p.category}</strong></div><div><span>سبک</span><strong>${p.style} ${BACKEND_READY?'':'<small>(نمونه)</small>'}</strong></div><div><span>وزن و عیار</span><strong>${p.weightGrams!=null&&p.karat?`${esc(p.weightGrams)} گرم · عیار ${esc(p.karat)}`:'ثبت نشده'}</strong></div><div><span>قیمت نهایی</span><strong>${productPrice(p)}</strong></div></div>
<div class="product-buttons"><button class="primary-action" data-action="${BACKEND_READY&&!state.inquiry.enabled?'collection-open':'cart-add'}" data-id="${p.id}">${I(BACKEND_READY&&!state.inquiry.enabled?'left':'bag',19)} ${BACKEND_READY&&!state.inquiry.enabled?'مشاهده مجموعه محصولات':'افزودن به سبد'}</button><button class="outline-action" data-action="favorite" data-id="${p.id}">${I('heart',18)} ${liked?'حذف از علاقه‌مندی':'افزودن به علاقه‌مندی'}</button></div>
<div class="detail-trust-note">${I('shield',18)} این بخش صرفاً ویترین محصولات است؛ سفارش و پرداخت اینترنتی فعلاً فعال نیست.</div><div class="detail-accordions"><details><summary>مشخصات دقیق محصول ${I('down',16)}</summary><p>${BACKEND_READY?`وزن ثبت‌شده: ${p.weightGrams!=null?esc(Number(p.weightGrams).toLocaleString('fa-IR'))+' گرم':'اعلام نشده'} · عیار: ${p.karat==null?'اعلام نشده':esc(p.karat)} · دسته‌بندی: ${esc(p.category)}. ابعاد و سایر مشخصات ثبت‌نشده را حدس نمی‌زنیم.`:'وزن، عیار، طول یا ابعاد و سایر مشخصات باید از اطلاعات ثبت‌شده واقعی همین قطعه دریافت شوند.'}</p></details><details class="price-details"><summary>ریز اجزای قیمت ${I('down',16)}</summary>${productLedger(p)}</details><details><summary>راهنمای خرید ${I('down',16)}</summary><p>${BACKEND_READY?'این صفحه فقط ویترین اطلاعات و قیمت معتبر محصولات است. خرید و پرداخت آنلاین هنوز فعال نشده‌اند.':'در این پیش‌نمایش می‌توانید مراحل انتخاب و سبد خرید را امتحان کنید، اما ثبت سفارش و پرداخت فعال نیست.'}</p></details></div>
</div></div><div class="mobile-buy-dock"><div><small>${BACKEND_READY?'قیمت محصول':'قیمت و موجودی'}</small><strong>${productPrice(p)}</strong></div><button type="button" data-action="${BACKEND_READY&&!state.inquiry.enabled?'collection-open':'cart-add'}" data-id="${p.id}" class="primary-action">${I(BACKEND_READY&&!state.inquiry.enabled?'left':'bag',17)} ${BACKEND_READY&&!state.inquiry.enabled?'مجموعه‌ها':'سبد درخواست'}</button></div></main>`}
function inquiryCartPage(){
 const chosen=Object.entries(state.cart).filter(([slug,n])=>n>0)
 .map(([slug,n])=>({...products.find(x=>x.id===slug),qty:Math.min(5,n)})).filter(p=>p.id);
 if(state.inquiry.receipt){
  const receipt=state.inquiry.receipt;
  return `<main class="inner-main cart-page"><div class="page-simple-head"><span class="eyebrow">REQUEST RECEIVED</span><h1>درخواست بررسی ثبت شد</h1><p>شناسه پیگیری: <b dir="ltr">${esc(receipt.inquiryId)}</b></p></div><div class="empty-state"><h2>پرداختی انجام نشده است</h2><p>مدیر هانی‌ال موجودی بنکداری و قیمت قطعی را بررسی می‌کند. تا پیش از اعلام رسمی، هیچ مبلغی واریز نکن.</p>${linkButton('بازگشت به محصولات','#/collection')}</div></main>`;
 }
 return `<main class="inner-main cart-page">
 <div class="page-simple-head"><span class="eyebrow">YOUR SELECTION</span><h1>سبد درخواست بررسی</h1><p>این مرحله خرید قطعی نیست و نیازی به پرداخت ندارد.</p></div>
 ${chosen.length?`<div class="cart-layout"><div class="cart-items">
 ${chosen.map(p=>`<article class="cart-line">${pImage(p,'cart-line-photo')}<div class="cart-line-info"><h2>${esc(p.name)}</h2><p>قیمت فعلی ویترین: ${productPrice(p)} · تأیید نهایی توسط مدیر</p><div class="quantity-controls"><button data-action="cart-minus" data-id="${p.id}" aria-label="کاهش تعداد">${I('minus',15)}</button><span>${p.qty.toLocaleString('fa-IR')}</span><button data-action="cart-plus" data-id="${p.id}" aria-label="افزودن تعداد">${I('plus',15)}</button></div></div><button class="remove-line" data-action="cart-remove" data-id="${p.id}" aria-label="حذف">${I('trash',17)}</button></article>`).join('')}
 </div><section class="order-summary"><h2>درخواست بررسی موجودی</h2>
 <p>مبالغ نمایش‌داده‌شده پیش از استعلام بنکداری قطعی نیستند. برای ثبت درخواست هیچ پرداختی انجام نمی‌شود.</p>
 <div><span>تعداد انتخاب‌ها</span><span>${countCart().toLocaleString('fa-IR')}</span></div>
 <p class="summary-notice">پذیرش درخواست: ۱۰:۰۰ تا ۱۷:۰۰ به وقت تهران؛ ویترین شبانه‌روز قابل مشاهده است.</p>
 ${state.inquiry.accepting?`<form id="inquiry-form" class="field-stack">
 <label>نام و نام خانوادگی<input name="name" maxlength="80" autocomplete="name" required placeholder="نام برای تماس" value="${esc(state.inquiry.contactName)}"></label>
 <label>شماره موبایل<input name="phone" inputmode="tel" autocomplete="tel-national" pattern="09[0-9]{9}" required placeholder="09xxxxxxxxx" value="${esc(state.inquiry.contactPhone)}"></label>
 <div id="inquiry-challenge" aria-label="تأیید امنیتی"></div>
 <button class="primary-action" type="submit" ${state.inquiry.submitting?'disabled':''}>ثبت درخواست بررسی · بدون پرداخت</button>
 </form>`:`<p class="summary-notice" role="status">درخواست جدید خارج از ساعات کاری پذیرفته نمی‌شود؛ انتخاب‌های تو در سبد باقی می‌مانند.</p>`}
 ${state.inquiry.error?`<p class="summary-notice" role="alert">${esc(state.inquiry.error)}</p>`:''}
 </section></div>`:`<div class="empty-state">${I('bag',30)}<h2>هنوز محصولی انتخاب نکرده‌ای</h2><p>می‌توانی محصولات را انتخاب کنی و در ساعات پذیرش درخواست ثبت کنی.</p>${linkButton('مشاهده محصولات','#/collection')}</div>`}
 </main>`;
}
function cartPage(){if(BACKEND_READY&&state.inquiry.enabled)return inquiryCartPage();const chosen=Object.entries(state.cart).filter(([id,n])=>n>0).map(([id,n])=>({...products.find(p=>p.id===id),qty:n})).filter(x=>x.id);return `<main class="inner-main cart-page"><div class="page-simple-head"><span class="eyebrow">YOUR SELECTION</span><h1>سبد خرید</h1><p>انتخاب‌هایت را مرور کن</p></div>
${!chosen.length?`<div class="empty-state">${I('bag',30)}<h2>سبد خریدت هنوز خالی‌ست</h2><p>از میان طرح‌های هانی‌ال انتخاب کن.</p>${linkButton('مشاهده محصولات','#/collection')}</div>`:
`<div class="cart-layout"><div class="cart-items">${chosen.map(p=>`<article class="cart-line">${pImage(p,'cart-line-photo')}<div class="cart-line-info"><h2>${p.name}</h2><p>${BACKEND_READY?'قیمت در استعلام نهایی تأیید می‌شود':'نمونه نمایشی · بدون قیمت واقعی'}</p><div class="quantity-controls"><button data-action="cart-minus" data-id="${p.id}" aria-label="کم کردن تعداد">${I('minus',15)}</button><span>${p.qty.toLocaleString('fa-IR')}</span><button data-action="cart-plus" data-id="${p.id}" aria-label="افزودن تعداد">${I('plus',15)}</button></div></div><button class="remove-line" data-action="cart-remove" data-id="${p.id}" aria-label="حذف">${I('trash',17)}</button></article>`).join('')}</div><div class="order-summary"><h2>خلاصه سفارش</h2><div><span>تعداد اقلام</span><span>${countCart().toLocaleString('fa-IR')}</span></div><div><span>قیمت کالاها</span><span>${chosen.every(p=>p.priceToman!=null)?formatMoney(chosen.reduce((sum,p)=>sum+p.priceToman*p.qty,0)):'—'}</span></div><div><span>هزینه ارسال</span><span>—</span></div><div class="total-row"><strong>مبلغ پرداختی</strong><strong>${chosen.every(p=>p.priceToman!=null)?'پس از تأیید ارسال':'محاسبه نشده'}</strong></div><a href="#/checkout" class="primary-action">مشاهده مراحل تکمیل خرید ${I('left',16)}</a><p class="summary-notice">این صفحه برای پیش‌نمایش تجربه خرید است؛ ثبت سفارش واقعی هنوز فعال نیست.</p></div></div>`}</main>`}
function searchPage(){const q=state.query.trim();const list=q?products.filter(p=>(p.name+' '+p.category+' '+p.style).includes(q)):products.slice(0,4);return `<main class="inner-main search-page"><div class="page-simple-head"><span class="eyebrow">FIND YOUR PIECE</span><h1>جست‌وجو</h1><p>چه چیزی در ذهن داری؟</p></div>
<label class="search-field">${I('search',21)}<input id="search-page-input" autocomplete="off" type="search" value="${esc(q)}" placeholder="نام محصول یا دسته‌بندی را بنویسید…" aria-label="جست‌وجوی محصولات"></label>
<div class="popular-terms"><span>دسترسی سریع:</span>${['گردنبند','دستبند','گوشواره','شبدر'].map(x=>`<button data-action="search-term" data-term="${x}">${x}</button>`).join('')}</div>
<h2 class="search-result-title">${q?`نتایج «${esc(q)}»`:'نمونه‌های منتخب'}</h2>${list.length?`<div class="search-results">${list.map(p=>`<a href="#/product/${p.id}" class="search-result">${pImage(p,'result-image')}<div><strong>${p.name}</strong><small>${p.category} · ${p.style}</small></div>${I('left')}</a>`).join('')}</div>`:`<div class="empty-state"><h2>نتیجه‌ای پیدا نشد</h2><p>عبارت دیگری جست‌وجو کن.</p></div>`}</main>`}
function aboutPage(){return `<main class="inner-main about-page"><div class="about-visual">${art('story-ivory.webp','story-night.webp','زیورآلات شبدر در عکاسی ادیتوریال','about-image')}</div><div class="about-text"><span class="eyebrow">THE STORY / HANI-EL GOLD</span><h1>داستان هانی‌ال</h1><h2>زیبایی، از نگاه ما</h2><p>هانی‌ال را با یک نگاه آرام به زیبایی تصور می‌کنیم؛ جایی که انتخاب زیورآلات فرصتی برای بیان سلیقه شخصی است.</p><p>در طراحی تجربه این سایت، نمایش روشن محصولات، دسترسی ساده به اطلاعات و احترام به انتخاب مشتری را در اولویت گذاشته‌ایم.</p><p class="about-placeholder">داستان واقعی شکل‌گیری مجموعه، تصاویر کسب‌وکار و اطلاعات قابل‌راستی‌آزمایی برند پس از دریافت محتوای رسمی در این صفحه جایگزین می‌شوند.</p>${linkButton('کشف مجموعه‌ها','#/collection')}</div></main>`}
function guidePage(){return `<main class="inner-main guide-page"><div class="page-simple-head"><span class="eyebrow">SHOPPING GUIDE</span><h1>راهنمای خرید</h1><p>اطلاعاتی که پیش از انتخاب نیاز داری</p></div><div class="guide-panels">${trustSections.map((x,i)=>`<article class="guide-item"><div class="guide-num">۰${i+1}</div><div><h2>${x.name}</h2><p>${x.body}</p></div></article>`).join('')}</div><p class="about-placeholder">توضیحات حقوقی، شرایط پرداخت، مرجوعی و ارسال باید مطابق روند واقعی و اسناد تأییدشده فروشگاه تکمیل شوند. این صفحه فعلاً جایگزین شرایط رسمی فروش نیست.</p></main>`}

function favoritesPage(){const saved=state.favorites.map(id=>products.find(p=>p.id===id)).filter(Boolean);return `<main class="inner-main favorites-page"><div class="page-simple-head"><span class="eyebrow">YOUR PRIVATE EDIT</span><h1>انتخاب‌های تو</h1><p>قطعه‌هایی که برای نگاه دوباره نگه داشته‌ای</p></div>${saved.length?`<div class="favorites-grid">${saved.map(p=>`<article class="favorite-card"><a href="#/product/${p.id}" class="favorite-art">${pImage(p,'favorite-image')}</a><div class="favorite-card-detail"><div><span class="eyebrow">${p.category}</span><h2><a href="#/product/${p.id}">${p.name}</a></h2><small>اطلاعات قیمت و موجودی هنوز متصل نشده</small></div><button type="button" data-action="favorite" data-id="${p.id}" class="favorite-btn liked" aria-label="حذف ${p.name} از علاقه‌مندی‌ها">${I('heart',21)}</button></div></article>`).join('')}</div>`:`<div class="empty-state">${I('heart',31)}<h2>هنوز قطعه‌ای ذخیره نکرده‌ای</h2><p>هرجا قلبی دیدی، می‌توانی آن محصول را اینجا نگه داری.</p>${linkButton('کشف مجموعه‌ها','#/collection')}</div>`}</main>`}
const faqItems=[
 ['آیا قیمت‌های نمایش‌داده‌شده نهایی هستند؟','در این نسخه آزمایشی هیچ قیمت واقعی نمایش داده نمی‌شود. در فروشگاه نهایی، قیمت تأییدشده و اجزای آن تنها از داده‌های معتبر و سامانه فروش دریافت خواهند شد.'],
 ['وزن و عیار هر قطعه کجا نمایش داده می‌شود؟','در صفحه جزئیات هر محصول فضایی برای وزن، عیار، ابعاد و تصاویر واقعی پیش‌بینی شده است. انتشار این اطلاعات منوط به ثبت و تأیید مشخصات هر کالا است.'],
 ['آیا می‌توانم اکنون سفارش ثبت کنم؟','خیر. افزودن به سبد صرفاً برای تجربه کاربری این نمونه است و هنوز به موجودی، ارسال یا درگاه پرداخت متصل نیست.'],
 ['شرایط ارسال و بازگشت کالا چیست؟','شرایط رسمی ارسال، مرجوعی، مسئولیت‌ها و رسیدگی به درخواست‌ها باید از سوی کسب‌وکار تأیید شود. تا آن زمان هیچ وعده‌ای درباره زمان ارسال یا امکان مرجوعی در سایت درج نمی‌کنیم.'],
 ['چطور محصول مناسب سلیقه‌ام را پیدا کنم؟','از بخش «سبک تو، انتخاب تو» یا فیلتر سبک در مجموعه محصولات می‌توانی میان مینیمال، کلاسیک و چشمگیر جابه‌جا شوی.']
];
function faqPage(){return `<main class="inner-main informational-page"><div class="page-simple-head"><span class="eyebrow">THE ANSWERS</span><h1>پرسش‌های متداول</h1><p>پیش از انتخاب، با اطمینان بیشتری ببین و بررسی کن</p></div><div class="faq-list">${faqItems.map(([q,a],i)=>`<details class="faq-item" ${i===0?'open':''}><summary><span>${q}</span>${I('down',18)}</summary><p>${a}</p></details>`).join('')}</div><div class="subtle-next"><p>هنوز پرسشی باقی مانده؟</p>${linkButton('راه‌های ارتباط','#/contact')}</div></main>`}
function contactPage(){const d=state.contactDraft;return `<main class="inner-main informational-page">${sectionCrumb('ارتباط با هانی‌ال','HANI-EL / CONTACT','برای یک انتخاب مطمئن، گفت‌وگو همیشه ارزشمند است.')}<div class="contact-layout"><div class="contact-photo">${art('story-ivory.webp','story-night.webp','فضای تصویری مفهومی هانی‌ال','contact-art')}</div><div class="contact-body contact-form-panel"><span class="eyebrow">STAY CONNECTED</span><h2>پیام به هانی‌ال</h2><p>این فرم از نظر ظاهری و اعتبارسنجی آماده است. ارسال واقعی پس از اتصال سامانه پشتیبانی انجام می‌شود.</p><form id="contact-form" class="elegant-form" novalidate><div><label for="contact-name">نام و نام خانوادگی</label><input id="contact-name" name="name" autocomplete="name" required value="${esc(d.name||'')}" placeholder="نام شما"></div><div><label for="contact-mobile">شماره همراه</label><input id="contact-mobile" name="mobile" inputmode="numeric" maxlength="11" dir="ltr" required value="${esc(d.mobile||'')}" placeholder="09*********"></div><div><label for="contact-topic">موضوع پیام</label><select id="contact-topic" name="topic">${['راهنمای انتخاب محصول','سؤال درباره خرید','پشتیبانی سفارش','موضوع دیگر'].map(t=>`<option value="${t}" ${d.topic===t?'selected':''}>${t}</option>`).join('')}</select></div><div><label for="contact-message">متن پیام</label><textarea id="contact-message" name="message" required rows="4" placeholder="چطور می‌توانیم کمکت کنیم؟">${esc(d.message||'')}</textarea></div><p class="form-note" data-form-error hidden></p><button type="submit" class="primary-action" ${state.contactBusy?'disabled':''}>${state.contactBusy?'در حال بررسی':'ارسال پیام'} ${I('left',16)}</button>${state.contactFeedback?`<p class="form-note" role="status">${esc(state.contactFeedback)}</p>`:''}</form><div class="pending-information">${I('info',19)} اطلاعات رسمی تماس و ساعات پاسخ‌گویی پس از تأیید فروشگاه اضافه می‌شوند.</div></div></div></main>`}
function policiesPage(){return `<main class="inner-main informational-page"><div class="page-simple-head"><span class="eyebrow">CLEAR BY DESIGN</span><h1>شرایط و شفافیت خرید</h1><p>اطلاعات حقوقی باید کامل، قابل‌فهم و مستند باشد</p></div><div class="guide-panels"><article class="guide-item"><div class="guide-num">۰۱</div><div><h2>قیمت و فاکتور</h2><p>جزئیات محاسبه، اعتبار قیمت، اجرت، سود و کسورات طبق داده‌های رسمی و شرایط نهایی فروشگاه تکمیل می‌شود.</p></div></article><article class="guide-item"><div class="guide-num">۰۲</div><div><h2>ارسال و تحویل</h2><p>محدوده ارسال، هزینه، زمان‌بندی، بسته‌بندی و شیوه پیگیری باید پیش از فروش واقعی ثبت و تأیید شود.</p></div></article><article class="guide-item"><div class="guide-num">۰۳</div><div><h2>مرجوعی و حقوق مشتری</h2><p>متن حقوقی مربوط به انصراف، بازگشت، استثناهای احتمالی و رسیدگی به شکایت هنوز نهایی نشده است.</p></div></article></div><div class="pending-information">${I('shield',19)} این صفحه صرفاً اسکلت محتوایی است؛ شرایط رسمی فروش یا تعهد حقوقی منتشر نمی‌کند.</div></main>`}
function sectionCrumb(label,eyebrow,description=''){return `<div class="page-simple-head"><span class="eyebrow">${eyebrow}</span><h1>${label}</h1>${description?`<p>${description}</p>`:''}</div>`}
function accountPage(){return `<main class="inner-main account-page">${sectionCrumb('حساب هانی‌ال','THE PRIVATE SPACE','انتخاب‌ها، نشانی‌ها و سفارش‌ها در یک فضای آرام و شخصی')}<div class="account-layout"><nav class="account-nav" aria-label="بخش‌های حساب"><a href="#/account" aria-current="page">${I('user',19)} ورود و حساب کاربری</a><a href="#/orders">${I('list',19)} سفارش‌های من</a><a href="#/addresses">${I('location',19)} نشانی‌های من</a><a href="#/favorites">${I('heart',19)} انتخاب‌های ذخیره‌شده</a></nav><section class="account-card"><span class="eyebrow">MEMBER ACCESS</span><h2>ورود به فضای شخصی</h2><p>در سایت نهایی، ورود با شماره موبایل و رمز یک‌بارمصرف انجام می‌شود؛ بدون نیاز به ساخت رمز عبور.</p>${state.accountStep==='phone'?`<form id="account-phone-form" class="elegant-form" novalidate><label for="member-mobile">شماره موبایل</label><input id="member-mobile" name="mobile" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="۰۹۱۲•••••••" dir="ltr" maxlength="11" value="${esc(state.accountPhone)}" required><small>شماره فقط پس از اتصال سرویس احراز هویت به سرور ارسال می‌شود.</small><button type="submit" class="primary-action" ${state.accountBusy?'disabled':''}>${state.accountBusy?'لطفاً صبر کنید':'دریافت کد ورود'} ${I('left',17)}</button></form>`:`<form id="account-verify-form" class="elegant-form" novalidate><p>کد تأیید شماره ${esc(state.accountPhone)}</p><label for="member-otp">کد تأیید</label><input id="member-otp" name="code" type="text" inputmode="numeric" pattern="[0-9۰-۹]{4,8}" autocomplete="one-time-code" maxlength="8" placeholder="••••••" dir="ltr" required><button class="primary-action" type="submit">تأیید کد</button><button type="button" class="text-action" data-action="account-edit">ویرایش شماره</button></form>`}${state.accountMessage?`<p class="form-note" role="status">${esc(state.accountMessage)}</p>`:''}<div class="pending-information">${I('shield',19)} ورود تا فعال‌شدن سرویس پیامک و حساب‌های مشتری در بک‌اند غیرفعال است.</div></section></div></main>`}
function ordersPage(){return `<main class="inner-main informational-page">${sectionCrumb('سفارش‌های من','ORDER HISTORY','برای مشاهده وضعیت سفارش‌ها، ورود به حساب لازم است.')}<div class="account-grid"><article class="overview-tile">${I('package',29)}<h2>تاریخچه سفارش‌ها</h2><p>پس از اتصال حساب مشتری، سفارش‌ها و جزئیات فاکتور در اینجا دیده می‌شوند.</p>${linkButton('ورود به حساب','#/account')}</article><article class="overview-tile">${I('truck',29)}<h2>پیگیری تحویل</h2><p>وضعیت سفارش و کد رهگیری تنها از اطلاعات تأییدشده سرور نمایش داده می‌شود.</p>${linkButton('راهنمای خرید','#/guide')}</article></div></main>`}
function addressesPage(){const v=state.addressPreview;const d=state.addressDraft;
return `<main class="inner-main informational-page">${sectionCrumb('نشانی‌های من','SAVED ADDRESSES','مدیریت نشانی تحویل برای حساب شخصی هانی‌ال')}<div class="address-actions"><p>اطلاعات نشانی در نسخه نهایی با حساب کاربری هماهنگ می‌شود. این فرم فقط برای تست رابط است.</p><button type="button" class="outline-action" data-action="address-new">${I('plus',17)} افزودن نشانی</button></div>${v?`<article class="address-preview"><span class="eyebrow">LOCAL PREVIEW</span><h2>${esc(v.name)}</h2><p>${esc(v.province)}، ${esc(v.city)}، ${esc(v.address)}</p><p>کد پستی: ${esc(v.postal)}</p><div class="address-buttons"><button class="outline-action" type="button" data-action="address-edit">ویرایش</button><button class="text-action" type="button" data-action="address-clear">پاک کردن پیش‌نمایش</button></div></article>`:''}${state.addressFormOpen?`<section class="account-card address-form-card"><span class="eyebrow">DELIVERY LOCATION</span><h2>مشخصات نشانی</h2><form id="address-form" class="elegant-form" novalidate><div class="form-grid"><div><label for="address-name">نام گیرنده</label><input id="address-name" name="name" required value="${esc(d.name||'')}" placeholder="نام و نام خانوادگی"></div><div><label for="address-mobile">شماره همراه</label><input id="address-mobile" name="mobile" dir="ltr" inputmode="numeric" maxlength="11" required value="${esc(d.mobile||'')}" placeholder="09*********"></div><div><label for="address-province">استان</label><input id="address-province" name="province" required value="${esc(d.province||'')}" placeholder="استان"></div><div><label for="address-city">شهر</label><input id="address-city" name="city" required value="${esc(d.city||'')}" placeholder="شهر"></div><div class="span-all"><label for="address-street">نشانی</label><textarea id="address-street" name="address" rows="3" required placeholder="نشانی کامل">${esc(d.address||'')}</textarea></div><div><label for="address-postal">کد پستی</label><input id="address-postal" name="postal" dir="ltr" maxlength="10" inputmode="numeric" required value="${esc(d.postal||'')}" placeholder="۱۰ رقم"></div></div><p class="form-note" data-form-error hidden></p><div class="form-actions"><button class="primary-action" type="submit">پیش‌نمایش نشانی ${I('left',16)}</button><button class="text-action" data-action="address-cancel" type="button">انصراف</button></div></form></section>`:!v?`<div class="empty-state soft-empty">${I('location',34)}<h2>نشانی‌ای برای نمایش وجود ندارد</h2><p>می‌توانی ظاهر فرم نشانی را امتحان کنی؛ هیچ اطلاعاتی روی سرور یا حافظه دائمی ذخیره نخواهد شد.</p><button class="outline-action" type="button" data-action="address-new">ثبت آزمایشی نشانی</button></div>`:''}<div class="pending-information">${I('shield',18)} نشانی آزمایشی فقط تا بازبودن همین صفحه در حافظه موقت باقی می‌ماند. داده‌های واقعی را وارد نکن.</div></main>`;
}
function privacyPage(){return `<main class="inner-main informational-page">${sectionCrumb('حریم خصوصی','DATA & TRUST','حفاظت از داده‌های مشتری بخشی از تجربه خرید مطمئن است.')}<div class="guide-panels"><article class="guide-item"><span class="guide-num">۰۱</span><div><h2>داده‌های موردنیاز خرید</h2><p>در مرحله فروش واقعی فقط اطلاعات ضروری برای حساب، سفارش و تحویل دریافت می‌شوند؛ جزئیات پردازش و نگهداری باید در سیاست رسمی منتشر شود.</p></div></article><article class="guide-item"><span class="guide-num">۰۲</span><div><h2>نسخه آزمایشی حاضر</h2><p>فرم آزمایشی تکمیل خرید هیچ اطلاعات شخصی را به سرور ارسال یا در ذخیره‌سازی مرورگر نگهداری نمی‌کند. علاقه‌مندی‌ها و سبد خرید محلی ذخیره می‌شوند.</p></div></article><article class="guide-item"><span class="guide-num">۰۳</span><div><h2>نسخه عملیاتی</h2><p>پس از انتخاب تأمین‌کننده میزبانی، پیامک، پرداخت و ارسال، متن دقیق سیاست حریم خصوصی، راه ارتباط برای درخواست‌های داده و مدت نگهداری تدوین می‌شود.</p></div></article></div><div class="pending-information">${I('info',19)} متن بالا اطلاع‌رسانی نسخه نمایشی است و جایگزین سیاست حقوقی نهایی نیست.</div></main>`}
function checkoutPage(){const chosen=Object.entries(state.cart).filter(([id,n])=>n>0).map(([id,n])=>({...products.find(p=>p.id===id),qty:n})).filter(p=>p.id);const count=countCart();const fields=state.checkoutDraft;const reviewing=state.checkoutStep===2;
 return `<main class="inner-main checkout-page">${sectionCrumb('تکمیل خرید','THE PURCHASE JOURNEY','مرور اطلاعات سفارش در محیط آزمایشی؛ بدون ثبت یا پرداخت')}<div class="checkout-steps"><div class="checkout-step complete"><span>۱</span><strong>انتخاب‌ها</strong></div><div class="checkout-step ${!reviewing?'active':'complete'}"><span>۲</span><strong>مشخصات تحویل</strong></div><div class="checkout-step ${reviewing?'active':''}"><span>۳</span><strong>بازبینی نهایی</strong></div></div>${count===0?`<div class="empty-state">${I('bag',30)}<h2>برای ادامه، ابتدا محصولی انتخاب کن</h2>${linkButton('دیدن مجموعه‌ها','#/collection')}</div>`:
 `<div class="checkout-layout"><section class="checkout-panel"><span class="eyebrow">${reviewing?'THE FINAL REVIEW':'DELIVERY DETAILS'}</span><h2>${reviewing?'بازبینی مشخصات':'مشخصات تحویل'}</h2>${reviewing?`<p>اطلاعات زیر صرفاً در حافظه همین صفحه قرار دارند و به جایی ارسال نمی‌شوند.</p><dl class="checkout-review">${[['نام و نام خانوادگی','name'],['شماره همراه','mobile'],['استان','province'],['شهر','city'],['نشانی','address'],['کد پستی','postal'],['توضیحات','notes']].map(([label,k])=>`<div><dt>${label}</dt><dd>${esc(fields[k]||'—')}</dd></div>`).join('')}</dl><button type="button" data-action="checkout-edit" class="outline-action">${I('right',16)} اصلاح مشخصات</button><div class="pending-information">${I('shield',19)} ارسال سفارش و پرداخت تا اتصال قیمت و موجودی تأییدشده غیرفعال است.</div>`:
 `<p>برای بررسی تجربه کاربری، می‌توانی فرم را پر کنی. داده‌ها ذخیره دائمی و ارسال نمی‌شوند.</p><form id="checkout-form" class="checkout-form elegant-form" novalidate><div class="form-grid"><div><label for="order-name">نام و نام خانوادگی <span aria-hidden="true">*</span></label><input id="order-name" name="name" autocomplete="name" required value="${esc(fields.name||'')}" placeholder="نام گیرنده"><small data-error-for="name"></small></div><div><label for="order-mobile">شماره همراه <span aria-hidden="true">*</span></label><input id="order-mobile" name="mobile" type="tel" inputmode="numeric" autocomplete="tel-national" dir="ltr" maxlength="11" required value="${esc(fields.mobile||'')}" placeholder="09*********"><small data-error-for="mobile"></small></div><div><label for="order-province">استان <span aria-hidden="true">*</span></label><input id="order-province" name="province" autocomplete="address-level1" required value="${esc(fields.province||'')}" placeholder="استان"><small data-error-for="province"></small></div><div><label for="order-city">شهر <span aria-hidden="true">*</span></label><input id="order-city" name="city" autocomplete="address-level2" required value="${esc(fields.city||'')}" placeholder="شهر"><small data-error-for="city"></small></div><div class="span-all"><label for="order-address">نشانی دقیق <span aria-hidden="true">*</span></label><textarea id="order-address" name="address" autocomplete="street-address" required rows="3" placeholder="خیابان، کوچه، پلاک و واحد">${esc(fields.address||'')}</textarea><small data-error-for="address"></small></div><div><label for="order-postal">کد پستی ده‌رقمی <span aria-hidden="true">*</span></label><input id="order-postal" name="postal" inputmode="numeric" maxlength="10" dir="ltr" autocomplete="postal-code" required value="${esc(fields.postal||'')}" placeholder="••••••••••"><small data-error-for="postal"></small></div><div><label for="order-notes">توضیحات (اختیاری)</label><input id="order-notes" name="notes" value="${esc(fields.notes||'')}" placeholder="مثلاً توضیح نشانی"></div></div><div class="form-privacy">${I('shield',19)} این مرحله فقط پیش‌نمایش فرم است؛ از اطلاعات واقعی شخصی استفاده نکن.</div><button type="submit" class="primary-action">بازبینی مشخصات ${I('left',17)}</button></form>`}</section><aside class="checkout-panel checkout-summary"><h2>خلاصه انتخاب‌ها</h2><div class="checkout-items-mini">${chosen.map(p=>`<div class="checkout-mini-line">${pImage(p,'checkout-mini-img')}<div><strong>${esc(p.name)}</strong><small>تعداد: ${Number(p.qty).toLocaleString('fa-IR')}</small></div></div>`).join('')}</div><div class="checkout-summary-row"><span>تعداد اقلام</span><strong>${count.toLocaleString('fa-IR')}</strong></div><div class="checkout-summary-row"><span>مبلغ نهایی</span><strong>پس از تأیید قیمت</strong></div><div class="checkout-summary-row"><span>هزینه ارسال</span><strong>بعداً مشخص می‌شود</strong></div><button class="primary-action" disabled type="button">ثبت سفارش و پرداخت — غیرفعال</button><p class="summary-notice">ثبت سفارش واقعی، استعلام موجودی و پرداخت پس از تکمیل بک‌اند و مقررات فروش فعال می‌شوند.</p>${linkButton('ویرایش سبد','#/cart')}</aside></div>`}</main>`;
}
function notFound(){return `<main class="inner-main"><div class="empty-state"><h1>صفحه پیدا نشد</h1>${linkButton('بازگشت به صفحه اصلی','#/')}</div></main>`}
function routeInfo(){const h=decodeURI(location.hash||'#/');const path=h.slice(1).split('?')[0];if(path==='/')return {name:'home'};if(path.startsWith('/product/'))return {name:'product',id:path.slice(9)};if(['/collection','/search','/cart','/about','/guide','/favorites','/faq','/contact','/policies','/checkout','/account','/orders','/addresses','/privacy'].includes(path))return {name:path.slice(1)};return {name:'404'}}
function menu(){return `<div class="overlay menu-overlay" data-overlay="menu" role="dialog" aria-modal="true" aria-label="منوی سایت"><div class="menu-panel"><div class="menu-top">${btn('menu-close','close','بستن منو')} ${brand()}</div><div class="menu-heading"><span class="eyebrow">جست‌وجو در مجموعه‌ها</span><h2>چه چیزی را می‌پسندی؟</h2></div><nav class="menu-category-list" aria-label="دسته‌بندی‌ها">${(BACKEND_READY?[...new Set(products.map(p=>p.category))]:['گردنبند','دستبند','گوشواره','انگشتر','آویز']).map(c=>`<a href="#/collection?category=${encodeURIComponent(c)}" class="menu-category">${c}<span>${I('left',22)}</span></a>`).join('')}</nav><div class="menu-secondary"><a href="#/favorites">علاقه‌مندی‌ها</a><a href="#/account">حساب کاربری</a><a href="#/orders">سفارش‌ها</a><a href="#/guide">راهنمای خرید</a><a href="#/about">داستان هانی‌ال</a><a href="#/faq">پرسش‌ها</a></div><a class="menu-feature" href="#/collection"><div class="menu-feature-copy"><strong>یک نگاه نزدیک</strong><span>به مجموعه‌های هانی‌ال</span><span class="menu-feature-cta">کشف محصولات ${I('left',16)}</span></div>${BACKEND_READY&&products.length?pImage(products[0],'menu-feature-image'):art('necklace-ivory.webp','necklace-night.webp','گردنبند شبدر','menu-feature-image')}</a><div class="menu-bottom"><button data-action="theme" class="menu-theme">${I(state.theme==='dark'?'sun':'moon',17)} تغییر تم</button><button data-action="search" class="menu-theme">${I('search',17)} جست‌وجو</button></div></div></div>`}
function filterPanel(){return `<div class="overlay filter-overlay" data-overlay="filter" role="dialog" aria-modal="true" aria-label="فیلتر محصولات"><div class="filter-scrim" data-action="filter-close"></div><div class="filter-sheet"><div class="sheet-hd"><h2>فیلتر محصولات</h2>${btn('filter-close','close','بستن فیلتر')}</div><div class="filter-content"><div class="filter-group"><h3>دسته‌بندی</h3><div class="filter-pills">${categories.map(c=>`<button class="chip ${state.filterCategory===c?'active':''}" data-action="filter-cat" data-category="${c}">${c}</button>`).join('')}</div></div><div class="filter-group"><h3>سبک طراحی</h3><div class="filter-pills">${['همه',...styles].map(c=>`<button class="chip ${state.filterStyle===c?'active':''}" data-action="filter-style" data-style="${c}">${c}</button>`).join('')}</div></div><div class="filter-group unavailable"><h3>وزن و محدوده قیمت</h3><p>${I('info',18)} بعد از اتصال قیمت و وزن واقعی محصولات فعال می‌شود.</p></div></div><div class="sheet-footer"><button data-action="filter-apply" class="primary-action">نمایش ${products.filter(p=>(state.filterCategory==='همه'||p.category===state.filterCategory)&&(state.filterStyle==='همه'||p.style===state.filterStyle)).length.toLocaleString('fa-IR')} نمونه</button><button data-action="filter-reset" class="text-action">پاک کردن انتخاب‌ها</button></div></div></div>`}
function lightboxPanel(){const rt=routeInfo();const p=products.find(x=>x.id===rt.id);if(!p)return '';const imgs=p.images||[p.light];let src=imgs[state.productImage%imgs.length]||p.light;if(state.theme==='dark'&&(src===p.light||src===imgs[0]))src=p.dark;return `<div class="lightbox-overlay" role="dialog" aria-modal="true" aria-label="نمای نزدیک محصول"><div class="lightbox-header"><strong>${p.name}</strong>${btn('lightbox-close','close','بستن بزرگنمایی')}</div><div class="lightbox-viewport">${img(src,p.alt,'lightbox-image')}<div class="lightbox-controls">${btn('lightbox-prev','right','تصویر پیشین')}<span>${(state.productImage%imgs.length+1).toLocaleString('fa-IR')} / ${imgs.length.toLocaleString('fa-IR')}</span>${btn('lightbox-next','left','تصویر بعدی')}</div></div><p>تصاویر نمایشی هستند؛ برای خرید، عکس واقعی همین محصول لازم است.</p></div>`}
function notification(){return state.notice?`<div class="toast" role="status">${I('check',18)} ${esc(state.notice)}</div>`:''}
function catalogStatusPage(){
 const loading=state.catalogStatus==='loading';const empty=state.catalogStatus==='ready';
 return `<main class="inner-main"><div class="empty-state soft-empty">${I(loading?'clock':'info',30)}<h2>${loading?'در حال دریافت محصولات':empty?'هنوز محصولی برای نمایش ثبت نشده':'ارتباط با اطلاعات محصولات برقرار نشد'}</h2><p>${loading?'در حال بررسی اطلاعات به‌روز فروشگاه هستیم.':empty?'محصولات پس از ثبت در سیستم فروشگاه اینجا نمایش داده می‌شوند.':'لطفاً اتصال اینترنت را بررسی کن و دوباره تلاش کن.'}</p>${!loading&&!empty?`<button type="button" class="outline-action" data-action="catalog-retry">تلاش مجدد</button>`:''}</div></main>`;
}
function render(){const rt=routeInfo();
 const metaTitles={home:'خانه',collection:'مجموعه‌ها',product:'جزئیات محصول',cart:'سبد خرید',search:'جست‌وجو',favorites:'علاقه‌مندی‌ها',account:'حساب کاربری',orders:'سفارش‌ها',addresses:'نشانی‌ها',checkout:'تکمیل خرید',about:'درباره هانی‌ال',guide:'راهنمای خرید',faq:'پرسش‌های متداول',contact:'ارتباط با ما',policies:'شرایط خرید',privacy:'حریم خصوصی'};
 document.title=(rt.name==='home'?'HANI-EL GOLD':(metaTitles[rt.name]||'هانی‌ال')+' | HANI-EL GOLD');
document.documentElement.dataset.theme=state.theme;document.querySelector('#theme-color-meta').setAttribute('content',state.theme==='dark'?'#111710':'#F7F5EF');const needsCatalog=['home','collection','product','search'].includes(rt.name);const content=(BACKEND_READY&&needsCatalog&&(state.catalogStatus!=='ready'||!products.length))?catalogStatusPage():rt.name==='home'?home():rt.name==='collection'?collection():rt.name==='product'?productPage(rt.id):rt.name==='cart'?cartPage():rt.name==='search'?searchPage():rt.name==='about'?aboutPage():rt.name==='guide'?guidePage():rt.name==='favorites'?favoritesPage():rt.name==='faq'?faqPage():rt.name==='contact'?contactPage():rt.name==='policies'?policiesPage():rt.name==='checkout'?checkoutPage():rt.name==='account'?accountPage():rt.name==='orders'?ordersPage():rt.name==='addresses'?addressesPage():rt.name==='privacy'?privacyPage():notFound();document.getElementById('app').innerHTML=`${header()}${content}${footer()}${state.menu?menu():''}${state.filter?filterPanel():''}${state.lightbox?lightboxPanel():''}${notification()}<button type="button" class="back-top" data-action="back-top" aria-label="بازگشت به بالای صفحه">${I('up',18)}</button>`;document.body.classList.toggle('overlay-open',state.menu||state.filter||state.lightbox);document.body.classList.toggle('showcase-only',BACKEND_READY);document.body.classList.toggle('inquiry-active',BACKEND_READY&&state.inquiry.enabled);renderInquiryCaptcha();scheduleEnhancements();manageDialogFocus()}
function save(){try{localStorage.setItem('haniel-theme',JSON.stringify(state.theme));localStorage.setItem('haniel-cart',JSON.stringify(state.cart));localStorage.setItem('haniel-favorites',JSON.stringify(state.favorites))}catch{ /* local files / privacy modes may restrict storage */ }}
function toast(t){state.notice=t;render();setTimeout(()=>{if(state.notice===t){state.notice=false;render()}},2500)}
function go(to){location.hash=to;}
document.addEventListener('click',(e)=>{const a=e.target.closest('[data-action]');if(!a){if(e.target.closest('a[href^="#/"]')){state.menu=false;state.filter=false;state.sortMenu=false;state.productImage=0;state.lightbox=false;render()}return;}const action=a.dataset.action;const id=a.dataset.id;const ix=Number(a.dataset.index||0);switch(action){
case 'menu-open':state.menu=true;break;case 'menu-close':state.menu=false;break;case 'theme':state.theme=state.theme==='dark'?'light':'dark';save();break;
case 'search':state.menu=false;state.filter=false;go('#/search');break;case 'cart-open':go('#/cart');break;
case 'trust':state.trust=state.trust===a.dataset.key?null:a.dataset.key;break;
case 'hero-set':state.hero=ix;break;case 'featured-next':state.featured=(state.featured+1)%Math.min(3,products.length);break;case 'featured-prev':state.featured=(state.featured+Math.min(3,products.length)-1)%Math.min(3,products.length);break;
case 'style-set':state.selectedStyle=a.dataset.style;state.styleIndex=0;break;case 'style-thumbnail':state.styleIndex=ix;break;case 'style-next':state.styleIndex+=1;break;case 'style-prev':state.styleIndex+=products.filter(p=>p.style===state.selectedStyle).length-1;break;
case 'macro':{
 state.macroIndex=Math.max(0,Math.min(2,ix));
 const section=a.closest('.macro-section');
 if(section){
  section.querySelectorAll('.droom-point').forEach(node=>{
   const selected=Number(node.dataset.index)===state.macroIndex;
   node.classList.toggle('active',selected);node.setAttribute('aria-pressed',String(selected));
  });
  section.querySelectorAll('[data-droom-panel]').forEach(node=>{node.hidden=Number(node.dataset.droomPanel)!==state.macroIndex;});
  const counter=section.querySelector('[data-droom-count]');
  if(counter)counter.textContent=`۰${state.macroIndex+1} / ۰۳`;
  const photo=section.querySelector('.macro-photo');
  if(photo){photo.classList.remove('detail-focus-0','detail-focus-1','detail-focus-2');photo.classList.add(`detail-focus-${state.macroIndex}`);}
  return; // Keep product photograph mounted: no full-page re-render on hotspot tap.
 }
 break;
}
case 'filter-open':{const params=getParams();state.filterCategory=params.get('category')||'همه';state.filterStyle=params.get('style')||'همه';state.filter=true;break}
case 'filter-close':state.filter=false;break;case 'filter-cat':state.filterCategory=a.dataset.category;break;case 'filter-style':state.filterStyle=a.dataset.style;break;
case 'filter-apply':{const v=new URLSearchParams();if(state.filterCategory!=='همه')v.set('category',state.filterCategory);if(state.filterStyle!=='همه')v.set('style',state.filterStyle);state.filter=false;go('#/collection'+(v.size?'?'+v.toString():''));break}
case 'filter-reset':state.filterCategory='همه';state.filterStyle='همه';break;
case 'sort-toggle':state.sortMenu=!state.sortMenu;break;case 'sort-set':state.sort=a.dataset.sort;state.sortMenu=false;break;
case 'product-img':state.productImage=ix;break;case 'lightbox-open':state.lightbox=true;break;case 'lightbox-close':state.lightbox=false;break;case 'lightbox-next':state.productImage++;break;case 'lightbox-prev':{const pr=products.find(p=>p.id===routeInfo().id);state.productImage+=(pr?.images?.length||1)-1;break}
case 'collection-open':location.hash='#/collection';return;
case 'cart-add':if(BACKEND_READY&&!state.inquiry.enabled){toast('خرید آنلاین در این ویترین هنوز فعال نشده است.');return;}state.inquiry.receipt=null;state.cart[id]=(state.cart[id]||0)+1;save();toast('به سبد خرید اضافه شد');return;
case 'cart-plus':state.cart[id]=(state.cart[id]||0)+1;save();break;case 'cart-minus':state.cart[id]=Math.max(0,(state.cart[id]||0)-1);save();break;case 'cart-remove':delete state.cart[id];save();break;
case 'favorite':{const wasSaved=state.favorites.includes(id);state.favorites=wasSaved?state.favorites.filter(t=>t!==id):[...state.favorites,id];save();state.notice=wasSaved?'از علاقه‌مندی‌ها حذف شد':'در انتخاب‌های تو ذخیره شد';setTimeout(()=>{state.notice=false;const notice=document.querySelector('.toast');if(notice)notice.remove()},2200);break;}
case 'search-term':state.query=a.dataset.term;break;case 'catalog-retry':state.catalogStatus='loading';hydrateCatalog();break;case 'checkout-edit':state.checkoutStep=1;break;case 'account-edit':state.accountStep='phone';state.accountMessage='';break;case 'address-new':state.addressFormOpen=true;break;case 'address-edit':state.addressDraft={...state.addressPreview};state.addressFormOpen=true;break;case 'address-clear':state.addressPreview=null;state.addressDraft={};state.addressFormOpen=false;break;case 'address-cancel':state.addressFormOpen=false;break;
default:return;}render();if(action==='search-term'){const field=document.getElementById('search-page-input');if(field)field.focus()}});
document.addEventListener('submit',e=>{if(e.target.id==='inquiry-form')submitInquiry(e);});
document.addEventListener('input',(e)=>{if(e.target.closest('#checkout-form')&&e.target.name){state.checkoutDraft[e.target.name]=e.target.value;}if(e.target.closest('#address-form')&&e.target.name){state.addressDraft[e.target.name]=e.target.value;}if(e.target.closest('#contact-form')&&e.target.name){state.contactDraft[e.target.name]=e.target.value;}if(e.target.id==='search-page-input'){state.query=e.target.value; // preserve caret by refreshing only after input
const start=e.target.selectionStart;render();const field=document.getElementById('search-page-input');if(field){field.focus();field.setSelectionRange(start,start)}}});

document.addEventListener('submit',async e=>{
 const form=e.target;
 if(form.id==='checkout-form'){
  e.preventDefault();const data=Object.fromEntries(new FormData(form).entries());
  const errors={};
  if((data.name||'').trim().length<3)errors.name='نام گیرنده را کامل وارد کن.';
  if(!isIranMobile(data.mobile))errors.mobile='شماره موبایل ۱۱ رقمی معتبر وارد کن.';
  for(const field of ['province','city','address'])if((data[field]||'').trim().length<2)errors[field]='این بخش را کامل کن.';
  if(!/^\d{10}$/.test(visiblePhone(data.postal)))errors.postal='کد پستی باید ۱۰ رقم باشد.';
  for(const el of form.querySelectorAll('[data-error-for]')){el.textContent=errors[el.dataset.errorFor]||'';el.classList.toggle('has-error',!!errors[el.dataset.errorFor]);}
  const first=Object.keys(errors)[0];if(first){form.elements[first]?.focus();return;}
  state.checkoutDraft={...data};state.checkoutStep=2;render();document.querySelector('.checkout-page')?.scrollIntoView({behavior:'smooth'});return;
 }
 if(form.id==='address-form'){
  e.preventDefault();const d=Object.fromEntries(new FormData(form).entries());
  const er=[];
  if((d.name||'').trim().length<3)er.push('نام گیرنده را کامل بنویس.');
  if(!isIranMobile(d.mobile))er.push('شماره موبایل معتبر وارد کن.');
  if(['province','city','address'].some(k=>(d[k]||'').trim().length<2))er.push('استان، شهر و نشانی را کامل کن.');
  if(!/^\d{10}$/.test(visiblePhone(d.postal)))er.push('کد پستی باید ۱۰ رقم باشد.');
  if(er.length){const note=form.querySelector('[data-form-error]');note.hidden=false;note.textContent=er.join(' ');return;}
  state.addressPreview=d;state.addressDraft={...d};state.addressFormOpen=false;render();return;
 }
 if(form.id==='contact-form'){
  e.preventDefault();const d=Object.fromEntries(new FormData(form).entries());
  const er=[];
  if((d.name||'').trim().length<3)er.push('نام را کامل بنویس.');
  if(!isIranMobile(d.mobile))er.push('شماره همراه معتبر نیست.');
  if((d.message||'').trim().length<10)er.push('متن پیام باید حداقل ده نویسه باشد.');
  if(er.length){const note=form.querySelector('[data-form-error]');note.hidden=false;note.textContent=er.join(' ');return;}
  state.contactDraft={...d};
  if(!COMMERCE_READY){state.contactFeedback='فرم پشتیبانی هنوز فعال نیست؛ پیام ارسال نشد.';render();return;}
  state.contactBusy=true;render();
  try{await requestAPI('/v1/support/messages',{method:'POST',body:JSON.stringify({name:d.name,mobile:visiblePhone(d.mobile),topic:d.topic,message:d.message})});state.contactFeedback='پیام شما توسط سرویس پشتیبانی دریافت شد.';state.contactDraft={};}
  catch(_){state.contactFeedback='ارسال پیام ناموفق بود؛ دوباره امتحان کن.';}
  finally{state.contactBusy=false;render();}return;
 }
 if(form.id==='account-phone-form'){
  e.preventDefault();const mobile=visiblePhone(new FormData(form).get('mobile'));
  if(!isIranMobile(mobile)){state.accountMessage='شماره موبایل معتبر ۱۱ رقمی وارد کن.';render();return;}
  state.accountPhone=mobile;
  if(!COMMERCE_READY){state.accountMessage='ارسال پیامک ورود هنوز فعال نشده است.';render();return;}
  state.accountBusy=true;render();
  try{await requestAPI('/v1/auth/otp/request',{method:'POST',body:JSON.stringify({mobile})});state.accountStep='verify';state.accountMessage='کد از طریق سرویس احراز هویت درخواست شد.';}
  catch(_){state.accountMessage='امکان درخواست کد فراهم نشد. کمی بعد دوباره تلاش کن.';}
  finally{state.accountBusy=false;render();}return;
 }
 if(form.id==='account-verify-form'){
  e.preventDefault();const code=visiblePhone(new FormData(form).get('code')||form.querySelector('input')?.value||'');
  if(!/^\d{4,8}$/.test(code)){state.accountMessage='کد تأیید معتبر وارد کن.';render();return;}
  if(!COMMERCE_READY){state.accountMessage='تأیید پیامکی هنوز فعال نشده است.';render();return;}
  try{await requestAPI('/v1/auth/otp/verify',{method:'POST',body:JSON.stringify({mobile:state.accountPhone,code})});state.accountMessage='کد تأیید شد؛ نمایش پروفایل پس از اتصال سرویس حساب مشتری فعال می‌شود.';}
  catch(_){state.accountMessage='کد نامعتبر است یا منقضی شده؛ دوباره بررسی کن.';}render();return;
 }
});
window.addEventListener('hashchange',()=>{state.menu=false;state.filter=false;state.sortMenu=false;state.productImage=0;state.lightbox=false;state.query='';if(routeInfo().name!=='checkout')state.checkoutStep=1;render();scrollTo({top:0,behavior:'instant'})});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&(state.menu||state.filter||state.lightbox)){state.menu=false;state.filter=false;state.lightbox=false;render()}if(e.key==='ArrowLeft'&&routeInfo().name==='home'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){state.featured=(state.featured+2)%3;render()}if(e.key==='ArrowRight'&&routeInfo().name==='home'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){state.featured=(state.featured+1)%3;render()}});
// Support manual swipe on signature gallery and style selection.
let touchStart=null;document.addEventListener('touchstart',e=>{const target=e.target.closest('.featured-frame,.style-showcase');touchStart=target?{x:e.touches[0].clientX,which:target.className}:null},{passive:true});
document.addEventListener('touchend',e=>{if(!touchStart)return;const delta=e.changedTouches[0].clientX-touchStart.x;if(Math.abs(delta)>55){if(touchStart.which.includes('featured'))state.featured=(state.featured+(delta<0?1:2))%3;else state.styleIndex+=delta<0?1:products.filter(p=>p.style===state.selectedStyle).length-1;render()}touchStart=null},{passive:true});

// Modal keyboard support: focus starts on a meaningful control, stays inside,
// and returns to the opening control after the layer closes.
let activeDialogKind='';
function manageDialogFocus(){
 const dlg=document.querySelector('.lightbox-overlay,.filter-overlay,.menu-overlay');
 const kind=dlg?.classList.contains('lightbox-overlay')?'lightbox':dlg?.classList.contains('filter-overlay')?'filter':dlg?'menu':'';
 if(kind===activeDialogKind)return;
 const previous=activeDialogKind;activeDialogKind=kind;
 if(kind){requestAnimationFrame(()=>{
  const d=document.querySelector('.lightbox-overlay,.filter-overlay,.menu-overlay');
  d?.querySelector('[data-action="lightbox-close"],[data-action="filter-close"],[data-action="menu-close"]')?.focus({preventScroll:true});
 });}
 else if(previous){
  const selector=previous==='lightbox'?'[data-action="lightbox-open"]':previous==='filter'?'[data-action="filter-open"]':'[data-action="menu-open"]';
  requestAnimationFrame(()=>document.querySelector(selector)?.focus({preventScroll:true}));
 }
}
document.addEventListener('keydown',e=>{
 const dlg=document.querySelector('.lightbox-overlay,.filter-overlay,.menu-overlay');
 if(!dlg)return;
 if(e.key==='Tab'){
  const all=[...dlg.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(x=>x.getClientRects().length);
  if(!all.length){e.preventDefault();return}
  const first=all[0],last=all[all.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
 }
 if(state.lightbox&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){
  e.preventDefault();const item=products.find(x=>x.id===routeInfo().id);
  if(item){state.productImage+=(e.key==='ArrowLeft'?1:(item.images?.length||1)-1);render()}
 }
});

// Finishing layer: gentle entry motion, scroll progress, and scroll-aware header.
let revealObserver=null,enhanceQueued=false;
function scheduleEnhancements(){
 if(enhanceQueued)return;enhanceQueued=true;
 requestAnimationFrame(()=>{enhanceQueued=false;enhanceUI()});
}
function enhanceUI(){
 if(!document.querySelector('.scroll-progress')){
  const progress=document.createElement('div');progress.className='scroll-progress';progress.setAttribute('aria-hidden','true');document.body.appendChild(progress);
 }
 const reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const revealNodes=document.querySelectorAll('.section,.product-row,.favorite-card,.page-simple-head,.about-text,.guide-item,.faq-item,.contact-body,.checkout-panel');
 if(revealObserver){revealObserver.disconnect();revealObserver=null}
 if(reduced||!('IntersectionObserver' in window))return;
 document.documentElement.classList.add('js-motion');
 revealObserver=new IntersectionObserver(entries=>{
  entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');revealObserver.unobserve(entry.target)}})
 },{threshold:.08,rootMargin:'0px 0px -20px 0px'});
 revealNodes.forEach(el=>{
  el.setAttribute('data-reveal','');
  if(el.getBoundingClientRect().top < innerHeight*.95){el.classList.add('is-visible')}
  else revealObserver.observe(el);
 });
}
let scrollScheduled=false;
function onPolishScroll(){
 if(scrollScheduled)return;scrollScheduled=true;
 requestAnimationFrame(()=>{
  scrollScheduled=false;
  const y=window.scrollY||document.documentElement.scrollTop;
  document.querySelector('.site-header')?.classList.toggle('scrolled',y>35);
  const pct=Math.min(100,100*y/Math.max(1,document.documentElement.scrollHeight-innerHeight));
  const progress=document.querySelector('.scroll-progress');if(progress)progress.style.transform=`scaleX(${pct/100})`;
  const top=document.querySelector('.back-top');if(top)top.classList.toggle('visible',y>640);
 });
}
window.addEventListener('scroll',onPolishScroll,{passive:true});
document.addEventListener('click',e=>{
 const back=e.target.closest('[data-action="back-top"]');
 if(back){window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})}
});

render();
hydrateCatalog();
hydrateInquiryConfig();
// Prices have a strict server validity window. Re-read the public D1 catalogue
// while open, and on returning to the tab, so an expired displayed price disappears.
if(BACKEND_READY){
 setInterval(()=>{if(!document.hidden){hydrateCatalog();hydrateInquiryConfig();}},60_000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)hydrateCatalog();});
}
