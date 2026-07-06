-- Amazon-Suchtreffer-Optik: „X Mal gekauft"-Zeile pro Karte + eigene Angabe.
-- Reine ADD-COLUMN-Migration (wie 104) — kein Rebuild/RENAME, kein PRAGMA,
-- kein manueller Backup-Aufruf (migrate.ts macht Auto-Backup). FK/CASCADE
-- bleiben unberuehrt.
ALTER TABLE amazon_listing_images ADD COLUMN card_sold TEXT;
ALTER TABLE amazon_listing ADD COLUMN comp_own_sold TEXT;
