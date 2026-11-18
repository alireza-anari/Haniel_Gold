-- Matches the exact table manually created on haniel-gold-tryon-test, 2026-11-18.
-- DO NOT apply to the production D1 without separate approval and backup.
-- This is for the Telegram manager database (products.id), NOT storefront products.slug.
CREATE TABLE IF NOT EXISTS tryon_assets (
    product_id INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    product_type TEXT NOT NULL CHECK (product_type IN ('earring','necklace','bracelet','ring')),
    cutout_mime TEXT CHECK (cutout_mime IS NULL OR cutout_mime IN ('image/png','image/webp')),
    cutout_blob BLOB,
    approved INTEGER NOT NULL DEFAULT 0 CHECK (approved IN (0,1)),
    reviewed_at TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (approved=0 OR (cutout_blob IS NOT NULL AND reviewed_at IS NOT NULL))
);
