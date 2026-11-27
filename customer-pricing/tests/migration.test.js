import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('public pricing and shared gold market migrations use safe defaults without rewriting business data', () => {
  const publicSql = read('../../telegram-miniapp/db/migrations/0003_public_pricing.sql');
  const marketSql = read('../../telegram-miniapp/db/migrations/0004_gold_market_policy.sql');
  assert.match(publicSql, /CREATE TABLE IF NOT EXISTS product_public_pricing/);
  assert.match(publicSql, /enabled INTEGER NOT NULL DEFAULT 0/);
  assert.ok(!/\bINSERT\s+INTO\b|\bUPDATE\s+\w|\bDELETE\s+FROM\b|\bDROP\s+TABLE\b/i.test(publicSql));
  assert.match(marketSql, /CREATE TABLE IF NOT EXISTS gold_market_state/);
  assert.match(marketSql, /CREATE TABLE IF NOT EXISTS gold_rate_audit/);
  assert.match(marketSql, /CREATE TABLE IF NOT EXISTS pricing_policy/);
  assert.match(marketSql, /CREATE TABLE IF NOT EXISTS gold_rate_policy/);
  assert.ok(!/\bINSERT\s+INTO\b|\bUPDATE\s+\w|\bDELETE\s+FROM\b|\bDROP\s+TABLE\b/i.test(marketSql));
});

test('customer Worker uses the shared owner-approved gold rate and has no independent rate cache', () => {
  const worker = read('../src/index.js');
  assert.match(worker, /marketRateContext/);
  assert.match(worker, /syncRateWithRatePolicy/);
  assert.doesNotMatch(worker, /gold_rate_state|fetchServix|dynamicContext|marketPublic/);
  assert.doesNotMatch(worker, /SELECT[^;]*(supplier|customer|purchase_cost|net_profit)/is);
  assert.ok(!worker.includes('p.purchase_gold_rate') && !worker.includes('p.purchase_labor_pct'));
  assert.match(worker, /scheduled\(controller, env, ctx\)/);
  assert.match(read('../public/app.js'), /tgWebAppStartParam/);
});

test('30-minute cron only updates the shared gold-market state, never product prices or sales', () => {
  const worker = read('../src/index.js');
  const config = read('../wrangler.toml');
  assert.ok(config.includes('crons = ["*/30 * * * *"]'));
  assert.doesNotMatch(worker, /UPDATE\s+(products|sales)|INSERT\s+INTO\s+(products|sales)/i);
  assert.match(worker, /syncRateWithRatePolicy\(env\)/);
  assert.match(worker, /request.method !== 'GET'/);
});
