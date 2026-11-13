// Fixed-point 15-decimal arithmetic avoids binary floating-point drift for gold pricing.
const SCALE=1000000000000000n;
export const asciiDigits=x=>String(x??'').replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632));
export function dec(x,label='عدد') {
 const s=asciiDigits(x).trim().replace(/[,٬،\s]/g,'');
 if(!/^-?\d+(\.\d{1,15})?$/.test(s)||s.length>38)throw Error(`«${label}» باید عدد معتبر با حداکثر ۱۵ رقم اعشار باشد.`);
 const neg=s.startsWith('-'),[a,b='']=s.replace('-','').split('.');
 const val=BigInt(a)*SCALE+BigInt(b.padEnd(15,'0'));
 return neg?-val:val;
}
export function fmt(v){let neg=v<0n;if(neg)v=-v;let f=String(v%SCALE).padStart(15,'0').replace(/0+$/,'');return (neg?'-':'')+String(v/SCALE)+(f?'.'+f:'');}
export function mul(a,b){let sign=(a<0n)!==(b<0n)?-1n:1n;let n=(a<0n?-a:a)*(b<0n?-b:b);return sign*((n+SCALE/2n)/SCALE)}
export function div(a,b){if(b===0n)throw Error('تقسیم بر صفر');let sign=(a<0n)!==(b<0n)?-1n:1n;let n=(a<0n?-a:a)*SCALE;let d=b<0n?-b:b;return sign*((n+d/2n)/d)}
export function valid(x,label,{max=null,min=0n}={}){let d=dec(x,label);if(d<min)throw Error(`«${label}» نمی‌تواند کمتر از مقدار مجاز باشد.`);if(max!==null && d>dec(max))throw Error(`«${label}» بیشتر از سقف مجاز است.`);return d;}
export function quantity(x){let d=valid(x,'تعداد',{max:'1000000'});if(d%SCALE!==0n)throw Error('تعداد باید عدد صحیح باشد.');return Number(d/SCALE);}
export function purchaseUnitCost(p){let w=valid(p.weight,'وزن'),rate=valid(p.purchase_gold_rate,'نرخ خرید'),pct=valid(p.purchase_labor_pct,'اجرت خرید',{max:'100'});return mul(w+div(mul(w,pct),dec('100')),rate)}
export function quote(p,input){
 const q=quantity(input.quantity);if(q<1)throw Error('تعداد فروش باید بیشتر از صفر باشد.');
 const w=valid(p.weight,'وزن',{min:1n}),rate=valid(input.gold_rate,'قیمت روز',{min:1n});
 const labor=valid(input.labor_pct,'اجرت فروش',{max:'100'}),profit=valid(input.profit_pct,'درصد سود',{max:'100'});
 const accessories=valid(input.accessories??0,'متعلقات'),discount=valid(input.discount??0,'تخفیف');
 const totalWeight=w*BigInt(q),raw=mul(totalWeight,rate),laborGold=div(mul(totalWeight,labor),dec('100'));
 const profitGold=div(mul(totalWeight+laborGold,profit),dec('100'));
 const profitRial=mul(profitGold,rate),final=raw+mul(laborGold,rate)+profitRial+accessories-discount;
 if(final<0n)throw Error('قیمت نهایی با این تخفیف منفی می‌شود.');
 const cost=purchaseUnitCost(p)*BigInt(q);
 return {quantity:q,unit_weight:fmt(w),total_weight:fmt(totalWeight),gold_rate:fmt(rate),labor_pct:fmt(labor),profit_pct:fmt(profit),accessories:fmt(accessories),discount:fmt(discount),raw_price:fmt(raw),labor_gold:fmt(laborGold),profit_gold:fmt(profitGold),profit_rial:fmt(profitRial),final_price:fmt(final),purchase_cost:fmt(cost),net_profit:fmt(final-cost-accessories)};
}
