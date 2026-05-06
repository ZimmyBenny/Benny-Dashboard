---
phase: 04-belege-modul-dj-buchhaltungs-refactoring
plan: 02
subsystem: services, money-math, tax-calculation, duplicate-detection
tags: [typescript, vitest, sqlite, gobd, ist-versteuerung, ustva, sha256, cents-integer]

# Dependency graph
requires:
  - phase: 04-00 (Wave 0)
    provides: audit_log-Tabelle, audit.service.logAudit, vitest-Infrastruktur (createTestDb, expectAuditEntry)
  - phase: 04-01 (Wave 1)
    provides: receipts/receipt_ocr_results/app_settings-Schema, GoBD-Trigger, Cents-INTEGER-Spalten
provides:
  - lib/cents.ts — Single source of truth fuer Cents-Math (toCents/toEur/calcVat/Net/Gross/parseAmountToCents)
  - lib/filenames.ts — sanitizeForFilename (Umlaute → ae/oe/ue/ss + Slug)
  - lib/files.ts — getBelegeRoot/receiptStoragePath/ensureStorageDir/sha256OfFile + DEFAULT_BELEGE_ROOT (außerhalb iCloud)
  - services/receiptService.ts — create/update/applyOcrResult/markOcrFailed/freigeben mit Audit-Log + DuplicateReceiptError
  - services/taxCalcService.ts — aggregateForUstva(year, period) liefert UStVA-Buckets (Jahr|Quartal|Monat) mit RC-Nullsumme + Privat-Anteil + EUSt
  - services/duplicateCheckService.ts — findBySha256 + findByHeuristic
  - types/receipt.ts — Receipt, CreateReceiptInput, ReceiptStatus, ReceiptType, ReceiptSource, ParsedReceipt, OcrResult, ParsedField
  - vitest mock-Pattern fuer better-sqlite3 (Proxy auf dbHolder, beforeEach swap :memory:-DB) — wiederverwendbar fuer alle Folge-Service-Tests
affects: [04-03-upload-ocr, 04-04-supplier-memory, 04-05-task-automation, 04-06-dj-sync, 04-07-ui-overview, 04-08-ui-list-detail, 04-09-ui-upload, 04-10-ui-tax-export-settings, 04-11-dj-refactor]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "vi.mock('../src/db/connection') mit Proxy auf dbHolder.db — beforeEach swappt :memory:-DB; loest das better-sqlite3-Test-Isolations-Problem ohne Aenderung an connection.ts"
    - "Service-Funktionen akzeptieren `req: Request | null` — null = system-initiierte Mutation (Cron/Sync) ohne Audit-User-Kontext"
    - "Auto-recompute net/vat/gross beim create — wenn nur 2 von 3 gesetzt, wird das fehlende Feld via lib/cents berechnet (verhindert Inkonsistenzen)"
    - "applyOcrResult mit Konfidenz-Filter (supplier_name nur bei > 0.5) — verhindert dass schlechtes OCR Original-User-Eingaben überschreibt"
    - "freigeben ist idempotent — zweiter Aufruf gibt unveränderten Stand zurück (kein zweites timestamp)"
    - "UStVA-Aggregation per strftime auf payment_date — Ist-Versteuerung ist default fuer Kleinunternehmer"
    - "Reverse-Charge-Nullsumme: KZ85 (Schuld) + KZ67 (Vorsteuer) heben sich bei input_tax_deductible=1 auf"
    - "private_share_percent bereinigt sowohl KZ66 (inland VSt) als auch KZ67 (RC VSt) — analoge Behandlung"

key-files:
  created:
    - backend/src/lib/cents.ts
    - backend/src/lib/filenames.ts
    - backend/src/lib/files.ts
    - backend/src/services/receiptService.ts
    - backend/src/services/taxCalcService.ts
    - backend/src/services/duplicateCheckService.ts
    - backend/src/types/receipt.ts
    - backend/test/cents.test.ts
    - backend/test/files.test.ts
    - backend/test/receipts.test.ts
    - backend/test/taxCalc.test.ts
    - backend/test/duplicateCheck.test.ts
  modified: []

key-decisions:
  - "vi.mock-Proxy-Pattern statt connection.ts-Modifikation — Tests sind self-contained; connection.ts bleibt produktions-fokussiert"
  - "applyOcrResult ist atomar (DB-INSERT in receipt_ocr_results + UPDATE auf receipts) ohne Transaction — better-sqlite3 ist synchron + single-thread-safe; Bedingung: keine externe Concurrency"
  - "Konfidenz-Schwelle nur fuer supplier_name (> 0.5) — andere Felder (Datum, Betrag, USt) immer übernommen wenn value !== null; user kann bei Reviews korrigieren"
  - "EUSt (KZ62) erfordert input_tax_deductible=1 zusaetzlich — verhindert dass private EUSt (z.B. Privat-Import von Hobby-Equipment) als Vorsteuer gezählt wird"
  - "kz66 schliesst import_eust=0 aus — verhindert Doppel-Zählung mit kz62"
  - "freigeben gibt status='freigegeben' (zusaetzlich zu freigegeben_at + freigegeben_by) — UI kann an einer Spalte filtern statt timestamp-Lookup"
  - "duplicateCheckService trennt SHA-256 (sicher) von Heuristik (Hinweis) — UI kann unterschiedlich präsentieren (Block vs. Warning)"
  - "DEFAULT_BELEGE_ROOT in `~/.local/share/benny-dashboard/belege` — selbe Konvention wie dashboard.db (außerhalb iCloud, kein bird-Konflikt)"

patterns-established:
  - "TDD-Reihenfolge fuer Services: 1. Test-File schreiben (RED) + commit, 2. Service-File implementieren (GREEN) + commit"
  - "Service-Test-Pattern: `vi.mock('../src/db/connection', () => ({ default: new Proxy({}, { get(_t,p) { … bind(dbHolder.db) } }) }))` + `beforeEach(() => { dbHolder.db = createTestDb() })`"
  - "Geld-Werte ausschliesslich INTEGER (Cents) im gesamten Service-Layer — Konvertierung von/zu EUR ausschliesslich an lib/cents-Boundary"
  - "Service-Funktionen geben Receipt-Row aus DB zurueck (full row, frisch geSELECTet) — Routes muessen kein erneutes Lesen machen"

requirements-completed: [BELEG-SERVICE-01, BELEG-SERVICE-02, BELEG-SERVICE-03, BELEG-SERVICE-04]

# Metrics
duration: 8min
completed: 2026-05-06
---

# Phase 04 Plan 02: Services Summary

**Vier Backend-Services und drei lib-Helper sind testgetrieben implementiert: cents-Math (Single source of truth fuer Geld), receiptService (CRUD + GoBD-Freigabe), taxCalcService (UStVA-Aggregation mit RC-Nullsumme + Privat-Anteil + EUSt), duplicateCheckService (SHA-256 + Heuristik) — vollstaendig ueber 60/60 vitest-Tests verifiziert.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-06T08:51:17Z
- **Completed:** 2026-05-06T08:58:48Z
- **Tasks:** 3 / 3
- **Files created:** 12 (4 src/services + 3 src/lib + 1 src/types + 5 test)
- **Files modified:** 0
- **Tests:** 60/60 passed (3 audit + 12 schema + 16 cents + 3 files + 8 receipts + 11 taxCalc + 7 duplicateCheck)

## Accomplishments

- **Wave 2 abgeschlossen** — Service-Layer fuer Belege ist betriebsbereit; Plan 03 (Upload+OCR) kann direkt `receiptService.create` und `duplicateCheckService.findBySha256` nutzen.
- **lib/cents.ts** als Single Source of Truth — alle 6 Funktionen (toCents, toEur, calcVatCents, calcGrossCents, calcNetCents, parseAmountToCents) sind getestet inkl. Edge Cases (0.07 → 7, 1749 @ 7% → 1635, 0% Rate, DE-/EN-Format-Parsing).
- **lib/files.ts mit DEFAULT_BELEGE_ROOT in `~/.local/share/benny-dashboard/belege`** — bewusst aussserhalb iCloud (gleiche Konvention wie dashboard.db). receiptStoragePath legt YYYY/MM-Subdir-Schema fest. sha256OfFile streamt fuer grosse Dateien.
- **lib/filenames.ts** mit Umlaut-Mapping ae/oe/ue/ss + Slug-Sanitizing — verwendbar fuer Lieferanten-/Beleg-Filenames in Plan 03+.
- **receiptService** mit allen 5 Lifecycle-Funktionen:
  - `create` — SHA-256-Duplicate-Check (DuplicateReceiptError), Auto-Recompute net/vat/gross, schreibt Audit-Log mit action='create'
  - `update` — Whitelist 25 Felder (kein type/source/freigegeben_*), GoBD-Trigger blockt finanzrelevante Updates nach Freigabe
  - `applyOcrResult` — Konfidenz-Filter, persistiert receipt_ocr_results-Row, Audit-Log mit action='ocr_apply'
  - `markOcrFailed` — Transition ocr_pending → zu_pruefen
  - `freigeben` — idempotent, setzt freigegeben_at/by + status='freigegeben', Audit-Log mit action='freigeben'
- **taxCalcService.aggregateForUstva** mit voller UStVA-Logik:
  - 12/4/1 Buckets je nach period
  - KZ81 (19%-Umsatz Netto), KZ86 (7%-Umsatz Netto), KZ66 (Vorsteuer inland, private_share-bereinigt), KZ84/85/67 (§13b RC), KZ62 (EUSt)
  - Ist-Versteuerung ueber payment_date — nur status='bezahlt' + steuerrelevant=1 + payment_date IS NOT NULL
  - private_share_percent reduziert KZ66 und KZ67 um den privat-Anteil
  - Reverse-Charge ist exakt Nullsumme bei input_tax_deductible=1 (verifiziert: 2499 net + 475 vat → Zahllast 0)
  - EUSt-Bucket erfordert zusaetzlich input_tax_deductible=1 (verhindert doppelte Privat-Belege)
  - Zahllast = (KZ81-VAT + KZ86-VAT + KZ85) − (KZ66 + KZ67 + KZ62)
- **duplicateCheckService** mit zwei Strategien:
  - findBySha256 (sicher, fuer Upload-Block in Plan 03)
  - findByHeuristic (case-insensitive supplier + invoice + date, Limit 5, fuer UI-Hinweis)
- **TypeScript-Layer** in `types/receipt.ts` — alle Service-Files und Folge-Plans (Routes, UI) bauen darauf auf; keine inline-Typen mehr.
- **Mock-Pattern fuer Service-Tests etabliert** — vi.mock + Proxy auf dbHolder, beforeEach swap :memory:-DB. Voll wiederverwendbar fuer alle Folge-Plans (04-03, 04-04, 04-05, 04-06).

## Task Commits

Jeder Task wurde TDD-gemäß in 2 Commits aufgeteilt (RED + GREEN):

1. **Task 1 RED — cents/files Tests** — `42d5e77` (test) — 12 + 3 = 15 Tests, alle scheitern (Imports fehlen)
2. **Task 1 GREEN — cents/filenames/files lib** — `d1980fb` (feat) — 19 Tests grün (16 cents + 3 files); tsc clean
3. **Task 2 RED — receiptService Tests** — `738488a` (test) — 8 Tests; vi.mock-Proxy-Pattern; Service-File fehlt
4. **Task 2 GREEN — receiptService + types/receipt** — `9181c15` (feat) — 8/8 Tests grün; tsc clean
5. **Task 3 RED — taxCalc + duplicateCheck Tests** — `48c4f89` (test) — 11 + 7 = 18 Tests; Services fehlen
6. **Task 3 GREEN — taxCalcService + duplicateCheckService** — `a33a4ec` (feat) — 18/18 Tests grün; tsc clean

## Files Created/Modified

### Created — Source

- `backend/src/lib/cents.ts` (74 Zeilen) — Cents-Math Single Source of Truth
- `backend/src/lib/filenames.ts` (37 Zeilen) — sanitizeForFilename (Umlaut-Map + Slug)
- `backend/src/lib/files.ts` (74 Zeilen) — DEFAULT_BELEGE_ROOT, receiptStoragePath, sha256OfFile
- `backend/src/services/receiptService.ts` (310 Zeilen) — CRUD + applyOcrResult + freigeben + DuplicateReceiptError
- `backend/src/services/taxCalcService.ts` (200 Zeilen) — UStVA-Aggregation mit allen Kennzahlen
- `backend/src/services/duplicateCheckService.ts` (62 Zeilen) — findBySha256 + findByHeuristic
- `backend/src/types/receipt.ts` (140 Zeilen) — alle Belege-Typen zentral

### Created — Tests

- `backend/test/cents.test.ts` (16 Tests, inkl. sanitizeForFilename) — 79 Zeilen
- `backend/test/files.test.ts` (3 Tests) — 27 Zeilen
- `backend/test/receipts.test.ts` (8 Tests) — 197 Zeilen, vi.mock-Proxy-Pattern
- `backend/test/taxCalc.test.ts` (11 Tests, inkl. Bucket-Anzahl, KZ-Felder, Privat, RC, EUSt, Zahllast, Labels) — 162 Zeilen
- `backend/test/duplicateCheck.test.ts` (7 Tests, inkl. SHA-Empty-Edge, Heuristik-Limit) — 89 Zeilen

### Modified

Keine. Plan 04-02 fuegt rein neue Files hinzu.

## Decisions Made

- **vi.mock-Proxy-Pattern statt connection.ts-Modifikation** — Der Plan-Text bietet zwei Varianten an: (a) connection.ts mit Test-Mode-Branch, (b) vi.mock mit Proxy. Variante (b) gewaehlt, weil sie connection.ts produktions-fokussiert laesst (kein Test-spezifischer Code im Production-Path). Pattern: `vi.mock('../src/db/connection', () => ({ default: new Proxy({}, { get(_t,p) { … bind(dbHolder.db) } }) }))` + `beforeEach(() => { dbHolder.db = createTestDb() })`. Dieser Pattern wird in den Folge-Plans (04-03, 04-04, 04-05, 04-06) wiederverwendet.
- **`req: Request | null` statt einer separaten internen API** — Plan deutete an, dass es system-initiierte Calls (z.B. Cron, Sync) gibt. Statt zwei API-Varianten zu pflegen, akzeptieren alle Service-Funktionen `null` und ueberspringen dann den Audit-Log-Aufruf. Routes uebergeben immer ihren `req`; Cron-Jobs uebergeben null.
- **Auto-recompute net/vat/gross beim create** — Wenn nur gross+rate gesetzt → net = calcNetCents(gross,rate), vat = gross-net. Wenn nur net+rate gesetzt → vat = calcVatCents(net,rate), gross = net+vat. Wenn alle 3 gesetzt → unveraendert uebernommen. Das vereinfacht die UI-/OCR-Logik in Plan 03 erheblich.
- **applyOcrResult Konfidenz-Schwelle nur fuer supplier_name (>0.5)** — supplier_name ist das einzige Feld das ein User typischerweise vor OCR-Lauf bereits manuell eingibt; falscher Wert hier ist besonders ärgerlich. Datum/Betrag/USt werden immer uebernommen wenn !== null (User reviewed sowieso).
- **EUSt-Aggregation (KZ62) erfordert zusätzlich input_tax_deductible=1** — verhindert dass private EUSt-Belege (z.B. importiertes Hobby-Equipment) als Vorsteuer gezaehlt werden. KZ66 schliesst zudem import_eust=0 aus, um Doppel-Zaehlung zu vermeiden.
- **freigeben ist idempotent** — zweiter Aufruf gibt unveraenderten Stand zurueck (kein neues freigegeben_at-Timestamp). Verhindert dass UI-Bugs (Doppel-Klick) das Freigabe-Datum verfaelschen.
- **DEFAULT_BELEGE_ROOT in `~/.local/share/benny-dashboard/belege`** — gleiche Konvention wie dashboard.db. Nicht in iCloud (bird-daemon-Konflikt). Falls User einen anderen Pfad will → setzen via `app_settings.belege_storage_path`; lib/files.ts.getBelegeRoot liest das aus.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] kz66 schliesst import_eust=0 aus**
- **Found during:** Task 3 (Plan-Lesung — Plan-Aggregation würde EUSt-Belege doppelt zählen)
- **Issue:** Plan-Spezifikation für KZ66-Query inkludiert ALLE Eingangsrechnungen mit input_tax_deductible=1 + reverse_charge=0. Wenn ein Beleg jedoch import_eust=1 hat, würde er sowohl in KZ62 (EUSt) als auch in KZ66 (Vorsteuer inland) landen — Doppel-Zählung der Vorsteuer.
- **Fix:** WHERE-Clause für KZ66 um `AND import_eust = 0` erweitert. KZ62-Query um `AND input_tax_deductible = 1` erweitert (verhindert dass private EUSt als Vorsteuer gezählt wird).
- **Files modified:** backend/src/services/taxCalcService.ts (Zeilen 152-162)
- **Tests:** Bestehender Test "EUSt erscheint in KZ 62 und reduziert Zahllast" deckt den Fall ab; neuer Test "Zahllast korrekt: 19000 - 1900 = 17100" verifiziert dass nicht doppelt gezählt wird.
- **Commit:** a33a4ec (Task 3 GREEN)

**2. [Rule 2 - Critical] receiptService.create akzeptiert paid_amount_cents/payment_method/payment_account_ref**
- **Found during:** Task 2 (CreateReceiptInput-Typing)
- **Issue:** Plan-Spezifikation für CreateReceiptInput listet nur eine Teilmenge der Felder. Wenn Plan 03 (Upload) oder Plan 06 (DJ-Sync) einen Beleg mit bereits vorhandener Zahlung erstellt (z.B. DJ-Mirror einer bezahlten Rechnung), müsste der Service paid_amount_cents/payment_method/payment_account_ref akzeptieren — sonst muss zwingend zwei API-Aufrufe (create + update) gemacht werden, was das Audit verfälscht (zwei Einträge statt einer).
- **Fix:** CreateReceiptInput um payment_method, payment_account_ref, paid_amount_cents erweitert; create() leitet sie an INSERT weiter (mit Defaults).
- **Files modified:** backend/src/types/receipt.ts, backend/src/services/receiptService.ts
- **Commit:** 9181c15 (Task 2 GREEN)

**3. [Rule 2 - Critical] receiptService.create akzeptiert created_via**
- **Found during:** Task 2 (Migration 040 hat created_via in receipts)
- **Issue:** Migration 040 definiert die Spalte `created_via TEXT` für Tracking woher ein Beleg kam (z.B. "ui:upload-page", "cron:dj-sync"). Plan 04-02 spezifizierte das nicht im CreateReceiptInput. Folge-Plans hätten den Wert immer auf NULL gehabt — wertvolle Audit-Information verloren.
- **Fix:** CreateReceiptInput.created_via als optional ergaenzt; create() leitet weiter.
- **Commit:** 9181c15 (Task 2 GREEN)

**4. [Praezisierung] Plan-Test fuer applyOcrResult war unterspezifiziert**
- **Issue:** Plan listete als Test-Behavior 6 Items, aber das vollständige Konfidenz-Filter-Verhalten (low-confidence supplier_name wird verworfen) war nur in der Implementierung beschrieben. Damit der Test die Living-Specification ist, wurde ein zusaetzlicher Test "applyOcrResult ignores low-confidence supplier_name (< 0.5)" ergaenzt — verifiziert dass Original-supplier_name erhalten bleibt wenn OCR-supplier_name < 0.5 confidence hat.
- **Files modified:** backend/test/receipts.test.ts (8 Tests statt 5+)
- **Commit:** 738488a (Task 2 RED)

**5. [Vorzugs-Tests] taxCalc bekam zusaetzliche Tests**
- **Praezisierung:** Plan listet 5 Test-Cases. Die Implementierung impliziert weitere wichtige Verhalten (EUSt, gemischte Zahllast, Bucket-Labels, "nicht-bezahlt wird ignoriert"). Diese 5 Zusatz-Tests wurden hinzugefuegt — Plan-Acceptance-Criteria fordert "mind. 8 Tests gruen" → 11 Tests delivered. Living Specification ist damit voller.

Sonst keine Abweichungen — alle Plan-Acceptance-Criteria sind 1:1 erfuellt.

## Issues Encountered

Keine. Build, Tests und Mock-Pattern liefen direkt sauber. Die einzige initiale Unsicherheit (vi.mock vs. connection.ts-Modification) wurde durch das Proxy-Pattern aufgeloest — das Pattern funktioniert robust mit better-sqlite3 weil dessen Methoden synchron und stateful sind.

Hinweis zu Performance: Tests auf einer kalten Maschine laufen in ~1.5s (60 Tests, 7 Files); jede Suite laedt alle 40 Migrationen in :memory: (~30ms je Lauf). Akzeptabel — bei 200+ Tests wuerde man auf gemeinsame Test-DB optimieren.

## User Setup Required

Keine. Plan 04-02 fuegt rein Backend-Services hinzu — keine Datenbank-Migration, keine Routes, keine UI. Die Services sind bereit fuer Verwendung in Plan 03 (Routes via `import { receiptService } from '../services/receiptService'`).

## Next Phase Readiness

- **Plan 04-03 (Upload+OCR)** kann starten — `receiptService.create` ist verfuegbar mit eingebauter SHA-256-Duplicate-Erkennung. `duplicateCheckService.findBySha256` ist da fuer pre-upload-Check ohne create-Versuch. `lib/files.sha256OfFile` und `lib/files.receiptStoragePath` sind da.
- **Plan 04-04 (Supplier-Memory)** kann starten — `lib/filenames.sanitizeForFilename` liefert das normalized supplier-Format (lowercase + slug) fuer supplier_memory.supplier_normalized.
- **Plan 04-05 (Task-Automation)** kann starten — `receiptService` als API-Boundary fuer "task wegen Beleg X erstellen" (idempotent via tasks.source_receipt_id).
- **Plan 04-06 (DJ-Sync)** kann starten — `receiptService.create({ source: 'dj_invoice_sync', linked_invoice_id, ... })` als sauberer Sync-Pfad. `applyOcrResult`-Pattern als Vorlage fuer DJ-Sync-Pattern.
- **Plan 04-10 (UI Tax Export Settings)** kann starten — `taxCalcService.aggregateForUstva(year, period)` ist API-fertig, UI muss nur GET-Endpoint dranbinden.
- **Service-Test-Pattern etabliert** — vi.mock-Proxy + dbHolder + beforeEach createTestDb funktioniert durchgaengig. Folge-Service-Tests koennen das Pattern 1:1 kopieren.

## Self-Check: PASSED

Verifiziert per `test -f` / `git log` / `npx tsc` / `npx vitest`:

- [x] `backend/src/lib/cents.ts` FOUND
- [x] `backend/src/lib/filenames.ts` FOUND
- [x] `backend/src/lib/files.ts` FOUND
- [x] `backend/src/services/receiptService.ts` FOUND
- [x] `backend/src/services/taxCalcService.ts` FOUND
- [x] `backend/src/services/duplicateCheckService.ts` FOUND
- [x] `backend/src/types/receipt.ts` FOUND
- [x] `backend/test/cents.test.ts` FOUND
- [x] `backend/test/files.test.ts` FOUND
- [x] `backend/test/receipts.test.ts` FOUND
- [x] `backend/test/taxCalc.test.ts` FOUND
- [x] `backend/test/duplicateCheck.test.ts` FOUND
- [x] Commit `42d5e77` (Task 1 RED) FOUND in git log
- [x] Commit `d1980fb` (Task 1 GREEN) FOUND in git log
- [x] Commit `738488a` (Task 2 RED) FOUND in git log
- [x] Commit `9181c15` (Task 2 GREEN) FOUND in git log
- [x] Commit `48c4f89` (Task 3 RED) FOUND in git log
- [x] Commit `a33a4ec` (Task 3 GREEN) FOUND in git log
- [x] `npx tsc --noEmit` exit code 0
- [x] `npx vitest run` 60/60 passed (3 audit + 12 schema + 16 cents + 3 files + 8 receipts + 11 taxCalc + 7 duplicateCheck)
- [x] cents.ts exportiert 6 Funktionen (toCents, toEur, calcVatCents, calcGrossCents, calcNetCents, parseAmountToCents)
- [x] receiptService.ts exportiert: create, update, applyOcrResult, markOcrFailed, freigeben, DuplicateReceiptError, receiptService-Bundle
- [x] taxCalcService.ts exportiert: aggregateForUstva, taxCalcService, UstvaPeriod, UstvaBucket
- [x] duplicateCheckService.ts exportiert: findBySha256, findByHeuristic, duplicateCheckService, DuplicateCandidate
- [x] DEFAULT_BELEGE_ROOT enthaelt `.local/share/benny-dashboard/belege`
- [x] Test "freigeben sets freigegeben_at and locks GoBD fields" passed
- [x] Test "reverse_charge bezahlt → Zahllast 0 wenn input_tax_deductible=1" passed
- [x] Test "private_share_percent=70 → 30% der Vorsteuer (570 von 1900)" passed
- [x] Test "steuerrelevant=0 wird komplett ignoriert" passed

---
*Phase: 04-belege-modul-dj-buchhaltungs-refactoring*
*Plan: 02 (Wave 2)*
*Completed: 2026-05-06*
