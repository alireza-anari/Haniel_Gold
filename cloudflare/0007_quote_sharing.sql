-- 0007: Secure customer access to an approved, short-lived quote.
-- Store only the hash of the random bearer token; never store card or payment credentials.
CREATE TABLE IF NOT EXISTS purchase_quote_access (
 inquiry_id TEXT PRIMARY KEY REFERENCES purchase_inquiries(id) ON DELETE CASCADE,
 token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_purchase_quote_access_expiry
 ON purchase_quote_access(expires_at);

CREATE TABLE IF NOT EXISTS purchase_quote_responses (
 inquiry_id TEXT PRIMARY KEY REFERENCES purchase_inquiries(id) ON DELETE CASCADE,
 response TEXT NOT NULL CHECK(response IN ('accepted','declined')),
 responded_at INTEGER NOT NULL,
 acknowledged INTEGER NOT NULL DEFAULT 0 CHECK(acknowledged IN (0,1))
);
