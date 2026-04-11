---
phase: quick
plan: 260411-i4e
subsystem: workbook
tags: [workbook, attachments, multi-select, subpages, tree-view, migration]
completed_date: "2026-04-11"
duration_minutes: 25
tasks_completed: 3
tasks_total: 3
files_created: 1
files_modified: 5
key_decisions:
  - "Kinder immer frisch laden beim Aufklappen (kein Cache) — stellt sicher dass neue Unterseiten nach Erstellung sofort erscheinen"
  - "parent_id IS NULL Filter nur wenn kein parent_id Query-Param gesetzt — kombiniert sauber mit section_id Filter"
  - "Migration manuell angewendet (connection.ts hat keine Auto-Migration) — sqlite3 CLI"
commits:
  - hash: "68739c3"
    message: "feat(quick-260411-i4e): Migration 010 parent_id + GET/POST /pages Erweiterung"
  - hash: "1910d75"
    message: "feat(quick-260411-i4e): Multi-Select Bulk-Delete fuer Anhänge in WorkbookEditor"
  - hash: "2e1be72"
    message: "feat(quick-260411-i4e): Unterseiten Tree-View in PageList + onNewChild in WorkbookPage"
---

# Quick Task 260411-i4e: Arbeitsmappe V1.2 — Multi-Select Anhänge + Unterseiten

**One-liner:** Multi-Select Bulk-Delete fuer Anhänge via Checklist-Toggle + klappbares Unterseiten-Tree-View mit on-demand Laden per Chevron-Icon.

## Was implementiert wurde

### Feature 1: Multi-Select Bulk-Delete fuer Anhänge

- **Checklist-Icon** rechts oben im Anhänge-Bereich aktiviert/deaktiviert den Auswahl-Modus
- Im Auswahl-Modus: Checkbox links neben jedem Anhang, Klick auf Zeile togglet Auswahl, Hintergrund-Highlight bei Selektion
- **"Auswahl löschen (N)"** Button erscheint sobald ≥1 Anhang selektiert ist; loescht alle parallel via `Promise.all`
- Einzel-Löschen-Button nur im Normalmodus sichtbar (verschwindet im Auswahl-Modus)
- Links im Auswahl-Modus deaktiviert (`e.preventDefault()`)
- Auswahl-Modus + Selektion werden bei Seitenwechsel automatisch zurückgesetzt

### Feature 2: Unterseiten Tree-View in PageList

- **Chevron-Icon** links neben jeder Top-Level-Seite (immer leicht sichtbar, 40% Opacity)
- Chevron klappt Unterseiten auf/zu; beim Aufklappen werden Kinder frisch per `GET /pages?parent_id=X` geladen
- **"+" Icon** erscheint bei Hover neben Top-Level-Seiten; erstellt direkt eine neue Unterseite
- Unterseiten werden eingerückt mit `borderLeft`-Markierung angezeigt
- "Keine Unterseiten" Hinweis wenn Parent keine Kinder hat
- Unterseiten-Löschen bereinigt `childrenMap` State lokal
- Unterseiten haben keinen Chevron und kein "+" Icon (max. 1 Ebene Tiefe)

### Backend + DB

- **Migration 010_subpages.sql**: `ALTER TABLE workbook_pages ADD COLUMN parent_id INTEGER REFERENCES workbook_pages(id) ON DELETE CASCADE` + Index
- **GET /pages**: Neuer `parent_id` Query-Parameter; ohne Parameter nur Top-Level (`parent_id IS NULL`); mit Parameter nur Kinder dieser ID
- **POST /pages**: `parent_id` aus Request-Body in INSERT aufgenommen

## Migration

Migration wurde manuell mit sqlite3 CLI angewendet (connection.ts hat keine Auto-Migration-Logik):

```bash
sqlite3 ~/.local/share/benny-dashboard/dashboard.db < backend/src/db/migrations/010_subpages.sql
```

Index `idx_workbook_pages_parent` ist in der DB vorhanden (verifiziert).

## Bekannte Einschränkungen

- **Max. 1 Ebene Tiefe**: Unterseiten haben keinen Chevron/"+"-Button. Tiefere Hierarchien würden eine rekursive Render-Funktion erfordern.
- **Kein Drag & Drop**: Seiten können nicht per Drag zwischen Parent/Child-Positionen verschoben werden.
- **Kein Auto-Expand nach Unterseiten-Erstellung**: Nach `handleNewChild` muss der User den Chevron manuell klicken um die neue Unterseite zu sehen. (Explizit so entschieden — Ref-Kommunikation zwischen WorkbookPage und PageList wäre unnötig komplex.)
- **section_id bei Unterseiten**: Unterseiten erben die `section_id` des Parent nicht automatisch — sie erhalten die `activeSectionId` beim Erstellen. Das ist konsistent aber nicht zwingend semantisch ideal.

## Deviations from Plan

Keine — Plan exakt umgesetzt. Einzige kleine Abweichung: Kinder werden beim Aufklappen immer frisch geladen (statt gecacht) um sicherzustellen dass nach `handleNewChild` die neue Unterseite beim naechsten Aufklappen erscheint.

## Self-Check

- [x] `backend/src/db/migrations/010_subpages.sql` existiert
- [x] `backend/src/routes/workbook.routes.ts` mit parent_id GET/POST
- [x] `frontend/src/api/workbook.api.ts` mit parent_id in Page, fetchPages, createPage
- [x] `frontend/src/components/workbook/WorkbookEditor.tsx` mit Multi-Select
- [x] `frontend/src/components/workbook/PageList.tsx` mit Tree-View
- [x] `frontend/src/pages/WorkbookPage.tsx` mit onNewChild
- [x] Backend TS: keine Fehler
- [x] Frontend TS: keine Fehler
- [x] DB-Index `idx_workbook_pages_parent` vorhanden
- [x] Migration angewendet (parent_id Spalte in workbook_pages vorhanden)

## Self-Check: PASSED
