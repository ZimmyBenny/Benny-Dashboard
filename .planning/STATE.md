---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Executing Phase 3
stopped_at: "Checkpoint 260411-ea1 Task 4: UAT — Vollstaendige Arbeitsmappe V1"
last_updated: "2026-04-11T08:34:38.131Z"
progress:
  total_phases: 3
  completed_phases: 3
  total_plans: 15
  completed_plans: 15
  percent: 100
---

# Project State: Benny Dashboard

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-07)

**Core value:** Alles an einem Ort, lokal und privat — ohne Cloud-Abhängigkeiten, ohne Reibung beim täglichen Zugriff.
**Current milestone:** Milestone 1 — Foundation → Working Dashboard Shell
**Current focus:** Phase 3 — Shell + Design System

## Current Status

| Phase | Status |
|-------|--------|
| Phase 1: Foundation | Complete (2026-04-08) |
| Phase 2: Auth Layer | Complete (2026-04-08) |
| Phase 3: Shell + Design System | Not started |

## Progress

[██████░░░░] 60% — 6/10 plans complete

**Stopped at:** Checkpoint 260411-ea1 Task 4: UAT — Vollstaendige Arbeitsmappe V1

## Decisions Made

### Phase 2

- **bcryptjs over bcrypt (native):** Use bcryptjs (pure JS) — avoids node-gyp-build failures on iCloud Drive paths. Single-user local app, 30% performance difference irrelevant. (02-01)
- **tsconfig rootDir = ".":** Changed rootDir from `./src` to `.` to include `scripts/` directory alongside `src/` without TS6059 errors. (02-01)
- **Cost factor 12 hardcoded:** bcrypt cost factor hardcoded to 12 in seed script, not read from env, to prevent weakening. (02-01)
- [Phase 02]: Rate limiter applied per-route on /login only (T-02.2-05); identical 401 for missing user and wrong password (OWASP); jwt.sign always uses explicit HS256 algorithm pin (T-02.2-02)
- [Phase 02]: algorithms: ['HS256'] as literal array in jwt.verify — never read from config to prevent weakening (02-03)
- [Phase 02]: verifyToken catch block returns generic INVALID_TOKEN; no error.message leaked to client (02-03)
- [Phase 02]: baseURL '/api' relative in axios client (not full host) — Vite proxy handles routing; enforces parity between dev and future prod (02-04)
- [Phase 02]: module-level redirecting flag in apiClient guards against 401 navigation storm from concurrent requests (02-04)
- [Phase 02]: PrivateRoute returns null (not spinner) during Zustand persist rehydration — localStorage sync means 1-frame gate with no visible flash (02-05)
- [Phase 02]: App.tsx repurposed as temp authenticated placeholder for Phase 2 UAT — Phase 3 replaces with AppShell (02-05)

## Open Decisions (must resolve before Milestone 2)

1. **Amazon module scope** — Purchase log, wishlist tracker, or return deadline tracker?
2. **DJ → Finance cross-module write pattern** — Dual-write in route, shared service, or manual user action?

## Critical Reminders

- SQLite DB MUST be at `~/.local/share/benny-dashboard/dashboard.db` — NOT inside iCloud Drive
- Run `npx @tailwindcss/upgrade` before writing any Tailwind component
- All Electric Noir tokens go in CSS `@theme` — never raw hex in JSX

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260410-dtr | Zeiterfassung Export CSV+PDF und Projekt-Schnellstart | 2026-04-10 | e59656f | [260410-dtr-zeiterfassung-export-csv-pdf-und-projekt](.planning/quick/260410-dtr-zeiterfassung-export-csv-pdf-und-projekt/) |
| 260410-ub6 | Aufgaben-Modul V1: Kanban-Board, CRUD-Backend, Slide-Over, Dashboard-Widget | 2026-04-10 | e176dfb | [260410-ub6-aufgaben-modul-v1-sqlite-tasks-tabelle-c](.planning/quick/260410-ub6-aufgaben-modul-v1-sqlite-tasks-tabelle-c/) |
| 260411-i4e | Arbeitsmappe V1.2: Multi-Select Anhänge + Unterseiten (eine Ebene) | 2026-04-11 | 2e1be72 | [260411-i4e-arbeitsmappe-v1-2-multi-select-anh-nge-u](.planning/quick/260411-i4e-arbeitsmappe-v1-2-multi-select-anh-nge-u/) |

---
*State initialized: 2026-04-07 | Last session: 2026-04-10*
| 2026-04-10 | fast | TaskCard onClick → SlideOver fix (PointerSensor distance constraint) | ✅ |
| 2026-04-10 | fast | TaskSlideOver Backdrop-Klick schließt Panel nicht mehr | ✅ |
| 2026-04-10 | 260410-v3q | Status-Notiz beim Drag (DragPrompt + DB-Migration + KanbanBoard-Pause) | ✅ |
| 2026-04-11 | 260410-wn7 | Kalender-Modul V1 — Apple Calendar Sync (JXA/AppleScript, bidirektional, Sync-Log, Kalender-Erkennung) | ✅ |
| 2026-04-11 | fast | DashboardPage: Offene Aufgaben-Zahl immer anzeigen — auch wenn 0 | ✅ |
