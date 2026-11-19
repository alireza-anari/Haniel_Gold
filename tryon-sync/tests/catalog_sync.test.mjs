import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncApprovedNamesAndImages } from '../src/index.js';

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
