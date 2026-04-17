-- Migration 038: Gesamtrabatt auf Angeboten
-- Drei neue Spalten für einen einmaligen Gesamtrabatt (vor MwSt)
-- KEIN PRAGMA foreign_keys — wird zentral in migrate.ts gesteuert

ALTER TABLE dj_quotes ADD COLUMN discount_value REAL;
ALTER TABLE dj_quotes ADD COLUMN discount_type TEXT DEFAULT '%';
ALTER TABLE dj_quotes ADD COLUMN discount_description TEXT;
