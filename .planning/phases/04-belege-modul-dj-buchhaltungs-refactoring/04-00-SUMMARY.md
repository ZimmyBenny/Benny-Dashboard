---
phase: 04-belege-modul-dj-buchhaltungs-refactoring
plan: 00
subsystem: database, testing
tags: [sqlite, audit-log, gobd, vitest, better-sqlite3, migration]

# Dependency graph
requires:
  - phase: 02-auth-layer
    provides: AuthenticatedRequest-Interface (req.user.id / req.user.username)
  - phase: dj-modul (Migration 026)
    provides: dj_audit_log-Tabelle als Schema-Vorlage und Datenquelle
provides:
  - audit_log-Tabelle mit append-only Triggern (GoBD-konform, app-weit nutzbar)
  - audit.service.ts mit logAudit-API (kompatibel zur alten dj-Signatur, plus Belege-Action-Types)
  - Backend-Test-Infrastruktur (vitest 2 + forks-Pool + :memory:-DB-Setup)
  - test/setup.ts createTestDb() — laedt alle Migrationen in :memory:
  - test/helpers.ts expectAuditEntry() — wiederverwendbar fuer Folge-Plans
affects: [04-01-schema, 04-02-services, 04-03-upload-ocr, 04-04-supplier-memory, 04-05-task-automation, 04-06-dj-sync, 04-11-dj-refactor, 04-12-seed-final]

# Tech tracking
tech-stack:
  added: [vitest@2, "@vitest/ui@2"]
  patterns:
    - "Backend-Tests: vitest mit pool=forks (better-sqlite3 ist NICHT worker-safe)"
    - "Test-DB: Database(':memory:') + alle Migrationen sequenziell laden — kein Mocking, echte SQL"
    - "Audit-Log generisch: entity_type/entity_id/action — entkoppelt von Modul-Schema"
    - "DB-Trigger als Defense-in-Depth: BEFORE UPDATE/DELETE mit RAISE(ABORT) blockt Manipulation auch bei Application-Bug"

key-files:
  created:
    - backend/src/db/migrations/039_audit_log.sql
    - backend/src/services/audit.service.ts
    - backend/vitest.config.ts
    - backend/test/setup.ts
    - backend/test/helpers.ts
    - backend/test/audit.test.ts
    - backend/test/schema.test.ts
  modified:
    - backend/package.json (vitest devDeps + 3 npm scripts)
    - backend/src/routes/dj.invoices.routes.ts (Import-Pfad)
    - backend/src/routes/dj.quotes.routes.ts (Import-Pfad)
    - backend/src/routes/dj.events.routes.ts (Import-Pfad)
    - backend/src/routes/dj.expenses.routes.ts (Import-Pfad)
    - backend/src/routes/dj.services.routes.ts (Import-Pfad)
    - backend/src/routes/dj.settings.routes.ts (Import-Pfad)
  deleted:
    - backend/src/services/dj.audit.service.ts

key-decisions:
  - "Datenmigration via INSERT ... SELECT mit NOT EXISTS-Schutz (idempotent ueber Re-Runs hinweg) statt DROP/RENAME — verhindert Datenverlust bei fehlgeschlagener Migration"
  - "Original-IDs aus dj_audit_log werden nicht uebernommen (nirgendwo verlinkt — verifiziert via grep) — neue audit_log.id ist sauberes AUTOINCREMENT"
  - "vitest pool=forks + singleFork=true — better-sqlite3 darf nicht zwischen Workern wandern; verhindert SQLITE-Lock-Crash"
  - "Test-Setup laedt ALLE Migrationen in :memory: (kein Subset) — Tests sind realitaetsnah, dj_events/dj_invoices etc. existieren auch im Test"
  - "audit.service.ts behaelt exakt die logAudit-Signatur von dj.audit.service.ts → 60+ Bestandsaufrufer brauchen keine Code-Aenderung, nur Import-Pfad"
  - "AuditEntityType erweitert um 6 neue Belege-bezogene Werte (receipt, receipt_file, area, tax_category, trip, app_setting) — Plan 01-02 koennen direkt loggen"
  - "AuditAction erweitert um freigeben/ocr_apply/mirror_sync — entspricht Belege-Lifecycle in 04-CONTEXT.md"

patterns-established:
  - "Backend-Test-Layout: backend/test/*.test.ts neben backend/src/, vitest.config.ts im backend-Root"
  - "TDD-Reihenfolge bei Migrationen: erst Test (RED, Tabelle fehlt), dann Migration (GREEN) — Test wird zu Living Specification"
  - "Append-only-Tabellen: BEFORE UPDATE + BEFORE DELETE Trigger mit RAISE(ABORT, 'GoBD: ...') als Standard-Bauteil"

requirements-completed: [BELEG-AUDIT-01, BELEG-AUDIT-02, BELEG-AUDIT-03, BELEG-AUDIT-04, BELEG-AUDIT-05, BELEG-TEST-01, BELEG-TEST-02, BELEG-TEST-03, BELEG-TEST-04]

# Metrics
duration: 5min
completed: 2026-05-06
---

# Phase 04 Plan 00: Audit-Refactor Summary

**Generisches `audit_log` ersetzt `dj_audit_log` app-weit (mit GoBD-Triggern als Defense-in-Depth) und Backend-Test-Infrastruktur (vitest@2 + forks-Pool + In-Memory-DB) ist betriebsbereit.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-06T08:34:00Z
- **Completed:** 2026-05-06T08:38:58Z
- **Tasks:** 3 / 3
- **Files created:** 7
- **Files modified:** 7
- **Files deleted:** 1

## Accomplishments

- **Wave 0 abgeschlossen** — Phase 4 hat jetzt das Fundament fuer alle weiteren Plans (Schema, Services, OCR, UI).
- **Generisches audit_log** mit 11 Spalten, 2 Indizes, 2 Append-Only-Triggern in Migration 039 — ersetzt das DJ-spezifische `dj_audit_log` ohne Datenverlust (idempotenter `INSERT ... SELECT` mit NOT EXISTS-Schutz).
- **API-kompatibler audit.service.ts** mit derselben `logAudit(req, type, id, action, old, new)`-Signatur wie der Vorgaenger — alle 60+ Bestandsaufrufer in 6 DJ-Routes funktionieren ohne Code-Aenderung weiter.
- **Backend-Test-Infrastruktur etabliert** — `npx vitest run` ist neuer Verifikations-Standard fuer Phase 4. Test-DB ist `:memory:`, laedt alle 39 Migrationen, isoliert per `pool=forks`. 4/4 Tests gruen.
- **dj.audit.service.ts geloescht** — keine veraltete Parallel-Datei mehr; `grep -r "dj.audit.service" backend/src` ist leer.

## Task Commits

Jeder Task wurde atomar committed:

1. **Task 1: Backend-Test-Setup mit vitest** — `edf5098` (test) — RED: 3 audit-Tests fail wegen fehlender Tabelle, 1 placeholder gruen
2. **Task 2: Migration 039 + audit.service.ts** — `f47f7ab` (feat) — GREEN: Tabelle + Trigger erstellt, audit-Tests jetzt 3/3 gruen
3. **Task 3: 6 DJ-Route-Imports umgeleitet + alte Service geloescht** — `8a08648` (refactor) — Final: tsc clean, 4/4 Tests gruen, 0 Referenzen auf dj.audit.service

## Files Created/Modified

### Created
- `backend/src/db/migrations/039_audit_log.sql` — audit_log-Tabelle mit Triggern + Daten-Migration aus dj_audit_log
- `backend/src/services/audit.service.ts` — logAudit-Funktion, schreibt in audit_log; 11 AuditEntityTypes (alt + Belege-Erweiterung), 14 AuditActions
- `backend/vitest.config.ts` — vitest-Config mit pool=forks fuer better-sqlite3-Kompatibilitaet
- `backend/test/setup.ts` — `createTestDb()` laedt alle Migrationen in `:memory:`
- `backend/test/helpers.ts` — `expectAuditEntry()` als Test-Utility fuer Folge-Plans
- `backend/test/audit.test.ts` — 3 Smoke-Tests (INSERT erlaubt, UPDATE/DELETE blockiert)
- `backend/test/schema.test.ts` — Placeholder fuer Plan 01

### Modified
- `backend/package.json` — vitest@2 + @vitest/ui in devDeps; `test`/`test:watch`/`test:ui` Scripts ergaenzt
- `backend/src/routes/dj.invoices.routes.ts` — Import: `dj.audit.service` → `audit.service`
- `backend/src/routes/dj.quotes.routes.ts` — gleiche Aenderung
- `backend/src/routes/dj.events.routes.ts` — gleiche Aenderung
- `backend/src/routes/dj.expenses.routes.ts` — gleiche Aenderung
- `backend/src/routes/dj.services.routes.ts` — gleiche Aenderung
- `backend/src/routes/dj.settings.routes.ts` — gleiche Aenderung

### Deleted
- `backend/src/services/dj.audit.service.ts` — alle Aufrufer migriert; Verhalten wandert zu audit.service.ts

## Decisions Made

- **`INSERT ... SELECT` mit `NOT EXISTS` statt `RENAME TABLE`** — wenn die Migration teilweise fehlschlaegt, bleiben sowohl `dj_audit_log` als auch teilbefuellte `audit_log` zugaenglich. Wiederholungslauf duplizieren keine Eintraege. (Plan-Vorgabe, im Code verifiziert.)
- **Original-IDs werden nicht uebernommen** — nirgendwo im Backend werden `dj_audit_log.id`-Werte als Foreign Key referenziert (per grep verifiziert). `audit_log.id` startet als sauberes AUTOINCREMENT bei 1.
- **vitest@2, NICHT @3** — bewusste Wahl: vitest 2 ist stabiler mit Vite/CJS-Mix; das deprecation-Warning "Vite CJS Node API is deprecated" ist kosmetisch und beeintraechtigt nichts.
- **`pool: 'forks'` + `singleFork: true`** — better-sqlite3-Native-Module duerfen nicht zwischen Workern wandern (CRASH-Risiko); singleFork garantiert sequentielle Test-Ausfuehrung.
- **Test-Setup laedt ALLE 39 Migrationen** — Folge-Tests in Plan 01+ koennen problemlos `dj_events`, `dj_invoices`, `contacts` etc. nutzen, ohne Setup-Boilerplate zu duplizieren.

## Deviations from Plan

None — plan executed exactly as written.

Eine winzige Praezisierung: In Schritt "tsc + grep" verblieb nach Task 3 zunaechst genau **ein** Treffer auf `dj.audit.service` — als Wort in einem Code-Kommentar in der neuen `audit.service.ts` ("API-kompatibel zum bisherigen dj.audit.service"). Das ist semantisch kein Code-Bezug. Um die Acceptance-Criterion "0 Treffer" exakt zu erfuellen, wurde der Kommentar-Text auf "DJ-Audit-Service" umformuliert. Keine funktionale Aenderung — Teil von Commit `8a08648`.

## Issues Encountered

None. Migrationen kompilierten direkt sauber, Tests liefen ohne Anpassung, alle 6 Route-Imports liessen sich per Edit-Tool umstellen.

## User Setup Required

None — keine externen Services, keine Env-Vars, keine manuellen Schritte. Backend startet mit `npm run dev`; Migration 039 wird automatisch beim ersten Start angewandt (migrate.ts macht vorab automatisches DB-Backup → siehe `~/.local/share/benny-dashboard/dashboard.db.backup-pre-migration-*`).

## Next Phase Readiness

- **Plan 04-01 (Schema) kann starten** — `audit_log` ist verfuegbar, neue Tabellen koennen direkt gegen den verallgemeinerten Audit-Service loggen (ohne neue Helper).
- **Plan 04-02 bis 04-12 koennen Tests schreiben** — `createTestDb()` und `expectAuditEntry()` sind etabliert; das Setup laedt automatisch jede neue Migration.
- **DJ-Modul (in Produktion in Benutzung) ist nicht beeintraechtigt** — Bestandsaufrufer schreiben ab jetzt in `audit_log` statt `dj_audit_log`. Alte Daten bleiben in `dj_audit_log` lesbar erhalten und sind zusaetzlich in `audit_log` kopiert.
- **Defense-in-Depth fuer GoBD aktiv** — selbst wenn ein zukuenftiger Plan versehentlich UPDATE/DELETE auf `audit_log` versucht, blockt der DB-Trigger mit `RAISE(ABORT)`.

## Self-Check: PASSED

Verifiziert per `test -f` / `git log` / `grep`:

- [x] `backend/src/db/migrations/039_audit_log.sql` FOUND
- [x] `backend/src/services/audit.service.ts` FOUND
- [x] `backend/src/services/dj.audit.service.ts` correctly DELETED (nicht im working tree)
- [x] `backend/vitest.config.ts` FOUND
- [x] `backend/test/setup.ts` FOUND
- [x] `backend/test/helpers.ts` FOUND
- [x] `backend/test/audit.test.ts` FOUND
- [x] `backend/test/schema.test.ts` FOUND
- [x] Commit `edf5098` (Task 1: test setup) FOUND in git log
- [x] Commit `f47f7ab` (Task 2: migration + service) FOUND in git log
- [x] Commit `8a08648` (Task 3: route migration) FOUND in git log
- [x] `npx tsc --noEmit` exit code 0
- [x] `npx vitest run` 4/4 passed
- [x] `grep -r "dj.audit.service" backend/src` = 0 Treffer
- [x] 6 DJ-Routes importieren aus `'../services/audit.service'`

---
*Phase: 04-belege-modul-dj-buchhaltungs-refactoring*
*Plan: 00 (Wave 0)*
*Completed: 2026-05-06*
