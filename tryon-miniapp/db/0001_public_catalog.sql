-- Dedicated PUBLIC-only snapshot of owner-approved products.
-- DO NOT run on the production Manager DB haniel-gold-db.
-- Preview target: haniel-gold-tryon-test (the empty/test database).
-- Production requires separate haniel-tryon-public D1; do not copy sales/users.
CREATE TABLE IF NOT EXISTS tryon_public_catalog (
  sku TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  product_type TEXT NOT NULL CHECK(product_type IN ('earring','necklace','bracelet','ring')),
  cutout_mime TEXT NOT NULL CHECK(cutout_mime IN ('image/png','image/webp')),
  cutout_blob BLOB NOT NULL,
  approved INTEGER NOT NULL DEFAULT 0 CHECK(approved IN (0,1)),
  reviewed_at TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CHECK(approved=0 OR reviewed_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_public_tryon_approved ON tryon_public_catalog(approved);
