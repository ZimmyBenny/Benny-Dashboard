---
phase: 03-shell-design-system
plan: "04"
subsystem: frontend/routing
tags: [routing, placeholder-pages, appshell, react-router, electric-noir]
dependency_graph:
  requires:
    - AppShell Layout-Wrapper (03-03)
    - PageWrapper UI-Primitive (03-02)
    - Electric Noir CSS-Token-Palette (03-01)
  provides:
    - Vollstaendiger Router mit PrivateRoute > AppShell > 7 Kind-Routen
    - 5 Placeholder-Pages (Tasks, Calendar, DJ, Finances, Amazon) im Electric Noir Design
    - 2 temporaere Stubs (DashboardPage, SettingsPage) fuer Plan 05
  affects:
    - frontend/src/routes/routes.tsx
    - frontend/src/pages/TasksPage.tsx
    - frontend/src/pages/CalendarPage.tsx
    - frontend/src/pages/DjPage.tsx
    - frontend/src/pages/FinancesPage.tsx
    - frontend/src/pages/AmazonPage.tsx
    - frontend/src/pages/DashboardPage.tsx
    - frontend/src/pages/SettingsPage.tsx
tech_stack:
  added: []
  patterns:
    - React Router v7 Layout-Routes (element ohne path als Layout-Wrapper)
    - PrivateRoute als Auth-Gate um AppShell und alle Kind-Routen
    - CSS Custom Properties fuer alle Farb- und Font-Tokens (kein raw hex in JSX/TSX)
    - PageWrapper als konsistentes Layout-Fundament fuer alle Seiten
key_files:
  created:
    - frontend/src/pages/TasksPage.tsx
    - frontend/src/pages/CalendarPage.tsx
    - frontend/src/pages/DjPage.tsx
    - frontend/src/pages/FinancesPage.tsx
    - frontend/src/pages/AmazonPage.tsx
    - frontend/src/pages/DashboardPage.tsx
    - frontend/src/pages/SettingsPage.tsx
  modified:
    - frontend/src/routes/routes.tsx
decisions:
  - "CSS Custom Properties (var()) statt Tailwind-Klassen in Pages — konsistent mit etabliertem Pattern aus Codebase"
  - "DashboardPage und SettingsPage als Minimal-Stubs — Plan 05 ueberschreibt sie vollstaendig"
  - "Kein raw hex, kein direktes import App mehr in routes.tsx"
metrics:
  duration_seconds: 480
  completed_date: "2026-04-09"
  tasks_completed: 2
  files_changed: 8
---

# Phase 3 Plan 4: Route-Registration und Placeholder-Pages Summary

**One-liner:** Vollstaendiger React Router mit PrivateRoute > AppShell > 7 Kind-Routen und 5 Electric Noir Placeholder-Pages fuer alle Modul-Pfade.

## Was wurde gebaut

Die App ist jetzt vollstaendig navigierbar — kein 404 auf einem der 7 registrierten Pfade.

**routes.tsx** — Komplett neu strukturiert:
- Alte Struktur: `PrivateRoute > App` (Phase-2-Placeholder)
- Neue Struktur: `PrivateRoute > AppShell > 7 Kind-Routen`
- AppShell als pathloser Layout-Wrapper (React Router Layout Route Pattern)
- Alle 7 Pfade unter PrivateRoute: kein unauthentifizierter Zugriff moeglich
- Kein `import App` mehr — Phase-2-Placeholder vollstaendig ersetzt

**5 Placeholder-Pages** — Identisches visuelles Muster fuer jede Seite:
- Material Symbol Icon in `--color-primary` (#cc97ff), gross (`text-5xl`)
- Modul-Titel in `--font-headline` / `--color-on-surface` (#dee5ff)
- Kurztext in `--color-on-surface-variant` (#a3aac4)
- PageWrapper als Layout-Wrapper fuer konsistenten Innen-Abstand
- Icons identisch zu navConfig.ts: task_alt, calendar_month, headphones, account_balance_wallet, shopping_cart

**2 temporaere Stubs** (DashboardPage.tsx, SettingsPage.tsx):
- Minimal-Komponenten als Compile-Target
- Kommentar verweist explizit auf Plan 05 als Ueberschreiber
- Kein Placeholder-Hinweistext — werden vollstaendig ersetzt

## Commits

| Task | Commit | Beschreibung |
|------|--------|--------------|
| 3.4-1 | ee27d58 | 5 Placeholder-Pages mit Electric Noir Styling |
| 3.4-2 | 4dcf2f9 | Router mit AppShell als Layout-Route und 7 Kind-Routen |

## Deviations from Plan

### Auto-fixed Issues

Keine — Plan wurde exakt wie spezifiziert implementiert.

### Implementierungsdetails (keine Abweichung)

**CSS Custom Properties statt Tailwind-Klassen in Pages**
- Der Plan-Template verwendet `text-primary`, `font-headline` und `text-on-surface-variant` als Tailwind-Klassen.
- In Tailwind v4 sind diese ueber `@theme`-Block verfuegbar, aber das etablierte Pattern in der Codebase (LoginPage, AppShell, Sidebar) nutzt konsequent `style={{ color: 'var(--color-...)' }}` und `style={{ fontFamily: 'var(--font-...)' }}`.
- Konsequenz: Einheitliches Pattern beibehalten statt gemischten Ansatz einzufuehren.
- **Impact:** Kein visueller Unterschied, bessere Konsistenz.

## Known Stubs

| Stub | Datei | Zeile | Grund |
|------|-------|-------|-------|
| DashboardPage | `frontend/src/pages/DashboardPage.tsx` | 5-9 | Temporaerer Compile-Target — Plan 05 implementiert vollstaendige Dashboard-Seite |
| SettingsPage | `frontend/src/pages/SettingsPage.tsx` | 5-9 | Temporaerer Compile-Target — Plan 05 implementiert vollstaendige Settings-Seite |

Diese Stubs verhindern NICHT das Ziel dieses Plans (navigierbare App mit allen 7 Routen). Sie sind bewusst als Platzhalter markiert und werden in Plan 05 ueberschrieben.

## Threat Flags

Keine neuen Sicherheits-relevanten Oberflaechen. Alle 7 Modul-Routen sind als children von PrivateRoute verschachtelt — JWT-Pruefung greift auf allen Pfaden ausser /login.

## Self-Check: PASSED

- [x] routes.tsx: PrivateRoute > AppShell > 7 Kind-Routen (commit 4dcf2f9)
- [x] Alle 7 Pfade registriert: /, /tasks, /calendar, /dj, /finances, /amazon, /settings
- [x] Kein `import App` mehr in routes.tsx
- [x] TasksPage.tsx: existiert, PageWrapper, material-symbols-outlined, task_alt
- [x] CalendarPage.tsx: existiert, PageWrapper, material-symbols-outlined, calendar_month
- [x] DjPage.tsx: existiert, PageWrapper, material-symbols-outlined, headphones
- [x] FinancesPage.tsx: existiert, PageWrapper, material-symbols-outlined, account_balance_wallet
- [x] AmazonPage.tsx: existiert, PageWrapper, material-symbols-outlined, shopping_cart
- [x] DashboardPage.tsx: temporaerer Stub vorhanden
- [x] SettingsPage.tsx: temporaerer Stub vorhanden
- [x] TypeScript fehlerfrei
- [x] Commits ee27d58 und 4dcf2f9 vorhanden
- [x] Kein raw hex in JSX/TSX
