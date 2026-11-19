# HANI-EL GOLD — Private Try-On Product Publisher

**Status: source code + automated tests. Not deployed or approved for production.**

This is a separate owner-only application in `tryon-publisher/`. It is not the private Telegram management Mini App and it is not the public customer Virtual Try-On Mini App.

## Architecture

| Component | Purpose |
|---|---|
| `telegram-miniapp/` | Existing private management Mini App; **untouched** |
| `haniel-gold-db` | Private manager D1; source of product SKU/name/images |
| `tryon-publisher/` | Separate owner publication UI and API |
| `haniel-tryon-public-test` | Separate customer catalog database, Preview only |
| `tryon-miniapp/` | Public customer Mini App; serves only reviewed catalog items |
| `tryon-sync/` | Older optional synchronizer; keep disabled |

The publisher reads only `products(id,sku,name)` and selected `images(id,product_id,mime,image_blob)`. It must never read sales, users, accounting, labor, suppliers, purchase costs, or other private columns. It writes only to the separate public catalog.

**Important D1 limitation:** a D1 binding is not inherently read-only. `SOURCE_DB` is intentionally absent from the current configuration. Do not add it until a separate least-privilege source-data design and security review are approved. The current Preview can authenticate and inspect the separate catalog, but product search from the Manager remains unavailable until that gate is resolved.

## Owner authentication — no Cloudflare Access subscription

The publisher uses its own server-side owner authentication. Cloudflare Access / Zero Trust onboarding is **not required**.

Required Worker secrets (never commit these to GitHub):
- `OWNER_PASSWORD`: a randomly generated password with at least 32 characters.
- `SESSION_SECRET`: a separate, randomly generated secret with at least 32 characters.

Set both as **Secrets** (not plain-text variables) in Cloudflare Dashboard → Workers & Pages → `haniel-tryon-publisher-private` → Settings → Variables and Secrets. Set them for the Preview environment before testing the login.

Generate independent values locally, for example in PowerShell:

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

Use the first output for `OWNER_PASSWORD` and the second for `SESSION_SECRET`. Do not send either value in chat or commit them to the repository.

Security controls:
- HMAC-SHA-256 signed, eight-hour owner sessions.
- `HttpOnly; Secure; SameSite=Strict` host-only cookie.
- Same-origin checks and a per-session CSRF token for mutations and logout.
- Constant-time password comparison.
- Cloudflare Rate Limiting binding: five login attempts per minute per client IP and Cloudflare location. Cloudflare documents these counters as approximate and local to each location, so the high-entropy password remains essential.
- Missing secrets or missing rate-limit binding fail closed.
- The static login shell contains no product data; all product/catalog APIs require a valid owner session.

## Publishing workflow

1. Search for a product by SKU/name (requires the future, separately reviewed source binding).
2. Select an existing Manager image belonging to that exact product.
3. Upload the matching transparent RGBA PNG (maximum 400 KiB).
4. Save a draft; it remains `approved=0`.
5. Compare the original and cutout side by side.
6. Enter the exact SKU and confirm visual review.
7. The server verifies the SHA-256 fingerprint and confirms that the source image has not changed before approval.
8. Revoke sets `approved=0` without changing Manager data.

The source image must fit the existing 400 KiB pilot limit. Remote-only or oversized images are not silently transformed or published.

## Environment and release gates

- Preview Worker: `haniel-tryon-publisher-private`; workers.dev is enabled for Preview only.
- Preview `CATALOG_DB`: `haniel-tryon-public-test` only.
- `SOURCE_DB`: deliberately not bound.
- No Production catalog binding, no custom domain, no Access policy, and no production deployment in this change.
- The public customer Worker and private Telegram Manager remain separate and unchanged.
- Do not merge this Draft PR or publish real products until authentication, Preview deployment, source-data isolation, product fidelity, and Telegram/mobile QA are reviewed.

## Testing

```bash
cd tryon-publisher
npm run check
npm test
``

Unit tests cover login/session signing, tamper and expiry rejection, rate-limit failure, CSRF, unauthenticated DB isolation, source SELECT-only query behavior, draft/approval/revocation, and forbidden Manager/accounting routes.
