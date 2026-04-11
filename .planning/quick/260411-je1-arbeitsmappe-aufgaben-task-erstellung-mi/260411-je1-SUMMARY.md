---
phase: quick
plan: 260411-je1
subsystem: workbook+tasks
tags: [workbook, tasks, navigation, cross-module, sqlite-migration]
dependency_graph:
  requires: [workbook-v1, tasks-modul-v1]
  provides: [workbook-to-task-creation, task-to-workbook-navigation]
  affects: [WorkbookEditor, WorkbookPage, TaskSlideOver, tasks-routes]
tech_stack:
  added: []
  patterns: [source-page-fk, location-state-navigation, inline-modal]
key_files:
  created:
    - backend/src/db/migrations/011_task_source_page.sql
  modified:
    - backend/src/routes/tasks.routes.ts
    - frontend/src/api/tasks.api.ts
    - frontend/src/components/workbook/WorkbookEditor.tsx
    - frontend/src/pages/WorkbookPage.tsx
    - frontend/src/components/tasks/TaskSlideOver.tsx
decisions:
  - "COALESCE(?, source_page_id) im PUT-UPDATE: source_page_id wird nur ueberschrieben wenn explizit mitgegeben, sonst unveraendert gelassen"
  - "GET /api/tasks/:id als neue Route vor den bestehenden /:id PATCH/DELETE Routen eingefuegt — keine Kollision da /stats bereits zuerst registriert"
  - "window.history.replaceState nach openPageId-Verarbeitung: verhindert erneutes Oeffnen nach Browser-Back"
metrics:
  duration_minutes: 25
  completed_date: "2026-04-11"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 5
  files_created: 1
---

# Quick Task 260411-je1: Arbeitsmappe → Aufgaben (Task-Erstellung mit source_page_id + Link zurueck)

**One-liner:** Bidirektionale Verknuepfung zwischen Arbeitsmappe und Aufgaben via source_page_id FK, Inline-Modal im Editor und Ursprung-Link im SlideOver.

## Was wurde gebaut

### Task 1: Migration + Backend (33e3ac8)

Migration `011_task_source_page.sql` fuegt `source_page_id INTEGER REFERENCES workbook_pages(id) ON DELETE SET NULL` zur `tasks`-Tabelle hinzu. Migration wurde direkt per sqlite3 CLI angewendet und in `_migrations` registriert (Server-Neustart wendet sie nicht erneut an).

`tasks.routes.ts` erweitert:
- `GET /api/tasks`: `SELECT t.*, wp.title AS source_page_title FROM tasks t LEFT JOIN workbook_pages wp ...` — alle Tasks tragen jetzt `source_page_title`
- `GET /api/tasks/:id`: neue Route mit gleichem JOIN fuer Einzelabruf
- `POST /api/tasks`: `source_page_id` in INSERT + VALUES
- `PUT /api/tasks/:id`: `source_page_id` in UPDATE via `COALESCE(?, source_page_id)`

### Task 2: WorkbookEditor Modal + WorkbookPage Navigation (3bf7445)

`tasks.api.ts`: `source_page_id?: number | null` und `source_page_title?: string | null` zum `Task`-Interface hinzugefuegt.

`WorkbookEditor.tsx`:
- `sectionName?: string` Prop hinzugefuegt
- `apiClient` importiert
- `taskModalOpen`, `taskForm`, `taskSaving` State
- "+ Aufgabe" Button in Toolbar (rechts neben Page-Actions, mit Trennlinie)
- Inline-Modal: Backdrop + zentrierte Card, vorausgefuellt mit `page.title` als Titel und `sectionName` als Bereich, Prioritaet "Mittel"
- Submit: `POST /tasks` mit `source_page_id: page.id`, Escape schliesst Modal

`WorkbookPage.tsx`:
- `useLocation` importiert
- `openPageId`-useEffect: liest `location.state?.openPageId`, setzt `activePageId`, clearet State via `window.history.replaceState`
- `sectionName`-Prop an `WorkbookEditor` uebergeben: `sections.find((s) => s.id === activeSectionId)?.name ?? ''`

### Task 3: TaskSlideOver Ursprung-Link (228d406)

`TaskSlideOver.tsx`:
- `useNavigate` importiert und im Body instanziiert
- Neuer "Ursprung"-Block am Ende des Form-Bereichs, nur sichtbar wenn `task?.source_page_id` gesetzt
- Button mit `menu_book`-Icon + `source_page_title` (Fallback: `Seite #N`) + `open_in_new`-Icon
- Klick: `navigate('/workbook', { state: { openPageId: task.source_page_id } })` + `onClose()`

## Commits

| Task | Commit | Beschreibung |
|------|--------|--------------|
| 1 | 33e3ac8 | Migration 011 + source_page_id Backend |
| 2 | 3bf7445 | WorkbookEditor Modal + WorkbookPage openPageId |
| 3 | 228d406 | TaskSlideOver Arbeitsmappe-Link |

## Deviations from Plan

None — Plan exakt ausgefuehrt.

## Known Stubs

None.

## Threat Flags

None — keine neuen Netzwerk-Endpunkte oder Auth-Pfade eingefuehrt. source_page_id-Disposition `accept` gemaess Plan-Threat-Model bestaetigt.

## Self-Check: PASSED

- `backend/src/db/migrations/011_task_source_page.sql` — FOUND
- `backend/src/routes/tasks.routes.ts` — FOUND (modifiziert)
- `frontend/src/api/tasks.api.ts` — FOUND (modifiziert)
- `frontend/src/components/workbook/WorkbookEditor.tsx` — FOUND (modifiziert)
- `frontend/src/pages/WorkbookPage.tsx` — FOUND (modifiziert)
- `frontend/src/components/tasks/TaskSlideOver.tsx` — FOUND (modifiziert)
- Commit 33e3ac8 — FOUND
- Commit 3bf7445 — FOUND
- Commit 228d406 — FOUND
