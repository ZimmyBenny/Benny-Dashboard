-- ============================================================================
-- Migration 043: app_settings.updated_at-Spalte nachtraeglich hinzufuegen
-- Quick-Fix 260517-wcz — Behebt 500 in PATCH /api/belege/settings + PUT /api/app-settings
--
-- HINTERGRUND:
--   Migration 015 (015_contacts.sql) hat app_settings urspruenglich MIT
--     updated_at TEXT DEFAULT (datetime('now'))
--   angelegt. In Bennys lokaler DB fehlt die Spalte jedoch (vermutlich durch ein
--   early-stage Rebuild ohne diese Spalte). Zwei Routen schreiben updated_at
--   explizit und werfen SQLITE_ERROR: no such column: updated_at → 500.
--
-- WICHTIG: Das Pre-Migration-Backup laeuft AUTOMATISCH via migrate.ts vor
--          jeder neuen Migration (CLAUDE.md-Regel, vgl. backend/src/db/migrate.ts
--          Zeile 34). Ein expliziter Aufruf ist daher nicht noetig.
--
-- SQLITE-CONSTRAINTS:
--   - ALTER TABLE ADD COLUMN erlaubt KEIN nicht-konstantes DEFAULT (kein
--     datetime('now')). Daher: Spalte ohne Default — die beiden konsumierenden
--     Routen (belege.routes.ts:379, appSettings.routes.ts:27) setzen den Wert
--     explizit beim Insert/Update.
--   - SQLite hat KEIN "ADD COLUMN IF NOT EXISTS". Auf Umgebungen wo die Spalte
--     bereits existiert (z.B. frisch via 015_contacts.sql), wuerde diese
--     Migration fehlschlagen. Fuer Bennys lokale Single-User-App ist das ein
--     akzeptables Risiko — Live-Schema verifiziert per .schema-Check.
-- ============================================================================

-- 1. Spalte hinzufuegen (TEXT, nullable, kein Default — Routen setzen explizit)
ALTER TABLE app_settings ADD COLUMN updated_at TEXT;

-- 2. Backfill: bestehende Zeilen bekommen jetzt-Zeitstempel,
--    damit kein Eintrag mit NULL updated_at zurueckbleibt
UPDATE app_settings SET updated_at = datetime('now') WHERE updated_at IS NULL;
