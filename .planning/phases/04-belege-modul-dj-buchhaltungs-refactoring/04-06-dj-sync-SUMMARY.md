---
phase: 04-belege-modul-dj-buchhaltungs-refactoring
plan: 06
subsystem: services, dj-mirror, trips-mirror, server-startup-sweep, datenmigration
tags: [typescript, vitest, sqlite, idempotent, gobd, cents-integer, mirror-sync, stornorechnung, vorgespraech, fahrtkosten]

# Dependency graph
requires:
  - phase: 04-01 (Wave 1)
    provides: receipts/trips/areas/tax_categories/receipt_area_links/dj_invoices, GoBD-Lock-Trigger, Cents-INTEGER-Spalten, FK linked_invoice_id + linked_trip_id, areas-Seed (slug='dj'), tax_categories-Seed (slug='fahrtkosten')
  - phase: 04-02 (Wave 2)
    provides: receiptService-Pattern (Audit-Log, GoBD-Lock-Awareness), vi.mock-Proxy-Test-Pattern (dbHolder + beforeEach createTestDb)
  - phase: dj-modul (Migration 026)
    provides: dj_invoices/dj_payments/dj_events/dj_expenses Tabellen, dj.invoices.routes.ts (5 mutating Routes), dj.events.routes.ts (Vorgespraech-Erledigt-Handler)
provides:
  - services/djSyncService.ts — mirrorInvoiceToReceipts (idempotent UPSERT, Stornos mit corrects_receipt_id)
  - services/tripSyncService.ts — mirrorTripToReceipts (idempotent UPSERT, type='fahrt', vat_rate=0)
  - routes/trips.routes.ts — GET/POST/PATCH/DELETE /api/trips
  - app.ts — Mount unter /api/trips hinter verifyToken
  - migrations/041_fahrten_migration.sql — Datenmigration dj_expenses(fahrzeug) → trips (idempotent, NOT EXISTS-Schutz)
  - test/djSync.test.ts — 9 Tests (Living Specification fuer Mirror-Verhalten)
  - test/tripSync.test.ts — 6 Tests (Living Specification fuer Trip-Mirror)
  - dj.invoices.routes.ts: 6 mirrorInvoiceToReceipts-Calls (POST, PATCH, finalize, cancel-original, cancel-storno, pay)
  - dj.events.routes.ts: trips-INSERT statt dj_expenses-INSERT im Vorgespraech-Erledigt-Handler + mirrorTripToReceipts
affects: [04-07-ui-overview, 04-08-ui-list-detail, 04-10-ui-tax-export-settings, 04-11-dj-refactor]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Idempotenter Mirror-Sync via Source+ForeignKey: WHERE source='dj_invoice_sync' AND linked_invoice_id=invoiceId — eindeutig pro dj_invoice; Re-Run macht UPDATE statt Duplikat"
    - "Korrekturkette fuer Stornos: Original-Mirror.corrected_by_receipt_id ↔ Storno-Mirror.corrects_receipt_id (beidseitige Verkettung); negative Cents-Beträge im Storno-Mirror"
    - "GoBD-Lock-Awareness im UPSERT: bei freigegebenem Mirror nur status/payment_date/paid_amount_cents updaten — finanzrelevante Felder bleiben gesperrt durch Trigger trg_receipts_no_update_after_freigabe"
    - "REAL → INTEGER-Cents-Konvertierung via Math.round(value * 100) — verhindert Float-Drift; Tests verifizieren 1234.56 → 123456"
    - "Reihenfolge bei Storno-Mirror: Original zuerst (status='storniert'), dann Storno (corrects_receipt_id-Lookup im 2. Call findet den geupdateten Original)"
    - "FK ON DELETE SET NULL fuer linked_trip_id (Migration 040): DELETE auf trip → receipt bleibt erhalten (GoBD), nur Verknuepfung wird gelöscht — keine Datenverlust-Gefahr"
    - "Idempotente Datenmigration mit NOT EXISTS-Schutz: created_at + purpose als Composite-Key — Re-Run der Migration fuegt keine Duplikate hinzu"

key-files:
  created:
    - backend/src/services/djSyncService.ts (245 Zeilen)
    - backend/src/services/tripSyncService.ts (124 Zeilen)
    - backend/src/routes/trips.routes.ts (146 Zeilen)
    - backend/src/db/migrations/041_fahrten_migration.sql (40 Zeilen)
    - backend/test/djSync.test.ts (244 Zeilen, 9 Tests)
    - backend/test/tripSync.test.ts (130 Zeilen, 6 Tests)
  modified:
    - backend/src/app.ts (+2 Zeilen: tripsRoutes-Import + Mount /api/trips)
    - backend/src/routes/dj.invoices.routes.ts (+8 Zeilen: 1 Import + 6 mirror-Calls)
    - backend/src/routes/dj.events.routes.ts (+15 Zeilen: 1 Import, dj_expenses-INSERT durch trips-INSERT ersetzt + mirrorTripToReceipts)

key-decisions:
  - "Migration 041 statt Plan-spezifizierter 039a — Wave 0 hat 039_audit_log.sql, Wave 1 hat 040_belege.sql; nächste freie Nummer ist 041 (gleicher Ansatz wie Plan 04-01 → 040)"
  - "Tabelle heisst dj_payments (NICHT dj_invoice_payments wie Plan-Snippet annahm) — siehe Migration 026 Zeile 302; Plan-Code wäre Runtime-Error gewesen"
  - "contacts-Spalten heissen organization_name + first_name/last_name + contact_kind (NICHT display_name + company + kind wie Plan-Snippet) — siehe Migration 015"
  - "Cancel-Route ruft mirrorInvoiceToReceipts ZWEI mal: Original (id) zuerst, dann Storno (cancelId) — sodass corrects_receipt_id-Lookup im 2. Call den geupdateten Original-Mirror findet"
  - "tripSyncService nutzt linked_trip_id als Idempotenz-Anker (vgl. linked_invoice_id in djSyncService) — gleiche Pattern-Konvention wie Plan 04-02 Service-Layer"
  - "trips.routes.ts DELETE löscht NUR die Trip-Row; verknuepfte Receipts bleiben (FK ON DELETE SET NULL) — GoBD-konform, Belege duerfen nicht durch DELETE eines Source-Eintrags verschwinden"
  - "Vorgespraech-Erledigt-Handler nutzt jetzt trips statt dj_expenses; linked_event_id wird gesetzt — spaeter Auswertung 'Fahrten zu Event X' moeglich"
  - "createBackup laeuft AUTOMATISCH via migrate.ts (Pattern aus CLAUDE.md) — kein manueller Aufruf in 041_fahrten_migration.sql noetig; vgl. backend/src/db/migrate.ts Zeile 34"

patterns-established:
  - "Mirror-Sync-Pattern fuer Source-of-Truth-Spiegel: idempotenter UPSERT auf source='X_sync' + foreign-key-id; Re-Run macht UPDATE; Stornos bekommen separate Mirrors mit corrects_receipt_id auf Original — wiederverwendbar fuer Plan 04-11 (Read-Only-Sicht), Amazon FBA (Plan ?), zukuenftige Quellsysteme"
  - "Test-Setup mit organization-Kontakten: contacts(contact_kind, organization_name) statt display_name+company — gleiche Spalten in allen Folge-Tests"
  - "Mirror-After-Audit-Order in Routes: logAudit zuerst (Audit-Log haengt nicht von Mirror ab), dann mirror — Mirror-Failure faellt in den existierenden errorHandler ohne Audit-Verlust"

requirements-completed: [BELEG-DJSYNC-01, BELEG-DJSYNC-02, BELEG-DJSYNC-03, BELEG-DJSYNC-04, BELEG-DJSYNC-05, BELEG-DJSYNC-06, BELEG-DJSYNC-07]

# Metrics
duration: 8min
completed: 2026-05-06
---

# Phase 04 Plan 06: DJ-Sync Summary

**dj_invoices und trips werden jetzt bei jeder Mutation idempotent in `receipts` gespiegelt: djSyncService + tripSyncService mit GoBD-Lock-Awareness und Storno-Korrekturkette; trips-CRUD-Endpoint liegt unter /api/trips; dj_expenses(fahrzeug) ist datentechnisch nach trips migriert; Vorgespraech-Erledigt-Handler erstellt jetzt trips statt dj_expenses — alles ueber 15 vitest-Tests verifiziert (112/112 Backend-Tests gruen).**

## Performance

- **Started:** 2026-05-06T12:54:29Z
- **Completed:** 2026-05-06T13:02:29Z
- **Duration:** ~8 min
- **Tasks:** 3 / 3
- **Files created:** 6 (2 services + 1 routes + 1 migration + 2 tests)
- **Files modified:** 3 (app.ts, dj.invoices.routes.ts, dj.events.routes.ts)
- **Tests:** 112/112 passed (97 vorher + 9 djSync + 6 tripSync = 112)
- **Sub-Repos:** keine — Single-Repo-Setup

## Accomplishments

- **Wave 3 Plan 06 abgeschlossen** — die DJ-Buchhaltungs-Synchronisierung steht. Plan 04-11 kann DjAccountingPage zur Read-Only-Sicht auf `receipts WHERE area=DJ` umstellen, weil JEDE dj_invoice und JEDE trip jetzt synchron in receipts gespiegelt wird.
- **djSyncService.ts** mit `mirrorInvoiceToReceipts(invoiceId, req?)`:
  - Idempotenter UPSERT via `source='dj_invoice_sync' AND linked_invoice_id=invoiceId`
  - Cents-Konvertierung: `Math.round(value * 100)` — Test verifiziert 1234.56 → 123456 (Float-Drift-Schutz)
  - Stornorechnungen (is_cancellation=1): eigener Mirror, negative Cents-Beträge, beidseitige Korrekturkette (Original.corrected_by_receipt_id ↔ Storno.corrects_receipt_id)
  - Status-Mapping: bezahlt→bezahlt, teilbezahlt→teilbezahlt, ueberfaellig→ueberfaellig, storniert→storniert, entwurf→zu_pruefen, sonst→offen
  - finalized_at→freigegeben_at + pdf_hash→file_hash_sha256 (GoBD-Lock-Trigger greift dann)
  - GoBD-Lock-Awareness: bei freigegebenem Mirror nur status/payment_date/paid_amount_cents updaten — finanzrelevante Felder bleiben durch Trigger gesperrt
  - DJ-Area-Link via `INSERT OR IGNORE INTO receipt_area_links (is_primary=1, share_percent=100)`
  - Optional Audit-Log mit action='mirror_sync'
- **tripSyncService.ts** mit `mirrorTripToReceipts(tripId, req?)`:
  - Idempotenter UPSERT via `source='dj_trip_sync' AND linked_trip_id=tripId`
  - type='fahrt', vat_rate=0, vat_amount_cents=0, tax_category='Fahrtkosten', input_tax_deductible=0 (Reisekostenpauschale)
  - supplier_name: 'Fahrt: Start → Ziel' wenn beide Locations gesetzt, sonst purpose
  - title: '{distance_km} km' (Inline-Anzeige im UI)
  - DJ-Area-Link analog zu djSyncService
- **trips.routes.ts** mit GET/GET-:id/POST/PATCH/DELETE — Mount unter /api/trips hinter verifyToken:
  - POST + PATCH triggern automatisch mirrorTripToReceipts → receipts werden mit-aktualisiert
  - DELETE entfernt nur Trip-Row; Receipts bleiben (FK ON DELETE SET NULL aus Migration 040)
  - Validation: expense_date pflicht; distance_km/rate_per_km_cents werden multipliziert für amount_cents
- **Migration 041_fahrten_migration.sql** — Datenmigration dj_expenses(category='fahrzeug') → trips:
  - Idempotent: NOT EXISTS-Schutz auf created_at + purpose
  - Heuristik: amount_gross/0.30 als distance_km, ROUND(amount_gross * 100) als amount_cents
  - createBackup laeuft AUTOMATISCH via migrate.ts (CLAUDE.md-Pattern, vgl. migrate.ts Zeile 34)
  - User-Bestaetigung CONTEXT.md D-06: dj_expenses ist leer → Migration ist No-Op; sicher fuer Re-Run
  - dj_expenses bleibt erhalten — DROP erfolgt erst in Plan 11
- **dj.invoices.routes.ts**: 6 mirror-Calls in 5 mutating Routes:
  - POST / (create) → 1
  - PATCH /:id → 1
  - POST /:id/finalize → 1
  - POST /:id/cancel → 2 (Original zuerst, dann Storno — sodass corrects_receipt_id-Lookup findet)
  - POST /:id/pay → 1
- **dj.events.routes.ts** (Vorgespraech-Erledigt-Handler): INSERT INTO dj_expenses(fahrzeug) ersetzt durch INSERT INTO trips + mirrorTripToReceipts. Receipts werden jetzt direkt erzeugt; linked_event_id auf trips ermöglicht spätere Auswertung "Fahrten zu Event X".
- **15 neue Tests** (9 djSync + 6 tripSync) decken alle Plan-Behavior-Items + Zusatzfaelle ab. Test-Pattern aus Plan 04-02 (vi.mock-Proxy + dbHolder + beforeEach createTestDb) wiederverwendet.

## Task Commits

1. **Task 1 RED — djSync Tests** — `f62b174` (test) — djSync.test.ts (244 Zeilen, 9 Tests, vi.mock-Proxy-Pattern)
2. **Task 1 GREEN — djSyncService** — `db6c985` (feat) — djSyncService.ts (245 Zeilen) + Test-Helper-Anpassung; 9/9 Tests gruen, tsc clean
3. **Task 2 — tripSyncService + trips.routes + Migration 041** — `4aa5e90` (feat) — tripSyncService.ts (124 Zeilen), trips.routes.ts (146 Zeilen), Migration 041 (40 Zeilen), tripSync.test.ts (130 Zeilen), app.ts (+2 Zeilen); 6/6 tripSync-Tests + 112/112 gesamt gruen
4. **Task 3 — DJ-Routes Hooks** — `b9f066d` (feat) — dj.invoices.routes.ts (6 mirrorInvoiceToReceipts-Calls), dj.events.routes.ts (trips-INSERT statt dj_expenses + mirrorTripToReceipts); 112/112 Tests gruen, tsc clean

**Plan-Metadaten-Commit:** wird nach diesem SUMMARY plus STATE/ROADMAP/REQUIREMENTS-Updates gemacht.

## Files Created/Modified

### Created — Source

- `backend/src/services/djSyncService.ts` (245 Zeilen) — `mirrorInvoiceToReceipts`, `djSyncService`-Bundle. Idempotenter UPSERT mit GoBD-Lock-Awareness und Storno-Korrekturkette.
- `backend/src/services/tripSyncService.ts` (124 Zeilen) — `mirrorTripToReceipts`, `tripSyncService`-Bundle. Type='fahrt', vat_rate=0.
- `backend/src/routes/trips.routes.ts` (146 Zeilen) — CRUD-Endpoint /api/trips. POST+PATCH triggern mirror.
- `backend/src/db/migrations/041_fahrten_migration.sql` (40 Zeilen) — Datenmigration dj_expenses(fahrzeug) → trips. Idempotent.

### Created — Tests

- `backend/test/djSync.test.ts` (244 Zeilen, 9 Tests) — Cents-Konvertierung, Idempotenz, finalized_at→freigegeben_at, Storno-Korrekturkette, DJ-Area-Link, Status-Transitionen, payment_date aus dj_payments, UPDATE auf nicht-freigegebener Rechnung, Null-Edge.
- `backend/test/tripSync.test.ts` (130 Zeilen, 6 Tests) — Mirror mit type='fahrt', Idempotenz, DJ-Area-Link, supplier-Name-Fallback auf purpose, Null-Edge, UPDATE-Reflektion.

### Modified

- `backend/src/app.ts` (+2 Zeilen) — `import tripsRoutes` + `app.use('/api/trips', tripsRoutes)`.
- `backend/src/routes/dj.invoices.routes.ts` (+8 Zeilen) — Import `mirrorInvoiceToReceipts` + 6 Aufrufe in 5 mutating Routes (cancel: 2 Aufrufe).
- `backend/src/routes/dj.events.routes.ts` (+15 Zeilen) — Import `mirrorTripToReceipts` + INSERT INTO trips statt dj_expenses + Audit + mirror.

## Decisions Made

- **Migration 041 statt Plan-spezifizierter 039a** — Wave 0 (Plan 04-00) hat 039_audit_log.sql; Wave 1 (Plan 04-01) hat 040_belege.sql. Nächste freie Nummer ist 041. Pattern: bei Naming-Conflict naechste freie Nummer + Header-Kommentar dokumentiert die Abweichung (analog Plan 04-01).
- **Tabelle dj_payments statt dj_invoice_payments** — Plan-Code-Snippet referenzierte `dj_invoice_payments`; tatsächliche Tabelle aus Migration 026 Zeile 302 ist `dj_payments`. Plan-Code wäre Runtime-Error gewesen. Test "payment_date wird aus dj_payments übernommen wenn Status bezahlt" verifiziert die korrekte Tabellen-Wahl.
- **contacts-Spalten organization_name + first_name/last_name + contact_kind** — Plan-Code-Snippet erwartete display_name + company + kind. Migration 015 nutzt aber organization_name (TEXT) und contact_kind (CHECK 'person'/'organization'). getCustomerName fällt zurück auf organization_name → first_name+last_name → 'Kunde #ID'.
- **Cancel-Route ruft mirror ZWEI mal** — `mirrorInvoiceToReceipts(id, req); mirrorInvoiceToReceipts(cancelId, req);`. Reihenfolge wichtig: Original zuerst (status='storniert'), dann Storno (corrects_receipt_id-Lookup im 2. Call findet den geupdateten Original). Test "cancellation creates separate mirror with negative amount + corrects_receipt_id" verifiziert die Verkettung.
- **trips.routes.ts DELETE löscht nur Trip-Row** — Receipts mit linked_trip_id bleiben (FK ON DELETE SET NULL aus Migration 040). GoBD-konform: Belege duerfen nicht durch DELETE eines Source-Eintrags verschwinden. UI/Plan 11 sieht dann nur noch unverknuepfte Receipts.
- **createBackup automatisch via migrate.ts** — kein manueller Aufruf in 041_fahrten_migration.sql noetig. migrate.ts ruft `createBackup('pre-migration')` vor jeder Migration mit pending-Liste != [] (vgl. backend/src/db/migrate.ts Zeile 34). CLAUDE.md-Pattern.
- **dj_expenses bleibt** — Migration 041 ist additiv (INSERT INTO trips), kein DELETE/DROP auf dj_expenses. Plan 04-11 droppt dj_expenses erst nach Verifikation der Datenmigration. Sicher gegen Datenverlust auch bei Re-Run.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Migration umbenannt von 039a auf 041**
- **Found during:** Task 2 (Plan-Lesung — `ls backend/src/db/migrations/`)
- **Issue:** Plan 04-06 spezifizierte Migration 039a_fahrten_migration.sql. Wave 0 hat aber 039_audit_log.sql, Wave 1 hat 040_belege.sql. Eine Migration 039a wäre lexikografisch ZWISCHEN 039_audit_log und 040_belege einsortiert worden — was zu unerwartetem Migrations-Replay-Verhalten führen könnte (migrate.ts sortiert alphabetisch).
- **Fix:** Migration heisst 041_fahrten_migration.sql; Header-Kommentar dokumentiert die Abweichung. Pattern wie in Plan 04-01 (039 → 040).
- **Files modified:** backend/src/db/migrations/041_fahrten_migration.sql (Header-Kommentar Zeilen 5-7)
- **Commit:** 4aa5e90 (Task 2)

**2. [Rule 1 - Bug] Plan-Snippet referenzierte falsche Tabelle dj_invoice_payments**
- **Found during:** Task 1 (Implementierung von getLastPaymentDate)
- **Issue:** Plan-Code-Snippet im PLAN.md (Zeile 165) `SELECT MAX(payment_date) FROM dj_invoice_payments WHERE invoice_id = ?`. Diese Tabelle existiert NICHT — Migration 026 Zeile 302 definiert sie als `dj_payments`. Beim ersten Aufruf bei status='bezahlt' wäre ein "no such table"-Error gekommen.
- **Fix:** Service nutzt `FROM dj_payments`. Inline-Kommentar in djSyncService.ts dokumentiert den Konflikt mit dem Plan-Snippet, damit zukünftige Reviewer den Hintergrund verstehen.
- **Files modified:** backend/src/services/djSyncService.ts (getLastPaymentDate)
- **Tests:** Test "payment_date wird aus dj_payments übernommen wenn Status bezahlt" verifiziert das Verhalten.
- **Commit:** db6c985 (Task 1 GREEN)

**3. [Rule 1 - Bug] Plan-Snippet contacts-Spalten display_name + company**
- **Found during:** Task 1 (Implementierung von getCustomerName)
- **Issue:** Plan-Code-Snippet `SELECT display_name, first_name, last_name, company FROM contacts`. Diese Spalten existieren NICHT — Migration 015 hat `first_name`, `last_name`, `organization_name`, `contact_kind`. Test-INSERT mit `kind='company'` wäre CHECK-Constraint-Violation gewesen (CHECK contact_kind IN ('person','organization')).
- **Fix:** getCustomerName nutzt `organization_name`-Fallback. Test insertContact nutzt `(contact_kind, organization_name) VALUES ('organization', ?)`.
- **Files modified:** backend/src/services/djSyncService.ts (getCustomerName), backend/test/djSync.test.ts (insertContact-Helper)
- **Commit:** db6c985 (Task 1 GREEN)

**4. [Praezisierung] djSync-Tests um 3 Zusatztests erweitert (9 statt 6)**
- **Issue:** Plan listete 6 Behavior-Items im `<behavior>`-Block. Damit der Test-File als Living Specification das System wirklich beschreibt, wurden 3 weitere Tests ergaenzt:
  - "payment_date wird aus dj_payments übernommen wenn Status bezahlt" — verifiziert die korrekte Tabellen-Wahl (Threat-Model T-04-SYNC-02 Race-Condition).
  - "idempotenter UPDATE auf nicht-freigegebener Rechnung ändert finanz-Felder" — verifiziert dass UPSERT NICHT nur INSERT macht, sondern auch sauber UPDATEt.
  - "returns null when invoice does not exist" — verifiziert defensive Edge.
- **Files modified:** backend/test/djSync.test.ts (9 Tests statt 6).
- **Commit:** f62b174 (Task 1 RED)

**5. [Praezisierung] tripSync-Tests um 3 Zusatztests erweitert (6 statt 3)**
- **Issue:** Plan listete 3 Behavior-Items. Erweitert um:
  - "uses purpose as supplier when start/end fehlen" — verifiziert supplier_name-Fallback.
  - "returns null when trip does not exist" — defensive Edge.
  - "UPDATE auf Mirror reflektiert Aenderung der Trip-Daten" — verifiziert dass mirror-NACH-trip-update wirklich die Receipts aktualisiert.
- **Files modified:** backend/test/tripSync.test.ts (6 Tests statt 3).
- **Commit:** 4aa5e90 (Task 2)

**6. [Rule 2 - Critical] Cancel-Route mirror-2x statt 1x**
- **Found during:** Task 3 (Plan-Lesung — Plan-Action-Snippet sagt "BOTH mirrorInvoiceToReceipts(id, req) AND mirrorInvoiceToReceipts(cancelId, req)")
- **Issue:** Plan formulierte das als Soll-Anforderung; Reihenfolge war nicht explizit. Wenn Storno-Mirror VOR Original-Mirror gerufen wird, findet der `corrects_receipt_id`-Lookup im Storno-Mirror nichts (Original-Mirror existiert noch nicht oder hat alte Daten).
- **Fix:** Reihenfolge fixiert: `mirrorInvoiceToReceipts(id, req); mirrorInvoiceToReceipts(cancelId, req);`. Inline-Kommentar dokumentiert die Reihenfolge-Anforderung.
- **Files modified:** backend/src/routes/dj.invoices.routes.ts (cancel-Route).
- **Commit:** b9f066d (Task 3)

**Total deviations:** 6 (3 Plan-Bugs auto-gefixt, 1 Naming-Conflict-Resolution, 2 Praezisierungen). Keine Plan-Acceptance-Criteria-Verletzung — alle Soll-Items sind durch Tests + Routes-Hooks abgedeckt.

## Issues Encountered

Keine. Build, Tests und Wiring liefen direkt sauber:
- `npx tsc --noEmit` exit 0 (112/112 Tests gruen).
- `npx vitest run` 112/112 passed (97 vorher + 15 neue = 112).
- Acceptance-Criteria per grep verifiziert:
  - `mirrorInvoiceToReceipts` 7 Treffer in dj.invoices.routes.ts (1 Import + 6 Calls) — Plan-Soll war >= 5
  - `INSERT INTO dj_expenses` 0 Treffer in dj.events.routes.ts (gelöscht)
  - `INSERT INTO trips` 1 Treffer in dj.events.routes.ts
  - `mirrorTripToReceipts` 2 Treffer in dj.events.routes.ts (1 Import + 1 Call)
  - `app.use('/api/trips'` 1 Treffer in app.ts

Hinweis zur TDD-Reihenfolge: Task 1 wurde klassisch in 2 Commits aufgeteilt (RED + GREEN); Task 2 und 3 wurden als kombinierte feat-Commits gemacht (Migration + Service + Routes + Tests gemeinsam) — die Tests waren bei Task 2 GREEN bei erstem Lauf, weil das Pattern aus Task 1 / Plan 04-02 1:1 wiederverwendet wurde.

## User Setup Required

Keine Aktion noetig. Backend wendet beim naechsten `npm run dev` automatisch Migration 041 an (migrate.ts macht vorher automatisches DB-Backup). Da dj_expenses leer ist (CONTEXT.md D-06), ist die Migration ein No-Op — kein User-sichtbarer Datenfluss.

UAT-Vorschlag (manuell, falls gewuenscht):
1. Backend starten: `cd backend && npm run dev` — Log "[migrate] Applied 041_fahrten_migration.sql" sollte erscheinen.
2. POST `/api/dj/invoices` mit Items → Receipt mit type='ausgangsrechnung', source='dj_invoice_sync' wird erzeugt; sichtbar in `SELECT * FROM receipts WHERE source='dj_invoice_sync'`.
3. POST `/api/dj/invoices/:id/finalize` → Receipt bekommt freigegeben_at + status='offen' + receipt_number.
4. POST `/api/dj/invoices/:id/cancel` → Original-Receipt status='storniert', neuer Storno-Receipt mit negativem amount_gross_cents + corrects_receipt_id auf Original.
5. POST `/api/trips` mit `{ distance_km: 50, expense_date: '2026-05-05', purpose: 'Fahrt Test' }` → Trip + Receipt mit type='fahrt', vat_rate=0, tax_category='Fahrtkosten'.
6. PATCH `/api/dj/events/:id/vorgespraech` mit `action='erledigt'` und `km > 0` → trips-Eintrag wird erzeugt (NICHT mehr dj_expenses), Receipt wird gespiegelt.

## Next Phase Readiness

- **Plan 04-07 (UI Overview)** kann starten — KPIs koennen gegen `receipts WHERE area=DJ` lesen, weil JEDE dj_invoice und JEDE trip jetzt darin liegt. KPI "Offene DJ-Rechnungen" liest `receipts WHERE source='dj_invoice_sync' AND status IN ('offen','teilbezahlt','ueberfaellig')`.
- **Plan 04-08 (UI List/Detail)** kann starten — Detail-Page kann `corrects_receipt_id`/`corrected_by_receipt_id`-Verkettung anzeigen ("Stornorechnung zu RE-1002 vom ...").
- **Plan 04-10 (UI Tax Export Settings)** kann starten — taxCalcService aus Plan 04-02 sieht jetzt alle DJ-Einnahmen und DJ-Fahrten. KZ81 (19% Umsatz) wird korrekt befuellt; Fahrtkosten sind in KZ66 NICHT enthalten (input_tax_deductible=0, vat_rate=0).
- **Plan 04-11 (DJ-Refactor)** kann starten — DjAccountingPage kann auf Read-Only-Sicht umstellen. dj_expenses kann gedroppt werden; Migration aus 041 hat die fahrzeug-Daten gerettet. Trip-Summe via View v_dj_trips wird durch trips-Tabelle ersetzt — view kann gedroppt oder umbenannt werden in Plan 11.
- **Mirror-Sync-Pattern etabliert** — fuer Amazon FBA, zukuenftige Email-Imports, OCR-Reconciliation kann das identische Pattern (idempotenter UPSERT auf source+linked-id, GoBD-Lock-Awareness, Korrekturkette) wiederverwendet werden.

## Self-Check: PASSED

Verifiziert per `test -f` / `git log` / `npx tsc` / `npx vitest` / `grep`:

- [x] `backend/src/services/djSyncService.ts` FOUND (245 Zeilen)
- [x] `backend/src/services/tripSyncService.ts` FOUND (124 Zeilen)
- [x] `backend/src/routes/trips.routes.ts` FOUND (146 Zeilen)
- [x] `backend/src/db/migrations/041_fahrten_migration.sql` FOUND (40 Zeilen)
- [x] `backend/test/djSync.test.ts` FOUND (244 Zeilen, 9 Tests)
- [x] `backend/test/tripSync.test.ts` FOUND (130 Zeilen, 6 Tests)
- [x] `backend/src/app.ts` MODIFIED (+2 Zeilen — tripsRoutes-Import + Mount)
- [x] `backend/src/routes/dj.invoices.routes.ts` MODIFIED (+8 Zeilen — Import + 6 mirror-Calls)
- [x] `backend/src/routes/dj.events.routes.ts` MODIFIED (+15 Zeilen — Import + trips-INSERT + mirror)
- [x] Commit `f62b174` (Task 1 RED) FOUND in git log
- [x] Commit `db6c985` (Task 1 GREEN) FOUND in git log
- [x] Commit `4aa5e90` (Task 2: tripSyncService + trips.routes + Migration 041) FOUND in git log
- [x] Commit `b9f066d` (Task 3: DJ-Routes Hooks) FOUND in git log
- [x] `npx tsc --noEmit` exit code 0
- [x] `npx vitest run` 112/112 passed (97 + 15 = 112)
- [x] djSyncService exportiert: mirrorInvoiceToReceipts, djSyncService
- [x] tripSyncService exportiert: mirrorTripToReceipts, tripSyncService
- [x] grep "Math.round" djSyncService.ts → 4 Treffer (Cents-Konvertierung)
- [x] grep "ensureAreaLink" djSyncService.ts → 2 Treffer (function + call)
- [x] grep "vat_rate" tripSyncService.ts → 0/0 Werte gesetzt korrekt (vat_rate=0 in INSERT)
- [x] grep "INSERT INTO trips" Migration 041 → 1 Treffer
- [x] grep "FROM dj_expenses" Migration 041 → 1 Treffer
- [x] grep "category = 'fahrzeug'" Migration 041 → 1 Treffer
- [x] grep "app.use('/api/trips'" app.ts → 1 Treffer
- [x] grep "mirrorInvoiceToReceipts" dj.invoices.routes.ts → 7 Treffer (Plan-Soll: >= 5)
- [x] grep "INSERT INTO dj_expenses" dj.events.routes.ts → 0 Treffer (gelöscht)
- [x] grep "INSERT INTO trips" dj.events.routes.ts → 1 Treffer
- [x] grep "mirrorTripToReceipts" dj.events.routes.ts → 2 Treffer (Import + Call)
- [x] Test "creates a receipt with cents conversion (REAL → INTEGER)" passed (1234.56 → 123456)
- [x] Test "is idempotent — second call updates same row" passed
- [x] Test "cancellation creates separate mirror with negative amount + corrects_receipt_id" passed (corrects + corrected_by)
- [x] Test "creates DJ area link" passed
- [x] Test "payment_date wird aus dj_payments übernommen wenn Status bezahlt" passed
- [x] Test "mirrors trip into receipts with type=fahrt and vat_rate=0" passed (input_tax_deductible=0, tax_category='Fahrtkosten')

---
*Phase: 04-belege-modul-dj-buchhaltungs-refactoring*
*Plan: 06 (Wave 3)*
*Completed: 2026-05-06*
