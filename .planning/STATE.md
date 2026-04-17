---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
stopped_at: Completed quick/260417-dm2
last_updated: "2026-04-17T07:56:30.227Z"
progress:
  total_phases: 3
  completed_phases: 3
  total_plans: 15
  completed_plans: 15
  percent: 100
---

# Project State: Benny Dashboard

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-07)

**Core value:** Alles an einem Ort, lokal und privat — ohne Cloud-Abhängigkeiten, ohne Reibung beim täglichen Zugriff.
**Current milestone:** Milestone 1 — Foundation → Working Dashboard Shell
**Current focus:** Phase 3 — Shell + Design System

## Current Status

| Phase | Status |
|-------|--------|
| Phase 1: Foundation | Complete (2026-04-08) |
| Phase 2: Auth Layer | Complete (2026-04-08) |
| Phase 3: Shell + Design System | Not started |

## Progress

[██████░░░░] 60% — 6/10 plans complete

**Stopped at:** Completed quick/260417-dm2

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
- [Phase quick-260416-uyy]: LIST_PRIORITY als Modul-Konstante mit Unicode-Escapes — verhindert Encoding-Probleme auf iCloud Drive Pfad
- [Phase quick-260416-uyy]: collapsed[name] === undefined = aufgeklappt — kein separater Default-State; isSearching ignoriert Collapse nur in Anzeige ohne State-Reset

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
| 260416-uku | Sync-Button und Suche für Erinnerungen-Spalte in der Aufgaben-Seite | 2026-04-16 | 45510b3 | [260416-uku-sync-button-und-suche-f-r-erinnerungen-s](.planning/quick/260416-uku-sync-button-und-suche-f-r-erinnerungen-s/) |
| 260416-uyy | Erinnerungen-Spalte: Gruppierung nach Liste (faltbar) + Notizen anzeigen | 2026-04-16 | 6b96ca4 | [260416-uyy-erinnerungen-spalte-gruppierung-nach-lis](.planning/quick/260416-uyy-erinnerungen-spalte-gruppierung-nach-lis/) |

---
*State initialized: 2026-04-07 | Last activity: 2026-04-16 - Completed quick task 260416-uyy: Erinnerungen-Spalte Gruppierung nach Liste + Notizen*
| 2026-04-10 | fast | TaskCard onClick → SlideOver fix (PointerSensor distance constraint) | ✅ |
| 2026-04-10 | fast | TaskSlideOver Backdrop-Klick schließt Panel nicht mehr | ✅ |
| 2026-04-10 | 260410-v3q | Status-Notiz beim Drag (DragPrompt + DB-Migration + KanbanBoard-Pause) | ✅ |
| 2026-04-11 | 260410-wn7 | Kalender-Modul V1 — Apple Calendar Sync (JXA/AppleScript, bidirektional, Sync-Log, Kalender-Erkennung) | ✅ |
| 2026-04-11 | fast | DashboardPage: Offene Aufgaben-Zahl immer anzeigen — auch wenn 0 | ✅ |
