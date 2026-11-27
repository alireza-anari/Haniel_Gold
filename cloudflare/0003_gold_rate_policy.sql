-- HANI-EL GOLD D1 migration 0003: owner-approved automatic gold-rate change threshold.
-- Rate acceptance is independent from the separate tax/pricing policy.
-- Safe to apply to an existing database; starts unapproved.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS gold_rate_policy (
  id INTEGER PRIMARY KEY CHECK(id=1),
  auto_change_bps INTEGER CHECK(auto_change_bps IS NULL OR auto_change_bps BETWEEN 1 AND 10000),
  approved INTEGER NOT NULL DEFAULT 0 CHECK(approved IN (0,1)),
  approved_at INTEGER,
  CHECK(approved=0 OR (auto_change_bps IS NOT NULL AND approved_at IS NOT NULL))
);
INSERT OR IGNORE INTO gold_rate_policy(id,approved) VALUES(1,0);
