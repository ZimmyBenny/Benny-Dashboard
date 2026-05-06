---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
stopped_at: Completed 04-10-ui-tax-export-settings-PLAN.md (Wave 6)
last_updated: "2026-05-06T14:31:24.691Z"
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 28
  completed_plans: 26
  percent: 93
---

# Project State: Benny Dashboard

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-07)

**Core value:** Alles an einem Ort, lokal und privat — ohne Cloud-Abhängigkeiten, ohne Reibung beim täglichen Zugriff.
**Current milestone:** Milestone 1 — Foundation → Working Dashboard Shell
**Current focus:** Phase 04 — belege-modul-dj-buchhaltungs-refactoring

## Current Status

| Phase | Status |
|-------|--------|
| Phase 1: Foundation | Complete (2026-04-08) |
| Phase 2: Auth Layer | Complete (2026-04-08) |
| Phase 3: Shell + Design System | Not started |
| Phase 4: Belege-Modul + DJ-Buchhaltungs-Refactoring | Added 2026-05-05 — to be planned |

## Roadmap Evolution

- 2026-05-05 — Phase 4 hinzugefuegt: Belege-Modul + DJ-Buchhaltungs-Refactoring (zentrale `receipts`-Tabelle, GoBD, OCR via Tesseract; DJ-Buchhaltung wird Read-Only-Sicht. 13 Sub-Plaene geplant.)

## Progress

[█████████░] 86% — 24/28 plans complete

**Stopped at:** Completed 04-10-ui-tax-export-settings-PLAN.md (Wave 6)

## Decisions Made

### Phase 2

- **bcryptjs over bcrypt (native):** Use bcryptjs (pure JS) — avoids node-gyp-build failures on iCloud Drive paths. Single-user local app, 30% performance difference irrelevant. (02-01)
- **tsconfig rootDir = ".":** Changed rootDir from `./src` to `.` to include `scripts/` directory alongside `src/` without TS6059 errors. (02-01)
- **Cost factor 12 hardcoded:** bcrypt cost factor hardcoded to 12 in seed script, not read from env, to prevent weakening. (02-01)
- [Phase 02]: Rate limiter applied per-route on /login only (T-02.2-05); identical 401 for missing user and wrong password (OWASP); jwt.sign always uses explicit HS256 algorithm pin (T-02.2-02)
- [Phase 02]: algorithms: ['HS256'] as literal array in jwt.verify — never read from config to prevent weakening (02-03)
- [Phase 02]: verifyToken catch block returns generic INVALID_TOKEN; no error.message leaked to client (02-03)
- [Phase 02]: baseURL '/api' relative in axios client (not full host) — Vite proxy handles routing; enforces parity between dev and future prod (02-04)
- [Phase 02]: module-level redirecting flag in apiClient guards against 401 navigation storm from concurrent requests (02-04)
- [Phase 02]: PrivateRoute returns null (not spinner) during Zustand persist rehydration — localStorage sync means 1-frame gate with no visible flash (02-05)
- [Phase 02]: App.tsx repurposed as temp authenticated placeholder for Phase 2 UAT — Phase 3 replaces with AppShell (02-05)
- [Phase quick-260416-ndv]: COMPUTED_FIELDS_SQL als Konstante in contracts.routes.ts — nicht inline 3x wiederholt
- [Phase quick-260416-ndv]: Segment 'cancellable' WHERE-Bedingung dupliziert CASE-Ausdruck inline — SQLite erlaubt kein WHERE auf aliasierte computed columns
- [Phase 04]: Plan 04-00: Generisches audit_log via INSERT...SELECT mit NOT EXISTS-Schutz statt RENAME — idempotent + Datenverlust-sicher
- [Phase 04]: Plan 04-00: vitest@2 + pool=forks + singleFork — better-sqlite3 ist nicht worker-safe; Tests laden alle 39 Migrationen in :memory:
- [Phase 04]: Plan 04-00: audit.service.ts behaelt logAudit-Signatur identisch zu dj.audit.service — 60+ Bestandsaufrufer brauchen nur Import-Pfad-Wechsel
- [Phase 04]: Plan 04-01: Migration umbenannt von 039_belege.sql auf 040_belege.sql (Wave 0 hat 039_audit_log.sql belegt)
- [Phase 04]: Plan 04-01: Alle Geld-Felder INTEGER (Cents) — exchange_rate und overall_confidence bleiben REAL (kein Geld)
- [Phase 04]: Plan 04-01: GoBD-Trigger spaltenspezifisch — notes/tags/payment_date bleiben editierbar nach Freigabe
- [Phase 04]: Plan 04-02: lib/cents.ts als Single Source of Truth fuer Geld-Math — alle Services arbeiten ausschliesslich auf INTEGER-Cents
- [Phase 04]: Plan 04-02: vi.mock-Proxy-Pattern (dbHolder + beforeEach swap :memory:-DB) statt connection.ts-Modifikation — connection.ts bleibt produktions-fokussiert; Pattern wird in 04-03/04/05/06 wiederverwendet
- [Phase 04]: Plan 04-02: Service-Funktionen akzeptieren `req: Request | null` — null-Pfad fuer system-initiierte Mutationen (Cron, Sync) ohne Audit-User-Kontext
- [Phase 04]: Plan 04-02: KZ66 schliesst import_eust=0 aus + KZ62 erfordert input_tax_deductible=1 — verhindert Doppel-Zaehlung von EUSt-Belegen
- [Phase 04]: Plan 04-02: applyOcrResult Konfidenz-Filter nur fuer supplier_name (>0.5) — andere Felder werden uebernommen wenn !== null (User reviewed sowieso)
- [Phase 04]: Plan 04-03: tesseract.js Worker-per-Job mit `await worker.terminate()` im finally — verhindert Memory-Leak in long-running Express; pdf-to-img iteriert async, for-await-break nach Page 1 schuetzt vor PDF-Bombs
- [Phase 04]: Plan 04-03: Background-OCR via `setImmediate(async () => ...)` statt Promise — HTTP-Response ist garantiert raus bevor OCR-Worker startet; bei Fehler markOcrFailed (status zu_pruefen) statt 500
- [Phase 04]: Plan 04-03: Two-Stage-Upload-Limit — multer hard-limit 100 MB (DoS-Schutz beim Schreiben) + settings-basiertes max_upload_size_mb (Default 25, pro File nachgepruepft -> 413)
- [Phase 04]: Plan 04-03: fileFilter ueber path.extname.toLowerCase statt mime-type — robust gegen Browser-Generic-Mime und blockt .pdf.exe (extname == .exe); mime_type wird trotzdem in receipt_files persistiert fuer Audit
- [Phase 04]: Plan 04-03: Sub-Router-Mount (belege.routes.ts macht router.use('/', uploadRouter)) — Upload ist unter /api/belege/upload erreichbar OHNE separates app.use; minimiert app.ts-Aenderungen fuer Folge-Plans
- [Phase 04]: Plan 04-04: supplier_memory.supplier_normalized verwendet sanitizeForFilename(60) — derselbe Slug wie Belege-Filenames, garantiert dass Memory und Datei-Pfade synchron bleiben
- [Phase 04]: Plan 04-04: NULL-safe UPSERT mit IS-Operator (existing-Lookup matched NULLs); ORDER BY usage_count DESC, last_used DESC, id DESC — haeufigster Tripel gewinnt, bei Gleichstand juengster
- [Phase 04]: Plan 04-04: GET /supplier-suggest 404 statt 200-mit-null-Body — REST-konform, UI checkt status-Code; Endpoint MUSS vor /:id im Router stehen
- [Phase 04]: Plan 04-04: POST /:id/areas separater Endpoint mit db.transaction (DELETE+INSERT atomar) — n:m receipt_area_links bekommt eigenen Pfad; PATCH /:id bleibt schlank (nur receipts-Spalten)
- [Phase 04]: Plan 04-05: Server-Startup-Sweep statt externer Cron — fuer eine lokale-only-App ist 'naechster Server-Start' ausreichend frequent; lazy import + try/catch verhindert Crash bei Service-Failure (Threat T-04-TASK-01)
- [Phase 04]: Plan 04-05: Idempotenz via FK source_receipt_id + status != 'archived' (NICHT archived_at IS NULL — Spalte existiert nicht); status='open' und priority='medium' (NICHT 'todo'/'normal' — CHECK-Constraint-Violation gewesen)
- [Phase 04]: Plan 04-05: Echte Umlaute im UI-sichtbaren Task-Title ('Zahlung an X fällig: ...') gemaess Memory-Regel feedback_umlauts; sanitizeForFilename gilt nur fuer Datei-Pfade, nicht fuer Tasks
- [Phase 04]: Plan 04-05: POST /run-task-automation fuer manuellen Trigger; Endpoint MUSS vor /:id stehen (gleiches Pattern wie /supplier-suggest in Plan 04-04)
- [Phase 04]: Plan 04-06: Migration umbenannt von 039a auf 041_fahrten_migration.sql (Wave 0 hat 039_audit_log, Wave 1 hat 040_belege)
- [Phase 04]: Plan 04-06: djSyncService nutzt dj_payments (NICHT dj_invoice_payments wie Plan-Snippet annahm) — Plan-Code waere Runtime-Error gewesen
- [Phase 04]: Plan 04-06: Mirror-Sync-Pattern etabliert — idempotenter UPSERT auf source+linked-id mit GoBD-Lock-Awareness und Storno-Korrekturkette (corrects_receipt_id ↔ corrected_by_receipt_id)
- [Phase 04]: Plan 04-06: Cancel-Route ruft mirrorInvoiceToReceipts ZWEI mal — Original zuerst, dann Storno (sodass corrects_receipt_id-Lookup im 2. Call findet)
- [Phase 04]: Plan 04-07: formatCurrencyFromCents als UI-Boundary fuer Cents->EUR — Single Source of Truth in lib/format.ts; alle Belege-UI-Komponenten konvertieren ueber diesen Helper
- [Phase 04]: Plan 04-07: Layout-Stil DJ-Reiter (User-Vorgabe) — Glassmorphism, Ambient Glows, KPICard wiederverwendet; BelegeOverviewPage greift auf bestehendes DJ-Component-Inventar zurueck statt eigene Card-Komponenten
- [Phase 04]: Plan 04-07: Steuerzahllast-KPI conditional via ustva_zeitraum-Setting — Kleinunternehmer ohne UStVA-Pflicht sehen die Karte gar nicht; Backend liefert null, Frontend rendert nicht
- [Phase 04]: Plan 04-07: Ein /api/belege/overview-kpis-Endpoint statt 6 separate Queries — minimiert Roundtrips, aggregiert direkt in SQL; Pattern wiederverwendbar fuer kuenftige Modul-Dashboards (Amazon, Finanzen)
- [Phase 04]: Plan 04-08: Inline-PdfPreview statt Modal-PdfPreview — Split-Layout (PDF links, Daten rechts) braucht Inline-Rendering; bestehender PdfPreviewModal bleibt fuer DJ-Quotes/Invoices erhalten
- [Phase 04]: Plan 04-08: URL-Search-Params als Filter-State fuer BelegeListPage — alle Filter (area/status/type/from/to/search) in URL persistiert; deeplink-bar, browser-history-friendly, kein extra State-Management
- [Phase 04]: Plan 04-08: Korrekturbeleg-Endpoint setzt corrected_by_receipt_id auf freigegebenen Original — Spalte ist NICHT im GoBD-Trigger-Lock-WHEN-Clause (Migration 040 Zeilen 257-276), daher legal
- [Phase 04]: Plan 04-08: ReceiptsTable als wiederverwendbare Sub-Komponente in BelegeListPage exportiert (statt eigene Datei) — variant-Prop fuer Open-Payments-Spalten-Override; OpenPayments und Review nutzen identische Tabelle
- [Phase 04]: Plan 04-09: Multi-File-Tab-Pattern (key={activeId} im ReceiptEditor) statt parallel-Polling — nur aktiver Tab pollt; verhindert N parallele OCR-Polls bei vielen Files
- [Phase 04]: Plan 04-09: Lazy OCR-Prefill via prefilled-Boolean — verhindert dass Polling-Refetch (status-Wechsel ocr_pending → zu_pruefen) User-Eingaben ueberschreibt; useEffect mit [r?.id]-Dependency aus Plan-Snippet ersetzt
- [Phase 04]: Plan 04-09: Lazy Supplier-Suggest via suggestTried-String-Tracker — ein /supplier-suggest pro stabiler supplier-Eingabe (statt pro Tastendruck); Threat T-04-UI-UPLOAD-03 (Backend-Spam) defensiv mitigated
- [Phase 04]: Plan 04-09: react-dropzone@15 statt eigener HTML5-DnD — onDropRejected, accept-Map mit MIME+Extension, isDragActive for-free; ~14 KB Bundle-Cost vernachlaessigbar gegenueber ~80 Zeilen Eigenbau
- [Phase 04]: Plan 04-09: GET /api/belege/areas + /tax-categories als Read-Only-Endpoints in Plan 04-09 (statt erst Plan 04-10) — Upload-UI braucht Picker-Quelle jetzt; CRUD bleibt Plan 04-10 ohne diese Routen zu brechen
- [Phase 04]: Plan 04-10: BelegeTaxPage nutzt single-Tabelle fuer alle Period-Werte (jahr/quartal/monat) statt 3 Layouts — skaliert clean von 1 bis 12 Buckets ohne Layout-Shift; ReceiptsTable aus BelegeListPage wird im Drilldown wiederverwendet
- [Phase 04]: Plan 04-10: Settings-Bulk-PATCH-Pattern etabliert — Frontend sammelt komplettes Form-State, Backend macht UPSERT pro Key innerhalb db.transaction; logAudit pro Key (nicht pro Bulk) gibt feinen Audit-Trail
- [Phase 04]: Plan 04-10: AreaRow.onBlur statt onChange fuer Inline-Edit — verhindert PATCH-Spam pro Tastendruck (Lehre aus Plan 04-09 Lazy-Supplier-Suggest); diff-Check garantiert genau einen PATCH pro tatsaechlicher Aenderung
- [Phase 04]: Plan 04-10: CSV-Export mit UTF-8-BOM + ;-Trenner + CRLF — Excel-DE erkennt UTF-8 korrekt und erwartet ;-Trenner ohne Locale-Umschaltung; Cell-Quoting bei ;/Newline/Quote macht Export defensiv gegen Lieferantennamen mit Sonderzeichen
- [Phase 04]: Plan 04-10: DB-Backup-Endpoint POST /api/belege/db-backup nutzt createBackup-Helper aus db/backup.ts; Pfad in Response damit User sieht wo das Backup liegt; kein separates audit_log (Backup-File selbst ist der Audit-Trail)

## Open Decisions (must resolve before Milestone 2)

1. **Amazon module scope** — Purchase log, wishlist tracker, or return deadline tracker?
2. **DJ → Finance cross-module write pattern** — Dual-write in route, shared service, or manual user action?

## Critical Reminders

- SQLite DB MUST be at `~/.local/share/benny-dashboard/dashboard.db` — NOT inside iCloud Drive
- Run `npx @tailwindcss/upgrade` before writing any Tailwind component
- All Electric Noir tokens go in CSS `@theme` — never raw hex in JSX

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260410-dtr | Zeiterfassung Export CSV+PDF und Projekt-Schnellstart | 2026-04-10 | e59656f | [260410-dtr-zeiterfassung-export-csv-pdf-und-projekt](.planning/quick/260410-dtr-zeiterfassung-export-csv-pdf-und-projekt/) |
| 260410-ub6 | Aufgaben-Modul V1: Kanban-Board, CRUD-Backend, Slide-Over, Dashboard-Widget | 2026-04-10 | e176dfb | [260410-ub6-aufgaben-modul-v1-sqlite-tasks-tabelle-c](.planning/quick/260410-ub6-aufgaben-modul-v1-sqlite-tasks-tabelle-c/) |
| 260411-i4e | Arbeitsmappe V1.2: Multi-Select Anhänge + Unterseiten (eine Ebene) | 2026-04-11 | 2e1be72 | [260411-i4e-arbeitsmappe-v1-2-multi-select-anh-nge-u](.planning/quick/260411-i4e-arbeitsmappe-v1-2-multi-select-anh-nge-u/) |
| 260411-je1 | Arbeitsmappe → Aufgaben: Task-Erstellung mit source_page_id + Link zurück | 2026-04-11 | 228d406 | [260411-je1-arbeitsmappe-aufgaben-task-erstellung-mi](.planning/quick/260411-je1-arbeitsmappe-aufgaben-task-erstellung-mi/) |
| 260411-jt9 | Aufgaben-Erinnerung: ReminderPoller + ReminderPopup + reminder_at in TaskSlideOver | 2026-04-11 | cce9c05 | [260411-jt9-aufgaben-erinnerung-reminderpoller-remin](.planning/quick/260411-jt9-aufgaben-erinnerung-reminderpoller-remin/) |
| 260411-kc4 | Arbeitsmappe Export CSV+PDF mit Filter (Bereich/Seite/alles) | 2026-04-11 | 34f9206 | [260411-kc4-arbeitsmappe-export-csv-und-pdf-mit-filt](.planning/quick/260411-kc4-arbeitsmappe-export-csv-und-pdf-mit-filt/) |
| 260411-ki6 | Aufgaben-Archiv: archived-Status, Archivieren-Button (Erledigt-Tab), Archiv-Tab mit Suche | 2026-04-11 | a061c06 | [260411-ki6-aufgaben-archiv-archived-status-archivie](.planning/quick/260411-ki6-aufgaben-archiv-archived-status-archivie/) |
| 260414-chg | Fix migrate.ts PRAGMA foreign_keys außerhalb Transaktion | 2026-04-14 | 65d0801 | [260414-chg-fix-migrate-ts-pragma-foreign-keys-au-er](.planning/quick/260414-chg-fix-migrate-ts-pragma-foreign-keys-au-er/) |
| 260414-cpd | Automatisches DB-Backup vor Migrationen in migrate.ts | 2026-04-14 | 6edfe32 | [260414-cpd-automatisches-db-backup-vor-migrationen-](.planning/quick/260414-cpd-automatisches-db-backup-vor-migrationen-/) |
| 260414-cs9 | Systemweite Datensicherheit createBackup-Utility und CLAUDE.md Regel | 2026-04-14 | 690dc77 | [260414-cs9-systemweite-datensicherheit-createbackup](.planning/quick/260414-cs9-systemweite-datensicherheit-createbackup/) |
| 260414-d5g | Haushalt-Modul Gemeinsame Ausgaben Benny und Julia | 2026-04-14 | cd1eb4c | [260414-d5g-haushalt-modul-gemeinsame-ausgaben-benny](.planning/quick/260414-d5g-haushalt-modul-gemeinsame-ausgaben-benny/) |
| 260414-ug7 | DJ-Kunden-Seite: Tabelle, KPIs, Suche, Kontakt-Picker | 2026-04-14 | 24b05fd | [260414-ug7-dj-kunden-seite-implementieren-djcustome](.planning/quick/260414-ug7-dj-kunden-seite-implementieren-djcustome/) |
| 260414-ulb | DJ-Leistungen & Pakete Seite: Tabs, Tabelle, Toggle, Slide-Overs, KPIs | 2026-04-14 | 453bd71 | [260414-ulb-dj-leistungen-pakete-seite-implementiere](.planning/quick/260414-ulb-dj-leistungen-pakete-seite-implementiere/) |
| 260414-urj | DJ Events & Anfragen Seite: Liste+KPIs+Filter, Erstell-/Bearbeitungsformular, Status-Verlauf | 2026-04-14 | e943469 | [260414-urj-dj-events-anfragen-seite-implementieren](.planning/quick/260414-urj-dj-events-anfragen-seite-implementieren/) |

---
| 260414-v4b | DJ-Rechnungen: DjInvoicesPage + DjInvoiceDetailPage (GoBD, Finalisieren, Stornieren, Zahlung) | 2026-04-14 | f5a35c8 | [260414-v4b-dj-rechnungen-seite-implementieren](.planning/quick/260414-v4b-dj-rechnungen-seite-implementieren/) |
| 260414-wgb | DJ Leistungen-Seite Redesign | 2026-04-14 | 70a5caa | [260414-wgb-dj-leistungen-seite-redesignen-synthetic](.planning/quick/260414-wgb-dj-leistungen-seite-redesignen-synthetic/) |
| 260414-wmy | DJ Events-Seite Redesign | 2026-04-14 | f8c9bd8 | [260414-wmy-dj-events-seite-redesignen-synthetic-con](.planning/quick/260414-wmy-dj-events-seite-redesignen-synthetic-con/) |
| 260414-wsc | DJ Angebote-Seite Redesign | 2026-04-14 | 58432c0 | [260414-wsc-dj-angebote-seite-redesignen-synthetic-c](.planning/quick/260414-wsc-dj-angebote-seite-redesignen-synthetic-c/) |
| 260415-cni | NeueAnfrageModal: unified Create/Edit-Modal mit Venue, Gäste, Status-Dropdown, Status-Verlauf | 2026-04-15 | d0837a7 | [260415-cni-anfragen-modal-vereinheitlichen-edit-mod](.planning/quick/260415-cni-anfragen-modal-vereinheitlichen-edit-mod/) |
| 260415-cu5 | DjEventsPage Tabelle Redesign: HTML-Tabelle 7 Spalten, Inline-Status-Picker, Suchfeld | 2026-04-15 | f390c35 | [260415-cu5-djeventspage-tabelle-redesignen-neue-spa](.planning/quick/260415-cu5-djeventspage-tabelle-redesignen-neue-spa/) |
| 260415-d19 | StatusBadge LED-Glow-Dot + Kalender-Titel mit Kunde/Typ | 2026-04-15 | 71c0b82 | — |
| 260415-d3w | Datum-Kollisions-Warnung in NeueAnfrageModal | 2026-04-15 | 4c6758d | — |
| 260417-foa | 3 Fixes Angebot-Formular: Kundenanschrift mit Name, Beschreibung textarea, PDF-Preview Fehlerhandling | 2026-04-17 | 26b82db | [260417-foa-3-fixes-angebot-formular-kundenanschrift](.planning/quick/260417-foa-3-fixes-angebot-formular-kundenanschrift/) |
| 260417-fwl | 2 Features Angebot-Formular: Gesamtrabatt-Zeile (vor MwSt) + Kopftext-Reihenfolge | 2026-04-17 | 86cea1e | [260417-fwl-2-features-angebot-formular-gesamtrabatt](.planning/quick/260417-fwl-2-features-angebot-formular-gesamtrabatt/) |
| 260417-lhw | DJ Settings Firma-Formular: alle Felder editierbar + PDF-Footer sync | 2026-04-17 | caa64ac | [260417-lhw](.planning/quick/) |
| 260417-lq1 | Footer-Spalten fixieren: proportionale Breiten + kein Text-Overflow | 2026-04-17 | 1c99368 | [260417-lq1-footer-spalten-fixieren-proportionale-br](.planning/quick/260417-lq1-footer-spalten-fixieren-proportionale-br/) |
| 260417-nw6 | DJ Einstellungen: Fußzeile-Tab mit 4 editierbaren Spalten + PDF liest aus Settings | 2026-04-17 | 03cad7b | [260417-nw6-dj-einstellungen-fu-zeile-tab-mit-4-edit](.planning/quick/260417-nw6-dj-einstellungen-fu-zeile-tab-mit-4-edit/) |
| 260423-l2b | DjEventsPage: Alle kommenden als Standard-Filter + vergangene Events ausblenden | 2026-04-23 | dafff9f | [260423-l2b-djeventspage-alle-kommenden-als-standard](.planning/quick/260423-l2b-djeventspage-alle-kommenden-als-standard/) |
| 260424-rj7 | Fix timezone boundary in DjOverviewPage upcomingEvents filter | 2026-04-24 | 019a80f | [260424-rj7-fix-timezone-boundary-in-djoverviewpage-](.planning/quick/260424-rj7-fix-timezone-boundary-in-djoverviewpage-/) |
| 260424-rzd | Fix event_date Bug: Pflichtfeld-Guard + NULL-Normalisierung + bestaetigt in GET-Filter | 2026-04-24 | 2d2a188 | [260424-rzd-fix-event-date-bug-in-neueanfragemodal-u](.planning/quick/260424-rzd-fix-event-date-bug-in-neueanfragemodal-u/) |
| 260424-sjd | Kalender-Sync bei Event-Bearbeitung im NeueAnfrageModal | 2026-04-24 | 0be73a7 | [260424-sjd-kalender-eintrag-bei-event-bearbeitung-a](.planning/quick/260424-sjd-kalender-eintrag-bei-event-bearbeitung-a/) |
| 260505-u7a | Codebase-weiter Datums-Fix: lokale Zeitzone via zentraler Helper (lib/dates.ts) — fixt Muttertag-Anzeige + Edge Cases in Cron/DJ-Routes | 2026-05-05 | 668864c | [260505-u7a-dashboard-diese-woche-widget-all-day-eve](.planning/quick/260505-u7a-dashboard-diese-woche-widget-all-day-eve/) |

---
*State initialized: 2026-04-07 | Last activity: 2026-05-05 - Completed quick task 260505-u7a: Codebase-weiter Datums-Fix auf lokale Zeitzone*
| 2026-04-10 | fast | TaskCard onClick → SlideOver fix (PointerSensor distance constraint) | ✅ |
| 2026-04-10 | fast | TaskSlideOver Backdrop-Klick schließt Panel nicht mehr | ✅ |
| 2026-04-10 | 260410-v3q | Status-Notiz beim Drag (DragPrompt + DB-Migration + KanbanBoard-Pause) | ✅ |
| 2026-04-11 | 260410-wn7 | Kalender-Modul V1 — Apple Calendar Sync (JXA/AppleScript, bidirektional, Sync-Log, Kalender-Erkennung) | ✅ |
| 2026-04-11 | fast | DashboardPage: Offene Aufgaben-Zahl immer anzeigen — auch wenn 0 | ✅ |
