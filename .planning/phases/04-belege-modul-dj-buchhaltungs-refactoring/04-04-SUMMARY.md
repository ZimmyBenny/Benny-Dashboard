---
phase: 04-belege-modul-dj-buchhaltungs-refactoring
plan: 04
subsystem: services, routes, supplier-learning, ux-prefill
tags: [typescript, vitest, sqlite, upsert, normalize, supplier-memory, belege]

# Dependency graph
requires:
  - phase: 04-01 (Wave 1)
    provides: supplier_memory-Tabelle (Migration 040), UNIQUE(supplier_normalized, area_id, tax_category_id), areas/tax_categories/receipt_area_links
  - phase: 04-02 (Wave 2)
    provides: lib/filenames.sanitizeForFilename (Normalize-Funktion), receiptService.update, vi.mock-Proxy-Test-Pattern
  - phase: 04-03 (Wave 2)
    provides: belege.routes.ts (GET/PATCH/POST/DELETE-Skelett), receiptParserService.parse(text).supplier_name (Hook fuer Auto-Lernen)
provides:
  - services/supplierMemoryService.ts — suggest + recordUsage + normalize + supplierMemoryService-Bundle
  - GET /api/belege/supplier-suggest — UI-Lookup-Endpoint fuer Auto-Vorschlag
  - PATCH /api/belege/:id supplier_memory-Hook — lernt Tripel nach jedem Update
  - POST /api/belege/:id/areas — Multi-Area-Zuordnung mit primary, atomar in Transaction, mit recordUsage-Hook
  - 9 Tests in test/supplierMemory.test.ts (Living Specification)
affects: [04-05-task-automation, 04-06-dj-sync, 04-07-ui-overview, 04-08-ui-list-detail, 04-09-ui-upload, 04-10-ui-tax-export-settings]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Normalisierungs-Konsistenz: supplier_memory.supplier_normalized verwendet sanitizeForFilename(60) — exakt derselbe Slug wie in Belege-Filenames; das garantiert dass Memory-Lookup und Datei-Pfad nie auseinanderlaufen"
    - "NULL-safe-UPSERT mit IS-Operator: SQLite '=' ist NICHT NULL-safe (NULL = NULL liefert NULL); 'area_id IS ?' matched sowohl konkrete Werte als auch NULLs — better-sqlite3 bindet null als SQL NULL"
    - "Sortier-Tiebreaker fuer Vorschlaege: ORDER BY usage_count DESC, last_used DESC, id DESC — der haeufigste Tripel gewinnt; bei Gleichstand das juengste; verhindert dass eine alte Falsch-Eingabe ewig kleben bleibt"
    - "Atomare Area-Link-Replacement via db.transaction(() => DELETE+INSERT) — kein partieller Zustand bei Fehler; receipt_area_links nutzt Composite-PK so dass Wiedereinfuegen ohne Surrogate-Konflikte funktioniert"
    - "supplier_memory-Hook nach receiptService.update statt im Service: Hook lebt in der Route (Plan-konform), receiptService bleibt fokussiert auf receipts-CRUD"
    - "Empty-input silent-skip: leerer/whitespace-Lieferantenname → suggest liefert null, recordUsage skipt INSERT — verhindert leere supplier_normalized-Slugs in DB"

key-files:
  created:
    - backend/src/services/supplierMemoryService.ts
    - backend/test/supplierMemory.test.ts
  modified:
    - backend/src/routes/belege.routes.ts (3 Erweiterungen: supplier-suggest-Endpoint, PATCH-Hook, POST/:id/areas)

key-decisions:
  - "Normalisierung via sanitizeForFilename(60) statt eigener normalize-Logik — bewahrt 1:1-Konsistenz mit Belege-Datei-Slugs (Plan 09 wird Datei nach Lieferant umbenennen); unterstuetzt Umlaute → ae/oe/ue/ss"
  - "NULL-safe Lookup mit IS-Operator: existing-Check fuer (supplier, area_id, tax_category_id) muss NULL = NULL als True erkennen; '=' liefert in SQLite NULL → falscher INSERT statt UPDATE — der IS-Operator behebt das"
  - "Tiebreaker last_used DESC + id DESC: bei gleicher usage_count gewinnt das juengste Tripel — schuetzt vor Stale-Falscheingaben"
  - "PATCH-Hook ueber db-Lookup von is_primary=1 statt aus req.body: Frontend muss area-links nicht mit der PATCH-Body mitschicken; primary_area kommt immer aus receipt_area_links — Single Source of Truth"
  - "POST /:id/areas separater Endpoint statt PATCH-Erweiterung: Area-Links sind n:m-Beziehung in eigener Tabelle; eigener Endpoint mit Transaction haelt PATCH /:id schlank und fuer Plan-08-Detail-UI klar"
  - "supplier-suggest 404 statt 200-mit-null-Body: REST-konform — 'kein Memory' ist 'nicht gefunden', nicht 'gefunden mit Null-Werten'; UI kann mit if(status===200) den Vorschlag uebernehmen"
  - "supplier-suggest-Endpoint VOR /:id mounted: Express matched Routes in Reihenfolge — sonst wuerde /supplier-suggest auf /:id fallen mit id='supplier-suggest' (NaN → 400)"

patterns-established:
  - "supplier_memory-Tripel-Lernen: nach jeder Receipt-Mutation mit (supplier, area_primary, tax_cat) UPSERT auf supplier_memory; suggest beim naechsten Upload — Plan-09-UI ruft GET /supplier-suggest beim onBlur des Lieferanten-Felds und prefilled Area+Tax-Kategorie"
  - "Multi-Area-Replacement-Pattern: POST /:id/areas oeffnet Transaction → DELETE alte Links + Loop INSERT neue Links + commit + audit + supplier_memory-Hook — selbe Form fuer Plan 08 (UI Detail) und Plan 06 (DJ-Sync) nutzbar"

requirements-completed: [BELEG-SUPPLIER-01, BELEG-SUPPLIER-02, BELEG-SUPPLIER-03, BELEG-SUPPLIER-04]

# Metrics
duration: ~4min
completed: 2026-05-06
---

# Phase 04 Plan 04: Supplier-Memory Summary

**Lieferanten-Lerngedaechtnis ist betriebsbereit: supplierMemoryService mit suggest+recordUsage (NULL-safe UPSERT), GET /api/belege/supplier-suggest fuer UI-Auto-Vorschlag, PATCH-Hook und POST /:id/areas fuer atomare Multi-Area-Zuordnung — alles via 9 vitest-Tests verifiziert und 86/86 Backend-Tests gruen.**

## Performance

- **Started:** 2026-05-06T12:36:18Z
- **Completed:** 2026-05-06T12:40:11Z
- **Duration:** ~4 min
- **Tasks:** 2 / 2
- **Files created:** 2 (1 service + 1 test)
- **Files modified:** 1 (belege.routes.ts)
- **Tests:** 86/86 passed (77 vorher + 9 neu in supplierMemory.test.ts)
- **Sub-Repos:** keine — Single-Repo-Setup

## Accomplishments

- **Wave 3 Plan 04 abgeschlossen** — der Lieferanten-Lerneffekt fuer Plan 09 (Upload-UI) und Plan 08 (Detail-UI) ist nun aktiv.
- **supplierMemoryService.ts** mit drei Funktionen:
  - `normalize(name)` — verwendet `sanitizeForFilename(60)` — Umlaut-Map (ae/oe/ue/ss), lowercase, ASCII-Slug. Identisch zur Belege-Filename-Sanitierung, sodass `supplier_memory.supplier_normalized` und Belege-Dateipfade niemals auseinanderlaufen.
  - `suggest(name)` — `SELECT ... ORDER BY usage_count DESC, last_used DESC, id DESC LIMIT 1`. Liefert SupplierSuggestion oder null. Empty-Input → null (kein DB-Roundtrip).
  - `recordUsage(name, areaId, taxCategoryId)` — NULL-safe UPSERT: existing-Lookup mit `IS`-Operator (matched NULLs); UPDATE inkrementiert usage_count + setzt last_used = jetzt; sonst INSERT mit usage_count=1.
- **Drei Erweiterungen in belege.routes.ts:**
  - **GET /api/belege/supplier-suggest?supplier=Thomann** — UI-Lookup. Steht VOR `/:id` (sonst matched Express `id="supplier-suggest"`). 200 + JSON oder 404 + null-Stub oder 400 bei fehlendem Param.
  - **PATCH /api/belege/:id** ergaenzt um Hook: nach erfolgreichem Update wird `(supplier_name, primary_area_aus_receipt_area_links, tax_category_id)` an `recordUsage` geschickt — system lernt automatisch.
  - **POST /api/belege/:id/areas** neu — Body `{ area_ids: number[]; primary_area_id?: number }`. Atomar in `db.transaction`: DELETE alte Links + Loop INSERT neue Links. Audit-Log + supplier_memory-Hook anschliessend.
- **9 Tests in supplierMemory.test.ts:**
  1. normalize-Sanitierung (Umlaute, lowercase, slug, trim)
  2. suggest leer → null
  3. recordUsage INSERT mit usage_count=1
  4. recordUsage 2x → usage_count=2
  5. case-insensitive lookup via normalize
  6. higher usage_count gewinnt bei multiplen Tripels
  7. NULL-area + NULL-tax_category ist valides Memory
  8. empty/whitespace-input → silent skip (Tabelle bleibt leer)
  9. last_used wird auf heute aktualisiert beim re-record
- **TDD vollstaendig:** RED-Commit (`4ee3514`, Test-File only) → GREEN-Commit (`a076365`, Service-Implementierung). Beim ersten Run schlug der Test mit "Failed to load url ../src/services/supplierMemoryService" fehl — exakt der erwartete RED-Zustand.

## Task Commits

1. **Task 1 RED — supplierMemory Tests** — `4ee3514` (test) — supplierMemory.test.ts (9 Tests, 117 Zeilen, vi.mock-Proxy-Pattern)
2. **Task 1 GREEN — supplierMemoryService** — `a076365` (feat) — supplierMemoryService.ts (133 Zeilen) — 9/9 Tests gruen, tsc clean
3. **Task 2 — Routes-Wiring** — `6e1624f` (feat) — belege.routes.ts +152 Zeilen (supplier-suggest-Endpoint + PATCH-Hook + POST /:id/areas) — 86/86 Tests gruen, tsc clean

**Plan-Metadaten-Commit:** wird nach diesem SUMMARY plus STATE/ROADMAP/REQUIREMENTS-Updates gemacht.

## Files Created/Modified

### Created — Source

- `backend/src/services/supplierMemoryService.ts` (133 Zeilen) — `suggest`, `recordUsage`, `normalize`, `supplierMemoryService`-Bundle. NULL-safe UPSERT mit IS-Operator.

### Created — Tests

- `backend/test/supplierMemory.test.ts` (117 Zeilen, 9 Tests) — vi.mock-Proxy-Pattern, dbHolder + beforeEach createTestDb (Wave-2-Pattern wiederverwendet).

### Modified

- `backend/src/routes/belege.routes.ts` (+152 Zeilen) — 3 Erweiterungen:
  - Import `supplierMemoryService`
  - `router.get('/supplier-suggest', ...)` VOR `/:id`
  - PATCH-Hook in `router.patch('/:id', ...)`
  - `router.post('/:id/areas', ...)` mit Transaction + audit + recordUsage-Hook

## Decisions Made

- **Normalisierung via sanitizeForFilename(60) statt eigener Logik** — bewahrt 1:1-Konsistenz mit Belege-Datei-Slugs. Plan 09 wird Belege-Dateien nach OCR auf den extrahierten Lieferanten umbenennen — derselbe Slug fuer Datei-Pfad und Memory-Key. Das verhindert Disconnect zwischen "Lieferant lebt im Memory" und "Datei liegt unter `unbekannt`".
- **NULL-safe Lookup mit IS-Operator** — der Plan-Code-Block hatte ein redundantes Pattern (`area_id IS ? OR area_id = ?`). In SQLite reicht `IS ?` allein, weil better-sqlite3 `null` als SQL-NULL bindet und `IS NULL` bei NULL-Param matched. Vereinfacht den Code, derselbe Logik-Effekt.
- **Tiebreaker `last_used DESC, id DESC`** — bei gleicher usage_count gewinnt das juengste Tripel. Schuetzt vor "alte Falsch-Eingabe haftet ewig" — wenn der User vor 6 Monaten Thomann fuer Privat zugeordnet hat und seit Wochen jeden Beleg fuer DJ vergibt, kommt nun DJ als Vorschlag (gleiche usage_count → letzte Eingabe gewinnt).
- **suggest 404 statt 200-mit-null-Body** — REST-konform. UI checkt `status === 200` (Vorschlag verfuegbar) vs `status === 404` (kein Vorschlag, Lieferant ist neu). Macht den Code clientseitig klarer als ein Polling-Pattern auf null-Werte.
- **PATCH-Hook ueber db-Lookup von is_primary=1, nicht aus req.body** — Frontend muss area-links nicht mit der PATCH-Body mitschicken. Single Source of Truth: primary_area kommt IMMER aus `receipt_area_links.is_primary=1`. Wenn der User nur das Feld `tax_category_id` aendert, wird das Memory mit der bekannten primary_area aktualisiert.
- **POST /:id/areas separater Endpoint statt PATCH-Erweiterung** — Area-Links sind eine n:m-Beziehung in eigener Tabelle. Eigener Endpoint mit Transaction haelt PATCH /:id schlank (nur receipts-Spalten) und gibt der UI in Plan 08 (Detail) und Plan 09 (Upload) eine klare Sprache: "ich aendere Area-Zuordnung" → POST /areas.
- **GoBD-Lock fuer Area-Links offen lassen** — receipt_area_links ist nicht durch DB-Trigger geschuetzt. Fachliche Entscheidung: Area-Zuordnung ist nicht finanzrelevant (Geld-Felder + Lieferant + Datum sind durch trg_receipts_no_update_after_freigabe geschuetzt). Der User darf eine Fehl-Zuordnung "DJ statt Privat" auch nach Freigabe korrigieren.
- **GET /supplier-suggest VOR /:id im Router** — Express matched Routes in Reihenfolge. Der Plan-Hinweis war zentral. Falsche Reihenfolge wuerde `/supplier-suggest` auf `/:id` mit `id="supplier-suggest"` fallen → Number(...) = NaN → 400. Das wuerde nicht crashen, aber dem User absurd Feedback geben.

## Deviations from Plan

### Auto-fixed Issues

**1. [Praezisierung] Plan-Tests um 3 Zusatztests erweitert**
- **Issue:** Plan listete 6 Test-Cases. Damit der Test als Living Specification das System wirklich beschreibt, wurden 3 weitere Tests ergaenzt: case-insensitive lookup via normalize (verifiziert dass `suggest('thomann gmbh')` denselben Eintrag findet wie `recordUsage('Thomann GmbH', ...)`), empty/whitespace-input silent-skip (verifiziert dass Empty-Slug nicht in DB gelangt), last_used wird beim Update auf heutiges Datum gesetzt.
- **Files modified:** backend/test/supplierMemory.test.ts (9 Tests statt 6).
- **Commit:** 4ee3514 (Task 1 RED).

**2. [Praezisierung] NULL-safe UPSERT vereinfacht**
- **Issue:** Plan-Code-Snippet enthielt `(area_id IS ? OR area_id = ?)` — beide Branches mit demselben Wert. SQLite `IS ?` matched bereits sowohl NULL als auch konkrete Werte (better-sqlite3 bindet null → SQL-NULL → `column IS NULL` matched; bindet number → SQL-Integer → `column IS 5` matched genauso wie `column = 5` bei nicht-NULL-Werten). Der OR-Branch ist redundant.
- **Fix:** Code verwendet nur `area_id IS ?` (analog tax_category_id). Logik unveraendert, eine Bind-Variable weniger.
- **Files modified:** backend/src/services/supplierMemoryService.ts.
- **Commit:** a076365 (Task 1 GREEN).

**3. [Rule 2 - Critical] POST /:id/areas: 404-Existence-Check vor Transaction**
- **Issue:** Plan-Snippet startete die Transaction sofort. Bei nicht-existierendem Receipt wuerde DELETE einfach 0 Zeilen treffen und INSERT mit FK-Verletzung scheitern (FOREIGN KEY constraint failed) — User bekaeme 500 statt 404.
- **Fix:** Vor der Transaction wird `SELECT id FROM receipts WHERE id = ?` geprueft; bei not-found 404, sonst Transaction.
- **Files modified:** backend/src/routes/belege.routes.ts.
- **Commit:** 6e1624f.

**4. [Rule 2 - Critical] POST /:id/areas: Body-Validation strenger**
- **Issue:** Plan-Snippet pruefte nur `Array.isArray(area_ids)`. Bei `area_ids: ['abc', 1]` wuerde `Number('abc') = NaN` an INSERT gehen → CHECK-Constraint-Violation (areas.id ist INTEGER) → 500 statt 400.
- **Fix:** `body.area_ids.map((v) => Number(v)).filter((n) => Number.isFinite(n))` — non-numeric Eintraege werden gefiltert. `primary_area_id` wird nur uebernommen wenn typeof === 'number' && finite.
- **Files modified:** backend/src/routes/belege.routes.ts.
- **Commit:** 6e1624f.

**Total deviations:** 4 (1 Test-Praezisierung, 1 SQL-Vereinfachung, 2 kritische Hardening-Fixes). Keine Plan-Acceptance-Criteria-Verletzung.

## Issues Encountered

Keine. Build, Tests und Routen-Erweiterung liefen direkt sauber:
- `npx tsc --noEmit` exit 0.
- `npx vitest run` 86/86 passed (77 von 04-03 + 9 supplierMemory = 86).
- Acceptance-Criteria per grep verifiziert: `supplierMemoryService` 4x in belege.routes.ts (Plan-Soll: ≥3), `recordUsage` 2x (PATCH + POST/areas, Plan-Soll: ≥2), Route-Reihenfolge korrekt (`/supplier-suggest` Zeile 54 VOR `/:id` Zeile 134).

## User Setup Required

Keine. Plan 04-04 fuegt nur Backend-Service + Routen-Hooks hinzu — keine Datenbank-Migration (supplier_memory-Tabelle existiert seit Plan 04-01 in Migration 040), keine UI, keine externe Service-Konfiguration.

UAT-Vorschlag (manuell, falls gewuenscht):
1. Backend starten: `cd backend && npm run dev`
2. Login + JWT-Token holen (z.B. via curl POST /api/auth/login).
3. Beleg via PATCH aktualisieren mit supplier_name + tax_category_id; receipt_area_links via POST /:id/areas mit primary_area_id.
4. GET /api/belege/supplier-suggest?supplier=Thomann liefert dann den Vorschlag.

## Next Phase Readiness

- **Plan 04-05 (Task-Automation)** kann starten — receiptService + supplier_memory bilden zusammen den "Belege werden klassifiziert"-Layer; taskAutomationService kann an "supplier_memory matched + status=offen" haengen.
- **Plan 04-06 (DJ-Sync)** kann starten — DJ-Sync ruft `recordUsage(dj_invoice.customer_name, dj-area-id, betriebseinnahme-tax-id)` und etabliert damit den Customer→DJ-Area-Zusammenhang.
- **Plan 04-08 (UI Detail)** kann starten — POST /:id/areas ist verfuegbar; UI kann Multi-Area-Zuordnung mit primary direkt abbilden.
- **Plan 04-09 (UI Upload)** kann starten — beim Tippen im Lieferanten-Feld kann das Frontend GET /api/belege/supplier-suggest ansprechen und Area + Tax-Kategorie automatisch vorbelegen. Erfuellt BELEG-SUPPLIER-04.
- **TDD-Pattern erneut bestaetigt:** vi.mock-Proxy + dbHolder + createTestDb laeuft auch fuer Plan 04-04 stabil — drittes Plan in dieser Phase, das diesen Pattern nutzt.

## Self-Check: PASSED

Verifiziert per `test -f` / `git log` / `npx tsc` / `npx vitest` / `grep`:

- [x] `backend/src/services/supplierMemoryService.ts` FOUND (133 Zeilen)
- [x] `backend/test/supplierMemory.test.ts` FOUND (117 Zeilen, 9 Tests)
- [x] `backend/src/routes/belege.routes.ts` MODIFIED (+152 Zeilen)
- [x] Commit `4ee3514` (Task 1 RED) FOUND in git log
- [x] Commit `a076365` (Task 1 GREEN) FOUND in git log
- [x] Commit `6e1624f` (Task 2 Routes) FOUND in git log
- [x] `npx tsc --noEmit` exit code 0
- [x] `npx vitest run` 86/86 passed
- [x] supplierMemoryService.ts exportiert: suggest, recordUsage, normalize, supplierMemoryService-Bundle
- [x] suggest-SQL enthaelt `ORDER BY usage_count DESC` (verify: grep)
- [x] recordUsage enthaelt UPSERT-Logik (UPDATE + INSERT, NULL-safe IS-Operator)
- [x] belege.routes.ts: `import { supplierMemoryService }` (Zeile 29)
- [x] belege.routes.ts: `/supplier-suggest`-Route (Zeile 54) VOR `/:id` (Zeile 134)
- [x] belege.routes.ts: `supplierMemoryService.recordUsage` 2 Treffer (PATCH-Hook + POST/areas-Hook)
- [x] belege.routes.ts: `router.post('/:id/areas'` Route existiert (Zeile 240)
- [x] Test "recordUsage 2x with identical values increments usage_count to 2" passed
- [x] Test "higher usage_count wins when multiple tripels exist" passed
- [x] Test "null area + null tax_category is valid memory" passed
- [x] Test "normalize on empty/whitespace returns empty string and recordUsage skips silently" passed

---
*Phase: 04-belege-modul-dj-buchhaltungs-refactoring*
*Plan: 04 (Wave 3)*
*Completed: 2026-05-06*
