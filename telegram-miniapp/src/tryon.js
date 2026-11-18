/* HANI-EL GOLD — independent, fail-closed Telegram manager D1 try-on API.
 * No customer portraits, purchase costs, sales or supplier data are transmitted.
 * This module targets telegram-miniapp/db/schema.sql (products.id), not the
 * separate and inactive storefront products.slug schema. */
const MIME = new Set(['image/png','image/webp']);
const TYPES = new Set(['earring','necklace','bracelet','ring']);
const MAX_IMAGE_BYTES = 400 * 1024;
const validSku = v => typeof v === 'string' && /^HG-[A-Z0-9_-]{4,60}$/i.test(v);
const json = (value,status=200) => new Response(JSON.stringify(value),{
  status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff'}
});
const notFound = () => json({error:'NOT_FOUND'},404);
const bytesOf = value => value instanceof Uint8Array ? value : value instanceof ArrayBuffer ?
  new Uint8Array(value) : Array.isArray(value) ? Uint8Array.from(value) : null;
const imageMagic = (b,mime) => {
  if(!b || b.length < 32 || b.length > MAX_IMAGE_BYTES || !MIME.has(mime)) return false;
  if(mime==='image/png')return [137,80,78,71,13,10,26,10].every((x,i)=>b[i]===x);
  return b[0]===82&&b[1]===73&&b[2]===70&&b[3]===70&&b[8]===87&&b[9]===69&&b[10]===66&&b[11]===80;
};
async function approved(db,sku,includeBlob=false){
  const cols = includeBlob ? 'a.cutout_blob' : 'NULL AS cutout_blob';
  return db.prepare('SELECT p.sku,p.name,a.product_type,a.cutout_mime,'+cols+
    ' FROM products p JOIN tryon_assets a ON a.product_id=p.id WHERE p.sku=? AND a.approved=1 AND a.reviewed_at IS NOT NULL AND a.cutout_blob IS NOT NULL LIMIT 1')
    .bind(sku).first();
}
export async function tryonPublic(req,env,path){
  // Explicit opt-in is essential: deploying manager changes must not expose products.
  if(req.method!=='GET'||env.TRYON_PUBLIC_ENABLED!=='1')return notFound();
  const match=path.match(/^\/api\/tryon\/(products|cutouts)\/([^/]+)$/);
  if(!match||!validSku(match[2]))return notFound();
  if(!env.DB)return json({error:'TRYON_UNAVAILABLE'},503);
  try{
    const blobRequested=match[1]==='cutouts';
    const row=await approved(env.DB,match[2],blobRequested);
    if(!row||!TYPES.has(row.product_type)||!MIME.has(row.cutout_mime))return notFound();
    if(!blobRequested)return json({
      sku:row.sku,name:row.name,productType:row.product_type,
      assetUrl:'/api/tryon/cutouts/'+encodeURIComponent(row.sku),
      status:'approved'
    });
    const bytes=bytesOf(row.cutout_blob);
    if(!bytes||!imageMagic(bytes,row.cutout_mime))return notFound();
    return new Response(bytes,{status:200,headers:{
      'content-type':row.cutout_mime,'cache-control':'private, no-store',
      'x-content-type-options':'nosniff','content-disposition':'inline'
    }});
  }catch{return json({error:'TRYON_UNAVAILABLE'},503);}
}
async function readLimitedJson(req,max=620000){
  const length=Number(req.headers.get('content-length')||0);
  if(length>max)return null;
  const text=await req.text();
  if(text.length>max)return null;
  try{return JSON.parse(text);}catch{return null;}
}
function fromBase64(v){
  if(typeof v!=='string'||v.length<44||v.length>Math.ceil(MAX_IMAGE_BYTES/3)*4+4||
     !/^[A-Za-z0-9+/]+={0,2}$/.test(v)||v.length%4!==0)return null;
  try{return Uint8Array.from(atob(v),c=>c.charCodeAt(0));}catch{return null;}
}
export async function tryonAdmin(req,env,path,user){
  if(user?.role!=='owner' || !env.DB)return json({error:'FORBIDDEN'},403);
  if(req.method==='GET'&&path==='/api/tryon/admin/assets'){
    try{
      const items=(await env.DB.prepare('SELECT p.sku,p.name,a.product_type,a.approved,a.reviewed_at,a.updated_at FROM products p LEFT JOIN tryon_assets a ON a.product_id=p.id ORDER BY p.id DESC LIMIT 200').all()).results||[];
      return json({items});
    }catch{return json({error:'TRYON_UNAVAILABLE'},503);}
  }
  const match=path.match(/^\/api\/tryon\/admin\/assets\/([^/]+)$/);
  if(!match||!validSku(match[1])||req.method!=='PUT')return notFound();
  if(req.headers.get('origin')!==new URL(req.url).origin)return json({error:'ORIGIN_REQUIRED'},403);
  const data=await readLimitedJson(req);
  if(!data||typeof data!=='object'||Array.isArray(data))return json({error:'INVALID_BODY'},400);
  const sku=match[1];
  try{
    const p=await env.DB.prepare('SELECT id FROM products WHERE sku=? LIMIT 1').bind(sku).first();
    if(!p)return notFound();
    if(data.action==='revoke'){
      await env.DB.prepare('UPDATE tryon_assets SET approved=0,reviewed_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE product_id=?').bind(p.id).run();
      return json({sku,approved:false});
    }
    if(data.action==='upload'){
      if(!TYPES.has(data.productType)||!MIME.has(data.mime))return json({error:'INVALID_ASSET_TYPE'},400);
      const buffer=fromBase64(data.base64);
      if(!imageMagic(buffer,data.mime))return json({error:'INVALID_IMAGE'},400);
      await env.DB.prepare("INSERT INTO tryon_assets(product_id,product_type,cutout_mime,cutout_blob,approved,reviewed_at,updated_at) VALUES(?,?,?,?,0,NULL,CURRENT_TIMESTAMP) ON CONFLICT(product_id) DO UPDATE SET product_type=excluded.product_type,cutout_mime=excluded.cutout_mime,cutout_blob=excluded.cutout_blob,approved=0,reviewed_at=NULL,updated_at=CURRENT_TIMESTAMP")
        .bind(p.id,data.productType,data.mime,buffer).run();
      return json({sku,approved:false,uploaded:true});
    }
    if(data.action==='approve'){
      if(data.confirmReviewed!==true)return json({error:'REVIEW_REQUIRED'},400);
      const asset=await env.DB.prepare('SELECT cutout_mime,cutout_blob,product_type FROM tryon_assets WHERE product_id=? LIMIT 1').bind(p.id).first();
      if(!asset||!imageMagic(bytesOf(asset.cutout_blob),asset.cutout_mime)||!TYPES.has(asset.product_type))return json({error:'ASSET_NOT_READY'},409);
      await env.DB.prepare('UPDATE tryon_assets SET approved=1,reviewed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE product_id=?').bind(p.id).run();
      return json({sku,approved:true});
    }
    return json({error:'INVALID_ACTION'},400);
  }catch{return json({error:'TRYON_UNAVAILABLE'},503);}
}
