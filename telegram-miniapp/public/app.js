const tg=window.Telegram?.WebApp;
try{tg?.ready();tg?.expand();tg?.setHeaderColor('#141512');tg?.setBackgroundColor('#111310')}catch{}
const headers=()=>({'X-Telegram-Init-Data':tg?.initData||''});
let session=null,products=[],sales=[],summary=null,current='dashboard',previewToken=null,searchTerm='';
const photoCache=new Map();
const view=document.getElementById('view'),navSide=document.getElementById('side-nav'),navMobile=document.getElementById('mobile-nav');
const modal=document.getElementById('modal'),modalBody=document.getElementById('modal-body'),modalTitle=document.getElementById('modal-title');
const esc=(x)=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=(x,max=3)=>{let n=Number(x);return Number.isFinite(n)?n.toLocaleString('fa-IR',{maximumFractionDigits:max}):'—'};
const rial=(x)=>`${number(x,2)} <small class="muted">ریال</small>`;
const isManager=()=>['owner','manager'].includes(session?.user.role);
const isSeller=()=>session?.user.role!=='viewer';
const icons={dashboard:'◈',products:'◇',sales:'▣',quote:'⌗',reports:'▥',excel:'⇅',team:'♧',help:'ⓘ'};
const labels={dashboard:'داشبورد',products:'محصولات',sales:'فروش',quote:'محاسبه قیمت',reports:'گزارش‌ها',excel:'اکسل',team:'کاربران',help:'راهنما'};
async function api(url,opts={}){
 const h={...headers(),...(opts.body instanceof FormData?{}:{'Content-Type':'application/json'}),...(opts.headers||{})};
 const r=await fetch(url,{...opts,headers:h,cache:'no-store'});
 if(!r.ok){let j={};try{j=await r.json()}catch{};throw Error(j.error||`خطا در ارتباط (${r.status})`)}
 return opts.raw?r:r.json();
}
function notice(text,type='ok'){
 const n=document.getElementById('notice');n.textContent=text;n.className=`notice visible ${type==='ok'?'':type}`;
 clearTimeout(window.noticeTimeout);window.noticeTimeout=setTimeout(()=>n.className='notice',7000);
}
function loadError(err){notice(err?.message||'خطای ناشناخته','error')}
function loading(){view.innerHTML='<div class="loading"><span class="loader"></span> دریافت اطلاعات…</div>'}
function blank(text='هنوز اطلاعاتی وجود ندارد.') {return `<div class="empty"><div class="empty-symbol">✧</div><h3>${esc(text)}</h3><p>اطلاعات واقعی پس از ثبت یا ورود اکسل اینجا نمایش داده می‌شوند.</p></div>`}
function button(text,action,id='',kind='outline',extra=''){return `<button class="btn ${kind}" type="button" data-action="${action}" data-id="${esc(id)}" ${extra}>${text}</button>`}
function canSee(page){return (!['excel','reports'].includes(page)||isManager()) && (page!=='team'||session?.user.role==='owner') &&(!['sales','quote'].includes(page)||isSeller())}
function menus(){
 const pages=['dashboard','products','sales','quote','reports','excel','team','help'].filter(canSee);
 navSide.innerHTML=pages.map(p=>`<button class="nav-btn ${p===current?'active':''}" data-nav="${p}"><span class="nav-icon">${icons[p]}</span>${labels[p]}</button>`).join('');
 const mobile=['dashboard','products','sales','quote',isManager()?'excel':'help'].filter(canSee);
 navMobile.innerHTML=mobile.map(p=>`<button class="${p===current?'active':''}" data-nav="${p}"><span>${icons[p]}</span>${labels[p]}</button>`).join('');
 document.getElementById('page-title').textContent=labels[current];
 document.getElementById('user-role').textContent=`${session.user.name} · ${({'owner':'مالک','manager':'مدیر','sales':'فروشنده','viewer':'مشاهده‌گر'})[session.user.role]}`;
}
async function refreshData(){[summary,products]=await Promise.all([api('/api/summary'),api('/api/products')]);}
async function go(page){
 if(!canSee(page))return;
 current=page;menus();loading();
 try {if(['dashboard','products','sales','quote','reports'].includes(page))await refreshData();
  if(page==='dashboard')dashboard();if(page==='products')renderProducts();
  if(page==='sales')await renderSales();if(page==='quote')renderQuote();
  if(page==='reports')renderReports();if(page==='excel')renderExcel();
  if(page==='team')await renderTeam();if(page==='help')renderHelp();
 }catch(e){view.innerHTML=blank('نمایش اطلاعات ممکن نشد.');loadError(e)}
}
function metric(label,val,unit='',gold=false){return `<div class="metric ${gold?'gold':''}"><span class="caption">${label}</span><strong class="mono">${val}</strong><span class="foot">${unit||'HANI-EL GOLD'}</span></div>`}
function dashboard(){
 const empty=products.length===0;
 view.innerHTML=`<div class="hero"><div><div class="eyebrow">PRIVATE WORKSPACE / HANIEL</div><h2>مدیریت دقیق، تصمیم‌گیری مطمئن</h2><p>موجودی، فروش و قیمت‌گذاری محصولات را در یک فضای اختصاصی و متصل به اکسل کنترل کن.</p>
 <div class="hero-actions">${button('مشاهده محصولات','nav','products')}${isManager()?button('ورود فایل اکسل','nav','excel','ghost'):''}</div></div><img src="/assets/clover.png" alt="نشان رسمی برند"></div>
 <div class="metric-grid">${metric('محصولات',number(summary.products,0),'تعداد مدل‌ها')}${metric('موجودی فعلی',number(summary.available_units,0),'تعداد واحد')}${metric('وزن طلای موجود',number(summary.available_weight,4),'گرم')}${metric('فروش ثبت‌شده',number(summary.sales_count,0),'سند فروش',true)}</div>
 ${isManager()?`<div class="metric-grid">${metric('ارزش خرید موجودی',rial(summary.inventory_cost_rial),'براساس نرخ خرید ثبت‌شده')}${metric('مبلغ فروش ثبت‌شده',rial(summary.sales_rial),'براساس اسناد فعال',true)}${metric('سود خالص ثبت‌شده',rial(summary.profit_rial),'براساس فرمول اکسل')}${metric('محصولات ناموجود',number(products.filter(p=>p.available===0).length,0),'تعداد مدل')}</div>`:''}
 <div class="section-head"><div><h2>دسترسی سریع</h2><p>کارهای روزانه بدون خروج از تلگرام</p></div></div>
 <div class="action-grid"><button class="action" data-nav="products"><span class="top">◇</span><span class="label">گالری محصولات</span></button>${isSeller()?'<button class="action" data-nav="quote"><span class="top">⌗</span><span class="label">محاسبه فروش</span></button>':''}${isManager()?'<button class="action" data-nav="excel"><span class="top">⇅</span><span class="label">همگام‌سازی اکسل</span></button>':''}</div>
 ${empty?blank('برای شروع، اکسل را وارد کن.'):''}`;
}
function cardPhoto(p){return `<div class="product-photo">${p.cover_id?`<img data-photo="${p.cover_id}" alt="تصویر محصول ${esc(p.name)}">`:'<span class="placeholder">✧</span>'}</div>`}
async function hydratePhotos(scope=document){
 for(const el of scope.querySelectorAll('img[data-photo]')){
  const id=el.dataset.photo;
  try{if(!photoCache.has(id)){const r=await api(`/api/images/${id}`,{raw:true});const b=await r.blob();photoCache.set(id,URL.createObjectURL(b))}el.src=photoCache.get(id)}catch{el.replaceWith(document.createTextNode('✧'))}
 }
}
function renderProducts(){
 const list=products.filter(p=>`${p.name} ${p.sku}`.includes(searchTerm));
 view.innerHTML=`<div class="section-head"><div><h2>گالری موجودی</h2><p>دسترسی تصویری به محصولات و مشخصات واقعی آن‌ها</p></div><div class="buttons">${isManager()?button('+ محصول جدید','addProduct','',''):''}</div></div>
 <div class="filterbar"><input class="input search" id="search" placeholder="جست‌وجوی نام یا کد محصول…" value="${esc(searchTerm)}"><span class="muted tiny">${number(list.length,0)} محصول</span></div>
 ${list.length?`<div class="product-grid">${list.map(p=>`<article class="product-card" data-action="product" data-id="${p.id}">${cardPhoto(p)}<div class="product-info"><div class="product-sub"><span class="mono">${esc(p.sku)}</span><span class="pill ${p.available?'':'zero'}">${p.available?'موجود':'ناموجود'}</span></div><h3 class="product-name">${esc(p.name)}</h3><div class="product-detail"><span class="muted tiny">${number(p.weight)} گرم</span><strong>${number(p.available,0)} عدد</strong></div></div></article>`).join('')}</div>`:blank('محصولی با این مشخصات پیدا نشد.')}`;
 hydratePhotos(view);
 const el=document.getElementById('search');el?.addEventListener('input',e=>{searchTerm=e.target.value;renderProducts();document.getElementById('search')?.focus()});
}
function showModal(title,html){modalTitle.textContent=title;modalBody.innerHTML=html;modal.showModal();hydratePhotos(modalBody)}
function closeModal(){modal.close();modalBody.innerHTML=''}
function field(label,name,val='',type='text',more=''){return `<div class="field"><label for="field-${name}">${label}</label><input class="input" id="field-${name}" name="${name}" type="${type}" ${type==='number'?'step="any" min="0"':''} value="${esc(val)}" ${more}></div>`}
function selectField(label,name,items){return `<div class="field"><label>${label}</label><select class="select" name="${name}" required>${items.map(o=>`<option value="${esc(o.value)}">${esc(o.text)}</option>`).join('')}</select></div>`}
function productForm(p){
 const isEdit=!!p;
 showModal(isEdit?'ویرایش محصول':'ثبت محصول جدید',`<form class="form" id="product-form" data-id="${p?.id||''}"><div class="form-grid">
 <div class="field wide">${field('نام محصول','name',p?.name||'','text','required maxlength="130"')}</div>
 ${field('وزن هر عدد (گرم)','weight',p?.weight||'','number','required')}
 ${field('تعداد خرید','purchased_qty',p?.purchased_qty??'','number','required step="1"')}
 ${field('قیمت خرید هر گرم طلا (ریال)','purchase_gold_rate',p?.purchase_gold_rate??'','number','required')}
 ${field('اجرت خرید (%)','purchase_labor_pct',p?.purchase_labor_pct??'','number','required')}
 <div class="field wide">${field('تأمین‌کننده','supplier',p?.supplier||'')}</div>
 <div class="field wide"><label>یادداشت</label><textarea class="input" name="note" rows="2">${esc(p?.note||'')}</textarea></div></div>
 <div class="row-actions"><button class="btn" type="submit">${isEdit?'ذخیره تغییرات':'ثبت محصول'}</button>${button('انصراف','close','','ghost')}</div>
 <p class="tiny muted">تغییر تعداد خرید ممکن است موجودی را تغییر دهد؛ فروش‌های قبلی حذف نمی‌شوند. نرخ‌های خرید و فروش بر حسب ریال هستند.</p></form>`);
 document.getElementById('product-form').addEventListener('submit',async e=>{
 e.preventDefault();const f=Object.fromEntries(new FormData(e.target));
 if(p) f.version=p.version;
 try{await api(p?`/api/products/${p.id}`:'/api/products',{method:p?'PATCH':'POST',body:JSON.stringify(f)});
 closeModal();notice('اطلاعات محصول ذخیره شد.');await go('products')}catch(err){loadError(err)}
 });
}
async function productDetail(id){
 const p=products.find(p=>p.id===Number(id));if(!p)return;
 let imgs=await api(`/api/products/${p.id}/images`);
 showModal(p.name,`<div class="form"><div class="row-actions"><span class="badge-role mono">${esc(p.sku)}</span><span class="pill ${p.available?'':'zero'}">${p.available?'موجود':'ناموجود'}</span></div>
 <div class="photo-grid">${imgs.map(i=>`<div class="photo-item"><img data-photo="${i.id}" alt="تصویر محصول">${isManager()?`<button data-action="deletePhoto" data-id="${i.id}" data-product="${p.id}">حذف</button>`:''}</div>`).join('')}</div>
 ${isManager()?`<form id="photo-form" class="field"><label>افزودن تصویر (JPEG / PNG / WebP — حداکثر ۴ مگابایت)</label><input class="input" type="file" name="image" accept="image/png,image/jpeg,image/webp" required><button class="btn outline" type="submit">آپلود تصویر</button></form>`:''}
 <div class="summary-lines"><div class="line"><span class="name">وزن واحد</span><span>${number(p.weight,5)} گرم</span></div><div class="line"><span class="name">موجودی</span><span>${number(p.available,0)} عدد</span></div>
 ${isManager()?`<div class="line"><span class="name">تعداد خرید</span><span>${number(p.purchased_qty,0)}</span></div><div class="line"><span class="name">نرخ خرید طلا</span><span>${rial(p.purchase_gold_rate)}</span></div><div class="line"><span class="name">اجرت خرید</span><span>${number(p.purchase_labor_pct)}٪</span></div><div class="line"><span class="name">بهای خرید هر عدد</span><span>${rial(p.purchase_unit_cost)}</span></div><div class="line"><span class="name">تأمین‌کننده</span><span>${esc(p.supplier||'—')}</span></div>`:''}</div>
 <div class="row-actions">${isManager()?button('ویرایش','editProduct',p.id,'outline'):''}${isSeller()?button('محاسبه / فروش','quickSale',p.id,'ghost'):''}</div></div>`);
 const photoForm=document.getElementById('photo-form');photoForm?.addEventListener('submit',async e=>{
 e.preventDefault();const fd=new FormData(photoForm);try{await api(`/api/products/${p.id}/images`,{method:'POST',body:fd});closeModal();await go('products');await productDetail(p.id);notice('تصویر اضافه شد.')}catch(err){loadError(err)}
 });
}
async function renderSales(){
 sales=await api('/api/sales');
 view.innerHTML=`<div class="section-head"><div><h2>سوابق فروش</h2><p>هر سند شامل نرخ تاریخی طلاست و با تغییر قیمت روز بازنویسی نمی‌شود.</p></div><div class="buttons">${button('+ ثبت فروش','nav','quote','')}</div></div>
 ${sales.length?`<div class="table-wrap"><table class="table"><thead><tr><th>شماره</th><th>تاریخ</th><th>محصول</th><th>تعداد</th><th>قیمت نهایی</th>${isManager()?'<th>سود کل</th>':''}<th>وضعیت</th>${isManager()?'<th>عملیات</th>':''}</tr></thead><tbody>
 ${sales.map(s=>`<tr><td class="mono">${s.id}</td><td>${esc(s.date)}</td><td>${esc(s.product_name)}</td><td>${number(s.quantity,0)}</td><td>${rial(s.final_price)}</td>${isManager()?`<td>${rial(s.net_profit)}</td>`:''}<td>${s.voided?'<span class="pill zero">باطل‌شده</span>':'<span class="pill">ثبت‌شده</span>'}</td>${isManager()?`<td>${s.voided?'—':button('ابطال','voidSale',s.id,'ghost small')}</td>`:''}</tr>`).join('')}</tbody></table></div>`:blank('هنوز فروشی ثبت نشده است.')}`;
}
function renderQuote(selected){
 const usable=products.filter(p=>p.available>0);
 view.innerHTML=`<div class="section-head"><div><h2>محاسبه قیمت و ثبت فروش</h2><p>نرخ روز طلا دستی وارد می‌شود؛ هیچ نرخ واقعی از قبل فرض نشده است.</p></div></div>
 <div class="panel" style="max-width:750px">${usable.length?`<form id="sale-form" class="form"><div class="form-grid">
 ${selectField('محصول','product_id',usable.map(p=>({value:p.id,text:`${p.name} — موجودی ${p.available}`})))}
 ${field('تاریخ شمسی (مثلاً ۱۴۰۵/۰۸/۲۰)','date','','text','required placeholder="۱۴۰۵/۰۸/۲۰"')}
 ${field('تعداد فروش','quantity',1,'number','required step="1"')}
 ${field('قیمت روز هر گرم طلا (ریال)','gold_rate','','number','required placeholder="دستی وارد شود"')}
 ${field('درصد اجرت فروش','labor_pct','','number','required')}
 ${field('درصد سود فروش','profit_pct','','number','required')}
 ${field('قیمت متعلقات (ریال)','accessories',0,'number','required')}
 ${field('تخفیف (ریال)','discount',0,'number','required')}
 <div class="field wide">${field('نام خریدار (اختیاری)','customer')}</div></div>
 <div class="row-actions">${button('محاسبه پیش‌نمایش','calculate','','outline')}<button class="btn" type="submit">ثبت نهایی فروش</button></div>
 <div id="quote-result"></div>
 <p class="tiny muted">ثبت فروش موجودی را کاهش می‌دهد و در گزارش مالی ثبت می‌شود. قبل از تأیید، قیمت نهایی را بررسی کن.</p></form>`:blank('محصول موجود برای فروش پیدا نشد.')}</div>`;
 const saleForm=document.getElementById('sale-form');if(!saleForm)return;
 if(selected)saleForm.elements.product_id.value=String(selected);
 const setDefaultLabor=()=>{const p=usable.find(p=>p.id===Number(saleForm.elements.product_id.value));if(p) saleForm.elements.labor_pct.value=p.default_labor_pct??''};
 saleForm.elements.product_id.addEventListener('change',setDefaultLabor);setDefaultLabor();
 saleForm.addEventListener('submit',async e=>{e.preventDefault();if(!confirm('فروش ثبت شود و موجودی کاهش یابد؟'))return;
  try{const data=Object.fromEntries(new FormData(saleForm));const r=await api('/api/sales',{method:'POST',body:JSON.stringify(data)});
  notice(`فروش شماره ${r.id} ثبت شد.`);await go('sales')}catch(err){loadError(err)}
 });
}
async function calculate(){
 const form=document.getElementById('sale-form');if(!form)return;
 const data=Object.fromEntries(new FormData(form));
 try{const q=await api('/api/quote',{method:'POST',body:JSON.stringify(data)});
 document.getElementById('quote-result').innerHTML=`<div class="divider"></div><div class="price-big"><label>قیمت نهایی محاسبه‌شده</label><strong>${rial(q.final_price)}</strong></div><div class="summary-lines">
 <div class="line"><span class="name">وزن کل</span><span>${number(q.total_weight,5)} گرم</span></div><div class="line"><span class="name">طلای خام</span><span>${rial(q.raw_price)}</span></div><div class="line"><span class="name">اجرت به طلا</span><span>${number(q.labor_gold,6)} گرم</span></div>${isManager()?`<div class="line"><span class="name">سود خالص</span><span>${rial(q.net_profit)}</span></div>`:''}</div>`;
 }catch(err){loadError(err)}
}
function renderReports(){
 const stockSum=products.reduce((a,p)=>a+p.available,0),sold=summary.sold_units,total=stockSum+sold;
 view.innerHTML=`<div class="section-head"><div><h2>گزارش مدیریتی</h2><p>ارقام ثبت‌شده، بدون نرخ‌سازی یا اطلاعات فرضی</p></div></div>
 <div class="metric-grid">${metric('ارزش بهای خرید موجودی',rial(summary.inventory_cost_rial),'براساس هزینه خرید')}${metric('فروش نهایی',rial(summary.sales_rial),'فقط اسناد فعال')}${metric('سود خالص فروش',rial(summary.profit_rial),'طبق منطق اکسل',true)}${metric('وزن موجود',number(summary.available_weight,4),'گرم')}</div>
 <div class="panel"><div class="section-head"><h2>نسبت فروش به کل واحدهای ثبت‌شده</h2><span>${total?number(sold/total*100,1):'۰'}٪</span></div>
 <div style="background:#353a30;border-radius:20px;height:13px;margin:24px 0 13px;overflow:hidden"><div style="height:100%;width:${total?Math.max(0,Math.min(100,sold/total*100)):0}%;background:#b5965b;border-radius:20px"></div></div>
 <p class="tiny muted">این نمودار نسبت تعداد واحدهای فروخته‌شده فعال به مجموع موجودی و فروش را نشان می‌دهد؛ ارزش روز بازار نیست.</p></div>`;
}
function renderExcel(){
 previewToken=null;
 view.innerHTML=`<div class="section-head"><div><h2>ورود و خروجی Excel</h2><p>ابتدا پیش‌نمایش تغییرات؛ سپس تأیید. هیچ رکوردی خودکار حذف نمی‌شود.</p></div>${button('دریافت اکسل به‌روز','export','','outline')}</div>
 <div class="panel"><form id="import-form" class="form"><div class="field"><label>فایل Haniel Invoice با فرمت XLSX</label><input type="file" class="input" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" name="file" required><small>حداکثر ۸ مگابایت؛ شیت‌های «موجودی» و «فروش» لازم هستند.</small></div>
 <div class="row-actions"><button class="btn" type="submit">بررسی تغییرات فایل</button>${button('دریافت اکسل','export','','ghost')}</div></form></div><div id="import-preview"></div>
 <div class="panel help"><b>نکات همگام‌سازی</b><p>در هر خروجی، کد ثابت محصول در ستون O شیت «موجودی» و شناسه فروش در ستون T شیت «فروش» درج می‌شود. این شناسه‌ها را پاک نکن؛ کمک می‌کنند یک فایل دوباره وارد شود، بدون فروش یا محصول تکراری.</p>
 <p>خروجی نسخه Cloudflare شامل شیت‌های «موجودی» و «فروش» است. شیت‌های «متعلقات»، «صندوق طلا» و «تأمین‌کننده» اکسل اصلی در این خروجی قرار ندارند؛ فایل اصلی خود را حتماً نگه دار. اطلاعات واردشده پیش از ثبت کنترل می‌شوند.</p></div>`;
 document.getElementById('import-form').addEventListener('submit',async e=>{
 e.preventDefault();const fd=new FormData(e.target);
 const file=fd.get('file');if(!file)return;
 if(file.size>8*1024*1024)return notice('فایل باید کمتر از ۸ مگابایت باشد.','error');
 const container=document.getElementById('import-preview');container.innerHTML='<div class="loading"><span class="loader"></span> در حال بررسی ساختار و مغایرت‌ها…</div>';
 try{const rows=await window.parseHanielXlsx(file);const p=await api('/api/import/preview',{method:'POST',body:JSON.stringify(rows)});previewToken=p.token;drawPreview(p)}catch(err){container.innerHTML='';loadError(err)}
 });
}
function drawPreview(p){
 const labels={products_new:'محصول جدید',products_updated:'محصول تغییریافته',products_unchanged:'محصول بدون تغییر',sales_new:'فروش جدید',sales_unchanged:'فروش بدون تغییر',sales_conflicts:'مغایرت فروش'};
 const bad=p.errors.length>0||p.conflicts.length>0;
 document.getElementById('import-preview').innerHTML=`<div class="panel form"><div class="section-head"><div><h2>پیش‌نمایش تغییرات</h2><p>تا تأیید نهایی هیچ تغییری در اطلاعات اعمال نشده است.</p></div><span class="pill ${bad?'zero':''}">${bad?'نیازمند بررسی':'آماده تأیید'}</span></div>
 <div class="import-result">${Object.entries(p.counts).map(([k,v])=>`<div class="part"><span>${labels[k]}</span><b>${number(v,0)}</b></div>`).join('')}</div>
 <div class="alert-list">${[...p.errors.map(v=>({v,err:true})),...p.conflicts.map(v=>({v,err:true})),...p.warnings.map(v=>({v,err:false}))].map(x=>`<div class="alert-item ${x.err?'error':''}">${esc(x.v)}</div>`).join('')}</div>
 ${p.change_examples.length?`<p class="tiny muted">نمونه تغییرات: ${p.change_examples.map(x=>`${esc(x.name)} (${x.kind==='new'?'جدید':'ویرایش'})`).join('، ')}</p>`:''}
 ${button('تأیید و اعمال تغییرات','commit','', '',bad?'disabled title="مغایرت‌ها باید رفع شوند"':'')}
 <p class="tiny muted">پیش‌نمایش پس از ۲۰ دقیقه منقضی می‌شود. اگر همکار دیگری اطلاعات را تغییر دهد، باید دوباره پیش‌نمایش بگیری.</p></div>`;
}
async function commitImport(){if(!previewToken)return;
 if(!confirm('تغییرات این فایل در دیتابیس اصلی ثبت شوند؟'))return;
 try{const r=await api('/api/import/commit',{method:'POST',body:JSON.stringify({token:previewToken})});previewToken=null;notice(`ورود فایل انجام شد: ${r.counts.products_new} محصول و ${r.counts.sales_new} فروش جدید.`);await go('dashboard')}
 catch(err){loadError(err)}
}
async function exportFile(){
 try{const data=await api('/api/export');const blob=await window.exportHanielXlsx(data),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='HANI-EL-GOLD-updated.xlsx';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);notice('اکسل به‌روز برای دریافت آماده شد.')}
 catch(err){loadError(err)}
}
async function renderTeam(){
 const users=await api('/api/users');
 view.innerHTML=`<div class="section-head"><div><h2>مدیریت دسترسی تیم</h2><p>شناسه عددی تلگرام کاربر را با اجازه خودش دریافت کن.</p></div>${button('+ افزودن همکار','addUser','','')}</div>
 ${users.length?`<div class="table-wrap"><table class="table"><thead><tr><th>شناسه تلگرام</th><th>نام</th><th>نقش</th><th>عملیات</th></tr></thead><tbody>${users.map(u=>`<tr><td class="mono">${esc(u.telegram_id)}</td><td>${esc(u.display_name)}</td><td><span class="badge-role">${esc(u.role)}</span></td><td>${u.role==='owner'?'مالک اصلی':button('ویرایش','editUser',u.telegram_id,'outline small')}</td></tr>`).join('')}</tbody></table></div>`:blank()}`;
 window._users=users;
}
function userForm(id){
 const u=(window._users||[]).find(x=>x.telegram_id===String(id));
 showModal(u?'تغییر نقش همکار':'افزودن همکار',`<form id="user-form" class="form">
 ${field('شناسه عددی حساب تلگرام','telegram_id',u?.telegram_id||'','text',`${u?'readonly':'required'} inputmode="numeric"`)}
 ${field('نام نمایشی','display_name',u?.display_name||'','text','required')}
 <div class="field"><label>سطح دسترسی</label><select name="role" class="select">${[['manager','مدیر'],['sales','فروشنده'],['viewer','مشاهده‌گر'],['disabled','مسدود']].map(([v,t])=>`<option value="${v}" ${u?.role===v?'selected':''}>${t}</option>`).join('')}</select></div>
 <p class="tiny muted">شناسه تلگرام با نام کاربری (@username) فرق دارد. فقط مالک می‌تواند نقش‌ها را تغییر دهد.</p><button class="btn" type="submit">ذخیره دسترسی</button></form>`);
 document.getElementById('user-form').addEventListener('submit',async e=>{
 e.preventDefault();try{await api('/api/users',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});
 closeModal();notice('دسترسی همکار به‌روز شد.');await go('team')}catch(err){loadError(err)}
 });
}
function renderHelp(){
 view.innerHTML=`<div class="panel help"><h2>راهنمای مدیریت HANI-EL GOLD</h2><p><b>۱. شروع کار:</b> مالک ابتدا Excel فعلی را از قسمت «اکسل» آپلود می‌کند، پیش‌نمایش را بررسی می‌کند و اعمال را تأیید می‌کند.</p>
 <p><b>۲. افزودن عکس:</b> در بخش محصولات وارد جزئیات شو و تصویر را آپلود کن. تصاویر در فضای خصوصی R2 ذخیره می‌شوند و در فایل Excel قرار نمی‌گیرند.</p>
 <p><b>۳. فروش:</b> در «محاسبه قیمت» محصول، تعداد، نرخ روز طلا، درصد اجرت فروش، درصد سود، متعلقات و تخفیف را وارد کن. پس از بررسی، فروش ثبت و موجودی کم می‌شود.</p>
 <p><b>۴. همکاران:</b> مالک با شناسه عددی تلگرام نقش مدیر، فروشنده یا مشاهده‌گر می‌دهد.</p>
 <p><b>۵. خروجی Excel:</b> از نسخه به‌روز فایل خروجی بگیر؛ این عملیات فایل اکسل قدیمی روی گوشی یا رایانه را خودکار تغییر نمی‌دهد.</p>
 <p><b>امنیت:</b> در محیط عملیاتی از HTTPS، بکاپ دیتابیس و کلید مخفی ربات نگهداری‌شده روی سرور استفاده کن. فایل مالی را در مخزن عمومی GitHub قرار نده.</p></div>`;
}
async function voidSale(id){
 const reason=prompt('علت ابطال این فروش را بنویس (حداقل ۵ حرف):');if(!reason)return;
 try{await api(`/api/sales/${id}/void`,{method:'POST',body:JSON.stringify({reason})});notice('فروش با سابقه ابطال شد و موجودی برگشت.');await go('sales')}catch(e){loadError(e)}
}
async function deletePhoto(id,productId){if(!confirm('این تصویر حذف شود؟'))return;
 try{await api(`/api/images/${id}`,{method:'DELETE'});photoCache.delete(String(id));closeModal();await go('products');await productDetail(productId);notice('تصویر حذف شد.')}
 catch(e){loadError(e)}
}
document.addEventListener('click',async e=>{
 const nav=e.target.closest('[data-nav]');if(nav){go(nav.dataset.nav);return}
 const action=e.target.closest('[data-action]');if(!action)return;
 const {action:a,id}=action.dataset;
 try{
  if(a==='nav'){closeModal();go(id)}
  if(a==='addProduct')productForm();
  if(a==='product')await productDetail(id);
  if(a==='editProduct'){closeModal();productForm(products.find(x=>x.id===Number(id)))}
  if(a==='quickSale'){closeModal();await go('quote');renderQuote(id)}
  if(a==='close')closeModal();
  if(a==='calculate')await calculate();
  if(a==='export')await exportFile();
  if(a==='commit')await commitImport();
  if(a==='addUser')userForm();
  if(a==='editUser')userForm(id);
  if(a==='voidSale')await voidSale(id);
  if(a==='deletePhoto')await deletePhoto(id,action.dataset.product);
 }catch(err){loadError(err)}
});
document.getElementById('close-modal').addEventListener('click',closeModal);
document.getElementById('refresh').addEventListener('click',()=>go(current));
(async()=>{try{session=await api('/api/session');menus();await go('dashboard')}catch(e){
 view.innerHTML=`<div class="empty"><div class="empty-symbol">♧</div><h3>ورود امن مورد نیاز است</h3><p>${esc(e.message)}</p><p>مینی‌اپ را از داخل ربات رسمی تلگرام باز کن؛ یا برای آزمایش محلی فرمان <span class="mono">cf dev</span> را اجرا کن.</p></div>`
 }})();
