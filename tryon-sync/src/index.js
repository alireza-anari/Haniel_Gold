/* Private Manager -> publisher source service and public-catalog integrity checker.
 * This Worker has no public route. Publisher calls its narrow read API via Service Binding.
 * Manager D1 is bound ONLY here. Queries are fixed, parameterized SELECT statements.
 * Scheduled validation never replaces reviewed public content; stale approvals are revoked.
 */
const SKU = /^HG-[A-F0-9]{12}$/;
const MAX_SYNC = 100;
const MAX_BLOB = 400 * 1024;
const SECRET_HEADER = 'x-hg-source-secret';
const encoder = new TextEncoder();

const bytes = (value) => value instanceof Uint8Array
  ? value
  : value instanceof ArrayBuffer
    ? new Uint8Array(value)
    : Array.isArray(value)
      ? Uint8Array.from(value)
      : null;

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  },
});
const notFound = () => new Response('Not Found', {
  status: 404,
  headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
});
const unavailable = () => json({ error: 'SOURCE_UNAVAILABLE' }, 503);

function constantTimeEqual(left, right) {
  const a = encoder.encode(String(left));
  const b = encoder.encode(String(right));
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) difference |= (a[i] || 0) ^ (b[i] || 0);
  return difference === 0;
}

function authorizedInternalRequest(request, env) {
  const expected = env.SOURCE_API_SECRET;
  const supplied = request.headers.get(SECRET_HEADER) || '';
  return typeof expected === 'string' && expected.length >= 32
    && supplied.length >= 32 && supplied.length <= 128
    && constantTimeEqual(supplied, expected);
}

function isProductPhoto(blob, mime) {
  if (!blob || blob.length < 16 || blob.length > MAX_BLOB) return false;
  if (mime === 'image/png') return [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => blob[index] === value);
  if (mime === 'image/jpeg') return blob[0] === 255 && blob[1] === 216 && blob[2] === 255;
  if (mime === 'image/webp') {
    return blob[0] === 82 && blob[1] === 73 && blob[2] === 70 && blob[3] === 70
      && blob[8] === 87 && blob[9] === 69 && blob[10] === 66 && blob[11] === 80;
  }
  return false;
}

async function internalSourceApi(request, env) {
  if (request.method !== 'GET' || !authorizedInternalRequest(request, env)) return notFound();
  if (!env.SOURCE_DB) return unavailable();

  const url = new URL(request.url);
  const path = url.pathname;

  try {
    if (path === '/internal/products') {
      const query = (url.searchParams.get('q') || '').trim().slice(0, 60);
      const rows = (await env.SOURCE_DB.prepare(
        'SELECT id,sku,name FROM products WHERE sku LIKE ? OR name LIKE ? ORDER BY id DESC LIMIT 40',
      ).bind('%' + query + '%', '%' + query + '%').all()).results || [];
      return json({
        items: rows.filter((row) => SKU.test(String(row.sku || '')) && typeof row.name === 'string')
          .map((row) => ({ sku: row.sku, name: row.name.slice(0, 120) })),
      });
    }

    const image = path.match(/^\/internal\/products\/(HG-[A-F0-9]{12})\/images\/([1-9][0-9]*)$/);
    if (image) {
      const product = await env.SOURCE_DB.prepare(
        'SELECT id FROM products WHERE sku=? LIMIT 1',
      ).bind(image[1]).first();
      if (!product || !Number.isSafeInteger(product.id)) return notFound();
      const row = await env.SOURCE_DB.prepare(
        'SELECT mime,image_blob FROM images WHERE id=? AND product_id=? LIMIT 1',
      ).bind(Number(image[2]), product.id).first();
      const blob = bytes(row?.image_blob);
      if (!isProductPhoto(blob, row?.mime)) return notFound();
      return new Response(blob, {
        status: 200,
        headers: {
          'content-type': row.mime,
          'cache-control': 'private, no-store',
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'no-referrer',
          'content-disposition': 'inline',
        },
      });
    }

    const imageList = path.match(/^\/internal\/products\/(HG-[A-F0-9]{12})\/images$/);
    if (imageList) {
      const product = await env.SOURCE_DB.prepare(
        'SELECT id FROM products WHERE sku=? LIMIT 1',
      ).bind(imageList[1]).first();
      if (!product || !Number.isSafeInteger(product.id)) return notFound();
      const rows = (await env.SOURCE_DB.prepare(
        'SELECT id,mime FROM images WHERE product_id=? ORDER BY id LIMIT 20',
      ).bind(product.id).all()).results || [];
      return json({
        images: rows.filter((row) => Number.isSafeInteger(row.id) && row.id > 0
          && ['image/png', 'image/jpeg', 'image/webp'].includes(row.mime))
          .map((row) => ({ id: row.id, mime: row.mime })),
      });
    }

    const selected = path.match(/^\/internal\/products\/(HG-[A-F0-9]{12})$/);
    if (selected) {
      const row = await env.SOURCE_DB.prepare(
        'SELECT id,sku,name FROM products WHERE sku=? LIMIT 1',
      ).bind(selected[1]).first();
      if (!row || row.sku !== selected[1] || typeof row.name !== 'string') return notFound();
      return json({ id: row.id, sku: row.sku, name: row.name.slice(0, 120) });
    }

    return notFound();
  } catch {
    return unavailable();
  }
}

const equalBytes = (left, right) => {
  const a = bytes(left);
  const b = bytes(right);
  if (!a || !b || a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
};

async function revokeStaleApproval(catalogDb, record) {
  await catalogDb.prepare(
    'UPDATE tryon_public_catalog SET approved=0,reviewed_at=NULL,source_mime=NULL,source_blob=NULL,updated_at=CURRENT_TIMESTAMP '
    + 'WHERE sku=? AND approved=1 AND name=? AND product_type=? AND cutout_blob=? '
    + 'AND source_image_id IS ? AND source_mime IS ? AND source_blob IS ? AND reviewed_at IS ?',
  ).bind(
    record.sku,
    record.name,
    record.product_type,
    record.cutout_blob,
    record.source_image_id,
    record.source_mime,
    record.source_blob,
    record.reviewed_at,
  ).run();
}

export async function syncApprovedNamesAndImages(sourceDb, catalogDb) {
  const approved = (await catalogDb.prepare(
    'SELECT sku,name,product_type,cutout_blob,source_image_id,source_mime,source_blob,reviewed_at '
    + 'FROM tryon_public_catalog WHERE approved=1 ORDER BY sku LIMIT 100',
  ).all()).results || [];

  let verified = 0;
  let revoked = 0;
  let photos = 0;

  for (const record of approved.slice(0, MAX_SYNC)) {
    if (!SKU.test(String(record?.sku || ''))) continue;

    const product = await sourceDb.prepare(
      'SELECT id,sku,name FROM products WHERE sku=? LIMIT 1',
    ).bind(record.sku).first();

    let valid = Boolean(
      product
      && product.sku === record.sku
      && typeof product.name === 'string'
      && product.name.trim()
      && product.name.slice(0, 120) === record.name
      && Number.isSafeInteger(record.source_image_id)
      && record.source_image_id > 0,
    );

    let currentImage = null;
    if (valid) {
      currentImage = await sourceDb.prepare(
        'SELECT mime,image_blob FROM images WHERE id=? AND product_id=? LIMIT 1',
      ).bind(record.source_image_id, product.id).first();

      const currentBlob = bytes(currentImage?.image_blob);
      valid = Boolean(
        isProductPhoto(currentBlob, currentImage?.mime)
        && currentImage.mime === record.source_mime
        && equalBytes(currentBlob, record.source_blob),
      );
    }

    if (!valid) {
      await revokeStaleApproval(catalogDb, record);
      revoked++;
      continue;
    }

    verified++;
    photos++;
  }

  return { verified, revoked, photos };
}

export default {
  async fetch(request, env) {
    return internalSourceApi(request, env);
  },

  async scheduled(_event, env) {
    if (env.SYNC_ENABLED !== '1' || !env.SOURCE_DB || !env.CATALOG_DB) return;
    await syncApprovedNamesAndImages(env.SOURCE_DB, env.CATALOG_DB);
  },
};
