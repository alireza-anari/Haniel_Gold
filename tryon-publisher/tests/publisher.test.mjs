import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publishApi } from '../src/publisher.mjs';
import { validRgbaPng } from '../src/images.mjs';

const SKU = 'HG-AAAAAAAAAAAA';
const B64 = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAABI0lEQVR42u2a0RXCMAhFCyM5hws5gQs5hyvpBq0mPALtvb89DfAKCU2ybQAAAAAXxbINvp63z97z++NtpxLgKOAj1IJY1cCzhLDqgauF8E7BK2x4p+AVtizboaMUjhwrRYBfHB51VDl2SAmoHfzl3dlyMFXw0bO1yl7oKqBcs1V9gEd/DWXntjf2aCl4l+BVIvh2cbx6japteVT6V+FfH73b14+2yRxwpvQf8dU7pn+kbUoAARAAARAAARAgr/de2fdPCbCy4VE2SJRAlVRcZdNVqdXl/+DyR2PMAZEptvp0eKREPbrOlCIotuS9eo2qhTW1U7Mrh9rGVAaoT28zBOaCRMc+ILIp42isqmNZNrgoWb1vb3tVdlSQThsvAAAAAK35ArDjuFB5XQbIAAAAAElFTkSuQmCC';
const PNG = Uint8Array.from(Buffer.from(B64, 'base64'));
const SECRET = 'service-binding-secret-for-tests-2026';
const SESSION = { sub: 'owner', csrf: 'c'.repeat(43) };
const getSession = async () => SESSION;
const denied = async () => null;

const req = (path, method = 'GET', data, origin = 'https://private.example.test', csrf = SESSION.csrf) => new Request('https://private.example.test' + path, {
  method,
  headers: {
    ...(data === undefined ? {} : { 'content-type': 'application/json' }),
    ...(method === 'PUT' ? { origin, 'x-csrf-token': csrf } : {}),
  },
  ...(data === undefined ? {} : { body: JSON.stringify(data) }),
});
const draft = { action: 'draft', productType: 'necklace', sourceImageId: 7, cutoutBase64: B64 };

function fixture() {
  const calls = { source: [], catalog: [] };
  const state = {
    asset: null,
    approved: false,
    product: { id: 5, sku: SKU, name: 'محصول آزمایشی' },
    image: { mime: 'image/png', blob: PNG },
  };
  const sourceApi = {
    async fetch(request) {
      const url = new URL(request.url);
      calls.source.push({ path: url.pathname, method: request.method, secretPresent: request.headers.get('x-hg-source-secret') === SECRET });
      if (request.method !== 'GET' || request.headers.get('x-hg-source-secret') !== SECRET) {
        return new Response('Not Found', { status: 404 });
      }
      if (url.pathname === '/internal/products') {
        return Response.json({ items: [
          { sku: SKU, name: state.product.name },
          { sku: 'bad-sku', name: 'نباید نمایش داده شود' },
        ] });
      }
      if (url.pathname === '/internal/products/' + SKU) {
        return state.product ? Response.json(state.product) : new Response('Not Found', { status: 404 });
      }
      if (url.pathname === '/internal/products/' + SKU + '/images') {
        return Response.json({ images: [{ id: 7, mime: 'image/png' }] });
      }
      if (url.pathname === '/internal/products/' + SKU + '/images/7') {
        return state.image
          ? new Response(state.image.blob, { headers: { 'content-type': state.image.mime } })
          : new Response('Not Found', { status: 404 });
      }
      return new Response('Not Found', { status: 404 });
    },
  };
  const catalog = {
    prepare(sql) {
      calls.catalog.push(sql);
      return {
        args: [],
        bind(...args) { this.args = args; return this; },
        async first() { return state.asset; },
        async all() {
          return { results: state.asset ? [{
            sku: SKU, name: 'محصول آزمایشی', product_type: 'necklace',
            approved: state.approved ? 1 : 0,
          }] : [] };
        },
        async run() {
          if (sql.startsWith('INSERT')) {
            state.asset = {
              product_type: this.args[2],
              cutout_mime: this.args[3],
              cutout_blob: this.args[4],
              source_image_id: this.args[5],
              source_mime: this.args[6],
              source_blob: this.args[7],
            };
            state.approved = false;
          }
          if (sql.includes('SET approved=1')) state.approved = true;
          if (sql.includes('SET approved=0')) state.approved = false;
          return { success: true, meta: { changes: 1 } };
        },
      };
    },
  };
  return {
    env: { SOURCE_API: sourceApi, SOURCE_API_SECRET: SECRET, CATALOG_DB: catalog },
    state,
    calls,
  };
}

async function pub(f, path, method = 'GET', data, origin, csrf) {
  return publishApi(req(path, method, data, origin, csrf), f.env, { getSession });
}
const path = '/admin/api/catalog/' + SKU;

test('test PNG fixture has correct real RGBA signature', () => assert.equal(validRgbaPng(PNG), true));

test('unauthenticated requests cannot call private source service or catalog DB', async () => {
  const f = fixture();
  const response = await publishApi(req('/admin/api/products'), f.env, { getSession: denied });
  assert.equal(response.status, 401);
  assert.deepEqual(f.calls, { source: [], catalog: [] });
});

test('missing source service or secret fails closed', async () => {
  const a = await publishApi(req('/admin/api/products'), { SOURCE_API_SECRET: SECRET }, { getSession });
  assert.equal(a.status, 503);
  const f = fixture();
  delete f.env.SOURCE_API_SECRET;
  const b = await publishApi(req('/admin/api/products'), f.env, { getSession });
  assert.equal(b.status, 503);
});

test('catalog status can load without a Manager source service', async () => {
  const f = fixture();
  const response = await publishApi(req('/admin/api/catalog'), { CATALOG_DB: f.env.CATALOG_DB }, { getSession });
  assert.equal(response.status, 200);
});

test('product search returns only SKU/name through the private service binding', async () => {
  const f = fixture();
  const response = await pub(f, '/admin/api/products?q=HG-');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { items: [{ sku: SKU, name: 'محصول آزمایشی' }] });
  assert.deepEqual(f.calls.source[0], {
    path: '/internal/products', method: 'GET', secretPresent: true,
  });
});

test('owner can list and retrieve only images belonging to selected product', async () => {
  const f = fixture();
  const response = await pub(f, '/admin/api/products/' + SKU + '/images');
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).images, [{ id: 7, mime: 'image/png' }]);
  const image = await pub(f, '/admin/api/products/' + SKU + '/images/7');
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.ok((await image.arrayBuffer()).byteLength > 100);
  assert.ok(f.calls.source.every((call) => call.secretPresent && call.method === 'GET'));
});

test('CSRF token and same-origin are mandatory for writes', async () => {
  const f = fixture();
  const noToken = await publishApi(req(path, 'PUT', draft, 'https://private.example.test', 'wrong'), f.env, { getSession });
  assert.equal(noToken.status, 403);
  const badOrigin = await pub(f, path, 'PUT', draft, 'https://attacker.invalid');
  assert.equal(badOrigin.status, 403);
  assert.equal(f.calls.source.length, 0);
  assert.equal(f.calls.catalog.length, 0);
});

test('draft is unapproved and source is accessed only through internal service', async () => {
  const f = fixture();
  const response = await pub(f, path, 'PUT', draft);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { sku: SKU, approved: false, state: 'draft' });
  assert.equal(f.state.approved, false);
  assert.ok(f.calls.source.every((call) => call.secretPresent && call.method === 'GET'));
  assert.ok(f.calls.catalog.some((sql) => sql.startsWith('INSERT')));
});

test('invalid PNG never writes a draft', async () => {
  const f = fixture();
  const response = await pub(f, path, 'PUT', { ...draft, cutoutBase64: 'invalid' });
  assert.equal(response.status, 422);
  assert.equal(f.calls.catalog.length, 0);
});

test('rejected approval missing visual confirmation', async () => {
  const f = fixture();
  await pub(f, path, 'PUT', draft);
  const response = await pub(f, path, 'PUT', { action: 'approve', confirmSku: SKU, confirmVisualReview: false });
  assert.equal(response.status, 400);
  assert.equal(f.state.approved, false);
});

test('owner can fetch both stored images for comparison', async () => {
  const f = fixture();
  await pub(f, path, 'PUT', draft);
  for (const name of ['source-photo', 'cutout']) {
    const response = await pub(f, path + '/' + name);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.ok((await response.arrayBuffer()).byteLength > 100);
  }
});

test('approved publication requires matching reviewed binary hash and SKU', async () => {
  const f = fixture();
  await pub(f, path, 'PUT', draft);
  const review = await pub(f, path + '/review');
  const { fingerprint } = await review.json();
  assert.match(fingerprint, /^[a-f0-9]{64}$/);
  const response = await pub(f, path, 'PUT', {
    action: 'approve', confirmSku: SKU, confirmVisualReview: true, confirmReviewHash: fingerprint,
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).approved, true);
  assert.equal(f.state.approved, true);
});

test('changed Manager image blocks approval', async () => {
  const f = fixture();
  await pub(f, path, 'PUT', draft);
  const review = await pub(f, path + '/review');
  const { fingerprint } = await review.json();
  f.state.image = { mime: 'image/png', blob: Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, ...new Array(40).fill(9)]) };
  const response = await pub(f, path, 'PUT', {
    action: 'approve', confirmSku: SKU, confirmVisualReview: true, confirmReviewHash: fingerprint,
  });
  assert.equal(response.status, 409);
  assert.equal(f.state.approved, false);
});

test('wrong image review hash fails closed', async () => {
  const f = fixture();
  await pub(f, path, 'PUT', draft);
  const response = await pub(f, path, 'PUT', {
    action: 'approve', confirmSku: SKU, confirmVisualReview: true, confirmReviewHash: '0'.repeat(64),
  });
  assert.equal(response.status, 409);
  assert.equal(f.state.approved, false);
});

test('revoke disables public item but never calls Manager mutation API', async () => {
  const f = fixture();
  await pub(f, path, 'PUT', draft);
  const response = await pub(f, path, 'PUT', { action: 'revoke' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).approved, false);
  assert.ok(f.calls.source.every((call) => call.method === 'GET'));
});

test('unrecognized route cannot access Manager/accounting APIs', async () => {
  const f = fixture();
  for (const route of ['/api/sales', '/api/users', '/api/prices', '/admin/api/sales']) {
    const response = await pub(f, route);
    assert.equal(response.status, 404);
  }
});
