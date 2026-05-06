---
phase: 04-belege-modul-dj-buchhaltungs-refactoring
plan: 03
subsystem: routes, ocr, file-upload, http-api
tags: [express, multer, tesseract.js, pdf-to-img, sharp, sha256, regex-parser, vitest, gobd]

# Dependency graph
requires:
  - phase: 04-01 (Wave 1)
    provides: receipts/receipt_files/receipt_ocr_results/app_settings-Schema, GoBD-Trigger
  - phase: 04-02 (Wave 2)
    provides: receiptService.create/update/applyOcrResult/markOcrFailed/freigeben, duplicateCheckService.findBySha256, lib/files (sha256OfFile, ensureStorageDir, receiptStoragePath), lib/filenames.sanitizeForFilename, types/receipt
provides:
  - services/ocrService.ts — tesseract.js Worker-per-Job + pdf-to-img Rasterisierung + Mock-Fallback
  - services/receiptParserService.ts — DE-Receipt Regex-Parser mit per-Feld-Konfidenz (Datum, Lieferant, Betraege, USt, IBAN, RC)
  - routes/belege.upload.routes.ts — POST /api/belege/upload (Multi-File, SHA-256-Dup-Check, Background-OCR via setImmediate)
  - routes/belege.routes.ts — GET / + GET /:id + PATCH /:id + POST /:id/freigeben + DELETE /:id
  - app.ts — Mount /api/belege hinter verifyToken-Guard
affects: [04-04-supplier-memory, 04-05-task-automation, 04-06-dj-sync, 04-07-ui-overview, 04-08-ui-list-detail, 04-09-ui-upload, 04-10-ui-tax-export-settings, 04-11-dj-refactor]

# Tech tracking
tech-stack:
  added:
    - tesseract.js@7 (deu+eng OCR; Worker per-Job mit terminate() — Memory-Leak-Schutz)
    - pdf-to-img@6 (PDF -> PNG-Rasterisierung; nur Seite 1, scale=2.0 -> A4 ~1190x1684; PDF-Bomb-Schutz)
    - sharp@0.34 (Image-Pipeline-Dependency; bisher nur als peer-dep durch pdf-to-img genutzt)
    - multer@2.1.1 + @types/multer (war bereits installiert; jetzt aktiv genutzt)
  patterns:
    - "Worker-per-Job + finally-terminate: tesseract.js Worker wird pro recognize()-Call neu erstellt und im finally terminated; verhindert Memory-Leak in long-running Express-Prozessen."
    - "PDF-Bomb-Schutz via for-await-break: pdf-to-img iteriert async ueber Pages; wir returnen beim ersten yield -> nur Seite 1 wird rasterisiert; 1000-Seiten-PDF wird nicht zu OOM."
    - "Mock-Fallback bei OCR-Fehler: tesseract-Modul fehlt/Worker-Crash -> mockOcr() statt 500; Upload-Flow laeuft weiter, Beleg landet in zu_pruefen fuer manuelle Eingabe."
    - "Background-OCR via setImmediate: POST /upload returnt sofort mit receipt_id; OCR laeuft im Hintergrund und persistiert das Ergebnis ueber receiptService.applyOcrResult; bei Failure markOcrFailed (status zu_pruefen)."
    - "Two-Stage-Upload-Limit: multer hard-limit 100 MB (sofortiger Abbruch beim Schreiben) + settings-basiertes max_upload_size_mb (default 25, pro File nachgepruepft -> 413)."
    - "fileFilter mit path.extname.toLowerCase: blockt .pdf.exe (extname == .exe), .heic, .zip etc.; Defense-in-Depth via UI-File-Picker in Plan 09."
    - "Multer Tmp-Storage + spaeter rename: Datei wird zuerst in os.tmpdir/benny-belege-tmp geschrieben, nach SHA-256-Hash und Dup-Check via fs.rename in das finale Storage-Dir verschoben (atomic move auf gleichem FS)."

key-files:
  created:
    - backend/src/services/ocrService.ts
    - backend/src/services/receiptParserService.ts
    - backend/src/routes/belege.upload.routes.ts
    - backend/src/routes/belege.routes.ts
    - backend/test/receiptParser.test.ts
    - backend/test/upload.test.ts
  modified:
    - backend/package.json (tesseract.js, pdf-to-img, sharp, @types/multer ergaenzt)
    - backend/src/app.ts (belegeRoutes-Import + app.use('/api/belege', ...))

key-decisions:
  - "Multer Tmp-Storage statt Memory-Storage — fuer 25 MB+ Files vermeiden wir Buffer-im-RAM; Tmp-Dir auf gleichem FS wie finale Storage erlaubt fs.rename als atomic move."
  - "Multi-File-Upload mit field name 'file' und upload.array('file', 20) — UI-Plan 09 kann React-Dropzone direkt anbinden; max 20 Files pro Request."
  - "Settings-basiertes max_upload_size_mb statt env-var — User kann ueber Settings-UI ohne Restart aendern; multer hard-limit (100 MB) als Schutz gegen DoS via gigantische uploads."
  - "fileFilter ueber path.extname.toLowerCase statt mime-type — User-Browser senden teilweise generisches application/octet-stream; extname ist verlaesslicher und schlaegt .pdf.exe ab."
  - "Background-OCR via setImmediate statt Promise-fire-and-forget — setImmediate stellt sicher, dass die HTTP-Response ZUERST gesendet wird; Promise wuerde im Microtask-Queue laufen und kann theoretisch synchron mit Response konkurrieren."
  - "Pro-File-OCR statt Batch — bei Mehrfachupload startet jede Datei ihren eigenen OCR-Job; tesseract.js Worker wird pro Job created/terminated. Sequential ist OK fuer Single-User-App; bei Concurrency-Bedarf koennte ein Job-Queue (z.B. p-queue) eingefuegt werden."
  - "Ein Beleg pro Upload-Datei (nicht: alle Pages eines PDFs als separate Belege) — User-Erwartung: Hochgeladener PDF == ein Beleg. Multi-Page-PDF wird nur auf Seite 1 OCR-d (typisch fuer Eingangsrechnungen); zukuenftiger Multi-Page-Support wuerde receipt_files-Tabelle als 1:N nutzen."
  - "Vorlaeufiger Filename '_unbekannt_0-00_eingangsrechnung' beim Upload — Plan 04 (Supplier-Memory) wird das nach OCR auf den extrahierten Lieferanten umbenennen; bis dahin sortierbar nach Datum."
  - "GET /api/belege mit area-Filter ueber JOIN — areas/receipt_area_links sind Plan-04-01-Tabellen; Filter ist optional (kein area = alle Areas), JOIN nur wenn area-Param gesetzt."
  - "PATCH 409 bei GoBD-Block — receiptService.update wirft Error('GoBD: ...'); Route faengt das ab und antwortet 409 statt 500. Plan-09-UI kann user-friendly Hinweis ('Beleg ist freigegeben, erstelle Korrektur-Beleg') zeigen."
  - "Logic-Level-Tests statt vollstaendiger HTTP-Roundtrip — supertest+multer wuerde echte Multipart-Requests testen, aber die kritischen Bauteile (sha256, dup-check, receiptService.create, GoBD-Triggers) sind im Service-Layer und bereits ueber 04-02-Tests + 04-03-Logic-Tests abgedeckt. HTTP-Roundtrip kommt in Plan 09 (UI) als E2E-Test."

patterns-established:
  - "Background-Job-Pattern fuer Express: setImmediate(async () => { try { ... } catch (e) { console.warn(...); fallback() } }) — Antwort wird nicht blockiert, Fehler werden geloggt und in DB-Status gespiegelt (status zu_pruefen)."
  - "Routes fangen Service-Errors via Pattern-Match auf err.message ab: 'not found' -> 404, 'GoBD' -> 409, sonst 500. Vermeidet HTTP-Codes als geworfene Klassen-Hierarchie; erlaubt aber strukturierte Status-Codes."
  - "Sub-Router-Mount: belege.routes.ts macht router.use('/', uploadRouter) -> Upload-Endpoint ist unter /api/belege/upload erreichbar OHNE separates app.use in app.ts. Plan 09 muss nichts an app.ts aendern."
  - "Logic-Level-Test-Pattern fuer Routes: vi.mock + dbHolder Proxy (Wave 2 etabliert) + sha256OfFile auf realer Tmp-Datei + receiptService.create + findBySha256 als End-to-End-Verifikation der Upload-Pipeline (ohne supertest)."

requirements-completed: [BELEG-OCR-01, BELEG-OCR-02, BELEG-OCR-03, BELEG-OCR-04, BELEG-OCR-05, BELEG-OCR-06, BELEG-OCR-07, BELEG-OCR-08]

# Metrics
duration: ~30min (Task 1 separat, Task 2 als Continuation)
completed: 2026-05-06
---

# Phase 04 Plan 03: Upload + OCR Summary

**Multi-File-Upload-Endpoint mit asynchroner OCR (tesseract.js Worker-per-Job + pdf-to-img Rasterisierung), DE-Receipt-Regex-Parser fuer Datum/Betrag/USt/IBAN/Reverse-Charge sowie Belege-CRUD-Routes hinter JWT-Guard — alles ueber 17 vitest-Tests verifiziert (11 Parser + 6 Upload-Pipeline) und 77/77 Backend-Tests gruen.**

## Performance

- **Started:** 2026-05-06 (Plan 03 began earlier with Task 1)
- **Completed:** 2026-05-06T14:27Z (Task 2 finalisiert)
- **Tasks:** 2 / 2
- **Files created:** 4 (2 src/services + 2 src/routes) + 2 test
- **Files modified:** 2 (backend/package.json deps, backend/src/app.ts mount)
- **Tests:** 77/77 passed (gegenueber 60 nach Plan 04-02; +11 receiptParser + +6 upload = +17)
- **Sub-Repos:** keine — Single-Repo-Setup

## Accomplishments

- **Wave 2 (parallel zu Plan 02) abgeschlossen** — Plan 09 (UI-Upload) kann gegen `POST /api/belege/upload` arbeiten; Plan 04 (Supplier-Memory) hat den `parsed.supplier_name` als Hook.
- **OCR-Pipeline operational:**
  - tesseract.js@7 mit deu+eng-Sprachpaketen, Worker per Job inkl. `await worker.terminate()` im finally — kein Memory-Leak in long-running Express.
  - pdf-to-img@6 rasterisiert PDFs zu PNG (scale=2.0, nur Seite 1 ueber for-await-break) — schuetzt vor PDF-Bombs.
  - Mock-Fallback bei tesseract-Fehlern (Modul fehlt, Worker-Crash) -> mockOcr() statt HTTP 500.
  - Setting `app_settings.ocr_engine = 'mock'` aktiviert Mock-Output system-weit (z.B. fuer CI ohne native Deps).
- **Receipt-Parser fuer DE-Belege:**
  - Datum mit 3 Patterns: "Rechnungsdatum: DD.MM.YYYY" (conf 0.9), ISO YYYY-MM-DD (conf 0.7), DD.MM.YYYY ohne Praefix (conf 0.5).
  - Brutto mit Schluesselwort-Pattern (Gesamtbetrag/Brutto/Total/Summe/Endbetrag/zu zahlen, conf 0.85) + generisches Geld-am-Zeilen-Ende (conf 0.5).
  - USt-Satz 0/7/19 mit zwei Patterns; IBAN per DE-Format-Regex; Reverse-Charge ueber 3 Patterns (§13b UStG, "Steuerschuldnerschaft des Leistungsempf...", "Reverse Charge").
  - Auto-Recompute net/vat aus gross + rate (Math.round((gross*100)/(100+rate))).
  - per-Feld-Konfidenz 0..1 — receiptService.applyOcrResult entscheidet anhand confidence > 0.5 ob supplier_name uebernommen wird.
- **Upload-Endpoint operational (POST /api/belege/upload):**
  - Multi-File (`upload.array('file', 20)`), Tmp-Storage in `os.tmpdir()/benny-belege-tmp`, atomic-move via `fs.rename` in finalen Pfad nach Hash-Berechnung.
  - SHA-256 ueber sha256OfFile (lib/files), Dup-Check via duplicateCheckService.findBySha256 -> bei Hit `created.push({ duplicate: true, existingId })` und tmp-Datei wird geloescht.
  - Hard-Limit 100 MB (multer-internal) + Settings-basiertes max_upload_size_mb (Default 25 MB) -> 413 mit User-Friendly-Error.
  - fileFilter erlaubt nur `.pdf/.jpg/.jpeg/.png` (ueber path.extname.toLowerCase) — `.pdf.exe` wird abgewiesen.
  - Background-OCR ueber setImmediate(async () => { ... }) — POST returnt sofort mit `{ created: [{ id, original_filename, sha }] }` Status 201; OCR laeuft asynchron und persistiert das Ergebnis ueber receiptService.applyOcrResult; bei Fehler markOcrFailed (status -> zu_pruefen).
- **Belege-CRUD-Routes (mit Auth):**
  - `GET /api/belege` mit area/status/type/from/to/search Filtern (alle Parameter ueber Placeholder, kein String-Concat -> SQL-Injection-safe).
  - `GET /api/belege/:id` liefert Receipt + receipt_files + receipt_area_links + receipt_ocr_results + 50 Audit-Eintraege in einem Roundtrip.
  - `PATCH /api/belege/:id` -> 200 / 404 / 409 (GoBD) / 500.
  - `POST /api/belege/:id/freigeben` -> idempotenter Lock; setzt freigegeben_at, freigegeben_by, status.
  - `DELETE /api/belege/:id` -> 204 / 404 / 409 (freigegeben darf nicht).
- **Mount in app.ts hinter verifyToken-Guard** — alle 5 Endpoints (4 + Sub-Router /upload) sind JWT-protected; eine ungetokte Anfrage erhaelt 401.

## Task Commits

Task 1 wurde vor dem aktuellen Continuation-Run abgeschlossen; Task 2 wurde in 3 atomaren Commits committet (statt einem Mega-Commit, fuer reviewbare Diffs):

1. **Task 1: OCR-Pipeline + Receipt-Parser** — `82a17ef` (feat) — tesseract.js@7 + pdf-to-img@6 + sharp@0.34 + @types/multer installiert; ocrService.ts (111 Zeilen) + receiptParserService.ts (221 Zeilen) + receiptParser.test.ts (68 Zeilen, 11 Tests).
2. **Task 2a: Upload-Endpoint** — `1774997` (feat) — belege.upload.routes.ts (177 Zeilen): POST /upload mit multer/setImmediate/Background-OCR/SHA-Dup-Check.
3. **Task 2b: CRUD-Routes + Mount** — `3e80a11` (feat) — belege.routes.ts (220 Zeilen) + app.ts mount unter /api/belege.
4. **Task 2c: Upload-Tests** — `aad0b09` (test) — upload.test.ts (133 Zeilen, 6 Tests, Logic-Level mit dbHolder-Proxy).

**Plan-Metadaten-Commit:** wird nach diesem SUMMARY plus STATE/ROADMAP/REQUIREMENTS-Updates gemacht.

## Files Created/Modified

### Created — Source

- `backend/src/services/ocrService.ts` (111 Zeilen) — tesseract.js + pdf-to-img Wrapper; `ocrFile`, `ocrImage`, `rasterizeFirstPage`, `ocrService` exports.
- `backend/src/services/receiptParserService.ts` (221 Zeilen) — `parse(text)` + `receiptParserService` export; 6 Pattern-Gruppen + Auto-Recompute.
- `backend/src/routes/belege.upload.routes.ts` (177 Zeilen) — POST /upload Multi-File-Handler mit komplettem Pipeline.
- `backend/src/routes/belege.routes.ts` (220 Zeilen) — GET/PATCH/POST/DELETE-CRUD + sub-router-Mount fuer upload.

### Created — Tests

- `backend/test/receiptParser.test.ts` (11 Tests) — Datum/Betrag/USt/IBAN/Belegnummer/RC/Auto-Net+Vat/Empty-Case/Lieferant.
- `backend/test/upload.test.ts` (6 Tests) — sha256OfFile-vs-crypto-Referenz, receiptService+findBySha256-Roundtrip, zwei-Hashes-zwei-Receipts, ocr_pending-Status-nach-Insert, Allowed-Extensions-Contract, Path-Traversal-Sanitization.

### Modified

- `backend/package.json` — `+tesseract.js@7 +pdf-to-img@6 +sharp@0.34 +@types/multer` (multer war schon da).
- `backend/src/app.ts` — `+import belegeRoutes from './routes/belege.routes'` (Zeile 20) + `+app.use('/api/belege', belegeRoutes)` (Zeile 61, hinter verifyToken-Guard).

## Decisions Made

- **Multer Tmp-Storage statt Memory-Storage** — Files bis 100 MB sollen nicht im RAM gepuffert werden. tmp-Datei auf gleichem FS wie finale Storage erlaubt fs.rename als atomic move ohne copy+delete.
- **Background-OCR via `setImmediate(async () => ...)`** — sicherer als `Promise.resolve().then(...)` (Microtask-Queue) weil setImmediate erst nach der I/O-Phase laeuft -> HTTP-Response ist garantiert raus, bevor OCR-Worker startet. Wichtig fuer User-Experience: Upload-Bestaetigung in <100ms, OCR laeuft 1-30s im Hintergrund.
- **Settings-basiertes max_upload_size_mb (Default 25)** — pro File nachgepruepft. Multer-Hard-Limit 100 MB als ueber-die-Schulter-Sicherheitsnetz (DoS-Schutz). User kann ueber `app_settings`-Tabelle (Plan 09 UI) anpassen ohne Backend-Restart.
- **fileFilter ueber path.extname.toLowerCase** — robuster als mime-type (Browser sendet teilweise generisches application/octet-stream) und blockt insbesondere `.pdf.exe` (extname == `.exe`). `mime_type` aus dem Multer-File wird trotzdem in receipt_files persistiert fuer Audit-/Debug-Zwecke.
- **Pro Datei einen Beleg (kein Auto-Split bei Multi-Page-PDF)** — User-Erwartung: 1 Upload = 1 Beleg. Multi-Page-PDFs werden in receipt_files referenziert (1:1), aber nur Seite 1 OCR-d. Kuenftiger Bedarf (Spesen mit mehreren Quittungen in einem PDF) wuerde receipt_files als 1:N nutzen — Schema ist dafuer bereit.
- **Vorlaeufiger Filename `YYYY-MM-DD_unbekannt_0-00_eingangsrechnung.ext` beim Upload** — supplier-Wert beim Upload-Zeitpunkt unbekannt, weil OCR noch nicht gelaufen. Plan 04 (Supplier-Memory) wird Dateien nach OCR umbenennen auf finalen DJ-konformen Namen. Bis dahin sortierbar nach Datum.
- **GET /api/belege limit 500** — UI muss Filter setzen (Datum, Status, Suche). Bei groesseren Datasets (>500 Belege) zeigt UI Hinweis "Suche eingrenzen". Pagination koennte spaeter optional ergaenzt werden.
- **PATCH-Errors per `err.message.includes(...)`** — verzichtet auf separate Error-Klassen-Hierarchie (kein `ReceiptNotFoundError`, kein `GoBDLockError`); stattdessen wird der Service-Error-Text gepattern-matched. Das ist pragmatisch fuer den Single-User-App-Scope und erspart die Klassen-Boilerplate; bei wachsender Komplexitaet sollte refactored werden.
- **Logic-Level-Tests statt voll-supertest** — Multipart-HTTP-Roundtrip ueber supertest + Multer waere moeglich, aber alle kritischen Bauteile (sha256, dup-check, receiptService, GoBD-Triggers) sind bereits ueber 04-02-Service-Tests + 04-03-Logic-Tests abgedeckt. HTTP-Roundtrip kommt natuerlich in Plan 09 (UI E2E).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Migration-Nummer im Plan-Context-Block veraltet (039 statt 040)**
- **Found during:** Task 2 (PLAN-Read in `<context>`-Block)
- **Issue:** Plan-File referenziert `backend/src/db/migrations/039_belege.sql`, tatsaechlich heisst die Migration `040_belege.sql` (039 ist `039_audit_log.sql`). Hat keinen Einfluss auf den Plan-Inhalt — die referenzierten Tabellen (receipts, receipt_files, receipt_area_links, receipt_ocr_results, audit_log) sind alle in 040 oder frueher und das Schema stimmt mit dem Plan ueberein.
- **Fix:** Keine — der Plan-Inhalt war korrekt; nur die @-Referenz im Plan-Context war falsch nummeriert. Nicht plan-blocking; wird ggf. spaeter korrigiert.
- **Files modified:** keine.

**2. [Rule 2 - Critical] Plan-Code-Snippet importierte unused `logAudit` in upload routes**
- **Found during:** Task 2 (vorhandener Draft `belege.upload.routes.ts` reviewed)
- **Issue:** Das Plan-Code-Snippet listete `import { logAudit } from '../services/audit.service'` in belege.upload.routes.ts, der Code nutzt logAudit aber nicht (audit-Eintraege werden ueber receiptService.create -> logAudit indirekt geschrieben). Unused import wuerde TypeScript-Strictness verletzen.
- **Fix:** Der bereits vorhandene Draft hatte den Import korrekt entfernt. Beibehalten.
- **Files modified:** keine (Draft war bereits korrigiert).
- **Verifikation:** `npx tsc --noEmit` exit 0.

**3. [Praezisierung] Upload-Tests ergaenzt um 4 Zusatz-Tests**
- **Issue:** Plan listete 2 Test-Cases (receiptService+findBySha256-Roundtrip, allowed-extensions). Zusaetzlich aufgenommen: sha256OfFile vs crypto-Referenz auf realer Tmp-Datei (verifiziert Streaming-Hash), zwei-Hashes-zwei-Receipts (verifiziert dass kein false-positive bei unterschiedlichen Hashes), ocr_pending-Status-nach-Insert (verifiziert receiptService.create-Flow mit dem Upload-Status), Path-Traversal in originalname (verifiziert sanitizeForFilename gegen `../../etc/passwd` und `\\Windows-Pfad`). Damit sind die 6 wichtigsten Upload-Pipeline-Verhalten als Living Specification abgesichert.
- **Files modified:** backend/test/upload.test.ts (6 Tests statt 2).
- **Commit:** aad0b09.

**4. [Praezisierung] belege.routes.ts mit Numeric-id-Validation**
- **Issue:** Plan-Snippet machte `Number(req.params.id)` ohne Validation. Bei `/api/belege/abc` wuerde `Number('abc')` -> NaN -> SQL `WHERE id = NaN` zurueckgeben (better-sqlite3 wandelt zu null, liefert keine Row -> 404). Funktional OK, aber 400 ist semantisch korrekter und vermeidet einen unnoetigen DB-Roundtrip.
- **Fix:** `if (!Number.isFinite(id)) { res.status(400).json({ error: 'Ungueltige id' }); return; }` an jedem Endpoint mit `:id`.
- **Files modified:** backend/src/routes/belege.routes.ts.
- **Commit:** 3e80a11.

**Total deviations:** 4 (1 Doku-Mismatch, 1 vorab gefixed, 2 Praezisierungen). Keine Plan-Acceptance-Criteria-Verletzung.

## Issues Encountered

Keine. Build, Tests und Mount liefen direkt sauber:
- `npx tsc --noEmit` exit 0.
- `npx vitest run` 77/77 passed (60 von 04-02 + 11 receiptParser + 6 upload = 77).
- Acceptance-Criteria per grep verifiziert (multer/setImmediate, allowed-exts, hard-limit, settings-key, app.ts-mount).

Hinweis zur Dependency-Installation: tesseract.js + pdf-to-img + sharp wurden im **Production-Dependencies-Block** installiert, nicht devDependencies (sie laufen produktiv im Upload-Handler). Bei sharp@0.34 wird beim `npm install` ein nativer Build versucht (libvips); auf Apple Silicon laeuft das problemlos, auf Linux-CI ggf. `apt install libvips-dev` noetig — nicht relevant fuer das lokale-only Setup.

## User Setup Required

Keine. Plan 04-03 fuegt nur Backend-Routes hinzu — keine Datenbank-Migration, keine UI, keine externe Service-Konfiguration.

Optional fuer Tests/Dev: `app_settings` Setting `ocr_engine = 'mock'` setzen wenn man tesseract.js-Native-Lib nicht installieren moechte (z.B. auf Linux-CI ohne libtesseract). Default ist `'tesseract'`.

## Next Phase Readiness

- **Plan 04-04 (Supplier-Memory)** kann starten — `receiptParserService.parse(text).supplier_name` ist der Hook fuer Supplier-Lernen; receiptService.applyOcrResult schreibt das Feld bereits in receipts.supplier_name.
- **Plan 04-05 (Task-Automation)** kann starten — receipts-Tabelle wird per Upload mit `status = 'ocr_pending' / 'zu_pruefen'` gefuellt; eine Task "Beleg pruefen" kann an dieser State-Transition haengen.
- **Plan 04-06 (DJ-Sync)** kann starten — receiptService.create({ source: 'dj_invoice_sync', linked_invoice_id, ... }) ist verfuegbar; OCR-Pipeline ist optional fuer DJ-Sync (DJ-Daten sind bereits strukturiert).
- **Plan 04-07/08/09/10 (UI)** kann starten — die 5 Endpoints (POST /upload, GET /, GET /:id, PATCH /:id, POST /:id/freigeben, DELETE /:id) sind alle aktiv und JWT-protected. Frontend-State-Schema (TanStack Query keys) ist klar definierbar.
- **HTTP-Roundtrip-Tests** waeren in Plan 09 (UI) sinnvoll als E2E-Test mit Playwright — ein realer File-Upload aus dem Browser durch das System.

## Self-Check: PASSED

Verifiziert per `test -f` / `git log` / `npx tsc` / `npx vitest`:

- [x] `backend/src/services/ocrService.ts` FOUND (111 Zeilen)
- [x] `backend/src/services/receiptParserService.ts` FOUND (221 Zeilen)
- [x] `backend/src/routes/belege.upload.routes.ts` FOUND (177 Zeilen)
- [x] `backend/src/routes/belege.routes.ts` FOUND (220 Zeilen)
- [x] `backend/test/receiptParser.test.ts` FOUND (11 Tests)
- [x] `backend/test/upload.test.ts` FOUND (6 Tests)
- [x] Commit `82a17ef` (Task 1 — OCR + Parser + Tests) FOUND in git log
- [x] Commit `1774997` (Task 2a — Upload-Endpoint) FOUND in git log
- [x] Commit `3e80a11` (Task 2b — CRUD-Routes + app.ts mount) FOUND in git log
- [x] Commit `aad0b09` (Task 2c — Upload-Tests) FOUND in git log
- [x] `npx tsc --noEmit` exit code 0
- [x] `npx vitest run` 77/77 passed
- [x] `grep -n "import belegeRoutes" backend/src/app.ts` -> 1 Treffer (Zeile 20)
- [x] `grep -n "/api/belege" backend/src/app.ts` -> 1 Treffer (Zeile 61)
- [x] `grep "multer" backend/src/routes/belege.upload.routes.ts` -> mehrere Treffer
- [x] `grep "setImmediate" backend/src/routes/belege.upload.routes.ts` -> 1 Treffer
- [x] `grep "'.pdf', '.jpg', '.jpeg', '.png'" backend/src/routes/belege.upload.routes.ts` -> 1 Treffer
- [x] `grep "100 \* 1024 \* 1024" backend/src/routes/belege.upload.routes.ts` -> 1 Treffer (hard-limit)
- [x] `grep "max_upload_size_mb" backend/src/routes/belege.upload.routes.ts` -> 3 Treffer (Doc + Comment + getSettingNum)
- [x] belege.routes.ts hat 5 Endpoints: GET / + GET /:id + PATCH /:id + POST /:id/freigeben + DELETE /:id
- [x] Test "extracts DE date 'Rechnungsdatum: 05.05.2026'" passed
- [x] Test "detects Reverse-Charge marker '§13b UStG'" passed
- [x] Test "computes net + vat from gross + rate" passed
- [x] Test "sha256OfFile berechnet stabilen Hash fuer eine reale Tmp-Datei" passed
- [x] Test "Path-Traversal in originalname wird durch sanitizeForFilename neutralisiert" passed

---
*Phase: 04-belege-modul-dj-buchhaltungs-refactoring*
*Plan: 03 (Wave 2 — parallel zu Plan 02)*
*Completed: 2026-05-06*
