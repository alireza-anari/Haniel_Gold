# HANI-EL GOLD — Private Try-On Product Publisher

**Status: Source code + automated tests only. NOT deployed. NOT authorized for production.**

This is a separate, owner-only application in `tryon-publisher/`. It is not the private Telegram management Mini App and it is not the public customer Virtual Try-On Mini App.

## Architecture

| Component | Purpose |
|---|---|
| `telegram-miniapp/` | Existing private management Mini App; **no modifications** |
| `haniel-gold-db` | Private manager D1; product SKU/name/images are the source of truth |
| `tryon-publisher/` | Owner-only publication UI, protected by Cloudflare Access |
| `haniel-tryon-public-test` | Independent, previously created test catalog |
| `tryon-miniapp/` | Existing public customer Mini App; only serves reviewed catalog items |
| `tryon-sync/` | Older optional automatic synchronizer; keep disabled to avoid conflicting writes |

The publisher queries ONLY `products(id,sku,name)` and selected `images(id,product_id,mime,image_blob)`, never private sales, user, accounting, labor, or supplier columns. It writes only to the separate `tryon_public_catalog` database.

**D1 binding access itself is not read-only.** The publisher must NOT receive production `SOURCE_DB` binding until a separate security review and explicit user approval. Its current config deliberately has no `SOURCE_DB` in either environment and no production `CATALOG_DB` binding, so actions fail closed.

## Workflow

1. The owner searches for a product by SKU/name.
2. The owner selects one existing manager image for the exact product.
3. The owner uploads a matching transparent RGBA PNG under 400 KiB.
4. Save draft; `approved=0`.
5. Compare saved original image and cutout side-by-side. The client requires entering the exact SKU and checking the visual review box.
6. Server verifies that the reviewed SHA-256 fingerprint still matches both stored images, that the manager source image is unchanged and that the record is still unapproved (compare-and-swap update).
7. Approval makes only that image and limited metadata visible through the public catalog.
8. Revoke changes approval to 0 without deleting private manager data or the cutout.

The source image is subject to the existing manager database's 400 KiB size limit of this pilot; items whose image is remote-only or too large are not silently changed or published.

## Security model

All routes and static assets require signed Cloudflare Access JWT with:
- matching issuer from `ACCESS_TEAM_DOMAIN`
- exact configured audience `ACCESS_AUD`
- correct token signature and validity period
- exact `ACCESS_OWNER_EMAIL`

Mutations also require same-origin `Origin` and JSON content type; no CORS wildcard. No Telegram bot token or manager's API is exposed. Customer photos never enter this publisher.

The public `haniel-gold-tryon` Worker MUST NOT be modified or given the manager DB binding. Cloudflare Access must be configured at the edge before any domain or URL for this publisher is enabled.

### Private configuration (NOT stored in GitHub)

- `ACCESS_TEAM_DOMAIN` — Cloudflare Access team domain
- `ACCESS_AUD` — specific Access application's audience
- `ACCESS_OWNER_EMAIL` — owner's permitted address
- `SOURCE_DB` — **not configured; held back pending security review**
- `CATALOG_DB` — Preview only, `haniel-tryon-public-test`, already created
- `ASSETS` — private publisher UI assets

Do not paste identifiers, credentials, email addresses, private photos or bearer tokens into a public issue or chat.

## Testing

```bash
cd tryon-publisher
npm run check
npm test
```

Unit tests cover JWT verification, rejection of forged identities, signed images, source read-only queries, same-origin checks, draft state, hash-bound approval, revocation and forbidden manager routes.

## Release gate

- GitHub PR is **draft**; no merge, no production deploy.
- New publisher Worker `haniel-tryon-publisher-private` has **not** been created/deployed.
- Verify exact Cloudflare Access policy, authentication and binding environment before any live data exposure.
- Test actual D1 image payloads and native Telegram behavior.
- Validate PNG is truly transparent and jewelry matches the source. The server verifies PNG structure; visual fidelity remains an owner QA responsibility.
- Avoid automatic publication and retain manual approval/revocation.

No new SQL migration is required for the Preview public catalog; it already has the necessary columns. Do not run the storefront schema against the manager D1.
