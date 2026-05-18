-- Migration 045: dj_quote_items.is_optional + dj_quotes optional totals
-- Optionale Positionen zaehlen nicht in die Hauptsumme, sondern werden separat
-- als optional_subtotal_net + optional_total_gross ausgewiesen (sevDesk-Stil).
-- SQLite erlaubt kein CHECK in ALTER TABLE — daher kein Constraint auf is_optional.
-- migrate.ts faehrt automatisch ein Backup vor jeder Migration.

ALTER TABLE dj_quote_items ADD COLUMN is_optional INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dj_quotes ADD COLUMN optional_subtotal_net REAL NOT NULL DEFAULT 0;
ALTER TABLE dj_quotes ADD COLUMN optional_total_gross REAL NOT NULL DEFAULT 0;
