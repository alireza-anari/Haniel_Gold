/* HANI-EL GOLD Cloudflare admin; all writes use same-origin credentials + CSRF. */
'use strict';
const $=s=>document.querySelector(s);
const store={csrf:'',products:[],categories:[],inquiries:null,editing:null,pricingReady:false,photoPreviewUrl:''};
const views=['#login-view','#offline-view','#dashboard'];
function view(id){for(const s of views)$(s).hidden=s!==id;}
function note(message,error=false){const n=$('#message');n.hidden=false;n.classList.toggle('error',error);n.textContent=message;n.scrollIntoView({block:'nearest',behavior:'smooth'});}
function clearNote(){$('#message').hidden=true;}
async function api(path,{method='GET',data,upload}={}){
 const h={Accept:'application/json'};
 if(!['GET','HEAD'].includes(method))h['X-Haniel-CSRF']=store.csrf;
 if(data!==undefined)h['Content-Type']='application/json';
 const r=await fetch('/api/v1'+path,{method,credentials:'same-origin',headers:h,body:upload|| (data!==undefined?JSON.stringify(data):undefined),cache:'no-store'});
 let o;try{o=await r.json();}catch{o={};}
 if(!r.ok){const e=new Error(o.error||('خطای ارتباط: '+r.status));e.status=r.status;throw e;}
 return o;
}
function make(tag,txt,cls){const el=document.createElement(tag);if(txt!=null)el.textContent=txt;if(cls)el.className=cls;return el;}
const fa=n=>Number(n).toLocaleString('fa-IR');
const field=(f,n)=>f.elements.namedItem(n);
const val=(f,n)=>field(f,n)?.value?.trim()||'';
const nullable=(f,n)=>val(f,n)===''?null:Number(val(f,n));
// UI displays human-friendly percentages; API persists integer basis points.
function percentToBps(f,name){
 const entered=val(f,name);
 if(entered==='')return null;
 const percent=Number(entered), scaled=percent*100, rounded=Math.round(scaled);
 if(!Number.isFinite(percent)||percent<0||percent>100||Math.abs(scaled-rounded)>1e-6)
  throw Error('درصد اجرت و سود باید بین صفر تا ۱۰۰ با حداکثر دو رقم اعشار باشد.');
 return rounded;
}
function clearPhotoPreview(){
 if(store.photoPreviewUrl){URL.revokeObjectURL(store.photoPreviewUrl);store.photoPreviewUrl='';}
 const file=$('#photo-file'),preview=$('#photo-preview'),image=$('#photo-preview-img');
 if(file)file.value='';
 if(image)image.removeAttribute('src');
 if(preview)preview.hidden=true;
 const name=$('#photo-preview-name'),size=$('#photo-preview-size');
 if(name)name.textContent='';
 if(size)size.textContent='';
}
function previewSelectedPhoto(){
 const file=$('#photo-file')?.files?.[0];
 const preview=$('#photo-preview'),image=$('#photo-preview-img');
 if(!file||!preview||!image){clearPhotoPreview();return;}
 if(store.photoPreviewUrl)URL.revokeObjectURL(store.photoPreviewUrl);
 store.photoPreviewUrl=URL.createObjectURL(file);
 image.src=store.photoPreviewUrl;
 $('#photo-preview-name').textContent=file.name;
 $('#photo-preview-size').textContent=fa(Math.max(1,Math.round(file.size/1024)))+' کیلوبایت';
 preview.hidden=false;
}
function updateDashboardStats(){
 const put=(selector,value)=>{const el=$(selector);if(el)el.textContent=value;};
 put('#stat-products',fa(store.products.length));
 put('#stat-published',fa(store.products.filter(p=>p.published).length));
 put('#stat-categories',fa(store.categories.length));
 put('#stat-inquiries',store.inquiries===null?'—':fa(store.inquiries.length));
}
function resetForm(){
 const f=$('#product-form');f.reset();field(f,'slug').readOnly=false;store.editing=null;
 clearPhotoPreview();
 $('#edit-status').textContent='ثبت محصول جدید';clearNote();
}
function drawCategories(){
 const select=$('#category-select'),chosen=select.value;select.replaceChildren(make('option','یک دسته‌بندی انتخاب کن'));
 select.firstChild.value='';
 const chips=$('#category-list');chips.replaceChildren();
 for(const c of store.categories){
  const opt=make('option',c.title);opt.value=String(c.id);select.append(opt);
  const row=make('div',null,'category-entry');
  const title=make('span',c.title,'chip');
  const edit=make('button','اصلاح نام','text-button');
  edit.type='button';edit.setAttribute('aria-label','اصلاح عنوان دسته‌بندی '+c.title);
  edit.addEventListener('click',()=>{
   const form=make('form',null,'category-edit-form');
   const input=make('input');input.type='text';input.value=c.title;input.maxLength=80;input.required=true;input.setAttribute('aria-label','عنوان صحیح دسته‌بندی');
   const save=make('button','ذخیره نام','secondary');save.type='submit';
   const cancel=make('button','انصراف','text-button');cancel.type='button';
   cancel.addEventListener('click',()=>form.replaceWith(title,edit));
   form.append(input,save,cancel);
   form.addEventListener('submit',async event=>{
    event.preventDefault();
    const value=input.value.trim();if(value.length<2){note('نام دسته‌بندی حداقل دو کاراکتر باشد.',true);return;}
    save.disabled=true;
    try{
     await api('/admin/categories/'+encodeURIComponent(c.slug),{method:'PATCH',data:{title:value}});
     await reload();note('عنوان دسته‌بندی اصلاح شد؛ محصولات همین دسته همچنان متصل می‌مانند.');
    }catch(error){note(error.message,true);save.disabled=false;}
   });
   row.replaceChildren(form);input.focus();input.select();
  });
  row.append(title,edit);chips.append(row);
 }
 select.value=chosen||'';
}
function drawProducts(){
 const list=$('#product-list'),count=$('#product-count');
 list.replaceChildren();
 const query=($('#product-search')?.value||'').trim().toLocaleLowerCase('fa-IR');
 const filter=$('#product-filter')?.value||'all';
 const visible=store.products.filter(p=>{
  if(filter==='published'&&!p.published)return false;
  if(filter==='draft'&&p.published)return false;
  if(!query)return true;
  const category=store.categories.find(c=>String(c.id)===String(p.categoryId));
  return [p.name,p.id,category?.title].filter(Boolean).join(' ').toLocaleLowerCase('fa-IR').includes(query);
 });
 if(count)count.textContent=fa(visible.length)+' مورد از '+fa(store.products.length)+' محصول';
 if(!store.products.length){
  list.append(make('p','هنوز محصولی ثبت نشده است. از فرم بالا اولین محصول را اضافه کن.','empty-state'));
  return;
 }
 if(!visible.length){
  list.append(make('p','محصولی با این جست‌وجو یا فیلتر پیدا نشد.','empty-state'));
  return;
 }
 for(const p of visible){
  const row=make('article',null,'catalogue-item'),name=make('div',null,'catalogue-item-details');
  const src=String(p.images?.[0]||'');
  let thumb;
  if((src.startsWith('/')&&!src.startsWith('//'))||/^https:\/\//i.test(src)){
   thumb=make('img',null,'catalogue-thumb');thumb.src=src;thumb.alt=p.name||'تصویر محصول';thumb.loading='lazy';thumb.decoding='async';
   thumb.addEventListener('error',()=>{const fallback=make('div','✧','catalogue-thumb-placeholder');fallback.setAttribute('aria-hidden','true');thumb.replaceWith(fallback);},{once:true});
  }else{
   thumb=make('div','✧','catalogue-thumb-placeholder');thumb.setAttribute('aria-hidden','true');
  }
  const title=make('strong',p.name);
  const status=make('span',p.published?'منتشرشده':'پیش‌نویس','status-pill '+(p.published?'is-live':'is-draft'));
  const category=store.categories.find(c=>String(c.id)===String(p.categoryId));
  const grams=p.weightGrams==null?'وزن ثبت نشده':fa(p.weightGrams)+' گرم';
  const making=p.makingFeeBps==null?'اجرت نامشخص':fa(p.makingFeeBps/100)+'٪ اجرت';
  const profit=p.profitBps==null?'سود نامشخص':fa(p.profitBps/100)+'٪ سود';
  const readiness=p.pricingReadiness||{productComplete:false,missing:[]};
  const auto=p.price?.source==='servix_18k'&&p.price?.validUntil&&Date.parse(p.price.validUntil)>Date.now();
  const manual=p.price?.source==='manual_staging'&&p.price?.validUntil&&Date.parse(p.price.validUntil)>Date.now();
  const price=auto?'قیمت خودکار: '+fa(p.price.amountToman)+' تومان'
   :manual?'مبلغ تأییدشده دستی: '+fa(p.price.amountToman)+' تومان'
   :readiness.missing?.length?'ناقص: '+readiness.missing.join('، ')
   :!store.pricingReady?'در انتظار نرخ معتبر و سیاست مالی تأییدشده':'قیمت معتبر در دسترس نیست';
  const meta=make('div',null,'catalogue-meta');meta.append(status);
  if(category)meta.append(make('small',category.title));
  name.append(title,meta,make('small',grams+' · '+making+' · '+profit),make('small',price,'pricing-readiness'));
  if(auto&&p.price.breakdown){
   const summary=make('details',null,'admin-price-breakdown');
   summary.append(make('summary','ریز محاسبه همین محصول'));
   const rows=[
    ['طلای خام',p.price.breakdown.rawGoldToman],
    ['اجرت همین محصول',p.price.breakdown.makingFeeToman],
    ['سود همین محصول',p.price.breakdown.profitToman],
    ['مالیات طبق سیاست تأییدشده',p.price.breakdown.taxToman]
   ];
   for(const [label,value] of rows)summary.append(make('p',label+' — '+fa(value)+' تومان'));
   name.append(summary);
  }
  const edit=make('button','ویرایش','secondary edit-product');edit.type='button';edit.addEventListener('click',()=>editProduct(p.id));
  row.append(thumb,name,edit);list.append(row);
 }
}
const inquiryStateLabels={
 submitted:'درخواست جدید',reviewing:'در حال استعلام',supplier_confirmed:'تأمین‌کننده بررسی شد',
 unavailable:'ناموجود',quote_prepared:'پیشنهاد آماده',quote_sent:'پیشنهاد ارسال شد',
 customer_declined:'انصراف مشتری',closed:'بسته شده'
};
const inquiryTransitions={
 submitted:['reviewing','unavailable','closed'],
 reviewing:['supplier_confirmed','unavailable','closed'],
 supplier_confirmed:['quote_prepared','unavailable','closed'],
 quote_prepared:['quote_sent','unavailable','closed'],
 quote_sent:['customer_declined','closed'],
 unavailable:['closed'],customer_declined:['closed'],closed:[]
};
async function refreshInquiries(){
 const target=$('#inquiry-list');if(!target)return;
 target.replaceChildren();
 try{
  const data=await api('/admin/inquiries'),items=data.items||[];
  store.inquiries=items;updateDashboardStats();
  if(!items.length){target.append(make('p','هنوز درخواست بررسی ثبت نشده است.','muted'));return;}
  for(const row of items){
   const card=make('article',null,'catalogue-item'),details=make('div',null,'catalogue-item-details');
   details.append(make('strong','درخواست '+row.id.slice(0,8)+' · '+(inquiryStateLabels[row.status]||row.status)),
    make('small',row.customer_name+' · '+row.customer_phone),
    make('small',new Intl.DateTimeFormat('fa-IR',{timeZone:'Asia/Tehran',dateStyle:'medium',timeStyle:'short'}).format(new Date(row.created_at))));
   for(const p of row.items||[])details.append(make('p',p.name+' · '+fa(p.quantity)+' عدد · قیمت زمان درخواست: '+
    (p.indicativeUnitToman==null?'نامعتبر / در انتظار بررسی':fa(p.indicativeUnitToman)+' تومان')));
   if(row.indicative_total_toman!=null)details.append(make('small','جمع تقریبی هنگام درخواست: '+fa(row.indicative_total_toman)+' تومان (غیرقطعی)'));
   if(row.admin_note)details.append(make('small','یادداشت مدیریت: '+row.admin_note));
   const next=inquiryTransitions[row.status]||[];
   if(next.length){
    const controls=make('div',null,'request-controls'),select=make('select');select.setAttribute('aria-label','وضعیت بعدی');
    for(const code of next){const option=make('option',inquiryStateLabels[code]||code);option.value=code;select.append(option);}
    const input=make('input');input.placeholder='یادداشت کوتاه مدیر';input.maxLength=500;input.setAttribute('aria-label','یادداشت بررسی');
    const button=make('button','ثبت وضعیت','secondary');button.type='button';
    button.addEventListener('click',async()=>{
     if(!confirm('تغییر وضعیت درخواست را تأیید می‌کنی؟'))return;
     button.disabled=true;
     try{
      await api('/admin/inquiries/'+row.id+'/status',{method:'PATCH',data:{status:select.value,note:input.value}});
      await refreshInquiries();note('وضعیت استعلام به‌روزرسانی شد. تغییر وضعیت به معنی پرداخت یا تأمین قطعی نیست.');
     }catch(e){note(e.message,true);button.disabled=false;}
    });
    controls.append(select,input,button);details.append(controls);
   }
   card.append(details);target.append(card);
  }
 }catch(err){store.inquiries=null;updateDashboardStats();target.append(make('p','بخش درخواست‌ها هنوز آماده نیست: '+err.message,'empty-state'));}
}
async function reload(){
 const [cats,products]=await Promise.all([api('/admin/categories'),api('/admin/products')]);
 store.categories=cats.items||[];store.products=products.items||[];store.pricingReady=products.marketAndPolicyReady===true;drawCategories();drawProducts();
 await refreshMarket();
 await refreshInquiries();
}
function editProduct(id){
 const p=store.products.find(x=>x.id===id);if(!p)return;
 const f=$('#product-form');resetForm();store.editing=id;
 const values={slug:p.id,name:p.name,categoryId:p.categoryId,style:p.style||'مینیمال',description:p.description||'',
 weightGrams:p.weightGrams,karat:p.karat,makingFeeBps:p.makingFeeBps==null?null:p.makingFeeBps/100,profitBps:p.profitBps==null?null:p.profitBps/100,
 inventoryCount:p.inventoryCount,images:(p.images||[]).join('\n')};
 for(const [k,v] of Object.entries(values))if(field(f,k))field(f,k).value=v==null?'':v;
 field(f,'published').checked=!!p.published;
 field(f,'slug').readOnly=true;
 // Never silently reconfirm expired or previously approved prices.
 field(f,'priceToman').value='';field(f,'priceValidUntil').value='';
 $('#edit-status').textContent='در حال ویرایش · '+p.id;
 window.scrollTo({top:0,behavior:'smooth'});
 note('ویرایش محصول انتخاب شد. در صورت نیاز، قیمت معتبر را دوباره تأیید کن.');
}
async function submitProduct(e){
 e.preventDefault();const f=e.currentTarget,button=f.querySelector('button[type=submit]');
 button.disabled=true;clearNote();
 try{
  // Validate monetary inputs before spending a KV upload.
  const makingFeeBps=percentToBps(f,'makingFeeBps');
  const profitBps=percentToBps(f,'profitBps');
  const published=field(f,'published').checked;
  const priceToman=nullable(f,'priceToman');
  const priceValidUntil=val(f,'priceValidUntil')?new Date(val(f,'priceValidUntil')).toISOString():null;
  if(priceToman!=null&&!priceValidUntil)throw Error('برای قیمت تأییدشده زمان اعتبار تعیین کن.');
  if(published&&!val(f,'images')&&!$('#photo-file').files?.length)
   throw Error('برای انتشار محصول تصویر واقعی انتخاب یا آپلود کن.');
  // A selected picture is automatically uploaded before saving the product.
  if($('#photo-file').files?.length){
   note('عکس انتخاب‌شده در حال آپلود به Cloudflare است…');
   await storeSelectedPhoto();
  }
  const images=val(f,'images').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(published&&!images.length)throw Error('برای انتشار محصول باید تصویر واقعی ثبت شود.');
  const raw={slug:val(f,'slug'),name:val(f,'name'),categoryId:Number(val(f,'categoryId')),
   style:val(f,'style'),description:val(f,'description'),
   weightGrams:nullable(f,'weightGrams'),karat:nullable(f,'karat'),makingFeeBps,profitBps,
   inventoryCount:nullable(f,'inventoryCount'),priceToman,priceValidUntil,published,images};
  await api(store.editing?'/admin/products/'+encodeURIComponent(store.editing):'/admin/products',{method:store.editing?'PATCH':'POST',data:raw});
  resetForm();await reload();note('محصول با موفقیت ذخیره شد؛ می‌توانی آن را در پیش‌نمایش D1 بررسی کنی.');
 }catch(x){note(x.message,true);}finally{button.disabled=false;}
}
async function submitCategory(e){
 e.preventDefault();const f=e.currentTarget,button=f.querySelector('button[type=submit]');
 button.disabled=true;
 try{await api('/admin/categories',{method:'POST',data:{slug:val(f,'slug'),title:val(f,'title')}});
 f.reset();await reload();note('دسته‌بندی جدید ثبت شد.');}
 catch(x){note(x.message,true);}finally{button.disabled=false;}
}
// Keep product close-ups crisp while staying well within Workers KV's free storage.
async function prepareProductPhoto(file){
 if(!/^image\/(jpeg|png|webp)$/.test(file.type))throw Error('فرمت تصویر باید JPG، PNG یا WebP باشد.');
 if(file.size>16*1024*1024)throw Error('تصویر اصلی بیش از حد بزرگ است؛ نسخه کم‌حجم انتخاب کن.');
 const limit=1500*1024;
 if(file.size<=limit)return file;
 let bitmap;
 try{bitmap=await createImageBitmap(file);}catch{throw Error('فایل تصویر در مرورگر قابل خواندن نیست.');}
 try{
  for(const [longEdge,quality] of [[2200,.88],[1900,.83],[1600,.78]]){
   const ratio=Math.min(1,longEdge/Math.max(bitmap.width,bitmap.height));
   const canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(bitmap.width*ratio));
   canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
   const context=canvas.getContext('2d');
   if(!context)throw Error('پردازش تصویر روی این دستگاه ممکن نیست.');
   context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
   context.drawImage(bitmap,0,0,canvas.width,canvas.height);
   const out=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));
   if(out&&out.type==='image/webp'&&out.size>=20&&out.size<=limit)
    return new File([out],(file.name||'product').replace(/\.[^.]+$/,'')+'.webp',{type:'image/webp'});
  }
  throw Error('حجم عکس برای فضای رایگان زیاد است؛ ابتدا تصویر را به WebP کوچک‌تر تبدیل کن.');
 }finally{bitmap.close?.();}
}
// Returns URL and updates the image list; can be used by save or the explicit upload button.
async function storeSelectedPhoto(){
 const file=$('#photo-file').files?.[0];
 if(!file)throw Error('ابتدا فایل تصویر را انتخاب کن.');
 const prepared=await prepareProductPhoto(file);
 const data=new FormData();data.set('file',prepared);
 const out=await api('/admin/uploads',{method:'POST',upload:data});
 if(!out.url||typeof out.url!=='string')throw Error('آدرس تصویر پس از آپلود دریافت نشد.');
 const target=field($('#product-form'),'images');
 target.value+=(target.value.trim()?'\n':'')+out.url;
 $('#photo-file').value='';
 return out.url;
}
async function uploadImage(){
 const button=$('#upload-image');
 if(!$('#photo-file').files?.length){note('ابتدا فایل تصویر را انتخاب کن.',true);return;}
 button.disabled=true;
 try{
  note('در حال آماده‌سازی و آپلود تصویر محصول…');
  await storeSelectedPhoto();
  note('تصویر آپلود شد و آدرس آن در فرم قرار گرفت. حالا می‌توانی محصول را ذخیره کنی.');
 }catch(x){note(x.message,true);}finally{button.disabled=false;}
}
// Never permit manual acceptance of missing, future-dated or expired gold observations.
function pendingRateIsStale(iso,now=Date.now()){
 const at=typeof iso==='string'&&iso?Date.parse(iso):NaN;
 const age=now-at;
 return !Number.isFinite(at)||age>40*60_000||age< -120_000;
}
async function refreshMarket(){
 const headline=$('#market-status'),detail=$('#market-detail'),approve=$('#approve-gold'),pending=$('#market-pending-note'),statusBox=$('.market-status-box');
 if(!headline)return;
 try{
  const data=await api('/admin/market'),m=data.market,p=data.policy;
  if(statusBox){statusBox.classList.remove('is-ready','is-pending','is-offline');statusBox.classList.add(m.status==='ready'?'is-ready':m.status==='blocked'?'is-pending':'is-offline');}
  headline.textContent=m.status==='ready'?'نرخ تأییدشده موقتاً معتبر است':m.status==='blocked'?'نرخ جدید منتظر بررسی مدیر است':'نرخ معتبر در دسترس نیست';
  const rate=m.rateTomanPerGram==null?'—':fa(m.rateTomanPerGram)+' تومان / گرم ۱۸ عیار';
  const proposed=m.pendingTomanPerGram==null?'—':fa(m.pendingTomanPerGram)+' تومان / گرم ۱۸ عیار';
  const tehranTime=iso=>{
   if(!iso||!Number.isFinite(Date.parse(iso)))return 'نامشخص';
   return new Intl.DateTimeFormat('fa-IR',{timeZone:'Asia/Tehran',dateStyle:'medium',timeStyle:'short'}).format(new Date(iso));
  };
  const pendingExpired=pendingRateIsStale(m.pendingObservedAt);
  const hasPending=m.pendingTomanPerGram!=null;
  detail.textContent='آخرین نرخ تأییدشده: '+rate+' | اعتبار تا (تهران): '+tehranTime(m.validUntil)+
   ' | نرخ در انتظار بررسی: '+proposed+' | زمان ثبت منبع (تهران): '+tehranTime(m.pendingObservedAt)+
   ' | سیاست مالی: '+(p.approved?'تأیید شده':'هنوز تأیید نشده');
  // Last provider error is stored in D1 and exposed only to the authenticated owner.
  // Keep the error code descriptive without exposing API keys or market quote payloads.
  const errorPanel=$('#market-sync-error');
  const code=typeof m.lastError==='string'&&/^[A-Z_]{3,32}$/.test(m.lastError)?m.lastError:'';
  const errorHints={
   AUTH:'کلید یا سطح دسترسی Servix در همین Worker را بررسی کن.',
   NOT_CONFIGURED:'Secret با نام SERVIX_API_KEY روی Worker تعریف نشده است.',
   NETWORK:'ارتباط Worker با Servix برقرار نشده است.',
   PROVIDER:'سرویکس پاسخ HTTP موفق برنگردانده است؛ دسترسی یا وضعیت سرویس را بررسی کن.',
   QUOTA:'سهمیه API به پایان رسیده است؛ درخواست‌ها باید متوقف بمانند.',
   STALE_SOURCE:'زمان ثبت نرخ Servix قدیمی است؛ از نرخ قدیمی برای فروش استفاده نمی‌شود.',
   BAD_TIME:'زمان businessTime پاسخ Servix معتبر یا کامل نیست.',
   BAD_AMOUNT:'قالب value از منبع با عدد ریالی قابل‌خواندن سازگار نیست. مقدار یا واحد را حدس نزن.',
   MISSING_VALUE:'منبع Servix مقدار value را خالی یا null فرستاده است؛ قیمت جایگزین ساخته نمی‌شود.',
   BAD_SHAPE:'ساختار پاسخ Servix مطابق قرارداد مورد انتظار نیست.',
   WRONG_UNIT:'کد نماد یا واحد quoteUnit با طلای ۱۸ عیار ریالی مطابقت ندارد.',
   INVALID_JSON:'پاسخ API، JSON معتبر نیست.',
   TOO_LARGE:'حجم پاسخ Servix از سقف تعیین‌شده بیشتر است.'
  };
  if(errorPanel){
   errorPanel.hidden=!code;
   errorPanel.textContent=code?'آخرین خطای دریافت نرخ: '+code+' — '+
    (errorHints[code]||'علت دقیق را در بخش دریافت نرخ بررسی کن.')+
    ' | آخرین تلاش (تهران): '+tehranTime(m.lastAttemptAt):'';
  }
  approve.hidden=!hasPending;
  approve.disabled=hasPending&&pendingExpired;
  pending.hidden=!hasPending;
  if(hasPending){
   pending.textContent=pendingExpired
    ?'زمان نرخ پیشنهادی منقضی شده یا مشخص نیست. آن را تأیید نکن؛ پس از پایان فاصله مجاز، نرخ جدید بگیر.'
    :'نرخ پیشنهادی هنوز تأیید نشده است. مبلغ و زمان ثبت آن را با منبع مستقل مقایسه کن و فقط پس از اطمینان تأیید کن.';
  }
  const form=$('#pricing-policy-form');
  if(form && document.activeElement?.closest('#pricing-policy-form')!==form){
   if(p.approved){
    field(form,'taxPercent').value=p.taxPercent??'';
    field(form,'maxRateChangePercent').value=p.maxRateChangePercent??'';
   }
  }
 }catch(e){
  if(statusBox){statusBox.classList.remove('is-ready','is-pending');statusBox.classList.add('is-offline');}
  headline.textContent='بخش نرخ هنوز فعال نشده است.';
  detail.textContent=e.message||'پس از اجرای SQL و اتصال کلید Servix فعال می‌شود.';
  const errorPanel=$('#market-sync-error');if(errorPanel)errorPanel.hidden=true;
  approve.hidden=true;pending.hidden=true;
 }
}
async function syncGold(){
 const button=$('#sync-gold');button.disabled=true;
 try{
  const x=await api('/admin/market/sync',{method:'POST'});
  note(x.message||'وضعیت دریافت نرخ ثبت شد.');
  await refreshMarket();
 }catch(e){note(e.message,true);}finally{button.disabled=false;}
}
async function approveGold(){
 if(!confirm('آیا نرخ پیشنهادی را با منبع معتبر و زمان مشاهده آن مقایسه و تأیید کرده‌ای؟'))return;
 const button=$('#approve-gold');button.disabled=true;
 try{
  const x=await api('/admin/market/approve',{method:'POST',data:{confirmReviewed:true}});
  note(x.message||'نرخ تأیید شد.');await refreshMarket();
 }catch(e){note(e.message,true);}finally{button.disabled=false;}
}
async function savePricingPolicy(e){
 e.preventDefault();const f=e.currentTarget,button=f.querySelector('button[type=submit]');
 if(!field(f,'confirmReviewed').checked){note('تأیید صریح سیاست لازم است.',true);return;}
 button.disabled=true;
 try{
  const x=await api('/admin/market/policy',{method:'POST',data:{
   taxPercent:val(f,'taxPercent'),maxRateChangePercent:val(f,'maxRateChangePercent'),
   taxBasis:'fee_profit',confirmReviewed:true
  }});
  note(x.message||'سیاست مالی ثبت شد.');await refreshMarket();
 }catch(e){note(e.message,true);}finally{button.disabled=false;}
}
async function login(e){
 e.preventDefault();const f=e.currentTarget,button=f.querySelector('button[type=submit]');
 button.disabled=true;try{
  const o=await api('/admin/login',{method:'POST',data:{username:val(f,'username'),password:val(f,'password')}});
  store.csrf=o.csrfToken;field(f,'password').value='';view('#dashboard');await reload();clearNote();
 }catch(x){note(x.message,true);}finally{button.disabled=false;}
}
async function logout(){
 try{await api('/admin/logout',{method:'POST'});}catch(x){note(x.message,true);return;}
 store.csrf='';store.products=[];view('#login-view');note('از پنل خارج شدی.');
}
async function boot(){
 $('#login-form').addEventListener('submit',login);
 $('#product-form').addEventListener('submit',submitProduct);
 $('#category-form').addEventListener('submit',submitCategory);
 $('#reset-product').addEventListener('click',resetForm);
 $('#refresh').addEventListener('click',async()=>{try{await reload();note('محصولات به‌روزرسانی شدند.');}catch(x){note(x.message,true);}});
 $('#upload-image').addEventListener('click',uploadImage);
 $('#refresh-inquiries').addEventListener('click',refreshInquiries);
 $('#logout').addEventListener('click',logout);
 $('#sync-gold').addEventListener('click',syncGold);
 $('#approve-gold').addEventListener('click',approveGold);
 $('#pricing-policy-form').addEventListener('submit',savePricingPolicy);
 try{const session=await api('/admin/session');
  if(session.authenticated){store.csrf=session.csrfToken;view('#dashboard');await reload();}
  else view('#login-view');
 }catch(x){view(x.status===503?'#offline-view':'#login-view');note(x.message,true);}
}
document.addEventListener('DOMContentLoaded',boot);
