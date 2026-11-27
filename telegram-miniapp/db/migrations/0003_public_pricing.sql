-- 0003: Public, per-product price presentation settings.
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
