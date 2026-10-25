// Admin-only quote preparation for stock inquiries. This module NEVER opens payment.
const response=(data,status=200)=>new Response(JSON.stringify(data),{
 status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex, nofollow'}
});
const isMoney=x=>Number.isSafeInteger(x)&&x>=0&&x<100_000_000_000_000;
const validRef=x=>typeof x==='string'&&x.trim().length>=3&&x.trim().length<=120&&
 !/[\u0000-\u001f<>]/.test(x);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function validateQuote(input,now=Date.now()){
 if(!input||typeof input!=='object'||Array.isArray(input))return {error:'داده پیشنهاد معتبر نیست.'};
 const items=input.itemsTotalToman,delivery=input.deliveryToman;
 if(!isMoney(items)||items===0||!isMoney(delivery)||!Number.isSafeInteger(items+delivery))
  return {error:'مبلغ اقلام و هزینه ارسال باید اعداد صحیح تومان باشند.'};
 if(!Number.isSafeInteger(input.validUntilMs)||!Number.isSafeInteger(input.supplyHoldUntilMs))
  return {error:'اعتبار قیمت و زمان رزرو باید به‌صورت دقیق ثبت شوند.'};
 // Price is deliberately short-lived; BNPL provider may have an even shorter hold.
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
 // This is intentionally ADMIN-ONLY. No unauthenticated payment route is created.
 return response({saved:true,paymentEnabled:false,finalTotalToman:quote.finalTotalToman,validUntilMs:quote.validUntilMs},201);
}
