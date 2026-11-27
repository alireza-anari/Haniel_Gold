import { buildPriceKeyboard } from './telegram-keyboard.js';
import { readFile } from 'node:fs/promises';

const [mappingPath] = process.argv.slice(2);
const { BOT_TOKEN, CHANNEL_ID, PRICE_APP_LINK, DRY_RUN } = process.env;

if (!mappingPath || !BOT_TOKEN || !CHANNEL_ID || !PRICE_APP_LINK) {
  console.error('Usage: BOT_TOKEN=... CHANNEL_ID=... PRICE_APP_LINK=https://t.me/<bot>/<app> node scripts/add-price-buttons.mjs posts.json');
  process.exit(2);
}

const appBase = new URL(PRICE_APP_LINK);
if (appBase.protocol !== 'https:' || appBase.hostname !== 't.me' || appBase.pathname.split('/').filter(Boolean).length !== 2) {
  throw new Error('PRICE_APP_LINK must be a Telegram Direct Mini App URL: https://t.me/<bot_username>/<short_name>');
}

const entries = JSON.parse(await readFile(mappingPath, 'utf8'));
if (!Array.isArray(entries) || entries.length < 1 || entries.length > 200) {
  throw new Error('Mapping file must contain 1..200 post entries.');
}

for (const item of entries) {
  const messageId = Number(item.message_id);
  const productId = Number(item.product_id);
  if (!Number.isSafeInteger(messageId) || messageId < 1 ||
      !Number.isSafeInteger(productId) || productId < 1) {
    throw new Error('Each entry requires positive integer message_id and product_id.');
  }

  const url = new URL(appBase);
  url.searchParams.set('startapp', `product_${productId}`);
  url.searchParams.set('mode', 'compact');

  const keyboard = buildPriceKeyboard(item.existing_keyboard, url.toString());

  if (DRY_RUN === '1') {
    console.log(JSON.stringify({ message_id: messageId, product_id: productId, url: url.toString() }));
    continue;
  }

  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageReplyMarkup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHANNEL_ID,
      message_id: messageId,
      reply_markup: { inline_keyboard: keyboard }
    })
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok !== true) {
    throw new Error(`Telegram rejected message ${messageId}: ${result.description || response.status}`);
  }
  console.log(`Button added: message=${messageId}, product=${productId}`);
}
