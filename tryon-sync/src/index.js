/* Private one-way manager -> customer catalog sync.
 * Only whitelisted, owner-approved SKU and image_id selections are read.
 * The separate PUBLIC catalog is the ONLY DB accessible to customer Worker.
 * This Worker has no customer routes. Disabled by default. */
const SKU=/^HG-[A-F0-9]{12}$/;
const MAX_SYNC=100, MAX_BLOB=400*1024;
const bytes=v=>v instanceof Uint8Array?v:v instanceof ArrayBuffer?new Uint8Array(v):Array.isArray(v)?Uint8Array.from(v):null;
const isProductPhoto=(b,m)=>{
 if(!b||b.length<16||b.length>MAX_BLOB)return false;
 if(m==='image/png')return [137,80,78,71,13,10,26,10].every((x,i)=>b[i]===x);
 if(m==='image/jpeg')return b[0]===255&&b[1]===216&&b[2]===255;
 if(m==='image/webp')return b[0]===82&&b[1]===73&&b[2]===70&&b[3]===70&&b[8]===87&&b[9]===69&&b[10]===66&&b[11]===80;
 return false;
};
export async function syncApprovedNamesAndImages(sourceDb,catalogDb){
 const approved=(await catalogDb.prepare(
  'SELECT sku,source_image_id FROM tryon_public_catalog WHERE approved=1 ORDER BY sku LIMIT 100'
 ).all()).results||[];
 let updated=0,revoked=0,photos=0;
 for(const record of approved.slice(0,MAX_SYNC)){
  if(!SKU.test(String(record?.sku||'')))continue;
  const product=await sourceDb.prepare(
   'SELECT id,sku,name FROM products WHERE sku=? LIMIT 1'
  ).bind(record.sku).first();
  if(!product||typeof product.name!=='string'||!product.name.trim()){
   await catalogDb.prepare(
    'UPDATE tryon_public_catalog SET approved=0,reviewed_at=NULL,source_mime=NULL,source_blob=NULL,updated_at=CURRENT_TIMESTAMP WHERE sku=?'
   ).bind(record.sku).run();
   revoked++;
   continue;
  }
  let mime=null,blob=null;
  // This is an OWNER-SELECTED image id, not all private product photos.
  if(Number.isSafeInteger(record.source_image_id)&&record.source_image_id>0){
   const image=await sourceDb.prepare(
    'SELECT mime,image_blob FROM images WHERE id=? AND product_id=? LIMIT 1'
   ).bind(record.source_image_id,product.id).first();
   const candidate=bytes(image?.image_blob);
   if(isProductPhoto(candidate,image?.mime)){mime=image.mime;blob=candidate;photos++;}
  }
  await catalogDb.prepare(
   'UPDATE tryon_public_catalog SET name=?,source_mime=?,source_blob=?,updated_at=CURRENT_TIMESTAMP WHERE sku=? AND approved=1'
  ).bind(product.name.slice(0,130),mime,blob,record.sku).run();
  updated++;
 }
 return {updated,revoked,photos};
}
export default {
 async fetch(){return new Response('Not Found',{status:404,headers:{'cache-control':'no-store'}});},
 async scheduled(_event,env){
  if(env.SYNC_ENABLED!=='1'||!env.SOURCE_DB||!env.CATALOG_DB)return;
  await syncApprovedNamesAndImages(env.SOURCE_DB,env.CATALOG_DB);
 }
};
