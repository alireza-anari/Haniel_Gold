# Cloudflare Workers Builds — initial connection check

This file intentionally contains no application secrets or accounting data.

The Telegram management app is isolated in `telegram-miniapp/`. Cloudflare Workers Builds should use the production branch `feature/telegram-miniapp-cloudflare`, root path `telegram-miniapp`, build command `npm run check && npm test`, and deploy command `npx cf deploy`.

Trigger: first post-connection commit to start a Workers Build.

Do not connect this branch to the HANI-EL storefront deployment. The main branch is not modified.
