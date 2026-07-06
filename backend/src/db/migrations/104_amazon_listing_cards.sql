-- Amazon-Suchergebnis-Karten: editierbare Karten-Felder pro Bild + eigene Angaben.
-- Reine ADD-COLUMN-Migration — kein Rebuild/RENAME, kein PRAGMA, kein manueller
-- Backup-Aufruf (migrate.ts macht Auto-Backup). ADD COLUMN ist bei SQLite unkritisch
-- und laesst FK/CASCADE unberuehrt.
ALTER TABLE amazon_listing_images ADD COLUMN card_title   TEXT;
ALTER TABLE amazon_listing_images ADD COLUMN card_price   TEXT;
ALTER TABLE amazon_listing_images ADD COLUMN card_rating  REAL;
ALTER TABLE amazon_listing_images ADD COLUMN card_reviews INTEGER;
ALTER TABLE amazon_listing ADD COLUMN comp_own_title   TEXT;
ALTER TABLE amazon_listing ADD COLUMN comp_own_price   TEXT;
ALTER TABLE amazon_listing ADD COLUMN comp_own_rating  REAL;
ALTER TABLE amazon_listing ADD COLUMN comp_own_reviews INTEGER;
