import {verifyOwnerAccess} from './access.mjs';
import {bytes,validSourcePhoto,validRgbaPng,decodePngBase64} from './images.mjs';

const SKU=/^HG-[A-F0-9]{12}$/;
const TYPES=new Set(['earring','necklace','bracelet','ring']);
const NO_STORE={'cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',
 'content-security-policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"};
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{...NO_STORE,'content-type':'application/json; charset=utf-8'}});
const fail=(code,status)=>json({error:code},status);
const imageId=v=>Number.isSafeInteger(v)&&v>0;
const sameOrigin=req=>req.headers.get('origin')===new URL(req.url).origin;
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
function equals(a,b){if(!a||!b||a.length!==b.length)return false;let v=0;for(let i=0;i<a.length;i++)v|=a[i]^b[i];return v===0;}
async function hashReview(sku,a){
 const cut=bytes(a.cutout_blob),photo=bytes(a.source_blob);
 if(!validRgbaPng(cut)||a.cutout_mime!=='image/png'||!validSourcePhoto(photo,a.source_mime)||!TYPES.has(a.product_type))return null;
 const cutHash=hex(await crypto.subtle.digest('SHA-256',cut));
 const photoHash=hex(await crypto.subtle.digest('SHA-256',photo));
 return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(
  [sku,a.product_type,a.source_image_id,cutHash,photoHash].join('|'))));
}
const product=(db,sku)=>db.prepare('SELECT id,sku,name FROM products WHERE sku=? LIMIT 1').bind(sku).first();
async function photo(db,p,id){
 if(!imageId(id))return null;
 const r=await db.prepare('SELECT mime,image_blob FROM images WHERE id=? AND product_id=? LIMIT 1').bind(id,p.id).first();
 const b=bytes(r?.image_blob);return validSourcePhoto(b,r?.mime)?{blob:b,mime:r.mime}:null;
}
async function bodyJson(req){
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type')||''))return null;
 if(Number(req.headers.get('content-length')||0)>610000)return null;
 const t=await req.text();if(t.length>610000)return null;
 try{return JSON.parse(t);}catch{return null;}
}

export async function publishApi(req,env,{verify=verifyOwnerAccess}={}){
 const identity=await verify(req,env);
 if(!identity.ok)return fail('ACCESS_DENIED',403);
 if(!env.SOURCE_DB||!env.CATALOG_DB)return fail('DATABASE_NOT_CONFIGURED',503);
 const u=new URL(req.url),path=u.pathname,method=req.method;
 if(!['GET','PUT'].includes(method))return fail('NOT_FOUND',404);
 if(method==='PUT'&&!sameOrigin(req))return fail('INVALID_ORIGIN',403);

 if(path==='/admin/api/products'&&method==='GET'){
  try{
   const q=(u.searchParams.get('q')||'').trim().slice(0,60);
   const rows=(await env.SOURCE_DB.prepare(
    'SELECT sku,name FROM products WHERE sku LIKE ? OR name LIKE ? ORDER BY id DESC LIMIT 40'
   ).bind('%'+q+'%','%'+q+'%').all()).results||[];
   return json({items:rows.filter(r=>SKU.test(r.sku)).map(r=>({sku:r.sku,name:String(r.name||'').slice(0,120)}))});
  }catch{return fail('SOURCE_UNAVAILABLE',503);}
 }
 if(path==='/admin/api/catalog'&&method==='GET'){
  try{
   const rows=(await env.CATALOG_DB.prepare(
    'SELECT sku,name,product_type,approved,reviewed_at,source_image_id,updated_at FROM tryon_public_catalog ORDER BY updated_at DESC LIMIT 100'
   ).all()).results||[];
   return json({items:rows.map(r=>({sku:r.sku,name:r.name,productType:r.product_type,approved:r.approved===1,reviewedAt:r.reviewed_at,sourceImageId:r.source_image_id,updatedAt:r.updated_at}))});
  }catch{return fail('CATALOG_UNAVAILABLE',503);}
 }
 const list=path.match(/^\/admin\/api\/products\/(HG-[A-F0-9]{12})\/images$/);
 if(list&&method==='GET'){
  try{
   const p=await product(env.SOURCE_DB,list[1]);if(!p)return fail('PRODUCT_NOT_FOUND',404);
   const rows=(await env.SOURCE_DB.prepare('SELECT id,mime FROM images WHERE product_id=? ORDER BY id LIMIT 20').bind(p.id).all()).results||[];
   return json({images:rows.filter(r=>imageId(r.id)&&['image/png','image/jpeg','image/webp'].includes(r.mime))});
  }catch{return fail('SOURCE_UNAVAILABLE',503);}
 }
 const ref=path.match(/^\/admin\/api\/products\/(HG-[A-F0-9]{12})\/images\/([1-9][0-9]*)$/);
 if(ref&&method==='GET'){
  try{
   const p=await product(env.SOURCE_DB,ref[1]);if(!p)return fail('PRODUCT_NOT_FOUND',404);
   const img=await photo(env.SOURCE_DB,p,Number(ref[2]));if(!img)return fail('IMAGE_NOT_AVAILABLE',404);
   return new Response(img.blob,{headers:{...NO_STORE,'content-type':img.mime}});
  }catch{return fail('SOURCE_UNAVAILABLE',503);}
 }
 const preview=path.match(/^\/admin\/api\/catalog\/(HG-[A-F0-9]{12})\/(cutout|source-photo|review)$/);
 if(preview&&method==='GET'){
  try{
   const asset=await env.CATALOG_DB.prepare(
    'SELECT product_type,cutout_mime,cutout_blob,source_image_id,source_mime,source_blob FROM tryon_public_catalog WHERE sku=? LIMIT 1'
   ).bind(preview[1]).first();
   if(!asset)return fail('DRAFT_NOT_FOUND',404);
   if(preview[2]==='review'){
    const fingerprint=await hashReview(preview[1],asset);
    return fingerprint?json({sku:preview[1],fingerprint}):fail('REVIEW_NOT_READY',409);
   }
   const cut=preview[2]==='cutout',b=bytes(cut?asset.cutout_blob:asset.source_blob);
   const mime=cut?asset.cutout_mime:asset.source_mime;
   if(!(cut?(mime==='image/png'&&validRgbaPng(b)):validSourcePhoto(b,mime)))return fail('IMAGE_NOT_READY',404);
   return new Response(b,{headers:{...NO_STORE,'content-type':mime}});
  }catch{return fail('CATALOG_UNAVAILABLE',503);}
 }
 const item=path.match(/^\/admin\/api\/catalog\/(HG-[A-F0-9]{12})$/);
 if(item&&method==='PUT'){
  const data=await bodyJson(req);
  if(!data||typeof data!=='object'||Array.isArray(data))return fail('INVALID_JSON',400);
  const sku=item[1];
  try{
   const p=await product(env.SOURCE_DB,sku);if(!p)return fail('PRODUCT_NOT_FOUND',404);
   if(data.action==='draft'){
    if(!TYPES.has(data.productType)||!imageId(data.sourceImageId))return fail('INVALID_SELECTION',400);
    const cut=decodePngBase64(data.cutoutBase64);
    if(!cut)return fail('INVALID_RGBA_PNG',422);
    const source=await photo(env.SOURCE_DB,p,data.sourceImageId);
    if(!source)return fail('SOURCE_IMAGE_REQUIRED',422);
    await env.CATALOG_DB.prepare(
     'INSERT INTO tryon_public_catalog (sku,name,product_type,cutout_mime,cutout_blob,source_image_id,source_mime,source_blob,approved,reviewed_at,updated_at) '+
     'VALUES(?,?,?,?,?,?,?,?,0,NULL,CURRENT_TIMESTAMP) ON CONFLICT(sku) DO UPDATE SET '+
     'name=excluded.name,product_type=excluded.product_type,cutout_mime=excluded.cutout_mime,'+
     'cutout_blob=excluded.cutout_blob,source_image_id=excluded.source_image_id,'+
     'source_mime=excluded.source_mime,source_blob=excluded.source_blob,'+
     'approved=0,reviewed_at=NULL,updated_at=CURRENT_TIMESTAMP'
    ).bind(sku,String(p.name).slice(0,120),data.productType,'image/png',cut,data.sourceImageId,source.mime,source.blob).run();
    return json({sku,approved:false,state:'draft'});
   }
   if(data.action==='approve'){
    if(data.confirmSku!==sku||data.confirmVisualReview!==true||! /^[a-f0-9]{64}$/.test(data.confirmReviewHash||''))return fail('VISUAL_REVIEW_REQUIRED',400);
    const a=await env.CATALOG_DB.prepare(
     'SELECT product_type,cutout_mime,cutout_blob,source_image_id,source_mime,source_blob FROM tryon_public_catalog WHERE sku=? LIMIT 1'
    ).bind(sku).first();
    const hash=a?await hashReview(sku,a):null;
    if(!hash)return fail('ASSET_NOT_READY',409);
    if(hash!==data.confirmReviewHash)return fail('REVIEWED_ASSET_CHANGED',409);
    const now=await photo(env.SOURCE_DB,p,a.source_image_id);
    if(!now||now.mime!==a.source_mime||!equals(now.blob,bytes(a.source_blob)))return fail('SOURCE_CHANGED',409);
    // Compare-and-swap approval: a new draft replacing the reviewed media must NOT pass.
    const result=await env.CATALOG_DB.prepare(
     'UPDATE tryon_public_catalog SET approved=1,reviewed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP '+
     'WHERE sku=? AND approved=0 AND product_type=? AND source_image_id=? AND cutout_blob=? AND source_blob=?'
    ).bind(sku,a.product_type,a.source_image_id,bytes(a.cutout_blob),bytes(a.source_blob)).run();
    if((result.meta?.changes??result.changes)!==1)return fail('REVIEWED_ASSET_CHANGED',409);
    return json({sku,approved:true,state:'published'});
   }
   if(data.action==='revoke'){
    await env.CATALOG_DB.prepare(
     'UPDATE tryon_public_catalog SET approved=0,updated_at=CURRENT_TIMESTAMP WHERE sku=?'
    ).bind(sku).run();
    return json({sku,approved:false,state:'revoked'});
   }
   return fail('INVALID_ACTION',400);
  }catch{return fail('PUBLISH_FAILED',503);}
 }
 return fail('NOT_FOUND',404);
}
export default {
 async fetch(req,env){
  const pathname=new URL(req.url).pathname;
  if(req.method==='GET'&&['/admin','/','/index.html','/app.mjs','/styles.css'].includes(pathname)){
   const auth=await verifyOwnerAccess(req,env);
   if(!auth.ok)return fail('ACCESS_DENIED',403);
   if(!env.ASSETS)return fail('STATIC_UNAVAILABLE',503);
   const dest=(pathname==='/admin'||pathname==='/')?'/index.html':pathname;
   const res=await env.ASSETS.fetch(new Request(new URL(dest,req.url),req));
   const headers=new Headers(res.headers);
   headers.set('cache-control','private, no-store');
   headers.set('x-content-type-options','nosniff');
   headers.set('referrer-policy','no-referrer');
   headers.set('content-security-policy',"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
   return new Response(res.body,{status:res.status,headers});
  }
  return publishApi(req,env);
 }
};
