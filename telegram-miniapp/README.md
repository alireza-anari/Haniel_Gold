# HANI-EL GOLD — Telegram Manager Mini App

**Independent feature branch**: `feature/telegram-miniapp-cloudflare`

This folder holds the Telegram administration application for `@Hani_El_manager_bot`. It is kept separate from the existing HANI-EL storefront (`frontend/`, `backend/`, `functions/`). No production website deployment is triggered.

Architecture: Cloudflare Workers / Static Assets + D1 SQL for business records **and private compressed image BLOBs**. R2 is not required. Persian RTL interface and role-based access (owner/manager/sales/viewer). Import and export are limited to the two workbook sheets «موجودی» and «فروش» in v1.

**Important**: This is an initial beta, not yet deployed or tested on the owner's second Cloudflare account. Keep accounting backups. Never commit `BOT_TOKEN`, owner IDs, personal products data or invoices here.

## Cloudflare prerequisites

- Create only D1 database `haniel-gold-db` in your chosen Cloudflare account; do not activate R2 or enter payment details.
- Execute `db/schema.sql` in the **production** D1 console.
- Product photos are compressed in the browser and stored privately in the D1 `images.image_blob` column (up to 400KB each, max 6 per product).
- If you already executed the **older** schema.sql before this change, run `db/migrate-r2-to-d1-images.sql` **once**. Otherwise just run the current `db/schema.sql`.
- D1 Free storage and per-row limits apply; photo storage is for inventory thumbnails, not original high-resolution product photos.
- Set `BOT_TOKEN` and `OWNER_TELEGRAM_ID` as secrets in Cloudflare; do not put secrets in GitHub.
- Deploy from the `telegram-miniapp/` root (not repository root) with the `cf` CLI described in `README_FA.md` supplied with the original package, or in the mobile deployment guide to follow.
- Enter the resulting `https://...workers.dev` URL in BotFather via `/setmenubutton` for `@Hani_El_manager_bot`.

## Source contents
`src/` Worker API and finance rules; `db/` SQL schema; `public/` UI, images and XLSX helper; `tests/` authentication and finance tests; `cloudflare.config.ts` binding setup; `package.json` scripts.

To avoid committing the user's private accounting workbook or secrets, this branch intentionally contains no live data. The storefront's `main` branch remains unchanged.
