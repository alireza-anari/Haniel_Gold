import {test} from 'node:test';
import assert from 'node:assert/strict';
import {syncApprovedNamesAndImages} from '../src/index.js';
const SKU='HG-D0EB66B628D3';
const PHOTO=Uint8Array.from([255,216,255,...new Array(32).fill(0)]);
function fixture(rows=[{sku:SKU,source_image_id:null}],product={id:7,sku:SKU,name:'نام واقعی محصول'},sourceImage=null){
 const sourceSQL=[],catalogSQL=[],writes=[];
 const sourceDb={prepare(sql){sourceSQL.push(sql);return {bind(...args){this.args=args;return this},
  async first(){return sql.startsWith('SELECT id,sku,name')?product:sourceImage}}}};
 const catalogDb={prepare(sql){catalogSQL.push(sql);return {
  args:[],bind(...v){this.args=v;return this},async all(){return {results:rows}},
  async run(){writes.push({sql,args:this.args});return {success:true}}
 }}};
 return {sourceDb,catalogDb,sourceSQL,catalogSQL,writes};
}
test('sync reads only name, SKU from private DB and writes only public DB',async()=>{
 const f=fixture();const r=await syncApprovedNamesAndImages(f.sourceDb,f.catalogDb);
 assert.deepEqual(r,{updated:1,revoked:0,photos:0});
 assert.equal(f.sourceSQL.length,1);
 assert.match(f.sourceSQL[0],/^SELECT id,sku,name FROM products WHERE sku=/);
 for(const keyword of ['sales','purchase','supplier','user','profit'])assert.equal(f.sourceSQL[0].includes(keyword),false);
 assert.equal(f.writes.length,1);assert.match(f.writes[0].sql,/UPDATE tryon_public_catalog/);
});
test('only explicitly owner-selected image from same product gets published',async()=>{
 const f=fixture([{sku:SKU,source_image_id:4}],{id:7,sku:SKU,name:'نام واقعی'}, {mime:'image/jpeg',image_blob:PHOTO});
 const r=await syncApprovedNamesAndImages(f.sourceDb,f.catalogDb);
 assert.deepEqual(r,{updated:1,revoked:0,photos:1});
 assert.equal(f.sourceSQL.length,2);
 assert.match(f.sourceSQL[1],/^SELECT mime,image_blob FROM images WHERE id=\? AND product_id=\?/);
 assert.deepEqual(f.writes[0].args.slice(0,2),['نام واقعی','image/jpeg']);
});
test('invalid image never gets published, only approved SKU name',async()=>{
 const f=fixture([{sku:SKU,source_image_id:4}],{id:7,sku:SKU,name:'نام واقعی'}, {mime:'image/jpeg',image_blob:new Array(45).fill(0)});
 const r=await syncApprovedNamesAndImages(f.sourceDb,f.catalogDb);
 assert.deepEqual(r,{updated:1,revoked:0,photos:0});
 assert.equal(f.writes[0].args[1],null);
});
test('deleted manager product revokes publicly approved SKU',async()=>{
 const f=fixture([{sku:SKU,source_image_id:4}],null);
 const r=await syncApprovedNamesAndImages(f.sourceDb,f.catalogDb);
 assert.deepEqual(r,{updated:0,revoked:1,photos:0});
 assert.match(f.writes[0].sql,/SET approved=0/);
});
test('no approved products means zero reads from manager',async()=>{
 const f=fixture([],null);
 const r=await syncApprovedNamesAndImages(f.sourceDb,f.catalogDb);
 assert.deepEqual(r,{updated:0,revoked:0,photos:0});
 assert.deepEqual(f.sourceSQL,[]);
});
test('rejects malformed catalog SKU before reading private DB',async()=>{
 const f=fixture([{sku:'private-sale-999',source_image_id:12}]);
 const r=await syncApprovedNamesAndImages(f.sourceDb,f.catalogDb);
 assert.deepEqual(r,{updated:0,revoked:0,photos:0});
 assert.deepEqual(f.sourceSQL,[]);
});
