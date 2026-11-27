export function buildPriceKeyboard(existingKeyboard, priceUrl) {
  if (!Array.isArray(existingKeyboard)) {
    throw new TypeError('existing_keyboard must be an explicit inline_keyboard array; use [] when the post has no buttons.');
  }
  for (const row of existingKeyboard) {
    if (!Array.isArray(row) || row.some(button => !button || typeof button.text !== 'string')) {
      throw new TypeError('existing_keyboard must contain Telegram inline keyboard rows.');
    }
  }

  const keyboard = existingKeyboard.map(row => [...row]);
  const alreadyPresent = keyboard.some(row => row.some(button => button.url === priceUrl));
  if (!alreadyPresent) keyboard.push([{ text: 'مشاهده قیمت', url: priceUrl }]);
  return keyboard;
}
