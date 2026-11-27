import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildPublicPrice, rialToToman, rialPerGramToToman } from '../src/pricing.js';

const product = {
  id: 15,
  sku: 'HG-TEST-15',
  name: 'محصول آزمایشی',
  weight: '0.39',
  available: 2,
  cover_id: 8
};

test('public price uses the private manager fixed-point formula and converts Rials to Tomans', () => {
  const result = buildPublicPrice(product, {
    labor_pct: '7',
    profit_pct: '13.6055',
    accessories: '0',
    discount: '453',
    show_profit: 0
  }, 270000000, { observedAt: '2026-11-27T08:00:00.000Z', validUntil: '2026-11-27T08:40:00.000Z' }, 900);

  assert.equal(result.breakdown.finalToman, '12800000');
  assert.equal(Object.hasOwn(result.breakdown, 'taxToman'), false);
  assert.equal(result.breakdown.rawGoldToman, '10530000');
  assert.equal(result.breakdown.laborPercent, '7');
  assert.equal(result.breakdown.profitPercent, null);
  assert.equal(result.rate.tomanPerGram, '27000000');
  assert.equal(result.rate.validUntil, '2026-11-27T08:40:00.000Z');
  assert.equal(result.product.imageUrl, '/api/v1/products/15/image');
  assert.equal(result.product.available, true);
  assert.equal(Object.hasOwn(result, 'purchase_cost'), false);
  assert.equal(Object.hasOwn(result, 'net_profit'), false);
});

test('profit percentage is returned only when the owner explicitly enables it', () => {
  const result = buildPublicPrice(product, {
    labor_pct: '7', profit_pct: '13.6055', accessories: '0', discount: '0', show_profit: 1
  }, 270000000, {}, 900);
  assert.equal(result.breakdown.profitPercent, '13.6055');
});

test('Rial-to-Toman conversion rounds half-up using integer arithmetic', () => {
  assert.equal(rialToToman('127999999.905'), '12800000');
  assert.equal(rialToToman('127999994.9'), '12799999');
  assert.equal(rialPerGramToToman(270000005), '27000000.5');
});
