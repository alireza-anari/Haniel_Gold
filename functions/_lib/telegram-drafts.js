// Telegram channel -> review-only product drafts, never auto-publish or change real prices.
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});
export function parseTelegramCandidate(text){
 if(typeof text!=='string'||text.length>3500)return null;
 // Explicit opt-in: ordinary channel posts never become catalogue records.
 if(!/(^|\s)#HANIEL_SITE\b/i.test(text))return null;
 const lines=text.split(/\r?\n/),fields={};
 const names={ 'نام':'name','شناسه':'slug','دسته':'category','وزن':'weightGrams',
 'عیار':'karat','اجرت':'makingFeePercent','سود':'profitPercent','توضیح':'description' };
 for(const line of lines){
  const match=/^\s*(نام|شناسه|دسته|وزن|عیار|اجرت|سود|توضیح)\s*[:：]\s*(.*?)\s*$/.exec(line);
  if(match&&fields[names[match[1]]]===undefined)fields[names[match[1]]]=match[2].trim();
 }
 // A draft may be incomplete. Never invent product specifications.
 const slug=fields.slug&&/^[a-z0-9_-]{2,80}$/i.test(fields.slug)?fields.slug:null;
 const name=fields.name&&fields.name.length>=2&&fields.name.length<=150?fields.name:null;
 return {name,slug,category:fields.category||null,weightGrams:fields.weightGrams||null,
  karat:fields.karat||null,makingFeePercent:fields.makingFeePercent||null,
  profitPercent:fields.profitPercent||null,description:fields.description||null,
  needsReview:true};
}
function sameSecret(a,b){
 if(typeof a!=='string'||typeof b!=='string'||!a||!b)return false;
 let mismatch=a.length^b.length;
 for(let i=0;i<Math.max(a.length,b.length);i++)mismatch|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
 return mismatch===0;
}
export async function telegramWebhook(c){
 const {request:r,env:e}=c;
 if(r.method!=='POST')return json({error:'مسیر موجود نیست.'},404);
 if(e.TELEGRAM_IMPORT_ENABLED!=='1'||!e.TELEGRAM_WEBHOOK_SECRET||(!e.TELEGRAM_CHANNEL_ID&&!e.TELEGRAM_CHANNEL_USERNAME))
  return json({error:'درگاه واردکردن پست فعال نشده است.'},503);
 if(!sameSecret(r.headers.get('X-Telegram-Bot-Api-Secret-Token'),e.TELEGRAM_WEBHOOK_SECRET))
  return json({error:'مجوز معتبر نیست.'},403);
 if(Number(r.headers.get('content-length')||0)>16000)return json({error:'حجم ورودی نامعتبر است.'},413);
 const raw=await r.text();if(raw.length>16000)return json({error:'حجم ورودی نامعتبر است.'},413);
 let update;try{update=JSON.parse(raw);}catch{return json({error:'ورودی نامعتبر است.'},400);}
 const msg=update?.channel_post||update?.edited_channel_post;
 // The channel username in its public URL can be used instead of discovering an ID.
 // Compare against Telegram's signed webhook body only after validating webhook secret.
 const requiredId=String(e.TELEGRAM_CHANNEL_ID||'').trim();
 const username=String(e.TELEGRAM_CHANNEL_USERNAME||'').replace(/^@/,'').toLowerCase().trim();
 const idMatches=!requiredId||String(msg?.chat?.id)===requiredId;
 const userMatches=!username||String(msg?.chat?.username||'').toLowerCase()===username;
 if(!msg||!idMatches||!userMatches)return json({ok:true,ignored:'not_expected_channel'});
 if(!Number.isSafeInteger(msg.message_id)||!Number.isSafeInteger(update.update_id))
  return json({error:'شناسه پیام نامعتبر است.'},400);
 const content=msg.caption||msg.text||'';
 const parsed=parseTelegramCandidate(content);
 if(!parsed)return json({ok:true,ignored:'not_tagged'});
 const photo=Array.isArray(msg.photo)?msg.photo[msg.photo.length-1]?.file_id:null;
 const now=Date.now();
 await e.DB.prepare("INSERT INTO telegram_product_drafts(channel_id,message_id,update_id,source_text,parsed_json,photo_file_id,media_group_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(channel_id,message_id) DO UPDATE SET update_id=excluded.update_id,source_text=excluded.source_text,parsed_json=excluded.parsed_json,photo_file_id=excluded.photo_file_id,media_group_id=excluded.media_group_id,updated_at=excluded.updated_at WHERE review_status='pending'")
  .bind(String(msg.chat.id),msg.message_id,update.update_id,content,JSON.stringify(parsed),
   typeof photo==='string'?photo:null,msg.media_group_id||null,now,now).run();
 return json({ok:true,queuedForReview:true});
}
export async function adminTelegramDrafts(c,path){
 const {request:r,env:e}=c;
 if(path==='admin/telegram/drafts'&&r.method==='GET'){
  const out=await e.DB.prepare('SELECT id,channel_id,message_id,parsed_json,photo_file_id,media_group_id,review_status,created_at,updated_at FROM telegram_product_drafts ORDER BY created_at DESC LIMIT 100').all();
  return json({items:(out.results||[]).map(row=>({...row,parsed:JSON.parse(row.parsed_json)}))});
 }
 const match=/^admin\/telegram\/drafts\/([0-9]{1,12})$/.exec(path);
 if(match&&r.method==='PATCH'){
  let body;try{body=await r.json();}catch{return json({error:'داده نامعتبر است.'},400);}
  if(!['reviewed','rejected'].includes(body?.status))return json({error:'وضعیت مجاز نیست.'},400);
  const result=await e.DB.prepare("UPDATE telegram_product_drafts SET review_status=?,updated_at=? WHERE id=? AND review_status='pending'")
   .bind(body.status,Date.now(),Number(match[1])).run();
  return result.meta?.changes===1?json({updated:true}):json({error:'پیش‌نویس در انتظار بررسی یافت نشد.'},409);
 }
 return json({error:'مسیر موجود نیست.'},404);
}
