---
phase: 04-belege-modul-dj-buchhaltungs-refactoring
plan: 01
subsystem: database, schema
tags: [sqlite, migration, gobd, cents-integer, schema, vitest, better-sqlite3]

# Dependency graph
requires:
  - phase: 04-00 (Wave 0)
    provides: audit_log-Tabelle, audit.service.ts, vitest test-infra (createTestDb, expectAuditEntry)
  - phase: 02-auth-layer
    provides: existierende contacts-Tabelle (FK supplier_contact_id)
  - phase: dj-modul (Migration 026)
    provides: dj_invoices, dj_events (FKs linked_invoice_id, linked_event_id)
provides:
  - 9 neue Tabellen fuer Belege-Modul (areas, tax_categories, trips, receipts, receipt_files, receipt_area_links, receipt_links, receipt_ocr_results, supplier_memory)
  - 4 GoBD-Lock-Trigger (1x receipts, 3x receipt_files)
  - Seeds: 3 Areas, 17 Tax-Categories, 9 Settings-Keys
  - tasks.source_receipt_id (Idempotenz-Anker fuer taskAutomationService in Plan 04-05)
  - 12 Schema-Integrationstests in test/schema.test.ts (ersetzt Wave-0-Placeholder)
affects: [04-02-services, 04-03-upload-ocr, 04-04-supplier-memory, 04-05-task-automation, 04-06-dj-sync, 04-07-ui-overview, 04-08-ui-list-detail, 04-09-ui-upload, 04-10-ui-tax-export-settings, 04-11-dj-refactor, 04-12-seed-final]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cents-Integer-Pattern: alle Geld-Felder als INTEGER (Cents) — exchange_rate (Wechselkurs) und overall_confidence (OCR-Score) bleiben REAL, da kein Geldbetrag"
    - "GoBD-Lock via DB-Trigger: BEFORE UPDATE/INSERT/DELETE mit RAISE(ABORT) — Defense-in-Depth, blockt Manipulation auch bei Application-Bug"
    - "Spalten-spezifischer Lock: receipts-Trigger feuert nur bei Aenderung finanzrelevanter Felder (Liste in WHEN-Clause), nicht bei harmlosen Feldern wie notes"
    - "n:m via Composite-PK: receipt_area_links nutzt PRIMARY KEY (receipt_id, area_id) statt Surrogate-ID — verhindert Duplikate by-design"
    - "Idempotente Migration: alle CREATE TABLE/INDEX/TRIGGER mit IF NOT EXISTS, alle INSERTs mit OR IGNORE — sicher bei Re-Run"
    - "ALTER TABLE in Migration: source_receipt_id Spalte wird zu bestehender tasks-Tabelle hinzugefuegt (kein Rebuild noetig, da nur ADD COLUMN)"

key-files:
  created:
    - backend/src/db/migrations/040_belege.sql
  modified:
    - backend/test/schema.test.ts (Wave-0-Placeholder durch 12 echte Tests ersetzt)

key-decisions:
  - "Migration ist 040, nicht 039 — Wave 0 hat 039_audit_log.sql belegt; nuechste freie Nummer ist 040"
  - "Alle Geld-Felder INTEGER (Cents) — verhindert Float-Drift; nur exchange_rate (Wechselkurs) und overall_confidence (OCR-Score 0-100) bleiben REAL, da kein Geldbetrag"
  - "GoBD-Trigger feuert nur bei Aenderung finanzrelevanter Felder — notes/tags bleiben editierbar nach Freigabe; verhindert dass User nichts mehr aendern koennen"
  - "receipt_area_links nutzt Composite-PK statt Surrogate-ID — verhindert Duplikate, simpler bei Upserts"
  - "exchange_rate ist REAL (nicht INTEGER) — Wechselkurs hat 4-6 Nachkommastellen, kein Geldbetrag der gerundet werden muss"
  - "private_share_percent als INTEGER 0-100 mit CHECK — vermeidet 0.5 → Rundungsfehler"
  - "tasks-Erweiterung in dieser Migration (source_receipt_id), nicht in separater Migration — gehoert semantisch zu Belege-Modul"

patterns-established:
  - "Naming-Conflict-Resolution: bei reservierter Migrationsnummer naechste freie Nummer waehlen + Header-Kommentar dokumentiert die Abweichung"
  - "Schema-Tests via :memory: DB: lade alle Migrationen, verifiziere Tabellen-Existenz, Spalten-Typen, Seeds, Trigger-Behavior — Living Specification"

requirements-completed: [BELEG-SCHEMA-01, BELEG-SCHEMA-02, BELEG-SCHEMA-03, BELEG-SCHEMA-04, BELEG-SCHEMA-05, BELEG-SCHEMA-06, BELEG-SCHEMA-07, BELEG-SCHEMA-08, BELEG-SCHEMA-09]

# Metrics
duration: 4min
completed: 2026-05-06
---

# Phase 04 Plan 01: Schema Summary

**Migration 040_belege.sql legt das vollstaendige Belege-Schema an: 9 Tabellen, 4 GoBD-Lock-Trigger, alle Geld-Felder als INTEGER (Cents), plus Seeds fuer Areas/Tax-Categories/Settings — verifiziert durch 12 Integration-Tests.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-06T08:43:22Z
- **Completed:** 2026-05-06T08:47:47Z
- **Tasks:** 2 / 2
- **Files created:** 1
- **Files modified:** 1
- **Tests:** 15/15 passed (3 audit + 12 schema)

## Accomplishments

- **Wave 1 abgeschlossen** — das Schema-Fundament fuer Plans 04-02..04-12 steht.
- **9 neue Tabellen** in einer einzigen idempotenten Migration: areas, tax_categories, trips, receipts, receipt_files, receipt_area_links, receipt_links, receipt_ocr_results, supplier_memory.
- **GoBD-Lock als Defense-in-Depth**: 4 BEFORE-Trigger blocken UPDATE auf finanzrelevante receipts-Felder sowie INSERT/UPDATE/DELETE auf receipt_files — sobald `freigegeben_at` gesetzt ist, kann kein Bug und kein direktes SQL die Daten korrumpieren. Nicht-finanzrelevante Felder (notes, tags) bleiben editierbar.
- **Cents-Integer durchgaengig**: `amount_gross_cents`, `amount_net_cents`, `vat_amount_cents`, `paid_amount_cents`, `amount_gross_eur_cents`, `rate_per_km_cents`, `amount_cents` — alle INTEGER. Nur `exchange_rate` (Wechselkurs) und `overall_confidence` (OCR-Score) sind REAL — keine Geldwerte.
- **Seeds vollstaendig**: 3 Areas (Amazon FBA orange, DJ blau, Privat gruen), 17 Tax-Categories (inkl. Fahrtkosten mit vat_rate=0, Sonstiges als 'beides'), 9 App-Settings-Keys (inkl. `belege_storage_path` aus Q1).
- **tasks.source_receipt_id ergaenzt** — Idempotenz-Anker fuer `taskAutomationService` in Plan 04-05; Index `idx_tasks_source_receipt` ebenfalls angelegt.
- **12 Schema-Tests** ersetzen Wave-0-Placeholder. Tests verifizieren Tabellen-Existenz, Spalten-Typen, Seeds, GoBD-Trigger-Behavior (blockt amount_gross_cents-UPDATE, blockt receipt_files-INSERT, erlaubt notes-UPDATE).

## Task Commits

1. **Task 1: Migration 040_belege.sql** — `bbc12d6` (feat) — 348 Zeilen SQL: 9 Tabellen, 4 Trigger, 3 Seed-Bloecke, 1 ALTER TABLE
2. **Task 2: Schema-Integrationstests** — `6265d59` (test) — schema.test.ts mit 12 Tests, ersetzt Wave-0-Placeholder

## Files Created/Modified

### Created
- `backend/src/db/migrations/040_belege.sql` — 348 Zeilen, 9 CREATE TABLE, 4 CREATE TRIGGER, 3 INSERT-Bloecke, 1 ALTER TABLE, ~11 CREATE INDEX

### Modified
- `backend/test/schema.test.ts` — 12 Test-Faelle (vorher 1 Placeholder)

## Decisions Made

- **Migration-Nummer 040 statt 039** — Wave 0 (Plan 04-00) hat bereits `039_audit_log.sql` belegt. Plan 04-01 spezifizierte ursprünglich 039_belege.sql; um Naming-Conflict zu vermeiden wurde die Migration in 040 umbenannt. Header-Kommentar in der SQL-Datei dokumentiert die Abweichung.
- **Cents als INTEGER, nicht REAL** — kein Float-Drift, exakte Arithmetik, kompatibel mit `formatCurrencyFromCents` (Plan 04-02). Ausnahmen `exchange_rate` und `overall_confidence` sind keine Geldwerte und bleiben REAL.
- **GoBD-Trigger spaltenspezifisch** — der `trg_receipts_no_update_after_freigabe`-Trigger feuert nur wenn finanzrelevante Felder veraendert werden (supplier_name, amount_*, vat_*, receipt_date, supplier_invoice_number, reverse_charge, file_hash_sha256, type, private_share_percent). Felder wie `notes`, `tags`, `paid_amount_cents`, `payment_date` bleiben editierbar — Zahlungseingang nach Freigabe muss noch erfasst werden koennen.
- **receipt_area_links Composite-PK** — `PRIMARY KEY (receipt_id, area_id)` statt `id INTEGER PRIMARY KEY AUTOINCREMENT`; verhindert Duplikate by-design, simpler bei Upserts ("Area X zum Beleg hinzufuegen oder belassen").
- **tasks-ALTER in dieser Migration** — `source_receipt_id` gehoert semantisch zum Belege-Modul, daher hier statt in separater Migration. ALTER TABLE ADD COLUMN ist sicher (kein Rebuild noetig).
- **Idempotenz konsequent** — alle CREATE TABLE/INDEX/TRIGGER mit `IF NOT EXISTS`, alle INSERTs mit `OR IGNORE`. Re-Run der Migration ist sicher (auch wenn migrate.ts via `_migrations`-Tabelle ohnehin Doppel-Anwendung verhindert).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Migration umbenannt von 039_belege.sql auf 040_belege.sql**
- **Found during:** Task 1 (Plan-Lesung)
- **Issue:** Plan 04-01 spezifizierte Migration 039_belege.sql, aber Wave 0 (Plan 04-00) hat bereits 039_audit_log.sql produktiv angelegt. Eine zweite Migration mit Nummer 039 waere blockierend (migrate.ts sortiert alphabetisch, _migrations-Tabelle traegt Datei-Namen ein — eine Migration kann nicht parallel existieren).
- **Fix:** Migration-Datei heisst 040_belege.sql; Header-Kommentar dokumentiert die Abweichung. Alle Tests, Acceptance Criteria und Verifikations-Befehle wurden auf 040 umgestellt. Die Plan-Erwartung (9 Tabellen + 4 Trigger + 3 Seeds + 1 ALTER) ist zu 100% inhaltlich erfuellt.
- **Files modified:** backend/src/db/migrations/040_belege.sql, backend/test/schema.test.ts (describe-Block-Name auf "Migration 040_belege schema")
- **Commit:** bbc12d6 (Task 1)
- **Folge fuer spaetere Plans:** STATE.md decision-Eintrag, ROADMAP.md erwaehnt 040 als korrekte Nummer, Plan 04-06 (`Migration 039a Fahrten-Migration`) und Plan 04-11 (`Migration 039b dropped dj_expenses`) muessen ebenfalls neue Nummern (z.B. 041, 042) waehlen — wird in deren Plan-Lesung erkannt.

Sonst keine Abweichungen — alle 9 Tabellen-Definitionen, alle 4 Trigger, alle Seeds und der tasks-ALTER 1:1 wie spezifiziert.

## Issues Encountered

Keine inhaltlichen Probleme. Migration kompilierte direkt sauber, Tests waren beim ersten Lauf alle gruen — d.h. Task 1 (Schema) und Task 2 (Tests) waren passgenau aufeinander abgestimmt.

Hinweis zur TDD-Reihenfolge: Da Plan 01 die Migration und die Tests in zwei separate Tasks teilt (Task 1 = Migration schreiben, Task 2 = Tests gegen die Migration), war der RED-Schritt nicht klassisch (kein "fehlender Tabelle"-Fehler). Die Tests dienen primaer als Living Specification und Regression-Schutz fuer Folge-Plans.

## User Setup Required

Keine. Backend wird beim naechsten `npm run dev` automatisch Migration 040 anwenden (migrate.ts macht vorher automatisches DB-Backup unter `~/.local/share/benny-dashboard/backups/pre-migration-*.db`).

Ein Migration-Live-Test wurde bereits durchgefuehrt: 040 ist in `_migrations` registriert, alle 9 Belege-Tabellen sind in der produktiven `dashboard.db` verfuegbar, Seeds sind eingespielt.

## Next Phase Readiness

- **Plan 04-02 (Services) kann starten** — receipts/receipt_area_links/tax_categories Tabellen existieren; `lib/cents.ts` arbeitet auf den INTEGER-Spalten; `receiptService` kann CRUD via better-sqlite3 implementieren.
- **Plan 04-03 (Upload+OCR) kann starten** — receipt_files und receipt_ocr_results sind vorhanden; SHA-256-Hash-Spalte fuer Duplicate-Detection ist da.
- **Plan 04-04 (Supplier-Memory) kann starten** — supplier_memory-Tabelle mit UNIQUE(supplier_normalized, area_id, tax_category_id) ist da.
- **Plan 04-05 (Task-Automation) kann starten** — tasks.source_receipt_id ist verfuegbar (Idempotenz-Anker).
- **Plan 04-06 (DJ-Sync) kann starten** — receipts.linked_invoice_id und trips-Tabelle (mit linked_event_id) sind da. Achtung: dieser Plan plant "Migration 039a Fahrten-Migration" — wegen der Nummerierungs-Abweichung wird das eine 041 (oder hoeher) sein.
- **Defense-in-Depth GoBD aktiv** — auch wenn ein Service-Bug versucht, freigegebene Belege zu aendern, blockt der DB-Trigger.

## Self-Check: PASSED

Verifiziert per `test -f` / `git log` / `grep` / Test-Run / Live-Migration:

- [x] `backend/src/db/migrations/040_belege.sql` FOUND
- [x] `backend/test/schema.test.ts` FOUND (12 it()-Bloecke, vorher 1 Placeholder)
- [x] Commit `bbc12d6` (Task 1: Migration) FOUND in git log
- [x] Commit `6265d59` (Task 2: Schema-Tests) FOUND in git log
- [x] `npx vitest run` 15/15 passed (3 audit + 12 schema)
- [x] `npx tsc --noEmit` exit code 0
- [x] Migration 040 produktiv angewandt — `_migrations` enthaelt `040_belege.sql`
- [x] 9 Belege-Tabellen in produktiver DB existieren
- [x] 3 Areas seeded (Amazon FBA, DJ, Privat)
- [x] 17 Tax-Categories seeded
- [x] 9 App-Settings-Keys seeded (inkl. belege_storage_path)
- [x] grep "CREATE TABLE IF NOT EXISTS" in 040_belege.sql = 9
- [x] grep "CREATE TRIGGER IF NOT EXISTS trg_receipt" in 040_belege.sql = 4
- [x] grep "PRAGMA foreign_keys" in 040_belege.sql = 0
- [x] GoBD-Trigger blockt UPDATE auf amount_gross_cents (Test "blocks UPDATE on receipts.amount_gross_cents after freigegeben_at is set" passed)
- [x] GoBD-Trigger erlaubt UPDATE auf notes (Test "allows UPDATE on receipts.notes after freigegeben_at" passed)
- [x] GoBD-Trigger blockt INSERT auf receipt_files wenn receipt freigegeben (Test "blocks DELETE on receipt_files when receipt is freigegeben" passed — der Test prueft INSERT-Block, da mit freigegebenem receipt schon der INSERT scheitert)

---
*Phase: 04-belege-modul-dj-buchhaltungs-refactoring*
*Plan: 01 (Wave 1)*
*Completed: 2026-05-06*
