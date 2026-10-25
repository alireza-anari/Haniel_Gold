// Supplier-on-demand inquiries. These are NOT sales, invoices or payment confirmations.
import {dynamicContext,calculatePrice} from './gold-market.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{
 status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
 'X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'}});
const closed=data=>json({error:'این بخش هنوز برای ثبت درخواست فعال نشده است.',...data},503);
const digits=s=>String(s||'').replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
function telegramRecipients(env){
 const raw=String(env.TELEGRAM_ADMIN_CHAT_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
 if(raw.length<1||raw.length>5||raw.some(x=>!/^[-]?\\d{5,20}$/.test(x)))return [];
 const unique=[...new Set(raw)];
 return unique.length===raw.length?unique:[];
}
function telegramConfigured(env){
 return /^\\d{5,15}:[A-Za-z0-9_-]{20,}$/.test(String(env.TELEGRAM_BOT_TOKEN||''))&&telegramRecipients(env).length>0;
}
function inquiryAdminUrl(env){
 try{const u=new URL(String(env.ADMIN_PANEL_URL||''));return u.protocol==='https:'?u.href:null;}catch{return null;}
}
async function deliverTelegram(env,chatId,message){
 const token=String(env.TELEGRAM_BOT_TOKEN||'');
 if(!telegramConfigured(env))return {ok:false,code:'telegram_not_configured'};
 try{
  const response=await fetch('https://api.telegram.org/bot'+token+'/sendMessage',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({chat_id:chatId,text:message,disable_web_page_preview:true}),
   signal:AbortSignal.timeout(5000)
  });
  if(!response.ok)return {ok:false,code:'telegram_http_'+response.status};
  const data=await response.json();
  return data?.ok===true?{ok:true}:{ok:false,code:'telegram_rejected'};
 }catch{return {ok:false,code:'telegram_unreachable'};}
}
async function dispatchInquiryNotifications(env,inquiryId){
 const recipients=telegramRecipients(env);
 if(!telegramConfigured(env)||!recipients.length)return {sent:0,failed:0};
 const query=await env.DB.prepare("SELECT n.id,n.recipient_chat_id,i.items_json FROM purchase_inquiry_notifications n JOIN purchase_inquiries i ON i.id=n.inquiry_id WHERE n.inquiry_id=? AND n.status IN ('pending','failed') ORDER BY n.created_at").bind(inquiryId).all();
 let sent=0,failed=0,items=[];
 try{items=JSON.parse(query.results?.[0]?.items_json||'[]');}catch{}
 const lines=items.slice(0,8).map(x=>'• '+String(x.name||x.slug||'محصول')+' — '+String(x.quantity||1)+' عدد').join('\\n');
 const adminUrl=inquiryAdminUrl(env);
 const message=['🛍️ HANI-EL GOLD | استعلام موجودی جدید','شناسه: '+inquiryId,'محصولات:',lines||'برای مشاهده اقلام وارد پنل مدیریت شوید.','برای مشاهده نام و شماره مشتری، فقط از پنل مدیریت وارد شوید.',...(adminUrl?['پنل مدیریت: '+adminUrl]:[])].join('\\n');
 for(const row of query.results||[]){
  const now=Date.now();
  await env.DB.prepare("UPDATE purchase_inquiry_notifications SET attempts=attempts+1,status='pending',last_error_code='',updated_at=? WHERE id=?").bind(now,row.id).run();
  const result=await deliverTelegram(env,row.recipient_chat_id,message);
  if(result.ok){
   const sentAt=Date.now();
   await env.DB.prepare("UPDATE purchase_inquiry_notifications SET status='sent',last_error_code='',sent_at=?,updated_at=? WHERE id=?").bind(sentAt,sentAt,row.id).run();sent++;
  }else{
   await env.DB.prepare("UPDATE purchase_inquiry_notifications SET status='failed',last_error_code=?,updated_at=? WHERE id=?").bind(result.code||'telegram_failed',Date.now(),row.id).run();failed++;
  }
 }
 return {sent,failed};
}

// Store hours are Tehran-local, regardless of browser or Cloudflare region.
// Any unforeseen closure can be enforced immediately with INQUIRY_EMERGENCY_CLOSED=1.
const BUSINESS_WINDOWS=Object.freeze({
 sat:['10:00','17:00'],sun:['10:00','17:00'],mon:['10:00','17:00'],
 tue:['10:00','17:00'],wed:['10:00','17:00'],thu:['10:00','14:00']
});
function isoCalendarDate(s){
 if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
 const d=new Date(s+'T12:00:00Z');
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;
}
export function inquiryClock(now=Date.now()){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tehran',hour:'2-digit',
  minute:'2-digit',weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour12:false})
  .formatToParts(new Date(now));
 const part=k=>parts.find(x=>x.type===k)?.value;
 const weekday=part('weekday').toLowerCase(),date=part('year')+'-'+part('month')+'-'+part('day');
 const window=BUSINESS_WINDOWS[weekday]||null;
 const minute=Number(part('hour'))*60+Number(part('minute'));
 const start=window?.[0]||null,end=window?.[1]||null;
 const toMinutes=s=>Number(s.slice(0,2))*60+Number(s.slice(3,5));
 return {timezone:'Asia/Tehran',weekday,date,start,end,
  withinHours:!!window&&minute>=toMinutes(start)&&minute<toMinutes(end)};
}
export function inquiryAvailability(env,now=Date.now()){
 const clock=inquiryClock(now);
 const days=String(env.INQUIRY_OPEN_DAYS||'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
 const configured=days.length===6&&days.every(x=>Object.hasOwn(BUSINESS_WINDOWS,x))
  &&new Set(days).size===6;
 const verifiedThrough=String(env.INQUIRY_CALENDAR_VERIFIED_UNTIL||'').trim();
 const holidayInput=String(env.INQUIRY_CLOSED_DATES||'').trim();
 const closedDates=holidayInput?holidayInput.split(',').map(x=>x.trim()):[];
 const calendarValid=isoCalendarDate(verifiedThrough)&&closedDates.every(isoCalendarDate);
 const enabled=env.REQUESTS_ENABLED==='1'&&!!env.TURNSTILE_SECRET&&!!env.TURNSTILE_SITE_KEY
  &&typeof env.INQUIRY_RATE_SALT==='string'&&env.INQUIRY_RATE_SALT.length>=24&&configured&&calendarValid&&telegramConfigured(env);
 const emergencyClosed=env.INQUIRY_EMERGENCY_CLOSED==='1';
 const accepting=enabled&&verifiedThrough>=clock.date&&clock.withinHours
  &&days.includes(clock.weekday)&&!closedDates.includes(clock.date)&&!emergencyClosed;
 return {...clock,enabled,accepting,days:configured?days:[],verifiedThrough:calendarValid?verifiedThrough:null};
}
export async function inquirySchemaReady(env){
 if(!env.DB?.prepare)return false;
 try{
  const row=await env.DB.prepare("SELECT COUNT(*) AS table_count FROM sqlite_master WHERE type='table' AND name IN ('purchase_inquiries','purchase_inquiry_events','inquiry_rate_limits','purchase_inquiry_notifications')").first();
  return Number(row?.table_count)===4;
 }catch{return false;}
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
 const clock=inquiryAvailability(e);
 // Fully configured flags cannot collect personal information until the D1 tables exist.
 const schemaReady=clock.enabled?await inquirySchemaReady(e):false;
 const enabled=clock.enabled&&schemaReady,accepting=clock.accepting&&schemaReady;
 if(path==='inquiries/settings'&&method==='GET'){
  return json({enabled,accepting,
   timezone:clock.timezone,open:clock.start,close:clock.end,days:clock.days,
   today:clock.date,calendarVerifiedThrough:clock.verifiedThrough,
   turnstileSiteKey:enabled?e.TURNSTILE_SITE_KEY:null,
   notice:'انتخاب محصول، درخواست بررسی است؛ قیمت و امکان ثبت نهایی پس از تأیید هانی‌ال مشخص می‌شود.'});
 }
 if(path!=='inquiries'||method!=='POST')return json({error:'یافت نشد.'},404);
 if(!enabled)return closed({code:'NOT_ENABLED'});
 if(!accepting)return json({error:'در حال حاضر امکان ثبت درخواست جدید وجود ندارد. در ساعات پذیرش بعدی دوباره اقدام کنید.',code:'OUTSIDE_HOURS'},409);
 if(Number(r.headers.get('content-length')||0)>7000)return json({error:'داده بیش از حد مجاز است.'},413);
 const raw=await r.text();if(raw.length>7000)return json({error:'داده بیش از حد مجاز است.'},413);
 let data;try{data=JSON.parse(raw);}catch{return json({error:'ساختار درخواست معتبر نیست.'},400);}
 if(!data||typeof data!=='object'||Array.isArray(data))return json({error:'اطلاعات درخواست معتبر نیست.'},400);
 const name=String(data.name||'').trim(),phone=digits(data.phone).trim();
 if(data.consent!==true)return json({error:'برای پیگیری استعلام، تأیید استفاده از اطلاعات تماس لازم است.'},400);
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
 if(path==='admin/inquiries/readiness'&&r.method==='GET'){
  const clock=inquiryAvailability(e);
  const schemaReady=await inquirySchemaReady(e);
  const checks=[
   {id:'schema',label:'جداول درخواست‌ها و محدودیت ارسال در D1',ready:schemaReady},
   {id:'turnstile',label:'کلید عمومی و Secret ضدربات Turnstile',ready:!!e.TURNSTILE_SITE_KEY&&!!e.TURNSTILE_SECRET},
   {id:'rate',label:'کلید محرمانه محدودیت درخواست (حداقل ۲۴ کاراکتر)',ready:typeof e.INQUIRY_RATE_SALT==='string'&&e.INQUIRY_RATE_SALT.length>=24},
   {id:'hours',label:'روزهای کاری شنبه تا پنجشنبه در تهران',ready:clock.days.length===6},
   {id:'calendar',label:'تقویم تعطیلات معتبر و بازبینی‌شده تا امروز',ready:!!clock.verifiedThrough&&clock.verifiedThrough>=clock.date},
   {id:'emergency',label:'کلید توقف اضطراری پذیرش غیرفعال است',ready:e.INQUIRY_EMERGENCY_CLOSED!=='1'},
   {id:'opt_in',label:'مجوز فعال‌سازی کنترل‌شده درخواست‌ها',ready:e.REQUESTS_ENABLED==='1'}
  ];
  return json({enabled:clock.enabled&&schemaReady,accepting:clock.accepting&&schemaReady,
   timezone:clock.timezone,checks});
 }
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
