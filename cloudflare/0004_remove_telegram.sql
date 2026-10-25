-- 0004: Retire the unused Telegram product-draft import.
-- Keep 0003 immutable for databases where it was already applied.
DROP INDEX IF EXISTS idx_telegram_product_drafts_status;
DROP TABLE IF EXISTS telegram_product_drafts;
