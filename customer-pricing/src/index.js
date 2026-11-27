import { fetchServix } from '../../functions/_lib/gold-market.js';
import { buildPublicPrice } from './pricing.js';

const RATE_MAX_AGE_MS = 40 * 60 * 1000;
const RATE_COOLDOWN_MS = 25 * 60 * 1000;

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

async function rateState(db) {
  return first(db, 'SELECT * FROM gold_rate_state WHERE id=1');
}

async function currentRate(db, now = Date.now()) {
  const row = await rateState(db);
  if (!row || !Number.isSafeInteger(Number(row.rate_rial_per_gram)) ||
      Number(row.rate_rial_per_gram) < 1 || !Number(row.observed_at) ||
      !Number(row.valid_until) || Number(row.valid_until) <= now ||
      now - Number(row.observed_at) > RATE_MAX_AGE_MS) {
    return null;
  }
  return row;
}

async function productQuote(env, productId, now = Date.now()) {
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

  const rate = await currentRate(env.DB, now);
  if (!rate) {
    return json({
      error: 'نرخ معتبر طلا در دسترس نیست. پس از به‌روزرسانی نرخ دوباره تلاش کن.',
      code: 'RATE_STALE'
    }, 503);
  }

  let result;
  try {
    result = buildPublicPrice(product, {
      labor_pct: product.labor_pct,
      profit_pct: product.profit_pct,
      accessories: product.accessories,
      discount: product.discount,
      show_profit: product.show_profit
    }, Number(rate.rate_rial_per_gram), {
      observedAt: Number(rate.observed_at),
      fetchedAt: Number(rate.fetched_at)
    });
  } catch {
    return json({
      error: 'تنظیمات قیمت این محصول معتبر نیست. لطفاً با مدیریت تماس بگیر.',
      code: 'PRICING_INVALID'
    }, 409);
  }

  return json(result);
}

export async function syncGoldRate(env, { fetcher = fetch, now = Date.now() } = {}) {
  if (!env.DB) throw new Error('D1 binding DB is missing');
  await env.DB.prepare("INSERT OR IGNORE INTO gold_rate_state(id,last_attempt_at,last_error,version) VALUES(1,0,'',1)").run();
  const old = await rateState(env.DB);
  if (!old) throw new Error('gold_rate_state migration is missing');
  if (Number(old.last_attempt_at || 0) && now - Number(old.last_attempt_at) < RATE_COOLDOWN_MS) {
    return { status: 'cooldown' };
  }

  const claim = await env.DB.prepare(`
    UPDATE gold_rate_state
    SET last_attempt_at=?, version=version+1
    WHERE id=1 AND (last_attempt_at=0 OR last_attempt_at<=?)
  `).bind(now, now - RATE_COOLDOWN_MS).run();

  if (claim.meta?.changes !== 1) return { status: 'already_claimed' };

  let quote;
  try {
    quote = await fetchServix(env, fetcher, now);
  } catch (error) {
    const code = String(error?.code || 'RATE_PROVIDER_ERROR').slice(0, 60);
    await env.DB.prepare('UPDATE gold_rate_state SET last_error=?, version=version+1 WHERE id=1')
      .bind(code).run();
    return { status: 'failed', errorCode: code };
  }

  const current = await rateState(env.DB);
  if (current?.observed_at && quote.observedAt < Number(current.observed_at)) {
    await env.DB.prepare("UPDATE gold_rate_state SET last_error='NON_NEWER_OBSERVATION', version=version+1 WHERE id=1").run();
    return { status: 'unchanged' };
  }

  const validUntil = Math.min(now + RATE_MAX_AGE_MS, quote.observedAt + RATE_MAX_AGE_MS);
  if (current?.observed_at && quote.observedAt === Number(current.observed_at)) {
    if (Number(quote.rialPerGram) !== Number(current.rate_rial_per_gram)) {
      await env.DB.prepare("UPDATE gold_rate_state SET last_error='OBSERVATION_CONFLICT', version=version+1 WHERE id=1").run();
      return { status: 'unchanged' };
    }
    await env.DB.prepare("UPDATE gold_rate_state SET fetched_at=?, valid_until=?, last_error='', version=version+1 WHERE id=1")
      .bind(now, validUntil).run();
    return { status: 'unchanged', observedAt: quote.observedAt, fetchedAt: now };
  }
  await env.DB.prepare(`
    UPDATE gold_rate_state
    SET rate_rial_per_gram=?, observed_at=?, fetched_at=?, valid_until=?,
        last_error='', version=version+1
    WHERE id=1
  `).bind(quote.rialPerGram, quote.observedAt, now, validUntil).run();

  return { status: 'updated', observedAt: quote.observedAt, rateRialPerGram: quote.rialPerGram };
}

async function imageResponse(env, productId) {
  const row = await first(env.DB, `
    SELECT i.mime, i.image_blob
    FROM images i
    JOIN product_public_pricing pp ON pp.product_id=i.product_id AND pp.enabled=1 AND pp.profit_pct IS NOT NULL
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
      const rate = await currentRate(env.DB);
      return json({ ok: true, rateReady: !!rate, rateObservedAt: rate?.observed_at ?? null });
    }

    const imageMatch = /^\/api\/v1\/products\/(\d+)\/image$/.exec(path);
    if (imageMatch) return imageResponse(env, Number(imageMatch[1]));

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
    ctx.waitUntil(syncGoldRate(env).then(result => {
      console.log(JSON.stringify({ type: 'gold_rate_cron', ...result }));
    }).catch(error => {
      console.error(JSON.stringify({ type: 'gold_rate_cron_error', code: String(error?.code || 'INTERNAL') }));
    }));
  }
};
