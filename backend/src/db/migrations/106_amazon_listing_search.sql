-- Amazon-Suchleiste: editierbarer Suchbegriff pro Produkt.
-- Reine ADD-COLUMN-Migration (wie 104/105) — kein Rebuild/RENAME, kein PRAGMA,
-- kein manueller Backup-Aufruf (migrate.ts macht Auto-Backup). FK/CASCADE unberuehrt.
ALTER TABLE amazon_listing ADD COLUMN comp_search_term TEXT;
