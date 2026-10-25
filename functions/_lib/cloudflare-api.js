import { MarketError, marketPublic, marketAdmin, syncRate, approvePendingRate, approvePricingPolicy, dynamicContext, calculatePrice } from './gold-market.js';
import {publicInquiry,adminInquiry} from './request-inquiries.js';
// HANI-EL GOLD — Cloudflare-native catalogue API. No live orders/payments/Servix.
const C='haniel_admin_session';
const j=(x,status=200,headers={})=>new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow',...headers}});
const err=(s,status=400)=>j({error:s},status);
const enc=new TextEncoder();
const b64=a=>btoa(String.fromCharCode(...a)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
const hex=a=>[...a].map(c=>c.toString(16).padStart(2,'0')).join('');
async function hmac(msg,secret){const k=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(new Uint8Array(await crypto.subtle.sign('HMAC',k,enc.encode(msg))));}
const equal=(a,b)=>{if(typeof a!=='string'||typeof b!=='string')return false;let n=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)n|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return !n;};
const slug=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9_-]{1,79}$/i.test(s);
const sameOrigin=r=>r.headers.get('origin')===new URL(r.url).origin;
const setCookie=(r,v,age)=>C+'='+v+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+age+(new URL(r.url).protocol==='https:'?'; Secure':'');
const validImage=s=>typeof s==='string'&&s.length<=800&&(s.startsWith('https://')&&(()=>{try{const u=new URL(s);return !u.username&&!u.password&&!!u.hostname;}catch{return false;}})()||/^\/api\/v1\/media\/products\/[a-f0-9-]{36}\.(webp|png|jpg|jpeg)$/.test(s));
async function body(r){const text=await r.text();if(text.length>16000)throw Error('حد مجاز داده رعایت نشده است.');const x=JSON.parse(text);if(!x||typeof x!=='object'||Array.isArray(x))throw Error('داده نامعتبر است.');return x;}
async function admin(c){const secret=c.env.ADMIN_SESSION_SECRET;if(!c.env.DB||!secret||secret.length<32)return null;const tok=(c.request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(C+'='))?.slice(C.length+1);if(!tok||!/^[A-Za-z0-9_-]{43}$/.test(tok))return null;const hash=await hmac(tok,secret);const row=await c.env.DB.prepare('SELECT csrf_token,expires_at FROM admin_sessions WHERE token_hash=?').bind(hash).first();return row&&row.expires_at>Date.now()?{hash,csrf:row.csrf_token}:null;}
function validate(o){
 if(!slug(o.slug)||typeof o.name!=='string'||o.name.trim().length<2||o.name.length>150)throw Error('شناسه یا نام محصول نامعتبر است.');
 if(!Number.isSafeInteger(Number(o.categoryId))||Number(o.categoryId)<1)throw Error('دسته‌بندی ضروری است.');
 const number=(v,lo,hi)=>{if(v===null||v===undefined||v==='')return null;if(!Number.isSafeInteger(Number(v))||Number(v)<lo||Number(v)>hi)throw Error('مقدار عددی نامعتبر است.');return Number(v);};
 const w=o.weightGrams===''||o.weightGrams==null?null:Number(o.weightGrams);
 if(w!==null&&(!Number.isFinite(w)||w<0||w>10000||Math.abs(w*1000-Math.round(w*1000))>0.00001))throw Error('وزن باید دقیق و حداکثر سه رقم اعشار باشد.');
 if(!Array.isArray(o.images)||o.images.length>8||o.images.some(s=>!validImage(s)))throw Error('آدرس تصاویر باید معتبر و HTTPS باشد.');
 if(o.published===true && !o.images.length)throw Error('انتشار محصول بدون تصویر واقعی مجاز نیست.');
 if(typeof o.description!=='string'||o.description.length>4000||typeof o.style!=='string'||o.style.length>40)throw Error('متن محصول نامعتبر است.');
 const p={slug:o.slug,name:o.name.trim(),categoryId:Number(o.categoryId),style:o.style||'مینیمال',description:o.description,weightMg:w===null?null:Math.round(w*1000),karat:number(o.karat,1,24),
 makingFeeBps:number(o.makingFeeBps,0,10000),profitBps:number(o.profitBps,0,10000),inventory:number(o.inventoryCount,0,1000000),published:o.published===true,images:o.images};
 const price=o.priceToman===''||o.priceToman==null?null:number(o.priceToman,1,10000000000000);
 let until=null;
 if(price!==null){until=Date.parse(o.priceValidUntil||'');if(!Number.isFinite(until)||until<=Date.now()||until>Date.now()+45*60*1000)throw Error('اعتبار قیمت باید حداکثر ۴۵ دقیقه باشد.');}
 p.price=price;p.verifiedAt=price===null?null:Date.now();p.validUntil=until;
 return p;
}
async function listing(db,{onlyPublic=true,id=null,limit=100,offset=0,pricing=null}={}){
 const wh=[],args=[];
 if(onlyPublic)wh.push('p.published=1','c.active=1');
 if(id){wh.push('p.slug=?');args.push(id);}
 const condition=wh.length?'WHERE '+wh.join(' AND '):'';
 const q='SELECT p.*,c.title category_title FROM products p JOIN categories c ON c.id=p.category_id '+condition+' ORDER BY p.updated_at DESC LIMIT ? OFFSET ?';
 const rows=(await db.prepare(q).bind(...args,limit,offset).all()).results||[];
 if(!rows.length)return [];
 const pics=(await db.prepare('SELECT product_slug,url FROM product_images WHERE product_slug IN ('+rows.map(()=>'?').join(',')+') ORDER BY sort_order,id').bind(...rows.map(r=>r.slug)).all()).results||[];
 const map=new Map(rows.map(r=>[r.slug,[]]));for(const p of pics)map.get(p.product_slug)?.push(p.url);
 return rows.map(r=>{const images=map.get(r.slug)||[];const fresh=r.price_toman!==null&&r.price_toman>0&&r.price_valid_until>Date.now();
 const auto=pricing?calculatePrice(r,pricing.rateRial,pricing.taxBps):null;
 const missing=[];
 if(r.karat!==18)missing.push('عیار ۱۸');
 if(!Number.isSafeInteger(r.weight_mg)||r.weight_mg<=0)missing.push('وزن');
 if(!Number.isSafeInteger(r.making_fee_bps))missing.push('درصد اجرت');
 if(!Number.isSafeInteger(r.profit_bps))missing.push('درصد سود');
 // Public response is an explicit allowlist. Never expose owner-only margin,
 // making fee, stock count or the cost/profit/tax ledger in an anonymous response.
 const publicPrice=auto?{amountToman:auto.amountToman,currency:auto.currency,source:auto.source,
  updatedAt:pricing.observedAt,validUntil:pricing.validUntil}
  :{amountToman:null,updatedAt:null,validUntil:null,source:null};
 const adminPrice=auto?{...auto,updatedAt:pricing.observedAt,validUntil:pricing.validUntil}
  :{amountToman:fresh?r.price_toman:null,updatedAt:fresh?new Date(r.price_verified_at).toISOString():null,
    validUntil:fresh?new Date(r.price_valid_until).toISOString():null,source:fresh?'manual_staging':null};
 const obj={id:r.slug,name:r.name,category:r.category_title,categoryId:r.category_id,
  style:r.style,description:r.description,weightGrams:r.weight_mg===null?null:r.weight_mg/1000,
  karat:r.karat,inventoryStatus:onlyPublic?'requires_supplier_confirmation':r.inventory_count===null?'unknown':r.inventory_count>0?'available':'unavailable',
  published:!!r.published,imageUrl:images[0]||null,images,price:onlyPublic?publicPrice:adminPrice};
 if(!onlyPublic)Object.assign(obj,{
  makingFeeBps:r.making_fee_bps,profitBps:r.profit_bps,inventoryCount:r.inventory_count,
  priceToman:r.price_toman,priceValidUntil:r.price_valid_until?new Date(r.price_valid_until).toISOString():null,
  pricingReadiness:{productComplete:missing.length===0,missing,validMarketAndPolicy:!!pricing,autoPriceAvailable:!!auto}
 });
 return obj;
 });
}
async function saveImages(db,id,images){await db.batch([db.prepare('DELETE FROM product_images WHERE product_slug=?').bind(id),...images.map((url,n)=>db.prepare('INSERT INTO product_images(product_slug,url,alt,sort_order) VALUES(?,?,?,?)').bind(id,url,'',n))]);}
async function login(c){
 const r=c.request,e=c.env;
 if(!sameOrigin(r))return err('مبدأ درخواست نامعتبر است.',403);
 if(!e.ADMIN_USERNAME||!e.ADMIN_PASSWORD||e.ADMIN_PASSWORD.length<16||!e.ADMIN_SESSION_SECRET||e.ADMIN_SESSION_SECRET.length<32)return err('ورود مدیر هنوز پیکربندی نشده است.',503);
 const data=await body(r),now=Date.now();
 const ip=await hmac(r.headers.get('cf-connecting-ip')||'unknown',e.ADMIN_SESSION_SECRET);
 const rate=await e.DB.prepare('SELECT failed_count,window_start FROM admin_login_attempts WHERE client_key=?').bind(ip).first();
 if(rate&&rate.window_start>now-900000&&rate.failed_count>=5)return err('تلاش بیش از حد؛ بعداً امتحان کنید.',429);
 const a=await hmac(String(data.username||'')+'\n'+String(data.password||''),e.ADMIN_SESSION_SECRET),b=await hmac(e.ADMIN_USERNAME+'\n'+e.ADMIN_PASSWORD,e.ADMIN_SESSION_SECRET);
 if(!equal(a,b)){
 if(rate&&rate.window_start>now-900000)await e.DB.prepare('UPDATE admin_login_attempts SET failed_count=failed_count+1 WHERE client_key=?').bind(ip).run();
 else await e.DB.prepare('INSERT INTO admin_login_attempts(client_key,window_start,failed_count) VALUES(?,?,1) ON CONFLICT(client_key) DO UPDATE SET window_start=excluded.window_start,failed_count=1').bind(ip,now).run();
 return err('اطلاعات ورود معتبر نیست.',401);
 }
 await e.DB.prepare('DELETE FROM admin_login_attempts WHERE client_key=?').bind(ip).run();
 const token=b64(crypto.getRandomValues(new Uint8Array(32))),csrf=b64(crypto.getRandomValues(new Uint8Array(24)));
 await e.DB.prepare('INSERT INTO admin_sessions(token_hash,csrf_token,created_at,expires_at) VALUES(?,?,?,?)').bind(await hmac(token,e.ADMIN_SESSION_SECRET),csrf,now,now+28800000).run();
 return j({authenticated:true,csrfToken:csrf},200,{'set-cookie':setCookie(r,token,28800)});
}
async function route(c){
 const r=c.request,e=c.env,method=r.method.toUpperCase(),url=new URL(r.url);
 const path=url.pathname.slice('/api/v1/'.length).replace(/\/$/,'');
 if(path==='health'&&method==='GET')return j({status:'ok',runtime:'cloudflare-pages-functions',database:!!e.DB});
 if(!e.DB)return err('دیتابیس D1 به پروژه Cloudflare متصل نشده است.',503);
 if(path==='inquiries/settings'&&method==='GET'||path==='inquiries'&&method==='POST')return publicInquiry(c,path);
 if(path==='admin/login'&&method==='POST')return login(c);
 if(path==='admin/session'&&method==='GET'){const s=await admin(c);return j(s?{authenticated:true,csrfToken:s.csrf}:{authenticated:false});}
 if(path==='market/gold'&&method==='GET'){
  try{return j(await marketPublic(e));}
  catch{return j({status:'not_initialized',currency:'TOMAN',karat:18,tomanPerGram:null,priceToman:null,pricingReady:false},503);}
 }
 if(path==='catalog/categories'&&method==='GET'){
 const data=await e.DB.prepare('SELECT slug,title FROM categories WHERE active=1 ORDER BY sort_order,id').all();return j({items:data.results||[]});
 }
 if(path==='catalog/products'&&method==='GET'){
 const l=Math.min(100,Math.max(1,Number(url.searchParams.get('limit'))||24)),o=Math.min(100000,Math.max(0,Number(url.searchParams.get('offset'))||0));
 let pricing=null;try{pricing=await dynamicContext(e);}catch{ /* migration not yet applied */ }
 const items=await listing(e.DB,{limit:l,offset:o,pricing});return j({items,total:items.length,limit:l,offset:o,nextOffset:items.length===l?o+l:null});
 }
 if(path.startsWith('catalog/products/')&&method==='GET'){const id=path.slice(17);if(!slug(id))return err('یافت نشد.',404);let pricing=null;try{pricing=await dynamicContext(e);}catch{}const p=(await listing(e.DB,{id,limit:1,pricing}))[0];return p?j(p):err('یافت نشد.',404);}
 if(path.startsWith('media/products/')&&method==='GET'){
 const key=path.slice(6);if(!/^products\/[a-f0-9-]{36}\.(webp|png|jpg|jpeg)$/.test(key))return err('یافت نشد.',404);
 // KV is included in Workers Free and does not require R2 billing. Keep R2 only for migration.
 if(e.MEDIA_KV){
  const stored=await e.MEDIA_KV.getWithMetadata(key,'arrayBuffer');
  if(!stored?.value)return err('تصویر هنوز در شبکه آماده نیست؛ کمی بعد دوباره تلاش کنید.',404);
  const type=stored.metadata?.contentType||({'webp':'image/webp','jpg':'image/jpeg','jpeg':'image/jpeg','png':'image/png'})[key.split('.').pop()]||'application/octet-stream';
  return new Response(stored.value,{headers:{'content-type':type,'cache-control':'public, max-age=3600, immutable','x-content-type-options':'nosniff'}});
 }
 if(e.MEDIA){
  const obj=await e.MEDIA.get(key);
  return obj?new Response(obj.body,{headers:{'content-type':obj.httpMetadata?.contentType||'image/jpeg','cache-control':'public, max-age=3600','x-content-type-options':'nosniff'}}):err('یافت نشد.',404);
 }
 return err('فضای تصاویر KV هنوز به Pages متصل نشده است.',503);
 }
 if(!path.startsWith('admin/'))return err('مسیر موجود نیست.',404);
 const s=await admin(c);if(!s)return err('ابتدا وارد پنل مدیریت شوید.',401);
 if(method!=='GET'&&(!sameOrigin(r)||!equal(r.headers.get('x-haniel-csrf'),s.csrf)))return err('درخواست امنیتی معتبر نیست.',403);
 if(path.startsWith('admin/inquiries'))return adminInquiry(c,path);
 if(path==='admin/logout'&&method==='POST'){await e.DB.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(s.hash).run();return j({authenticated:false},200,{'set-cookie':setCookie(r,'',0)});}
 if(path==='admin/market'&&method==='GET')return j(await marketAdmin(e));
 if(path==='admin/market/sync'&&method==='POST')return j(await syncRate(e));
 if(path==='admin/market/approve'&&method==='POST'){
  const confirmation=await body(r);
  if(confirmation.confirmReviewed!==true)return err('بررسی مستقل نرخ و تأیید صریح لازم است.',400);
  return j(await approvePendingRate(e));
 }
 if(path==='admin/market/policy'&&method==='POST')return j(await approvePricingPolicy(e,await body(r)));
 if(path==='admin/categories'&&method==='GET'){const x=await e.DB.prepare('SELECT id,slug,title,active,sort_order FROM categories ORDER BY sort_order,id').all();return j({items:x.results||[]});}
 if(path==='admin/categories'&&method==='POST'){const d=await body(r);if(!slug(d.slug)||typeof d.title!=='string'||d.title.trim().length<2||d.title.length>80)return err('دسته‌بندی نامعتبر است.');await e.DB.prepare('INSERT INTO categories(slug,title,active,sort_order) VALUES(?,?,1,0)').bind(d.slug,d.title.trim()).run();return j({created:true},201);}
 if(path.startsWith('admin/categories/')&&method==='PATCH'){
  const categorySlug=path.slice('admin/categories/'.length),input=await body(r);
  if(!slug(categorySlug)||typeof input.title!=='string'||input.title.trim().length<2||input.title.trim().length>80)
   return err('عنوان دسته‌بندی باید بین ۲ تا ۸۰ کاراکتر باشد.');
  const updated=await e.DB.prepare('UPDATE categories SET title=? WHERE slug=?')
    .bind(input.title.trim(),categorySlug).run();
  return updated.meta?.changes===1?j({updated:true,slug:categorySlug,title:input.title.trim()}):err('دسته‌بندی یافت نشد.',404);
 }
 if(path==='admin/products'&&method==='GET'){
  let pricing=null;try{pricing=await dynamicContext(e);}catch{/* migrations not yet applied */}
  return j({items:await listing(e.DB,{onlyPublic:false,pricing}),marketAndPolicyReady:!!pricing});
 }
 if(path==='admin/products'&&method==='POST'){
 let p;try{p=validate(await body(r));}catch(x){return err(x.message);}
 if(!(await e.DB.prepare('SELECT 1 FROM categories WHERE id=?').bind(p.categoryId).first()))return err('دسته‌بندی ثبت نشده است.');
 const now=Date.now();await e.DB.prepare('INSERT INTO products(slug,name,category_id,style,description,weight_mg,karat,making_fee_bps,profit_bps,inventory_count,price_toman,price_verified_at,price_valid_until,published,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
 .bind(p.slug,p.name,p.categoryId,p.style,p.description,p.weightMg,p.karat,p.makingFeeBps,p.profitBps,p.inventory,p.price,p.verifiedAt,p.validUntil,p.published?1:0,now,now).run();
 if(p.images.length)await saveImages(e.DB,p.slug,p.images);return j({created:true,slug:p.slug},201);
 }
 if(path.startsWith('admin/products/')&&method==='PATCH'){
 const id=path.slice('admin/products/'.length),old=(await listing(e.DB,{onlyPublic:false,id,limit:1}))[0];if(!old)return err('محصول یافت نشد.',404);
 let p;try{p=validate({...old,slug:id,priceToman:null,priceValidUntil:null,...await body(r)});}catch(x){return err(x.message);}
 await e.DB.prepare('UPDATE products SET name=?,category_id=?,style=?,description=?,weight_mg=?,karat=?,making_fee_bps=?,profit_bps=?,inventory_count=?,price_toman=?,price_verified_at=?,price_valid_until=?,published=?,updated_at=? WHERE slug=?')
 .bind(p.name,p.categoryId,p.style,p.description,p.weightMg,p.karat,p.makingFeeBps,p.profitBps,p.inventory,p.price,p.verifiedAt,p.validUntil,p.published?1:0,Date.now(),id).run();
 await saveImages(e.DB,id,p.images);return j({updated:true,slug:id});
 }
 if(path.startsWith('admin/products/')&&method==='DELETE'){const id=path.slice('admin/products/'.length);if(!slug(id))return err('شناسه نامعتبر است.');await e.DB.prepare('UPDATE products SET published=0,updated_at=? WHERE slug=?').bind(Date.now(),id).run();return j({unpublished:true,slug:id});}
 if(path==='admin/uploads'&&method==='POST'){
 if(!e.MEDIA_KV&&!e.MEDIA)return err('ذخیره تصاویر هنوز متصل نشده است؛ KV را با نام MEDIA_KV وصل کنید.',503);
 const f=(await r.formData()).get('file'),types={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
 const maxBytes=1500*1024; // small, high-quality WebP photos; no billing method required
 if(!f||typeof f.arrayBuffer!=='function'||f.size<20||f.size>maxBytes||!types[f.type])return err('تصویر باید JPG، PNG یا WebP و حداکثر ۱.۵ مگابایت باشد.');
 const b=new Uint8Array(await f.arrayBuffer());const jpg=b[0]===255&&b[1]===216&&b[2]===255;
 const png=b.slice(0,8).join(',')==='137,80,78,71,13,10,26,10';const webp=String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP';
 if(!(f.type==='image/jpeg'&&jpg||f.type==='image/png'&&png||f.type==='image/webp'&&webp))return err('فرمت محتوای تصویر معتبر نیست.');
 const key='products/'+crypto.randomUUID()+'.'+types[f.type];
 if(e.MEDIA_KV)await e.MEDIA_KV.put(key,b.buffer,{metadata:{contentType:f.type}});
 else await e.MEDIA.put(key,b,{httpMetadata:{contentType:f.type}});
 // Relative same-origin URL, safe to use on an eventual custom domain.
 return j({url:'/api/v1/media/'+key,storage:e.MEDIA_KV?'kv':'r2'},201);
 }
 return err('مسیر وجود ندارد.',404);
}
export async function handle(c){if(!new URL(c.request.url).pathname.startsWith('/api/v1/'))return err('یافت نشد.',404);
 try{return await route(c);}catch(x){console.error('HANIEL_API',x?.name,x?.message);if(x instanceof SyntaxError)return err('JSON نامعتبر است.');if(x instanceof MarketError)return err(x.message,['DB_SETUP','NOT_CONFIGURED'].includes(x.code)?503:409);if(String(x?.message).includes('UNIQUE constraint'))return err('شناسه تکراری است.',409);return err('خطای سرور؛ بعداً دوباره تلاش کنید.',500);}}
