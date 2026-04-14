<!-- GSD:project-start source:PROJECT.md -->
## Project

**Benny Dashboard**

Ein persönliches, lokal laufendes Command Center für Alltag und Arbeit. Das Dashboard bündelt verschiedene Lebensbereiche — Aufgaben, Kalender, DJ-Business, Finanzen, Amazon — in einer einzigen geschützten Anwendung mit einheitlichem Electric Noir Design. Gebaut als skalierbare Basis, die schrittweise um neue Module erweitert werden kann.

**Core Value:** Alles an einem Ort, lokal und privat — ohne Cloud-Abhängigkeiten, ohne Reibung beim täglichen Zugriff.

### Constraints

- **Stack**: React + Vite + Tailwind (Frontend), Node.js + Express + SQLite (Backend) — festgelegt durch den Benutzer
- **Auth**: JWT — kein OAuth, kein Session-Cookie-only-Ansatz
- **Lokaler Betrieb**: Kein Build für externe Server, dev-server + express lokal
- **Design**: Electric Noir Design System ist verbindlich — kein Abweichen von Farbpalette und Komponentenregeln
- **Skalierbarkeit**: Architektur muss neue Module (Seiten + Backend-Routes) ohne Umbau der Basis aufnehmen können
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack (2025)
| Layer | Technology | Version | Purpose | Confidence |
|-------|-----------|---------|---------|------------|
| Frontend framework | React | 19.x | UI component model | HIGH |
| Build tool | Vite | 6.x | Dev server + bundler | HIGH |
| Styling | Tailwind CSS | 4.2.x | Utility-first CSS | HIGH |
| Tailwind integration | @tailwindcss/vite | 4.2.x | Vite plugin (replaces PostCSS setup) | HIGH |
| Routing | React Router | 7.x | SPA routing + protected routes | HIGH |
| Client state | Zustand | 5.x | Auth state, UI state, sidebar collapse | MEDIUM |
| Server data | TanStack Query | 5.x | API data fetching + caching | MEDIUM |
| Backend framework | Express | 5.x | REST API server | MEDIUM |
| Database driver | better-sqlite3 | 11.x | Synchronous SQLite driver | HIGH |
| Query builder | Drizzle ORM | 0.x | Type-safe SQL for SQLite | MEDIUM |
| JWT | jsonwebtoken | 9.x | Token signing/verification | HIGH |
| Language | TypeScript | 5.x | Type safety across both layers | HIGH |
| Runtime | Node.js | 20 LTS or 22 LTS | Backend runtime | HIGH |
## Key Library Decisions
### 1. Vite + React + Tailwind v4 Setup
- `shadow-sm` is now `shadow-xs`, `shadow` is now `shadow-sm`
- `ring` default is now 1px not 3px (use `ring-3` explicitly)
- Border/ring utilities default to `currentColor` — specify colors explicitly
- `outline-none` renamed to `outline-hidden`
- No `tailwind.config.js` auto-detected in v4 — define custom tokens in CSS `@theme` block
- Sass/Less/Stylus are incompatible with Tailwind v4
### 2. Express 5 (greenfield — no reason to use 4)
- Async route errors propagate automatically — no try/catch boilerplate
- Named wildcards: `/*splat` not `/*`
- Optional params: `/:file{.:ext}` not `/:file.:ext?`
### 3. better-sqlite3 vs sqlite3
### 4. ORM: Drizzle (not Prisma)
### 5. JWT: jsonwebtoken (not jose)
- Access token: 7-day lifetime, stored in localStorage (acceptable for localhost — see Pitfalls)
- On 401: Zustand logout + redirect to /login
### 6. State: Zustand + TanStack Query (dual strategy)
| State type | Tool | Examples |
|-----------|------|---------|
| Auth state | Zustand | `isAuthenticated`, `token` |
| UI state | Zustand | `sidebarCollapsed` |
| Server data | TanStack Query | tasks, finance entries, DJ bookings |
| Mutations | TanStack Query `useMutation` | create/update/delete |
### 7. React Router v7 (Declarative/Library mode)
## Project Structure
## What NOT to Use
| Technology | Reason |
|-----------|--------|
| `sqlite3` (npm) | Async/callback API, slower. Use better-sqlite3. |
| Prisma | Requires query engine binary. Cloud-designed. Overkill. |
| Passport.js | Abstraction overhead for a single-user, single-auth-flow app. |
| `jose` | Edge/serverless JWT library. Unnecessary async complexity for Express. |
| TanStack Router | Overkill for 7 fixed routes. |
| Redux Toolkit | Team-scale state management. Unnecessary. |
| Turborepo / Nx | Two-process setup doesn't need monorepo tooling. |
| Sass / Less / Stylus | Incompatible with Tailwind v4. |
| Create React App | Unmaintained since 2023. |
## Confidence Assessment
| Area | Confidence | Basis |
|------|-----------|-------|
| Tailwind v4 + Vite setup | HIGH | Official docs verified |
| React Router v7 | HIGH | Official docs verified |
| Express 5 | MEDIUM | API docs confirmed stable |
| better-sqlite3 | HIGH | Ecosystem consensus |
| jsonwebtoken | HIGH | Industry standard |
| Drizzle ORM | MEDIUM | Strong adoption; confirm versions at install |
| Zustand + TanStack Query | MEDIUM | Standard 2025 pattern |
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

### Datensicherheit — oberste Priorität

**Daten dürfen niemals durch Code-Änderungen oder neue Features verloren gehen.**

#### Regel: Backup vor destruktiven Bulk-Operationen

Jede Operation die bestehende Daten in größerem Umfang verändern oder löschen kann, **muss** vorher `createBackup(label)` aus `backend/src/db/backup.ts` aufrufen:

```ts
import { createBackup } from '../db/backup';

// Vor der Operation:
createBackup('mein-feature-import');
```

**Gilt für:**
- Migrations mit DROP TABLE / REBUILD (bereits in migrate.ts integriert)
- CSV/VCF/JSON-Importe (bereits in contacts.routes.ts integriert)
- Jede neue Route die Massen-Inserts, Massen-Updates oder Massen-Deletes ausführt
- Jedes neue Modul mit Import-Funktionalität (z.B. zukünftig: Amazon, Finanzen, DJ-Bookings)

**Gilt nicht für:**
- Einzelne CRUD-Operationen (create/update/delete eines einzelnen Eintrags)
- Lesende Operationen

#### Regel: SQLite Migrations

- `PRAGMA foreign_keys` niemals in einer Migration setzen — wird in `migrate.ts` zentral gesteuert
- Migrationen die Tabellen rebuilden (DROP + CREATE + INSERT SELECT *) sind erlaubt, da migrate.ts foreign_keys korrekt handhabt
- Backup vor Migrationen ist automatisch — kein manueller Aufruf nötig
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
