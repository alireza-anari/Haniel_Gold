import { handleAuthRequest, readOwnerSession, csrfMatches, originMatches } from './auth.mjs';
import { bytes, validSourcePhoto, validRgbaPng, decodePngBase64 } from './images.mjs';

const SKU = /^HG-[A-F0-9]{12}$/;
const TYPES = new Set(['earring', 'necklace', 'bracelet', 'ring']);
const NO_STORE = {
  'cache-control': 'private, no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { ...NO_STORE, 'content-type': 'application/json; charset=utf-8' },
});
const fail = (code, status) => json({ error: code }, status);
const imageId = (value) => Number.isSafeInteger(value) && value > 0;
const hex = (value) => Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, '0')).join('');
function equals(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let value = 0;
  for (let i = 0; i < a.length; i++) value |= a[i] ^ b[i];
  return value === 0;
}
async function hashReview(sku, asset) {
  const cutout = bytes(asset.cutout_blob);
  const photo = bytes(asset.source_blob);
  if (!validRgbaPng(cutout) || asset.cutout_mime !== 'image/png'
    || !validSourcePhoto(photo, asset.source_mime) || !TYPES.has(asset.product_type)) return null;
  const cutoutHash = hex(await crypto.subtle.digest('SHA-256', cutout));
  const photoHash = hex(await crypto.subtle.digest('SHA-256', photo));
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(
    [sku, asset.product_type, asset.source_image_id, cutoutHash, photoHash].join('|'),
  )));
}
const product = (db, sku) => db.prepare('SELECT id,sku,name FROM products WHERE sku=? LIMIT 1').bind(sku).first();
async function photo(db, selectedProduct, id) {
  if (!imageId(id)) return null;
  const row = await db.prepare('SELECT mime,image_blob FROM images WHERE id=? AND product_id=? LIMIT 1')
    .bind(id, selectedProduct.id).first();
  const blob = bytes(row?.image_blob);
  return validSourcePhoto(blob, row?.mime) ? { blob, mime: row.mime } : null;
}
async function bodyJson(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return null;
  if (Number(request.headers.get('content-length') || 0) > 610000) return null;
  const text = await request.text();
  if (new TextEncoder().encode(text).length > 610000) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export async function publishApi(request, env, { getSession = readOwnerSession } = {}) {
  const session = await getSession(request, env);
  if (!session) return fail('UNAUTHORIZED', 401);
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  if (!['GET', 'PUT'].includes(method)) return fail('NOT_FOUND', 404);
  if (method === 'PUT' && (!originMatches(request) || !csrfMatches(request, session))) {
    return fail('CSRF_REJECTED', 403);
  }

  if (path === '/admin/api/products' && method === 'GET') {
    if (!env.SOURCE_DB) return fail('SOURCE_DB_NOT_CONFIGURED', 503);
    try {
      const query = (url.searchParams.get('q') || '').trim().slice(0, 60);
      const rows = (await env.SOURCE_DB.prepare(
        'SELECT sku,name FROM products WHERE sku LIKE ? OR name LIKE ? ORDER BY id DESC LIMIT 40',
      ).bind('%' + query + '%', '%' + query + '%').all()).results || [];
      return json({ items: rows.filter((row) => SKU.test(row.sku))
        .map((row) => ({ sku: row.sku, name: String(row.name || '').slice(0, 120) })) });
    } catch {
      return fail('SOURCE_UNAVAILABLE', 503);
    }
  }
  if (path === '/admin/api/catalog' && method === 'GET') {
    if (!env.CATALOG_DB) return fail('CATALOG_DB_NOT_CONFIGURED', 503);
    try {
      const rows = (await env.CATALOG_DB.prepare(
        'SELECT sku,name,product_type,approved,reviewed_at,source_image_id,updated_at FROM tryon_public_catalog ORDER BY updated_at DESC LIMIT 100',
      ).all()).results || [];
      return json({ items: rows.map((row) => ({
        sku: row.sku,
        name: row.name,
        productType: row.product_type,
        approved: row.approved === 1,
        reviewedAt: row.reviewed_at,
        sourceImageId: row.source_image_id,
        updatedAt: row.updated_at,
      })) });
    } catch {
      return fail('CATALOG_UNAVAILABLE', 503);
    }
  }
  const list = path.match(/^\/admin\/api\/products\/(HG-[A-F0-9]{12})\/images$/);
  if (list && method === 'GET') {
    if (!env.SOURCE_DB) return fail('SOURCE_DB_NOT_CONFIGURED', 503);
    try {
      const selectedProduct = await product(env.SOURCE_DB, list[1]);
      if (!selectedProduct) return fail('PRODUCT_NOT_FOUND', 404);
      const rows = (await env.SOURCE_DB.prepare('SELECT id,mime FROM images WHERE product_id=? ORDER BY id LIMIT 20')
        .bind(selectedProduct.id).all()).results || [];
      return json({ images: rows.filter((row) => imageId(row.id)
        && ['image/png', 'image/jpeg', 'image/webp'].includes(row.mime)) });
    } catch {
      return fail('SOURCE_UNAVAILABLE', 503);
    }
  }
  const ref = path.match(/^\/admin\/api\/products\/(HG-[A-F0-9]{12})\/images\/([1-9][0-9]*)$/);
  if (ref && method === 'GET') {
    if (!env.SOURCE_DB) return fail('SOURCE_DB_NOT_CONFIGURED', 503);
    try {
      const selectedProduct = await product(env.SOURCE_DB, ref[1]);
      if (!selectedProduct) return fail('PRODUCT_NOT_FOUND', 404);
      const image = await photo(env.SOURCE_DB, selectedProduct, Number(ref[2]));
      if (!image) return fail('IMAGE_NOT_AVAILABLE', 404);
      return new Response(image.blob, { headers: { ...NO_STORE, 'content-type': image.mime } });
    } catch {
      return fail('SOURCE_UNAVAILABLE', 503);
    }
  }
  const preview = path.match(/^\/admin\/api\/catalog\/(HG-[A-F0-9]{12})\/(cutout|source-photo|review)$/);
  if (preview && method === 'GET') {
    if (!env.CATALOG_DB) return fail('CATALOG_DB_NOT_CONFIGURED', 503);
    try {
      const asset = await env.CATALOG_DB.prepare(
        'SELECT product_type,cutout_mime,cutout_blob,source_image_id,source_mime,source_blob FROM tryon_public_catalog WHERE sku=? LIMIT 1',
      ).bind(preview[1]).first();
      if (!asset) return fail('DRAFT_NOT_FOUND', 404);
      if (preview[2] === 'review') {
        const fingerprint = await hashReview(preview[1], asset);
        return fingerprint ? json({ sku: preview[1], fingerprint }) : fail('REVIEW_NOT_READY', 409);
      }
      const isCutout = preview[2] === 'cutout';
      const blob = bytes(isCutout ? asset.cutout_blob : asset.source_blob);
      const mime = isCutout ? asset.cutout_mime : asset.source_mime;
      if (!(isCutout ? (mime === 'image/png' && validRgbaPng(blob)) : validSourcePhoto(blob, mime))) {
        return fail('IMAGE_NOT_READY', 404);
      }
      return new Response(blob, { headers: { ...NO_STORE, 'content-type': mime } });
    } catch {
      return fail('CATALOG_UNAVAILABLE', 503);
    }
  }
  const item = path.match(/^\/admin\/api\/catalog\/(HG-[A-F0-9]{12})$/);
  if (item && method === 'PUT') {
    if (!env.SOURCE_DB || !env.CATALOG_DB) return fail('DATABASE_NOT_CONFIGURED', 503);
    const data = await bodyJson(request);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return fail('INVALID_JSON', 400);
    const sku = item[1];
    try {
      const selectedProduct = await product(env.SOURCE_DB, sku);
      if (!selectedProduct) return fail('PRODUCT_NOT_FOUND', 404);
      if (data.action === 'draft') {
        if (!TYPES.has(data.productType) || !imageId(data.sourceImageId)) return fail('INVALID_SELECTION', 400);
        const cutout = decodePngBase64(data.cutoutBase64);
        if (!cutout) return fail('INVALID_RGBA_PNG', 422);
        const source = await photo(env.SOURCE_DB, selectedProduct, data.sourceImageId);
        if (!source) return fail('SOURCE_IMAGE_REQUIRED', 422);
        await env.CATALOG_DB.prepare(
          'INSERT INTO tryon_public_catalog (sku,name,product_type,cutout_mime,cutout_blob,source_image_id,source_mime,source_blob,approved,reviewed_at,updated_at) '
          + 'VALUES(?,?,?,?,?,?,?,?,0,NULL,CURRENT_TIMESTAMP) ON CONFLICT(sku) DO UPDATE SET '
          + 'name=excluded.name,product_type=excluded.product_type,cutout_mime=excluded.cutout_mime,'
          + 'cutout_blob=excluded.cutout_blob,source_image_id=excluded.source_image_id,'
          + 'source_mime=excluded.source_mime,source_blob=excluded.source_blob,'
          + 'approved=0,reviewed_at=NULL,updated_at=CURRENT_TIMESTAMP',
        ).bind(sku, String(selectedProduct.name).slice(0, 120), data.productType, 'image/png', cutout,
          data.sourceImageId, source.mime, source.blob).run();
        return json({ sku, approved: false, state: 'draft' });
      }
      if (data.action === 'approve') {
        if (data.confirmSku !== sku || data.confirmVisualReview !== true
          || !/^[a-f0-9]{64}$/.test(data.confirmReviewHash || '')) return fail('VISUAL_REVIEW_REQUIRED', 400);
        const asset = await env.CATALOG_DB.prepare(
          'SELECT product_type,cutout_mime,cutout_blob,source_image_id,source_mime,source_blob FROM tryon_public_catalog WHERE sku=? LIMIT 1',
        ).bind(sku).first();
        const hash = asset ? await hashReview(sku, asset) : null;
        if (!hash) return fail('ASSET_NOT_READY', 409);
        if (hash !== data.confirmReviewHash) return fail('REVIEWED_ASSET_CHANGED', 409);
        const current = await photo(env.SOURCE_DB, selectedProduct, asset.source_image_id);
        if (!current || current.mime !== asset.source_mime || !equals(current.blob, bytes(asset.source_blob))) {
          return fail('SOURCE_CHANGED', 409);
        }
        const result = await env.CATALOG_DB.prepare(
          'UPDATE tryon_public_catalog SET approved=1,reviewed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP '
          + 'WHERE sku=? AND approved=0 AND product_type=? AND source_image_id=? AND cutout_blob=? AND source_blob=?',
        ).bind(sku, asset.product_type, asset.source_image_id, bytes(asset.cutout_blob), bytes(asset.source_blob)).run();
        if ((result.meta?.changes ?? result.changes) !== 1) return fail('REVIEWED_ASSET_CHANGED', 409);
        return json({ sku, approved: true, state: 'published' });
      }
      if (data.action === 'revoke') {
        await env.CATALOG_DB.prepare(
          'UPDATE tryon_public_catalog SET approved=0,updated_at=CURRENT_TIMESTAMP WHERE sku=?',
        ).bind(sku).run();
        return json({ sku, approved: false, state: 'revoked' });
      }
      return fail('INVALID_ACTION', 400);
    } catch {
      return fail('PUBLISH_FAILED', 503);
    }
  }
  return fail('NOT_FOUND', 404);
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (pathname.startsWith('/api/auth/')) return handleAuthRequest(request, env);
    if (request.method === 'GET' && ['/', '/admin', '/index.html', '/app.mjs', '/styles.css'].includes(pathname)) {
      if (!env.ASSETS) return fail('STATIC_UNAVAILABLE', 503);
      const destination = (pathname === '/admin' || pathname === '/') ? '/index.html' : pathname;
      const response = await env.ASSETS.fetch(new Request(new URL(destination, request.url), request));
      const headers = new Headers(response.headers);
      headers.set('cache-control', 'private, no-store');
      headers.set('x-content-type-options', 'nosniff');
      headers.set('referrer-policy', 'no-referrer');
      headers.set('content-security-policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
      return new Response(response.body, { status: response.status, headers });
    }
    return publishApi(request, env);
  },
};
