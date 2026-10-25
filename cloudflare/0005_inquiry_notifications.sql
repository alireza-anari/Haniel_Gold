-- 0005: Outbound-only Telegram notifications for new purchase inquiries.
-- No Telegram webhook or inbound command handler is enabled by this migration.
CREATE TABLE IF NOT EXISTS purchase_inquiry_notifications (
 id TEXT PRIMARY KEY,
 inquiry_id TEXT NOT NULL REFERENCES purchase_inquiries(id) ON DELETE CASCADE,
 channel TEXT NOT NULL DEFAULT 'telegram' CHECK(channel='telegram'),
 recipient_chat_id TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
 last_error_code TEXT NOT NULL DEFAULT '',
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 sent_at INTEGER,
 UNIQUE(inquiry_id,channel,recipient_chat_id)
);
CREATE INDEX IF NOT EXISTS idx_purchase_inquiry_notifications_status
 ON purchase_inquiry_notifications(inquiry_id,status,updated_at DESC);
