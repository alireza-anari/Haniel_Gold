/* AUTO-GENERATED from functions/_lib/gold-market.js — do not hand-edit.
   Paste this entire file into Cloudflare Worker Edit Code.
   Bind existing D1 as DB, add SERVIX_API_KEY Secret, then set Cron Trigger.
   No public HTTP endpoint or API secret in this source. */

/* HANI-EL GOLD: Servix 18K gold, exact BigInt arithmetic, first-rate approval.
   Never expose SERVIX_API_KEY to browsers. Monetary maths use integer rials/toman,
   not IEEE-754 floating point. No guessed tax or rate. */
const SERVIX_URL='https://servix.cc/api/v1/assets/GOLD_18_RLS';
const SOURCE_MAX_AGE_MS=40*60*1000;
const RATE_COOLDOWN_MS=20*60*1000;
const RATE_VALID_MS=40*60*1000;
const nowMs=()=>Date.now();
const safeInteger=(v,minimum=0)=>Number.isSafeInteger(v)&&v>=minimum;
// Servix returns a JSON number (potentially fractional rials). D1 stores one
// integer rial per gram, so round positive fractions HALF_UP to the nearest rial.
// Accept only ordinary decimal notation; never strip separators, guess units,
// coerce null, or accept protected placeholders/non-finite values.
function normalizeRialValue(value){
 if(typeof value!=='number'&&typeof value!=='string')return null;
 if(typeof value==='number'&&(!Number.isFinite(value)||value<=0||value>Number.MAX_SAFE_INTEGER))return null;
 const raw=String(value);
 if(raw.length>40)return null;
 const match=/^([1-9]\d{0,14}|0)(?:\.(\d{1,18}))?$/.exec(raw);
 if(!match)return null;
 const whole=BigInt(match[1]);
 const fraction=match[2]||'';
 const rounded=whole+(fraction&&fraction[0]>='5'?1n:0n);
 return rounded>0n&&rounded<=BigInt(Number.MAX_SAFE_INTEGER)?Number(rounded):null;
}
class MarketError extends Error{
 constructor(code,msg){super(msg);this.name='MarketError';this.code=code;}
}
function parseServixQuote(data,now=nowMs()){
 if(!data||typeof data!=='object'||Array.isArray(data))throw new MarketError('BAD_SHAPE','ساختار پاسخ نرخ معتبر نیست.');
 if(data.code!=='GOLD_18_RLS'||data.quoteUnit!=='RLS')throw new MarketError('WRONG_UNIT','نماد یا واحد نرخ Servix صحیح نیست.');
 if(data.stale===true)throw new MarketError('STALE_SOURCE','منبع نرخ را قدیمی اعلام کرده است.');
 if(data.value==null)throw new MarketError('MISSING_VALUE','منبع برای این نماد مقدار قیمت ارائه نکرده است.');
 const rial=normalizeRialValue(data.value);
 if(rial===null)throw new MarketError('BAD_AMOUNT','مقدار ریالی نرخ در قالب عددی معتبر نیست.');
 const time=data.businessTime;
 if(typeof time!=='string'||!/(?:Z|[+-]\d{2}:\d{2})$/.test(time)||!Number.isFinite(Date.parse(time)))
   throw new MarketError('BAD_TIME','زمان نرخ باید ISO-8601 دارای منطقه زمانی باشد.');
 const observedAt=Date.parse(time);
 if(observedAt>now+120_000||now-observedAt>SOURCE_MAX_AGE_MS)
   throw new MarketError('STALE_SOURCE','زمان نرخ از محدوده تازگی خارج است.');
 return {rialPerGram:rial,observedAt};
}
async function fetchServix(env,fetcher=fetch,now=nowMs()){
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
async function syncRate(env,{fetcher=fetch,now=nowMs()}={}){
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
  return {status:quota?'quota_exceeded':'failed',errorCode:code,message:'نرخ جدید معتبر دریافت نشد.'};
 }
 const cur=await state(env.DB);
 if(cur.rate_rial_per_gram&&q.observedAt<=cur.observed_at){
  await audit(env.DB,'unchanged',q.rialPerGram,q.observedAt,now,'same_or_older_observation');
  return {status:'unchanged',message:'زمان مشاهده جدیدتر نیست؛ اعتبار نرخ تمدید نشد.'};
 }
 if(cur.pending_rate_rial===q.rialPerGram&&cur.pending_observed_at===q.observedAt)
   return {status:'pending',message:'نرخ منتظر تأیید است.'};
 const rules=await policy(env.DB);
 let pendingReason=cur.blocked&&cur.pending_rate_rial?'existing_pending_review':'initial_review';
 if(cur.rate_rial_per_gram&&!cur.blocked){
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

export default {
  async fetch() {
    return new Response('Not Found',{status:404,headers:{'Cache-Control':'no-store'}});
  },
  async scheduled(_event,env,ctx) {
    ctx.waitUntil((async()=>{
      const result=await syncRate(env);
      // Log only safe status and error code, never keys or prices.
      console.log('haniel_gold_rate_sync',result.status,result.errorCode||'');
    })().catch(error=>{
      console.error('haniel_gold_rate_sync_failed',error?.code||'WORKER_ERROR');
      throw error;
    }));
  }
};
