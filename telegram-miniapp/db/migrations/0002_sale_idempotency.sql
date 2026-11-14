-- Apply once to existing Cloudflare D1 databases before deploying the idempotent sale API.
-- Existing sales remain intact; old records keep NULL keys and are unaffected.
ALTER TABLE sales ADD COLUMN idempotency_key TEXT;
ALTER TABLE sales ADD COLUMN request_fingerprint TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_idempotency_key
 ON sales(idempotency_key) WHERE idempotency_key IS NOT NULL;
