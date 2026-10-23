-- HANI-EL GOLD D1 migration 0002: 18K Servix rate + approved pricing policy.
-- Idempotent. Does not overwrite your existing products, categories, images or logins.
CREATE TABLE IF NOT EXISTS gold_market_state (
  id INTEGER PRIMARY KEY CHECK (id=1),
  version INTEGER NOT NULL DEFAULT 0,
  blocked INTEGER NOT NULL DEFAULT 1 CHECK(blocked IN (0,1)),
  rate_rial_per_gram INTEGER CHECK(rate_rial_per_gram IS NULL OR rate_rial_per_gram>0),
  observed_at INTEGER,
  verified_at INTEGER,
  valid_until INTEGER,
  pending_rate_rial INTEGER CHECK(pending_rate_rial IS NULL OR pending_rate_rial>0),
  pending_observed_at INTEGER,
  pending_reason TEXT NOT NULL DEFAULT '',
  last_attempt_at INTEGER,
  paused_until INTEGER,
  last_error TEXT NOT NULL DEFAULT '',
  CHECK ((rate_rial_per_gram IS NULL AND observed_at IS NULL AND verified_at IS NULL AND valid_until IS NULL)
         OR (rate_rial_per_gram IS NOT NULL AND observed_at IS NOT NULL AND verified_at IS NOT NULL AND valid_until IS NOT NULL)),
  CHECK ((pending_rate_rial IS NULL AND pending_observed_at IS NULL)
         OR (pending_rate_rial IS NOT NULL AND pending_observed_at IS NOT NULL))
);
INSERT OR IGNORE INTO gold_market_state(id,blocked) VALUES(1,1);

CREATE TABLE IF NOT EXISTS gold_rate_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT NOT NULL CHECK(event IN ('pending','accepted','unchanged','rejected','failed','quota','approved')),
  rate_rial_per_gram INTEGER,
  observed_at INTEGER,
  created_at INTEGER NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_gold_rate_audit_time ON gold_rate_audit(created_at DESC);

CREATE TABLE IF NOT EXISTS pricing_policy (
  id INTEGER PRIMARY KEY CHECK (id=1),
  tax_bps INTEGER CHECK(tax_bps IS NULL OR tax_bps BETWEEN 0 AND 10000),
  tax_basis TEXT CHECK(tax_basis IS NULL OR tax_basis='fee_profit'),
  auto_change_bps INTEGER CHECK(auto_change_bps IS NULL OR auto_change_bps BETWEEN 1 AND 10000),
  approved INTEGER NOT NULL DEFAULT 0 CHECK(approved IN (0,1)),
  approved_at INTEGER,
  CHECK(approved=0 OR (tax_bps IS NOT NULL AND tax_basis='fee_profit' AND auto_change_bps IS NOT NULL AND approved_at IS NOT NULL))
);
INSERT OR IGNORE INTO pricing_policy(id,approved) VALUES(1,0);
