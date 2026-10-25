# HANI-EL GOLD

Cloudflare-native Persian RTL jewellery catalogue: Pages + Pages Functions + D1 + Workers KV.

- [راهنمای فارسی](README_FA.md)
- [Cloudflare staging setup](docs/CLOUDFLARE_FULLSTACK_FA.md)
- [Purchase inquiries and manual catalogue workflow](docs/PURCHASE_INQUIRIES_FA.md)
- [Font assets](docs/FONTS_FA.md)

The Django/PostgreSQL code under `backend/` is retained as a separate legacy/rollback bundle; it is not the runtime for `haniel-gold.pages.dev`. Products are entered manually in `/admin`. Telegram product ingestion and inbound webhooks are retired; outbound-only purchase-inquiry alerts are separately opt-in and require explicit server-side configuration.

This repository is a staging build, not an approval to accept real payments. SMS.ir, customer OTP, payment collection, order fulfilment and production legal/compliance checks must be explicitly configured and tested before live sales.
