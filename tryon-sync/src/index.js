/* Private catalog synchronizer: never attach SOURCE_DB to customer-facing Worker.
 * Reads only selected approved SKUs from manager D1 (name,sku) and updates
 * the independent sanitized catalog; no manager API, logs, sales or customer data. */
const SKU=/^HG-[A-F0-9]{12}$/;
const MAX_SYNC=100;
export async function syncApprovedNames(sourceDb,catalogDb){
 const approved=(await catalogDb.prepare(
  'SELECT sku FROM tryon_public_catalog WHERE approved=1 ORDER BY sku LIMIT 100'
 ).all()).results||[];
 let updated=0,revoked=0;
 for(const record of approved.slice(0,MAX_SYNC)){
  if(!SKU.test(String(record?.sku||'')))continue;
  const row=await sourceDb.prepare(
   'SELECT sku,name FROM products WHERE sku=? LIMIT 1'
  ).bind(record.sku).first();
  if(!row||typeof row.name!=='string'||!row.name.trim()){
   await catalogDb.prepare(
    'UPDATE tryon_public_catalog SET approved=0,reviewed_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE sku=?'
   ).bind(record.sku).run();
   revoked++;
   continue;
  }
  // The source D1 receives ONLY SELECT queries.
  await catalogDb.prepare(
   'UPDATE tryon_public_catalog SET name=?,updated_at=CURRENT_TIMESTAMP WHERE sku=? AND approved=1'
  ).bind(row.name.slice(0,130),record.sku).run();
  updated++;
 }
 return {updated,revoked};
}
export default {
 async fetch(){return new Response('Not Found',{status:404,headers:{'cache-control':'no-store'}});},
 async scheduled(_event,env){
  if(env.SYNC_ENABLED!=='1'||!env.SOURCE_DB||!env.CATALOG_DB)return;
  await syncApprovedNames(env.SOURCE_DB,env.CATALOG_DB);
 }
};
