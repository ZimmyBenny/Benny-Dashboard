# Benny Dashboard

## What This Is

Ein persönliches, lokal laufendes Command Center für Alltag und Arbeit. Das Dashboard bündelt verschiedene Lebensbereiche — Aufgaben, Kalender, DJ-Business, Finanzen, Amazon — in einer einzigen geschützten Anwendung mit einheitlichem Electric Noir Design. Gebaut als skalierbare Basis, die schrittweise um neue Module erweitert werden kann.

## Core Value

Alles an einem Ort, lokal und privat — ohne Cloud-Abhängigkeiten, ohne Reibung beim täglichen Zugriff.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] JWT-basiertes Login-System (Single User, kein Registrierungsflow)
- [ ] Geschützte Hauptansicht — alle Routen hinter Auth
- [ ] Collapsible Sidebar (icon-only im eingeklappten Zustand) zur Navigation
- [ ] Startseite mit Übersichtskarten für alle Hauptbereiche
- [ ] Navigationsstruktur: Dashboard, Aufgaben, Kalender, Amazon, DJ, Finanzen, Einstellungen
- [ ] Electric Noir Design System durchgängig umgesetzt (Farben, Typografie, Glassmorphism, keine Divider)
- [ ] Wiederverwendbare Layout-Komponenten (PageWrapper, Card, Sidebar, Header)
- [ ] Backend: Express + SQLite, läuft lokal (kein externer Datenbankserver)
- [ ] Jede Seite als eigenständiges Modul — placeholder-ready für spätere Funktionen

### Out of Scope

- Cloud-Hosting oder Remote-Zugriff — lokal only, bewusste Entscheidung für Privatsphäre
- Multi-User / Registrierungssystem — nur ein Account (der des Benutzers)
- Vollständige Modulimplementierung in v1 — Aufgaben, Kalender, Amazon, DJ, Finanzen sind Platzhalter, kein Feature-Scope in Milestone 1
- Mobile-App oder native Anwendung — läuft im Browser, kein Cordova/Capacitor

## Context

- Design System: **Electric Noir** — definiert in `Design/stitch_screenshot_of_https_www.dein_event_dj.com 3/design.md`. Kernregeln: Hintergrund `#060e20`, Akzente `#cc97ff` (primary) und `#34b5fa` (secondary), Glassmorphism für Cards, keine 1px-Borders, keine Drop Shadows (stattdessen Ambient Glows), Typografie Epilogue + Inter.
- Das Projekt startet als technisch saubere Basis. Ziel ist nicht ein Mockup, sondern eine Production-ready-Architektur, die modular erweiterbar ist.
- Alle Daten bleiben lokal (SQLite-Datei auf dem Rechner des Benutzers).
- Das Design-System ist bereits vollständig dokumentiert und enthält alle Farben, Komponenten-Regeln und typografischen Vorgaben.

## Constraints

- **Stack**: React + Vite + Tailwind (Frontend), Node.js + Express + SQLite (Backend) — festgelegt durch den Benutzer
- **Auth**: JWT — kein OAuth, kein Session-Cookie-only-Ansatz
- **Lokaler Betrieb**: Kein Build für externe Server, dev-server + express lokal
- **Design**: Electric Noir Design System ist verbindlich — kein Abweichen von Farbpalette und Komponentenregeln
- **Skalierbarkeit**: Architektur muss neue Module (Seiten + Backend-Routes) ohne Umbau der Basis aufnehmen können

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| SQLite statt PostgreSQL/MySQL | Lokal, keine Serverinstanz nötig, passt zu single-user use case | — Pending |
| JWT statt Sessions | Zustandslos, einfach erweiterbar, passt zu SPA-Architektur | — Pending |
| Vite statt CRA | Schneller Dev-Server, modernes Tooling, bessere DX | — Pending |
| Sidebar icon-only collapse | Spart Platz, Orientierung bleibt erhalten, kein komplettes Ausblenden | — Pending |
| Separate frontend/backend Prozesse | Klare Trennung, backend unabhängig erweiterbar, standard für lokale SPA+API | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-07 after initialization*
