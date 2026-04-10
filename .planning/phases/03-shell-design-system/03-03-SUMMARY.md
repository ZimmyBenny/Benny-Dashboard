---
phase: 03-shell-design-system
plan: "03"
subsystem: frontend/layout
tags: [appshell, sidebar, header, navigation, zustand, persist, react-router]
dependency_graph:
  requires:
    - Electric Noir CSS-Token-Palette (03-01)
    - UI-Primitives Card/Button/Input/PageWrapper (03-02)
  provides:
    - uiStore mit sidebarCollapsed + persist('benny-ui')
    - navConfig als Single Source of Truth fuer 7 Nav-Items
    - Sidebar: collapsible 52px/240px, 150ms ease-out, CSS-Tooltips, mt-auto Settings
    - Header: App-Name links, dynamischer Seitenname rechts
    - AppShell: Sidebar + Header + Outlet, Keyboard-Shortcut [
  affects:
    - frontend/src/store/uiStore.ts
    - frontend/src/components/layout/navConfig.ts
    - frontend/src/components/layout/Sidebar.tsx
    - frontend/src/components/layout/Header.tsx
    - frontend/src/components/layout/AppShell.tsx
tech_stack:
  added: []
  patterns:
    - Zustand + persist fuer UI-State (identisches Pattern zu authStore)
    - NavLink className-Callback mit isActive fuer aktiven Route-State
    - CSS Custom Properties fuer alle Farben (kein raw hex in JSX/TSX)
    - CSS-Tooltip via group/group-hover Tailwind-Pattern (kein title-Attribut)
    - useEffect + removeEventListener Cleanup fuer Keyboard-Shortcut
key_files:
  created:
    - frontend/src/store/uiStore.ts
    - frontend/src/components/layout/navConfig.ts
    - frontend/src/components/layout/Sidebar.tsx
    - frontend/src/components/layout/Header.tsx
    - frontend/src/components/layout/AppShell.tsx
  modified: []
decisions:
  - "CSS-Tooltip statt nativem title-Attribut — kein Delay, bessere UX, Electric Noir Styling"
  - "Settings in eigenem mt-auto-Wrapper statt direktem mt-auto auf NavLink — flexibler fuer kuenftige Items"
  - "NavLink isActive mit style-Prop fuer --color-primary (CSS-Variable) + className fuer background"
metrics:
  duration_seconds: 452
  completed_date: "2026-04-10"
  tasks_completed: 2
  files_changed: 5
---

# Phase 3 Plan 3: AppShell Layout (Sidebar + Header + uiStore) Summary

**One-liner:** Collapsible Sidebar mit 7 Nav-Items, persistentem Zustand-State und Keyboard-Shortcut, Header mit dynamischem Seitennamen und AppShell als zentraler Layout-Wrapper fuer alle authentifizierten Routen.

## Was wurde gebaut

Das App-Layout fuer alle authentifizierten Seiten ist vollstaendig implementiert:

**uiStore.ts** — Zustand-Store mit `sidebarCollapsed` Boolean, `toggleSidebar()` und `setSidebarCollapsed(value)` Actions. Persistiert unter dem Key `'benny-ui'` in localStorage — ueberlebt Page-Reloads. Identisches Pattern zu `authStore.ts`.

**navConfig.ts** — Single Source of Truth fuer alle 7 Navigationspunkte: 6 Haupt-Items in `navItems[]` + separates `settingsItem` (kein Teil des Arrays, wird separat gerendert per D-09). Zusaetzlich `pageNames` Record fuer Header-Seitennamen-Mapping.

**Sidebar.tsx** — Collapsible Sidebar mit:
- 52px (collapsed, Icon-only) / 240px (expanded, Icons + Labels), Transition 150ms ease-out
- Material Symbols Outlined Icons fuer alle Items
- NavLink mit `isActive`-Callback: aktive Route erhaelt `var(--color-primary)` (#cc97ff) + `var(--color-surface-container-high)` Background
- Dashboard-Route mit `end` Prop (kein false-positive Match auf Sub-Routen)
- CSS-Tooltips via Tailwind `group`/`group-hover` — nur sichtbar im collapsed Zustand, Electric Noir Styling
- Settings am unteren Ende via `mt-auto`-Wrapper, kein Divider, keine Linie (per D-09)
- Kein `backdrop-filter` (per D-06)

**Header.tsx** — Fester Header ohne Blur:
- Links: "Benny Dashboard" in Headline-Font/Bold
- Rechts: Aktueller Seitenname via `useLocation()` + `pageNames` Mapping, Fallback auf Pathname
- Kein `backdrop-filter` (per D-06), kein Shadow, kein Border-Bottom (per D-07)

**AppShell.tsx** — Root-Layout fuer alle geschuetzten Seiten:
- `<Sidebar />` + `<Header />` + `<Outlet />` in einem `flex h-screen`-Container
- Keyboard-Shortcut `[` togglet Sidebar via `useUiStore.toggleSidebar()`
- Guard fuer Eingabefelder: `HTMLInputElement`, `HTMLTextAreaElement`, `HTMLSelectElement` werden uebersprungen (per D-12, SHELL-06)
- useEffect mit sauberem `removeEventListener` Cleanup

## Commits

| Task | Commit | Beschreibung |
|------|--------|--------------|
| 3.3-1 | a4373a1 | uiStore + navConfig |
| 3.3-2 | 057af02 | Sidebar + Header + AppShell |

## Deviations from Plan

### Auto-fixed Issues

Keine — Plan wurde exakt wie spezifiziert implementiert.

### Implementierungsdetails (keine Abweichung)

**CSS-Tooltip statt nativem title-Attribut**
- **Begruendung:** Nativer Browser-Tooltip hat variablen Delay und kein Electric Noir Styling. CSS-Tooltip via Tailwind `group`/`group-hover` liefert sofortiges Erscheinen und passendes Styling.
- **Impact:** Bessere UX, kein Sicherheitsimpact, kein Abweichen von Design-Anforderungen.

**Settings in eigenem `mt-auto`-Wrapper**
- **Begruendung:** `mt-auto` direkt auf einem NavLink-Wrapper statt auf dem NavLink selbst — flexibler fuer kuenftige Erweiterungen (z.B. zweite untere Sektion).
- **Impact:** Identisches visuelles Ergebnis, keine Abweichung von D-09.

## Known Stubs

Keine — alle Komponenten sind vollstaendig implementiert. Die AppShell ist bereit fuer Route-Registration in Plan 04.

## Threat Flags

Keine neuen Sicherheits-relevanten Oberflaechen. Keyboard-Shortcut-Guard (HTMLInputElement/HTMLTextAreaElement/HTMLSelectElement) korrekt implementiert per Threat-Modell-Anforderung.

## Self-Check: PASSED

- [x] uiStore.ts: persist('benny-ui'), toggleSidebar, setSidebarCollapsed
- [x] navConfig.ts: 6 navItems + settingsItem + pageNames mit allen 7 Routes
- [x] Sidebar.tsx: NavLink, mt-auto, end Prop auf /, CSS-Tooltip, 52px/240px, 150ms
- [x] Header.tsx: "Benny Dashboard" links, dynamischer Seitenname rechts
- [x] AppShell.tsx: Outlet, Keyboard-Shortcut [, Input-Guard
- [x] Kein raw hex in JSX/TSX
- [x] Commits a4373a1, 057af02 vorhanden
- [x] TypeScript fehlerfrei
