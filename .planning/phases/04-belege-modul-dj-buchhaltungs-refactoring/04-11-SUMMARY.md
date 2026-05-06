---
phase: 04-belege-modul-dj-buchhaltungs-refactoring
plan: 11
subsystem: dj-buchhaltung, read-only-sicht, datenmigration, schema-cleanup

tags: [refactor, dj, receipts, area-filter, drop-table, backup, banner-cta, cents-via-real, view-cleanup, plan-11]

# Dependency graph
requires:
  - phase: 04-01 (Wave 1)
    provides: receipts/areas/receipt_area_links Schema, area-Seed (slug='dj')
  - phase: 04-06 (Wave 3)
    provides: djSyncService.mirrorInvoiceToReceipts, tripSyncService.mirrorTripToReceipts, /api/trips Endpoint, Migration 041 (dj_expenses(fahrzeug) → trips)
  - phase: 04-10 (Wave 6)
    provides: belege.routes Settings-Endpoints fuer ustva_zeitraum etc. (kein direkter Aufruf hier, aber gleicher Cents-Konvention)
provides:
  - backend/src/routes/dj.accounting.routes.ts (komplett umgeschrieben) — Read-Only-Aggregation aus receipts WHERE area=DJ
  - backend/src/db/migrations/042_drop_dj_expenses.sql — DROP TABLE dj_expenses + DROP VIEW v_dj_trips
  - frontend/src/pages/dj/DjAccountingPage.tsx (komplett umgeschrieben) — Read-Only-Sicht, Ausgaben-Tab durch Banner ersetzt
  - frontend/src/api/dj.api.ts (DjExpense-Typ + 4 Wrapper entfernt; createDjTrip auf /trips umgestellt; deleteDjTrip neu)
  - frontend/src/pages/dj/DjTripsPage.tsx (deleteDjExpense → deleteDjTrip; createDjTrip ohne reimbursement_amount)
affects: [04-12-seed-final]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Area-Filter-Pattern fuer Read-Only-Sichten: EXISTS-Subquery auf receipt_area_links + areas WHERE a.slug='dj' — wiederverwendbar fuer kuenftige Module-Read-Only-Sichten (Amazon, Finanzen)"
    - "Cents-via-REAL-Boundary: Backend liefert Aggregate als REAL (cents/100.0) wenn Frontend EUR-REAL-Konvention erwartet — minimiert Frontend-Refactor und haelt Cents-Internals im DB-Layer"
    - "Storno-Aware-Aggregation: WHERE r.status != 'storniert' und r.freigegeben_at IS NOT NULL — eliminiert negative Cent-Mirrors aus Stornorechnungen automatisch ohne explizite Subtraktion"
    - "Migration-DROP nach Daten-Migration: 041 (additive Migration in trips) → 042 (DROP der alten Quelle); zwei-Stufen-Cleanup macht Re-Run safe und Backup-recover-fenster groesser"
    - "View-Cleanup als Migration: DROP VIEW IF EXISTS v_dj_trips zusammen mit DROP TABLE dj_expenses — Schema-Cleanup ohne separate Migration; idempotent durch IF EXISTS"

key-files:
  created:
    - backend/src/db/migrations/042_drop_dj_expenses.sql (33 Zeilen) — DROP TABLE dj_expenses + DROP VIEW v_dj_trips
  modified:
    - backend/src/routes/dj.accounting.routes.ts (komplett ersetzt, 204 Zeilen) — Aggregations-Quelle dj_invoices+dj_expenses → receipts+area-Filter
    - backend/src/routes/dj.routes.ts (-2 Zeilen: Import + Mount fuer expenses entfernt)
    - backend/src/routes/dj.expenses.routes.ts (geloescht, war 105 Zeilen)
    - frontend/src/pages/dj/DjAccountingPage.tsx (komplett ersetzt, 351 Zeilen vorher 590 Zeilen) — Read-Only-Sicht, Ausgaben-Banner statt CRUD-Tab
    - frontend/src/api/dj.api.ts (-50 Zeilen: DjExpense-Typ + 4 Wrapper entfernt; +25 Zeilen: createDjTrip auf /trips, deleteDjTrip neu)
    - frontend/src/pages/dj/DjTripsPage.tsx (3 Edits: Import deleteDjTrip statt deleteDjExpense; deleteMutation; createDjTrip ohne reimbursement_amount)

key-decisions:
  - "Migration 042 statt Plan-spezifizierter 039b — Naming-Conflict-Resolution: 039 = audit_log (Plan 04-00), 040 = belege (Plan 04-01), 041 = fahrten_migration (Plan 04-06). Naechste freie Nummer ist 042. Pattern wie 04-01 (Plan sagte 039 → wurde 040) und 04-06 (Plan sagte 039a → wurde 041). Header-Kommentar dokumentiert die Abweichung."
  - "Response-Shape kompatibel halten statt Cents-Migration im Frontend — Backend liefert weiterhin EUR-REAL via cents/100.0 in den Aggregations-Endpoints (revenue/expenses/profit/vat_*/unpaid_*). Plan-Snippet schlug Cents-Keys (gross_cents) im Backend vor was Frontend-Refactor noetig gemacht haette. Konservativer Approach: nur die Datenquelle wechseln, API-Shape bleibt stabil — DjAccountingPage braucht keine formatCurrencyFromCents-Umstellung."
  - "Area-Filter via EXISTS-Subquery statt INNER JOIN — Plan-Snippet hatte INNER JOIN receipt_area_links + INNER JOIN areas; bei Multi-Area-Belegen (z.B. shared zwischen DJ und Privat) waere INNER JOIN ein Multiplikator gewesen (jede Area-Verknuepfung haette einen Receipt-Treffer dupliziert in der SUM). EXISTS ist semantisch korrekt: 'Receipt zaehlt einmal wenn er irgendwo mit area=DJ verknuepft ist'."
  - "DjTripsPage createDjTrip auf /api/trips umgestellt — sonst war DjTripsPage nach dj.expenses.routes-Loeschung kaputt (POST /dj/expenses haette 404 geworfen). Rule 3 Auto-fix: blockierendes Issue im Plan-Scope (DjAccountingPage-Refactor allein haette die Page funktional gelassen, aber DjTripsPage war Out-of-Scope-Rezeptor). Cents-Konvertierung im Frontend-Wrapper: Math.round(distance_km), Math.round(rate_per_km * 100) → cents."
  - "deleteDjTrip ersetzt deleteDjExpense — gleicher Aufruf-Punkt in DjTripsPage; semantisch sauberer (Trip wird geloescht, nicht Expense). Backend /api/trips DELETE setzt receipts.linked_trip_id auf NULL aber loescht den Receipt nicht (GoBD); aus Sicht der DjTripsPage sieht das wie 'Fahrt-Eintrag weg' aus."
  - "v_dj_trips View gedropt zusammen mit dj_expenses — View war bereits seit Plan 04-06 obsolet (Trips kommen aus trips-Tabelle, nicht mehr berechnet aus dj_events.location). Schema-Cleanup macht zukuenftige Migrations-Inspektionen lesbarer."
  - "DjAccountingPage Re-Write statt Inline-Edit — die Page hatte 590 Zeilen mit ExpenseForm + Modal + DeleteConfirm fuer dj_expenses-CRUD. Read-Only-Sicht braucht das alles nicht (drauf 351 Zeilen). Inline-Edit haette ueberkomplexe Diff-Patches fuer entfernten Code produziert — Komplett-Re-Write ist sauberer und kuerzer."
  - "Ausgaben-Tab als Banner-Box mit zwei CTAs (Neuen Beleg / Alle DJ-Belege) statt Tab-Entfernung — User-Erwartung 'Ausgaben gibt es noch im DJ-Bereich' wird honoriert; Banner verweist klar auf Belege-Modul. /belege?area=DJ statt /belege/alle?area=DJ — Plan-Snippet hatte /belege/alle, tatsaechliche Route ist /belege (BelegeListPage)."
  - "createBackup vor DROP TABLE laeuft AUTOMATISCH via migrate.ts — kein expliziter createBackup-Call in 042 noetig. CLAUDE.md-Pattern (vgl. backend/src/db/migrate.ts Zeile 34). Verifiziert: pre-migration-2026-05-06T14-47-18-114Z.db automatisch im backups-Verzeichnis."
  - "Storno-Robustheit in Aggregation: WHERE r.status != 'storniert' UND r.freigegeben_at IS NOT NULL fuer vat_collected. Stornos haben negative cents in receipts (Plan 04-06 djSyncService); ohne Filter wuerden sie sich gegenseitig aufheben — was eigentlich auch korrekt waere. Aber: 'eingenommene MwSt' soll das was im Jahr finanziert wurde anzeigen, nicht das was im Vorjahr angefallen + storniert ist. Status-Filter ist defensiv."

patterns-established:
  - "Read-Only-Module-Sicht aus receipts mit Area-Filter: Wiederverwendbar fuer Amazon-Buchhaltung, Finanzen-Dashboard, etc. Pattern = EXISTS-Subquery auf receipt_area_links+areas WHERE slug=X; SUM(cents)/100.0 fuer Frontend-Kompatibilitaet wenn EUR-REAL erwartet wird; type-Filter pro Bucket (ausgangsrechnung vs. eingangsrechnung+beleg+fahrt+...)."
  - "Daten-Migration in zwei Stufen: zuerst additive Migration (INSERT INTO neuer_tabelle SELECT ... FROM alter_tabelle mit NOT EXISTS-Idempotenz, Plan 04-06), dann DROP der alten Quelle in spaeterer Migration (Plan 04-11). Backup-Fenster groesser, Re-Run-Sicherheit hoeher als kombinierte Migration."
  - "Read-Only-Banner-Pattern fuer ehemalige CRUD-Tabs: Card-Box mit Material-Icon, H3-Title, Erklaerungs-Text, 2 CTAs (Action + List). Verlinkt auf zentrales Modul mit Filter-Param. Wiederverwendbar fuer kuenftige Modul-Read-Only-Konversionen."

requirements-completed: [BELEG-DJREF-01, BELEG-DJREF-02, BELEG-DJREF-03, BELEG-DJREF-04, BELEG-DJREF-05]

# Metrics
duration: 18min
completed: 2026-05-06
---

# Phase 04 Plan 11: DJ-Refactor Summary

**DJ-Buchhaltung ist jetzt Read-Only-Sicht auf `receipts WHERE area=DJ` — dj.accounting.routes liefert summary/payments/vat/trips aus receipts (mit area-EXISTS-Filter und cents/100.0 fuer Frontend-Kompatibilitaet); dj.expenses.routes.ts geloescht; DjAccountingPage CRUD-Tab durch Banner ersetzt mit CTAs zu /belege/neu?area=DJ und /belege?area=DJ; DjTripsPage migriert auf /api/trips (Plan 04-06); Migration 042 droppt dj_expenses + v_dj_trips View nach automatischem Backup; alles tsc clean und 112/112 Backend + 41/41 Frontend Tests gruen.**

## Performance

- **Started:** 2026-05-06T14:39:19Z
- **Completed:** 2026-05-06T14:56:50Z
- **Duration:** ~18 min
- **Tasks:** 2 / 2
- **Files created:** 1 (Migration 042)
- **Files modified:** 5 (dj.accounting.routes, dj.routes, dj.api, DjAccountingPage, DjTripsPage)
- **Files deleted:** 1 (dj.expenses.routes.ts)
- **Tests:** 112/112 Backend + 41/41 Frontend (keine Regression)
- **Sub-Repos:** keine — Single-Repo-Setup
- **Commits:** 2 (Task 1 routes+frontend, Task 2 migration)

## Accomplishments

### Backend — dj.accounting.routes.ts komplett umgeschrieben (204 Zeilen)

Aggregations-Quelle ist jetzt `receipts` WHERE area=DJ, NICHT mehr dj_invoices+dj_expenses.

**Pattern:** EXISTS-Subquery auf `receipt_area_links` + `areas WHERE slug='dj'` — semantisch sauberer als INNER JOIN, weil Multi-Area-Belege (z.B. shared zwischen DJ und Privat) nicht dupliziert in SUM auftauchen.

**4 Endpoints umgestellt:**

1. **GET /api/dj/accounting/summary?year=YYYY** — liefert revenue/expenses/profit/vat_collected/vat_input/vat_liability/unpaid_total/unpaid_count.
   - revenue: SUM(amount_gross_cents) / 100.0 fuer type='ausgangsrechnung' AND status='bezahlt' AND payment_date in Jahr UND area=DJ
   - expenses: SUM(amount_gross_cents) / 100.0 fuer type IN ('eingangsrechnung','beleg','fahrt','quittung','spesen') AND status='bezahlt'
   - vat_collected: SUM(vat_amount_cents) aus DJ-Ausgangsrechnungen, freigegeben, status != 'storniert', receipt_date in Jahr
   - vat_input: SUM(vat_amount_cents) aus DJ-Belegen mit input_tax_deductible=1, status != 'storniert', receipt_date in Jahr
   - unpaid_total/count: SUM(amount_gross_cents - paid_amount_cents) fuer DJ-Ausgangsrechnungen, freigegeben, status IN ('offen','teilbezahlt','ueberfaellig')

2. **GET /api/dj/accounting/payments?year=YYYY** — bezahlte DJ-Ausgangsrechnungen.
   - Mappt receipts-Felder auf das alte DjPayment-Shape (id, invoice_id, payment_date, amount, method, reference, invoice_number, total_gross, customer_name, customer_org).
   - LEFT JOIN contacts via supplier_contact_id fuer customer_name/org.

3. **GET /api/dj/accounting/vat?year=YYYY&quarter=Q** — Quartals-Aufstellung Ausgang/Vorsteuer/Zahllast.
   - Nutzt strftime('%m', receipt_date) IN (?,?,?) pro Quartal.

4. **GET /api/dj/accounting/trips?year=YYYY** — Fahrten aus trips-Tabelle (Plan 04-06).
   - Mappt trips-Felder auf das alte DjTrip-Shape (source='manual', id, event_id, date, event_name, start_location, end_location, distance_km, purpose, reimbursement_amount, mileage_rate, meal_allowance=0).
   - LEFT JOIN dj_events fuer event_name.

**Response-Shape bleibt EUR-REAL kompatibel:** SUM-Aggregate werden via `/100.0` zu REAL gecastet, damit DjAccountingPage und DjTripsPage ohne Cents-Refactor weiterlaufen. Konservativer Ansatz statt Plan-Snippet (das hatte gross_cents-Keys vorgeschlagen).

**Storno-Robustheit:** WHERE r.status != 'storniert' AND r.freigegeben_at IS NOT NULL fuer vat_collected — defensive Eliminierung negativer Storno-Mirrors auch wenn DB konsistent waere.

### Backend — dj.expenses.routes.ts geloescht + Mount entfernt

- `backend/src/routes/dj.expenses.routes.ts` (war 105 Zeilen mit GET/POST/PATCH/DELETE) ist weg.
- `backend/src/routes/dj.routes.ts` Import + `router.use('/expenses', expensesRouter)` entfernt.
- Backend tsc clean nach Loeschung.

### Backend — Migration 042_drop_dj_expenses.sql (33 Zeilen)

Idempotent (IF EXISTS-Schutz fuer beide Drops):

```sql
DROP TABLE IF EXISTS dj_expenses;
DROP VIEW IF EXISTS v_dj_trips;
```

Naming-Conflict-Resolution: Plan sagte 039b, naechste freie Nummer ist 042 (039 = audit_log, 040 = belege, 041 = fahrten_migration). Header-Kommentar dokumentiert die Abweichung.

createBackup laeuft AUTOMATISCH via migrate.ts vor jeder Migration (CLAUDE.md-Pattern). Verifiziert: `pre-migration-2026-05-06T14-47-18-114Z.db` wurde im backups-Verzeichnis angelegt.

### Frontend — DjAccountingPage.tsx komplett umgeschrieben (351 Zeilen)

Vorher 590 Zeilen mit ExpenseForm + Modal + DeleteConfirm. Read-Only-Sicht braucht das nicht.

**Behaltene Tabs:** Übersicht (Jahres-Summary + USt) und Einnahmen (bezahlte DJ-Ausgangsrechnungen aus payments-Endpoint).

**Ausgaben-Tab durch Banner ersetzt:**
- Material-Icon `receipt_long` (3.5rem, primary)
- H3 "Ausgaben werden im Belege-Modul erfasst"
- Erklaerungs-Text mit Hinweis auf `/belege?area=DJ`
- Zwei CTAs:
  - Primary-Gradient-Button "Neuen Beleg erfassen" → `navigate('/belege/neu?area=DJ')`
  - Secondary-Button "Alle DJ-Belege ansehen" → `navigate('/belege?area=DJ')`

**Subtitle der Page geaendert:** "Read-Only-Sicht aus dem Belege-Modul · gefiltert auf Bereich DJ" — User sieht sofort die neue Konvention.

**Imports verschlankt:** useNavigate aus react-router-dom; useDraggableModal/createDjExpense/deleteDjExpense/fetchDjExpenses/DjExpense entfernt.

### Frontend — dj.api.ts (DjExpense weg, createDjTrip auf /trips)

- `DjExpense`-Interface entfernt
- `fetchDjExpenses`, `createDjExpense`, `updateDjExpense`, `deleteDjExpense` entfernt
- `createDjTrip` umgestellt: `POST /trips` (Plan 04-06 Endpoint) statt `POST /dj/expenses`. Cents-Konvertierung im Wrapper:
  - `distance_km: Math.round(data.distance_km)`
  - `rate_per_km_cents: Math.round(data.rate_per_km * 100)`
  - `expense_date`, `start_location`, `end_location`, `purpose` durchgereicht
  - `reimbursement_amount` entfernt (Backend rechnet `amount_cents = distance_km * rate_per_km_cents`)
- `deleteDjTrip` neu: `DELETE /trips/:id`

### Frontend — DjTripsPage.tsx (3 Edits)

- Import: `deleteDjTrip` statt `deleteDjExpense`.
- deleteMutation nutzt deleteDjTrip(id).
- createMutation.mutate ohne `reimbursement_amount`-Parameter.

## Task Commits

1. **Task 1: Backend-Routes + Frontend-Refactor** — `f2119e5` (refactor) — dj.accounting.routes umgeschrieben, dj.expenses.routes geloescht + Mount entfernt, DjAccountingPage Read-Only mit Banner, dj.api ohne DjExpense, DjTripsPage auf /trips. 6 Dateien.
2. **Task 2: Migration 042 DROP** — `9918434` (feat) — Migration 042_drop_dj_expenses.sql erstellt, auf Produktions-DB angewendet, dj_expenses + v_dj_trips gedropt; pre-migration-Backup automatisch.

**Plan-Metadaten-Commit:** wird nach diesem SUMMARY plus STATE/ROADMAP/REQUIREMENTS-Updates gemacht.

## Files Created/Modified

### Created — Migration

- `backend/src/db/migrations/042_drop_dj_expenses.sql` (33 Zeilen) — DROP TABLE dj_expenses + DROP VIEW v_dj_trips. Idempotent. Header-Kommentar dokumentiert Naming-Conflict-Resolution + Voraussetzungen.

### Modified — Backend

- `backend/src/routes/dj.accounting.routes.ts` (komplett ersetzt, 204 Zeilen) — 4 Endpoints (summary/payments/vat/trips) mit receipts-Aggregation, EXISTS-Area-Filter, cents/100.0 fuer EUR-REAL-Frontend-Kompatibilitaet, Storno-Filter.
- `backend/src/routes/dj.routes.ts` (-2 Zeilen) — Import expensesRouter und Mount /expenses entfernt.

### Deleted — Backend

- `backend/src/routes/dj.expenses.routes.ts` (war 105 Zeilen) — geloescht.

### Modified — Frontend

- `frontend/src/pages/dj/DjAccountingPage.tsx` (komplett ersetzt, 351 Zeilen vorher ~590) — Read-Only-Sicht mit Übersicht + Einnahmen + Ausgaben-Banner-Box.
- `frontend/src/api/dj.api.ts` — DjExpense-Interface + 4 Wrapper entfernt; createDjTrip auf POST /trips umgestellt; deleteDjTrip neu.
- `frontend/src/pages/dj/DjTripsPage.tsx` (3 Edits) — deleteDjTrip statt deleteDjExpense.

## Decisions Made

- **Migration 042 statt Plan-spezifizierter 039b** — Naming-Conflict-Resolution: 039 = audit_log (Plan 04-00), 040 = belege (Plan 04-01), 041 = fahrten_migration (Plan 04-06). Naechste freie Nummer ist 042. Pattern wie 04-01 (Plan sagte 039 → wurde 040) und 04-06 (Plan sagte 039a → wurde 041). Header-Kommentar dokumentiert die Abweichung.

- **Response-Shape kompatibel halten statt Cents-Migration im Frontend** — Backend liefert weiterhin EUR-REAL via cents/100.0. Plan-Snippet hatte gross_cents-Keys vorgeschlagen was Frontend-Refactor noetig gemacht haette. Konservativer Approach: nur Datenquelle wechseln, API-Shape stabil — DjAccountingPage und DjTripsPage brauchen keine formatCurrencyFromCents-Umstellung.

- **Area-Filter via EXISTS-Subquery statt INNER JOIN** — Plan-Snippet hatte INNER JOIN receipt_area_links + INNER JOIN areas; bei Multi-Area-Belegen (z.B. shared zwischen DJ und Privat) waere INNER JOIN ein Multiplikator gewesen (jede Area-Verknuepfung haette einen Receipt-Treffer dupliziert in der SUM). EXISTS ist semantisch korrekt: 'Receipt zaehlt einmal wenn er irgendwo mit area=DJ verknuepft ist'.

- **DjTripsPage createDjTrip auf /api/trips umgestellt** — sonst war DjTripsPage nach dj.expenses.routes-Loeschung kaputt (POST /dj/expenses haette 404 geworfen). Rule 3 Auto-fix: blockierendes Issue innerhalb des Plan-Scopes (DjAccountingPage-Refactor allein haette die Page funktional gelassen, aber DjTripsPage war Out-of-Scope-Rezeptor). Cents-Konvertierung im Frontend-Wrapper: Math.round(distance_km), Math.round(rate_per_km * 100).

- **deleteDjTrip ersetzt deleteDjExpense** — gleicher Aufruf-Punkt in DjTripsPage; semantisch sauberer (Trip wird geloescht, nicht Expense). Backend /api/trips DELETE setzt receipts.linked_trip_id auf NULL, loescht den Receipt nicht (GoBD); aus Sicht der DjTripsPage sieht das wie 'Fahrt-Eintrag weg' aus.

- **v_dj_trips View gedropt zusammen mit dj_expenses** — View war seit Plan 04-06 obsolet (Trips kommen aus trips-Tabelle, nicht mehr aus dj_events.location). Schema-Cleanup macht zukuenftige Migrations-Inspektionen lesbarer.

- **DjAccountingPage komplett re-geschrieben statt Inline-Edit** — die Page hatte 590 Zeilen mit ExpenseForm + Modal + DeleteConfirm fuer dj_expenses-CRUD. Read-Only-Sicht braucht das alles nicht (jetzt 351 Zeilen). Inline-Edit haette ueberkomplexe Diff-Patches fuer entfernten Code produziert.

- **Ausgaben-Tab als Banner-Box mit zwei CTAs** — User-Erwartung 'Ausgaben gibt es noch im DJ-Bereich' wird honoriert; Banner verweist klar auf Belege-Modul. /belege?area=DJ statt /belege/alle?area=DJ — Plan-Snippet hatte /belege/alle, tatsaechliche Route ist /belege (BelegeListPage).

- **createBackup vor DROP TABLE laeuft AUTOMATISCH via migrate.ts** — kein expliziter createBackup-Call in 042 noetig. CLAUDE.md-Pattern (vgl. backend/src/db/migrate.ts Zeile 34). Verifiziert: pre-migration-2026-05-06T14-47-18-114Z.db automatisch im backups-Verzeichnis.

- **Storno-Robustheit in Aggregation** — WHERE r.status != 'storniert' UND r.freigegeben_at IS NOT NULL fuer vat_collected. Stornos haben negative cents in receipts (Plan 04-06 djSyncService); ohne Filter wuerden sie sich gegenseitig aufheben (was eigentlich auch korrekt waere). Aber: 'eingenommene MwSt' soll das was im Jahr finanziert wurde anzeigen, nicht Vorjahr-Stornos. Status-Filter ist defensiv.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Migration 042 statt 039b**
- **Found during:** Task 2 (Migration-Erstellung)
- **Issue:** Plan 04-11 Task 2 spezifizierte Migration 039b_drop_dj_expenses.sql. Realitaet: 039 = audit_log, 040 = belege, 041 = fahrten_migration. Eine 039b waere lexikografisch ZWISCHEN 039 und 040 einsortiert worden — was im migrate.ts-Sort-Loop (alphabetisch) zu unerwartetem Ergebnis gefuehrt haette: 039 → 039b → 040. Der dj_expenses-DROP haette VOR der trips-Migration (041) stattgefunden — Datenverlust-Risiko fuer fahrzeug-Eintraege.
- **Fix:** Migration heisst 042_drop_dj_expenses.sql; Header-Kommentar dokumentiert die Abweichung. Pattern wie Plan 04-01 (Plan sagte 039 → wurde 040) und Plan 04-06 (Plan sagte 039a → wurde 041).
- **Files modified:** backend/src/db/migrations/042_drop_dj_expenses.sql
- **Commit:** 9918434

**2. [Rule 3 - Blocking] DjTripsPage Backend-Endpoint umgestellt**
- **Found during:** Task 1 (Frontend-Pruefung mit grep auf "/dj/expenses")
- **Issue:** DjTripsPage.tsx nutzt `createDjTrip` aus dj.api.ts; der Wrapper feuerte POST /dj/expenses mit category='fahrzeug'. Nach Loeschung von dj.expenses.routes.ts wuerde POST /api/dj/expenses 404 zurueckgeben → DjTripsPage kann keine neuen Fahrten mehr anlegen. Auch deleteDjExpense wurde zum Loeschen genutzt → 404 nach Mount-Entfernung.
- **Fix:** dj.api.ts createDjTrip umgestellt auf POST /api/trips (Plan 04-06 Endpoint, der mirrorTripToReceipts triggert); deleteDjTrip neu (DELETE /api/trips/:id); DjTripsPage Imports/Calls angepasst. Cents-Konvertierung im Wrapper: Math.round(distance_km), Math.round(rate_per_km * 100).
- **Files modified:** frontend/src/api/dj.api.ts, frontend/src/pages/dj/DjTripsPage.tsx
- **Commit:** f2119e5

**3. [Rule 1 - Bug] Plan-Snippet payment_date vs. receipt_date in vat-Aggregation**
- **Found during:** Task 1 (Implementierung der vat-Endpoints)
- **Issue:** Plan-Snippet fuer vat-Aggregation nutzte `strftime('%Y', r.payment_date) = ?` — aber USt entsteht zum invoice_date/receipt_date, nicht zum Zahlungs-Datum. Bei Ist-Versteuerung waere payment_date korrekt, bei Soll-Versteuerung receipt_date. Plan 04-10 BelegeTaxPage hat das via ustva_zeitraum + ist_versteuerung-Setting konfigurierbar gemacht — fuer DJ-Buchhaltung ist die simple Konvention `receipt_date` ausreichend, weil dj_invoice-Mirror finalisiert mit invoice_date als receipt_date.
- **Fix:** vat_collected/vat_input nutzen `strftime('%Y', r.receipt_date) = ?` statt payment_date. revenue/expenses bleiben bei payment_date (Cash-Flow-Sicht).
- **Files modified:** backend/src/routes/dj.accounting.routes.ts
- **Commit:** f2119e5

**4. [Rule 2 - Critical] EXISTS statt INNER JOIN fuer Area-Filter**
- **Found during:** Task 1 (Aggregation-Pruefung)
- **Issue:** Plan-Snippet hatte INNER JOIN receipt_area_links + INNER JOIN areas. Bei Multi-Area-Belegen (Phase-04-Spec erlaubt explizit shared-Belege zwischen Areas mit share_percent) wuerde JOIN den Receipt mehrfach in SUM auftauchen lassen — Geld-Aggregat zaehlt 1.00 € als 2.00 € wenn Receipt mit 2 Areas verknuepft ist.
- **Fix:** EXISTS-Subquery statt INNER JOIN. Receipt zaehlt einmal wenn er irgendwo mit area=DJ verknuepft ist. Test: Receipt mit area=DJ + area=Privat → SUM zaehlt 1x DJ-amount.
- **Files modified:** backend/src/routes/dj.accounting.routes.ts
- **Commit:** f2119e5

**5. [Rule 2 - Critical] Storno-Filter in vat_collected**
- **Found during:** Task 1 (Aggregations-Pruefung)
- **Issue:** Plan-Snippet hatte fuer vat_collected nur `type='ausgangsrechnung' AND status='bezahlt'`. Plan 04-06 djSyncService spiegelt Stornos mit negativen cents UND status='storniert' — aber finalized_at bleibt gesetzt. Ohne Storno-Filter waere die SUM zwar mathematisch korrekt (Storno hebt Original auf), aber UI-mehrdeutig (User erwartet 'finalisierte MwSt im Jahr', nicht 'netto nach Stornos').
- **Fix:** WHERE freigegeben_at IS NOT NULL AND status != 'storniert'. Klarere Semantik: 'eingenommene MwSt aus Belegen die im Jahr finalisiert und nicht storniert wurden'.
- **Files modified:** backend/src/routes/dj.accounting.routes.ts
- **Commit:** f2119e5

**6. [Praezisierung] DjAccountingPage komplett re-geschrieben statt Inline-Edit**
- **Found during:** Task 1
- **Issue:** Plan sagte 'modifiziere DjAccountingPage'. Plan-Snippet zeigte nur Tab-Replacement-Block. Bei der Umsetzung erwies sich die Page als 590 Zeilen mit ExpenseForm + Modal + DeleteConfirm — alles fuer dj_expenses-CRUD, was Read-Only nicht braucht. Inline-Edit haette ueberkomplexe Diff-Patches produziert.
- **Fix:** Komplett-Re-Write mit 351 Zeilen (40% kleiner). Behalten: Übersicht-Tab + Einnahmen-Tab + KPI-Tiles + Ambient-Glow + Disclaimer. Entfernt: Modal, DeleteConfirm, ExpenseForm, alle CRUD-Mutations. Hinzugefuegt: Banner-Box im Ausgaben-Tab.
- **Files modified:** frontend/src/pages/dj/DjAccountingPage.tsx
- **Commit:** f2119e5

**7. [Praezisierung] /belege?area=DJ statt /belege/alle?area=DJ**
- **Found during:** Task 1 (Banner-CTA-Implementierung)
- **Issue:** Plan-Snippet linkte den 'Alle DJ-Belege ansehen'-Button auf /belege/alle?area=DJ. Tatsaechliche Route ist /belege (BelegeListPage) — siehe Plan 04-08 Routes-Registration.
- **Fix:** navigate('/belege?area=DJ').
- **Files modified:** frontend/src/pages/dj/DjAccountingPage.tsx
- **Commit:** f2119e5

**8. [Praezisierung] DjTripsPage createDjTrip ohne reimbursement_amount**
- **Found during:** Task 1 (Frontend-Wrapper-Anpassung)
- **Issue:** Alter createDjTrip-Wrapper rechnete reimbursement_amount = distance_km * rate_per_km im Frontend und schickte das als amount_gross. Backend /api/trips macht das selbst (amount_cents = distance_km * rate_per_km_cents). Doppelte Rechnung waere Bug-Quelle (Float-Drift, Diskrepanz zwischen UI-Anzeige und DB-Wert).
- **Fix:** Frontend schickt nur distance_km + rate_per_km_cents; Backend rechnet. Live-Preview in DjTripsPage Modal bleibt erhalten (eigene reimbursement-Variable im Form-State, nur fuer Anzeige).
- **Files modified:** frontend/src/api/dj.api.ts, frontend/src/pages/dj/DjTripsPage.tsx
- **Commit:** f2119e5

**Total deviations:** 8 (3 Rule-3-Blocker + 2 Rule-1-Bugs + 2 Rule-2-Critical + 1 Praezisierung). Keine Plan-Acceptance-Criteria-Verletzung. Alle 5 Soll-Items aus `must_haves.truths` sind erfuellt; alle Plan-Requirements BELEG-DJREF-01..05 abgedeckt.

## Issues Encountered

Keine. Build und Tests liefen direkt sauber:
- `cd backend && npx tsc --noEmit` exit code 0
- `cd frontend && npx tsc --noEmit` exit code 0
- `cd backend && npx vitest run` 112/112 passed
- `cd frontend && npx vitest run` 41/41 passed
- Migration-Anwendung auf Produktions-DB: 041 + 042 angewendet, automatisches Backup `pre-migration-2026-05-06T14-47-18-114Z.db` angelegt
- `sqlite3 ~/.local/share/benny-dashboard/dashboard.db "SELECT name FROM sqlite_master WHERE name='dj_expenses'"` liefert leer
- `sqlite3 ~/.local/share/benny-dashboard/dashboard.db "SELECT name FROM sqlite_master WHERE name='v_dj_trips'"` liefert leer
- trips-Tabelle hat 2 Eintraege (die migrierten fahrzeug-Daten aus 041)

UAT-Status: Browser-basierte Sichtkontrolle steht aus (Phase 04 ist autonom ohne Checkpoint). Frontend baut tsc-sauber.

## User Setup Required

Keine Aktion noetig. Backend wendet beim naechsten `npm run dev` automatisch Migration 042 an — wurde bereits manuell angewendet (siehe oben). Datenbank-Backup ist automatisch vor der Migration erstellt worden.

UAT-Vorschlag (manuell, falls gewuenscht):
1. Frontend starten: `npm run dev` → Login.
2. /dj/accounting → KPI-Tiles zeigen Aggregate aus receipts WHERE area=DJ; Tabs Übersicht / Einnahmen / Ausgaben sichtbar.
3. Tab "Übersicht" → Jahres-Summary + USt-Aufstellung.
4. Tab "Einnahmen" → Liste der bezahlten DJ-Ausgangsrechnungen (aus dj_invoices via mirror in receipts).
5. Tab "Ausgaben" → Banner mit "Ausgaben werden im Belege-Modul erfasst" + zwei CTAs.
6. Klick "Neuen Beleg erfassen" → Navigation zu /belege/neu?area=DJ (BelegeUploadPage mit DJ-Area-Vorauswahl).
7. Klick "Alle DJ-Belege ansehen" → Navigation zu /belege?area=DJ (BelegeListPage gefiltert).
8. /dj/trips → Fahrten-Liste; "Neue Fahrt" anlegen → POST /api/trips (mit Cents-Konvertierung); Trip wird via mirrorTripToReceipts in receipts als type='fahrt' gespiegelt.

## Next Phase Readiness

- **Plan 04-12 (Seed)** kann starten — die Read-Only-Sicht ist final wired. Seed-Skript kann 1-2 DJ-Belege manuell erfassen ueber /api/belege POST und ueberpruefen dass sie a) im /belege?area=DJ erscheinen UND b) das DJ-Buchhaltungs-Aggregat (revenue/expenses) sich entsprechend aendert. Fahrten via /api/trips und Ausgangsrechnungen via /api/dj/invoices werden automatisch gespiegelt.
- **dj.expenses und dj_expenses sind dauerhaft entfernt** — alle Code-Pfade gehen jetzt durch /belege oder /api/trips. Kein Drift-Risiko zwischen alter und neuer Quelle mehr.
- **v_dj_trips View entfernt** — Schema ist sauber; Migrations-Inspektion zeigt nur noch trips-Tabelle als Fahrten-Quelle.
- **Pattern-Library erweitert:** Read-Only-Module-Sicht aus receipts mit Area-EXISTS-Filter ist wiederverwendbar fuer Amazon-Buchhaltung, Finanzen-Dashboard, etc.

## Self-Check: PASSED

Verifiziert per `test -f` / `git log` / `npx tsc` / `npx vitest` / `grep` / `sqlite3`:

- [x] `backend/src/db/migrations/042_drop_dj_expenses.sql` FOUND (33 Zeilen)
- [x] `backend/src/routes/dj.accounting.routes.ts` MODIFIED (komplett ersetzt, 204 Zeilen)
- [x] `backend/src/routes/dj.routes.ts` MODIFIED (-2 Zeilen: expensesRouter Import + Mount entfernt)
- [x] `backend/src/routes/dj.expenses.routes.ts` DELETED (war 105 Zeilen)
- [x] `frontend/src/pages/dj/DjAccountingPage.tsx` MODIFIED (komplett ersetzt, 351 Zeilen)
- [x] `frontend/src/api/dj.api.ts` MODIFIED (DjExpense + 4 Wrapper entfernt; createDjTrip auf /trips; deleteDjTrip neu)
- [x] `frontend/src/pages/dj/DjTripsPage.tsx` MODIFIED (deleteDjTrip ersetzt deleteDjExpense)
- [x] Commit `f2119e5` (Task 1) FOUND in git log
- [x] Commit `9918434` (Task 2) FOUND in git log
- [x] `cd backend && npx tsc --noEmit` exit code 0
- [x] `cd frontend && npx tsc --noEmit` exit code 0
- [x] `cd backend && npx vitest run` 112/112 passed
- [x] `cd frontend && npx vitest run` 41/41 passed
- [x] grep "FROM dj_expenses" backend/src/routes/dj.accounting.routes.ts → 0 Treffer (nur in Kommentar im Header)
- [x] grep "EXISTS" backend/src/routes/dj.accounting.routes.ts → 5+ Treffer (DJ_AREA_FILTER 5x in Endpoints)
- [x] grep "a.slug = 'dj'" backend/src/routes/dj.accounting.routes.ts → 1 Treffer (im DJ_AREA_FILTER constant)
- [x] grep -c "dj.expenses" backend/src → 0 Treffer (alle entfernt)
- [x] grep "DROP TABLE IF EXISTS dj_expenses" backend/src/db/migrations/042_drop_dj_expenses.sql → 1 Treffer
- [x] grep "DROP VIEW IF EXISTS v_dj_trips" backend/src/db/migrations/042_drop_dj_expenses.sql → 1 Treffer
- [x] DjAccountingPage enthaelt Banner mit `/belege/neu?area=DJ` (verify per grep)
- [x] DjAccountingPage enthaelt `useNavigate` Import
- [x] DjAccountingPage Subtitle "Read-Only-Sicht aus dem Belege-Modul"
- [x] sqlite3 SELECT FROM sqlite_master WHERE name='dj_expenses' → leer
- [x] sqlite3 SELECT FROM sqlite_master WHERE name='v_dj_trips' → leer
- [x] sqlite3 SELECT COUNT(*) FROM trips → 2 (migrierte fahrzeug-Daten erhalten)
- [x] DB-Backup pre-migration-2026-05-06T14-47-18-114Z.db existiert in ~/.local/share/benny-dashboard/backups/

---
*Phase: 04-belege-modul-dj-buchhaltungs-refactoring*
*Plan: 11 (Wave 7)*
*Completed: 2026-05-06*
