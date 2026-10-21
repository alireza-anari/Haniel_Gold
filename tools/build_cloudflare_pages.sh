#!/usr/bin/env bash
# Cloudflare Pages staging: static preview only. Does not modify frontend/runtime-config.js.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/.cloudflare-pages-dist"

if [[ ! -f "$ROOT_DIR/frontend/index.html" || ! -f "$ROOT_DIR/frontend/app.js" || ! -f "$ROOT_DIR/frontend/styles.css" ]]; then
  echo 'ERROR: required frontend files are missing' >&2
  exit 1
fi

rm -rf -- "$OUTPUT_DIR"
mkdir -p -- "$OUTPUT_DIR"
cp -a "$ROOT_DIR/frontend/." "$OUTPUT_DIR/"

# Intentionally disable Django API for Pages staging. Real API is not hosted here.
# Cloudflare Pages builds run with STAGING_API_ACTIVE=1 ONLY after a live Django
# endpoint has been verified and STAGING_BACKEND_ORIGIN has been set as a Pages
# runtime variable. Without both, Pages remains a safe static demo.
if [[ "${STAGING_API_ACTIVE:-0}" == "1" ]]; then
  cat > "$OUTPUT_DIR/runtime-config.js" <<'CONFIG'
/* HANI-EL GOLD staging proxy — same-origin /api. No secrets in browser. */
window.HANIEL_CONFIG = Object.freeze({apiBaseUrl:'/api',apiTimeout:12000});
CONFIG
else
  cat > "$OUTPUT_DIR/runtime-config.js" <<'CONFIG'
/* HANI-EL GOLD static staging. No live API, prices, checkout or Servix secrets. */
window.HANIEL_CONFIG = Object.freeze({apiBaseUrl:'',apiTimeout:12000});
CONFIG
fi

cat > "$OUTPUT_DIR/_headers" <<'HEADERS'
/*
  X-Robots-Tag: noindex, nofollow, noarchive
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/index.html
  Cache-Control: no-store

/runtime-config.js
  Cache-Control: no-store
HEADERS

cat > "$OUTPUT_DIR/robots.txt" <<'ROBOTS'
User-agent: *
Disallow: /
ROBOTS

test -f "$OUTPUT_DIR/index.html"
test -f "$OUTPUT_DIR/assets/brand-gold.png"
if [[ "${STAGING_API_ACTIVE:-0}" != "1" ]] && grep -q "apiBaseUrl:'/api'" "$OUTPUT_DIR/runtime-config.js"; then
  echo 'ERROR: staging API was not disabled' >&2
  exit 1
fi
printf 'HANI-EL GOLD Cloudflare staging ready: %s\n' "$OUTPUT_DIR"
