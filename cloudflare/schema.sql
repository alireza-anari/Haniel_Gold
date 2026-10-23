-- HANI-EL GOLD Cloudflare D1 staging schema.
-- Intentionally no sample products, prices, tax rates or customer data.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE CHECK(length(slug) BETWEEN 2 AND 64),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 2 AND 80),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS products (
  slug TEXT PRIMARY KEY CHECK(length(slug) BETWEEN 2 AND 80),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 150),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  style TEXT NOT NULL DEFAULT 'مینیمال',
  description TEXT NOT NULL DEFAULT '',
  weight_mg INTEGER CHECK(weight_mg IS NULL OR weight_mg >= 0),
  karat INTEGER CHECK(karat IS NULL OR karat BETWEEN 1 AND 24),
  making_fee_bps INTEGER CHECK(making_fee_bps IS NULL OR making_fee_bps BETWEEN 0 AND 10000),
  profit_bps INTEGER CHECK(profit_bps IS NULL OR profit_bps BETWEEN 0 AND 10000),
  inventory_count INTEGER CHECK(inventory_count IS NULL OR inventory_count >= 0),
  price_toman INTEGER CHECK(price_toman IS NULL OR price_toman > 0),
  price_verified_at INTEGER,
  price_valid_until INTEGER,
  published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK((price_toman IS NULL AND price_verified_at IS NULL AND price_valid_until IS NULL)
      OR (price_toman IS NOT NULL AND price_verified_at IS NOT NULL AND price_valid_until IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id, published, updated_at);
CREATE INDEX IF NOT EXISTS idx_products_visibility ON products(published, updated_at);
CREATE TABLE IF NOT EXISTS product_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_slug TEXT NOT NULL REFERENCES products(slug) ON DELETE CASCADE,
  url TEXT NOT NULL CHECK(length(url) BETWEEN 8 AND 800),
  alt TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(product_slug, url)
);
CREATE INDEX IF NOT EXISTS idx_images_product ON product_images(product_slug, sort_order);
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  csrf_token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON admin_sessions(expires_at);
CREATE TABLE IF NOT EXISTS admin_login_attempts (
  client_key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  failed_count INTEGER NOT NULL DEFAULT 0
);
