// HANI-EL GOLD — only on the private Access-protected publisher Worker.
const $=id=>document.getElementById(id);
const state={selected:null,imageId:null,cutout:null,items:[],reviewHash:null,reviewed:false};
let objectUrl=null;
function notice(s){$('notice').textContent=s;}
async function api(path,opts={}){
 const res=await fetch(path,{...opts,cache:'no-store',credentials:'same-origin'});
 if(!res.ok){let e='HTTP '+res.status;try{e=(await res.json()).error||e;}catch{}throw Error(e);}
 return res.json();
}
function put(sku,data){return api('/admin/api/catalog/'+encodeURIComponent(sku),{
 method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(data)
});}
function clearPhotoUrl(){if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}}
function button(label,handler){const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',handler);return b;}
function updateButtons(){
 $('draft').disabled=!(state.selected&&state.imageId&&state.cutout&&$('type').value);
 $('approve').disabled=!(state.selected&&state.reviewed&&state.reviewHash&&$('confirmVisual').checked&&$('confirmSku').value.trim().toUpperCase()===state.selected.sku);
 $('revoke').disabled=!state.selected;
}
async function loadCatalog(){
 try{
  const data=await api('/admin/api/catalog');const el=$('catalog');el.replaceChildren();
  state.items=data.items||[];
  for(const it of state.items){
   const b=button(it.name+' · '+(it.approved?'منتشرشده':it.reviewedAt?'غیرفعال':'پیش‌نویس'),()=>selectProduct(it));
   const label=document.createElement('small');label.textContent=it.sku;b.appendChild(label);el.appendChild(b);
  }
  if(!state.items.length)el.textContent='هنوز محصولی برای پرو ثبت نشده است.';
 }catch(e){$('catalog').textContent='دریافت وضعیت ممکن نیست.';notice(e.message);}
}
async function loadProducts(){
 try{
  const q=$('q').value.trim().slice(0,60);
  if(!q){notice('برای جلوگیری از نمایش تمام محصولات، ابتدا نام یا SKU را وارد کن.');return;}
  const {items}=await api('/admin/api/products?q='+encodeURIComponent(q));
  $('products').replaceChildren();
  for(const item of items){
   const b=button(item.name,()=>selectProduct(item));
   const id=document.createElement('small');id.textContent=item.sku;b.append(id);
   $('products').append(b);
  }
  if(!items.length)$('products').textContent='محصولی با این مشخصات پیدا نشد.';
 }catch(e){notice('خطای جستجوی محصول: '+e.message);}
}
async function showStored(sku){
 state.reviewHash=null;state.reviewed=false;
 const pairs=[['source-review','source-photo'],['cutout-review','cutout']];
 let all=true;
 for(const [id,kind] of pairs){
  const box=$(id);box.textContent='در حال بارگذاری تصویر ثبت‌شده…';
  const img=new Image();img.alt=kind==='cutout'?'برش شفاف':'تصویر مرجع';img.src='/admin/api/catalog/'+encodeURIComponent(sku)+'/'+kind;
  try{await img.decode();if(state.selected?.sku!==sku)return;box.replaceChildren(img);}
  catch{if(state.selected?.sku!==sku)return;box.textContent='تصویری برای بازبینی ثبت نشده است.';all=false;}
 }
 if(all&&state.selected?.sku===sku){
  try{
   const data=await api('/admin/api/catalog/'+encodeURIComponent(sku)+'/review');
   if(data.sku===sku&&/^[a-f0-9]{64}$/.test(data.fingerprint)){state.reviewHash=data.fingerprint;state.reviewed=true;}
  }catch(e){notice('هش بازبینی هنوز آماده نیست: '+e.message);}
 }
 updateButtons();
}
async function selectProduct(item){
 state.selected={sku:item.sku,name:item.name};state.imageId=item.sourceImageId||null;state.cutout=null;
 state.reviewHash=null;state.reviewed=false;clearPhotoUrl();
 $('selection').textContent=item.name+' — '+item.sku;
 $('confirmSku').value='';$('confirmVisual').checked=false;
 $('type').value=item.productType||'';$('cutout').value='';
 $('images').textContent='در حال بارگذاری تصاویر محصول…';
 $('cutout-preview').textContent='PNG شفاف محصول را انتخاب کن.';
 updateButtons();
 try{
  const {images}=await api('/admin/api/products/'+encodeURIComponent(item.sku)+'/images');
  const els=[];
  for(const image of images){
   const b=document.createElement('button');b.className='photo-card';b.type='button';
   const img=document.createElement('img');img.alt='تصویر مرجع محصول';
   img.src='/admin/api/products/'+encodeURIComponent(item.sku)+'/images/'+image.id;
   const lbl=document.createElement('small');lbl.textContent='تصویر '+image.id;
   b.append(img,lbl);
   if(state.imageId===image.id)b.classList.add('selected');
   b.addEventListener('click',()=>{
    state.imageId=image.id;
    $('images').querySelectorAll('button').forEach(el=>el.classList.remove('selected'));
    b.classList.add('selected');updateButtons();
   });
   els.push(b);
  }
  $('images').replaceChildren(...els);
  if(!images.length)$('images').textContent='برای این محصول تصویر قابل استفاده موجود نیست.';
 }catch(e){$('images').textContent='خواندن تصاویر ممکن نشد.';notice(e.message);}
 await showStored(item.sku);
}
function isTransparent(canvas){
 const data=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height).data;
 let transparent=0,opaque=0;
 for(let i=3;i<data.length;i+=48){if(data[i]<20)transparent++;if(data[i]>220)opaque++;}
 return transparent>8&&opaque>8;
}
async function inspect(file){
 if(!file||file.type!=='image/png'||file.size<100||file.size>400*1024)throw Error('فایل باید PNG شفاف، بین ۱۰۰ بایت تا ۴۰۰ کیلوبایت باشد.');
 const raw=new Uint8Array(await file.arrayBuffer());
 if(raw.length<33||raw[24]!==8||raw[25]!==6)throw Error('تصویر باید PNG با کانال آلفا (RGBA) باشد.');
 const image=await createImageBitmap(file);
 try{
  if(image.width<32||image.height<32||image.width>2048||image.height>2048)throw Error('ابعاد تصویر معتبر نیست.');
  const canvas=document.createElement('canvas');canvas.width=Math.min(400,image.width);canvas.height=Math.min(400,image.height);
  canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
  if(!isTransparent(canvas))throw Error('پس‌زمینه باید واقعاً شفاف و محصول قابل مشاهده باشد.');
 }finally{image.close();}
 return raw;
}
function toB64(raw){let out='';for(let i=0;i<raw.length;i+=8192)out+=String.fromCharCode(...raw.slice(i,i+8192));return btoa(out);}
$('search').addEventListener('click',loadProducts);
$('q').addEventListener('keydown',e=>{if(e.key==='Enter')loadProducts();});
$('type').addEventListener('change',updateButtons);
$('confirmVisual').addEventListener('change',updateButtons);
$('confirmSku').addEventListener('input',updateButtons);
$('cutout').addEventListener('change',async()=>{
 state.cutout=null;updateButtons();
 try{
  const file=$('cutout').files?.[0];if(!file)return;
  state.cutout=await inspect(file);clearPhotoUrl();objectUrl=URL.createObjectURL(file);
  const img=document.createElement('img');img.alt='تصویر شفاف محصول';img.src=objectUrl;
  $('cutout-preview').replaceChildren(img);
  notice('فایل PNG بررسی شد. انطباق دقیق آن با محصول همچنان باید دستی تأیید شود.');
 }catch(e){$('cutout-preview').textContent=e.message;notice(e.message);}updateButtons();
});
$('draft').addEventListener('click',async()=>{
 if($('draft').disabled||!state.selected)return;
 const sku=state.selected.sku;
 try{
  $('draft').disabled=true;
  await put(sku,{action:'draft',productType:$('type').value,sourceImageId:state.imageId,cutoutBase64:toB64(state.cutout)});
  $('confirmSku').value='';$('confirmVisual').checked=false;
  notice('پیش‌نویس ذخیره شد. این محصول هنوز عمومی نیست.');
  await loadCatalog();await showStored(sku);
 }catch(e){notice('ذخیره ناموفق بود: '+e.message);}finally{updateButtons();}
});
$('approve').addEventListener('click',async()=>{
 if($('approve').disabled||!state.selected)return;
 const sku=state.selected.sku;
 try{
  $('approve').disabled=true;
  const res=await put(sku,{action:'approve',confirmSku:sku,confirmVisualReview:true,confirmReviewHash:state.reviewHash});
  notice(res.approved?'انتشار کاتالوگ تأیید شد.':'تأیید ناموفق بود.');
  $('confirmVisual').checked=false;await loadCatalog();
 }catch(e){notice('انتشار ناموفق بود: '+e.message);}finally{updateButtons();}
});
$('revoke').addEventListener('click',async()=>{
 if(!state.selected||$('revoke').disabled)return;
 if(!confirm('انتشار محصول متوقف شود؟'))return;
 try{
  const sku=state.selected.sku;await put(sku,{action:'revoke'});
  $('confirmVisual').checked=false;notice('این محصول در کاتالوگ عمومی غیرفعال شد.');await loadCatalog();
 }catch(e){notice('لغو انتشار ناموفق بود: '+e.message);}finally{updateButtons();}
});
void loadCatalog();
