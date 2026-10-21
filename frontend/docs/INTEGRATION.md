# Back-end integration contract (draft)

Data should come from an authenticated server API rather than values computed client-side.

`GET /api/products` returns verified catalog data from product management. Suggested fields:

- `id`, `slug`, `name_fa`, `category_id`, `style_ids`, `status`, `images[]`
- `weight_grams` (if relevant and verified), `purity` / karat, `dimensions`, `metal_color`, `stone_details`
- `pricing_inputs`: only a secure server should own gold rate source, timestamp, manufacturing fee, margins, legal tax rules, precision and rounding policies
- `quote`: server-calculated amount, currency (`IRR`/`IRT` with explicit units), expiration, quote_id
- `stock_status`, `last_verified_at`

`POST /api/checkout/quote` should re-price against live stock and confirmed inputs at checkout, validate availability and produce a short-lived signed quote.

`POST /api/orders` should validate authenticated customer/session, shipping selection, quote, stock reservation and gateway flow on the server. Never trust client-calculated totals, client-selected price or client-side payment flags.

Before production: confirm Iranian market legal/tax/compliance specifics with qualified local professional, and ensure user-facing text matches actual policies. Use official product photos/assets, not AI approximations for product detail.
