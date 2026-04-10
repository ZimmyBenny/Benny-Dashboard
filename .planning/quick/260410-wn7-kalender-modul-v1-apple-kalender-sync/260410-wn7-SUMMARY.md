---
phase: quick-260410-wn7
plan: 01
subsystem: calendar
tags: [apple-calendar, applescript, osascript, sync, sqlite, frontend]
dependency_graph:
  requires: [backend/db/migrations/006_tasks_status_note.sql]
  provides: [calendar_events, calendar_sync_log, known_calendars, GET /api/calendar/events, POST /api/calendar/sync, CalendarPage]
  affects: [backend/src/app.ts, backend/src/server.ts, frontend/src/routes/routes.tsx]
tech_stack:
  added: [osascript/AppleScript (built-in macOS), setInterval Hintergrund-Sync]
  patterns: [execFile env-var Parameter-Passing, UPSERT ON CONFLICT, Apple-wins conflict resolution]
key_files:
  created:
    - backend/src/db/migrations/007_calendar.sql
    - backend/src/scripts/cal-read.applescript
    - backend/src/scripts/cal-create.applescript
    - backend/src/scripts/cal-update.applescript
    - backend/src/scripts/cal-delete.applescript
    - backend/src/scripts/cal-list-calendars.applescript
    - backend/src/services/calendarSync.service.ts
    - backend/src/routes/calendar.routes.ts
    - frontend/src/api/calendar.api.ts
    - frontend/src/pages/CalendarPage.tsx
  modified:
    - backend/src/app.ts
    - backend/src/server.ts
decisions:
  - "CALENDAR_NAMES Fallback: known_calendars DB -> Apple listCalendars() statt Hard-Fail"
  - "fullSync() exportiert fuer Hintergrund-Interval in server.ts (setInterval 10min)"
  - "Apple gewinnt immer: gleicher stampISO = skip; neuerer Apple-Stamp ueberschreibt pending_push"
  - "detectNewCalendars als Alias auf checkNewCalendars fuer Routen-Kompatibilitaet"
metrics:
  duration: "~6 Minuten"
  completed_date: "2026-04-10"
  tasks_completed: 3
  files_created: 10
  files_modified: 2
---

# Phase quick-260410-wn7 Plan 01: Kalender-Modul V1 Apple Calendar Sync Summary

**One-liner:** Bidirektionaler Apple Calendar Sync via AppleScript/osascript mit SQLite-Mirror, on-demand Route, 10-Minuten-Hintergrund-Interval und Monatsuebersicht im Electric Noir Design.

## Was implementiert wurde

### Backend

**Migration `007_calendar.sql`** — drei neue Tabellen:
- `calendar_events`: Apple-Events gespiegelt in SQLite (`UNIQUE(apple_uid, start_at)` fuer recurring events)
- `calendar_sync_log`: Audit-Trail aller Pull/Push-Aktionen
- `known_calendars`: Registry aller jemals gesehenen Kalender

**5 AppleScript-Dateien** in `backend/src/scripts/`:
- `cal-list-calendars.applescript` — alle Kalender-Namen als JSON
- `cal-read.applescript` — Events mit Epoch-Timestamps (Pitfall 3 gelost: locale-unabhaengig via `date -j -f`)
- `cal-create.applescript` — Event erstellen, UID zurueckgeben
- `cal-update.applescript` — Event per UID aktualisieren (bekannter Kalender zuerst, dann Fallback)
- `cal-delete.applescript` — Event per UID loeschen

**`calendarSync.service.ts`** — 7 exportierte Funktionen:
- `listCalendars()` — Apple Calendar abfragen
- `detectNewCalendars()` — neue Kalender erkennen + in known_calendars eintragen
- `syncPull()` — Apple -> SQLite UPSERT-Sync, Apple gewinnt bei Konflikten
- `fullSync()` — Pull + detectNewCalendars kombiniert fuer Hintergrund-Interval
- `pushEvent()`, `updateAppleEvent()`, `deleteAppleEvent()` — Dashboard -> Apple Push

**`calendar.routes.ts`** — 8 Endpunkte:
- `GET /api/calendar/events` — Events mit optionalem Datumsfilter
- `POST /api/calendar/sync` — on-demand Pull
- `GET /api/calendar/calendars` — known_calendars + optionale neue-Kalender-Erkennung
- `GET /api/calendar/sync-log` — Audit-Log
- `GET /api/calendar/apple-calendars` — direkt aus Apple Calendar
- `POST /api/calendar/events` — erstellen (SQLite + Apple)
- `PUT /api/calendar/events/:id` — updaten (SQLite + Apple)
- `DELETE /api/calendar/events/:id` — loeschen (SQLite + Apple)

**`app.ts`** — calendarRoutes nach verifyToken Guard registriert.

**`server.ts`** — `setInterval` alle 10 Minuten ruft `fullSync()` auf (lazy import nach Server-Start, kein UI-Blocking).

### Frontend

**`calendar.api.ts`** — vollstaendige Typdefinitionen (CalendarEvent, KnownCalendar, SyncResult) und API-Funktionen fuer alle Endpunkte.

**`CalendarPage.tsx`** — Ersetzt Placeholder vollstaendig:
- Monatsuebersicht (CSS Grid, 7 Spalten, Mo-So, 42 Zellen)
- Heute hervorgehoben (primary-Border), gewaehlter Tag hervorgehoben
- Event-Badges pro Zelle (max 3 + "+N"-Zaehler)
- Tagesdetail-Panel (rechts, 280px, klickbare Events)
- Sync-Button mit Spinner + Timestamp "Synced HH:MM"
- Event-Formular (Slide-Panel rechts, Backdrop, Erstellen/Bearbeiten/Loeschen)
- Neuer-Kalender-Popup (Polling alle 60s)
- Automatischer Sync beim Laden der Seite

## Besonderheiten

### CALENDAR_NAMES Fallback-Kette
Falls `.env` kein `CALENDAR_NAMES` hat:
1. `known_calendars` DB verwenden (kein Apple-Aufruf)
2. Fallback: Apple Calendar direkt abfragen + Ergebnis cachen

Kein Hard-Fail. Der erste Sync nach Server-Start befuellt `known_calendars` automatisch.

### TCC-Erstgenehmigung
Beim ersten osascript-Aufruf erscheint ein macOS-Datenschutzdialog fuer Calendar-Zugriff. Einmalig im Terminal manuell ausfuehren:
```bash
osascript -e 'tell application "Calendar" to get name of calendars'
```
Danach persistent und headless.

### Performance
Sync dauert 12-15s pro Kalender (`whose`-Query). Der 10-Minuten-Hintergrundprozess blockiert nicht den Express-Worker. On-demand Sync (POST /api/calendar/sync) blockiert den HTTP-Request fuer diese Dauer — kein Timeout konfiguriert (Express 5 handelt lange Requests).

### Apple gewinnt bei Konflikten
- Gleicher `apple_stamp` -> skip (kein Update)
- Neuerer Apple-Stamp -> ueberschreibt auch `pending_push`-Events in SQLite
- Dashboard-Aenderungen mit neuerem Timestamp -> bleiben erhalten bis naechster Pull

## Abweichungen vom Plan

### [Zusatzanforderung] Hintergrund-Sync in server.ts
Plan: kein setInterval. Zusatzanforderung: setInterval alle 10 Minuten in server.ts.
Implementiert: lazy `import()` nach `app.listen()` fuer `fullSync()`, `setInterval(10 * 60 * 1000)`.

### [Zusatzanforderung] CALENDAR_NAMES Fallback
Plan: leeres CALENDAR_NAMES = kein Sync (throw Error). Zusatzanforderung: alle Kalender lesen.
Implementiert: `resolveCalendarNames()` mit 2-Stufen-Fallback (DB -> Apple).

### [Zusatzanforderung] detectNewCalendars im Background-Interval
`fullSync()` ruft `detectNewCalendars()` auf bevor `syncPull()`. Neue Kalender werden also automatisch alle 10 Minuten in `known_calendars` eingetragen.

### [Zusatzanforderung] Apple gewinnt bei Konflikten
Plan hatte "Apple gewinnt wenn neuer" als Logik. Praezisiert: gleicher Stamp = skip, neuerer Apple-Stamp = ueberschreibt auch pending_push. Beides in UPSERT ON CONFLICT implementiert.

### Alias detectNewCalendars / checkNewCalendars
`checkNewCalendars` als Alias auf `detectNewCalendars` beibehalten fuer Kompatibilitaet mit Routen-Import.

## Bekannte Stubs

Keine — alle Daten kommen aus Apple Calendar via osascript oder aus SQLite.

## Known Limitations

- Sonderzeichen in Event-Titeln (Backslash, Newlines) koennen JSON aus AppleScript brechen. Mitigation: `tr '"' "'"` escaped die haeufigsten Faelle. Vollstaendiges JSON-Escaping wuerde Tab-delimited Output erfordern (V2).
- DST-Grenzfaelle bei `date -j -f` koennten bei Sommer/Winterzeit-Wechsel ±1h Fehler erzeugen (ASSUMED aus RESEARCH.md — nicht live verifiziert).
- Recurring Events mit gleicher UID in verschiedenen Perioden: Schema `UNIQUE(apple_uid, start_at)` handelt dies korrekt, aber was passiert wenn Apple eine Instanz aendert ist nicht verifiziert.

## Self-Check: PASSED

Alle 10 erstellten Dateien vorhanden. Alle 3 Task-Commits verifiziert (afeee61, 253f0db, d504577). TypeScript-Kompilierung backend und frontend fehlerfrei.
