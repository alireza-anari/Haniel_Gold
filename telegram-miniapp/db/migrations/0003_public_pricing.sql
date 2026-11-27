-- 0003: Public, per-product price presentation settings and cached 18K gold rate.
-- Existing sales remain historical records. Seed disabled draft settings from the latest
-- non-voided sale where available; never publish them without an explicit manager action.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS product_public_pricing (
  product_id INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  labor_pct TEXT NOT NULL,
  profit_pct TEXT,
  accessories TEXT NOT NULL DEFAULT '0',
  discount TEXT NOT NULL DEFAULT '0',
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  show_profit INTEGER NOT NULL DEFAULT 0 CHECK(show_profit IN (0,1)),
  source_sale_id INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_product_public_pricing_enabled
  ON product_public_pricing(enabled, product_id);

INSERT OR IGNORE INTO product_public_pricing
  (product_id, labor_pct, profit_pct, accessories, discount, enabled, show_profit, source_sale_id)
SELECT
  p.id,
  COALESCE(
    (SELECT s.labor_pct FROM sales s
     WHERE s.product_id=p.id AND s.voided=0 ORDER BY s.id DESC LIMIT 1),
    p.purchase_labor_pct
  ),
  (SELECT s.profit_pct FROM sales s
   WHERE s.product_id=p.id AND s.voided=0 ORDER BY s.id DESC LIMIT 1),
  COALESCE((SELECT s.accessories FROM sales s
   WHERE s.product_id=p.id AND s.voided=0 ORDER BY s.id DESC LIMIT 1), '0'),
  COALESCE((SELECT s.discount FROM sales s
   WHERE s.product_id=p.id AND s.voided=0 ORDER BY s.id DESC LIMIT 1), '0'),
  0,
  0,
  (SELECT s.id FROM sales s
   WHERE s.product_id=p.id AND s.voided=0 ORDER BY s.id DESC LIMIT 1)
FROM products p;

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

INSERT OR IGNORE INTO gold_rate_state(id, last_attempt_at, last_error, version)
VALUES(1, 0, '', 1);
