import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleAuthRequest } from '../src/auth.mjs';

const OWNER_PASSWORD = 'haniel-owner-password-for-tests-2026-strong';
const SESSION_SECRET = 'session-signing-secret-for-unit-tests-2026-long';
const now = 1_800_000_000;
function fixture(overrides = {}) {
  const calls = [];
  const env = {
    OWNER_PASSWORD,
    SESSION_SECRET,
    LOGIN_LIMITER: { async limit(input) { calls.push(input); return { success: true }; } },
    ...overrides,
  };
  return { env, calls };
}
function request(path, method = 'GET', body, options = {}) {
  return new Request(`https://publisher.example.test${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(method === 'POST' ? { origin: options.origin || 'https://publisher.example.test' } : {}),
      ...(options.ip ? { 'cf-connecting-ip': options.ip } : { 'cf-connecting-ip': '203.0.113.7' }),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.csrf ? { 'x-csrf-token': options.csrf } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function login(env, password = OWNER_PASSWORD, at = now) {
  return handleAuthRequest(request('/api/auth/login', 'POST', { password }), env, { now: at });
}
function cookieFrom(response) {
  return response.headers.get('set-cookie').split(';')[0];
}

test('owner login creates an HttpOnly Secure Strict cookie and CSRF token', async () => {
  const f = fixture();
  const response = await login(f.env);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.authenticated, true);
  assert.match(data.csrf, /^[A-Za-z0-9_-]{43}$/);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\\//);
  assert.equal(f.calls.length, 1);
  const session = await handleAuthRequest(request('/api/auth/session', 'GET', undefined, { cookie: cookieFrom(response) }), f.env, { now: now + 1 });
  assert.deepEqual(await session.json(), { authenticated: true, csrf: data.csrf });
});

test('wrong password is rejected without creating a session', async () => {
  const f = fixture();
  const response = await login(f.env, 'incorrect-password');
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.deepEqual(await response.json(), { error: 'INVALID_CREDENTIALS' });
});

test('missing secrets or rate limiter fail closed', async () => {
  const a = await login({ OWNER_PASSWORD: 'short', SESSION_SECRET });
  assert.equal(a.status, 503);
  const b = await login({ OWNER_PASSWORD, SESSION_SECRET });
  assert.equal(b.status, 503);
});

test('login rejects cross-origin requests before checking credentials', async () => {
  const f = fixture();
  const response = await handleAuthRequest(request('/api/auth/login', 'POST', { password: OWNER_PASSWORD }, {
    origin: 'https://attacker.example',
  }), f.env, { now });
  assert.equal(response.status, 403);
  assert.equal(f.calls.length, 0);
});

test('rate-limited login fails closed', async () => {
  const f = fixture({ LOGIN_LIMITER: { async limit() { return { success: false }; } } });
  const response = await login(f.env);
  assert.equal(response.status, 429);
});

test('tampered and expired sessions are not authenticated', async () => {
  const f = fixture();
  const response = await login(f.env);
  const cookie = cookieFrom(response);
  const [name, token] = cookie.split('=');
  const parts = token.split('.');
  parts[1] = `${parts[1].slice(0, -1)}${parts[1].endsWith('A') ? 'B' : 'A'}`;
  const tampered = await handleAuthRequest(request('/api/auth/session', 'GET', undefined, { cookie: `${name}=${parts.join('.')}` }), f.env, { now: now + 1 });
  assert.deepEqual(await tampered.json(), { authenticated: false });
  const expired = await handleAuthRequest(request('/api/auth/session', 'GET', undefined, { cookie }), f.env, { now: now + 8 * 60 * 60 + 1 });
  assert.deepEqual(await expired.json(), { authenticated: false });
});

test('logout requires same-origin and the session CSRF token', async () => {
  const f = fixture();
  const response = await login(f.env);
  const data = await response.json();
  const cookie = cookieFrom(response);
  const rejected = await handleAuthRequest(request('/api/auth/logout', 'POST', {}, { cookie }), f.env, { now: now + 1 });
  assert.equal(rejected.status, 403);
  const logout = await handleAuthRequest(request('/api/auth/logout', 'POST', {}, { cookie, csrf: data.csrf }), f.env, { now: now + 1 });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
});
