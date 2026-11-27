PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
 telegram_id TEXT PRIMARY KEY,
 display_name TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('owner','manager','sales','viewer','disabled')),
 updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS products (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 sku TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL,
 weight TEXT NOT NULL,
 purchase_gold_rate TEXT NOT NULL,
 purchase_labor_pct TEXT NOT NULL,
 purchased_qty INTEGER NOT NULL CHECK(purchased_qty >= 0),
 supplier TEXT NOT NULL DEFAULT '',
 note TEXT NOT NULL DEFAULT '',
 version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_name ON products(name);
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
CREATE TABLE IF NOT EXISTS sales (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 product_id INTEGER NOT NULL REFERENCES products(id),
 date TEXT NOT NULL,
 quantity INTEGER NOT NULL CHECK(quantity > 0),
 gold_rate TEXT NOT NULL,
 labor_pct TEXT NOT NULL,
 profit_pct TEXT NOT NULL,
 accessories TEXT NOT NULL,
 discount TEXT NOT NULL,
 customer TEXT NOT NULL DEFAULT '',
 unit_weight TEXT NOT NULL,
 total_weight TEXT NOT NULL,
 raw_price TEXT NOT NULL,
 labor_gold TEXT NOT NULL,
 profit_gold TEXT NOT NULL,
 profit_rial TEXT NOT NULL,
 final_price TEXT NOT NULL,
 purchase_cost TEXT NOT NULL,
 net_profit TEXT NOT NULL,
 source_ref TEXT UNIQUE,
 idempotency_key TEXT,
 request_fingerprint TEXT,
 voided INTEGER NOT NULL DEFAULT 0,
 void_reason TEXT NOT NULL DEFAULT '',
 created_by TEXT NOT NULL,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_idempotency_key ON sales(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS images (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 product_id INTEGER NOT NULL REFERENCES products(id),
 object_key TEXT NOT NULL UNIQUE,
 mime TEXT NOT NULL,
 image_blob BLOB,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 actor TEXT NOT NULL,
 action TEXT NOT NULL,
 entity TEXT NOT NULL,
 entity_id TEXT NOT NULL,
 detail TEXT NOT NULL DEFAULT '',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT OR IGNORE INTO meta(key,value) VALUES('revision','0');
CREATE TABLE IF NOT EXISTS imports (
 token TEXT PRIMARY KEY,
 actor TEXT NOT NULL,
 revision INTEGER NOT NULL,
 plan TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
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
CREATE TRIGGER IF NOT EXISTS sales_stock_before_insert
BEFORE INSERT ON sales WHEN NEW.voided=0 AND (
  SELECT p.purchased_qty - COALESCE((SELECT SUM(s.quantity) FROM sales s
  WHERE s.product_id=p.id AND s.voided=0),0) FROM products p WHERE p.id=NEW.product_id
) < NEW.quantity
BEGIN SELECT RAISE(ABORT,'INSUFFICIENT_STOCK'); END;
CREATE TRIGGER IF NOT EXISTS products_stock_before_update
BEFORE UPDATE OF purchased_qty ON products WHEN NEW.purchased_qty <
 COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.product_id=OLD.id AND s.voided=0),0)
BEGIN SELECT RAISE(ABORT,'PURCHASED_BELOW_SOLD'); END;
