-- ============================================================================
-- Migration 042: DROP TABLE dj_expenses + Cleanup v_dj_trips View
-- Phase 04 Plan 11 — DJ-Buchhaltungs-Refactor
--
-- HINWEIS zur Nummerierung:
--   Plan 04-11 spezifizierte ursprünglich Migration 039b_drop_dj_expenses.sql.
--   Wave 0 hat 039_audit_log.sql, Wave 1 hat 040_belege.sql, Plan 04-06 hat
--   041_fahrten_migration.sql belegt. Daher: 042 (nächste freie Nummer).
--
-- WICHTIG: createBackup laeuft AUTOMATISCH via migrate.ts vor jeder neuen
--          Migration (CLAUDE.md-Regel, vgl. backend/src/db/migrate.ts Zeile 34).
--          Ein expliziter Aufruf ist daher nicht noetig.
--
-- VORAUSSETZUNGEN:
--   1. Migration 041 hat alle Fahrten (category='fahrzeug') aus dj_expenses
--      idempotent in trips uebertragen (NOT EXISTS-Schutz).
--   2. dj.expenses.routes.ts ist entfernt + Mount aus dj.routes.ts (Plan 11 Task 1).
--   3. Frontend nutzt nicht mehr fetchDjExpenses/createDjExpense/deleteDjExpense
--      (Plan 11 Task 1 — DjAccountingPage refactored, DjTripsPage auf /api/trips).
--
-- AUSWIRKUNGEN:
--   - Audit-Log-Eintraege mit entity_type='expense' bleiben erhalten (historisch).
--   - View v_dj_trips (aus Migration 029) wird gedropt — wird nirgendwo mehr
--     genutzt; Trips-Daten kommen jetzt aus der trips-Tabelle (Plan 04-06).
-- ============================================================================

-- 1. dj_expenses-Tabelle entfernen
--    IF EXISTS schuetzt vor Re-Run und vor Test-DBs ohne diese Tabelle.
DROP TABLE IF EXISTS dj_expenses;

-- 2. v_dj_trips View entfernen (wird nicht mehr verwendet — trips-Tabelle ist Source of Truth)
--    IF EXISTS schuetzt vor Re-Run.
DROP VIEW IF EXISTS v_dj_trips;
