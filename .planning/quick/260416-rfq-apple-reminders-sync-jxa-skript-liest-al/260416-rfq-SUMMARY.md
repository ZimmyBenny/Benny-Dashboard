---
phase: quick-260416-rfq
plan: "01"
subsystem: tasks/apple-reminders
tags: [apple, reminders, jxa, kanban, sync]
dependency_graph:
  requires: []
  provides: [apple_reminders-table, reminders-sync-job, reminders-api, reminders-kanban-column]
  affects: [tasks-module, kanban-board]
tech_stack:
  added: [osascript-jxa]
  patterns: [sync-mutex, optimistic-update, hash-color-badge]
key_files:
  created:
    - backend/src/db/migrations/034_apple_reminders.sql
    - backend/src/scripts/reminders-jxa.js
    - backend/src/services/remindersSync.service.ts
    - backend/src/routes/reminders.routes.ts
    - frontend/src/api/reminders.api.ts
    - frontend/src/components/tasks/RemindersColumn.tsx
  modified:
    - backend/src/app.ts
    - backend/src/server.ts
    - frontend/src/components/tasks/KanbanBoard.tsx
decisions:
  - "JXA via osascript (nicht Swift/EventKit) — explizit vom User gewünscht, kein extra Build-Step nötig"
  - "Sync-Mutex-Pattern aus calendarSwift.service.ts 1:1 übernommen — parallele osascript-Aufrufe verhindert"
  - "POST /sync vor POST /:uid/complete registriert — verhindert Routing-Konflikt (sync als :uid)"
  - "RemindersColumn innerhalb des DndContext-flex-Containers aber ohne useDroppable/useSortable — kein Drag möglich"
  - "Stale-Cleanup per last_synced_at < syncStartTime — entfernt in Apple gelöschte Einträge nach jedem Sync"
metrics:
  duration: "~20 min"
  completed_date: "2026-04-16"
  tasks_completed: 2
  files_changed: 9
---

# Phase quick-260416-rfq Plan 01: Apple Reminders Sync Summary

**One-liner:** JXA-Bridge liest alle offenen Apple Reminders in SQLite (5min-Sync), REST-API + 5. Kanban-Spalte mit deterministischen Listen-Badges und optimistischem Erledigt-Button.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Backend — Migration, JXA-Skript, Service + Route | 3d8a11d | 034_apple_reminders.sql, reminders-jxa.js, remindersSync.service.ts, reminders.routes.ts, app.ts, server.ts |
| 2 | Frontend — API-Client, RemindersColumn, KanbanBoard-Integration | 3d8a11d | reminders.api.ts, RemindersColumn.tsx, KanbanBoard.tsx |

## What Was Built

### Backend

**Migration `034_apple_reminders.sql`:** Tabelle `apple_reminders` mit `apple_uid UNIQUE` als Deduplizierungs-Key, 3 Indizes (completed, list_name, due_date). Kein `PRAGMA foreign_keys` (zentral gesteuert).

**JXA-Skript `reminders-jxa.js`:** Zwei Modi — ohne Args: gibt alle nicht-erledigten Reminders aus allen Listen als JSON-Array zurück (`id`, `title`, `listName`, `dueDate`, `reminderDate`, `notes`). Mit `complete <uid>`: iteriert über alle Listen, setzt `completed = true` für die Erinnerung mit der passenden ID.

**Service `remindersSync.service.ts`:**
- `syncReminders()`: Sync-Mutex-Guard → JXA aufrufen → Transaktion mit UPSERT per `apple_uid` → Stale-Cleanup (DELETE WHERE last_synced_at < syncStartTime) → Logging
- `markReminderCompleted(uid)`: JXA complete-Modus → bei Erfolg lokal aus DB löschen
- Alle öffentlichen Funktionen vollständig typisiert, keine `any`-Leaks

**Route `reminders.routes.ts`:**
- `GET /api/reminders` — offene Reminders sortiert (due_date ASC, NULL zuletzt, dann alphabetisch)
- `POST /api/reminders/:uid/complete` — markiert in Apple + entfernt lokal
- `POST /api/reminders/sync` — manueller Sync-Auslöser (für UAT/Debug)
- Routing-Reihenfolge: `/sync` vor `/:uid/complete` (verhindert Konflikt)

**`app.ts`:** `app.use('/api/reminders', remindersRoutes)` hinter `verifyToken`-Guard ergänzt.

**`server.ts`:** Lazy import von `remindersSync.service` → `setTimeout(5s)` + `setInterval(5min)` nach dem Calendar-Sync-Block eingefügt.

### Frontend

**`reminders.api.ts`:** `fetchReminders()`, `completeReminder(uid)`, `triggerRemindersSync()` mit `AppleReminder`-Interface.

**`RemindersColumn.tsx`:** Eigenständige Spalte im Electric-Noir-Design (gleiche Tokens wie KanbanColumn). Header: `phone_iphone`-Icon (Material Symbols, color: `var(--color-primary)`), Titel "Erinnerungen", Count-Badge. Pro Karte: Titel (fontWeight 600), farbiger Listen-Badge (deterministischer HSL-Hash), optionales Fälligkeitsdatum (DD.MM.YYYY, manuell formatiert), `check_circle`-Button mit Hover-Effekt und optimistischem State-Update + Rollback bei Fehler. Kein `useSortable`, kein DnD.

**`KanbanBoard.tsx`:** `<RemindersColumn />` als 5. Spalte direkt nach dem `COLUMNS.map(...)` Block, innerhalb des flex-Containers — Geschwister der 4 Kanban-Spalten, außerhalb jeglicher Drop-Zone-Logik.

## Decisions Made

1. **JXA statt Swift/EventKit** — kein Build-Step, explizit vom User gewünscht. Pattern (`execFile` + JSON + Mutex) aus `calendarSwift.service.ts` übernommen.
2. **Routing-Reihenfolge** — `POST /sync` vor `POST /:uid/complete` registriert, damit "sync" nicht als `:uid` matcht.
3. **Stale-Cleanup via `last_synced_at`** — in Apple gelöschte Reminders verschwinden nach dem nächsten Sync, ohne dass ein separater "delete"-Modus im JXA nötig ist.
4. **Optimistisches Update in RemindersColumn** — Karte verschwindet sofort, Rollback + `window.alert` bei Fehler.
5. **`formatDueDate` manuell** — kein `toLocaleDateString('de-DE')` um Browser-Locale-Inkonsistenzen zu vermeiden.

## Deviations from Plan

None — Plan executed exactly as written.

## Known Stubs

None — alle Daten kommen aus der DB (via syncReminders) und werden live in der Spalte angezeigt.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new-api-endpoint | backend/src/routes/reminders.routes.ts | 3 neue Endpunkte hinter verifyToken — kein öffentlicher Zugriff möglich |

## Self-Check: PASSED

- `backend/src/db/migrations/034_apple_reminders.sql` — FOUND
- `backend/src/scripts/reminders-jxa.js` — FOUND
- `backend/src/services/remindersSync.service.ts` — FOUND
- `backend/src/routes/reminders.routes.ts` — FOUND
- `frontend/src/api/reminders.api.ts` — FOUND
- `frontend/src/components/tasks/RemindersColumn.tsx` — FOUND
- Commit `3d8a11d` — FOUND
- `npx tsc --noEmit` backend: 0 errors
- `npx tsc --noEmit` frontend: 0 errors
