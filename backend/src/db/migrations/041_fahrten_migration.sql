-- ============================================================================
-- Migration 041: Fahrten-Migration aus dj_expenses(category='fahrzeug') in trips
--
-- HINWEIS zur Nummerierung:
--   Plan 04-06 spezifizierte ursprünglich Migration 039a_fahrten_migration.sql.
--   Wave 0 hat 039_audit_log.sql, Wave 1 hat 040_belege.sql belegt.
--   Daher: Migration 041 (nächste freie Nummer) — keine inhaltliche Änderung.
--
-- WICHTIG: createBackup laeuft automatisch via migrate.ts vor jeder neuen Migration
--          (CLAUDE.md-Pattern, vgl. backend/src/db/migrate.ts Zeile 34).
-- WICHTIG: dj_expenses bleibt erhalten — DROP erfolgt in Plan 11.
-- WICHTIG: Idempotent: nur INSERT wenn dj_expenses-Zeile noch nicht in trips ist
--          (NOT EXISTS-Schutz auf created_at + purpose).
-- ============================================================================

-- Heuristik: amount_gross/0.30 ergibt distance_km bei Default-Pauschale (0,30 €/km).
-- amount_cents = ROUND(amount_gross * 100). Bei User-Bestätigung CONTEXT.md D-06
-- ist dj_expenses leer — Migration ist No-Op. Heuristik ist konservativ und blockt
-- nicht bei abweichendem dj_expenses-Schema (wird einfach mit-übersetzt).
INSERT INTO trips (
  expense_date, distance_km, rate_per_km_cents, amount_cents,
  purpose, notes, created_at
)
SELECT
  e.expense_date,
  CAST(ROUND(e.amount_gross / 0.30) AS INTEGER) AS distance_km,
  30 AS rate_per_km_cents,
  CAST(ROUND(e.amount_gross * 100) AS INTEGER) AS amount_cents,
  COALESCE(e.description, 'Fahrt aus dj_expenses #' || e.id) AS purpose,
  e.notes,
  e.created_at
FROM dj_expenses e
WHERE e.category = 'fahrzeug'
  AND e.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM trips t
    WHERE t.created_at = e.created_at
      AND t.purpose = COALESCE(e.description, 'Fahrt aus dj_expenses #' || e.id)
  );
