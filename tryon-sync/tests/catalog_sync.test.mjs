import {test} from 'node:test';
import assert from 'node:assert/strict';
import {syncApprovedNames} from '../src/index.js';
const SKU='HG-D0EB66B628D3';
function fixture(rows=[{sku:SKU}],sourceRow={sku:SKU,name:'نام موجود در مدیریت'}){
 const sourceSQL=[],catalogSQL=[],writes=[];
 const sourceDb={prepare(sql){sourceSQL.push(sql);return {bind(){return this},async first(){return sourceRow}}}};
 const catalogDb={prepare(sql){catalogSQL.push(sql);return {
  args:[],bind(...v){this.args=v;return this},async all(){return {results:rows}},
  async run(){writes.push({sql,args:this.args});return {success:true}}
 }}};
 return {sourceDb,catalogDb,sourceSQL,catalogSQL,writes};
}
test('sync reads only sku,name and writes only to sanitized catalog',async()=>{
 const f=fixture();const r=await syncApprovedNames(f.sourceDb,f.catalogDb);
 assert.deepEqual(r,{updated:1,revoked:0});
 assert.equal(f.sourceSQL.length,1);
 assert.match(f.sourceSQL[0],/^SELECT sku,name FROM products WHERE sku=/);
 assert.equal(f.sourceSQL[0].includes('sales'),false);
 assert.equal(f.sourceSQL[0].includes('purchase'),false);
 assert.equal(f.writes.length,1);
 assert.match(f.writes[0].sql,/UPDATE tryon_public_catalog/);
});
test('deleted manager product revokes public catalog approval',async()=>{
 const f=fixture([{sku:SKU}],null);
 const r=await syncApprovedNames(f.sourceDb,f.catalogDb);
 assert.deepEqual(r,{updated:0,revoked:1});
 assert.match(f.writes[0].sql,/SET approved=0/);
});
test('no approved products means zero reads from manager',async()=>{
 const f=fixture([],null);
 const r=await syncApprovedNames(f.sourceDb,f.catalogDb);
 assert.deepEqual(r,{updated:0,revoked:0});
 assert.deepEqual(f.sourceSQL,[]);
});
test('rejects malformed catalog SKU before reading private DB',async()=>{
 const f=fixture([{sku:'private-sale-999'}]);
 const r=await syncApprovedNames(f.sourceDb,f.catalogDb);
 assert.deepEqual(r,{updated:0,revoked:0});
 assert.deepEqual(f.sourceSQL,[]);
});
