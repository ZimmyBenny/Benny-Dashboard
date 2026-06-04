-- Migration 063: amazon_products.notes — Freitext-Notizfeld am Produkt (2026-06-04)
-- WICHTIG: Kein FK-Pragma setzen — wird in migrate.ts zentral gesteuert
-- WICHTIG: Auto-Backup laeuft via migrate.ts

ALTER TABLE amazon_products ADD COLUMN notes TEXT;
