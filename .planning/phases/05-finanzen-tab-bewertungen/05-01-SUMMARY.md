---
phase: 5
plan: 1
subsystem: backend
tags: [amazon-reviews, migration, profit-calc, rest-api, vitest]
dependency_graph:
  requires: []
  provides:
    - amazon_reviews SQLite-Tabelle (Migration 046)
    - calcProfit Single-Source-of-Truth (backend/src/lib/profitCalc.ts)
    - CRUD + Stats API unter /api/finance/reviews
  affects:
    - backend/src/app.ts (Route-Registrierung)
    - backend/test/setup.ts (Migration-Idempotenz-Fix)
tech_stack:
  added:
    - profitCalc.ts (neue lib — kein NPM-Package)
  patterns:
    - PATCHABLE_FIELDS-Whitelist (Massenzuweisung-Schutz, T-05-05)
    - /stats VOR /:id (Express Match-Order, Pitfall 2)
    - yearFilterSqlAndParams-Helper (DRY, parametrisiert)
    - vi.mock + dbHolder + createTestDb-Pattern (Phase-4-Standard)
key_files:
  created:
    - backend/src/db/migrations/046_amazon_reviews.sql
    - backend/src/lib/profitCalc.ts
    - backend/src/routes/reviews.routes.ts
    - backend/test/reviews.test.ts
  modified:
    - backend/src/app.ts
    - backend/test/setup.ts
decisions:
  - "Migration-Nummer 046 bestaetigt — keine Konflikte, kein Auto-Bypass noetig"
  - "calcProfit darf negativ sein (User-Decision 2026-05-25): partial refund < purchase ergibt negativen Profit"
  - "PATCHABLE_FIELDS-Whitelist (10 Felder) schuetzt id/created_at/updated_at vor Client-Manipulation (T-05-05)"
  - "setup.ts: Migration 043 ADD COLUMN updated_at wird in :memory: ignoriert (015 hat Spalte bereits angelegt — SQLite kein IF NOT EXISTS)"
  - "/stats-Route explizit VOR /:id registriert (Express match-order, T-05 Pitfall 2)"
  - "verifyToken-Guard: reviews-Registrierung auf Zeile 65, verifyToken auf Zeile 45 — Auth-Bypass strukturell ausgeschlossen (T-05-01)"
metrics:
  duration_seconds: 300
  completed_date: "2026-05-25"
  tasks_completed: 3
  files_created: 4
  files_modified: 2
requirements_addressed:
  - D-10
  - D-11
  - D-12
  - D-13
  - D-14
  - D-15
  - D-17
---

# Phase 5 Plan 1: Backend-Foundation Bewertungen-Modul Summary

**One-liner:** SQLite-Tabelle amazon_reviews (Migration 046) + calcProfit Single-Source-of-Truth + CRUD/Stats-API + 136 Tests gruen.

## Was wurde gebaut

### Migration 046 (28 LOC)

`backend/src/db/migrations/046_amazon_reviews.sql` — Tabelle mit 13 Spalten:

- INTEGER PRIMARY KEY AUTOINCREMENT (`id`)
- Pflichtfelder: `product_name TEXT NOT NULL`, `purchase_price_cents INTEGER NOT NULL CHECK (>0)`
- Status-Enum via CHECK-Constraint: 10 Slugs (vorgemerkt → bestellt → erhalten → bewertet → geld_erhalten → bereit_verkauf → [behalten|verkauft|verschenkt|entsorgt]), DEFAULT `'vorgemerkt'`
- Optionale Felder: `order_date`, `received_date`, `review_deadline`, `refund_code`, `refund_amount_cents`, `sale_amount_cents`, `notes`
- Timestamps: `created_at`, `updated_at` (beide DEFAULT datetime('now'))
- 3 Indizes: `status`, `received_date`, `review_deadline`
- Kein PRAGMA foreign_keys (CLAUDE.md-Regel — migrate.ts steuert zentral)
- Auto-Backup vor Anwendung via migrate.ts (CLAUDE.md Datensicherheits-Regel)

### profitCalc.ts (32 LOC)

`backend/src/lib/profitCalc.ts` — Single-Source-of-Truth fuer die Profit-Formel:

- `ReviewStatus` — Union Type aller 10 Status-Slugs
- `ProfitInput` — Interface fuer calcProfit-Eingabe
- `REALIZING_STATUSES` — 6 Post-Payment-Slugs (ab geld_erhalten)
- `calcProfit(r)` — Returns 0 fuer Pending-Stati, (refund + sale) - purchase fuer realizing (darf negativ sein — User-Decision 2026-05-25)

**Hinweis fuer Plan 02:** Diese Datei muss identisch als `frontend/src/lib/profitCalc.ts` gespiegelt werden (bewusste Duplizierung — RESEARCH.md Pattern 7).

### reviews.routes.ts (142 LOC)

`backend/src/routes/reviews.routes.ts` — CRUD + Stats-Endpoints:

| Endpoint | Verhalten |
|----------|-----------|
| GET /stats | total + open_refunds + realized_profit_cents (negativ erlaubt) |
| GET / | Alle Reviews, optional year-Filter via COALESCE(received_date, order_date, created_at) |
| GET /:id | Single Review oder 404 |
| POST / | Validiert product_name + purchase_price_cents > 0, setzt status='vorgemerkt' |
| PATCH /:id | PATCHABLE_FIELDS-Whitelist, dynamisches UPDATE + updated_at |
| DELETE /:id | 204 bei Erfolg, 404 wenn nicht gefunden |

Sicherheits-Mitigationen:
- T-05-01: Route NACH verifyToken (Zeile 45 < Zeile 65)
- T-05-02: yearFilter via parametrisierte Query (kein String-Concat)
- T-05-04: Number.isFinite + price>0 Validierung + Math.round vor Insert
- T-05-05: PATCHABLE_FIELDS-Whitelist
- T-05-08: PATCHABLE_FIELDS als Hardcoded-Array (kein User-Input in Template-Substitution)

### app.ts (1 Edit)

Import + `app.use('/api/finance/reviews', reviewsRoutes)` nach verifyToken-Guard auf Zeile 65.

### reviews.test.ts (131 LOC)

Vitest-Suite mit 12 Tests in 3 Suites:

1. `calcProfit` (4 Tests): Pending=0, Realizing=(refund+sale)-purchase, negativ erlaubt, REALIZING_STATUSES-Inhalt
2. `amazon_reviews migration` (4 Tests): DEFAULT vorgemerkt, CHECK invalid status, CHECK price<=0, alle 10 Slugs akzeptiert
3. `reviews stats aggregation` (4 Tests): total count, open_refunds (nur Pending), realized_profit (inkl. negativ), year-Filter COALESCE

## Test-Ergebnis

```
Test Files  15 passed (15)
Tests  136 passed (136)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] setup.ts: Migration 043 ADD COLUMN updated_at crasht in :memory:-Tests**

- **Found during:** Task 3 (npm test zeigte 95/136 Tests fail vor meinen Aenderungen)
- **Issue:** Migration 015 erstellt `app_settings` inkl. `updated_at`-Spalte. Migration 043 fuegt dieselbe Spalte nochmals via `ALTER TABLE ... ADD COLUMN` hinzu. In der realen Produktions-DB fehlte die Spalte (daher war 043 noetig). In :memory:-Test-DBs existiert sie aber, weil alle Migrations sequenziell von 001 bis 046 laufen — SQLite wirft `SqliteError: duplicate column name`. Das war pre-existierend: 12 von 15 Test-Dateien schlugen vor meinen Aenderungen fehl.
- **Fix:** `setup.ts` prueft per Filename ob es Migration 043 ist und entfernt die `ALTER TABLE`-Zeile per Regex — der `UPDATE`-Backfill laeuft weiterhin (schadet nicht). SQLite hat kein `ADD COLUMN IF NOT EXISTS`, daher ist dieser Test-Helper-Schutz der minimalinvasivste Fix.
- **Files modified:** `backend/test/setup.ts`
- **Commit:** b42f2f3

## Known Stubs

Keine. Die API liefert echte Datenbankdaten. Frontend-Anbindung ist Plan 02-04.

## Hinweise fuer Folge-Plans

- **Plan 02:** `frontend/src/lib/profitCalc.ts` muss identisch zu `backend/src/lib/profitCalc.ts` gespiegelt werden (Kommentar-Header ist bereits vorbereitet).
- **Plan 05 Task 1 (Drift-Check):** `diff <(grep -v '^//' backend/src/lib/profitCalc.ts) <(grep -v '^//' frontend/src/lib/profitCalc.ts)` sollte leer sein — Phase-Gate.
- **API-Shape:** Alle Geldfelder sind INTEGER-Cents (kein Float-Drift). Frontend muss durch 100 dividieren fuer EUR-Anzeige.
- **Keine Abweichung vom RESEARCH-Pattern:** `/api/finance/reviews` exakt wie spezifiziert — kein Pfad-Drift.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| backend/src/db/migrations/046_amazon_reviews.sql | FOUND |
| backend/src/lib/profitCalc.ts | FOUND |
| backend/src/routes/reviews.routes.ts | FOUND |
| backend/test/reviews.test.ts | FOUND |
| Commit 5dd9767 (Migration + profitCalc) | FOUND |
| Commit 7c82631 (routes + app.ts) | FOUND |
| Commit b42f2f3 (tests + setup fix) | FOUND |
| npm test: 15 Files, 136 Tests | PASSED |
