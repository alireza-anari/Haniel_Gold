# HANI-EL GOLD — Preview launch trigger

This commit requests a **preview-only** build for `haniel-gold-tryon`.

- Branch: `feature/tryon-customer-isolated`
- Worker: `haniel-gold-tryon`
- Root directory: `tryon-miniapp`
- Expected command: `npx cf previews deploy`
- Preview D1 binding: `CATALOG_DB` → `haniel-tryon-public-test`
- Production: `main`; do not merge this branch or run a Production deploy.
- Private Telegram Manager Worker `haniel-gold-manager`: untouched.

Do not publish any real SKU, image, or customer content until the preview runtime,
product cutouts, and quality/security checks have been validated.

This file contains no credentials or production data.
