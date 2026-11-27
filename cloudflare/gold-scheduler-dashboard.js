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
 const apiKey=String(env.SERVIX_API_KEY??'').trim();
 if(apiKey.length<8)
   throw new MarketError('NOT_CONFIGURED','کلید Servix در Secrets تنظیم نشده است.');
 let response;
 try{
  response=await fetcher(SERVIX_URL,{method:'GET',headers:{'X-API-Key':apiKey,'Accept':'application/json'},
   redirect:'manual',signal:AbortSignal.timeout(9000)});
 }catch{throw new MarketError('NETWORK','دسترسی به سرویکس ممکن نیست.');}
 if(response.status===429)throw new MarketError('QUOTA','سهمیه دریافت نرخ تمام شده است.');
 if(response.status===401||response.status===403)throw new MarketError('AUTH','کلید یا دسترسی Servix نامعتبر است.');
 if(response.status!==200){
  let code=Number.isInteger(response.status)&&response.status>=100&&response.status<=599?'PROVIDER_HTTP_'+response.status:'PROVIDER';
  // Only documented fixed error identifiers are retained, never message/body/key.
  if(response.status===400){
   try{
    const reader=response.body?.getReader();
    if(reader){
     const decoder=new TextDecoder();let size=0,body='';
     while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();body='';break;}body+=decoder.decode(value,{stream:true});}
     if(body){const obj=JSON.parse(body+decoder.decode());
      const allowed=new Set(['VALIDATION_FAILED','MISSING_REQUEST_PARAMETER','INVALID_REQUEST_PARAMETER','BAD_REQUEST']);
      const providerCode=obj?.code??obj?.error?.code;
      if(allowed.has(providerCode))code+='_'+providerCode;
     }
    }
   }catch{}
  }
  throw new MarketError(code,'سرویکس پاسخ معتبر برنگرداند.');
 }
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
const ratePolicy=async db=>db.prepare('SELECT * FROM gold_rate_policy WHERE id=1').first();
async function ensureMarketRows(db){
 await db.prepare("INSERT OR IGNORE INTO gold_market_state(id,blocked) VALUES(1,1)").run();
 await db.prepare("INSERT OR IGNORE INTO pricing_policy(id,approved) VALUES(1,0)").run();
 // The separate rate-change policy is Mini App-specific; older storefront D1s may not have it.
 try{await db.prepare("INSERT OR IGNORE INTO gold_rate_policy(id,approved) VALUES(1,0)").run();}catch{}
}
const audit=(db,event,rate,observed,now,detail='')=>
 db.prepare('INSERT INTO gold_rate_audit(event,rate_rial_per_gram,observed_at,created_at,detail) VALUES(?,?,?,?,?)')
   .bind(event,rate??null,observed??null,now,String(detail).slice(0,180)).run();
async function syncRate(env,options={}) {
 return syncRateUsingPolicy(env,policy,'policy_not_approved',options);
}
async function syncRateWithRatePolicy(env,options={}) {
 return syncRateUsingPolicy(env,ratePolicy,'rate_policy_not_approved',options);
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
