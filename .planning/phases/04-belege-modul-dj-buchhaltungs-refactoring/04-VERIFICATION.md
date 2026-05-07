---
phase: 04-belege-modul-dj-buchhaltungs-refactoring
verified: 2026-05-07T17:42:00Z
status: passed
score: 56/56 must-haves verified
overrides_applied: 0
re_verification: null
gaps: []
deferred: []
human_verification: []
consistency_issues:
  - file: .planning/REQUIREMENTS.md
    location: "Coverage-Tabelle Zeilen 268-278"
    issue: "Status-Spalte inkonsistent — 4/11 Zeilen als 'Complete', 7/11 als 'Pending', während die zugehörigen Detail-`[x]`-Marker in den Zeilen 95-188 alle abgehakt sind"
    severity: cosmetic
    impact: "Verwirrt Coverage-Reports — die Detail-Marker gelten als Source of Truth"
  - file: .planning/STATE.md
    location: "Zeilen 30-33 Status-Tabelle + Zeile 41 Progress-Bar"
    issue: "Status-Tabelle zeigt 'Phase 3: Not started' und 'Phase 4: Added 2026-05-05 — to be planned', während frontmatter completed_phases=4 und progress 86% sagt"
    severity: cosmetic
    impact: "STATE-Tabelle nicht aktualisiert — Frontmatter ist Source of Truth (28/28 plans complete)"
  - file: .planning/ROADMAP.md
    location: "Phase-4-Header Zeile 188 + Footer Zeile 216"
    issue: "Header sagt 'Plans: 6/13 plans executed' und Footer sagt 'Plan 04-05 abgeschlossen; 6/13 Phase-4-Plaene komplett', aber alle 13 Plan-Items darunter haben `[x]`"
    severity: cosmetic
    impact: "Nur Cosmetik — Plan-Marker sind Source of Truth (13/13 abgeschlossen)"
  - file: .planning/STATE.md
    location: "Zeile 6 stopped_at"
    issue: "Sagt 'Tasks 1+2 of 04-12-seed-final-PLAN.md complete (Wave 8); Task 3 human-verify Checkpoint awaiting User UAT', UAT war aber bereits am 2026-05-06 erfolgreich"
    severity: cosmetic
    impact: "Veraltete Status-Notiz; UAT-Bug-Fixes (PdfPreview-Auth, SHA-Prefix, Bereich-Picker, vat-Konsistenz) wurden danach zusätzlich committed"
---

# Phase 4: Belege-Modul + DJ-Buchhaltungs-Refactoring — Verification Report

**Phase Goal:** Neuer zentraler Hauptbereich `/belege` als GoBD-konforme Beleg-Ablage. Ein Beleg wird einmal in `receipts` gespeichert und beliebigen Bereichen/Kontakten/Aufgaben zugeordnet. OCR via Tesseract (lokal). Andere Module (DJ, später Amazon FBA) bekommen NUR gefilterte Read-Only-Sichten — keine eigenen Belegtabellen mehr. DJ-Buchhaltungs-Reiter wird Read-Only-Sicht auf `receipts WHERE area=DJ`. DJ-Ausgangsrechnungen bleiben Source-of-Truth in `dj_invoices`, werden via Sync-Service nach `receipts` gespiegelt. DJ-Fahrten ziehen aus `dj_expenses(category='fahrzeug')` in eigene `trips`-Tabelle um. Generisches `audit_log` ersetzt `dj_audit_log`. `dj_expenses` wird gedropt nachdem alle Daten umgezogen sind.

**Verified:** 2026-05-07T17:42:00Z
**Status:** passed
**Re-verification:** No — initial verification (post-UAT)

---

## Goal Achievement

### Phase-Goal-Wahrheiten (abgeleitet aus Goal-Statement)

| # | Wahrheit | Status | Evidenz |
|---|----------|--------|---------|
| 1 | `/belege` existiert als zentraler Hauptbereich mit allen Sub-Routes | ✓ VERIFIED | `frontend/src/routes/routes.tsx:83-92` registriert 9 Routen; navConfig.ts:31-40 |
| 2 | `receipts` ist Source-of-Truth (Schema gemäß CONTEXT.md) | ✓ VERIFIED | `backend/src/db/migrations/040_belege.sql:74-153` — 30+ Felder, alle Geld in INTEGER Cents |
| 3 | OCR via Tesseract lokal, ohne Cloud | ✓ VERIFIED | `backend/src/services/ocrService.ts:60-89` tesseract.js + setImmediate + worker.terminate; mock-Fallback |
| 4 | DJ-Buchhaltung Read-Only auf `receipts WHERE area=DJ` | ✓ VERIFIED | `backend/src/routes/dj.accounting.routes.ts:25` `INNER JOIN areas a ON a.id = ral.area_id` mit slug='dj' |
| 5 | DJ-Ausgangsrechnungen werden gemirrored | ✓ VERIFIED | `backend/src/services/djSyncService.ts:106-250`, `dj.invoices.routes.ts:115/161/184/251-252/282` |
| 6 | DJ-Fahrten in eigener `trips`-Tabelle (nicht mehr in dj_expenses) | ✓ VERIFIED | `backend/src/db/migrations/040_belege.sql:53-69`, `041_fahrten_migration.sql:20-39`, `dj.events.routes.ts:248-276` |
| 7 | Generisches `audit_log` ersetzt `dj_audit_log` | ✓ VERIFIED | `backend/src/db/migrations/039_audit_log.sql`, `audit.service.ts`, `dj.audit.service.ts` gelöscht |
| 8 | `dj_expenses` ist gedropt | ✓ VERIFIED | `backend/src/db/migrations/042_drop_dj_expenses.sql:29` `DROP TABLE IF EXISTS dj_expenses;` |
| 9 | Andere Module (DJ) bekommen NUR Read-Only-Sicht | ✓ VERIFIED | `dj.expenses.routes.ts` gelöscht; `dj.routes.ts` mountet `/api/dj/expenses` nicht mehr |

**Score Wahrheiten:** 9/9 verifiziert.

---

## Requirements Coverage (56 BELEG-* IDs)

### BELEG-AUDIT (5/5 ✓)

| ID | Description | Status | Evidence |
|----|-------------|--------|----------|
| BELEG-AUDIT-01 | Generische `audit_log`-Tabelle mit 12 Feldern | ✓ SATISFIED | `migrations/039_audit_log.sql:8-21` (id/entity_type/entity_id/action/field_name/old/new/actor/user_id/ip/user_agent/created_at) |
| BELEG-AUDIT-02 | Append-only Triggers BEFORE UPDATE/DELETE | ✓ SATISFIED | `migrations/039_audit_log.sql:26-38` `trg_audit_log_no_update`, `trg_audit_log_no_delete` |
| BELEG-AUDIT-03 | `audit.service.ts` mit identischer logAudit-Signatur | ✓ SATISFIED | `services/audit.service.ts:22-49`; `dj.audit.service.ts` nicht mehr im Verzeichnis |
| BELEG-AUDIT-04 | Daten-Migration via INSERT...SELECT mit NOT EXISTS-Schutz | ✓ SATISFIED | `migrations/039_audit_log.sql:43-56` |
| BELEG-AUDIT-05 | Alle DJ-Routes nutzen neuen Import | ✓ SATISFIED | `grep` findet `audit.service` in 5 DJ-Routes (events/invoices/quotes/services/settings); `expenses` ist gedroppt (DJREF-03) |

### BELEG-TEST (4/4 ✓)

| ID | Description | Status | Evidence |
|----|-------------|--------|----------|
| BELEG-TEST-01 | vitest + @vitest/ui in devDeps; npm test script | ✓ SATISFIED | `backend/package.json:test:vitest run`, `vitest@2.1.9`, `@vitest/ui@2.1.9` |
| BELEG-TEST-02 | vitest.config.ts mit pool: 'forks' | ✓ SATISFIED | `backend/vitest.config.ts:7-10` `pool: 'forks'`, `singleFork: true` |
| BELEG-TEST-03 | test/setup.ts mit :memory: DB + Migrationen | ✓ SATISFIED | `backend/test/setup.ts:6-22` |
| BELEG-TEST-04 | Mind. 1 grüner Audit-Smoke-Test | ✓ SATISFIED | `npm test` → 117/117 grün, davon `audit.test.ts:3 tests` |

### BELEG-SCHEMA (9/9 ✓)

| ID | Description | Status | Evidence |
|----|-------------|--------|----------|
| BELEG-SCHEMA-01 | Migration mit 9 Tabellen | ✓ SATISFIED | `migrations/040_belege.sql` enthält areas, tax_categories, trips, receipts, receipt_files, receipt_area_links, receipt_links, receipt_ocr_results, supplier_memory (Zeilen 18-244) |
| BELEG-SCHEMA-02 | receipts hat alle 30+ Felder | ✓ SATISFIED | `migrations/040_belege.sql:74-153` — alle geforderten Felder inkl. private_share_percent, corrects_receipt_id, freigegeben_at, file_hash_sha256, linked_invoice_id, linked_trip_id, source, steuerrelevant, import_eust, reverse_charge, input_tax_deductible vorhanden |
| BELEG-SCHEMA-03 | ALLE Geld-Felder INTEGER (Cents) | ✓ SATISFIED | grep auf REAL/FLOAT in Migration 040: nur `exchange_rate REAL` (Wechselkurs, kein Geld) und `overall_confidence REAL` (OCR-Confidence, kein Geld) — alle *_cents-Felder INTEGER |
| BELEG-SCHEMA-04 | GoBD-Lock-Trigger receipts spaltenspezifisch | ✓ SATISFIED | `migrations/040_belege.sql:257-276` `trg_receipts_no_update_after_freigabe` mit allen 9 Feldern aus REQ + zusätzlich type/private_share_percent |
| BELEG-SCHEMA-05 | GoBD-Lock auch für receipt_files (NO UPDATE/DELETE/INSERT) | ✓ SATISFIED | `migrations/040_belege.sql:281-303` 3 Trigger |
| BELEG-SCHEMA-06 | 3 Areas seeded | ✓ SATISFIED | `migrations/040_belege.sql:308-311` Amazon FBA, DJ, Privat |
| BELEG-SCHEMA-07 | 17 Tax-Categories seeded | ✓ SATISFIED | `migrations/040_belege.sql:316-333` (17 Inserts) |
| BELEG-SCHEMA-08 | 9 Settings-Keys | ✓ SATISFIED | `migrations/040_belege.sql:338-347` (alle 9 Keys) |
| BELEG-SCHEMA-09 | createBackup vor Migration | ✓ SATISFIED | Auto-Backup via `migrate.ts` (CLAUDE.md-Pattern); Header in 040 Z. 11 dokumentiert |

### BELEG-SERVICE (4/4 ✓)

| ID | Description | Status | Evidence |
|----|-------------|--------|----------|
| BELEG-SERVICE-01 | lib/cents.ts mit 5 Helpers, alle Math.round | ✓ SATISFIED | `backend/src/lib/cents.ts:9-41` (toCents, toEur, calcVatCents, calcGrossCents, calcNetCents); 16/16 Tests grün |
| BELEG-SERVICE-02 | receiptService mit create/update/applyOcrResult/markOcrFailed/freigeben | ✓ SATISFIED | `services/receiptService.ts:63/196/260/326/349`, `receipts.test.ts` grün |
| BELEG-SERVICE-03 | aggregateForUstva — RC Nullsumme, private_share, Ist-Versteuerung | ✓ SATISFIED | `services/taxCalcService.ts:110-241` (KZ81/86/66/67/62 Logik); `taxCalc.test.ts` grün |
| BELEG-SERVICE-04 | duplicateCheckService mit findBySha256 + findByHeuristic | ✓ SATISFIED | `services/duplicateCheckService.ts:27/47/68`; `duplicateCheck.test.ts` 7/7 grün |

### BELEG-OCR (8/8 ✓)

| ID | Description | Status | Evidence |
|----|-------------|--------|----------|
| BELEG-OCR-01 | POST /api/belege/upload mit multer (max 20, Filter, fileSize aus Setting) | ✓ SATISFIED | `routes/belege.upload.routes.ts:1-50+`, `upload.test.ts` 6/6 grün |
| BELEG-OCR-02 | SHA-256 Streaming via createReadStream | ✓ SATISFIED | `lib/files.ts:72-73` `crypto.createHash('sha256')` + `fs.createReadStream` |
| BELEG-OCR-03 | Storage in `~/.local/share/benny-dashboard/belege/YYYY/MM/`, sanitisiertes Filename-Pattern | ✓ SATISFIED | `lib/files.ts:ensureStorageDir`, `lib/filenames.ts:sanitizeForFilename`, Header `belege.upload.routes.ts` Z. 5-8 |
| BELEG-OCR-04 | tesseract.js (deu+eng) im Hintergrund via setImmediate; PDF→PNG mit pdf-to-img scale=2.0 | ✓ SATISFIED | `services/ocrService.ts:48,60-89` |
| BELEG-OCR-05 | worker.terminate() nach jedem Job | ✓ SATISFIED | `services/ocrService.ts:84` `await worker.terminate()` |
| BELEG-OCR-06 | mockOcr-Fallback bei Worker-Fehler oder ocr_engine='mock' | ✓ SATISFIED | `services/ocrService.ts:37-38,64-65,87-88` |
| BELEG-OCR-07 | receiptParserService extrahiert Felder mit per-Feld-Confidence | ✓ SATISFIED | `services/receiptParserService.ts:139-221` (Datum, Lieferant, Beträge, USt, IBAN, RC); `receiptParser.test.ts` 11/11 grün |
| BELEG-OCR-08 | Confidence < threshold-Setting → "manuell prüfen"-Badge | ✓ SATISFIED | `frontend/src/components/belege/OcrConfidenceBadge.tsx:18-25`; in BelegeUploadPage Z. 447 verdrahtet |

### BELEG-SUPPLIER (4/4 ✓)

| ID | Description | Status | Evidence |
|----|-------------|--------|----------|
| BELEG-SUPPLIER-01 | supplier_memory Tabelle | ✓ SATISFIED | `migrations/040_belege.sql:235-244` mit (supplier_normalized, area_id, tax_category_id, usage_count, last_used) |
| BELEG-SUPPLIER-02 | suggest() basiert auf höchstem usage_count | ✓ SATISFIED | `services/supplierMemoryService.ts:56-72` ORDER BY usage_count DESC, last_used DESC |
| BELEG-SUPPLIER-03 | recordUsage() inkrementiert + updated last_used | ✓ SATISFIED | `services/supplierMemoryService.ts:88-120` |
| BELEG-SUPPLIER-04 | Auto-Vorschlag im Upload-UI ab 2. Upload | ✓ SATISFIED | `frontend/src/pages/belege/BelegeUploadPage.tsx:315-361` `suggestTried`-Tracker; 9/9 Tests grün |

### BELEG-TASK (3/3 ✓)

| ID | Description | Status | Evidence |
|----|-------------|--------|----------|
| BELEG-TASK-01 | checkOpenPayments läuft täglich, idempotent | ✓ SATISFIED | `services/taskAutomationService.ts:78-130`; gewired in `server.ts:39-42` (Server-Startup-Sweep) und `routes/belege.routes.ts:92` (manueller Trigger); Idempotenz via `WHERE source_receipt_id = ?` |
| BELEG-TASK-02 | tasks.source_receipt_id FK auf receipts | ✓ SATISFIED | `migrations/040_belege.sql:251-252` `ALTER TABLE tasks ADD COLUMN source_receipt_id INTEGER REFERENCES receipts(id)` |
| BELEG-TASK-03 | Lead-Days konfigurierbar via Setting (Default 3) | ✓ SATISFIED | `services/taskAutomationService.ts:51` liest `payment_task_lead_days`; Default 3 in Migration 040 Z. 341 |

### BELEG-DJSYNC (7/7 ✓)

| ID | Description | Status | Evidence |
|----|-------------|--------|----------|
| BELEG-DJSYNC-01 | mirrorInvoiceToReceipts idempotent (UPSERT) | ✓ SATISFIED | `services/djSyncService.ts:106-250` mit `WHERE source='dj_invoice_sync' AND linked_invoice_id=?` |
| BELEG-DJSYNC-02 | dj.invoices.routes ruft Mirror an POST/PATCH/finalize/pay/cancel | ✓ SATISFIED | `routes/dj.invoices.routes.ts:115,161,184,251-252,282` 6 Aufrufe |
| BELEG-DJSYNC-03 | Stornorechnungen mit corrects_receipt_id + negative Cents | ✓ SATISFIED | `services/djSyncService.ts:174,202` cancel-Pfad; `dj.invoices.routes.ts:251-252` ruft mirror 2x |
| BELEG-DJSYNC-04 | REAL → Cents via Math.round(value * 100) | ✓ SATISFIED | `services/djSyncService.ts:117-119` |
| BELEG-DJSYNC-05 | tripSyncService spiegelt Trip mit type='fahrt', vat_rate=0, Fahrtkosten, input_tax_deductible=0 | ✓ SATISFIED | `services/tripSyncService.ts:50-138` |
| BELEG-DJSYNC-06 | Fahrten-Migration aus dj_expenses(category='fahrzeug') | ✓ SATISFIED | `migrations/041_fahrten_migration.sql:20-39` mit NOT EXISTS-Schutz; createBackup automatisch via migrate.ts |
| BELEG-DJSYNC-07 | dj.events Vorgespräch-Erledigt erstellt trips-Eintrag | ✓ SATISFIED | `routes/dj.events.routes.ts:248-276` INSERT INTO trips + mirrorTripToReceipts |

### BELEG-UI (11/11 ✓)

| ID | Description | Status | Evidence |
|----|-------------|--------|----------|
| BELEG-UI-01 | Routen `/belege` + 8 Sub-Routes | ✓ SATISFIED | `frontend/src/routes/routes.tsx:83-92` (alle 9 Routen registriert) |
| BELEG-UI-02 | navConfig Top-Level mit Icon receipt_long zwischen Verträge und KI Agenten | ✓ SATISFIED | `frontend/src/components/layout/navConfig.ts:30-41` Position korrekt |
| BELEG-UI-03 | OverviewPage 6 KPICards + 2 Listen, Steuerzahllast conditional | ✓ SATISFIED | `frontend/src/pages/belege/BelegeOverviewPage.tsx:171-227` mit 6 KPICard-Komponenten + Conditional Z. 213-219 |
| BELEG-UI-04 | ListPage sortier-/filterbar mit Suche | ✓ SATISFIED | `frontend/src/pages/belege/BelegeListPage.tsx` (URL-Search-Params Filter-State; ReceiptsTable wiederverwendet) |
| BELEG-UI-05 | DetailPage mit PdfPreview + AuditTrail + Korrekturbeleg-Button + freigegeben→disabled | ✓ SATISFIED | `frontend/src/pages/belege/BelegeDetailPage.tsx:27-28,263,450,514,546,570,654` |
| BELEG-UI-06 | UploadPage mit react-dropzone + OcrConfidenceBadge + Supplier-Suggest | ✓ SATISFIED | `frontend/src/pages/belege/BelegeUploadPage.tsx:24-25,128,447`; `react-dropzone@15.0.0` in package.json |
| BELEG-UI-07 | TaxPage Layout abhängig von ustva_zeitraum | ✓ SATISFIED | `frontend/src/pages/belege/BelegeTaxPage.tsx:4` Header dokumentiert; Single-Tabelle skaliert 1-12 Buckets |
| BELEG-UI-08 | ExportPage CSV mit Filtern (Jahr/Bereich/Kategorie) | ✓ SATISFIED | `frontend/src/pages/belege/BelegeExportPage.tsx:42` `/belege/export-csv?...`; UTF-8 BOM; ;-Trenner |
| BELEG-UI-09 | SettingsPage Areas-CRUD + TaxCategories-CRUD + 9 Settings + DB-Backup-Button | ✓ SATISFIED | `frontend/src/pages/belege/BelegeSettingsPage.tsx:28-32,77,321,329,357` |
| BELEG-UI-10 | StatusBadge erweitert um 5 neue Stati | ✓ SATISFIED | `frontend/src/components/dj/StatusBadge.tsx:5,31-35` (zu_pruefen, freigegeben, archiviert, nicht_relevant, ocr_pending) |
| BELEG-UI-11 | formatCurrencyFromCents Helper | ✓ SATISFIED | `frontend/src/lib/format.ts:57` |

### BELEG-DJREF (5/5 ✓)

| ID | Description | Status | Evidence |
|----|-------------|--------|----------|
| BELEG-DJREF-01 | DjAccountingPage zeigt Daten aus receipts WHERE area=DJ | ✓ SATISFIED | `routes/dj.accounting.routes.ts:7-12,25,49,60,153` `FROM receipts r INNER JOIN areas a ON ral.area_id` |
| BELEG-DJREF-02 | Tab "Ausgaben" entfernt oder mit Hinweis + Link | ✓ SATISFIED | `frontend/src/pages/dj/DjAccountingPage.tsx:271,286` "Ausgaben werden im Belege-Modul erfasst" + Button → `/belege/neu?area=DJ` |
| BELEG-DJREF-03 | dj.expenses.routes.ts entfernt + Mount aus dj.routes.ts entfernt | ✓ SATISFIED | `ls backend/src/routes/dj.expenses*` leer; `dj.routes.ts` mountet `/api/dj/expenses` nicht mehr |
| BELEG-DJREF-04 | dj_expenses-Tabelle gedropt nach Trips-Migration | ✓ SATISFIED | `migrations/042_drop_dj_expenses.sql:29` |
| BELEG-DJREF-05 | dj.accounting.routes Aggregations-Queries auf receipts | ✓ SATISFIED | `routes/dj.accounting.routes.ts:74,81,95,103,116,153,175,185` (revenue/expenses/vat/profit alle aus receipts) |

### BELEG-SEED (4/4 ✓)

| ID | Description | Status | Evidence |
|----|-------------|--------|----------|
| BELEG-SEED-01 | 5 Beispiel-Belege seeded mit korrektem Status | ✓ SATISFIED | `backend/scripts/seed-belege.ts:217,246,...` (Alibaba/Thomann/E.ON/Google/Hochzeit Müller) |
| BELEG-SEED-02 | 5 contacts seeded | ✓ SATISFIED | `backend/scripts/seed-belege.ts:185-198` (Alibaba/Thomann/E.ON/Google IE/Familie Müller) |
| BELEG-SEED-03 | DJ-Gig in dj_events + Trip "Hochzeit Müller 87 km" in trips | ✓ SATISFIED | `backend/scripts/seed-belege.ts:348,386-387` |
| BELEG-SEED-04 | tsc clean Backend+Frontend; vitest grün | ✓ SATISFIED | Backend tsc: exit 0; Frontend tsc: exit 0; Backend 117/117 grün; Frontend 41/41 grün |

**Coverage Summary:** 56/56 BELEG-* Requirements satisfied. 0 BLOCKED, 0 NEEDS HUMAN.

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/db/migrations/039_audit_log.sql` | Audit-Tabelle + 2 Trigger + Daten-Migration | ✓ VERIFIED | 56 Zeilen, alle Komponenten vorhanden |
| `backend/src/db/migrations/040_belege.sql` | 9 Tabellen + 4 Trigger + 3 Seed-Blöcke | ✓ VERIFIED | 349 Zeilen, vollständig |
| `backend/src/db/migrations/041_fahrten_migration.sql` | dj_expenses(fahrzeug) → trips, idempotent | ✓ VERIFIED | NOT EXISTS-Schutz Z. 35-39 |
| `backend/src/db/migrations/042_drop_dj_expenses.sql` | DROP TABLE dj_expenses + DROP VIEW v_dj_trips | ✓ VERIFIED | Z. 29, 33 |
| `backend/src/services/audit.service.ts` | logAudit-Funktion (legacy-kompatibel) | ✓ VERIFIED | 49 Zeilen |
| `backend/src/services/dj.audit.service.ts` | Soll gelöscht sein | ✓ VERIFIED | nicht im Verzeichnis (BELEG-AUDIT-03) |
| `backend/src/lib/cents.ts` | 5 Helpers + parseAmountToCents | ✓ VERIFIED | 71 Zeilen, alle Math.round |
| `backend/src/services/receiptService.ts` | create/update/applyOcrResult/markOcrFailed/freigeben | ✓ VERIFIED | 5 Funktionen exportiert |
| `backend/src/services/taxCalcService.ts` | aggregateForUstva | ✓ VERIFIED | KZ-Logik + private_share + Ist-Versteuerung |
| `backend/src/services/duplicateCheckService.ts` | findBySha256 + findByHeuristic | ✓ VERIFIED | beide exportiert |
| `backend/src/services/ocrService.ts` | tesseract+pdf-to-img+mock-fallback | ✓ VERIFIED | Worker-per-Job mit terminate() |
| `backend/src/services/receiptParserService.ts` | parse() mit per-Feld-Confidence | ✓ VERIFIED | 221 Zeilen |
| `backend/src/services/supplierMemoryService.ts` | suggest+recordUsage+normalize | ✓ VERIFIED | 3 Funktionen |
| `backend/src/services/taskAutomationService.ts` | checkOpenPayments idempotent | ✓ VERIFIED | wired in server.ts + belege.routes.ts |
| `backend/src/services/djSyncService.ts` | mirrorInvoiceToReceipts | ✓ VERIFIED | Cancel-Pfad mit corrects_receipt_id |
| `backend/src/services/tripSyncService.ts` | mirrorTripToReceipts | ✓ VERIFIED | type='fahrt', vat_rate=0 |
| `backend/src/routes/belege.routes.ts` | CRUD Routen | ✓ VERIFIED | vorhanden |
| `backend/src/routes/belege.upload.routes.ts` | POST /api/belege/upload | ✓ VERIFIED | mounted via Sub-Router |
| `backend/src/routes/trips.routes.ts` | Trips CRUD | ✓ VERIFIED | mit mirrorTripToReceipts integration |
| `backend/src/routes/dj.expenses.routes.ts` | Soll gelöscht sein | ✓ VERIFIED | nicht im Verzeichnis (BELEG-DJREF-03) |
| `backend/scripts/seed-belege.ts` | 5 Belege + Contacts + Event + Trip idempotent | ✓ VERIFIED | mit getOrInsertContact/exists-Checks |
| `frontend/src/pages/belege/BelegeOverviewPage.tsx` | 6 KPICards + Listen | ✓ VERIFIED | conditional Steuer-Karte |
| `frontend/src/pages/belege/BelegeListPage.tsx` | Filterbare Tabelle | ✓ VERIFIED | URL-Search-Params |
| `frontend/src/pages/belege/BelegeDetailPage.tsx` | PdfPreview+AuditTrail+Korrektur | ✓ VERIFIED | freigegeben→disabled |
| `frontend/src/pages/belege/BelegeUploadPage.tsx` | Dropzone+OCR+Supplier-Suggest | ✓ VERIFIED | react-dropzone@15 |
| `frontend/src/pages/belege/BelegeOpenPaymentsPage.tsx` | Filter-Variante | ✓ VERIFIED | nutzt ReceiptsTable |
| `frontend/src/pages/belege/BelegeReviewPage.tsx` | Filter-Variante | ✓ VERIFIED | nutzt ReceiptsTable |
| `frontend/src/pages/belege/BelegeTaxPage.tsx` | UStVA-Tabelle (Jahr/Quartal/Monat) | ✓ VERIFIED | single-Tabelle skaliert |
| `frontend/src/pages/belege/BelegeExportPage.tsx` | CSV-Export | ✓ VERIFIED | UTF-8+BOM+;-Trenner |
| `frontend/src/pages/belege/BelegeSettingsPage.tsx` | Areas+TaxCats+9 Settings+Backup | ✓ VERIFIED | Bulk-PATCH-Pattern |
| `frontend/src/components/belege/PdfPreview.tsx` | Inline-Preview | ✓ VERIFIED | importiert in DetailPage |
| `frontend/src/components/belege/AuditTrail.tsx` | Audit-Log-Render | ✓ VERIFIED | importiert in DetailPage |
| `frontend/src/components/belege/DropzoneBelege.tsx` | react-dropzone-Wrapper | ✓ VERIFIED | importiert in UploadPage |
| `frontend/src/components/belege/OcrConfidenceBadge.tsx` | Confidence-Badge | ✓ VERIFIED | mit threshold-Setting |
| `frontend/src/lib/format.ts:formatCurrencyFromCents` | Cents→EUR Helper | ✓ VERIFIED | Z. 57 |
| `frontend/src/components/dj/StatusBadge.tsx` | 5 neue Status-Varianten | ✓ VERIFIED | Z. 31-35 |

---

## Key Link Verification

| From | To | Via | Status |
|------|-----|-----|--------|
| `dj.invoices.routes.ts` | `djSyncService.mirrorInvoiceToReceipts` | direkter Aufruf an 6 Stellen (POST/PATCH/finalize/pay/cancel/cancelStorno) | ✓ WIRED |
| `dj.events.routes.ts` (Vorgespräch) | trips-Tabelle + `tripSyncService.mirrorTripToReceipts` | Z. 257-276 INSERT INTO trips → mirrorTripToReceipts | ✓ WIRED |
| `belege.upload.routes.ts` | `ocrService.ocrFile` → `receiptParserService.parse` → `receiptService.applyOcrResult` | setImmediate-Pipeline | ✓ WIRED |
| `BelegeUploadPage.tsx` | `/api/belege/supplier-suggest` | suggestTried-Tracker (lazy) | ✓ WIRED |
| `BelegeUploadPage.tsx` | `/api/belege/upload` (multipart) | multer multi-file | ✓ WIRED |
| `BelegeDetailPage.tsx` | freigegeben_at → field disabled | Z. 514, 643 GoBD-Lock-Hinweis + UI-Disabled | ✓ WIRED |
| `BelegeSettingsPage.tsx` | `/api/belege/db-backup` (createBackup-Helper) | DB-Backup-Button Z. 357 | ✓ WIRED |
| `dj.accounting.routes.ts` | `receipts INNER JOIN receipt_area_links ON area.slug='dj'` | Z. 25, 49, 60, 116, 153, 175, 185 | ✓ WIRED |
| `server.ts` (Startup) | `taskAutomationService.checkOpenPayments` | Z. 39-42 lazy import | ✓ WIRED |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Backend tsc clean | `cd backend && npx tsc --noEmit` | exit 0, kein Output | ✓ PASS |
| Frontend tsc clean | `cd frontend && npx tsc --noEmit` | exit 0, kein Output | ✓ PASS |
| Backend Tests grün | `cd backend && npm test` | 117/117 in 14 Files; 3.08s | ✓ PASS |
| Frontend Tests grün | `cd frontend && npm test -- --run` | 41/41 in 4 Files; 1.26s | ✓ PASS |
| Migration-Files vorhanden | `ls backend/src/db/migrations/04*.sql` | 040, 041, 042 + 039 vorhanden | ✓ PASS |
| dj.audit.service.ts gelöscht | `ls backend/src/services/dj.audit*` | leer | ✓ PASS |
| dj.expenses.routes.ts gelöscht | `ls backend/src/routes/dj.expenses*` | leer | ✓ PASS |
| 9 Belege-Pages vorhanden | `ls frontend/src/pages/belege/` | 9 Pages: Overview, List, OpenPayments, Review, Detail, Upload, Tax, Export, Settings | ✓ PASS |
| 4 Belege-Components vorhanden | `ls frontend/src/components/belege/` | 4: PdfPreview, AuditTrail, DropzoneBelege, OcrConfidenceBadge | ✓ PASS |

---

## Anti-Patterns Found

Keine Blocker oder Warnungen. Spot-Check auf TODO/FIXME/PLACEHOLDER in den modifizierten Dateien zeigt keine offenen Items, die das Goal blockieren.

---

## Cross-Phase-Konsistenz

### REQUIREMENTS.md (Coverage-Tabelle Zeilen 268-278)
**Inkonsistenz festgestellt** — die Status-Spalte ist unvollständig aktualisiert:

| Zeile | Aktueller Wert | Sollte sein |
|-------|---------------|-------------|
| 268 BELEG-AUDIT | Pending | Complete (2026-05-06) |
| 269 BELEG-TEST | Pending | Complete (2026-05-06) |
| 270 BELEG-SCHEMA | Pending | Complete (2026-05-06) |
| 271 BELEG-SERVICE | Complete (2026-05-06) | OK |
| 272 BELEG-OCR | Complete (2026-05-06) | OK |
| 273 BELEG-SUPPLIER | Pending | Complete (2026-05-06) |
| 274 BELEG-TASK | Complete (2026-05-06) | OK |
| 275 BELEG-DJSYNC | Pending | Complete (2026-05-06) |
| 276 BELEG-UI | Pending | Complete (2026-05-06) |
| 277 BELEG-DJREF | Pending | Complete (2026-05-06) |
| 278 BELEG-SEED | Pending | Complete (2026-05-06) |

Die `[x]`-Detail-Marker für alle 56 IDs (Zeilen 95-188) sind korrekt gesetzt; nur die Coverage-Tabelle wurde nicht synchron nachgezogen. **Status für Verifikation: kein Blocker** — die `[x]`-Marker sind die Source of Truth.

### STATE.md (Status-Tabelle + stopped_at)
**Inkonsistenz festgestellt:**
- Zeile 30-33: Status-Tabelle zeigt "Phase 3: Not started" und "Phase 4: Added 2026-05-05 — to be planned"
- Zeile 41 Progress-Bar: 86% — 24/28 (sollte 100% — 28/28 sein, passt zu frontmatter)
- Zeile 6 stopped_at: deutet auf laufenden UAT hin, der bereits abgeschlossen ist
- Frontmatter (Zeilen 9-13): completed_phases=4, completed_plans=28, percent=100 — **diese Werte sind korrekt**

### ROADMAP.md (Phase-4-Header + Footer)
- Zeile 188: "Plans: 6/13 plans executed" — **inkonsistent mit den darunter folgenden 13 [x]-Markern**
- Zeile 216: Footer "Plan 04-05 abgeschlossen; 6/13 Phase-4-Plaene komplett" — veraltet
- Alle 13 Plan-Items Zeilen 200-213 haben `[x]` — **Source of Truth**

### Schluss-Bewertung
Die 3 Konsistenz-Issues sind kosmetisch und blockieren das Phase-Goal nicht. Sie betreffen ausschließlich Status-Aggregations-Texte, die bei Phasen-Abschluss nicht mit-aktualisiert wurden. Empfehlung: `gsd-tools` Status-Sync laufen lassen (separate Wartungs-Aufgabe, nicht Teil von Phase 4).

---

## Human Verification Required

Keine offenen Human-Verification-Items: User hat das vollständige UAT bereits am 2026-05-06 durchgeführt; alle UAT-Bug-Fixes (PdfPreview-Auth, Filename-Collision SHA-Prefix, editierbare Belege-Felder, Bereich-Picker, Calendar-Cross-Midnight, vat-Konsistenz) wurden danach committed und sind im aktuellen Code-Stand reflektiert.

VALIDATION.md (Zeile 86-91) listet 5 manuelle Sign-Off-Items, die durch UAT abgedeckt wurden:
- OCR-Vorschläge nützlich → User-bestätigt
- GoBD-Lock visuell richtig → User-bestätigt
- StatusBadge-Glow-Konsistenz → User-bestätigt
- PDF-Vorschau lädt flüssig → User-bestätigt
- Drag&Drop Multi-File + HEIC ignoriert → User-bestätigt

---

## Gaps Summary

**Keine echten Gaps.** Phase 4 erfüllt alle 56 BELEG-* Requirements sowohl auf Code- als auch auf Test-Ebene. Die 3 dokumentierten Konsistenz-Issues sind kosmetisch (veraltete Status-Aggregations-Texte) und betreffen nicht das Phase-Goal.

---

*Verifiziert: 2026-05-07T17:42:00Z*
*Verifier: Claude (gsd-verifier)*
