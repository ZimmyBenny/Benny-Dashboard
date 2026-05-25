---
phase: 5
plan: 3
subsystem: frontend
tags: [amazon-reviews, kanban, dnd-kit, drag-drop, review-card, review-column, kanban-board]
dependency_graph:
  requires:
    - frontend/src/api/reviews.api.ts (Plan 05-02 — Review-Type + patchReview + fetchReviews)
    - frontend/src/components/finance/reviews/reviewStatus.ts (Plan 05-02 — ALL_STATUSES, STATUS_CONFIG, TERMINAL, nextPipelineStatus)
    - frontend/src/lib/format.ts (formatCurrencyFromCents + formatDate)
    - frontend/src/lib/dates.ts (todayLocal + parseLocalDate)
    - "@dnd-kit/core + @dnd-kit/sortable + @dnd-kit/utilities (Bestandsstack seit Aufgaben-Modul)"
    - "@tanstack/react-query (Bestandsstack)"
  provides:
    - frontend/src/components/finance/reviews/ReviewCard.tsx (Sortable Karten-Komponente)
    - frontend/src/components/finance/reviews/ReviewColumn.tsx (Droppable Spalten-Komponente)
    - frontend/src/components/finance/reviews/ReviewsKanbanBoard.tsx (DndContext + 10 Spalten + Drag-Handler + useQuery)
  affects:
    - Plan 04 (BewertungenTab + FinancesPage) — importiert ReviewsKanbanBoard
tech_stack:
  added: []
  patterns:
    - useState-Hover-Border (re-render-safe — kein e.currentTarget.style.borderColor auf Card-Wrapper wegen Dnd-Re-Renders)
    - Single-style-Objekt auf <li> (kein doppeltes style-Prop, kein Spread-Trick)
    - onPointerDown+onClick stopPropagation auf Weiter-Button (T-05-K-01 Button-Ausnahme)
    - ALL_STATUSES.includes(newStatus) Drag-Drop-Validierung (T-05-K-02 ungueltige Drop-Zonen)
    - patchMut.mutate invalidiert ['reviews'] + ['reviews-stats'] bei onSuccess
key_files:
  created:
    - frontend/src/components/finance/reviews/ReviewCard.tsx
    - frontend/src/components/finance/reviews/ReviewColumn.tsx
    - frontend/src/components/finance/reviews/ReviewsKanbanBoard.tsx
  modified: []
decisions:
  - "Hover-Border via useState<boolean> auf der ReviewCard (nicht via e.currentTarget.style) — weil Dnd transform-Updates den Wrapper re-rendern und e.currentTarget.style dann zurueckgesetzt wuerde (Memory feedback_dragdrop_lessons)"
  - "Button-Hover via e.currentTarget.style.background/borderColor ist weiterhin OK — der Button selbst wird nicht durch Dnd re-rendert, also persistiert die Mutation"
  - "handleDragEnd validiert over.id gegen ALL_STATUSES.includes() — Drop ueber einer Karten-Id (statt Spalten-Id) wird silent ignoriert (T-05-K-02)"
  - "byStatus-Gruppierung via Object.fromEntries(ALL_STATUSES.map(...)) — skaliert automatisch mit ALL_STATUSES-Array"
  - "Kein DragPrompt — Phase-5-Decision: Status-Aenderung via Drop schreibt direkt (kein Status-Notiz-Workflow)"
  - "Keine sort_order/reorder-Logik — Backend sortiert serverseitig (received_date DESC), kein clientseitiges Reorder"
metrics:
  duration_seconds: 180
  completed_date: "2026-05-25"
  tasks_completed: 2
  files_created: 3
  files_modified: 0
requirements_addressed:
  - D-06
  - D-07
  - D-08
  - D-09
---

# Phase 5 Plan 3: Kanban-Komponenten-Familie Summary

**One-liner:** Drei Kanban-Komponenten (ReviewCard 142 LOC, ReviewColumn 71 LOC, ReviewsKanbanBoard 77 LOC) mit Drag-and-Drop, Frist-Badge-Schwellen, useState-Hover und direktem Status-PATCH — typecheck gruen.

## Was wurde gebaut

### ReviewCard.tsx (142 LOC)

`frontend/src/components/finance/reviews/ReviewCard.tsx` — Sortable Karten-Komponente:

| Feature | Implementierung |
|---------|----------------|
| Drag-Hook | `useSortable({ id: review.id })` — transform + transition + isDragging |
| Single-style-Objekt | Alle CSS-Properties in einem Objekt — kein doppeltes style-Prop, kein Spread-Trick |
| Hover-Border | `useState<boolean>(false)` — `isHover` steuert border-color im style-Objekt (re-render-safe) |
| Drag-State | opacity 0.5 + boxShadow var(--glow-primary) wenn isDragging |
| Title | Epilogue fw700 0.875rem + wordBreak break-word — `review.product_name` |
| Price-Pill | `formatCurrencyFromCents(purchase_price_cents)` — purple rgba(204,151,255,0.08) |
| Frist-Badge | 4 Schwellen: dunkelrot (<0), rot (≤3), gelb (≤7), neutral (>7) — nur wenn review_deadline gesetzt |
| Weiter-Button | `nextPipelineStatus(status) !== null` — stopPropagation onClick + onPointerDown |
| Card-Click | onClick auf <li> → onCardClick(review) |
| XSS-Schutz | React standard rendering — kein dangerouslySetInnerHTML |

**Frist-Badge-Schwellen (`getFristBadgeStyle`):**
| diffDays | bg | text | border |
|----------|----|------|--------|
| < 0 (ueberfaellig) | rgba(167,1,56,0.40) | #ffb2b9 | #ff6e84 |
| 0–3 (kritisch) | rgba(255,110,132,0.18) | #ff6464 | rgba(255,110,132,0.40) |
| 4–7 (Warnung) | rgba(255,196,87,0.15) | #ffc457 | rgba(255,196,87,0.40) |
| >7 (neutral) | rgba(255,255,255,0.06) | var(--color-on-surface-variant) | rgba(255,255,255,0.10) |

### ReviewColumn.tsx (71 LOC)

`frontend/src/components/finance/reviews/ReviewColumn.tsx` — Droppable Spalten-Komponente:

| Feature | Implementierung |
|---------|----------------|
| Drop-Hook | `useDroppable({ id: status })` — setNodeRef + isOver |
| Spalten-Header | STATUS_CONFIG[status].icon + Label (uppercase 0.8rem fw700 accent-color) + Count-Pill |
| Background | isOver → rgba(204,151,255,0.04); Terminal → rgba(25,37,64,0.30); Pipeline → rgba(25,37,64,0.40) |
| Empty-State | Icon + Heading + optionaler Body gemaess UI-SPEC-Tabelle pro Spalte |
| Karten-Liste | SortableContext + `<ul>` + ReviewCard-Render |

**Empty-State-Texte (gemaess UI-SPEC):**
| Spalte | Heading | Body |
|--------|---------|------|
| vorgemerkt | Nichts vorgemerkt | Neue Bewertungen tauchen hier zuerst auf |
| bestellt | Keine offenen Bestellungen | — |
| erhalten | Nichts auf dem Tisch | — |
| bewertet | Keine wartenden Refunds | — |
| geld_erhalten | Keine neuen Refunds | — |
| bereit_verkauf | Nichts auf Lager | — |
| behalten/verkauft/verschenkt/entsorgt | Noch leer | — |

### ReviewsKanbanBoard.tsx (77 LOC)

`frontend/src/components/finance/reviews/ReviewsKanbanBoard.tsx` — Board-Komponente:

| Feature | Implementierung |
|---------|----------------|
| DndContext | closestCorners + PointerSensor distance:8 |
| useQuery | `['reviews', selectedYear]` → fetchReviews(selectedYear) |
| useMutation | patchReview — onSuccess invalidiert ['reviews'] + ['reviews-stats'] |
| handleDragEnd | validiert over.id via ALL_STATUSES.includes() (T-05-K-02) |
| handleForward | nextPipelineStatus(review.status) → patchMut.mutate |
| byStatus | Object.fromEntries(ALL_STATUSES.map(s => [s, reviews.filter(...)])) |
| Layout | flex + gap:1rem + overflowX:auto + alignItems:flex-start |
| Spalten | 10 ReviewColumn-Instanzen in ALL_STATUSES-Reihenfolge |

## Hinweise fuer Plan 04

### Import-Interface

```ts
// Plan 04 importiert so:
import { ReviewsKanbanBoard } from '../components/finance/reviews/ReviewsKanbanBoard';
import type { Review } from '../api/reviews.api';

// Props:
<ReviewsKanbanBoard
  selectedYear={selectedYear}   // number | 'all'
  onCardClick={(r: Review) => setSelectedReview(r)}
/>
```

### Query-Keys (etabliert)

- `['reviews', selectedYear]` — Kanban-Daten, invalidiert nach Drag/Weiter
- `['reviews-stats']` — wird in Plan 04 fuer KPI-Cards benoetigt; bereits bei jeder Status-Mutation mitinvalidiert

### ReviewDetailModal-Anbindung (Plan 04)

Klick auf Karte triggert `onCardClick(review)` → Plan 04 setzt `selectedReview` State und oeffnet `ReviewDetailModal`.

## Test-Ergebnis

Kein automatisierbarer Drag-Test in jsdom (Pointer-Events nicht simulierbar — VALIDATION.md-Begruendung). UAT folgt in Plan 04/05 nach Page-Shell-Integration.

```
TypeScript typecheck: PASSED (0 errors)
```

## Deviations from Plan

None — Plan executed exactly as written.

## Known Stubs

Keine. Alle drei Komponenten sind vollstaendig implementiert und verarbeiten echte API-Daten. Keine Placeholder-Werte oder Hardcoded-Mock-Arrays.

## Threat Flags

Keine neuen Security-relevanten Surfaces. Mitigationen aus Threat-Register umgesetzt:

| Threat | Mitigation | Status |
|--------|-----------|--------|
| T-05-K-01 | onPointerDown + onClick stopPropagation auf Weiter-Button | DONE |
| T-05-K-02 | ALL_STATUSES.includes(newStatus) in handleDragEnd | DONE |
| T-05-K-03 | React standard rendering (kein dangerouslySetInnerHTML) | DONE |

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| frontend/src/components/finance/reviews/ReviewCard.tsx (142 LOC) | FOUND |
| frontend/src/components/finance/reviews/ReviewColumn.tsx (71 LOC) | FOUND |
| frontend/src/components/finance/reviews/ReviewsKanbanBoard.tsx (77 LOC) | FOUND |
| Commit 7f111a4 (ReviewCard + ReviewColumn) | FOUND |
| Commit 2f0f8b0 (ReviewsKanbanBoard) | FOUND |
| npm run typecheck | PASSED (0 errors) |
| dangerouslySetInnerHTML: 0 in allen 3 Dateien | CONFIRMED |
| DragPrompt: 0 in ReviewsKanbanBoard | CONFIRMED |
| sort_order/reorder: 0 in ReviewsKanbanBoard | CONFIRMED |
