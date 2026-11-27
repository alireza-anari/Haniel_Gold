import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('public pricing configuration is manager-only and stored separately from sales history', () => {
  const worker = read('../src/index.js');
  const app = read('../public/app.js');
  const migration = read('../db/migrations/0003_public_pricing.sql');
  assert.match(worker, /product_public_pricing/);
  assert.match(worker, /if\(publicPricing&&m==='GET'\)\s*\{\s*only\(roles\)/);
  assert.match(worker, /if\(publicPricing&&m==='PUT'\)\s*\{\s*only\(roles\)/);
  assert.match(app, /public-pricing-form/);
  assert.match(app, /فعال‌سازی نمایش قیمت این محصول/);
  assert.match(migration, /enabled INTEGER NOT NULL DEFAULT 0/);
});
