import {asciiDigits,dec,fmt,valid,quantity,purchaseUnitCost,quote} from './finance.js';

const STOCK_SQL=`SELECT p.*,p.purchased_qty-COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.product_id=p.id AND s.voided=0),0) available,
 (SELECT COUNT(*) FROM images i WHERE i.product_id=p.id) image_count,
 (SELECT MIN(id) FROM images i WHERE i.product_id=p.id) cover_id FROM products p ORDER BY p.id`;
const SALES_SQL=`SELECT s.*,p.name product_name,p.sku product_sku FROM sales s JOIN products p ON p.id=s.product_id ORDER BY s.id DESC`;
function err(message,status=400){let e=new Error(message);e.status=status;throw e;}
const safeText=(v,n=120)=>String(v??'').trim().normalize('NFC').replace(/\s+/g,' ').slice(0,n);
const norm=x=>safeText(x).replace(/ي/g,'ی').replace(/ك/g,'ک').toLocaleLowerCase('fa');
const statement=(db,sql,args)=>args.length?db.prepare(sql).bind(...args):db.prepare(sql);
const all=(db,sql,...args)=>statement(db,sql,args).all().then(r=>r.results||[]);
const first=(db,sql,...args)=>statement(db,sql,args).first();
const run=(db,sql,...args)=>statement(db,sql,args).run();
function reply(obj,status=200){return new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff'}})}
function security(response,api=true){response.headers.set('X-Content-Type-Options','nosniff');response.headers.set('Referrer-Policy','no-referrer');if(api)response.headers.set('Cache-Control','private, no-store');return response;}
async function readJson(req,max=300000){const s=await req.text();if(s.length>max)err('حجم داده بیشتر از حد مجاز است.',413);try{return JSON.parse(s||'{}')}catch{err('داده نامعتبر است.')}}
const textEncoder=new TextEncoder();
function toHex(arr){return [...new Uint8Array(arr)].map(v=>v.toString(16).padStart(2,'0')).join('')}
async function hmac(key,data){const k=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',k,textEncoder.encode(data)));}
export async function verifyTelegram(raw,token,maxAge=86400,now=Math.floor(Date.now()/1000)){
 if(!raw||raw.length>10000||!token)err('ورود باید از داخل تلگرام انجام شود.',401);
 const p=new URLSearchParams(raw), hash=p.get('hash');const age=Number(p.get('auth_date'));
 if(!hash||!/^[a-f\d]{64}$/i.test(hash)||!Number.isSafeInteger(age)||now-age>maxAge||age>now+60)err('ورود تلگرام نامعتبر یا منقضی شده است.',401);
 const check=[...p.entries()].filter(([k])=>k!=='hash').sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>`${k}=${v}`).join('\n');
 const secret=await hmac(textEncoder.encode('WebAppData'),token);const received=toHex(await hmac(secret,check));
 let delta=0;for(let i=0;i<64;i++)delta|=received.charCodeAt(i)^hash.toLowerCase().charCodeAt(i);
 if(delta!==0)err('امضای ورود تلگرام معتبر نیست.',401);
 let user;try{user=JSON.parse(p.get('user')||'null')}catch{}
 if(!user||!Number.isSafeInteger(user.id)||user.id<1)err('شناسه حساب تلگرام یافت نشد.',401);
 return {id:String(user.id),name:safeText([user.first_name,user.last_name].filter(Boolean).join(' ')||user.username||user.id,100)};
}
async function authenticate(req,env){
 if(!env.BOT_TOKEN||!env.OWNER_TELEGRAM_ID)err('تنظیمات محرمانه ربات روی سرور کامل نیست.',503);
 const id=await verifyTelegram(req.headers.get('X-Telegram-Init-Data'),env.BOT_TOKEN);
 if(id.id===String(env.OWNER_TELEGRAM_ID)){
  await run(env.DB,"INSERT INTO users(telegram_id,display_name,role) VALUES(?,?,'owner') ON CONFLICT(telegram_id) DO UPDATE SET role='owner',display_name=excluded.display_name",id.id,id.name);
  return {...id,role:'owner'};
 }
 const u=await first(env.DB,'SELECT role,display_name FROM users WHERE telegram_id=?',id.id);
 if(!u||u.role==='disabled')err('دسترسی شما فعال نشده است؛ با مالک تماس بگیرید.',403);
 return {...id,role:u.role};
}
const manager=u=>['owner','manager'].includes(u.role),seller=u=>['owner','manager','sales'].includes(u.role);
const only=(c,msg='مجوز انجام این عملیات را نداری.')=>{if(!c)err(msg,403)};
function validateProduct(body,prev={}){
 const name=safeText(body.name??prev.name,130);if(!name)err('نام محصول ضروری است.');
 const weight=fmt(valid(body.weight??prev.weight,'وزن',{min:1n}));
 const purchase_gold_rate=fmt(valid(body.purchase_gold_rate??prev.purchase_gold_rate,'قیمت خرید'));
 const purchase_labor_pct=fmt(valid(body.purchase_labor_pct??prev.purchase_labor_pct,'اجرت خرید',{max:'100'}));
 const purchased_qty=quantity(body.purchased_qty??prev.purchased_qty);
 return {name,weight,purchase_gold_rate,purchase_labor_pct,purchased_qty,
   supplier:safeText(body.supplier??prev.supplier,160),note:safeText(body.note??prev.note,1000)};
}
function publicProduct(p,user){const common={id:p.id,sku:p.sku,name:p.name,weight:p.weight,available:p.available,
 image_count:p.image_count,cover_id:p.cover_id,default_labor_pct:p.purchase_labor_pct,version:p.version};
 if(manager(user))Object.assign(common,{purchased_qty:p.purchased_qty,supplier:p.supplier,note:p.note,
 purchase_gold_rate:p.purchase_gold_rate,purchase_labor_pct:p.purchase_labor_pct,purchase_unit_cost:fmt(purchaseUnitCost(p))});
 return common;
}
const revision=async db=>Number((await first(db,"SELECT value FROM meta WHERE key='revision'"))?.value||0);
const bump=db=>db.prepare("UPDATE meta SET value=CAST(value AS INTEGER)+1 WHERE key='revision'");
const audit=(db,user,action,entity,id,detail='')=>db.prepare('INSERT INTO audit(actor,action,entity,entity_id,detail) VALUES(?,?,?,?,?)').bind(user.id,action,entity,String(id),String(detail).slice(0,400));
async function auditBatch(db,user,action,entity,id,detail=''){return db.batch([audit(db,user,action,entity,id,detail),bump(db)]);}
async function products(db){return all(db,STOCK_SQL)}
async function product(db,id){return first(db,'SELECT * FROM products WHERE id=?',id)}
async function sales(db){return all(db,SALES_SQL)}
function removeSensitiveSale(s,user){if(manager(user))return s;let t={...s};for(const key of ['purchase_cost','net_profit','profit_rial','profit_gold'])delete t[key];return t;}
async function makeSaleStatement(db,p,input,user,idempotencyKey){
 const q=quote({...p,...(input.unit_weight?{weight:input.unit_weight}:{})},input),date=asciiDigits(safeText(input.date,20));
 if(!/^\d{4}[/-]\d{1,2}[/-]\d{1,2}$/.test(date))err('تاریخ شمسی نامعتبر است.');
 const customer=safeText(input.customer,140);
 const canonical=JSON.stringify([p.id,date,q.quantity,q.gold_rate,q.labor_pct,q.profit_pct,q.accessories,q.discount,customer,q.unit_weight,q.purchase_cost]);
 const fingerprint=toHex(await crypto.subtle.digest('SHA-256',textEncoder.encode(canonical)));
 const columns=['product_id','date','quantity','gold_rate','labor_pct','profit_pct','accessories','discount','customer',
 'unit_weight','total_weight','raw_price','labor_gold','profit_gold','profit_rial','final_price','purchase_cost','net_profit','source_ref','created_by','idempotency_key','request_fingerprint'];
 const vals=[p.id,date,q.quantity,q.gold_rate,q.labor_pct,q.profit_pct,q.accessories,q.discount,customer,q.unit_weight,
 q.total_weight,q.raw_price,q.labor_gold,q.profit_gold,q.profit_rial,q.final_price,q.purchase_cost,q.net_profit,null,user.id,idempotencyKey,fingerprint];
 return {q,fingerprint,stmt:db.prepare(`INSERT INTO sales (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).bind(...vals)};
}
export async function insertSaleIdempotently(db,stmt,idempotencyKey,fingerprint){
 try{return {inserted:true,result:await stmt.run()};}
 catch(error){
  const existing=await first(db,'SELECT id,request_fingerprint,final_price,net_profit FROM sales WHERE idempotency_key=?',idempotencyKey);
  if(!existing)throw error;
  if(existing.request_fingerprint!==fingerprint)err('این شناسه درخواست قبلاً برای فروش دیگری استفاده شده است؛ صفحه را تازه‌سازی و دوباره تلاش کن.',409);
  return {inserted:false,sale:existing};
 }
}
function sameProduct(a,b){return ['name','weight','purchase_gold_rate','purchase_labor_pct','purchased_qty','supplier'].every(k=>String(a[k]??'')===String(b[k]??''));}
const keyImportSale=s=>['date','name','quantity','gold_rate','labor_pct','profit_pct','accessories','discount','customer','unit_weight','purchase_cost','voided','void_reason'].map(k=>String(s[k]??'')).join('|');
function tryImportProduct(row,errors){try{return validateProduct(row)}catch(e){errors.push(`ردیف ${row.row||'؟'} موجودی: ${e.message}`);return null}}
export async function planImport(db,body){
 if(!Array.isArray(body.products)||!Array.isArray(body.sales)||body.products.length>2000||body.sales.length>3000)err('فایل یا تعداد ردیف‌ها معتبر نیست.',413);
 const existing=await products(db),previous=await sales(db);const errors=[],conflicts=[],warnings=[],seen=new Set();
 let productNews=[],productUpdates=[],unchanged=0;const keyByName=new Map();
 for(const p of existing)keyByName.set(norm(p.name),p);
 const importedByName=new Map();const originalBySku=new Map(existing.map(p=>[p.sku,p]));
 for(const row of body.products){
  let p=tryImportProduct(row,errors);if(!p)continue;
  let n=norm(p.name);if(seen.has(n)){errors.push(`نام تکراری در اکسل: ${p.name}`);continue;}seen.add(n);
  let old=row.sku?originalBySku.get(String(row.sku)):keyByName.get(n);
  if(row.sku && !old){conflicts.push(`کد محصول ${row.sku} در دیتابیس پیدا نشد؛ امکان تطبیق قطعی نیست.`);continue;}
  if(old&&norm(old.name)!==n && keyByName.has(n)){conflicts.push(`نام جدید «${p.name}» قبلاً برای محصول دیگری استفاده شده است.`);continue;}
  const item={...p,sku:old?.sku||`HG-${crypto.randomUUID().replace(/-/g,'').slice(0,12).toUpperCase()}`,id:old?.id??null,row:row.row};
  importedByName.set(n,item);
  if(!old)productNews.push(item);else if(!sameProduct(old,item))productUpdates.push(item);else unchanged++;
 }
 // Existing products omitted from Excel are never deleted.
 if(!body.products.length)errors.push('شیت موجودی هیچ محصولی ندارد.');
 const oldSaleMap=new Map(previous.map(s=>[s.source_ref||`app-sale-${s.id}`,s]));
 const newSales=[],saleFingerprints=new Set(),stockBySku=new Map();
 for(const p of existing)stockBySku.set(p.sku,p.purchased_qty);
 for(const p of [...productNews,...productUpdates])stockBySku.set(p.sku,p.purchased_qty);
 for(const s of previous.filter(s=>!s.voided)){
  const old=existing.find(p=>p.id===s.product_id);if(old)stockBySku.set(old.sku,(stockBySku.get(old.sku)||0)-s.quantity);
 }
 for(const [sku,n] of stockBySku.entries())if(n<0)conflicts.push(`موجودی محصول ${sku} با سوابق فروش منفی می‌شود.`);
 let salesSame=0,salesConflict=0;
 for(const r of body.sales){
  const ref=safeText(r.ref||`legacy-row-${r.row}`,80);
  if(!ref){errors.push('شناسه یک فروش مشخص نیست.');continue;}
  if(saleFingerprints.has(ref)){errors.push(`شناسه تکراری فروش ${ref}`);continue;}saleFingerprints.add(ref);
  const old=oldSaleMap.get(ref);
  const candidate=importedByName.get(norm(r.name))||keyByName.get(norm(r.name));
  if(!candidate){conflicts.push(`ردیف فروش ${r.row}: محصول «${r.name}» با هیچ محصولی دقیقاً تطبیق ندارد.`);salesConflict++;continue;}
  const p={...candidate,id:candidate.id??-1};
  let q;try{q=quote({...p,...(r.unit_weight?{weight:r.unit_weight}:{})},r);
    if(r.purchase_cost!==undefined&&r.purchase_cost!==null&&r.purchase_cost!==''){q.purchase_cost=fmt(valid(r.purchase_cost,'بهای خرید تاریخی'));q.net_profit=fmt(dec(q.final_price)-dec(q.purchase_cost)-dec(q.accessories));}
    if(r.final_price!==undefined&&r.final_price!==null&&r.final_price!==''){const diff=dec(q.final_price)-dec(r.final_price);if(diff>dec('1')||diff<dec('-1'))throw Error('مبلغ نهایی فایل با فرمول محاسبه‌شده اختلاف دارد.');}
    let date=asciiDigits(String(r.date||''));if(!/^\d{4}[/-]\d{1,2}[/-]\d{1,2}$/.test(date))throw Error('تاریخ نامعتبر');}
  catch(e){errors.push(`ردیف فروش ${r.row}: ${e.message}`);continue;}
  const canonical={date:asciiDigits(String(r.date||'')),name:norm(r.name),quantity:q.quantity,gold_rate:q.gold_rate,labor_pct:q.labor_pct,profit_pct:q.profit_pct,accessories:q.accessories,discount:q.discount,customer:safeText(r.customer,140),unit_weight:q.unit_weight,purchase_cost:q.purchase_cost,voided:r.voided?1:0,void_reason:safeText(r.void_reason,200)};
  if(old){
   const former={date:old.date,name:norm(old.product_name),quantity:old.quantity,gold_rate:old.gold_rate,labor_pct:old.labor_pct,profit_pct:old.profit_pct,accessories:old.accessories,discount:old.discount,customer:old.customer,unit_weight:old.unit_weight,purchase_cost:old.purchase_cost,voided:old.voided?1:0,void_reason:old.void_reason||''};
   if(keyImportSale(canonical)!==keyImportSale(former)){conflicts.push(`فروش ${ref} قبلاً ثبت شده و اطلاعات آن تغییر کرده؛ برای اصلاح باید دستی بررسی شود.`);salesConflict++;}else salesSame++;
   continue;
  }
  if(!canonical.voided){
   if((stockBySku.get(candidate.sku)||0)<q.quantity){conflicts.push(`فروش ${ref}: موجودی «${p.name}» کافی نیست.`);salesConflict++;continue;}
   stockBySku.set(candidate.sku,stockBySku.get(candidate.sku)-q.quantity);
  }
  newSales.push({...canonical,sku:candidate.sku,source_ref:ref});
 }
 if(body.products.length!==existing.length)warnings.push('محصولات حذف‌شده از Excel از اپ حذف نمی‌شوند.');
 if(body.sales.some(x=>!x.ref))warnings.push('برای فروش‌های قدیمی، شناسه موقت وابسته به شماره ردیف ساخته می‌شود. پیش از جابه‌جایی ردیف‌ها، یک خروجی جدید از اپ بگیر.');
 const counts={products_new:productNews.length,products_updated:productUpdates.length,products_unchanged:unchanged,sales_new:newSales.length,sales_unchanged:salesSame,sales_conflicts:salesConflict};
 return {plan:{productNews,productUpdates,newSales},counts,errors,conflicts,warnings,
 change_examples:[...productNews.map(x=>({name:x.name,kind:'new',sku:x.sku})),...productUpdates.map(x=>({name:x.name,kind:'updated',sku:x.sku}))].slice(0,15)};
}
async function apiRequest(req,env,url,user){
 const db=env.DB,path=url.pathname,m=req.method,roles=manager(user);
 if(m==='GET'&&path==='/api/health')return reply({ok:true});
 if(m==='GET'&&path==='/api/session')return reply({user,revision:await revision(db),features:{canManage:roles,canSell:seller(user),canUsers:user.role==='owner'}});
 if(m==='GET'&&path==='/api/summary'){
  const ps=await products(db),ss=(await sales(db)).filter(x=>!x.voided);
  const result={products:ps.length,available_units:ps.reduce((s,p)=>s+p.available,0),sold_units:ss.reduce((s,p)=>s+p.quantity,0),available_weight:fmt(ps.reduce((s,p)=>s+dec(p.weight)*BigInt(p.available),0n)),sales_count:ss.length};
  if(roles)result.total_purchased_weight=fmt(ps.reduce((s,p)=>s+dec(p.weight)*BigInt(p.purchased_qty),0n));
  if(roles)Object.assign(result,{sales_rial:fmt(ss.reduce((s,p)=>s+dec(p.final_price),0n)),profit_rial:fmt(ss.reduce((s,p)=>s+dec(p.net_profit),0n)),inventory_cost_rial:fmt(ps.reduce((s,p)=>s+purchaseUnitCost(p)*BigInt(p.available),0n))});
  return reply(result);
 }
 if(m==='GET'&&path==='/api/products')return reply((await products(db)).map(p=>publicProduct(p,user)));
 if(m==='POST'&&path==='/api/products'){
  only(roles);const p=validateProduct(await readJson(req));const xs=await products(db);
  if(xs.some(x=>norm(x.name)===norm(p.name)))err('نام محصول تکراری است.',409);
  const sku=`HG-${crypto.randomUUID().replace(/-/g,'').slice(0,12).toUpperCase()}`;
  const result=await run(db,'INSERT INTO products(sku,name,weight,purchase_gold_rate,purchase_labor_pct,purchased_qty,supplier,note) VALUES(?,?,?,?,?,?,?,?)',sku,p.name,p.weight,p.purchase_gold_rate,p.purchase_labor_pct,p.purchased_qty,p.supplier,p.note);
  await auditBatch(db,user,'product.create','product',result.meta.last_row_id,p.name);
  return reply({id:result.meta.last_row_id,sku},201);
 }
 const pid=path.match(/^\/api\/products\/(\d+)$/);
 if(pid&&m==='PATCH'){
  only(roles);const old=await product(db,Number(pid[1]));if(!old)err('محصول وجود ندارد.',404);
  const body=await readJson(req);if(Number(body.version)!==old.version)err('محصول هم‌زمان تغییر کرده است؛ تازه‌سازی کن.',409);
  const p=validateProduct(body,old);const xs=await products(db);if(xs.some(x=>x.id!==old.id&&norm(x.name)===norm(p.name)))err('نام محصول تکراری است.',409);
  const r=await run(db,'UPDATE products SET name=?,weight=?,purchase_gold_rate=?,purchase_labor_pct=?,purchased_qty=?,supplier=?,note=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=?',
   p.name,p.weight,p.purchase_gold_rate,p.purchase_labor_pct,p.purchased_qty,p.supplier,p.note,old.id,old.version);
  if(r.meta.changes!==1)err('اطلاعات توسط همکار دیگری تغییر کرده است.',409);
  await auditBatch(db,user,'product.update','product',old.id,'version '+old.version);
  return reply({id:old.id,version:old.version+1});
 }
 const pimages=path.match(/^\/api\/products\/(\d+)\/images$/);
 if(pimages&&m==='GET'){
  const id=Number(pimages[1]);if(!(await product(db,id)))err('محصول وجود ندارد.',404);
  return reply(await all(db,'SELECT id,created_at,mime FROM images WHERE product_id=? ORDER BY id',id));
 }
 if(pimages&&m==='POST'){
  only(roles);const id=Number(pimages[1]);if(!(await product(db,id)))err('محصول وجود ندارد.',404);
  const count=await first(db,'SELECT COUNT(*) n FROM images WHERE product_id=?',id);if(count.n>=6)err('بیشتر از ۶ عکس برای هر محصول مجاز نیست.');
  const len=Number(req.headers.get('content-length')||0);if(len>1000000)err('حجم درخواست تصویر بیش از حد مجاز است.',413);
  const data=await req.formData(),file=data.get('image');if(!(file instanceof File))err('فایل تصویر وارد نشده است.');
  if(file.size>400000||file.size<50)err('حجم تصویر باید کمتر از ۴۰۰ کیلوبایت باشد.',413);
  const bytes=new Uint8Array(await file.arrayBuffer());
  const head=bytes.slice(0,16),looks=(...arr)=>arr.every((v,i)=>head[i]===v);
  let mime=looks(255,216,255)?'image/jpeg':looks(137,80,78,71,13,10,26,10)?'image/png':looks(82,73,70,70)&&String.fromCharCode(...head.slice(8,12))==='WEBP'?'image/webp':null;
  if(!mime)err('فقط JPG، PNG یا WebP مجاز است.');
  // D1 BLOB storage: no billing-dependent R2 subscription.
  const key=`products/${id}/${crypto.randomUUID()}`;
  const info=await run(db,'INSERT INTO images(product_id,object_key,mime,image_blob) VALUES(?,?,?,?)',id,key,mime,bytes);
  await auditBatch(db,user,'image.add','product',id,String(info.meta.last_row_id));
  return reply({id:info.meta.last_row_id},201);
 }
 const image=path.match(/^\/api\/images\/(\d+)$/);
 if(image&&m==='GET'){
  const row=await first(db,'SELECT mime,image_blob FROM images WHERE id=?',Number(image[1]));if(!row)err('تصویر یافت نشد.',404);
  if(!row.image_blob)err('داده تصویر یافت نشد.',404);
  return new Response(new Uint8Array(row.image_blob),{headers:{'content-type':row.mime,'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
 }
 if(image&&m==='DELETE'){
  only(roles);const row=await first(db,'SELECT * FROM images WHERE id=?',Number(image[1]));if(!row)err('تصویر یافت نشد.',404);
  await run(db,'DELETE FROM images WHERE id=?',row.id);await auditBatch(db,user,'image.delete','product',row.product_id,String(row.id));return reply({ok:true});
 }
 const publicPricing=path.match(/^\/api\/products\/(\d+)\/public-pricing$/);
 if(publicPricing&&m==='GET'){
  only(roles);
  const p=await product(db,Number(publicPricing[1]));if(!p)err('محصول یافت نشد.',404);
  const row=await first(db,'SELECT * FROM product_public_pricing WHERE product_id=?',p.id);
  if(!row)return reply({product_id:p.id,labor_pct:p.purchase_labor_pct,profit_pct:'',accessories:'0',discount:'0',enabled:0,show_profit:0,source_sale_id:null,configured:false});
  return reply({...row,configured:row.profit_pct!==null&&String(row.profit_pct).trim()!==''});
 }
 if(publicPricing&&m==='PUT'){
  only(roles);
  const id=Number(publicPricing[1]),p=await product(db,id);if(!p)err('محصول یافت نشد.',404);
  const body=await readJson(req);
  const labor=fmt(valid(body.labor_pct,'درصد اجرت فروش',{max:'100'}));
  const profitText=String(body.profit_pct??'').trim();
  const profit=profitText?fmt(valid(profitText,'درصد سود فروش',{max:'100'})):null;
  const accessories=fmt(valid(body.accessories??'0','متعلقات'));
  const discount=fmt(valid(body.discount??'0','تخفیف'));
  const enabled=body.enabled===true?1:0,showProfit=body.show_profit===true?1:0;
  if(enabled&&profit===null)err('برای فعال‌سازی قیمت عمومی، درصد سود فروش را وارد کن.');
  await run(db,`INSERT INTO product_public_pricing(product_id,labor_pct,profit_pct,accessories,discount,enabled,show_profit,updated_at)
   VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
   ON CONFLICT(product_id) DO UPDATE SET labor_pct=excluded.labor_pct,profit_pct=excluded.profit_pct,
   accessories=excluded.accessories,discount=excluded.discount,enabled=excluded.enabled,
   show_profit=excluded.show_profit,source_sale_id=NULL,updated_at=CURRENT_TIMESTAMP`,
   id,labor,profit,accessories,discount,enabled,showProfit);
  await auditBatch(db,user,'product.public_pricing','product',id,enabled?'public_enabled':'public_pricing_updated');
  return reply({ok:true,enabled:!!enabled});
 }
 if(path==='/api/quote'&&m==='POST'){
  only(seller(user));const body=await readJson(req),p=await product(db,Number(body.product_id));if(!p)err('محصول یافت نشد.',404);
  const avail=await first(db,'SELECT purchased_qty-COALESCE((SELECT SUM(quantity) FROM sales WHERE product_id=? AND voided=0),0) n FROM products WHERE id=?',p.id,p.id);
  const q=quote(p,body);if(q.quantity>avail.n)err('موجودی کافی نیست.',409);
  if(!roles){delete q.purchase_cost;delete q.net_profit;delete q.profit_gold;delete q.profit_rial;}
  return reply(q);
 }
 if(path==='/api/sales'&&m==='GET'){only(seller(user));return reply((await sales(db)).map(s=>removeSensitiveSale(s,user)));}
 if(path==='/api/sales'&&m==='POST'){
  only(seller(user));const body=await readJson(req);
  const idempotencyKey=safeText(req.headers.get('Idempotency-Key')||body.idempotency_key,80);
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey))err('شناسه یکتای درخواست فروش معتبر نیست؛ دوباره فرم را باز کن.',400);
  const p=await product(db,Number(body.product_id));if(!p)err('محصول یافت نشد.',404);
  const {stmt,q,fingerprint}=await makeSaleStatement(db,p,body,user,idempotencyKey);
  const saved=await insertSaleIdempotently(db,stmt,idempotencyKey,fingerprint);
  if(!saved.inserted)return reply({id:saved.sale.id,final_price:saved.sale.final_price,...(roles?{net_profit:saved.sale.net_profit}:{}),duplicate:true},200);
  const id=saved.result.meta.last_row_id;
  await auditBatch(db,user,'sale.create','sale',id,`${p.sku} x${q.quantity}`);
  return reply({id,final_price:q.final_price,...(roles?{net_profit:q.net_profit}:{}),duplicate:false},201);
 }
 const voidSale=path.match(/^\/api\/sales\/(\d+)\/void$/);
 if(voidSale&&m==='POST'){
  only(roles);const reason=safeText((await readJson(req)).reason,200);if(reason.length<5)err('علت ابطال را توضیح بده.');
  const r=await run(db,'UPDATE sales SET voided=1,void_reason=? WHERE id=? AND voided=0',reason,Number(voidSale[1]));if(r.meta.changes!==1)err('این فروش ثبت نشده یا قبلاً باطل شده است.',409);
  await auditBatch(db,user,'sale.void','sale',voidSale[1],reason);return reply({ok:true});
 }
 if(path==='/api/users'&&m==='GET'){only(user.role==='owner');return reply(await all(db,'SELECT telegram_id,display_name,role,updated_at FROM users ORDER BY role,telegram_id'));}
 if(path==='/api/users'&&m==='POST'){
  only(user.role==='owner');const b=await readJson(req),id=asciiDigits(safeText(b.telegram_id,25)),role=String(b.role||'');
  if(!/^\d{5,20}$/.test(id))err('شناسه عددی تلگرام صحیح نیست.');
  if(!['manager','sales','viewer','disabled'].includes(role))err('نقش نامعتبر است.');
  if(id===String(env.OWNER_TELEGRAM_ID))err('نقش مالک اصلی قابل تغییر نیست.');
  const name=safeText(b.display_name||id,100);
  await run(db,'INSERT INTO users(telegram_id,display_name,role) VALUES(?,?,?) ON CONFLICT(telegram_id) DO UPDATE SET display_name=excluded.display_name,role=excluded.role,updated_at=CURRENT_TIMESTAMP',id,name,role);
  await auditBatch(db,user,'user.upsert','user',id,role);return reply({ok:true});
 }
 if(path==='/api/audit'&&m==='GET'){only(user.role==='owner');return reply(await all(db,'SELECT * FROM audit ORDER BY id DESC LIMIT 100'));}
 if(path==='/api/import/preview'&&m==='POST'){
  only(roles);const body=await readJson(req,1500000);
  const info=await planImport(db,body);const token=crypto.randomUUID();
  await run(db,'DELETE FROM imports WHERE expires_at < ?',Date.now());
  await run(db,'INSERT INTO imports(token,actor,revision,plan,expires_at) VALUES(?,?,?,?,?)',token,user.id,await revision(db),JSON.stringify({body,info}),Date.now()+20*60*1000);
  return reply({token,counts:info.counts,errors:info.errors,conflicts:info.conflicts,warnings:info.warnings,change_examples:info.change_examples});
 }
 if(path==='/api/import/commit'&&m==='POST'){
  only(roles);const b=await readJson(req);const row=await first(db,'SELECT * FROM imports WHERE token=?',String(b.token||''));
  if(!row||row.actor!==user.id||Date.now()>row.expires_at)err('پیش‌نمایش منقضی شده است.',409);
  if(row.revision!==await revision(db))err('اطلاعات پس از پیش‌نمایش تغییر کرده؛ دوباره فایل را بررسی کن.',409);
  const {info}=JSON.parse(row.plan);
  if(info.errors.length||info.conflicts.length)err('مغایرت‌های فایل باید پیش از ثبت رفع شوند.',409);
  const st=[];
  for(const p of info.plan.productNews){st.push(db.prepare('INSERT INTO products(sku,name,weight,purchase_gold_rate,purchase_labor_pct,purchased_qty,supplier,note) VALUES(?,?,?,?,?,?,?,?)').bind(p.sku,p.name,p.weight,p.purchase_gold_rate,p.purchase_labor_pct,p.purchased_qty,p.supplier,p.note));}
  for(const p of info.plan.productUpdates){st.push(db.prepare('UPDATE products SET name=?,weight=?,purchase_gold_rate=?,purchase_labor_pct=?,purchased_qty=?,supplier=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(p.name,p.weight,p.purchase_gold_rate,p.purchase_labor_pct,p.purchased_qty,p.supplier,p.id));}
  // D1 batch is one transaction. Incoming sales refer to the stable product SKU.
  for(const s of info.plan.newSales){
   const p=info.plan.productNews.concat(info.plan.productUpdates).find(x=>x.sku===s.sku)||await first(db,'SELECT * FROM products WHERE sku=?',s.sku);
   if(!p)err(`محصول فروش ${s.name} پیدا نشد.`,409);
   const q=quote({...p,...(s.unit_weight?{weight:s.unit_weight}:{})},s);
   if(s.purchase_cost!==undefined&&s.purchase_cost!==null&&s.purchase_cost!==''){q.purchase_cost=fmt(valid(s.purchase_cost,'بهای خرید تاریخی'));q.net_profit=fmt(dec(q.final_price)-dec(q.purchase_cost)-dec(q.accessories));}
   st.push(db.prepare(`INSERT INTO sales(product_id,date,quantity,gold_rate,labor_pct,profit_pct,accessories,discount,customer,unit_weight,total_weight,raw_price,labor_gold,profit_gold,profit_rial,final_price,purchase_cost,net_profit,source_ref,created_by,voided,void_reason)
      SELECT id,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? FROM products WHERE sku=?`).bind(
      s.date,q.quantity,q.gold_rate,q.labor_pct,q.profit_pct,q.accessories,q.discount,s.customer,q.unit_weight,q.total_weight,q.raw_price,q.labor_gold,q.profit_gold,q.profit_rial,q.final_price,q.purchase_cost,q.net_profit,s.source_ref,user.id,s.voided?1:0,s.void_reason||'',s.sku));

  }
  st.push(db.prepare('DELETE FROM imports WHERE token=?').bind(row.token),audit(db,user,'excel.import','workbook',1,JSON.stringify(info.counts)),bump(db));
  await db.batch(st);
  return reply({ok:true,counts:info.counts});
 }
 if(path==='/api/export'&&m==='GET'){
  only(roles);const [p,s]=await Promise.all([products(db),sales(db)]);await run(db,'INSERT INTO audit(actor,action,entity,entity_id,detail) VALUES(?,?,?,?,?)',user.id,'excel.export','workbook','1','JSON workbook data');
  return reply({products:p.map(x=>publicProduct(x,user)),sales:s});
 }
 err('مسیر API یافت نشد.',404);
}
export default {
 async fetch(req,env,ctx){
  const url=new URL(req.url),path=url.pathname;
  if(!path.startsWith('/api/'))return env.ASSETS.fetch(req);
  try{
   if(!env.DB)err('اتصال دیتابیس تنظیم نشده است.',503);
   const user=await authenticate(req,env);
   return security(await apiRequest(req,env,url,user));
  }catch(e){
   if(e?.status>=500)console.error(JSON.stringify({type:'worker_api_error',path,status:e.status}));
   else if(!e?.status)console.error(JSON.stringify({type:'unhandled_api_error',path,code:String(e?.cause?.code||'unknown')}));
   const status=e.status|| (String(e).includes('UNIQUE')?409:String(e).includes('INSUFFICIENT_STOCK')?409:500);
   const message=status===500?'خطای داخلی رخ داد؛ لاگ‌ها بررسی شوند.':e.message;
   return security(reply({error:message},status));
  }
 }
};
