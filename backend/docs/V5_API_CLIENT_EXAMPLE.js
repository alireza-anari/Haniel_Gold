/* Example for a future V5 integration, served from SAME ORIGIN as Django API.
 * No user token is ever stored in localStorage. Session uses HttpOnly cookies.
 * Adapt requestAPI in frontend app.js to call this function for CSRF-safe writes.
 */
let hanielCsrf = null;

export async function hanielApi(path, method = 'GET', data = undefined, extraHeaders = {}) {
  const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
  if (unsafe && !hanielCsrf) {
    const initial = await fetch('/v1/auth/csrf', { credentials: 'same-origin' });
    if (!initial.ok) throw new Error('CSRF_BOOTSTRAP_FAILED');
    hanielCsrf = (await initial.json()).csrfToken;
  }
  const headers = { 'Accept': 'application/json', ...extraHeaders };
  if (data !== undefined) headers['Content-Type'] = 'application/json';
  if (unsafe) headers['X-CSRFToken'] = hanielCsrf;
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers,
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const json = response.status === 204 ? null : await response.json();
  if (!response.ok) throw Object.assign(new Error('API_REQUEST_FAILED'), { status: response.status, details: json });
  // Login/logout rotates the CSRF secret; use refreshed token returned by server.
  if (json && json.csrfToken) hanielCsrf = json.csrfToken;
  return json;
}

// Example sequence:
// await hanielApi('/v1/auth/otp/request','POST',{ mobile: '09XXXXXXXXX' });
// await hanielApi('/v1/auth/otp/verify','POST',{ mobile:'09XXXXXXXXX',code:'******' });
// const account = await hanielApi('/v1/account/me');
// const quote = await hanielApi('/v1/cart/quote','POST', {items:[{productId:'REAL-ID', quantity:1}]});
// const order = await hanielApi('/v1/orders','POST',{quoteId:quote.quoteId,addressId:1},{'Idempotency-Key':crypto.randomUUID()});
