-- 0003: Supplier-on-demand inquiry workflow, disabled until explicitly enabled.
-- Only requests, not orders, payments, reservations or confirmed stock.
CREATE TABLE IF NOT EXISTS purchase_inquiries (
 id TEXT PRIMARY KEY,
 customer_name TEXT NOT NULL CHECK(length(customer_name) BETWEEN 2 AND 80),
 customer_phone TEXT NOT NULL CHECK(length(customer_phone)=11),
 items_json TEXT NOT NULL,
 indicative_total_toman INTEGER,
 rate_valid_until INTEGER,
 status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN
  ('submitted','reviewing','supplier_confirmed','unavailable','quote_prepared',
   'quote_sent','customer_declined','closed')),
 admin_note TEXT NOT NULL DEFAULT '',
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_purchase_inquiries_status ON purchase_inquiries(status,created_at DESC);
CREATE TABLE IF NOT EXISTS purchase_inquiry_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 inquiry_id TEXT NOT NULL REFERENCES purchase_inquiries(id) ON DELETE CASCADE,
 from_status TEXT,
 to_status TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS inquiry_rate_limits (
 ip_hash TEXT PRIMARY KEY,
 window_start INTEGER NOT NULL,
 submission_count INTEGER NOT NULL DEFAULT 0
);
-- Imported Telegram channel posts are review-only and can never auto-publish.
CREATE TABLE IF NOT EXISTS telegram_product_drafts (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 channel_id TEXT NOT NULL,
 message_id INTEGER NOT NULL,
 update_id INTEGER,
 source_text TEXT NOT NULL,
 parsed_json TEXT NOT NULL,
 photo_file_id TEXT,
 media_group_id TEXT,
 review_status TEXT NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','reviewed','rejected')),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 UNIQUE(channel_id,message_id)
);
CREATE INDEX IF NOT EXISTS idx_telegram_product_drafts_status ON telegram_product_drafts(review_status,created_at DESC);
