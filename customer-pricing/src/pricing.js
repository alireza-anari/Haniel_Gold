import { quote, dec, mul, fmt } from '../../telegram-miniapp/src/finance.js';

const SCALE = 1000000000000000n;

export function rialToToman(value) {
  const scaled = dec(value, 'مبلغ ریالی');
  return ((scaled + 5n * SCALE) / (10n * SCALE)).toString();
}

export function rialPerGramToToman(value) {
  const rial = BigInt(value);
  const whole = rial / 10n;
  const tenth = rial % 10n;
  return tenth === 0n ? whole.toString() : `${whole}.${tenth}`;
}

// Exact same approved manager formula: raw gold + labor + profit + accessories - discount.
// No new tax rate or customer-only fee is introduced by this Mini App.
export function buildPublicPrice(product, pricing, rateRial, rateMeta = {}) {
  const calculationProduct = { ...product, purchase_gold_rate: '0', purchase_labor_pct: '0' };
  const q = quote(calculationProduct, {
    quantity: 1,
    gold_rate: String(rateRial),
    labor_pct: pricing.labor_pct,
    profit_pct: pricing.profit_pct,
    accessories: pricing.accessories,
    discount: pricing.discount
  });

  const laborRial = fmt(mul(dec(q.labor_gold), dec(q.gold_rate)));

  return {
    product: {
      id: product.id,
      sku: product.sku,
      name: product.name,
      weightGrams: q.unit_weight,
      available: Number(product.available) > 0,
      imageUrl: product.cover_id ? `/api/v1/products/${product.id}/image` : null
    },
    rate: {
      currency: 'TOMAN',
      karat: 18,
      tomanPerGram: rialPerGramToToman(rateRial),
      observedAt: rateMeta.observedAt ? new Date(rateMeta.observedAt).toISOString() : null,
      validUntil: rateMeta.validUntil ? new Date(rateMeta.validUntil).toISOString() : null
    },
    breakdown: {
      currency: 'TOMAN',
      rawGoldToman: rialToToman(q.raw_price),
      laborPercent: q.labor_pct,
      laborToman: rialToToman(laborRial),
      profitPercent: Number(pricing.show_profit) === 1 ? q.profit_pct : null,
      profitToman: rialToToman(q.profit_rial),
      accessoriesToman: rialToToman(q.accessories),
      discountToman: rialToToman(q.discount),
      finalToman: rialToToman(q.final_price)
    }
  };
}
