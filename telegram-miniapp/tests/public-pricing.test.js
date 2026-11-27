import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('public pricing configuration is owner-only and stored separately from sales history', () => {
  const worker = read('../src/index.js');
  const app = read('../public/app.js');
  const migration = read('../db/migrations/0003_public_pricing.sql');
  assert.match(worker, /product_public_pricing/);
  assert.match(worker, /SELECT id,labor_pct,profit_pct,accessories,discount FROM sales WHERE product_id=\? AND voided=0 ORDER BY id DESC LIMIT 1/);
  assert.match(worker, /id\.id!==String\(env\.OWNER_TELEGRAM_ID\)/);
  assert.doesNotMatch(worker, /SELECT role,display_name FROM users WHERE telegram_id/);
  assert.match(worker, /if\(publicPricing&&m==='GET'\)\s*\{\s*only\(roles\)/);
  assert.match(worker, /if\(publicPricing&&m==='PUT'\)\s*\{\s*only\(roles\)/);
  assert.match(app, /public-pricing-form/);
  assert.match(app, /فعال‌سازی نمایش قیمت این محصول/);
  assert.match(migration, /enabled INTEGER NOT NULL DEFAULT 0/);
});
