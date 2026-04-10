---
phase: 03-shell-design-system
plan: "02"
subsystem: frontend/ui-components
tags: [ui-components, glassmorphism, design-system, card, button, input, pagewrapper, vitest]
dependency_graph:
  requires:
    - Electric Noir CSS-Token-Palette (03-01)
    - glass-card CSS-Klasse (03-01)
    - Vitest Test-Infrastruktur (03-01)
  provides:
    - Card-Komponente mit Glassmorphism via .glass-card
    - Button-Komponente mit Primary (Gradient) und Secondary (Glass) Varianten
    - Input-Komponente mit Default, Focus und Error States
    - PageWrapper-Layout-Komponente mit konsistentem Padding
    - 41 Komponenten-Tests (100% bestanden)
  affects:
    - frontend/src/components/ui/Card.tsx
    - frontend/src/components/ui/Button.tsx
    - frontend/src/components/ui/Input.tsx
    - frontend/src/components/layout/PageWrapper.tsx
tech_stack:
  added: []
  patterns:
    - CSS Custom Properties fuer alle Farben (kein raw hex in JSX)
    - Inline-Styles fuer CSS-Variablen die Tailwind nicht nativ unterstuetzt
    - onMouseEnter/Leave Handler fuer Hover-Glow-Effekte
    - onFocus/Blur Handler fuer Input-State-Transitions
key_files:
  created:
    - frontend/src/components/ui/Card.tsx
    - frontend/src/components/ui/Button.tsx
    - frontend/src/components/ui/Input.tsx
    - frontend/src/components/layout/PageWrapper.tsx
    - frontend/src/test/components/Card.test.tsx
    - frontend/src/test/components/Button.test.tsx
    - frontend/src/test/components/Input.test.tsx
    - frontend/src/test/components/PageWrapper.test.tsx
  modified: []
decisions:
  - "Hover-Glow via onMouseEnter/Leave statt Tailwind hover: — CSS-Variablen in hover:-Selektoren nicht nativ unterstuetzt in Tailwind v4"
  - "Input Focus/Error-States via onFocus/Blur-Handler — ermoeglicht exakte --glow-secondary/--glow-error Kontrolle"
  - "color-mix() fuer Secondary-Button Border mit 30% Opacity — CSS-native Loesung ohne raw rgba"
metrics:
  duration_seconds: 312
  completed_date: "2026-04-10"
  tasks_completed: 3
  files_changed: 8
---

# Phase 3 Plan 2: UI-Primitives (Card, Button, Input, PageWrapper) Summary

**One-liner:** Vier Electric Noir UI-Primitives mit Glassmorphism, Gradient-Buttons und stateful Input implementiert — ausschliesslich CSS Custom Properties, 41 Tests bestanden.

## Was wurde gebaut

Die vier grundlegenden UI-Primitive des Electric Noir Design Systems sind implementiert:

**Card.tsx** — Glassmorphism-Card via `.glass-card` CSS-Klasse (rgba(25,37,64,0.4) + backdrop-filter:blur(20px)), optional hoverable mit Ambient Glow via `--glow-primary`. Unterstuetzt `as`-Prop fuer semantische HTML-Elemente (div/article/section) und `onClick` mit role=button.

**Button.tsx** — Zwei Varianten: Primary mit `linear-gradient(135deg, --color-primary, --color-primary-dim)`, fully rounded (9999px), schwarzer Text (`--color-on-primary-fixed`), Hover-Glow via `--glow-primary`. Secondary mit transparentem Hintergrund, backdrop-blur:12px, `color-mix()`-Border auf Basis `--color-outline-variant`.

**Input.tsx** — Drei Zustaende: Default (`--color-surface-container-low` Background, kein sichtbarer Border), Focus (`--color-secondary` Border + `--glow-secondary`), Error (`--color-error` Border + `--glow-error` dauerhaft). Optionale `label`- und `error`-Props.

**PageWrapper.tsx** — Einfacher Layout-Wrapper mit `flex-1 overflow-y-auto p-6 lg:p-8` fuer konsistentes Padding und Scroll-Verhalten in allen Pages.

## Commits

| Task | Commit | Beschreibung |
|------|--------|--------------|
| 3.2-1 | 23f4660 | Card und PageWrapper Komponenten |
| 3.2-2 | 1165b40 | Button-Komponente mit Primary und Secondary Varianten |
| 3.2-3 | 26ef589 | Input-Komponente mit Default, Focus und Error States |
| Tests | 6b60e82 | Komponenten-Tests fuer alle vier Primitives |

## Deviations from Plan

### Auto-fixed Issues

Keine technischen Bugs aufgetreten — Plan wurde exakt wie spezifiziert implementiert.

### Implementierungsdetails (kein Bug, keine Abweichung)

**Hover/Focus via Event-Handler statt reinen Tailwind-Klassen**
- **Begruendung:** CSS Custom Properties (--glow-primary, --glow-secondary, --glow-error) koennen in Tailwind v4 nicht direkt in `hover:box-shadow-[var(--glow-primary)]` Syntax verwendet werden — Tailwind unterstuetzt keine CSS-Variablen in beliebigen hover:-Utilities zuverlaessig
- **Loesung:** onMouseEnter/Leave fuer Button-Hover, onFocus/Blur fuer Input-States — identisches visuelles Ergebnis, exakte Kontrolle ueber CSS-Variablen
- **Kein Impact auf Korrektheit oder Design-Treue**

## Known Stubs

Keine — alle Komponenten sind vollstaendig implementiert mit echten Design-Token-Werten.

## Threat Flags

Keine neuen Sicherheits-relevanten Oberflaechen — reine Frontend-UI-Komponenten ohne Netzwerkzugriff, Datenbankzugriff oder Auth-Pfade.

## Self-Check: PASSED

- [x] Card.tsx existiert und exportiert `Card`
- [x] Button.tsx existiert und exportiert `Button`
- [x] Input.tsx existiert und exportiert `Input`
- [x] PageWrapper.tsx existiert und exportiert `PageWrapper`
- [x] Commits 23f4660, 1165b40, 26ef589, 6b60e82 vorhanden
- [x] Alle 41 Tests bestanden (`npm run test:run`)
- [x] TypeScript fehlerfrei (`npx tsc --noEmit`)
- [x] Kein raw hex in Komponenten-Dateien
