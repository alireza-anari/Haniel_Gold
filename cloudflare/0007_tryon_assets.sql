-- HANI-EL Virtual Try-On: isolated approval registry. No customer photographs.
-- Apply manually to the SAME existing D1 after inspecting prior migrations.
CREATE TABLE IF NOT EXISTS tryon_assets (
  product_slug TEXT PRIMARY KEY REFERENCES products(slug) ON DELETE CASCADE,
  product_type TEXT NOT NULL CHECK (product_type IN ('earring','necklace','bracelet','ring')),
  asset_url TEXT NOT NULL,
  approved INTEGER NOT NULL DEFAULT 0 CHECK (approved IN (0,1)),
  reviewed_at INTEGER,
  updated_at INTEGER NOT NULL,
  CHECK (approved=0 OR reviewed_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_tryon_assets_approved ON tryon_assets(approved,updated_at);
