import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('public pricing and shared gold market migrations use safe defaults without rewriting business data', () => {
  const publicSql = read('../../telegram-miniapp/db/migrations/0003_public_pricing.sql');
  const marketSql = read('../../telegram-miniapp/db/migrations/0004_gold_market_policy.sql');
  assert.match(publicSql, /CREATE TABLE IF NOT EXISTS product_public_pricing/);
  assert.match(publicSql, /enabled INTEGER NOT NULL DEFAULT 0/);
  assert.doesNotMatch(publicSql, /INSERT|UPDATE|DELETE|DROP/i);
  assert.match(marketSql, /CREATE TABLE IF NOT EXISTS gold_market_state/);
  assert.match(marketSql, /CREATE TABLE IF NOT EXISTS gold_rate_audit/);
  assert.match(marketSql, /CREATE TABLE IF NOT EXISTS pricing_policy/);
  assert.match(marketSql, /INSERT OR IGNORE INTO gold_market_state\(id,blocked\) VALUES\(1,1\)/);
  assert.match(marketSql, /INSERT OR IGNORE INTO pricing_policy\(id,approved\) VALUES\(1,0\)/);
  assert.doesNotMatch(marketSql, /INSERT\s+INTO\s+(products|sales)|UPDATE\s+(products|sales)|DELETE\s+FROM\s+(products|sales)/i);
});

test('customer Worker uses the same owner-approved market rate and policy as the main site', () => {
  const worker = read('../src/index.js');
  assert.match(worker, /dynamicContext/);
  assert.match(worker, /marketPublic/);
  assert.match(worker, /syncRate/);
  assert.doesNotMatch(worker, /gold_rate_state|fetchServix/);
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
  assert.match(worker, /syncRate\(env\)/);
  assert.match(worker, /request.method !== 'GET'/);
});
