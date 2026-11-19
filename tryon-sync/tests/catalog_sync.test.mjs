import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { syncApprovedNamesAndImages } from '../src/index.js';

const SKU = 'HG-D0EB66B628D3';
const PHOTO = Uint8Array.from([255, 216, 255, ...new Array(32).fill(0)]);
const REVIEWED = '2026-11-19T10:00:00Z';

function fixture({
  rows = [{ sku: SKU, name: 'نام واقعی محصول', product_type: 'necklace', cutout_blob: Uint8Array.from([1, 2, 3]), source_image_id: 4, source_mime: 'image/jpeg', source_blob: PHOTO, reviewed_at: REVIEWED }],
  product = { id: 7, sku: SKU, name: 'نام واقعی محصول' },
  sourceImage = { mime: 'image/jpeg', image_blob: PHOTO },
} = {}) {
  const sourceSQL = [];
  const catalogSQL = [];
  const writes = [];
  const sourceDb = {
    prepare(sql) {
      sourceSQL.push(sql);
      return {
        bind(...args) { this.args = args; return this; },
        async first() {
          return sql.startsWith('SELECT id,sku,name') ? product : sourceImage;
        },
      };
    },
  };
  const catalogDb = {
    prepare(sql) {
      catalogSQL.push(sql);
      return {
        args: [],
        bind(...args) { this.args = args; return this; },
        async all() { return { results: rows }; },
        async run() { writes.push({ sql, args: this.args }); return { success: true, meta: { changes: 1 } }; },
      };
    },
  };
  return { sourceDb, catalogDb, sourceSQL, catalogSQL, writes };
}

test('unchanged approved product and selected photo are verified without rewriting public content', async () => {
  const f = fixture();
  const result = await syncApprovedNamesAndImages(f.sourceDb, f.catalogDb);
  assert.deepEqual(result, { verified: 1, revoked: 0, photos: 1 });
  assert.equal(f.sourceSQL.length, 2);
  assert.match(f.sourceSQL[0], /^SELECT id,sku,name FROM products WHERE sku=/);
  assert.match(f.sourceSQL[1], /^SELECT mime,image_blob FROM images WHERE id=\? AND product_id=\?/);
  assert.equal(f.writes.length, 0);
  assert.ok(f.sourceSQL.every((sql) => sql.trim().startsWith('SELECT')));
});

test('changed product name revokes approval instead of silently updating public name', async () => {
  const f = fixture({ product: { id: 7, sku: SKU, name: 'نام جدید محصول' } });
  const result = await syncApprovedNamesAndImages(f.sourceDb, f.catalogDb);
  assert.deepEqual(result, { verified: 0, revoked: 1, photos: 0 });
  assert.equal(f.sourceSQL.length, 1);
  assert.equal(f.writes.length, 1);
  assert.match(f.writes[0].sql, /SET approved=0,reviewed_at=NULL/);
  assert.match(f.writes[0].sql, /AND source_blob IS \?/);
});

test('changed manager photo revokes approval rather than replacing reviewed photo', async () => {
  const changed = Uint8Array.from([255, 216, 255, ...new Array(32).fill(9)]);
  const f = fixture({ sourceImage: { mime: 'image/jpeg', image_blob: changed } });
  const result = await syncApprovedNamesAndImages(f.sourceDb, f.catalogDb);
  assert.deepEqual(result, { verified: 0, revoked: 1, photos: 0 });
  assert.equal(f.writes.length, 1);
});

test('missing or invalid selected manager image revokes approval', async () => {
  const f = fixture({ sourceImage: null });
  const result = await syncApprovedNamesAndImages(f.sourceDb, f.catalogDb);
  assert.deepEqual(result, { verified: 0, revoked: 1, photos: 0 });
  assert.equal(f.writes.length, 1);
});

test('deleted manager product revokes public approval without source writes', async () => {
  const f = fixture({ product: null });
  const result = await syncApprovedNamesAndImages(f.sourceDb, f.catalogDb);
  assert.deepEqual(result, { verified: 0, revoked: 1, photos: 0 });
  assert.equal(f.sourceSQL.length, 1);
  assert.equal(f.writes.length, 1);
  assert.ok(f.sourceSQL.every((sql) => sql.trim().startsWith('SELECT')));
});

test('no approved products means zero reads from private manager DB', async () => {
  const f = fixture({ rows: [] });
  const result = await syncApprovedNamesAndImages(f.sourceDb, f.catalogDb);
  assert.deepEqual(result, { verified: 0, revoked: 0, photos: 0 });
  assert.deepEqual(f.sourceSQL, []);
  assert.deepEqual(f.writes, []);
});

test('rejects malformed catalog SKU before reading private manager DB', async () => {
  const f = fixture({ rows: [{ sku: 'private-sale-999' }] });
  const result = await syncApprovedNamesAndImages(f.sourceDb, f.catalogDb);
  assert.deepEqual(result, { verified: 0, revoked: 0, photos: 0 });
  assert.deepEqual(f.sourceSQL, []);
});

test('scheduled sync is disabled by default and public fetch always returns 404', async () => {
  const f = fixture();
  const worker = (await import('../src/index.js')).default;
  await worker.scheduled({}, { SOURCE_DB: f.sourceDb, CATALOG_DB: f.catalogDb, SYNC_ENABLED: '0' });
  assert.deepEqual(f.sourceSQL, []);
  assert.deepEqual(f.writes, []);
  const response = await worker.fetch(new Request('https://sync.example.test/anything'));
  assert.equal(response.status, 404);
});


const INTERNAL_SECRET = 'private-source-service-secret-for-tests-2026';
function sourceServiceFixture() {
 const calls=[];
 const product={id:7,sku:SKU,name:'نام واقعی محصول',supplier:'PRIVATE SUPPLIER',purchase_gold_rate:'999999'};
 const image={mime:'image/jpeg',image_blob:PHOTO};
 const sourceDb={
  prepare(sql){
   calls.push(sql);
   return {
    args:[],
    bind(...args){this.args=args;return this;},
    async all(){
     if(sql.startsWith('SELECT id,sku,name FROM products WHERE sku LIKE'))return {results:[product,{id:8,sku:'bad-sku',name:'bad'}]};
     if(sql.startsWith('SELECT id,mime FROM images WHERE product_id='))return {results:[{id:4,mime:'image/jpeg'}]};
     return {results:[]};
    },
    async first(){
     if(sql.startsWith('SELECT id,sku,name FROM products WHERE sku='))return product;
     if(sql.startsWith('SELECT id FROM products WHERE sku='))return {id:7};
     if(sql.startsWith('SELECT mime,image_blob FROM images'))return image;
     return null;
    },
   };
  },
 };
 return {calls,sourceDb,env:{SOURCE_DB:sourceDb,SOURCE_API_SECRET:INTERNAL_SECRET}};
}
const internalRequest=(path,method='GET',secret=INTERNAL_SECRET)=>new Request('https://source.internal'+path,{
 method,
 headers:secret?{'x-hg-source-secret':secret}:{},
});

test('private source Worker hides all routes without the internal secret',async()=>{
 const f=sourceServiceFixture();
 const response=await worker.fetch(internalRequest('/internal/products','GET',''),f.env);
 assert.equal(response.status,404);
 assert.deepEqual(f.calls,[]);
});

test('private source Worker returns only SKU and name for product search',async()=>{
 const f=sourceServiceFixture();
 const response=await worker.fetch(internalRequest('/internal/products?q=HG-'),f.env);
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{items:[{sku:SKU,name:'نام واقعی محصول'}]});
 assert.equal(f.calls.length,1);
 assert.match(f.calls[0],/^SELECT id,sku,name FROM products/);
 assert.ok(!/sales|supplier|purchase_gold_rate|users/i.test(f.calls[0]));
});

test('private source Worker exposes only image metadata and image bytes tied to the selected product',async()=>{
 const f=sourceServiceFixture();
 const list=await worker.fetch(internalRequest('/internal/products/'+SKU+'/images'),f.env);
 assert.equal(list.status,200);
 assert.deepEqual(await list.json(),{images:[{id:4,mime:'image/jpeg'}]});
 const photo=await worker.fetch(internalRequest('/internal/products/'+SKU+'/images/4'),f.env);
 assert.equal(photo.status,200);
 assert.equal(photo.headers.get('content-type'),'image/jpeg');
 assert.deepEqual(new Uint8Array(await photo.arrayBuffer()),PHOTO);
 assert.ok(f.calls.some(sql=>sql.includes('WHERE id=? AND product_id=?')));
 assert.ok(f.calls.every(sql=>sql.trim().startsWith('SELECT')));
});

test('private source Worker rejects writes, unknown routes, and malformed SKUs',async()=>{
 const f=sourceServiceFixture();
 const post=await worker.fetch(internalRequest('/internal/products','POST'),f.env);
 const unknown=await worker.fetch(internalRequest('/internal/sales'),f.env);
 const malformed=await worker.fetch(internalRequest('/internal/products/not-a-sku'),f.env);
 assert.equal(post.status,404);
 assert.equal(unknown.status,404);
 assert.equal(malformed.status,404);
});
