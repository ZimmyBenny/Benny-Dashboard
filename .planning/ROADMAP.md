# Roadmap: Benny Dashboard

**Milestone 1:** Foundation → Working Dashboard Shell
**Granularity:** Standard
**Coverage:** 56/56 Milestone 1 requirements mapped
**Last updated:** 2026-04-07

---

## Phases

- [x] **Phase 1: Foundation** — Repo wired, backend running, SQLite with WAL + migrations, Vite proxy verified (completed 2026-04-08)
- [x] **Phase 2: Auth Layer** — JWT login, Zustand authStore, axios interceptors, PrivateRoute, login page (completed 2026-04-08)
- [ ] **Phase 3: Shell + Design System** — Electric Noir tokens, AppShell, collapsible sidebar, all 7 module routes, UI primitives, Home page, Settings page

---

## Phase Details

---

### Phase 1: Foundation

**Goal:** The full project skeleton exists and all three layers — frontend, backend, database — are wired together and verifiable. Running `npm run dev` starts both processes; hitting `/api/health` returns `{ status: "ok" }` through the Vite proxy; migrations have run and the `user` table exists.

**Plans:**
5/5 plans complete
- [x] **Plan 1.2 — Vite + React + Tailwind v4 frontend baseline.** Initialize Vite with React + TypeScript template. Install `@tailwindcss/vite` plugin (not the PostCSS path). Wire `@import "tailwindcss"` in `styles/index.css`. Confirm dev server starts on port 5173 and renders a blank React root.
- [x] **Plan 1.3 — Express server skeleton with health endpoint.** Bootstrap Express 5 app in `backend/src/`. Expose `GET /api/health → { status: "ok" }`. Wire global error handler as last middleware. Confirm server starts on port 3001 and responds correctly.
- [x] **Plan 1.4 — SQLite connection, WAL mode, and migration runner.** Create `db/connection.ts` as a `better-sqlite3` singleton with `PRAGMA journal_mode = WAL`, `PRAGMA foreign_keys = ON`, and `PRAGMA busy_timeout = 5000`. Set `DB_PATH` to `~/.local/share/benny-dashboard/dashboard.db` — never inside the iCloud Drive working directory. Implement `db/migrate.ts` that creates the `_migrations` table, reads numbered `.sql` files from `db/migrations/`, and applies unapplied files on each server start. Write `001_initial.sql` with the `user` table (`CHECK (id = 1)`). Call `runMigrations()` in `server.ts` before `app.listen()`.
- [x] **Plan 1.5 — Vite proxy verification.** Add `/api` proxy in `vite.config.ts` pointing to `http://localhost:3001`. Confirm a fetch to `/api/health` from the frontend dev server returns `{ status: "ok" }` without CORS errors.

**Depends on:** —

**UAT:**
- `npm run dev` starts both processes concurrently with no errors
- `GET http://localhost:3001/api/health` returns `{ status: "ok" }` directly
- `GET http://localhost:5173/api/health` returns `{ status: "ok" }` through the Vite proxy (no CORS error)
- SQLite file exists at `~/.local/share/benny-dashboard/dashboard.db` (NOT inside iCloud Drive)
- `SELECT name FROM _migrations` returns `001_initial.sql`
- `PRAGMA journal_mode` on the database returns `wal`
- `user` table exists with the correct `CHECK (id = 1)` constraint
- `.env` is gitignored; `.env.example` is committed with placeholder values
- TypeScript compiles without errors on both frontend and backend

**Traceability:** FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, FOUND-06, FOUND-07, FOUND-08, FOUND-09, FOUND-10, FOUND-11, FOUND-12

---

### Phase 2: Auth Layer

**Goal:** A single user can log in with a username and password and receive a JWT. The token persists across browser reloads, is attached to every API request, and all routes except `/login` are inaccessible without it. The auth layer is hardened against the known risks for a local JWT setup.

**Plans:**
5/5 plans complete
- [x] **Plan 2.2 — JWT login endpoint with rate limiting.** Implement `POST /api/auth/login` in `routes/auth.routes.ts`. Accept `{ username, password }`, look up the single user row, compare with `bcrypt.compare`, sign a 7-day JWT with `algorithms: ['HS256']`. Apply `express-rate-limit` to the login endpoint (10 requests per 15 minutes). Implement `POST /api/auth/logout` as a no-op that signals client-side logout. Register auth routes in `app.ts` as a public route (no `verifyToken` applied).
- [x] **Plan 2.3 — `verifyToken` middleware protecting all non-auth API routes.** Implement `middleware/auth.ts` as a `verifyToken` function using `jwt.verify` with explicit `{ algorithms: ['HS256'] }`. Apply it per-router in `app.ts` to every `/api/*` route except `/api/auth/*`. Test that a request without a token to a protected route returns 401, and that the public `/api/health` and `/api/auth/*` routes remain accessible without a token.
- [x] **Plan 2.4 — Zustand authStore, axios client, and interceptors.** Create `store/authStore.ts` with Zustand + `persist` middleware writing to localStorage. Expose `token`, `login(token)`, and `logout()`. Create `api/client.ts` as an axios instance with a request interceptor that reads the token from the store and adds `Authorization: Bearer <token>`, and a response interceptor that calls `logout()` and redirects to `/login` on any 401. Create `api/auth.api.ts` with `loginRequest` and `logoutRequest` functions.
- [x] **Plan 2.5 — Login page, PrivateRoute, and route protection.** Build `LoginPage` with Electric Noir styling: dark background, glass-style form card, username + password inputs, primary gradient submit button. Wire `<PrivateRoute>` that reads `token` from `authStore` and returns `<Outlet />` or `<Navigate to="/login" replace />`. Register routes in `routes/routes.tsx`: `/login` is public; all other routes are nested under `<PrivateRoute>`. Verify session survives browser reload.

**Depends on:** Phase 1

**UAT:**
- `POST /api/auth/login` with correct credentials returns a JWT
- `POST /api/auth/login` with wrong credentials returns 401 (not 500)
- After 10 login attempts in 15 minutes the endpoint returns 429
- Server startup fails with a clear error when `JWT_SECRET` is absent from `.env`
- `GET /api/health` (or any protected route) without a token returns 401
- Visiting `/` without a token redirects to `/login`
- Login redirects to `/` and the route is accessible
- Browser reload on `/` keeps the user logged in (token in localStorage)
- After logout, navigating to `/` redirects back to `/login`
- All API requests from the frontend include `Authorization: Bearer <token>`
- A 401 response from any API call logs the user out and redirects to `/login`

**Traceability:** AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07, AUTH-08, AUTH-09, AUTH-10, AUTH-11, AUTH-12, AUTH-13

---

### Phase 3: Shell + Design System

**Goal:** The Electric Noir design system is fully implemented as CSS tokens and reusable components. The authenticated app has a working shell — a collapsible sidebar with all 7 navigation entries, a persistent header, and smooth keyboard-driven collapse — with every module route registered and returning a styled placeholder. The Home dashboard and Settings page are fully complete.

**Plans:**
- [ ] **Plan 3.1 — Electric Noir CSS tokens and typography.** Define all design tokens in `styles/index.css` using Tailwind v4's `@theme` block: background `#060e20`, primary accent `#cc97ff`, secondary accent `#34b5fa`, and surface hierarchy layers. Load Epilogue (display/headlines) and Inter (body/labels) fonts. Enforce global rules: no 1px solid borders between sections, no drop shadows (only ambient glows using `0px 0px 12px rgba()` values), `backdrop-filter: blur()` restricted to cards and modals only (never sidebar or header), focus rings using `#cc97ff`. Style the CSS scrollbar to match Electric Noir. Define blur and glow values as CSS variables (not Tailwind scale values) to prevent drift across future modules.
- [ ] **Plan 3.2 — UI primitives: Card, Button, Input, PageWrapper.** Build `components/ui/Card.tsx` with Glassmorphism: `surface-variant` background at 40% opacity + `backdrop-filter: blur(20px)`. Build `components/ui/Button.tsx` with two variants — Primary (gradient fill, fully rounded) and Secondary (glass style). Build `components/ui/Input.tsx` with three states — Default, Focus (secondary color glow), and Error. Build `components/layout/PageWrapper.tsx` that wraps all page content with consistent padding and scroll behavior. All components use only design token values — no raw hex in JSX.
- [ ] **Plan 3.3 — AppShell, Header, Sidebar with collapsible behavior.** Build `components/layout/navConfig.ts` as the single source of truth for navigation items (path, label, icon) for all 7 routes. Build `Sidebar.tsx` that iterates `navConfig`, highlights the active route with `#cc97ff`, puts Settings visually separated at the bottom, and shows icon-only at 48–56px when collapsed or full width (220–240px) with labels when expanded. Animate the collapse transition at 150–200ms ease-out. Show tooltips with labels when collapsed and the user hovers an icon. Implement keyboard shortcut `[` to toggle sidebar. Build `Header.tsx`. Assemble `AppShell.tsx` rendering Sidebar + Header + `<Outlet />`. Store collapsed state in `store/uiStore.ts` with Zustand + persist so it survives page reloads.
- [ ] **Plan 3.4 — All 7 module routes and placeholder pages.** Register all routes in `routes/routes.tsx` nested under `<PrivateRoute>` → `<AppShell>`: `/` (Dashboard/Home), `/tasks`, `/calendar`, `/dj`, `/finances`, `/amazon`, `/settings`. Create a `[Name]Page.tsx` placeholder for Tasks, Calendar, DJ, Finances, and Amazon modules — each uses `<PageWrapper>` and displays the module name and a "coming soon" note. No 404 for any of the 7 registered paths.
- [ ] **Plan 3.5 — Home dashboard page and Settings page.** Build `DashboardPage.tsx`: a greeting line ("Good morning, Benny"), a responsive grid (3 columns at 1280px+, 2 columns at 768px+) of 7 `<Card>` components — one per module — each showing icon, module name, and short microcopy description. Every card is fully clickable and navigates to the corresponding module route. Cards have a hover state with a subtle glow or border highlight. Build `SettingsPage.tsx`: a protected page showing app version and build info, a password change form that calls `POST /api/auth/change-password`, and a Logout button that clears the token and redirects to `/login`. Implement `POST /api/auth/change-password` on the backend (accepts old password + new password, bcrypt-hashes the new password, updates the `user` row).

**Depends on:** Phase 2

**UAT:**
- All design tokens load correctly; background renders as `#060e20`
- Epilogue and Inter fonts are visible in the browser
- `<Card>` shows glassmorphism blur effect; no hard borders, no drop shadows
- Button primary and secondary variants render distinctly per spec
- Input shows glow on focus and red error state when validation fails
- AppShell renders for every authenticated route with Sidebar + Header + page content
- Sidebar shows all 7 navigation entries; Settings is visually separated at the bottom
- Active route is highlighted with `#cc97ff`
- Sidebar collapses to icon-only (approx 52px) and expands to full width (approx 240px) with 150–200ms animation
- Pressing `[` toggles the sidebar from anywhere in the app
- Hovering a sidebar icon when collapsed shows a tooltip with the label
- Sidebar state (collapsed/expanded) persists across browser reloads
- Navigating to `/tasks`, `/calendar`, `/dj`, `/finances`, and `/amazon` returns a styled placeholder page — no 404
- Home grid shows 7 cards; each card is clickable and navigates to the correct route
- Home grid is 3 columns at 1280px viewport width and 2 columns at 768px
- Greeting line is visible on the Home page
- Settings page is accessible only when logged in
- Password change succeeds and the new password works on the next login attempt
- Logout from Settings clears the session and redirects to `/login`

**Traceability:** SHELL-01, SHELL-02, SHELL-03, SHELL-04, SHELL-05, SHELL-06, SHELL-07, SHELL-08, SHELL-09, SHELL-10, SHELL-11, DS-01, DS-02, DS-03, DS-04, DS-05, DS-06, DS-07, DS-08, DS-09, DS-10, DS-11, HOME-01, HOME-02, HOME-03, HOME-04, HOME-05, HOME-06, SETT-01, SETT-02, SETT-03, SETT-04

---

## Phase Progress

| Phase | Plans Complete | Status | Completed |
|-------|---------------|--------|-----------|
| 1. Foundation | 5/5 | Complete   | 2026-04-08 |
| 2. Auth Layer | 5/5 | Complete   | 2026-04-08 |
| 3. Shell + Design System | 0/5 | Not started | — |

---

## Coverage Validation

| Requirement Group | Count | Phase |
|-------------------|-------|-------|
| FOUND-01 – FOUND-12 | 12 | Phase 1 |
| AUTH-01 – AUTH-13 | 13 | Phase 2 |
| SHELL-01 – SHELL-11 | 11 | Phase 3 |
| DS-01 – DS-11 | 11 | Phase 3 |
| HOME-01 – HOME-06 | 6 | Phase 3 |
| SETT-01 – SETT-04 | 4 | Phase 3 |
| **Total** | **56** | **3 phases** |

Unmapped: 0. Coverage: 56/56.

---

## v2+ Backlog

Future milestone phases — scope and plans defined at milestone start, not now.

| Phase | Goal |
|-------|------|
| M2-1: Tasks Module | Full task CRUD (create, edit, delete) with due dates, priority, status workflow (todo → in_progress → done), and filters; validates the 7-artifact module extension pattern at lowest complexity. |
| M2-2: Calendar Module | Monthly and weekly views with local event CRUD, today highlighting, color categories, and iCal/.ics file import; shares date infrastructure built for Tasks. |
| M2-3: Finance Module | Manual transaction entry (income/expense), monthly summary, per-category budget goals with progress bars, monthly comparison chart, and CSV export; requires charting library selection and DJ cross-module write pattern decision before schemas are written. |
| M2-4: DJ Module | Gig list with date/venue/client/payment status, status workflow (pending → paid → cancelled), per-gig notes, and optional auto-create of a Finance transaction on payment; depends on Finance module schema and cross-module write pattern decision. |
| M2-5: Amazon Module | Scope must be locked in writing before any code is written (purchase log vs. wishlist tracker vs. return deadline tracker — each implies a different schema and UX). |
| M2-6: Home (live data) | Upgrade the Home placeholder cards to show real counts and activity summaries (e.g. open tasks, upcoming events, outstanding gig payments) pulled from all completed modules. |
| M2-7: Settings Extensions | Data export (all SQLite data as JSON/CSV), manual backup trigger (`VACUUM INTO`), and keyboard shortcuts cheat-sheet modal. |

---

## Critical Notes

**DB path is non-negotiable.** This project lives inside iCloud Drive (`com~apple~CloudDocs`). SQLite WAL files conflict with iCloud's sync daemon. The database must be created at `~/.local/share/benny-dashboard/dashboard.db` from the very first line of Phase 1. Moving it later means downtime and potential WAL corruption.

**Tailwind v4 is a breaking change.** Run `npx @tailwindcss/upgrade` before writing any component. `shadow-sm` → `shadow-xs`, `ring` default is now 1px, `outline-none` → `outline-hidden`. All Electric Noir tokens go in `@theme` CSS — never raw hex in JSX.

**Open decisions before v2 build starts.** Two architectural questions must be answered in writing before Milestone 2 schemas are created: (1) Amazon module scope, (2) DJ → Finance cross-module write pattern. Neither blocks Milestone 1.

---

*Last updated: 2026-04-07*
