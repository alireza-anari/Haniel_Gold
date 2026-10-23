/* HANI-EL GOLD: Servix 18K gold, exact BigInt arithmetic, first-rate approval.
   Never expose SERVIX_API_KEY to browsers. Monetary maths use integer rials/toman,
   not IEEE-754 floating point. No guessed tax or rate. */
export const SERVIX_URL='https://servix.cc/api/v1/assets/GOLD_18_RLS';
export const SOURCE_MAX_AGE_MS=40*60*1000;
export const RATE_COOLDOWN_MS=20*60*1000;
export const RATE_VALID_MS=40*60*1000;
const nowMs=()=>Date.now();
const safeInteger=(v,minimum=0)=>Number.isSafeInteger(v)&&v>=minimum;
const digits=x=>{
 if(typeof x==='number')return Number.isSafeInteger(x)&&x>0?String(x):null;
 return typeof x==='string'&&/^[1-9]\d{0,14}$/.test(x)?x:null;
};
export class MarketError extends Error{
 constructor(code,msg){super(msg);this.name='MarketError';this.code=code;}
}
export function parseServixQuote(data,now=nowMs()){
 if(!data||typeof data!=='object'||Array.isArray(data))throw new MarketError('BAD_SHAPE','ساختار پاسخ نرخ معتبر نیست.');
 if(data.code!=='GOLD_18_RLS'||data.quoteUnit!=='RLS')throw new MarketError('WRONG_UNIT','نماد یا واحد نرخ Servix صحیح نیست.');
 if(data.stale===true)throw new MarketError('STALE_SOURCE','منبع نرخ را قدیمی اعلام کرده است.');
 const raw=digits(data.value);
 if(!raw)throw new MarketError('BAD_AMOUNT','مقدار ریالی نرخ معتبر نیست.');
 const rial=BigInt(raw);
 if(rial>BigInt(Number.MAX_SAFE_INTEGER))throw new MarketError('BAD_AMOUNT','نرخ خارج از محدوده عدد امن است.');
 const time=data.businessTime;
 if(typeof time!=='string'||!/(?:Z|[+-]\d{2}:\d{2})$/.test(time)||!Number.isFinite(Date.parse(time)))
   throw new MarketError('BAD_TIME','زمان نرخ باید ISO-8601 دارای منطقه زمانی باشد.');
 const observedAt=Date.parse(time);
 if(observedAt>now+120_000||now-observedAt>SOURCE_MAX_AGE_MS)
   throw new MarketError('STALE_SOURCE','زمان نرخ از محدوده تازگی خارج است.');
 return {rialPerGram:Number(rial),observedAt};
}
export async function fetchServix(env,fetcher=fetch,now=nowMs()){
 if(!env.SERVIX_API_KEY||String(env.SERVIX_API_KEY).trim().length<8)
   throw new MarketError('NOT_CONFIGURED','کلید Servix در Secrets تنظیم نشده است.');
 let response;
 try{
  response=await fetcher(SERVIX_URL,{method:'GET',headers:{'X-API-Key':env.SERVIX_API_KEY,'Accept':'application/json'},
   redirect:'manual',signal:AbortSignal.timeout(9000)});
 }catch{throw new MarketError('NETWORK','دسترسی به سرویکس ممکن نیست.');}
 if(response.status===429)throw new MarketError('QUOTA','سهمیه دریافت نرخ تمام شده است.');
 if(response.status===401||response.status===403)throw new MarketError('AUTH','کلید یا دسترسی Servix نامعتبر است.');
 if(response.status!==200)throw new MarketError('PROVIDER','سرویکس پاسخ معتبر برنگرداند.');
 if(Number(response.headers.get('content-length')||0)>100_000)throw new MarketError('TOO_LARGE','پاسخ منبع بیش از حد بزرگ است.');
 let text;
 try{text=await response.text();}catch{throw new MarketError('NETWORK','پاسخ سرویکس کامل دریافت نشد.');}
 if(text.length>100_000)throw new MarketError('TOO_LARGE','پاسخ منبع بیش از حد بزرگ است.');
 let obj;
 try{obj=JSON.parse(text);}catch{throw new MarketError('INVALID_JSON','پاسخ سرویکس JSON معتبر نیست.');}
 return parseServixQuote(obj,now);
}
const state=async db=>db.prepare('SELECT * FROM gold_market_state WHERE id=1').first();
const policy=async db=>db.prepare('SELECT * FROM pricing_policy WHERE id=1').first();
const audit=(db,event,rate,observed,now,detail='')=>
 db.prepare('INSERT INTO gold_rate_audit(event,rate_rial_per_gram,observed_at,created_at,detail) VALUES(?,?,?,?,?)')
   .bind(event,rate??null,observed??null,now,String(detail).slice(0,180)).run();
export async function marketPublic(env,now=nowMs()){
 if(!env.DB)return {status:'unavailable',currency:'TOMAN',karat:18,tomanPerGram:null,observedAt:null,validUntil:null,pricingReady:false};
 const [row,rules]=await Promise.all([state(env.DB),policy(env.DB)]);
 if(!row)return {status:'not_initialized',currency:'TOMAN',karat:18,tomanPerGram:null,observedAt:null,validUntil:null,pricingReady:false};
 const valid=!!row.rate_rial_per_gram&&!row.blocked&&row.valid_until>now&&row.observed_at<=now;
 const status=row.blocked?'blocked':!valid?'expired':'ready';
 return {status,currency:'TOMAN',karat:18,source:'servix',tomanPerGram:valid?row.rate_rial_per_gram/10:null,
  observedAt:valid?new Date(row.observed_at).toISOString():null,
  validUntil:valid?new Date(row.valid_until).toISOString():null,
  pricingReady:valid&&rules?.approved===1,
  policyApproved:rules?.approved===1};
}
export async function marketAdmin(env,now=nowMs()){
 const [row,rules]=await Promise.all([state(env.DB),policy(env.DB)]);
 if(!row||!rules)throw new MarketError('DB_SETUP','جداول نرخ در D1 هنوز ایجاد نشده‌اند.');
 return {market:{status:row.blocked?'blocked':row.valid_until>now?'ready':'expired',
   rateTomanPerGram:row.rate_rial_per_gram?row.rate_rial_per_gram/10:null,
   observedAt:row.observed_at?new Date(row.observed_at).toISOString():null,
   validUntil:row.valid_until?new Date(row.valid_until).toISOString():null,
   pendingTomanPerGram:row.pending_rate_rial?row.pending_rate_rial/10:null,
   pendingObservedAt:row.pending_observed_at?new Date(row.pending_observed_at).toISOString():null,
   pendingReason:row.pending_reason,
   pausedUntil:row.paused_until?new Date(row.paused_until).toISOString():null,
   lastAttemptAt:row.last_attempt_at?new Date(row.last_attempt_at).toISOString():null,
   lastError:row.last_error},
  policy:{taxPercent:rules.tax_bps==null?null:rules.tax_bps/100,taxBasis:rules.tax_basis,
   maxRateChangePercent:rules.auto_change_bps==null?null:rules.auto_change_bps/100,approved:!!rules.approved}};
}
export async function syncRate(env,{fetcher=fetch,now=nowMs()}={}){
 if(!env.DB)throw new MarketError('DB_SETUP','D1 متصل نیست.');
 if(!env.SERVIX_API_KEY||String(env.SERVIX_API_KEY).trim().length<8)
  throw new MarketError('NOT_CONFIGURED','کلید Servix هنوز در Secrets تنظیم نشده است.');
 const old=await state(env.DB);
 if(!old)throw new MarketError('DB_SETUP','مهاجرت نرخ روی D1 اجرا نشده است.');
 if(old.paused_until>now)return {status:'paused',message:'ارسال درخواست به‌خاطر سهمیه متوقف است.'};
 if(old.last_attempt_at&&now-old.last_attempt_at<RATE_COOLDOWN_MS)
   return {status:'cooldown',message:'دریافت نرخ کمتر از ۲۰ دقیقه قبل انجام شده است؛ از مصرف سهمیه اضافی جلوگیری شد.'};
 // Atomic compare-and-set reserves this interval so two simultaneous schedulers do not double-bill.
 const claimed=await env.DB.prepare('UPDATE gold_market_state SET last_attempt_at=?,version=version+1 WHERE id=1 AND version=? AND (last_attempt_at IS NULL OR last_attempt_at<=?) AND (paused_until IS NULL OR paused_until<=?)')
  .bind(now,old.version,now-RATE_COOLDOWN_MS,now).run();
 if(claimed.meta?.changes!==1)return {status:'cooldown',message:'دریافت هم‌زمان در حال انجام است.'};
 let q;
 try{q=await fetchServix(env,fetcher,now);}catch(e){
  const code=e instanceof MarketError?e.code:'NETWORK';
  const quota=code==='QUOTA';
  await env.DB.prepare('UPDATE gold_market_state SET last_error=?,paused_until=?,version=version+1 WHERE id=1')
    .bind(code,quota?now+24*60*60*1000:null).run();
  await audit(env.DB,quota?'quota':'failed',null,null,now,code);
  return {status:quota?'quota_exceeded':'failed',message:'نرخ جدید معتبر دریافت نشد.'};
 }
 const cur=await state(env.DB);
 if(cur.rate_rial_per_gram&&q.observedAt<=cur.observed_at){
  await audit(env.DB,'unchanged',q.rialPerGram,q.observedAt,now,'same_or_older_observation');
  return {status:'unchanged',message:'زمان مشاهده جدیدتر نیست؛ اعتبار نرخ تمدید نشد.'};
 }
 if(cur.pending_rate_rial===q.rialPerGram&&cur.pending_observed_at===q.observedAt)
   return {status:'pending',message:'نرخ منتظر تأیید است.'};
 const rules=await policy(env.DB);
 let pendingReason='initial_review';
 if(cur.rate_rial_per_gram){
  if(!rules?.approved||!rules.auto_change_bps)pendingReason='policy_not_approved';
  else {
   const diff=(BigInt(q.rialPerGram)-BigInt(cur.rate_rial_per_gram));
   const change=(diff<0n?-diff:diff)*10000n;
   pendingReason=change>BigInt(cur.rate_rial_per_gram)*BigInt(rules.auto_change_bps)?'large_change':null;
  }
 }
 if(pendingReason){
  await env.DB.prepare('UPDATE gold_market_state SET pending_rate_rial=?,pending_observed_at=?,pending_reason=?,blocked=1,last_error=?,version=version+1 WHERE id=1')
   .bind(q.rialPerGram,q.observedAt,pendingReason,pendingReason).run();
  await audit(env.DB,'pending',q.rialPerGram,q.observedAt,now,pendingReason);
  return {status:'pending',message:'نرخ جدید منتظر بررسی و تأیید مدیر است.'};
 }
 const until=Math.min(now+RATE_VALID_MS,q.observedAt+RATE_VALID_MS);
 await env.DB.prepare("UPDATE gold_market_state SET rate_rial_per_gram=?,observed_at=?,verified_at=?,valid_until=?,pending_rate_rial=NULL,pending_observed_at=NULL,pending_reason='',blocked=0,last_error='',paused_until=NULL,version=version+1 WHERE id=1")
  .bind(q.rialPerGram,q.observedAt,now,until).run();
 await audit(env.DB,'accepted',q.rialPerGram,q.observedAt,now,'within_owner_approved_limit');
 return {status:'accepted',message:'نرخ جدید با سقف تغییر تأییدشده پذیرفته شد.'};
}
export async function approvePendingRate(env,now=nowMs()){
 const old=await state(env.DB);
 if(!old?.pending_rate_rial||!old.pending_observed_at)throw new MarketError('NO_CANDIDATE','نرخ پیشنهادی برای تأیید وجود ندارد.');
 if(old.pending_observed_at>now+120000||now-old.pending_observed_at>SOURCE_MAX_AGE_MS)
  throw new MarketError('EXPIRED_CANDIDATE','نرخ پیشنهادی قدیمی شده؛ دوباره دریافت کن.');
 if(old.observed_at&&old.pending_observed_at<=old.observed_at)
  throw new MarketError('OLD_CANDIDATE','نرخ پیشنهادی جدیدتر از نرخ ثبت‌شده نیست.');
 const until=Math.min(now+RATE_VALID_MS,old.pending_observed_at+RATE_VALID_MS);
 const update=await env.DB.prepare("UPDATE gold_market_state SET rate_rial_per_gram=pending_rate_rial,observed_at=pending_observed_at,verified_at=?,valid_until=?,blocked=0,pending_rate_rial=NULL,pending_observed_at=NULL,pending_reason='',last_error='',version=version+1 WHERE id=1 AND version=? AND pending_rate_rial IS NOT NULL")
  .bind(now,until,old.version).run();
 if(update.meta?.changes!==1)throw new MarketError('CONCURRENT','نرخ هم‌زمان تغییر کرده است.');
 await audit(env.DB,'approved',old.pending_rate_rial,old.pending_observed_at,now,'manually_approved_by_authenticated_admin');
 return {status:'approved',message:'نرخ بررسی‌شده تأیید شد؛ فقط تا زمان اعتبار منبع نمایش داده می‌شود.'};
}
function percentBps(v,label,{allowZero=true}={}){
 if(v===null||v===undefined||v==='')throw new MarketError('POLICY_INVALID',label+' الزامی است.');
 const str=String(v).trim();
 if(!/^\d{1,3}(?:\.\d{1,2})?$/.test(str))throw new MarketError('POLICY_INVALID',label+' حداکثر دو رقم اعشار دارد.');
 const [whole,frac='']=str.split('.');
 const bps=Number(whole)*100+Number(frac.padEnd(2,'0'));
 if(bps>10000||(!allowZero&&bps<1))throw new MarketError('POLICY_INVALID',label+' از محدوده مجاز خارج است.');
 return bps;
}
export async function approvePricingPolicy(env,data,now=nowMs()){
 if(data.confirmReviewed!==true||data.taxBasis!=='fee_profit')
  throw new MarketError('POLICY_INVALID','تأیید صریح مبنای مالیات و سیاست مالی لازم است.');
 const tax=percentBps(data.taxPercent,'درصد مالیات',{allowZero:true});
 const threshold=percentBps(data.maxRateChangePercent,'سقف تغییر نرخ',{allowZero:false});
 await env.DB.prepare("UPDATE pricing_policy SET tax_bps=?,tax_basis='fee_profit',auto_change_bps=?,approved=1,approved_at=? WHERE id=1")
  .bind(tax,threshold,now).run();
 return {status:'approved',message:'سیاست محاسبه برای محیط آزمایشی ثبت و تأیید شد.'};
}
const round=(n,d)=> (n+(d/2n))/d; // for nonnegative integers; half up
export function calculatePrice(product,rateRial,taxBps){
 if(product.karat!==18||!safeInteger(product.weight_mg,1)||
  !safeInteger(product.making_fee_bps)||product.making_fee_bps>10000||
  !safeInteger(product.profit_bps)||product.profit_bps>10000||
  !safeInteger(taxBps)||taxBps>10000||!safeInteger(rateRial,1))return null;
 const raw=round(BigInt(product.weight_mg)*BigInt(rateRial),10000n);
 const work=round(raw*BigInt(product.making_fee_bps),10000n);
 const profit=round((raw+work)*BigInt(product.profit_bps),10000n);
 const tax=round((work+profit)*BigInt(taxBps),10000n);
 const total=raw+work+profit+tax;
 if(total<=0n||total>BigInt(Number.MAX_SAFE_INTEGER))return null;
 return {amountToman:Number(total),breakdown:{rawGoldToman:Number(raw),makingFeeToman:Number(work),
  profitToman:Number(profit),taxToman:Number(tax)},currency:'TOMAN',source:'servix_18k'};
}
export async function dynamicContext(env,now=nowMs()){
 if(!env.DB)return null;
 const [row,rules]=await Promise.all([state(env.DB),policy(env.DB)]);
 if(!row||!rules||row.blocked!==0||row.valid_until<=now||row.observed_at>now||
  !row.rate_rial_per_gram||!rules.approved||rules.tax_basis!=='fee_profit'||rules.tax_bps==null)return null;
 return {rateRial:row.rate_rial_per_gram,taxBps:rules.tax_bps,
  observedAt:new Date(row.observed_at).toISOString(),validUntil:new Date(row.valid_until).toISOString()};
}
