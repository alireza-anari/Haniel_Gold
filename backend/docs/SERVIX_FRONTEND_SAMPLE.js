/* HANI-EL GOLD V5 — market status read from own Django backend only.
   Servix API key is NEVER present in browser JS. */
export async function getGoldMarketStatus({baseUrl = ''} = {}) {
  const response = await fetch(`${baseUrl}/v1/market/gold`, {
    method: 'GET',
    credentials: 'same-origin',
    headers: {Accept: 'application/json'},
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('HANIEL_BACKEND_UNAVAILABLE');
  const data = await response.json();
  const ready = data.status === 'ready' && data.pricingStatus === 'ready';
  return {
    ready,
    message: ready ? 'نرخ معتبر دریافت شد' : 'استعلام قیمت موقتاً در دسترس نیست',
    sourceTime: data.observedAt || null,
    rateTomanPerGram: ready ? data.tomanPerGram : null,
  };
}
