---
phase: quick-260415-cni
plan: 01
subsystem: dj
tags: [modal, edit-mode, venue, status, dj-events]
dependency_graph:
  requires: []
  provides: [unified-anfrage-modal]
  affects: [DjEventsPage, NeueAnfrageModal]
tech_stack:
  added: []
  patterns: [unified-create-edit-modal, draggable-modal, tanstack-query-invalidation]
key_files:
  created: []
  modified:
    - frontend/src/components/dj/NeueAnfrageModal.tsx
    - frontend/src/pages/dj/DjEventsPage.tsx
decisions:
  - "isEdit via !!eventId — kein separater Modus-Prop, prop-Existenz bestimmt den Modus"
  - "loadingEvent spinner: kompletter Form-Body wird ausgeblendet während Daten laden"
  - "onUpdated-Callback optional (?) — rückwärtskompatibel mit bisherigen Create-only-Aufrufern"
metrics:
  duration: "~20min"
  completed: "2026-04-15"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
---

# Phase quick-260415-cni Plan 01: Anfragen-Modal vereinheitlichen (Create/Edit) Summary

**One-liner:** NeueAnfrageModal zu unified Create/Edit-Modal erweitert — eventId-Prop triggert Edit-Modus mit Datenladen, Status-Dropdown, Venue-Feldern, Gästeanzahl und Status-Verlauf.

## Was wurde gebaut

### NeueAnfrageModal.tsx — Unified Create/Edit Modal

Das bestehende Create-only-Modal wurde zu einem vollständigen Create/Edit-Modal erweitert:

- **Edit-Modus-Erkennung:** `const isEdit = !!eventId` — prop-basiert, rückwärtskompatibel
- **Props:** `eventId?: number | null`, `onUpdated?: () => void` hinzugefügt
- **Daten laden:** `fetchDjEvent(eventId)` in useEffect, befüllt alle Formularfelder
- **Lade-Spinner:** Während Datenladen wird Form-Body ausgeblendet, Spinner angezeigt
- **Neue State-Variablen:** `venueName`, `venueStreet`, `venueZip`, `venueCity`, `guests`, `status`, `statusHistory`, `loadingEvent`
- **Status-Dropdown:** Nur im Edit-Modus, alle 6 Status-Optionen mit echten Umlauten
- **Venue-Felder:** Name (volle Breite), Straße/PLZ/Stadt (3-Spalten-Grid), Gästeanzahl
- **handleSave:** Edit → `updateDjEvent` + `onUpdated?.()`, Create → `createDjEvent` + `onCreated()`
- **Kalender-Option:** Nur im Create-Modus via `{!isEdit && (...)}`
- **Status-Verlauf:** Am Modal-Ende nur wenn `isEdit && statusHistory.length > 0`
- **Modal-Titel/Icon:** Dynamisch — "Anfrage bearbeiten" / edit_note im Edit-Modus
- **Footer-Button:** "Änderungen speichern" (Edit) vs. "Anfrage speichern" (Create)

### DjEventsPage.tsx — Modal-Edit Verdrahtung

- `selectedEventId` State hinzugefügt
- `onNavigate` in EventRow-Schleife: `setSelectedEventId(e.id)` statt `navigate('/dj/events/${e.id}')`
- Edit-Modal-Rendering mit `eventId`, `onUpdated` + `queryClient.invalidateQueries`
- Create-Modal bleibt unverändert

## Commits

| Task | Commit | Beschreibung |
|------|--------|--------------|
| Task 1 | 86567c9 | NeueAnfrageModal zu unified Create/Edit-Modal erweitert |
| Task 2 | d0837a7 | DjEventsPage auf Modal-Edit umverdrahtet |

## Deviations from Plan

None — Plan exakt wie beschrieben umgesetzt.

## Known Stubs

None — alle Felder sind vollständig verdrahtet.

## Threat Flags

None — keine neuen Netzwerk-Endpunkte, Auth-Pfade oder Schema-Änderungen eingeführt. Bestehende `fetchDjEvent` und `updateDjEvent` API-Aufrufe genutzt.

## Self-Check: PASSED

- frontend/src/components/dj/NeueAnfrageModal.tsx — vorhanden (86567c9)
- frontend/src/pages/dj/DjEventsPage.tsx — vorhanden (d0837a7)
- TypeScript kompiliert fehlerfrei (keine Ausgabe von `tsc --noEmit`)
