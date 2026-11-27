import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('private manager and pricing controls require the configured owner', () => {
  const worker = read('../src/index.js');
  const app = read('../public/app.js');
  const migration = read('../db/migrations/0003_public_pricing.sql');
  assert.match(worker, /product_public_pricing/);
  assert.match(worker, /SELECT id,labor_pct,profit_pct,accessories,discount FROM sales WHERE product_id=\? AND voided=0 ORDER BY id DESC LIMIT 1/);
  assert.ok(!worker.includes("SELECT role,display_name FROM users WHERE telegram_id=?"));
  assert.match(worker,/فقط مالک دسترسی دارد/);
  assert.ok(worker.includes("if(publicPricing&&m==='GET'){\n  only(user.role==='owner');"));
  assert.ok(worker.includes("if(publicPricing&&m==='PUT'){\n  only(user.role==='owner');"));
  assert.ok(worker.includes("if(path==='/api/market'&&m==='GET'){\n  only(user.role==='owner');"));
  assert.ok(worker.includes("if(path==='/api/market/rate-policy'&&m==='POST'){\n  only(user.role==='owner');"));
  assert.match(worker, /approveRatePolicy/);
  assert.match(app, /const isOwner=\(\)=>session\?\.user\.role==='owner'/);
  assert.match(app, /public-pricing-form/);
  assert.match(app, /فعال‌سازی نمایش قیمت این محصول/);
  assert.match(app, /مدیریت نرخ طلا/);
  assert.match(migration, /enabled INTEGER NOT NULL DEFAULT 0/);
});
