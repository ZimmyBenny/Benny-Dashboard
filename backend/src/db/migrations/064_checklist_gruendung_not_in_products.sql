-- Migration 064: Sektion "Gründung und einmalige Aufgaben" nicht in Produkte kopieren (2026-06-07)
-- WICHTIG: Kein FK-Pragma setzen — migrate.ts steuert foreign_keys zentral (OFF während Migration)
-- WICHTIG: Auto-Backup läuft via migrate.ts
-- Da foreign_keys während der Migration OFF ist, greift ON DELETE CASCADE NICHT —
-- daher Produkt-Items explizit VOR den Produkt-Sektionen löschen.

ALTER TABLE amazon_checklist_master_sections
  ADD COLUMN copy_to_products INTEGER NOT NULL DEFAULT 1
  CHECK (copy_to_products IN (0,1));

UPDATE amazon_checklist_master_sections
  SET copy_to_products = 0
  WHERE title = 'Gründung und einmalige Aufgaben';

DELETE FROM amazon_checklist_product_items
  WHERE section_id IN (
    SELECT id FROM amazon_checklist_product_sections
    WHERE title = 'Gründung und einmalige Aufgaben'
  );

DELETE FROM amazon_checklist_product_sections
  WHERE title = 'Gründung und einmalige Aufgaben';
