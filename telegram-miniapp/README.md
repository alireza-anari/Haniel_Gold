# HANI-EL GOLD — Telegram Manager Mini App

**Independent feature branch**: `feature/telegram-miniapp-cloudflare`

This folder holds the Telegram administration application for `@Hani_El_manager_bot`. It is kept separate from the existing HANI-EL storefront (`frontend/`, `backend/`, `functions/`). No production website deployment is triggered.

Architecture: Cloudflare Workers / Static Assets + D1 SQL + private R2 photos. Persian RTL interface and role-based access (owner/manager/sales/viewer). Import and export are limited to the two workbook sheets «موجودی» and «فروش» in v1.

**Important**: This is an initial beta, not yet deployed or tested on the owner's second Cloudflare account. Keep accounting backups. Never commit `BOT_TOKEN`, owner IDs, personal products data or invoices here.

## Cloudflare prerequisites

- Create D1 database `haniel-gold-db` and R2 bucket `haniel-gold-product-images` in your chosen Cloudflare account.
- Execute `db/schema.sql` in the **production** D1 console.
- Keep R2 private.
- Set `BOT_TOKEN` and `OWNER_TELEGRAM_ID` as secrets in Cloudflare; do not put secrets in GitHub.
- Deploy from the `telegram-miniapp/` root (not repository root) with the `cf` CLI described in `README_FA.md` supplied with the original package, or in the mobile deployment guide to follow.
- Enter the resulting `https://...workers.dev` URL in BotFather via `/setmenubutton` for `@Hani_El_manager_bot`.

## Source contents
`src/` Worker API and finance rules; `db/` SQL schema; `public/` UI, images and XLSX helper; `tests/` authentication and finance tests; `cloudflare.config.ts` binding setup; `package.json` scripts.

To avoid committing the user's private accounting workbook or secrets, this branch intentionally contains no live data. The storefront's `main` branch remains unchanged.
