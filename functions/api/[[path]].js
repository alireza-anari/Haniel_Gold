/* HANI-EL GOLD — same-origin staging API bridge.
 * STAGING_BACKEND_ORIGIN is configured in Cloudflare Pages runtime settings.
 * Never put private keys or a backend password in this origin.
 * Absent/unusable origin: fail closed, leave the static preview unaffected.
 */
const disabled = () => new Response(JSON.stringify({error:'STAGING_BACKEND_NOT_CONFIGURED'}), {
  status:503,
  headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'},
});
export async function onRequest({request,env}) {
  const publicUrl = new URL(request.url);
  if (!publicUrl.pathname.startsWith('/api/v1/')) {
    return new Response('Not found', {status:404,headers:{'Cache-Control':'no-store'}});
  }
  const rawOrigin = String(env.STAGING_BACKEND_ORIGIN || '').trim();
  if (!rawOrigin) return disabled();
  let target;
  try {
    const origin = new URL(rawOrigin);
    if (origin.protocol !== 'https:' || origin.username || origin.password ||
        origin.pathname !== '/' || origin.search || origin.hash) return disabled();
    target = new URL(publicUrl.pathname.substring('/api'.length) + publicUrl.search, origin);
  } catch { return disabled(); }
  const headers = new Headers(request.headers);
  for (const key of ['host','cf-connecting-ip','x-real-ip','x-forwarded-host','x-forwarded-proto','x-forwarded-for']) {
    headers.delete(key);
  }
  try {
    const upstream = await fetch(target, {
      method:request.method,
      headers,
      body:(request.method==='GET'||request.method==='HEAD')?undefined:request.body,
      redirect:'manual',
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      return new Response(JSON.stringify({error:'UNEXPECTED_UPSTREAM_REDIRECT'}),{
        status:502,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}
      });
    }
    const response = new Response(upstream.body, upstream);
    response.headers.set('Cache-Control','no-store');
    response.headers.set('X-Content-Type-Options','nosniff');
    return response;
  } catch {
    return new Response(JSON.stringify({error:'STAGING_API_UNAVAILABLE'}),{
      status:502,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}
    });
  }
}
