-- Migration 056: dj_events.internal_notes (User-Wunsch 2026-05-28)
-- Interne Notizen die NICHT im PDF-Export erscheinen — fuer Gedanken/
-- Erinnerungen die nur den DJ selbst betreffen (Konditionen, Vermerke,
-- 'Achtung: kurzer Aufbau erlaubt' etc.)
--
-- WICHTIG: Kein FK-Pragma setzen — wird zentral in migrate.ts gesteuert
-- WICHTIG: Auto-Backup laeuft via migrate.ts vor Anwendung

ALTER TABLE dj_events ADD COLUMN internal_notes TEXT;
