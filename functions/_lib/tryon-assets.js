/* Dedicated, fail-closed public SKU lookup and admin-controlled approval.
   Never receives or stores customer photos. */
const json = (body,status=200) => new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
export const validSlug = v => typeof v === 'string' && /^[a-z0-9][a-z0-9_-]{1,79}$/i.test(v);
export const validAssetUrl = v => typeof v === 'string' && /^\/api\/v1\/media\/products\/[a-f0-9-]{36}\.(png|webp)$/.test(v);
export const validProductType = v => ['earring','necklace','bracelet','ring'].includes(v);

export async function tryonPublicProduct(c,slug) {
  if(!validSlug(slug))return json({error:'NOT_FOUND'},404);
  try {
    const item=await c.env.DB.prepare('SELECT p.slug,p.name,a.asset_url,a.product_type FROM products p JOIN tryon_assets a ON a.product_slug=p.slug WHERE p.slug=? AND p.published=1 AND a.approved=1 LIMIT 1').bind(slug).first();
    if(!item||!validAssetUrl(item.asset_url)||!validProductType(item.product_type))return json({error:'NOT_FOUND'},404);
    return json({slug:item.slug,name:item.name,assetUrl:item.asset_url,productType:item.product_type,productUrl:'/#/product/'+encodeURIComponent(item.slug),status:'approved'});
  }catch{return json({error:'TRYON_NOT_READY'},503);}
}

export async function tryonAdminList(c) {
  try {
    const rows=(await c.env.DB.prepare('SELECT a.product_slug,a.product_type,a.asset_url,a.approved,a.updated_at,p.name FROM tryon_assets a JOIN products p ON p.slug=a.product_slug ORDER BY a.updated_at DESC LIMIT 100').all()).results||[];
    return json({items:rows});
  }catch{return json({error:'TRYON_NOT_READY'},503);}
}

export async function tryonAdminAsset(c,slug) {
  if(!validSlug(slug))return json({error:'INVALID_PRODUCT_SLUG'},400);
  let d;
  try {
    if(Number(c.request.headers.get('content-length')||0)>3000)return json({error:'TOO_LARGE'},413);
    d=await c.request.json();
  }catch{return json({error:'INVALID_BODY'},400);}
  if(!d||typeof d!=='object'||Array.isArray(d)||!validAssetUrl(d.assetUrl)||!validProductType(d.productType)||typeof d.approved!=='boolean'||(d.approved&&d.confirmReviewed!==true))return json({error:'INVALID_OR_UNREVIEWED_ASSET'},400);
  try {
    if(!(await c.env.DB.prepare('SELECT slug FROM products WHERE slug=?').bind(slug).first()))return json({error:'NOT_FOUND'},404);
    if(d.approved){
      const key=d.assetUrl.replace(/^\/api\/v1\/media\//,'');
      if(!c.env.MEDIA_KV)return json({error:'MEDIA_NOT_READY'},503);
      const meta=await c.env.MEDIA_KV.getWithMetadata(key,'arrayBuffer');
      if(!meta?.value)return json({error:'ASSET_NOT_FOUND'},409);
      const type=meta.metadata?.contentType;
      if(type && !['image/png','image/webp'].includes(type))return json({error:'INVALID_MEDIA_TYPE'},400);
    }
    const now=Date.now();
    await c.env.DB.prepare('INSERT INTO tryon_assets(product_slug,product_type,asset_url,approved,reviewed_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(product_slug) DO UPDATE SET product_type=excluded.product_type,asset_url=excluded.asset_url,approved=excluded.approved,reviewed_at=excluded.reviewed_at,updated_at=excluded.updated_at')
      .bind(slug,d.productType,d.assetUrl,d.approved?1:0,d.approved?now:null,now).run();
    return json({updated:true,slug,approved:d.approved});
  }catch{return json({error:'TRYON_NOT_READY'},503);}
}
