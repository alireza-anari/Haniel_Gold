import {containSize, defaultOverlay, mapPointer, faceAnchor, poseNeckAnchor, normalizeOverlay, clamp} from './geometry.mjs';
import {inspectAlphaMask, cutoutQualityMessage} from './asset-quality.mjs';

/** HANI-EL private V1 proof of concept. No customer photo network requests. */
const $ = (id) => document.getElementById(id);
const canvas = $('tryon-canvas');
const ctx = canvas.getContext('2d', {alpha:false});
const stage = $('canvas-wrap');
const status = $('status');
const controls = ['auto-place','reset','compare','download'];
const state = {photo:null,jewelry:null,overlay:null,baseWidth:0,baseHeight:0,initialWidth:0,compare:false,pointers:new Map(),moveStart:null,gestureStart:null,busy:false,assetQuality:null};

function message(text,error=false) {
  status.textContent=text;
  status.classList.toggle('error',error);
}
function updateControls() {
  const ready=!!(state.photo&&state.jewelry&&state.overlay&&!state.busy);
  controls.forEach(id=>$(id).disabled=!ready);
  $('preview-state').textContent=ready?'آماده تنظیم':state.busy?'در حال پردازش':'منتظر انتخاب دو تصویر';
}
function redraw() {
  if(!state.photo||!state.jewelry||!state.overlay)return;
  const {width,height}=canvas;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,width,height);
  ctx.drawImage(state.photo,0,0,width,height);
  if(state.compare)return;
  const o=state.overlay;
  ctx.save();
  ctx.translate(o.x,o.y);ctx.rotate(o.rotation*Math.PI/180);
  const shadowStrength=Number($('shadow-range').value)/100;
  ctx.shadowColor=`rgba(40,31,21,${(shadowStrength*.55).toFixed(3)})`;
  ctx.shadowBlur=Math.min(30,width*.012*shadowStrength*3);
  ctx.shadowOffsetY=Math.min(12,width*.006*shadowStrength*3);
  ctx.drawImage(state.jewelry,-o.width/2,-o.height/2,o.width,o.height);
  ctx.restore();
}
function syncSlider() {
  if(!state.overlay)return;
  $('size-range').value=Math.round(100*state.overlay.width/state.initialWidth);
  $('size-value').textContent=$('size-range').value+'٪';
  $('rotate-range').value=Math.round(state.overlay.rotation);
  $('rotate-value').textContent=$('rotate-range').value+'°';
  $('shadow-value').textContent=$('shadow-range').value+'٪';
}
function readyImages() {
  if(!state.photo||!state.jewelry){updateControls();return;}
  stage.classList.add('has-image');$('empty-canvas').hidden=true;
  const aspect=state.jewelry.width/state.jewelry.height;
  state.overlay=defaultOverlay($('product-type').value,canvas.width,canvas.height,aspect,$('ear-side').value);
  state.initialWidth=state.overlay.width;
  syncSlider();updateControls();redraw();
  message('تصاویر آماده‌اند. جای محصول را روی عکس اصلاح کن و پیش از تأیید، نتیجه را با محصول واقعی مقایسه کن.');
}
async function verifyFile(file, types, maxBytes) {
  if(!file || !types.includes(file.type) || file.size>maxBytes || file.size<100)throw Error('نوع یا حجم فایل نامعتبر است.');
  const head=new Uint8Array(await file.slice(0,16).arrayBuffer());
  const jpeg=head[0]===0xff&&head[1]===0xd8&&head[2]===0xff;
  const png=head.slice(0,8).every((b,i)=>b===[137,80,78,71,13,10,26,10][i]);
  const webp=head[0]===82&&head[1]===73&&head[2]===70&&head[3]===70&&head[8]===87&&head[9]===69&&head[10]===66&&head[11]===80;
  if(!((file.type==='image/jpeg'&&jpeg)||(file.type==='image/png'&&png)||(file.type==='image/webp'&&webp)))throw Error('امضای واقعی فایل تصویر معتبر نیست.');
}
async function decode(file) {
  if('createImageBitmap' in window)return createImageBitmap(file,{imageOrientation:'from-image'});
  const url=URL.createObjectURL(file);
  try {
    const image=new Image();image.src=url;
    await image.decode();
    return image;
  } finally {URL.revokeObjectURL(url);}
}
function release(img) {if(img?.close)img.close();}
function cropAlpha(image) {
  const {width,height}=containSize(image.width,image.height,2000);
  const buffer=document.createElement('canvas');buffer.width=width;buffer.height=height;
  const c=buffer.getContext('2d',{willReadFrequently:true});c.drawImage(image,0,0,width,height);
  const rgba=c.getImageData(0,0,width,height).data;
  const quality=inspectAlphaMask({width,height,data:rgba});
  if(!quality.ok)throw Error(cutoutQualityMessage(quality));
  const {x,y,width:boxWidth,height:boxHeight}=quality.bbox;
  const pad=5;const cx=Math.max(0,x-pad),cy=Math.max(0,y-pad);
  const cw=Math.min(width-cx,boxWidth+(x-cx)+pad),ch=Math.min(height-cy,boxHeight+(y-cy)+pad);
  const out=document.createElement('canvas');out.width=cw;out.height=ch;
  out.getContext('2d').drawImage(buffer,cx,cy,cw,ch,0,0,cw,ch);
  out.hanielQuality=quality;
  return out;
}
async function loadPhoto(file) {
  await verifyFile(file,['image/jpeg','image/png','image/webp'],12*1024*1024);
  const image=await decode(file);
  try {
    if(Math.min(image.width,image.height)<480)throw Error('وضوح عکس کم است؛ عکس با ضلع کوتاه حداقل ۴۸۰ پیکسل انتخاب کن.');
    if(image.width*image.height>45000000)throw Error('ابعاد این عکس برای پردازش روی گوشی بسیار بزرگ است.');
    const dim=containSize(image.width,image.height,1800);
    const pic=document.createElement('canvas');pic.width=dim.width;pic.height=dim.height;
    pic.getContext('2d',{alpha:false}).drawImage(image,0,0,dim.width,dim.height);
    state.photo=pic;canvas.width=dim.width;canvas.height=dim.height;
    $('photo-name').textContent=file.name.slice(0,18);
  } finally {release(image);}
}
async function loadJewelry(file) {
  await verifyFile(file,['image/png','image/webp'],8*1024*1024);
  const image=await decode(file);
  try {
    if(Math.min(image.width,image.height)<80)throw Error('وضوح تصویر محصول کافی نیست.');
    if(image.width*image.height>12000000)throw Error('ابعاد محصول بیش از حد بزرگ است.');
    const prepared=cropAlpha(image);
    state.jewelry=prepared;state.assetQuality=prepared.hanielQuality;
    $('jewelry-name').textContent=file.name.slice(0,18);
    const note=$('asset-quality');note.hidden=false;note.textContent=cutoutQualityMessage(state.assetQuality);
  } finally {release(image);}
}
async function fileChanged(kind,event) {
  const file=event.target.files?.[0];if(!file)return;
  state.busy=true;updateControls();message('در حال آماده‌سازی تصویر روی دستگاه شما…');
  try {if(kind==='photo')await loadPhoto(file);else await loadJewelry(file);readyImages();}
  catch(e){
    message(e.message||'بارگذاری عکس موفق نبود.',true);
    // Keep the previously valid customer image/product if replacement fails.
    if(!state.photo||!state.jewelry){stage.classList.remove('has-image');$('empty-canvas').hidden=false;}
  }
  finally {state.busy=false;updateControls();}
}
$('photo-file').addEventListener('change',e=>fileChanged('photo',e));
$('jewelry-file').addEventListener('change',e=>fileChanged('jewelry',e));
$('product-type').addEventListener('change',()=>{
  $('ear-side').closest('.field').hidden=$('product-type').value!=='earring';
  if(state.photo&&state.jewelry)readyImages();
});
$('product-type').dispatchEvent(new Event('change'));
$('ear-side').addEventListener('change',()=>{if(state.photo&&state.jewelry&&$('product-type').value==='earring')readyImages();});
$('size-range').addEventListener('input',e=>{
  if(!state.overlay)return;
  const ratio=state.jewelry.width/state.jewelry.height;
  state.overlay.width=state.initialWidth*Number(e.target.value)/100;
  state.overlay.height=state.overlay.width/ratio;
  $('size-value').textContent=e.target.value+'٪';redraw();
});
$('rotate-range').addEventListener('input',e=>{if(!state.overlay)return;state.overlay.rotation=Number(e.target.value);$('rotate-value').textContent=e.target.value+'°';redraw();});
$('shadow-range').addEventListener('input',e=>{$('shadow-value').textContent=e.target.value+'٪';redraw();});
$('reset').addEventListener('click',()=>readyImages());

canvas.addEventListener('pointerdown',e=>{
  if(!state.overlay)return;
  e.preventDefault();canvas.setPointerCapture(e.pointerId);
  const p=mapPointer(e.clientX,e.clientY,canvas.getBoundingClientRect(),canvas.width,canvas.height);
  state.pointers.set(e.pointerId,p);
  if(state.pointers.size===1){state.moveStart={pointer:p,x:state.overlay.x,y:state.overlay.y};canvas.classList.add('dragging');}
  if(state.pointers.size===2){
    const [a,b]=[...state.pointers.values()];
    state.gestureStart={distance:Math.hypot(a.x-b.x,a.y-b.y),width:state.overlay.width,rotation:state.overlay.rotation,angle:Math.atan2(b.y-a.y,b.x-a.x)};
  }
});
canvas.addEventListener('pointermove',e=>{
  if(!state.pointers.has(e.pointerId)||!state.overlay)return;
  const p=mapPointer(e.clientX,e.clientY,canvas.getBoundingClientRect(),canvas.width,canvas.height);
  state.pointers.set(e.pointerId,p);
  if(state.pointers.size===1&&state.moveStart){
    state.overlay.x=clamp(state.moveStart.x+p.x-state.moveStart.pointer.x,0,canvas.width);
    state.overlay.y=clamp(state.moveStart.y+p.y-state.moveStart.pointer.y,0,canvas.height);
  }else if(state.pointers.size===2&&state.gestureStart){
    const [a,b]=[...state.pointers.values()];
    const distance=Math.hypot(a.x-b.x,a.y-b.y);
    const ratio=state.jewelry.width/state.jewelry.height;
    state.overlay.width=clamp(state.gestureStart.width*distance/Math.max(1,state.gestureStart.distance),10,canvas.width*.95);
    state.overlay.height=state.overlay.width/ratio;
    const delta=(Math.atan2(b.y-a.y,b.x-a.x)-state.gestureStart.angle)*180/Math.PI;
    state.overlay.rotation=clamp(state.gestureStart.rotation+delta,-70,70);
    syncSlider();
  }
  redraw();
});
function stopPointer(e){state.pointers.delete(e.pointerId);if(state.pointers.size===0){state.moveStart=null;state.gestureStart=null;canvas.classList.remove('dragging');}
  else if(state.pointers.size===1){const p=[...state.pointers.values()][0];state.moveStart={pointer:p,x:state.overlay.x,y:state.overlay.y};state.gestureStart=null;}}
canvas.addEventListener('pointerup',stopPointer);canvas.addEventListener('pointercancel',stopPointer);
$('compare').addEventListener('pointerdown',()=>{state.compare=true;redraw();});
for(const event of ['pointerup','pointerleave','pointercancel'])$('compare').addEventListener(event,()=>{state.compare=false;redraw();});
$('compare').addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter'){state.compare=true;redraw();}});
$('compare').addEventListener('keyup',()=>{state.compare=false;redraw();});
$('download').addEventListener('click',async()=>{
  if(!state.photo||!state.jewelry)return;
  state.compare=false;redraw();
  try{
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('EXPORT_FAILED')),'image/png'));
    const file=new File([blob],'haniel-tryon-preview.png',{type:'image/png'});
    if(navigator.canShare?.({files:[file]})&&navigator.share){
      try{await navigator.share({files:[file],title:'پرو مجازی هانی‌ال'});message('تصویر برای ذخیره یا اشتراک‌گذاری آماده شد.');return;}
      catch(e){if(e.name==='AbortError')return;}
    }
    const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download='haniel-tryon-preview.png';
    document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
    message('دریافت تصویر آغاز شد. اگر مرورگر تلگرام آن را ذخیره نکرد، در مرورگر اصلی باز کن.');
  }catch{message('ذخیره تصویر موفق نبود؛ در مرورگر اصلی امتحان کن.',true);}
});

async function autoPlace(){
  if(!state.photo||!state.jewelry)return;
  const type=$('product-type').value;
  if(!['earring','necklace'].includes(type)){message('تشخیص خودکار برای این نوع محصول هنوز فعال نیست؛ از تنظیم دستی استفاده کن.',true);return;}
  state.busy=true;updateControls();message('در حال بارگیری مدل تشخیص و تحلیل تصویر روی دستگاه شما…');
  try{
    const sdk=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs');
    const vision=await sdk.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm');
    let anchor=null;
    if(type==='necklace'){
      const pose=await sdk.PoseLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',delegate:'CPU'},runningMode:'IMAGE',numPoses:2});
      try{const res=pose.detect(state.photo);if(res.landmarks?.length===1)anchor=poseNeckAnchor(res.landmarks[0],canvas.width,canvas.height);}
      finally{pose.close();}
    }
    if(!anchor){
      const detector=await sdk.FaceLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',delegate:'CPU'},runningMode:'IMAGE',numFaces:2});
      try{const res=detector.detect(state.photo);if(res.faceLandmarks?.length===1)anchor=faceAnchor(res.faceLandmarks[0],type,canvas.width,canvas.height,$('ear-side').value);}
      finally{detector.close();}
    }
    if(!anchor)throw Error('موقعیت واضح و یکتایی تشخیص داده نشد. عکس روشن‌تر و از روبه‌رو انتخاب کن.');
    const aspect=state.jewelry.width/state.jewelry.height;
    state.overlay=normalizeOverlay({...state.overlay,...anchor,height:anchor.width/aspect},canvas.width,canvas.height);
    state.initialWidth=state.overlay.width;
    syncSlider();redraw();message('موقعیت تخمینی پیدا شد. برای نتیجه بهتر، جای محصول را با دست اصلاح کن.');
  }catch(e){message(e.message?.includes('موقعیت')?e.message:'تشخیص خودکار در این دستگاه/شبکه در دسترس نیست. تنظیم دستی همچنان کار می‌کند.',true);}
  finally{state.busy=false;updateControls();}
}
$('auto-place').addEventListener('click',autoPlace);

async function startTelegram(){
  const tg=window.Telegram?.WebApp;
  try{tg?.ready();tg?.expand();}catch{}
  const raw=new URLSearchParams(location.search).get('tgWebAppStartParam')||new URLSearchParams(location.search).get('startapp')||tg?.initDataUnsafe?.start_param||'';
  if(!raw)return;
  const note=$('startapp-notice');note.hidden=false;
  if(!raw.startsWith('sku_')){note.textContent='لینک محصول معتبر نیست. برای آزمایش می‌توانی تصاویر را دستی انتخاب کنی.';return;}
  const slug=raw.slice(4);
  if(!/^[a-z0-9][a-z0-9_-]{1,79}$/i.test(slug)){note.textContent='شناسه محصول معتبر نیست.';return;}
  note.textContent='در حال دریافت محصول تأییدشده از کاتالوگ هانی‌ال…';
  const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),12000);
  try{
    // SKU is treated as untrusted input. Only the server may approve product and media.
    const res=await fetch('/api/v1/tryon/products/'+encodeURIComponent(slug),{credentials:'omit',cache:'no-store',signal:ctrl.signal});
    if(!res.ok)throw Error('SKU_NOT_APPROVED');
    const item=await res.json();
    if(item.slug!==slug||!['earring','necklace','bracelet','ring'].includes(item.productType)||
      !/^\/api\/v1\/media\/products\/[a-f0-9-]{36}\.(?:png|webp)$/.test(item.assetUrl))throw Error('INVALID_SKU_ASSET');
    const media=await fetch(item.assetUrl,{credentials:'omit',cache:'force-cache',signal:ctrl.signal});
    if(!media.ok)throw Error('IMAGE_NOT_READY');
    const blob=await media.blob();
    const mime=item.assetUrl.endsWith('.png')?'image/png':'image/webp';
    const file=new File([blob],slug+'.'+(mime==='image/png'?'png':'webp'),{type:mime});
    await loadJewelry(file);
    $('product-type').value=item.productType;
    $('product-type').dispatchEvent(new Event('change'));
    $('product-type').disabled=true;
    $('jewelry-file').disabled=true;
    document.querySelector('label[for="jewelry-file"]').hidden=true;
    const link=$('catalog-product-link');link.href='../#/product/'+encodeURIComponent(item.slug);link.hidden=false;
    note.textContent='محصول «'+String(item.name).slice(0,120)+'» از کاتالوگ تأییدشده بارگذاری شد. عکس خودت را انتخاب کن.';
    readyImages();
  }catch{
    note.textContent='این محصول هنوز برای پرو مجازی تأیید یا آماده نشده است. برای آزمایش داخلی می‌توانی تصویر محصول را دستی انتخاب کنی.';
  }finally{clearTimeout(timer);}
}
void startTelegram();updateControls();
window.addEventListener('pagehide',()=>{state.photo=null;state.jewelry=null;state.overlay=null;});
