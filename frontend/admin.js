/* HANI-EL GOLD Cloudflare admin; all writes use same-origin credentials + CSRF. */
'use strict';
const $=s=>document.querySelector(s);
const store={csrf:'',products:[],categories:[],editing:null};
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
function resetForm(){
 const f=$('#product-form');f.reset();field(f,'slug').readOnly=false;store.editing=null;
 $('#edit-status').textContent='ثبت محصول جدید';clearNote();
}
function drawCategories(){
 const select=$('#category-select'),chosen=select.value;select.replaceChildren(make('option','یک دسته‌بندی انتخاب کن'));
 select.firstChild.value='';
 const chips=$('#category-list');chips.replaceChildren();
 for(const c of store.categories){
  const opt=make('option',c.title);opt.value=String(c.id);select.append(opt);
  chips.append(make('span',c.title,'chip'));
 }
 select.value=chosen||'';
}
function drawProducts(){
 const list=$('#product-list');list.replaceChildren();
 if(!store.products.length){list.append(make('p','هنوز محصولی ثبت نشده است.','muted'));return;}
 for(const p of store.products){
  const row=make('div',null,'catalogue-item'),name=make('div'),title=make('strong',p.name);
  const price=p.price?.amountToman?fa(p.price.amountToman)+' تومان':'قیمت معتبر ثبت نشده';
  name.append(title,make('small',(p.published?'منتشر شده':'پیش‌نویس')+' · '+price));
  const edit=make('button','ویرایش','text-button');edit.type='button';edit.addEventListener('click',()=>editProduct(p.id));
  row.append(name,edit);list.append(row);
 }
}
async function reload(){
 const [cats,products]=await Promise.all([api('/admin/categories'),api('/admin/products')]);
 store.categories=cats.items||[];store.products=products.items||[];drawCategories();drawProducts();
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
 $('#logout').addEventListener('click',logout);
 try{const session=await api('/admin/session');
  if(session.authenticated){store.csrf=session.csrfToken;view('#dashboard');await reload();}
  else view('#login-view');
 }catch(x){view(x.status===503?'#offline-view':'#login-view');note(x.message,true);}
}
document.addEventListener('DOMContentLoaded',boot);
