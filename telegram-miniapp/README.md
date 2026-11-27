# HANI-EL GOLD — Telegram Manager Mini App

**Independent feature branch**: `feat/telegram-customer-price-miniapp`

This folder holds the Telegram administration application for `@Hani_El_manager_bot`. It is kept separate from the existing HANI-EL storefront (`frontend/`, `backend/`, `functions/`). No production website deployment is triggered.

Architecture: Cloudflare Workers / Static Assets + D1 SQL for business records **and private compressed image BLOBs**. R2 is not required. Persian RTL interface and role-based access (owner/manager/sales/viewer). Public product pricing and gold-rate approval are owner-only; existing team role access remains intact. Import and export are limited to the two workbook sheets «موجودی» and «فروش» in v1.

**Important**: This branch is configured for QA only. The connected HANI-EL Cloudflare account currently exposes `haniel-gold-miniapp-qa-20261114` (empty of business records); no HANI-EL Production Worker or Pages project was verified. Keep accounting backups. Never commit `BOT_TOKEN`, owner IDs, personal products data or invoices here.

## Cloudflare prerequisites

- Current QA binding: D1 `haniel-gold-miniapp-qa-20261114`; `cloudflare.config.ts` targets this QA database only.
- For a new empty QA database, execute `db/schema.sql`. For an existing manager database, apply migrations `db/migrations/0003_public_pricing.sql` and `db/migrations/0004_gold_market_policy.sql` after taking a backup.
- Do not point the QA Worker at Production. A separate verified Production D1 and matching bindings are required for a production rollout.
- Product photos are compressed in the browser and stored privately in the D1 `images.image_blob` column (up to 400KB each, max 6 per product).
- If you already executed the **older** schema.sql before this change, run `db/migrate-r2-to-d1-images.sql` **once**. Otherwise just run the current `db/schema.sql`.
- D1 Free storage and per-row limits apply; photo storage is for inventory thumbnails, not original high-resolution product photos.
- Set `BOT_TOKEN` and `OWNER_TELEGRAM_ID` as secrets in Cloudflare; do not put secrets in GitHub.
- The customer pricing Worker uses the same D1 and a separate `SERVIX_API_KEY` secret. Its 30-minute scheduler shares the owner-approved gold market state; it does not store product price snapshots.
- Deploy from the `telegram-miniapp/` root (not repository root) with the `cf` CLI described in `README_FA.md` supplied with the original package, or in the mobile deployment guide to follow.
- Enter the resulting `https://...workers.dev` URL in BotFather via `/setmenubutton` for `@Hani_El_manager_bot`.

## Source contents
`src/` Worker API and finance rules; `db/` SQL schema; `public/` UI, images and XLSX helper; `tests/` authentication and finance tests; `cloudflare.config.ts` binding setup; `package.json` scripts.

To avoid committing the user's private accounting workbook or secrets, this branch intentionally contains no live data. The storefront's `main` branch remains unchanged.
