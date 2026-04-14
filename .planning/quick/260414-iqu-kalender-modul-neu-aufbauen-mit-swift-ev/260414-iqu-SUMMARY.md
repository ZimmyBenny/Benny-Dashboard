---
id: 260414-iqu
slug: kalender-modul-neu-aufbauen-mit-swift-ev
phase: quick
completed: "2026-04-14"
duration_min: ~35
tasks_completed: 8
tasks_total: 8
commits:
  - 176cad0
  - d78368f
  - f49770b
  - 3f1682c
  - ded1484
  - c903e76
  - 663763c
  - b8485e3
key_files_created:
  - backend/src/scripts/cal-tool.swift
  - backend/src/scripts/build-cal-tool.sh
  - backend/src/db/migrations/025_calendar_v2.sql
  - backend/src/services/calendarSwift.service.ts
key_files_modified:
  - backend/src/routes/calendar.routes.ts
  - backend/src/server.ts
  - frontend/src/api/calendar.api.ts
  - frontend/src/pages/CalendarPage.tsx
  - .gitignore
key_files_deleted:
  - backend/src/scripts/cal-create.applescript
  - backend/src/scripts/cal-delete.applescript
  - backend/src/scripts/cal-list-calendars.applescript
  - backend/src/scripts/cal-read.applescript
  - backend/src/scripts/cal-update.applescript
  - backend/src/services/calendarSync.service.ts
tech_added:
  - Swift EventKit CLI (native macOS binary, no external deps)
  - calendar_sync_ranges table (5-min range cache)
  - calendars table (EKCalendar identifier as PK)
decisions:
  - Swift binary over AppleScript: 1-2s vs 90s sync time
  - 5-min sync-range cache to avoid redundant EventKit calls
  - DELETE route now takes apple_uid string (not integer DB id)
  - Old tables kept (no DROP) for safe incremental migration
---

# Quick Task 260414-iqu: Kalender-Modul neu aufbauen mit Swift EventKit — Summary

**One-liner:** Kalender-Backend komplett von AppleScript (~90s) auf natives Swift EventKit Binary (~1-2s) umgestellt, mit neuer Monatsansicht + Tag-SlideOver im Frontend.

## Was wurde gebaut

### T01 — Swift CLI Binary `cal-tool`
`backend/src/scripts/cal-tool.swift` — natives Swift Binary mit 4 Subcommands:
- `list-calendars` — alle Kalender als JSON (filtert Geburtstags-Kalender)
- `read --from --to` — Events in Zeitraum (filtert recurring events)
- `create --calendar-id --title --start --end [--all-day] [--notes] [--location]`
- `delete --event-id`

Verwendet `requestFullAccessToEvents()` (macOS 14+) mit Fallback auf `requestAccess(to: .event)`. CFRunLoopRun/Stop Pattern fuer async EventKit. Alle Fehler als JSON `{error: "..."}` auf stdout mit exit(1).

Binary in `.gitignore`. Kompilierung: `bash backend/src/scripts/build-cal-tool.sh`

### T02 — Migration 025
`backend/src/db/migrations/025_calendar_v2.sql`:
- Neue Tabelle `calendars` (TEXT PK = EKCalendar.calendarIdentifier)
- Neue Tabelle `calendar_sync_ranges` (UNIQUE range_start+range_end)
- `ALTER TABLE calendar_events ADD COLUMN calendar_id TEXT`
- Keine DROP TABLE Statements — alte Tabellen bleiben erhalten

### T03 — calendarSwift.service.ts
Neuer Service (`backend/src/services/calendarSwift.service.ts`):
- `execBinary()`: execFile wrapper, 30s timeout, 5MB buffer, JSON parsing
- `getCalendars()`: list-calendars + upsert in calendars-Tabelle
- `syncRange(from, to)`: 5-Minuten Cache via calendar_sync_ranges, upsert Events
- `createEvent()`, `deleteEvent()`: direkte Binary-Aufrufe + SQLite sync
- `backgroundSync()`: aktueller Monat +/- 1 Monat, Sync-Mutex
- `fullSync()`: getCalendars + backgroundSync (Kompatibilitaet mit server.ts)

### T04 — Routes + server.ts
`calendar.routes.ts` komplett neu:
- `GET /calendars` → getCalendars()
- `GET /events?from=&to=` → syncRange() + SELECT aus calendar_events
- `POST /events` → createEvent() mit calendar_id statt calendar_name
- `DELETE /events/:id` → deleteEvent(appleUid) — String statt Integer

`server.ts`: Import auf calendarSwift.service, Interval 15min → 5min.

### T05 — Frontend API
`frontend/src/api/calendar.api.ts` — neue Typen und Funktionen:
- `Calendar`: id=string, title, color, is_visible
- `CalendarEvent`: apple_uid, calendar_id, vereinfacht (kein sync_status etc.)
- `fetchCalendars()`, `fetchEvents(from, to)`, `createEvent()`, `deleteEvent(appleUid)`
- Entfernt: triggerSync, updateEvent, SyncResult, KnownCalendar

### T06 — CalendarPage
`frontend/src/pages/CalendarPage.tsx` komplett neu (~550 Zeilen):
- 7-Spalten-Monatsraster (Mo-So), 42 Zellen, buildMonthGrid()
- Header: Monat-Navigation (‹ ›) + Heute-Button
- Tages-Zellen: Tagesnummer (heute = Primary-Kreis), bis zu 3 Event-Chips mit Kalenderfarbe als Linker Rand + Hintergrund-Tint, "+N weitere"
- Klick auf Tag: DaySlideOver (400px, slide-in von rechts, Backdrop)
- SlideOver: Event-Liste sortiert (Ganztaegig zuerst), Farbpunkt, Uhrzeit, Loeschen-Button mit Confirm-Dialog
- Neuer Termin Form: Titel, Datum, Von/Bis Zeit, Ganztaegig Checkbox, Kalender-Auswahl, Ort
- fetchCalendars() einmalig beim Mount, fetchEvents() bei Monatswechsel (useCallback + useEffect)

### T07 — Aufraeumen
Geloescht: 5 .applescript Dateien + calendarSync.service.ts. Keine verbleibenden aktiven Imports.

### T08 — Build Script
`backend/src/scripts/build-cal-tool.sh` — swiftc mit -O Optimierung, EventKit + Foundation Frameworks.

## Deviations

Keine — Plan wurde exakt wie beschrieben umgesetzt.

## Known Stubs

Keine. Alle Daten werden aus der echten EventKit-API geladen.

## Verifizierung

- `cal-tool list-calendars` gibt JSON-Array mit 8 Kalendern zurueck (getestet)
- Migration 025 wurde erfolgreich angewendet (Backend-Log bestaetigt)
- Backend startet ohne Fehler, 5-Minuten-Sync aktiv
- TypeScript-Kompilierung des Frontends ohne Fehler

## Self-Check: PASSED

- cal-tool.swift: FOUND
- build-cal-tool.sh: FOUND
- 025_calendar_v2.sql: FOUND
- calendarSwift.service.ts: FOUND
- calendarSync.service.ts: CONFIRMED DELETED
- AppleScript files: CONFIRMED DELETED
- Commits 176cad0 → b8485e3: ALL FOUND
