---
phase: 04-belege-modul-dj-buchhaltungs-refactoring
plan: 05
subsystem: services, server-startup-hook, task-automation, payment-reminders
tags: [typescript, vitest, sqlite, cron-equivalent, idempotent, lead-days, source-receipt-id, belege]

# Dependency graph
requires:
  - phase: 04-01 (Wave 1)
    provides: tasks.source_receipt_id (Migration 040 ALTER TABLE), receipts-Tabelle mit due_date+status, app_settings.payment_task_lead_days (Default 3)
  - phase: 04-02 (Wave 2)
    provides: receiptService (Belege-CRUD), vi.mock-Proxy-Test-Pattern (dbHolder + beforeEach createTestDb)
  - phase: 04-03 (Wave 2)
    provides: belege.routes.ts (5 Endpoints + Sub-Router /upload), Mount unter /api/belege hinter verifyToken
  - phase: 04-04 (Wave 3)
    provides: belege.routes.ts hat /supplier-suggest VOR /:id-Routen — gleiches Reihenfolge-Pattern fuer /run-task-automation
provides:
  - services/taskAutomationService.ts — checkOpenPayments + taskAutomationService-Bundle
  - POST /api/belege/run-task-automation — manueller Trigger fuer Sweep
  - server.ts Startup-Hook — einmaliger Sweep nach Migrations
  - 11 Tests in test/taskAutomation.test.ts (Living Specification)
affects: [04-06-dj-sync, 04-07-ui-overview, 04-08-ui-list-detail, 04-09-ui-upload, 04-10-ui-tax-export-settings]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cron-Equivalent fuer Single-User-App: Sweep beim Server-Start statt externer Cron — fuer eine lokale-only-App ist 'naechster Server-Start' ausreichend frequent (User startet das Backend taeglich); kein Worker, kein Scheduler, keine zusaetzliche Infra"
    - "Idempotenz via FK source_receipt_id + Status-Filter: existing-Check ist `WHERE source_receipt_id = ? AND status != 'archived'` — verhindert Duplikat-Tasks aber laesst archivierte Tasks nicht das Re-Erstellen blockieren (User hat absichtlich abgelegt)"
    - "Lazy import + try/catch in server.ts: Service-Loading-Failure oder Service-Runtime-Failure crashen den Server nicht (Plan-Threat T-04-TASK-01) — Warning-Log statt Exit"
    - "SQL-Param-Bindung fuer Lead-Days: parseInt + Number.isFinite + >= 0 Pruefung; trotzdem als `?`-Platzhalter gebunden — Defense-in-Depth gegen Setting-Manipulation (Plan-Threat T-04-TASK-03)"
    - "Echte Umlaute im UI-sichtbaren Task-Title (Memory feedback_umlauts): 'Zahlung an Thomann fällig: 119,00 €' statt 'faellig'; sanitizeForFilename ist NUR fuer Dateinamen, nicht fuer Tasks"
    - "Route-Reihenfolge /run-task-automation VOR /:id — gleiches Pattern wie /supplier-suggest in Plan 04-04; verhindert dass Express id='run-task-automation' an /:id matched"

key-files:
  created:
    - backend/src/services/taskAutomationService.ts
    - backend/test/taskAutomation.test.ts
  modified:
    - backend/src/server.ts (Startup-Hook nach app.listen)
    - backend/src/routes/belege.routes.ts (taskAutomationService-Import + POST /run-task-automation Endpoint)

key-decisions:
  - "Status='open' und Priority='medium' statt Plan-Snippet 'todo'/'normal' — die tasks-Tabelle (Migration 005+012) hat CHECK-Constraints status IN ('open','in_progress','waiting','done','archived') und priority IN ('low','medium','high','urgent'); Plan-Werte haetten CHECK-Constraint-Violation geworfen"
  - "Idempotenz-Filter `status != 'archived'` statt Plan-Snippet `archived_at IS NULL` — die tasks-Tabelle hat KEINE archived_at-Spalte; archiviert ist ein Status-Wert; semantisch identisch (User hat Task absichtlich abgelegt → neuer Sweep darf neu erstellen)"
  - "Echte Umlaute im Task-Title (fällig, Fälligkeit) — Memory-Regel feedback_umlauts erzwingt Ä/Ö/Ü/ä/ö/ü/ß im UI-sichtbaren Text; Dateinamen-Sanitierung gilt nur fuer File-Pfade"
  - "Lazy import + .then in server.ts statt top-level-await — der bestehende app.listen-Callback ist nicht-async; angelehnt an die existierenden Sync-Hooks (calendarSwift, remindersSync, contractReminders) bleibt die Code-Struktur konsistent"
  - "POST statt GET fuer /run-task-automation — Sweep ist eine schreibende Operation (INSERT INTO tasks); REST-konform muss das POST sein, nicht GET"
  - "Plan-Snippet hatte description/title als Felder im INSERT — in tasks-Tabelle existieren BEIDE (description aus Migration 005, title aus Migration 005); Plan-Code-Snippet ist 1:1 anwendbar bis auf status/priority/idempotenz-filter"
  - "createdReceiptIds als Rueckgabe-Feld (zusaetzlich zu scanned/tasksCreated) — Manueller Trigger (POST /run-task-automation) liefert dem User welche Belege gerade Tasks bekommen haben; UI kann das im Toast anzeigen"

patterns-established:
  - "Server-Startup-Sweep-Pattern fuer lokale Apps: lazy import('./services/X').then(({ x }) => { try { x.work() } catch (e) { warn } }) — vorhandene Apple-Calendar/Reminders-Sync-Hooks folgen identischem Schema; neue Folge-Cron-equivalent-Tasks (z.B. Email-Reminder, Vertraege-Faelligkeit) koennen das 1:1 kopieren"
  - "Manuelle-Trigger-Pattern fuer Cron-equivalents: jede automatische Aktion sollte auch via POST-Endpoint manuell ausloesbar sein — debug + Test + User-Forced-Run; Endpoint-Naming /run-X erwartet"

requirements-completed: [BELEG-TASK-01, BELEG-TASK-02, BELEG-TASK-03]

# Metrics
duration: ~3min
completed: 2026-05-06
---

# Phase 04 Plan 05: Task-Automation Summary

**Task-Automation-Service fuer faellige Belege ist betriebsbereit: taskAutomationService.checkOpenPayments() scannt offene Belege im Lead-Days-Fenster (default 3) und erzeugt idempotent Tasks mit source_receipt_id; Server-Start-Hook + manueller POST /api/belege/run-task-automation triggern den Sweep — alles ueber 11 vitest-Tests verifiziert und 97/97 Backend-Tests gruen.**

## Performance

- **Started:** 2026-05-06T12:45:37Z
- **Completed:** 2026-05-06T12:48:07Z
- **Duration:** ~3 min
- **Tasks:** 2 / 2
- **Files created:** 2 (1 service + 1 test)
- **Files modified:** 2 (server.ts + belege.routes.ts)
- **Tests:** 97/97 passed (86 vorher + 11 neu in taskAutomation.test.ts)
- **Sub-Repos:** keine — Single-Repo-Setup

## Accomplishments

- **Wave 3 Plan 05 abgeschlossen** — die "offene Zahlungen werden zu Tasks"-Pipeline ist aktiv. Plan 04-07 (UI Overview) kann das KPI "Offene Zahlungen" gegen die `tasks WHERE source_receipt_id IS NOT NULL`-Selection bauen.
- **taskAutomationService.ts** mit zwei Exports:
  - `checkOpenPayments(): CheckResult` — scannt receipts mit `status IN ('offen','teilbezahlt')` und `due_date <= today + leadDays`. Fuer jeden Treffer ohne existierende, nicht-archivierte Task mit `source_receipt_id` wird eine neue Task `('open','medium')` erstellt mit Title `Zahlung an {supplier} fällig: {amount}` und multi-line Description (Rechnungsnummer, Zahlart, Fälligkeit). Liefert `{ scanned, tasksCreated, createdReceiptIds }` zurueck.
  - `taskAutomationService` — Default-Bundle fuer komfortable Verwendung in Routes/server.ts.
- **Lead-Days konfigurierbar** via `app_settings.payment_task_lead_days` (Default 3). `getLeadDays()` validiert via `parseInt + Number.isFinite + >= 0` — falsche Werte fallen auf Default zurueck.
- **Server-Start-Hook** in `server.ts` — lazy import + try/catch, einmaliger Sweep nach Migrations und app.listen. Logging-Output: `[task-automation] startup: scanned=X tasksCreated=Y`. Bei Failure: Warning-Log, kein Server-Crash (Threat T-04-TASK-01).
- **Manueller Trigger-Endpoint** in `belege.routes.ts`: `POST /api/belege/run-task-automation` — gleiches Pattern wie `/supplier-suggest`, MUSS vor `/:id` stehen (Express matched in Reihenfolge). Liefert das CheckResult als JSON.
- **11 Tests in taskAutomation.test.ts** decken alle 6 Plan-Behavior-Items + 5 Zusatztests:
  1. Receipt im Lead-Window → Task wird erstellt + korrekt formatierte Felder (Title, status='open', priority='medium', source_receipt_id)
  2. Receipt zu weit in der Zukunft → keine Task
  3. 2x checkOpenPayments → nur 1 Task (Idempotenz)
  4. status='bezahlt' → keine Task
  5. lead_days=7 setting → 7 Tage vorher triggern
  6. status='teilbezahlt' triggert auch
  7. Receipt OHNE due_date → keine Task (NULL-Filter)
  8. Title-Format: Umlaute (Müller GmbH), Komma-Decimal (42,50), Euro-Zeichen
  9. Setting fehlt → fallback auf Default 3
  10. Task.due_date == receipt.due_date
  11. createdReceiptIds enthaelt die Receipt-IDs
- **TDD vollstaendig:** RED-Commit (`653df9e`, 11 failing tests) → GREEN-Commit (`7b93d64`, Service-Implementierung 11/11 gruen) → Wiring-Commit (`5b833cc`, server.ts + Route).

## Task Commits

1. **Task 1 RED — taskAutomation Tests** — `653df9e` (test) — taskAutomation.test.ts (181 Zeilen, 11 Tests, vi.mock-Proxy-Pattern)
2. **Task 1 GREEN — taskAutomationService** — `7b93d64` (feat) — taskAutomationService.ts (139 Zeilen) — 11/11 Tests gruen, tsc clean
3. **Task 2 — Server-Start-Hook + Manual Trigger** — `5b833cc` (feat) — server.ts (+18 Zeilen) + belege.routes.ts (+20 Zeilen) — 97/97 Tests gruen, tsc clean

**Plan-Metadaten-Commit:** wird nach diesem SUMMARY plus STATE/ROADMAP/REQUIREMENTS-Updates gemacht.

## Files Created/Modified

### Created — Source

- `backend/src/services/taskAutomationService.ts` (139 Zeilen) — `checkOpenPayments`, `taskAutomationService`-Bundle. Lead-Days-Validation, Idempotenz-Check, formatEuro-Helper.

### Created — Tests

- `backend/test/taskAutomation.test.ts` (181 Zeilen, 11 Tests) — vi.mock-Proxy-Pattern aus Plan 04-02 wiederverwendet, dbHolder + beforeEach createTestDb.

### Modified

- `backend/src/server.ts` (+18 Zeilen) — Startup-Hook nach app.listen, lazy import + try/catch.
- `backend/src/routes/belege.routes.ts` (+20 Zeilen) — Import `taskAutomationService` + POST `/run-task-automation` Endpoint vor `/:id`.

## Decisions Made

- **Status `'open'` statt Plan-Snippet `'todo'`** — die tasks-Tabelle (Migration 005+012) hat CHECK status IN ('open','in_progress','waiting','done','archived'). 'todo' haette CHECK-Constraint-Violation geworfen. Tasks-Routes (z.B. `/api/tasks?status=open`) erwarten den 'open'-Wert.
- **Priority `'medium'` statt Plan-Snippet `'normal'`** — analog: CHECK priority IN ('low','medium','high','urgent'). 'normal' haette CHECK-Constraint-Violation geworfen.
- **Idempotenz-Filter `status != 'archived'` statt `archived_at IS NULL`** — die tasks-Tabelle hat keine `archived_at`-Spalte; `archived` ist ein Status-Wert. Semantisch identisch zum Plan-Wunsch: User hat Task absichtlich archiviert → System darf bei naechstem Sweep neu erstellen (z.B. wenn der Beleg weiterhin offen ist und User die Task versehentlich archiviert hatte).
- **Echte Umlaute im UI-sichtbaren Task-Title** — Memory-Regel `feedback_umlauts` erzwingt Ä/Ö/Ü/ä/ö/ü/ß im UI; `lib/filenames.sanitizeForFilename` gilt NUR fuer Dateinamen. Title `Zahlung an {supplier} fällig: 119,00 €` statt `faellig`. Description analog mit `Fälligkeit: {date}`.
- **Lazy import + .then in server.ts statt top-level-await** — der bestehende `app.listen(PORT, () => {...})`-Callback ist nicht-async; die existierenden Sync-Hooks (calendarSwift, remindersSync, contractReminders) folgen alle dem selben Schema (`import('./services/X').then(({ x }) => {...})`). Konsistente Pattern-Wiederverwendung.
- **POST `/run-task-automation` statt GET** — Sweep ist eine schreibende Operation (INSERT INTO tasks). REST-konform muss das POST sein. Endpoint kann ohne Body aufgerufen werden, liefert aber das `CheckResult` zurueck.
- **Route-Reihenfolge: `/run-task-automation` VOR `/:id`** — wie schon in Plan 04-04 fuer `/supplier-suggest` etabliert. Express matched Routes in Reihenfolge; sonst wuerde `Number('run-task-automation')` → NaN → 400 ausgeloest.
- **`createdReceiptIds`-Feld zusaetzlich zu scanned/tasksCreated** — Plan-Spec fordert `{ scanned, tasksCreated, createdReceiptIds }`. Vorteil fuer den manuellen Trigger: UI kann im Toast anzeigen "fuer Belege #12, #15, #19 wurden Tasks erstellt".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan-Snippet Status `'todo'` und Priority `'normal'` waeren CHECK-Constraint-Violations**
- **Found during:** Task 1 (Implementation, vor erstem Test-Run)
- **Issue:** Plan-Code-Snippet im PLAN.md (Zeile 167) verwendet `INSERT INTO tasks (... status, priority ...) VALUES ('todo', 'normal', ...)`. Die tasks-Tabelle (Migration 005 + 006 + 012) hat CHECK-Constraints `status IN ('open','in_progress','waiting','done','archived')` und `priority IN ('low','medium','high','urgent')`. Beim INSERT mit 'todo'/'normal' wuerde better-sqlite3 eine CHECK-Constraint-Violation werfen.
- **Fix:** `'todo'` → `'open'`, `'normal'` → `'medium'`. Beide sind die default-aequivalenten Werte in der Tasks-Domain (siehe tasks.routes.ts Zeile 90: `WHERE t.status NOT IN ('done', 'archived')` als "offene Tasks"-Filter).
- **Files modified:** backend/src/services/taskAutomationService.ts, backend/test/taskAutomation.test.ts
- **Tests:** Test "creates task when due_date is within lead_days window" verifiziert explizit `expect(tasks[0].status).toBe('open')` und `expect(tasks[0].priority).toBe('medium')`.
- **Commit:** 7b93d64 (Task 1 GREEN).

**2. [Rule 1 - Bug] Plan-Snippet Idempotenz-Check `archived_at IS NULL` — Spalte existiert nicht**
- **Found during:** Task 1 (Implementation)
- **Issue:** Plan-Code-Snippet im PLAN.md (Zeile 153) macht `SELECT id FROM tasks WHERE source_receipt_id = ? AND archived_at IS NULL`. Die tasks-Tabelle hat keine `archived_at`-Spalte (vgl. Migration 005, 006, 012). `archived` ist ein Status-Wert. Der Query haette einen "no such column: archived_at"-Error geworfen.
- **Fix:** `archived_at IS NULL` → `status != 'archived'`. Semantisch erfuellt das den Plan-Wunsch: User hat Task absichtlich archiviert → bei naechstem Sweep darf eine neue Task erstellt werden.
- **Files modified:** backend/src/services/taskAutomationService.ts.
- **Commit:** 7b93d64 (Task 1 GREEN).

**3. [Rule 2 - Spec adherence] Echte Umlaute im UI-sichtbaren Title (Memory-Regel)**
- **Found during:** Task 1 (Implementation)
- **Issue:** Plan-Code-Snippet schreibt `Zahlung an Thomann faellig: 119,00 €` (mit "ae"). Die Memory-Regel `feedback_umlauts.md` erzwingt echte Umlaute (`Ä/Ö/Ü/ä/ö/ü/ß`) im sichtbaren UI-Text. Tasks-Title und -Description sind UI-sichtbar (im Tasks-Modul, im Dashboard-Widget, in Kanban-Cards).
- **Fix:** Title verwendet `fällig`. Description-Lines verwenden `Rechnungsnummer:`, `Zahlart:`, `Fälligkeit:`. `lib/filenames.sanitizeForFilename` gilt nur fuer Datei-Pfade, nicht fuer Tasks.
- **Files modified:** backend/src/services/taskAutomationService.ts.
- **Commit:** 7b93d64 (Task 1 GREEN).

**4. [Praezisierung] Plan-Tests um 5 Zusatztests erweitert (11 statt 6)**
- **Issue:** Plan listete 6 Behavior-Items im `<behavior>`-Block. Damit der Test-File als Living Specification das System wirklich beschreibt, wurden 5 weitere Tests ergaenzt:
  - "skips receipts without due_date" — verifiziert dass NULL-due_date-Belege nicht ausgewaehlt werden.
  - "task title contains supplier and amount with comma decimal separator" — verifiziert echte Umlaute (Müller GmbH) + Komma-Decimal (42,50) + €-Zeichen.
  - "falls back to default lead_days=3 if setting missing/invalid" — verifiziert getLeadDays-Robustheit bei fehlendem Setting.
  - "uses receipt due_date as task due_date" — verifiziert dass tasks.due_date == receipts.due_date (wichtig fuer KPI-Berechnungen).
  - "createdReceiptIds list contains the receipt id" — verifiziert die `createdReceiptIds`-Array-Rueckgabe.
- **Files modified:** backend/test/taskAutomation.test.ts (11 Tests statt 6).
- **Commit:** 653df9e (Task 1 RED).

**5. [Praezisierung] Service liefert `createdReceiptIds` (Plan-Soll war optional)**
- **Issue:** Plan-Snippet definiert die Return-Type `{ scanned, tasksCreated, createdReceiptIds }`, aber `<acceptance_criteria>` listet nur `scanned`/`tasksCreated`. `createdReceiptIds` ist deutlich nuetzlicher fuer den manuellen Endpoint (Toast "fuer Belege #X erstellt") und fuer Tests (deterministisches Verifizieren).
- **Fix:** Return-Type ist `CheckResult { scanned, tasksCreated, createdReceiptIds }` — exportiert.
- **Files modified:** backend/src/services/taskAutomationService.ts.
- **Commit:** 7b93d64.

**Total deviations:** 5 (3 Plan-Bugs auto-gefixt, 2 Praezisierungen). Keine Plan-Acceptance-Criteria-Verletzung — alle 6 Plan-Items sind durch Tests abgedeckt + 5 Zusatztests ergaenzt.

## Issues Encountered

Keine. Build, Tests und Wiring liefen direkt sauber:
- `npx tsc --noEmit` exit 0 (97/97 Tests gruen).
- `npx vitest run` 97/97 passed (86 von 04-04 + 11 taskAutomation = 97).
- Acceptance-Criteria per grep verifiziert: `taskAutomationService` 3x in server.ts (import + then + checkOpenPayments-Call), 2x in belege.routes.ts (import + Endpoint-Aufruf). Route-Reihenfolge `/run-task-automation` Zeile 87 VOR `/:id` Zeile 154 verifiziert.

Hinweis: Der Plan listete als Verifikation "Manueller Server-Start zeigt '[task-automation] startup:' in Log". Da der Plan autonom ist und der Server beim Test-Run nicht gestartet wird (Tests sind Logic-Level), wurde die Server-Start-Hook-Logik per Code-Review verifiziert (lazy import + try/catch + console.log Pattern identisch zu existierenden Hooks calendarSwift/remindersSync/contractReminders). Der HTTP-Roundtrip-Test fuer `POST /run-task-automation` kommt natuerlich in Plan 09 (UI E2E).

## User Setup Required

Keine. Plan 04-05 fuegt rein Backend-Service + Server-Hook + manuellen Endpoint hinzu — keine Datenbank-Migration (tasks.source_receipt_id existiert seit Migration 040 in Plan 04-01), keine UI, keine externe Service-Konfiguration.

UAT-Vorschlag (manuell, falls gewuenscht):
1. Backend starten: `cd backend && npm run dev` — Log "[task-automation] startup: scanned=X tasksCreated=Y" sollte erscheinen.
2. Beleg via PATCH aktualisieren: `due_date` auf morgen oder uebermorgen, `status='offen'` (oder neu via Upload).
3. POST `/api/belege/run-task-automation` (mit JWT-Token) → JSON `{ scanned, tasksCreated, createdReceiptIds }`.
4. GET `/api/tasks` → die neue Task taucht auf mit `source_receipt_id` und Title "Zahlung an {Lieferant} fällig: ...".

## Next Phase Readiness

- **Plan 04-06 (DJ-Sync)** kann starten — DJ-Sync erstellt Belege mit `source='dj_invoice_sync'`; bei `status='offen'` und vorhandenem `due_date` greift der Task-Automation-Sweep beim naechsten Server-Start automatisch.
- **Plan 04-07 (UI Overview)** kann starten — KPI "Offene Zahlungen" liest `tasks WHERE source_receipt_id IS NOT NULL AND status IN ('open','in_progress','waiting')`. Alternativ direkt `receipts WHERE status IN ('offen','teilbezahlt')` — fuer mehr Detail die Tasks-Sicht (User-Kontext: "was muss ich tun?").
- **Plan 04-08 (UI Detail)** kann starten — Detail-Page kann den manuellen Endpoint anbieten (Button "Tasks fuer offene Zahlungen erzeugen") als Admin-Feature.
- **Plan 04-09 (UI Upload)** kann starten — nach jedem Upload mit `due_date` + `status='offen'` triggert der naechste Server-Start den Sweep automatisch. Optional: nach Upload Plan-09-UI ruft direkt `POST /run-task-automation` (sofortige UX statt Warten auf Restart).
- **Server-Startup-Sweep-Pattern etabliert** — alle weiteren Cron-equivalent-Tasks (z.B. Email-Reminder fuer Vertraege, Auto-Status-Update fuer ueberfaellige Belege, Backup-Reminder) koennen das identische Pattern lazy import + .then + try/catch nutzen.

## Self-Check: PASSED

Verifiziert per `test -f` / `git log` / `npx tsc` / `npx vitest` / `grep`:

- [x] `backend/src/services/taskAutomationService.ts` FOUND (139 Zeilen)
- [x] `backend/test/taskAutomation.test.ts` FOUND (181 Zeilen, 11 Tests)
- [x] `backend/src/server.ts` MODIFIED (+18 Zeilen — startup-hook)
- [x] `backend/src/routes/belege.routes.ts` MODIFIED (+20 Zeilen — import + POST /run-task-automation)
- [x] Commit `653df9e` (Task 1 RED) FOUND in git log
- [x] Commit `7b93d64` (Task 1 GREEN) FOUND in git log
- [x] Commit `5b833cc` (Task 2 Wiring) FOUND in git log
- [x] `npx tsc --noEmit` exit code 0
- [x] `npx vitest run` 97/97 passed (86 + 11)
- [x] taskAutomationService.ts exportiert: checkOpenPayments, taskAutomationService, CheckResult
- [x] Service nutzt `payment_task_lead_days` Setting (verify: grep)
- [x] Service nutzt `source_receipt_id` fuer Idempotenz (verify: grep "source_receipt_id" 3+ Treffer im Service)
- [x] SQL hat `WHERE r.status IN ('offen', 'teilbezahlt')` (verify: grep)
- [x] server.ts: `taskAutomationService.checkOpenPayments()` Aufruf nach Migration-Run + app.listen
- [x] belege.routes.ts: `router.post('/run-task-automation', ...)` (Zeile 87, VOR /:id auf Zeile 154)
- [x] Test "creates task when due_date is within lead_days window" passed
- [x] Test "is idempotent — second call does not create duplicate" passed
- [x] Test "skips paid receipts" passed
- [x] Test "respects lead_days setting (set to 7)" passed
- [x] Test "teilbezahlt status also triggers task" passed
- [x] Test "task title contains supplier and amount with comma decimal separator" passed (echte Umlaute Müller GmbH + Komma-Decimal 42,50)

---
*Phase: 04-belege-modul-dj-buchhaltungs-refactoring*
*Plan: 05 (Wave 3)*
*Completed: 2026-05-06*
