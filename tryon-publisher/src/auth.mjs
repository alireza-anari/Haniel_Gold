const COOKIE = '__Host-hg-owner-session';
const SESSION_TTL = 8 * 60 * 60;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

const json = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'private, no-store',
    pragma: 'no-cache',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    ...extra,
  },
});
const fail = (code, status) => json({ error: code }, status);

function encodeBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function decodeBase64Url(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}
function constantTimeEqual(left, right) {
  const a = encoder.encode(String(left));
  const b = encoder.encode(String(right));
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) difference |= (a[i] || 0) ^ (b[i] || 0);
  return difference === 0;
}
function authConfigured(env) {
  return typeof env.OWNER_PASSWORD === 'string' && env.OWNER_PASSWORD.length >= 32
    && typeof env.SESSION_SECRET === 'string' && env.SESSION_SECRET.length >= 32;
}
async function sessionKey(env) {
  if (typeof env.SESSION_SECRET !== 'string' || env.SESSION_SECRET.length < 32) return null;
  return crypto.subtle.importKey('raw', encoder.encode(env.SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
function cookieValue(request) {
  const header = request.headers.get('cookie') || '';
  const matches = header.split(';').map((part) => part.trim())
    .filter((part) => part.startsWith(`${COOKIE}=`));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(COOKIE.length + 1);
  return value.length <= 2048 ? value : null;
}
export function originMatches(request) {
  return request.headers.get('origin') === new URL(request.url).origin;
}
export function csrfMatches(request, session) {
  const supplied = request.headers.get('x-csrf-token') || '';
  return typeof session?.csrf === 'string' && constantTimeEqual(supplied, session.csrf);
}
export async function readOwnerSession(request, env, now = Math.floor(Date.now() / 1000)) {
  const token = cookieValue(request);
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || parts[0].length > 1400 || parts[1].length > 100) return null;
  const key = await sessionKey(env);
  if (!key) return null;
  const signature = decodeBase64Url(parts[1]);
  const payload = decodeBase64Url(parts[0]);
  if (!signature || !payload) return null;
  try {
    const valid = await crypto.subtle.verify('HMAC', key, signature, encoder.encode(parts[0]));
    if (!valid) return null;
    const claims = JSON.parse(decoder.decode(payload));
    if (claims?.v !== 1 || claims?.sub !== 'owner'
      || !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp)
      || claims.iat > now + 60 || claims.exp <= now
      || claims.exp - claims.iat > SESSION_TTL
      || typeof claims.csrf !== 'string' || !/^[A-Za-z0-9_-]{32,80}$/.test(claims.csrf)) return null;
    return claims;
  } catch {
    return null;
  }
}
async function createSession(env, now) {
  const key = await sessionKey(env);
  if (!key) throw new Error('SESSION_SECRET_NOT_CONFIGURED');
  const csrfBytes = crypto.getRandomValues(new Uint8Array(32));
  const claims = { v: 1, sub: 'owner', iat: now, exp: now + SESSION_TTL, csrf: encodeBase64Url(csrfBytes) };
  const payload = encodeBase64Url(encoder.encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return { token: `${payload}.${encodeBase64Url(new Uint8Array(signature))}`, csrf: claims.csrf };
}
async function parseJson(request, maxBytes = 2048) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return null;
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxBytes) return null;
  const text = await request.text();
  if (encoder.encode(text).length > maxBytes) return null;
  try { return JSON.parse(text); } catch { return null; }
}
async function rateLimitLogin(request, env) {
  if (!env.LOGIN_LIMITER || typeof env.LOGIN_LIMITER.limit !== 'function') return null;
  const ip = request.headers.get('cf-connecting-ip');
  if (!ip || ip.length > 64) return null;
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(ip));
  const key = encodeBase64Url(new Uint8Array(digest));
  try {
    const result = await env.LOGIN_LIMITER.limit({ key });
    return result?.success === true;
  } catch {
    return null;
  }
}
function sessionCookie(token) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL}`;
}
function clearedCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

export async function handleAuthRequest(request, env, { now = Math.floor(Date.now() / 1000) } = {}) {
  const path = new URL(request.url).pathname;
  if (path === '/api/auth/session' && request.method === 'GET') {
    if (!authConfigured(env)) return fail('AUTH_NOT_CONFIGURED', 503);
    const session = await readOwnerSession(request, env, now);
    return json(session ? { authenticated: true, csrf: session.csrf } : { authenticated: false });
  }
  if (path === '/api/auth/login' && request.method === 'POST') {
    if (!originMatches(request)) return fail('INVALID_ORIGIN', 403);
    if (!authConfigured(env)) return fail('AUTH_NOT_CONFIGURED', 503);
    const data = await parseJson(request);
    if (!data || typeof data !== 'object' || Array.isArray(data)
      || typeof data.password !== 'string' || data.password.length > 256) return fail('INVALID_REQUEST', 400);
    const allowed = await rateLimitLogin(request, env);
    if (allowed === null) return fail('RATE_LIMIT_UNAVAILABLE', 503);
    if (!allowed) return fail('TOO_MANY_ATTEMPTS', 429);
    if (!constantTimeEqual(data.password, env.OWNER_PASSWORD)) return fail('INVALID_CREDENTIALS', 401);
    const session = await createSession(env, now);
    return json({ authenticated: true, csrf: session.csrf }, 200, { 'set-cookie': sessionCookie(session.token) });
  }
  if (path === '/api/auth/logout' && request.method === 'POST') {
    if (!originMatches(request)) return fail('INVALID_ORIGIN', 403);
    const session = await readOwnerSession(request, env, now);
    if (session && !csrfMatches(request, session)) return fail('CSRF_REJECTED', 403);
    return json({ authenticated: false }, 200, { 'set-cookie': clearedCookie() });
  }
  return fail('NOT_FOUND', 404);
}
