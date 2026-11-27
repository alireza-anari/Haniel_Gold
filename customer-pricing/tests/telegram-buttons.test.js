import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildPriceKeyboard } from '../scripts/telegram-keyboard.js';

test('price button is added while preserving existing Telegram buttons', () => {
  const existing = [[{ text: 'راهنما', url: 'https://example.com/help' }]];
  const result = buildPriceKeyboard(existing, 'https://t.me/bot/pricing?startapp=product_15');
  assert.equal(result.length, 2);
  assert.deepEqual(result[0], existing[0]);
  assert.deepEqual(result[1], [{ text: 'مشاهده قیمت', url: 'https://t.me/bot/pricing?startapp=product_15' }]);
  assert.equal(existing.length, 1);
});

test('price button insertion is idempotent', () => {
  const url = 'https://t.me/bot/pricing?startapp=product_15';
  const once = buildPriceKeyboard([], url);
  const twice = buildPriceKeyboard(once, url);
  assert.deepEqual(twice, once);
  assert.equal(twice.flat().filter(button => button.url === url).length, 1);
});

test('missing or malformed keyboard snapshots fail closed', () => {
  assert.throws(() => buildPriceKeyboard(undefined, 'https://t.me/bot/pricing'), /explicit inline_keyboard/);
  assert.throws(() => buildPriceKeyboard([{}], 'https://t.me/bot/pricing'), /inline keyboard rows/);
});
