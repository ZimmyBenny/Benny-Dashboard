---
phase: quick-260412-vf8
plan: "01"
subsystem: workbook
tags: [draggable-modals, contact-linking, workbook, frontend, backend]
dependency_graph:
  requires: []
  provides:
    - useDraggableModal Hook
    - contact_id auf workbook_pages
    - ContactPicker Komponente
    - fetchPagesByContact API
    - Arbeitsmappe-Tab in ContactDetailPage
  affects:
    - WorkbookPage (Export-Dialog)
    - TemplatePickerModal
    - WorkbookSearch
    - WorkbookEditor
    - ContactDetailPage
tech_stack:
  added: []
  patterns:
    - Draggable Modal via data-draggable-modal + useDraggableModal Hook
    - ContactPicker Dropdown mit Debounce-Suche
    - PATCH-Endpunkt fuer isolierte Feld-Updates
key_files:
  created:
    - backend/src/db/migrations/020_workbook_contact.sql
    - frontend/src/hooks/useDraggableModal.ts
    - frontend/src/components/workbook/ContactPicker.tsx
  modified:
    - backend/src/routes/workbook.routes.ts
    - frontend/src/api/workbook.api.ts
    - frontend/src/components/workbook/TemplatePickerModal.tsx
    - frontend/src/components/workbook/WorkbookSearch.tsx
    - frontend/src/components/workbook/WorkbookEditor.tsx
    - frontend/src/pages/WorkbookPage.tsx
    - frontend/src/pages/ContactDetailPage.tsx
decisions:
  - useDraggableModal gibt modalStyle ohne transform zurueck wenn pos gesetzt — so bleibt der default-Zentriert-Zustand erhalten
  - exportDragOccurred Ref verhindert unbeabsichtigtes Schliessen des Export-Dialogs nach Drag-Ende auf dem Backdrop
  - contactName wird beim Mount per fetchContact geladen (kein neues Backend-JOIN) — pragmatisch fuer Einzelfall
  - GET /pages?contact_id=X bekommt eigenen Query-Zweig mit JOIN statt Modifikation des bestehenden Pfads
metrics:
  duration_minutes: 25
  completed_date: "2026-04-12"
  tasks_completed: 3
  tasks_total: 3
  files_created: 3
  files_modified: 7
---

# Phase quick-260412-vf8 Plan 01: Arbeitsmappe — Draggable Modals + Kontakt-Verknuepfung Summary

**One-liner:** Draggable Modals via wiederverwendbarem Hook, Kontakt-Verknuepfung auf Arbeitsmappe-Seiten per Migration + ContactPicker, und Arbeitsmappe-Tab im Kontakt-Detail.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | DB-Migration + Backend-Erweiterung | 2ff3764 | 020_workbook_contact.sql, workbook.routes.ts |
| 2 | useDraggableModal + Draggable Modals + ContactPicker + Frontend-API | 2210b39 | useDraggableModal.ts, ContactPicker.tsx, workbook.api.ts, WorkbookEditor.tsx, WorkbookPage.tsx, TemplatePickerModal.tsx, WorkbookSearch.tsx |
| 3 | Arbeitsmappe-Tab im ContactDetailPage | 114fca3 | ContactDetailPage.tsx |

## What Was Built

### Task 1 — Migration + Backend
- `020_workbook_contact.sql`: `contact_id INTEGER` Spalte auf `workbook_pages`, FK auf `contacts(id) ON DELETE SET NULL`, Index `idx_workbook_pages_contact`
- `GET /pages?contact_id=X`: eigener Query-Zweig mit `LEFT JOIN workbook_sections` fuer `section_name`, kein `parent_id IS NULL` Filter
- `POST /pages`: nimmt `contact_id` auf
- `PUT /pages/:id`: nimmt `contact_id` auf, behaelt bestehenden Wert wenn nicht uebergeben
- `PATCH /pages/:id/contact`: minimaler Endpunkt fuer schnelle contact_id Updates

### Task 2 — Frontend
- `useDraggableModal` Hook: `onMouseDown` Handler, `modalStyle` (fixed left/top wenn gedraggt), `headerStyle` (cursor: grab), globale mousemove/mouseup Listener
- Export-Dialog in `WorkbookPage.tsx`: `data-draggable-modal`, `exportDrag.modalStyle` auf Container, `h2` als Drag-Handle; `exportDragOccurred` Ref verhindert Backdrop-Close nach Drag
- `TemplatePickerModal`: `data-draggable-modal` + `modalStyle` auf Container, Header-div als Drag-Handle
- `WorkbookSearch`: `data-draggable-modal` + `modalStyle` auf Container, Suchfeld-div als Drag-Handle; `onMouseDown stopPropagation` auf Input damit Text-Cursor funktioniert
- `ContactPicker`: Badge-Komponente mit person-Icon, Kontaktname oder "Kein Kontakt", X-Button zum Loeschen; Dropdown mit Debounce-Suche (250ms), max-height 200px
- `workbook.api.ts`: `contact_id` im `Page` Interface, `contact_id` in `createPage` Params, `fetchPagesByContact`, `updatePageContact`
- `WorkbookEditor`: `ContactPicker` unter Tags, `contactName` State per `fetchContact` beim Mount, `updatePageContact` bei Aenderung

### Task 3 — ContactDetailPage
- `activeTab` Typ um `'workbook'` erweitert
- `workbookPages` + `workbookLoading` State
- `useEffect` laedt `fetchPagesByContact` wenn Tab aktiv
- Tab-Bar: "Arbeitsmappe" mit `menu_book` Icon zwischen Notizen und Zeiterfassung
- Tab-Inhalt: Karten mit Titel, section_name, Datum; Klick navigiert zu `/arbeitsmappe` mit `{ openPageId }` State
- Leer-Zustand: "Keine Arbeitsmappe-Seiten verknuepft"

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. Alle Features sind vollstaendig verdrahtet.

## Threat Flags

None. Keine neuen externen Endpunkte oder Auth-Pfade eingefuehrt. `PATCH /pages/:id/contact` ist hinter bestehendem Auth-Middleware der Express-App.

## Self-Check: PASSED
