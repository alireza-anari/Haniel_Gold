import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('migration adds public price settings and one gold-rate cache without changing sales history', () => {
  const sql = read('../../telegram-miniapp/db/migrations/0003_public_pricing.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS product_public_pricing/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS gold_rate_state/);
  assert.doesNotMatch(sql, /DELETE FROM (products|sales)/i);
  assert.match(sql, /enabled INTEGER NOT NULL DEFAULT 0/);
  assert.ok(!/\b(INSERT|UPDATE|DELETE|DROP)\b/i.test(sql));
});

test('customer Worker never exposes manager-only financial columns in its public query', () => {
  const worker = read('../src/index.js');
  assert.match(worker, /JOIN product_public_pricing pp ON pp\.product_id=p\.id AND pp\.enabled=1/);
  assert.doesNotMatch(worker, /SELECT[^;]*(supplier|customer|purchase_cost|net_profit)/is);
  assert.ok(!worker.includes('p.purchase_gold_rate') && !worker.includes('p.purchase_labor_pct'));
  assert.match(worker, /fetchServix/);
  assert.match(worker, /scheduled\(controller, env, ctx\)/);
});

test('30-minute cron only writes the cached gold rate, never recalculates or stores product prices', () => {
  const worker = read('../src/index.js');
  const config = read('../wrangler.toml');
  assert.ok(config.includes('crons = ["*/30 * * * *"]'));
  assert.doesNotMatch(worker, /UPDATE\s+(products|sales)|INSERT\s+INTO\s+(products|sales)/i);
  assert.match(worker, /UPDATE gold_rate_state/);
  assert.match(worker, /request\.method !== 'GET'/);
});
