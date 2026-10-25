-- 0006: Approved commercial proposals following an inquiry.
-- No payment instrument, merchant API key or payment completion is stored here.
-- Source inquiry data and private item costs remain accessible only to admins.
CREATE TABLE IF NOT EXISTS purchase_inquiry_quotes (
 id TEXT PRIMARY KEY,
 inquiry_id TEXT NOT NULL UNIQUE REFERENCES purchase_inquiries(id) ON DELETE CASCADE,
 items_total_toman INTEGER NOT NULL CHECK(items_total_toman>0),
 delivery_toman INTEGER NOT NULL CHECK(delivery_toman>=0),
 final_total_toman INTEGER NOT NULL CHECK(final_total_toman>0),
 valid_until INTEGER NOT NULL,
 supply_hold_until INTEGER NOT NULL,
 supply_reference TEXT NOT NULL CHECK(length(supply_reference) BETWEEN 3 AND 120),
 internal_note TEXT NOT NULL DEFAULT '' CHECK(length(internal_note)<=500),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_purchase_inquiry_quotes_valid
 ON purchase_inquiry_quotes(valid_until);
