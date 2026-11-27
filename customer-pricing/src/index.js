import { marketRateContext, syncRateWithRatePolicy } from '../../functions/_lib/gold-market.js';
import { buildPublicPrice } from './pricing.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-robots-tag': 'noindex, nofollow'
  }
});

const first = (db, sql, ...args) =>
  (args.length ? db.prepare(sql).bind(...args) : db.prepare(sql)).first();

async function productQuote(env, productId) {
  const product = await first(env.DB, `
    SELECT
      p.id, p.sku, p.name, p.weight,
      p.purchased_qty - COALESCE((
        SELECT SUM(s.quantity) FROM sales s
        WHERE s.product_id=p.id AND s.voided=0
      ), 0) AS available,
      pp.labor_pct, pp.profit_pct, pp.accessories, pp.discount, pp.show_profit,
      (SELECT i.id FROM images i WHERE i.product_id=p.id ORDER BY i.id LIMIT 1) AS cover_id
    FROM products p
    JOIN product_public_pricing pp ON pp.product_id=p.id AND pp.enabled=1
    WHERE p.id=?
  `, productId);

  if (!product) return json({ error: 'قیمت این محصول برای نمایش عمومی فعال نشده است.', code: 'PRODUCT_NOT_PUBLIC' }, 404);
  if (product.profit_pct === null || String(product.profit_pct).trim() === '') {
    return json({ error: 'تنظیمات قیمت این محصول کامل نیست.', code: 'PRICING_NOT_READY' }, 409);
  }

  const context = await marketRateContext(env);
  if (context.status === 'blocked') {
    return json({ error: 'نرخ جدید طلا در انتظار بررسی و تأیید مالک است.', code: 'RATE_PENDING_REVIEW' }, 503);
  }
  if (context.status !== 'ready') {
    return json({ error: 'نرخ معتبر طلا در دسترس نیست. پس از به‌روزرسانی نرخ دوباره تلاش کن.', code: 'RATE_STALE' }, 503);
  }

  let result;
  try {
    result = buildPublicPrice(product, {
      labor_pct: product.labor_pct,
      profit_pct: product.profit_pct,
      accessories: product.accessories,
      discount: product.discount,
      show_profit: product.show_profit
    }, context.rateRial, context);
  } catch {
    return json({
      error: 'تنظیمات قیمت این محصول معتبر نیست. لطفاً با مدیریت تماس بگیر.',
      code: 'PRICING_INVALID'
    }, 409);
  }

  return json(result);
}

async function imageResponse(env, productId) {
  const row = await first(env.DB, `
    SELECT i.mime, i.image_blob
    FROM images i
    JOIN product_public_pricing pp ON pp.product_id=i.product_id AND pp.enabled=1 AND pp.profit_pct IS NOT NULL AND TRIM(pp.profit_pct)<>''
    WHERE i.product_id=?
    ORDER BY i.id
    LIMIT 1
  `, productId);

  const allowedMime = new Set(['image/jpeg', 'image/png', 'image/webp']);
  if (!row?.image_blob || !allowedMime.has(row.mime)) return json({ error: 'تصویر عمومی برای این محصول ثبت نشده است.' }, 404);
  return new Response(new Uint8Array(row.image_blob), {
    headers: {
      'content-type': row.mime,
      'cache-control': 'public, max-age=300',
      'x-content-type-options': 'nosniff'
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (!env.DB) return json({ error: 'سرویس موقتاً در دسترس نیست.' }, 503);
    if (request.method !== 'GET') return json({ error: 'روش درخواست پشتیبانی نمی‌شود.' }, 405);

    if (path === '/api/v1/health') {
      try {
        const market = await marketRateContext(env);
        return json({ ok: true, marketStatus: market.status, rateReady: market.status === 'ready' });
      } catch {
        return json({ ok: false, code: 'MARKET_NOT_INITIALIZED' }, 503);
      }
    }

    const imageMatch = /^\/api\/v1\/products\/(\d+)\/image$/.exec(path);
    if (imageMatch) {
      const imageProductId = Number(imageMatch[1]);
      if (!Number.isSafeInteger(imageProductId) || imageProductId < 1) return json({ error: 'شناسه محصول معتبر نیست.' }, 400);
      return imageResponse(env, imageProductId);
    }

    const productMatch = /^\/api\/v1\/products\/(\d+)$/.exec(path);
    if (productMatch) {
      const id = Number(productMatch[1]);
      if (!Number.isSafeInteger(id) || id < 1) return json({ error: 'شناسه محصول معتبر نیست.' }, 400);
      try {
        return await productQuote(env, id);
      } catch (error) {
        console.error(JSON.stringify({ type: 'public_price_error', code: String(error?.code || 'INTERNAL') }));
        return json({ error: 'محاسبه قیمت در حال حاضر امکان‌پذیر نیست.' }, 500);
      }
    }

    return json({ error: 'مسیر یافت نشد.' }, 404);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(syncRateWithRatePolicy(env).then(result => {
      console.log(JSON.stringify({
        type: 'gold_rate_cron',
        status: result.status,
        errorCode: result.errorCode || null
      }));
    }).catch(error => {
      console.error(JSON.stringify({
        type: 'gold_rate_cron_error',
        code: String(error?.code || 'INTERNAL')
      }));
    }));
  }
};
