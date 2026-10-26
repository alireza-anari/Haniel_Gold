// Admin-only quote preparation and secure customer quote sharing. This module NEVER opens payment.
const response=(data,status=200)=>new Response(JSON.stringify(data),{
 status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex, nofollow','x-content-type-options':'nosniff'}
});
const isMoney=x=>Number.isSafeInteger(x)&&x>=0&&x<100_000_000_000_000;
const validRef=x=>typeof x==='string'&&x.trim().length>=3&&x.trim().length<=120&&
 !/[\u0000-\u001f<>]/.test(x);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const tokenPattern=/^[A-Za-z0-9_-]{43}$/;
const tokenFromBytes=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
async function hashToken(token){
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
 return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function validateQuote(input,now=Date.now()){
 if(!input||typeof input!=='object'||Array.isArray(input))return {error:'داده پیشنهاد معتبر نیست.'};
 const items=input.itemsTotalToman,delivery=input.deliveryToman;
 if(!isMoney(items)||items===0||!isMoney(delivery)||!Number.isSafeInteger(items+delivery))
  return {error:'مبلغ اقلام و هزینه ارسال باید اعداد صحیح تومان باشند.'};
 if(!Number.isSafeInteger(input.validUntilMs)||!Number.isSafeInteger(input.supplyHoldUntilMs))
  return {error:'اعتبار قیمت و زمان رزرو باید به‌صورت دقیق ثبت شوند.'};
 const min=now+60_000,max=now+30*60_000;
 if(input.validUntilMs<min||input.validUntilMs>max)
  return {error:'مدت اعتبار پیشنهاد باید بین ۱ تا ۳۰ دقیقه آینده باشد.'};
 if(input.supplyHoldUntilMs<input.validUntilMs)
  return {error:'اعتبار تأمین/رزرو باید دست‌کم تا پایان اعتبار قیمت ادامه داشته باشد.'};
 if(input.supplySecured!==true||!validRef(input.supplyReference))
  return {error:'تأیید واقعی تأمین یا رزرو و مرجع بررسی آن ضروری است.'};
 const note=String(input.internalNote||'').trim();
 if(note.length>500||/[\u0000-\u001f]/.test(note))return {error:'یادداشت داخلی معتبر نیست.'};
 return {itemsTotalToman:items,deliveryToman:delivery,finalTotalToman:items+delivery,
  validUntilMs:input.validUntilMs,supplyHoldUntilMs:input.supplyHoldUntilMs,
  supplyReference:input.supplyReference.trim(),internalNote:note};
}
export async function adminQuote(c,path){
 const {request:r,env:e}=c;
 const match=/^admin\/inquiries\/([0-9a-f-]{36})\/quote$/.exec(path);
 if(!match||!uuid.test(match[1]))return response({error:'مسیر یافت نشد.'},404);
 if(r.method==='GET'){
  try{
   const row=await e.DB.prepare(
    "SELECT items_total_toman,delivery_toman,final_total_toman,valid_until,supply_hold_until,created_at FROM purchase_inquiry_quotes WHERE inquiry_id=?")
    .bind(match[1]).first();
   return response({quote:row?{
    itemsTotalToman:row.items_total_toman,deliveryToman:row.delivery_toman,
    finalTotalToman:row.final_total_toman,validUntilMs:row.valid_until,
    supplyHoldUntilMs:row.supply_hold_until,createdAt:row.created_at,valid:row.valid_until>Date.now()&&row.supply_hold_until>Date.now()
   }:null,paymentEnabled:false});
  }catch{return response({quote:null,paymentEnabled:false,missingMigration:true});}
 }
 if(r.method!=='POST')return response({error:'روش درخواست مجاز نیست.'},405);
 if(Number(r.headers.get('content-length')||0)>4000)return response({error:'اندازه اطلاعات معتبر نیست.'},413);
 let input;try{const body=await r.text();if(body.length>4000)return response({error:'اندازه اطلاعات معتبر نیست.'},413);input=JSON.parse(body);}
 catch{return response({error:'ساختار درخواست معتبر نیست.'},400);}
 const now=Date.now(),quote=validateQuote(input,now);
 if(quote.error)return response({error:quote.error},400);
 const record=await e.DB.prepare('SELECT status FROM purchase_inquiries WHERE id=?').bind(match[1]).first();
 if(!record)return response({error:'درخواست یافت نشد.'},404);
 if(record.status!=='supplier_confirmed')return response({error:'قبل از تهیه پیشنهاد، باید امکان تأمین توسط مدیر تأیید شود.'},409);
 const id=crypto.randomUUID();
 try{
  const result=await e.DB.prepare(
   "INSERT INTO purchase_inquiry_quotes(id,inquiry_id,items_total_toman,delivery_toman,final_total_toman,valid_until,supply_hold_until,supply_reference,internal_note,created_at,updated_at) "+
   "VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(inquiry_id) DO UPDATE SET "+
   "items_total_toman=excluded.items_total_toman,delivery_toman=excluded.delivery_toman,final_total_toman=excluded.final_total_toman,"+
   "valid_until=excluded.valid_until,supply_hold_until=excluded.supply_hold_until,supply_reference=excluded.supply_reference,"+
   "internal_note=excluded.internal_note,updated_at=excluded.updated_at "+
   "WHERE (SELECT status FROM purchase_inquiries WHERE id=excluded.inquiry_id)='supplier_confirmed'")
   .bind(id,match[1],quote.itemsTotalToman,quote.deliveryToman,quote.finalTotalToman,
    quote.validUntilMs,quote.supplyHoldUntilMs,quote.supplyReference,quote.internalNote,now,now).run();
  if(result.meta?.changes!==1)return response({error:'وضعیت درخواست تغییر کرده؛ لطفاً دوباره بررسی کن.'},409);
 }catch{
  return response({error:'زیرساخت پیشنهاد قیمت آماده نیست؛ مهاجرت D1 را بررسی کن.'},503);
 }
 try{await e.DB.prepare('DELETE FROM purchase_quote_access WHERE inquiry_id=?').bind(match[1]).run();}catch{}
 try{await e.DB.prepare('DELETE FROM purchase_quote_responses WHERE inquiry_id=?').bind(match[1]).run();}catch{}
 return response({saved:true,paymentEnabled:false,finalTotalToman:quote.finalTotalToman,validUntilMs:quote.validUntilMs},201);
}
export async function adminQuoteLink(c,path){
 const {request:r,env:e}=c;
 const match=/^admin\/inquiries\/([0-9a-f-]{36})\/quote-link$/.exec(path);
 if(!match||!uuid.test(match[1]))return response({error:'مسیر یافت نشد.'},404);
 if(r.method!=='POST')return response({error:'روش درخواست مجاز نیست.'},405);
 const now=Date.now();
 let row;
 try{
  row=await e.DB.prepare(
   "SELECT i.status,q.valid_until,q.supply_hold_until,r.response FROM purchase_inquiries i "+
   "JOIN purchase_inquiry_quotes q ON q.inquiry_id=i.id "+
   "LEFT JOIN purchase_quote_responses r ON r.inquiry_id=i.id WHERE i.id=?")
   .bind(match[1]).first();
 }catch{return response({error:'زیرساخت لینک امن پیشنهاد آماده نیست؛ مهاجرت 0007 را بررسی کن.'},503);}
 if(!row)return response({error:'پیشنهاد قیمت یافت نشد.'},404);
 if(!['quote_prepared','quote_sent'].includes(row.status))
  return response({error:'ابتدا پیشنهاد را ذخیره و وضعیت را «پیشنهاد آماده» کن.'},409);
 if(row.valid_until<=now||row.supply_hold_until<=now)
  return response({error:'پیشنهاد یا مهلت تأمین منقضی شده؛ قیمت و موجودی را دوباره بررسی کن.'},409);
 if(row.response)return response({error:'پاسخ مشتری قبلاً ثبت شده؛ برای پیشنهاد تازه، قیمت را دوباره بررسی کن.'},409);
 const token=tokenFromBytes(crypto.getRandomValues(new Uint8Array(32)));
 const tokenHash=await hashToken(token);
 try{
  await e.DB.prepare(
   "INSERT INTO purchase_quote_access(inquiry_id,token_hash,created_at,expires_at) VALUES(?,?,?,?) "+
   "ON CONFLICT(inquiry_id) DO UPDATE SET token_hash=excluded.token_hash,created_at=excluded.created_at,expires_at=excluded.expires_at")
   .bind(match[1],tokenHash,now,row.valid_until).run();
 }catch{return response({error:'ساخت لینک امن ممکن نشد؛ مهاجرت 0007 را اجرا کن.'},503);}
 const customerQuoteUrl=new URL(r.url).origin+'/?catalog=live#/quote/'+token;
 return response({created:true,customerQuoteUrl,expiresAtMs:row.valid_until,rotatesPreviousLink:true},201);
}
export async function publicQuote(c,path){
 const {request:r,env:e}=c;
 const match=/^quotes\/([A-Za-z0-9_-]{43})$/.exec(path);
 if(!match||!tokenPattern.test(match[1]))return response({error:'لینک پیشنهاد معتبر نیست.'},404);
 if(r.method!=='GET')return response({error:'روش درخواست مجاز نیست.'},405);
 let row;
 try{
  row=await e.DB.prepare(
   "SELECT i.status,i.items_json,q.delivery_toman,q.final_total_toman,q.valid_until,q.supply_hold_until,"+
   "a.expires_at,r.response FROM purchase_quote_access a "+
   "JOIN purchase_inquiry_quotes q ON q.inquiry_id=a.inquiry_id "+
   "JOIN purchase_inquiries i ON i.id=a.inquiry_id "+
   "LEFT JOIN purchase_quote_responses r ON r.inquiry_id=i.id WHERE a.token_hash=?")
   .bind(await hashToken(match[1])).first();
 }catch{return response({error:'زیرساخت پیشنهاد آماده نیست.'},503);}
 if(!row||!['quote_prepared','quote_sent'].includes(row.status))return response({error:'این لینک معتبر نیست یا پیشنهاد آماده نشده است.'},404);
 const now=Date.now();
 if(row.expires_at<=now||row.valid_until<=now||row.supply_hold_until<=now)
  return response({error:'اعتبار پیشنهاد یا تأمین پایان یافته است؛ از هانی‌ال پیشنهاد به‌روز بخواه.'},410);
 let rawItems;
 try{rawItems=JSON.parse(row.items_json);}catch{return response({error:'اطلاعات پیشنهاد قابل خواندن نیست.'},503);}
 if(!Array.isArray(rawItems)||rawItems.length<1||rawItems.length>8)
  return response({error:'اطلاعات اقلام پیشنهاد معتبر نیست.'},503);
 const items=rawItems.map(x=>({
  name:String(x?.name||x?.slug||'محصول').replace(/[<>]/g,'').slice(0,150),
  quantity:Number.isSafeInteger(x?.quantity)&&x.quantity>0?x.quantity:1
 }));
 return response({quote:{
  items,deliveryToman:row.delivery_toman,finalTotalToman:row.final_total_toman,
  validUntilMs:row.valid_until,response:row.response||null
 },paymentEnabled:false,paymentMethods:[],orderCreated:false});
}
export async function respondToQuote(c,path){
 const {request:r,env:e}=c;
 const match=/^quotes\/([A-Za-z0-9_-]{43})\/respond$/.exec(path);
 if(!match||!tokenPattern.test(match[1]))return response({error:'لینک پیشنهاد معتبر نیست.'},404);
 if(r.method!=='POST')return response({error:'روش درخواست مجاز نیست.'},405);
 if(r.headers.get('origin')!==new URL(r.url).origin)
  return response({error:'درخواست از مبدأ معتبر ارسال نشده است.'},403);
 if(Number(r.headers.get('content-length')||0)>1000)return response({error:'اندازه اطلاعات معتبر نیست.'},413);
 let input;try{const raw=await r.text();if(raw.length>1000)return response({error:'اندازه اطلاعات معتبر نیست.'},413);input=JSON.parse(raw);}
 catch{return response({error:'ساختار درخواست معتبر نیست.'},400);}
 const choice=input?.response;
 if(!['accepted','declined'].includes(choice))return response({error:'پاسخ پیشنهاد معتبر نیست.'},400);
 if(choice==='accepted'&&input.acknowledged!==true)
  return response({error:'برای ثبت درخواست ادامه خرید، تأیید متن ضروری است.'},400);
 let row;
 try{
  row=await e.DB.prepare(
   "SELECT a.inquiry_id,i.status,q.valid_until,q.supply_hold_until,a.expires_at,r.response "+
   "FROM purchase_quote_access a JOIN purchase_inquiry_quotes q ON q.inquiry_id=a.inquiry_id "+
   "JOIN purchase_inquiries i ON i.id=a.inquiry_id LEFT JOIN purchase_quote_responses r ON r.inquiry_id=i.id "+
   "WHERE a.token_hash=?")
   .bind(await hashToken(match[1])).first();
 }catch{return response({error:'زیرساخت پاسخ پیشنهاد آماده نیست.'},503);}
 if(!row||!['quote_prepared','quote_sent'].includes(row.status))return response({error:'پیشنهاد در دسترس نیست.'},404);
 const now=Date.now();
 if(row.expires_at<=now||row.valid_until<=now||row.supply_hold_until<=now)
  return response({error:'اعتبار پیشنهاد یا تأمین پایان یافته است.'},410);
 if(row.response)return response({error:'برای این پیشنهاد قبلاً پاسخ ثبت شده است.'},409);
 try{
  const saved=await e.DB.prepare(
   "INSERT INTO purchase_quote_responses(inquiry_id,response,responded_at,acknowledged) VALUES(?,?,?,?) ON CONFLICT(inquiry_id) DO NOTHING")
   .bind(row.inquiry_id,choice,now,choice==='accepted'?1:0).run();
  if(saved.meta?.changes!==1)return response({error:'پاسخ قبلاً ثبت شده؛ صفحه را تازه‌سازی کن.'},409);
 }catch{return response({error:'ثبت پاسخ ممکن نشد؛ مهاجرت 0007 را بررسی کن.'},503);}
 return response({
  saved:true,response:choice,orderCreated:false,paymentEnabled:false,
  message:choice==='accepted'
   ?'موافقت با پیشنهاد ثبت شد. این اقدام سفارش قطعی یا پرداخت نیست؛ پاسخ در پنل مدیریت ثبت شده و ادامه خرید پس از تکمیل اتصال پرداخت پیگیری می‌شود.'
   :'پیشنهاد رد شد. هیچ سفارش یا پرداختی ثبت نشده است.'
 },201);
}
