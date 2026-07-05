-- Migration 101: trips — Abwesenheitspauschale (Verpflegungsmehraufwand)
-- Additiv. Bestandsfahrten: Zeiten NULL, meal_allowance_cents 0 (DEFAULT).
-- Backup automatisch via migrate.ts (createBackup 'pre-migration'). PRAGMA foreign_keys NICHT hier setzen.
ALTER TABLE trips ADD COLUMN departure_time TEXT;
ALTER TABLE trips ADD COLUMN return_time TEXT;
ALTER TABLE trips ADD COLUMN meal_allowance_cents INTEGER NOT NULL DEFAULT 0;
