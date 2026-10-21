// Illustration for the real V5 storefront integration. Does not make any payment.
// Refreshes the visible catalog after provider data changes; don't trust browser prices.
const backendRoot = '/v1';
async function getGoldRate(signal) {
  const response = await fetch(`${backendRoot}/market/gold`, {signal,credentials:'same-origin',cache:'no-store'});
  if (!response.ok) throw new Error('Market service temporarily unavailable');
  return response.json();
}
async function getProducts(signal) {
  const response = await fetch(`${backendRoot}/catalog/products?limit=24`, {signal,credentials:'same-origin',cache:'no-store'});
  if (!response.ok) throw new Error('Catalog temporarily unavailable');
  return response.json();
}
// Integrate with actual view state: on page load, focus and visibilitychange,
// then while active use a 60s timer (not once per product).
// If market.pricingStatus!=="ready", hide checkout CTA and show "قیمت در حال به‌روزرسانی".
// A cart quote ALWAYS requires a fresh server response and CSRF/session auth.
