-- 127: Zoll-Abspaltung — eigene Verknüpfungs-Spalte + eigene Kategorie „Zoll".
-- Spiegelt die EUSt-Abspaltung (Migr. 122), lässt deren Logik aber unangetastet:
-- ein Beleg kann sowohl ein EUSt-Kind (eust_parent_receipt_id) als auch ein
-- Zoll-Kind (zoll_parent_receipt_id) haben.
-- Additiv, KEIN PRAGMA foreign_keys (migrate.ts steuert zentral), KEIN Rebuild.
ALTER TABLE receipts ADD COLUMN zoll_parent_receipt_id INTEGER
  REFERENCES receipts(id) ON DELETE SET NULL;

-- Reine Zoll-Kategorie: 0 % USt, KEINE Vorsteuer (Zoll ist Betriebsausgabe, aber
-- nicht vorsteuerabziehbar). Getrennt von „EUSt/Zoll" (id 14, das die EUSt fuehrt).
-- Idempotent ueber UNIQUE(name/slug), sort_order direkt nach „EUSt/Zoll" (140).
INSERT OR IGNORE INTO tax_categories (name, slug, kind, default_vat_rate, default_input_tax_deductible, sort_order)
VALUES ('Zoll', 'zoll', 'ausgabe', 0, 0, 145);
