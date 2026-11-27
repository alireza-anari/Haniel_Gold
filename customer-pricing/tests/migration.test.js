import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('migration adds public price settings and one gold-rate cache without changing sales history', () => {
  const sql = read('../../telegram-miniapp/db/migrations/0003_public_pricing.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS product_public_pricing/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS gold_rate_state/);
  assert.match(sql, /INSERT OR IGNORE INTO product_public_pricing/);
  assert.match(sql, /WHERE s\.product_id=p\.id AND s\.voided=0 ORDER BY s\.id DESC LIMIT 1/);
  assert.match(sql, /VALUES\(1, 0, '', 1\)/);
  assert.doesNotMatch(sql, /DELETE FROM (products|sales)/i);
  assert.match(sql, /enabled INTEGER NOT NULL DEFAULT 0/);
});

test('customer Worker never exposes manager-only financial columns in its public query', () => {
  const worker = read('../src/index.js');
  assert.match(worker, /JOIN product_public_pricing pp ON pp\.product_id=p\.id AND pp\.enabled=1/);
  assert.doesNotMatch(worker, /SELECT[^;]*(supplier|customer|purchase_cost|net_profit)/is);
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
