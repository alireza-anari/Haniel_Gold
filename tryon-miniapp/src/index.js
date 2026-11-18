/* Customer-facing Virtual Try-On. NO manager API, accounting records, or prod D1 binding.
 * The dedicated CATALOG_DB contains ONLY manually approved public product snapshots.
 * Customer photos are NEVER posted to this Worker. */
const SKU=/^HG-[A-F0-9]{12}$/;
const TYPES=new Set(['earring','necklace','bracelet','ring']);
const MIMES=new Set(['image/png','image/webp']);
const MAX_CUTOUT=400*1024;
const PRODUCT_MIMES=new Set(['image/jpeg','image/png','image/webp']);

function response(obj,status=200){
 return new Response(JSON.stringify(obj),{status,headers:{
  'content-type':'application/json; charset=utf-8','cache-control':'no-store',
  'x-content-type-options':'nosniff','referrer-policy':'no-referrer'
 }});
}
const missing=()=>response({error:'NOT_AVAILABLE'},404);
const bad=()=>response({error:'SERVICE_UNAVAILABLE'},503);
function bytes(data){
 if(data instanceof Uint8Array)return data;
 if(data instanceof ArrayBuffer)return new Uint8Array(data);
 if(Array.isArray(data))return Uint8Array.from(data);
 return null;
}
function isImage(data,mime){
 if(!data||!MIMES.has(mime)||data.length<32||data.length>MAX_CUTOUT)return false;
 if(mime==='image/png')return [137,80,78,71,13,10,26,10].every((n,i)=>data[i]===n);
 return [82,73,70,70].every((n,i)=>data[i]===n)&&[87,69,66,80].every((n,i)=>data[i+8]===n);
}
function isSourcePhoto(data,mime){
 if(!data||!PRODUCT_MIMES.has(mime)||data.length<16||data.length>MAX_CUTOUT)return false;
 if(mime==='image/png')return [137,80,78,71,13,10,26,10].every((v,i)=>data[i]===v);
 if(mime==='image/jpeg')return data[0]===255&&data[1]===216&&data[2]===255;
 return [82,73,70,70].every((v,i)=>data[i]===v)&&[87,69,66,80].every((v,i)=>data[i+8]===v);
}
function category(item){
 return item&&TYPES.has(item.product_type)&&MIMES.has(item.cutout_mime)&&item.approved===1&&item.reviewed_at;
}
export async function customerApi(req,env){
 const u=new URL(req.url), path=u.pathname;
 if(req.method!=='GET')return missing();
 if(path==='/api/health')return response({status:'ok',service:'haniel-tryon-public'});
 if(env.TRYON_PUBLIC_ENABLED!=='1'||!env.CATALOG_DB)return missing();
 const match=path.match(/^\/api\/v1\/(products|assets|photos)\/(HG-[A-Fa-f0-9]{12})$/);
 if(!match||!SKU.test(match[2].toUpperCase()))return missing();
 const sku=match[2].toUpperCase();
 try{
  // Important: NO JOIN to manager products, sales, images, users or finance tables.
  const row=await env.CATALOG_DB.prepare(
   'SELECT sku,name,product_type,cutout_mime,cutout_blob,source_mime,source_blob,approved,reviewed_at '+
   'FROM tryon_public_catalog WHERE sku=? AND approved=1 AND reviewed_at IS NOT NULL LIMIT 1'
  ).bind(sku).first();
  if(!category(row))return missing();
  if(match[1]==='products')return response({
   sku:row.sku,name:row.name,productType:row.product_type,
   assetUrl:'/api/v1/assets/'+encodeURIComponent(row.sku),
   ...(isSourcePhoto(bytes(row.source_blob),row.source_mime)?{photoUrl:'/api/v1/photos/'+encodeURIComponent(row.sku)}:{})
  });
  if(match[1]==='photos'){
   const photo=bytes(row.source_blob);
   if(!isSourcePhoto(photo,row.source_mime))return missing();
   return new Response(photo,{status:200,headers:{
    'content-type':row.source_mime,'cache-control':'no-store',
    'x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-disposition':'inline'
   }});
  }
  const cutout=bytes(row.cutout_blob);
  if(!isImage(cutout,row.cutout_mime))return missing();
  return new Response(cutout,{status:200,headers:{
   'content-type':row.cutout_mime,'cache-control':'no-store',
   'x-content-type-options':'nosniff','referrer-policy':'no-referrer',
   'content-disposition':'inline'
  }});
 }catch{return bad();}
}
export default {
 async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(path.startsWith('/api/'))return customerApi(request,env);
  return env.ASSETS.fetch(request);
 }
};
