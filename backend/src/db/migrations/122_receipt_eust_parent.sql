-- 122: Einfuhrumsatzsteuer-Abspaltung — verknüpft EUSt-Kind mit Ursprungs-Beleg.
-- Additiv, KEIN PRAGMA foreign_keys (migrate.ts steuert zentral), KEIN Rebuild.
ALTER TABLE receipts ADD COLUMN eust_parent_receipt_id INTEGER
  REFERENCES receipts(id) ON DELETE SET NULL;
