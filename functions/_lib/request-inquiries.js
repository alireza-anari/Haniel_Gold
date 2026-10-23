// Supplier-on-demand inquiries. These are NOT sales, invoices or payment confirmations.
import {dynamicContext,calculatePrice} from './gold-market.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{
 status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
 'X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'}});
const closed=data=>json({error:'این بخش هنوز برای ثبت درخواست فعال نشده است.',...data},503);
const digits=s=>String(s||'').replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
export function inquiryClock(now=Date.now()){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tehran',
  hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date(now));
 const hour=Number(parts.find(x=>x.type==='hour')?.value),min=Number(parts.find(x=>x.type==='minute')?.value);
 const clock=hour*60+min;
 return {timezone:'Asia/Tehran',start:'10:00',end:'17:00',withinHours:clock>=600&&clock<1020};
}
async function verifyTurnstile(secret,token,ip){
 if(typeof token!=='string'||token.length<8||token.length>2048)return false;
 const form=new URLSearchParams({secret,response:token});if(ip)form.set('remoteip',ip);
 try{
  const result=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
   method:'POST',body:form,signal:AbortSignal.timeout(7000)});
  if(!result.ok)return false;
  const data=await result.json();return data.success===true;
 }catch{return false;}
}
async function hashIp(ip,salt){
 const bytes=new TextEncoder().encode(salt+'|'+ip);
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function publicInquiry(c,path){
 const {request:r,env:e}=c,method=r.method.toUpperCase();
 const enabled=e.REQUESTS_ENABLED==='1'&&!!e.TURNSTILE_SECRET&&!!e.TURNSTILE_SITE_KEY&&!!e.INQUIRY_RATE_SALT;
 if(path==='inquiries/settings'&&method==='GET'){
  const clock=inquiryClock();
  return json({enabled,accepting:enabled&&clock.withinHours,
   timezone:clock.timezone,open:'10:00',close:'17:00',
   turnstileSiteKey:enabled?e.TURNSTILE_SITE_KEY:null,
   notice:'انتخاب محصول صرفاً درخواست استعلام است؛ موجودی و قیمت نهایی تا تأیید مدیر قطعی نیست.'});
 }
 if(path!=='inquiries'||method!=='POST')return json({error:'یافت نشد.'},404);
 if(!enabled)return closed({code:'NOT_ENABLED'});
 if(!inquiryClock().withinHours)return json({error:'ثبت درخواست فقط بین ساعت ۱۰ تا ۱۷ تهران فعال است.',code:'OUTSIDE_HOURS'},409);
 if(Number(r.headers.get('content-length')||0)>7000)return json({error:'داده بیش از حد مجاز است.'},413);
 const raw=await r.text();if(raw.length>7000)return json({error:'داده بیش از حد مجاز است.'},413);
 let data;try{data=JSON.parse(raw);}catch{return json({error:'ساختار درخواست معتبر نیست.'},400);}
 if(!data||typeof data!=='object'||Array.isArray(data))return json({error:'اطلاعات درخواست معتبر نیست.'},400);
 const name=String(data.name||'').trim(),phone=digits(data.phone).trim();
 if(name.length<2||name.length>80||/[\u0000-\u001F<>]/.test(name)||!/^09[0-9]{9}$/.test(phone))
  return json({error:'نام و شماره موبایل معتبر وارد کن.'},400);
 if(!Array.isArray(data.items)||data.items.length<1||data.items.length>8)
  return json({error:'تعداد محصولات در درخواست مجاز نیست.'},400);
 const items=[];
 for(const entry of data.items){
  if(!entry||typeof entry.slug!=='string'||!/^[a-z0-9_-]{2,80}$/i.test(entry.slug)
     ||!Number.isSafeInteger(entry.quantity)||entry.quantity<1||entry.quantity>5
     ||items.some(p=>p.slug===entry.slug))return json({error:'اقلام درخواست معتبر نیستند.'},400);
  items.push({slug:entry.slug,quantity:entry.quantity});
 }
 const ip=r.headers.get('cf-connecting-ip')||'';
 if(!ip||!e.INQUIRY_RATE_SALT||e.INQUIRY_RATE_SALT.length<24)
  return closed({code:'RATE_LIMIT_NOT_CONFIGURED'});
 if(!await verifyTurnstile(e.TURNSTILE_SECRET,data.turnstileToken,ip))
  return json({error:'تأیید امنیتی انجام نشد.',code:'CAPTCHA_REQUIRED'},403);
 const now=Date.now(),key=await hashIp(ip,e.INQUIRY_RATE_SALT);
 await e.DB.prepare("INSERT INTO inquiry_rate_limits(ip_hash,window_start,submission_count) VALUES(?,?,1) ON CONFLICT(ip_hash) DO UPDATE SET window_start=CASE WHEN window_start<? THEN excluded.window_start ELSE window_start END,submission_count=CASE WHEN window_start<? THEN 1 ELSE submission_count+1 END")
  .bind(key,now,now-3600000,now-3600000).run();
 const throttle=await e.DB.prepare('SELECT submission_count FROM inquiry_rate_limits WHERE ip_hash=?').bind(key).first();
 if(!throttle||throttle.submission_count>3)
  return json({error:'برای جلوگیری از درخواست‌های تکراری، موقتاً تعداد ارسال محدود شده است.',code:'RATE_LIMITED'},429);
 let pricing=null;try{pricing=await dynamicContext(e);}catch{/* no usable quote */ }
 const lines=[];
 let sum=0,quoteValid=!!pricing;
 for(const item of items){
  const p=await e.DB.prepare("SELECT p.*,c.title category_title FROM products p JOIN categories c ON c.id=p.category_id WHERE p.slug=? AND p.published=1 AND c.active=1")
   .bind(item.slug).first();
  if(!p)return json({error:'یکی از محصولات دیگر در ویترین موجود نیست؛ سبد را به‌روزرسانی کن.'},409);
  const calc=pricing?calculatePrice(p,pricing.rateRial,pricing.taxBps):null;
  const amount=calc?.amountToman??null;
  if(!Number.isSafeInteger(amount))quoteValid=false;
  else sum+=amount*item.quantity;
  lines.push({slug:p.slug,name:p.name,quantity:item.quantity,weightMg:p.weight_mg,karat:p.karat,
   makingFeeBps:p.making_fee_bps,profitBps:p.profit_bps,
   indicativeUnitToman:amount,category:p.category_title});
 }
 const inquiryId=crypto.randomUUID();
 const values=JSON.stringify(lines);
 await e.DB.prepare("INSERT INTO purchase_inquiries(id,customer_name,customer_phone,items_json,indicative_total_toman,rate_valid_until,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'submitted',?,?)")
  .bind(inquiryId,name,phone,values,quoteValid?sum:null,quoteValid?Date.parse(pricing.validUntil):null,now,now).run();
 await e.DB.prepare('INSERT INTO purchase_inquiry_events(inquiry_id,from_status,to_status,created_at) VALUES(?,?,?,?)')
  .bind(inquiryId,null,'submitted',now).run();
 // No payment link or supplier stock confirmation is issued from a public request.
 return json({inquiryId,status:'submitted',indicativeTotalToman:quoteValid?sum:null,
  message:'درخواست بررسی ثبت شد. قیمت و موجودی هنوز تأیید نشده‌اند؛ تا اعلام مدیر پرداخت نکنید.'},201);
}
const NEXT={
 submitted:['reviewing','unavailable','closed'],
 reviewing:['supplier_confirmed','unavailable','closed'],
 supplier_confirmed:['quote_prepared','unavailable','closed'],
 quote_prepared:['quote_sent','unavailable','closed'],
 quote_sent:['customer_declined','closed'],
 unavailable:['closed'],customer_declined:['closed'],closed:[]
};
export async function adminInquiry(c,path){
 const {request:r,env:e}=c;
 if(path==='admin/inquiries'&&r.method==='GET'){
  const result=await e.DB.prepare("SELECT id,customer_name,customer_phone,items_json,indicative_total_toman,rate_valid_until,status,admin_note,created_at,updated_at FROM purchase_inquiries ORDER BY created_at DESC LIMIT 80").all();
  return json({items:(result.results||[]).map(row=>({...row,items:JSON.parse(row.items_json)}))});
 }
 const match=/^admin\/inquiries\/([a-f0-9-]{36})\/status$/.exec(path);
 if(match&&r.method==='PATCH'){
  let data;try{data=await r.json();}catch{return json({error:'داده معتبر نیست.'},400);}
  const next=String(data?.status||''),note=String(data?.note||'').trim();
  if(note.length>500)return json({error:'یادداشت بیش از حد مجاز است.'},400);
  const old=await e.DB.prepare('SELECT status FROM purchase_inquiries WHERE id=?').bind(match[1]).first();
  if(!old)return json({error:'درخواست یافت نشد.'},404);
  if(!NEXT[old.status]?.includes(next))return json({error:'تغییر وضعیت مجاز نیست.'},409);
  const now=Date.now();
  const updated=await e.DB.prepare('UPDATE purchase_inquiries SET status=?,admin_note=?,updated_at=? WHERE id=? AND status=?')
   .bind(next,note,now,match[1],old.status).run();
  if(updated.meta?.changes!==1)return json({error:'وضعیت درخواست هم‌زمان تغییر کرده است.'},409);
  await e.DB.prepare('INSERT INTO purchase_inquiry_events(inquiry_id,from_status,to_status,created_at) VALUES(?,?,?,?)')
   .bind(match[1],old.status,next,now).run();
  return json({updated:true,status:next});
 }
 return json({error:'مسیر موجود نیست.'},404);
}
