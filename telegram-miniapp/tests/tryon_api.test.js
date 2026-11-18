import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {tryonPublic,tryonAdmin} from '../src/tryon.js';

const SKU='HG-TEST0001';
const png=Uint8Array.from([...([137,80,78,71,13,10,26,10]),...new Array(48).fill(0)]);
function mockDb(record=null){
  const log=[];
  const db={prepare(sql){
    const q={sql,args:[],
      bind(...args){this.args=args;return this;},
      async first(){
        if(sql.startsWith('SELECT id FROM products'))return {id:7};
        if(sql.startsWith('SELECT cutout_mime'))return {cutout_mime:'image/png',cutout_blob:png,product_type:'necklace'};
        return record;
      },
      async all(){return {results:[{sku:SKU,name:'محصول آزمایشی',approved:0}]}},
      async run(){log.push({sql,args:this.args});return {success:true}}
    };return q;
  }};return {db,log};
}
const req=(path,method='GET',body=null,origin='https://example.test')=>new Request('https://example.test'+path,{
  method,headers:{...(body?{'content-type':'application/json'}:{}),...(method==='PUT'?{'origin':origin}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
});
const sample={sku:SKU,name:'آویز آزمایشی',product_type:'necklace',cutout_mime:'image/png',cutout_blob:png};
test('customer public endpoint is disabled without explicit flag',async()=>{
  const {db}=mockDb(sample);
  const r=await tryonPublic(req('/api/tryon/products/'+SKU),{DB:db},'/api/tryon/products/'+SKU);
  assert.equal(r.status,404);
});
test('public product response includes no financial fields or private image data',async()=>{
  const {db}=mockDb(sample);
  const path='/api/tryon/products/'+SKU;
  const r=await tryonPublic(req(path),{DB:db,TRYON_PUBLIC_ENABLED:'1'},path);
  assert.equal(r.status,200);
  const body=await r.json();
  assert.deepEqual(Object.keys(body).sort(),['assetUrl','name','productType','sku','status'].sort());
  assert.equal(body.sku,SKU);
  assert.equal(body.assetUrl,'/api/tryon/cutouts/'+SKU);
  assert.equal(JSON.stringify(body).includes('purchase'),false);
});
test('public cutout serves only approved image bytes',async()=>{
  const {db}=mockDb(sample);const path='/api/tryon/cutouts/'+SKU;
  const r=await tryonPublic(req(path),{DB:db,TRYON_PUBLIC_ENABLED:'1'},path);
  assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');
  assert.equal(r.headers.get('content-type'),'image/png');
  assert.equal((await r.arrayBuffer()).byteLength,png.length);
});
test('unapproved products are never returned, and missing migration fails closed',async()=>{
  const {db}=mockDb(null); const path='/api/tryon/products/'+SKU;
  assert.equal((await tryonPublic(req(path),{DB:db,TRYON_PUBLIC_ENABLED:'1'},path)).status,404);
  const broken={prepare(){throw Error('no such table')}};
  assert.equal((await tryonPublic(req(path),{DB:broken,TRYON_PUBLIC_ENABLED:'1'},path)).status,503);
});
test('admin API is owner only; a forged Origin is rejected',async()=>{
  const {db}=mockDb(); const path='/api/tryon/admin/assets/'+SKU;
  const body={action:'revoke'};
  assert.equal((await tryonAdmin(req(path,'PUT',body),{DB:db},path,{role:'manager'})).status,403);
  assert.equal((await tryonAdmin(req(path,'PUT',body,'https://other.example'),{DB:db},path,{role:'owner'})).status,403);
});
test('uploaded cutout is explicitly unapproved and must be reviewed',async()=>{
  const {db,log}=mockDb();const path='/api/tryon/admin/assets/'+SKU;
  const body={action:'upload',productType:'necklace',mime:'image/png',base64:Buffer.from(png).toString('base64')};
  const r=await tryonAdmin(req(path,'PUT',body),{DB:db},path,{role:'owner'});
  assert.equal(r.status,200);assert.equal((await r.json()).approved,false);
  assert.equal(log.length,1);
  assert.match(log[0].sql,/approved=0,reviewed_at=NULL/);
});
test('approval requires explicit owner review and a present image',async()=>{
  const {db,log}=mockDb();const path='/api/tryon/admin/assets/'+SKU;
  let r=await tryonAdmin(req(path,'PUT',{action:'approve'}),{DB:db},path,{role:'owner'});
  assert.equal(r.status,400);
  r=await tryonAdmin(req(path,'PUT',{action:'approve',confirmReviewed:true}),{DB:db},path,{role:'owner'});
  assert.equal(r.status,200);
  assert.equal(log.length,1);
  assert.match(log[0].sql,/approved=1/);
});
test('revocation immediately marks approved false and invalid SKU is hidden',async()=>{
  const {db,log}=mockDb();const path='/api/tryon/admin/assets/'+SKU;
  const r=await tryonAdmin(req(path,'PUT',{action:'revoke'}),{DB:db},path,{role:'owner'});
  assert.equal(r.status,200);
  assert.equal((await r.json()).approved,false);
  assert.match(log[0].sql,/approved=0/);
  assert.equal((await tryonPublic(req('/api/tryon/products/%00'),{DB:db,TRYON_PUBLIC_ENABLED:'1'},'/api/tryon/products/%00')).status,404);
});
