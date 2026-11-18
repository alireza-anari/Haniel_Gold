# HANI-EL GOLD — Telegram Manager Virtual Try-On (isolated preview)

**Status:** experimental; branch-only, not deployed and not merged. **Do not enable public launch.**

## Confirmed Cloudflare setup (owner screenshots, November 18 2026)

- Production Worker: `haniel-gold-manager` with D1 binding `DB` → `haniel-gold-db`.
- Production D1 currently has 36 products and 3 image records, spanning 2 products.
- Preview Base D1 binding `DB` → `haniel-gold-tryon-test`.
- Preview D1 has the 7 Telegram Manager base tables, zero products/images, and the separately created `tryon_assets` table.
- The exact migration source is `telegram-miniapp/db/migrations/0003_tryon_assets.sql` (already applied manually on preview; **do not run it again for this step**).
- The unrelated storefront migration `cloudflare/0007_tryon_assets.sql` references `products.slug` and must **never** be run on the Manager database.

## Data model / threat boundary

Source of truth for products is **Telegram manager's `products.id` / `products.sku`**, not the inactive storefront.

The `tryon_assets` table links `product_id` to `product_type`, `cutout_mime`, `cutout_blob`, `approved`, and `reviewed_at`. It contains **no user portrait**. Cutouts are limited to 400KiB and must be actual PNG/WebP. An owner must visually compare them to the real jewelry before marking approved; image signatures alone do not guarantee alpha transparency or SKU fidelity.

Public read endpoints, disabled until `TRYON_PUBLIC_ENABLED=1` is set in the **intended deployment environment**:

- `GET /api/tryon/products/HG-...`: only approved SKU, name, type and dedicated cutout URL; no internal prices, labor, sales or stock.
- `GET /api/tryon/cutouts/HG-...`: only approved dedicated cutout bytes, with no-store response.

Authenticated owner-only endpoints (using existing Telegram `X-Telegram-Init-Data` verification):

- `GET /api/tryon/admin/assets`: list SKU/approval states.
- `PUT /api/tryon/admin/assets/HG-...` with JSON `{\"action\":\"upload\",\"productType\":\"necklace\",\"mime\":\"image/png\",\"base64\":\"...\"}`. Upload always resets approved to false.
- `PUT` with `{\"action\":\"approve\",\"confirmReviewed\":true}` requires an existing valid asset and a same-origin request.
- `PUT` with `{\"action\":\"revoke\"}` removes approval immediately (does not delete sales or assets).

The next task is a safe owner-only upload screen and customer-facing try-on screen hosted on the Manager Worker. The *existing* prototype in `frontend/tryon` still uses inactive storefront URLs; **do not treat it as the production Telegram mini-app**.

## Deployment gate

1. Keep `main`, production Worker and production D1 unchanged.
2. Run tests: `node --test telegram-miniapp/tests/tryon_api.test.js`; run existing Manager tests too.
3. Confirm Preview deployment is genuinely bound to `haniel-gold-tryon-test` (do not import production bindings).
4. Configure Preview-only test Telegram credentials in the target account; never paste secrets in GitHub or chat.
5. Create test products via approved internal workflow or permitted synthetic QA fixtures; **do not copy private sales/finance tables** from production.
6. Visually review product cutouts; only then approve them.
7. Test actual mobile Telegram, photo retention, and natural occlusion before enablement.
8. Only after QA, consider explicit `TRYON_PUBLIC_ENABLED=1` for Preview; leave Production disabled.

**Release blocks:** no manager-approved real cutouts, no photo fidelity validation, no owner upload screen, no confirmed Preview deployment, no verified mobile/E2E. The flag must remain off.
