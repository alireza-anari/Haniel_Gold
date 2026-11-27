-- 0003: Public, per-product price presentation settings and cached 18K gold rate.
-- Schema only: no product, sale, customer, or price data is inserted or rewritten.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS product_public_pricing (
  product_id INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  labor_pct TEXT NOT NULL,
  profit_pct TEXT,
  accessories TEXT NOT NULL DEFAULT '0',
  discount TEXT NOT NULL DEFAULT '0',
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  show_profit INTEGER NOT NULL DEFAULT 0 CHECK(show_profit IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_product_public_pricing_enabled
  ON product_public_pricing(enabled, product_id);

CREATE TABLE IF NOT EXISTS gold_rate_state (
  id INTEGER PRIMARY KEY CHECK(id=1),
  rate_rial_per_gram INTEGER,
  observed_at INTEGER,
  fetched_at INTEGER,
  valid_until INTEGER,
  last_attempt_at INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1
);
