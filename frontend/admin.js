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
 weightGrams:p.weightGrams,karat:p.karat,makingFeeBps:p.makingFeeBps,profitBps:p.profitBps,
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
 const urls=val(f,'images').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 const raw={slug:val(f,'slug'),name:val(f,'name'),categoryId:Number(val(f,'categoryId')),
 style:val(f,'style'),description:val(f,'description'),
 weightGrams:nullable(f,'weightGrams'),karat:nullable(f,'karat'),makingFeeBps:nullable(f,'makingFeeBps'),
 profitBps:nullable(f,'profitBps'),inventoryCount:nullable(f,'inventoryCount'),
 priceToman:nullable(f,'priceToman'),priceValidUntil:val(f,'priceValidUntil')?new Date(val(f,'priceValidUntil')).toISOString():null,
 published:field(f,'published').checked,images:urls};
 if(raw.published&&!raw.images.length){note('برای انتشار محصول باید تصویر واقعی آن ثبت شود.',true);return;}
 if(raw.priceToman&&!raw.priceValidUntil){note('برای قیمت تأییدشده زمان اعتبار تعیین کن.',true);return;}
 button.disabled=true;clearNote();
 try{
  await api(store.editing?'/admin/products/'+encodeURIComponent(store.editing):'/admin/products',{method:store.editing?'PATCH':'POST',data:raw});
  resetForm();await reload();note('اطلاعات محصول ذخیره شد.');
 }catch(x){note(x.message,true);}finally{button.disabled=false;}
}
async function submitCategory(e){
 e.preventDefault();const f=e.currentTarget,button=f.querySelector('button[type=submit]');
 button.disabled=true;
 try{await api('/admin/categories',{method:'POST',data:{slug:val(f,'slug'),title:val(f,'title')}});
 f.reset();await reload();note('دسته‌بندی جدید ثبت شد.');}
 catch(x){note(x.message,true);}finally{button.disabled=false;}
}
async function uploadImage(){
 const file=$('#photo-file').files?.[0],button=$('#upload-image');
 if(!file){note('ابتدا فایل تصویر را انتخاب کن.',true);return;}
 button.disabled=true;
 try{const data=new FormData();data.set('file',file);const out=await api('/admin/uploads',{method:'POST',upload:data});
  const target=field($('#product-form'),'images');target.value+=(target.value.trim()?'\n':'')+out.url;
  $('#photo-file').value='';note('تصویر در R2 بارگذاری شد. حالا محصول را ذخیره کن.');
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
