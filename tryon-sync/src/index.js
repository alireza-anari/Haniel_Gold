/* Private one-way manager -> customer catalog integrity check.
 * This scheduled Worker never serves customer/admin routes.
 * It reads only the owner-selected SKU/name/image from Manager D1.
 * After approval, source content is immutable: changes revoke publication instead of silently replacing reviewed media.
 * The separate PUBLIC catalog is the ONLY DB accessible to customer Worker.
 */
const SKU = /^HG-[A-F0-9]{12}$/;
const MAX_SYNC = 100;
const MAX_BLOB = 400 * 1024;

const bytes = (value) => value instanceof Uint8Array
  ? value
  : value instanceof ArrayBuffer
    ? new Uint8Array(value)
    : Array.isArray(value)
      ? Uint8Array.from(value)
      : null;

const equalBytes = (left, right) => {
  const a = bytes(left);
  const b = bytes(right);
  if (!a || !b || a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
};

const isProductPhoto = (blob, mime) => {
  if (!blob || blob.length < 16 || blob.length > MAX_BLOB) return false;
  if (mime === 'image/png') return [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => blob[index] === value);
  if (mime === 'image/jpeg') return blob[0] === 255 && blob[1] === 216 && blob[2] === 255;
  if (mime === 'image/webp') {
    return blob[0] === 82 && blob[1] === 73 && blob[2] === 70 && blob[3] === 70
      && blob[8] === 87 && blob[9] === 69 && blob[10] === 66 && blob[11] === 80;
  }
  return false;
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
  async fetch() {
    return new Response('Not Found', {
      status: 404,
      headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
    });
  },

  async scheduled(_event, env) {
    if (env.SYNC_ENABLED !== '1' || !env.SOURCE_DB || !env.CATALOG_DB) return;
    await syncApprovedNamesAndImages(env.SOURCE_DB, env.CATALOG_DB);
  },
};
