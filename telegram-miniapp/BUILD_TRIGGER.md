# Cloudflare Workers Builds — initial connection check

This file intentionally contains no application secrets or accounting data.

The Telegram management app is isolated in `telegram-miniapp/`. Cloudflare Workers Builds should use the production branch `feature/telegram-miniapp-cloudflare`, root path `telegram-miniapp`, build command `npm run check && npm test`, and deploy command `npx cf deploy`.

Trigger: first post-connection commit to start a Workers Build.

Do not connect this branch to the HANI-EL storefront deployment. The main branch is not modified.

## Retry after secrets configuration

Runtime secrets `BOT_TOKEN` and `OWNER_TELEGRAM_ID` were configured by the operator in the Cloudflare dashboard. This documentation-only commit requests a fresh Workers Build on the dedicated feature branch. It contains no secret values and does not change the storefront.
