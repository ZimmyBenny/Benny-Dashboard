---
phase: 2
plan: 5
subsystem: frontend-routing
tags: [react-router, private-route, login-page, zustand-persist, electric-noir]
dependency_graph:
  requires: ["02-04"]
  provides: ["LoginPage", "PrivateRoute", "router", "RouterProvider"]
  affects: ["03-01"]
tech_stack:
  added: []
  patterns: ["createBrowserRouter + RouterProvider", "layout route PrivateRoute", "Zustand persist rehydration guard", "Electric Noir CSS token styling"]
key_files:
  created:
    - frontend/src/routes/PrivateRoute.tsx
    - frontend/src/pages/LoginPage.tsx
    - frontend/src/routes/routes.tsx
  modified:
    - frontend/src/main.tsx
    - frontend/src/App.tsx
key_decisions:
  - "PrivateRoute returns null (not a spinner) while hasHydrated() is false — 1-frame gate prevents flash to /login on reload"
  - "onFinishHydration callback + immediate double-check guards against race between render and useEffect"
  - "LoginPage error display uses #ff6b6b raw hex for error red (not yet a CSS token) — Phase 3 will add --color-error to @theme"
  - "App.tsx repurposed as temporary authenticated placeholder — Phase 3 replaces with AppShell"
metrics:
  duration_seconds: 103
  completed_date: "2026-04-08"
  tasks_completed: 3
  tasks_total: 4
  files_created: 3
  files_modified: 2
requirements:
  - AUTH-11
  - AUTH-12
status: complete
---

# Phase 2 Plan 5: LoginPage, PrivateRoute, and browser router wiring Summary

**One-liner:** React Router v7 createBrowserRouter with PrivateRoute using Zustand persist rehydration guard + Electric Noir LoginPage calling loginRequest + temporary authenticated placeholder with Logout button.

## What Was Built

### Task 1: PrivateRoute with rehydration handling

Created `frontend/src/routes/PrivateRoute.tsx` — a layout route component that:

- Reads `state.token` via single-value selector (not object selector) to avoid Zustand v5 re-render issue
- Initializes `hydrated` state from `useAuthStore.persist.hasHydrated()` synchronously (true on second mount because persist middleware caches)
- Registers `onFinishHydration` callback in `useEffect` with an immediate double-check to close the race window between render and effect
- Returns `null` (not a spinner) while not yet hydrated — localStorage sync in practice means this is a 1-frame gate with no visible flash
- Returns `<Navigate to="/login" replace />` (with `replace` to prevent back-button returning to protected route) when hydrated but no token
- Returns `<Outlet />` when authenticated and hydrated

### Task 2: LoginPage with Electric Noir styling

Created `frontend/src/pages/LoginPage.tsx` — a login form component that:

- Uses only CSS custom properties from `styles/index.css` for design colors (`var(--color-noir-bg)`, `var(--color-primary)`, `var(--color-secondary)`, `var(--glass-bg)`, `var(--glass-blur)`, `var(--glow-primary)`, `var(--color-surface-variant)`)
- Only raw hex values are `#ffffff` (input text — not a design token) and `#ff6b6b` (error red — not yet a token; Phase 3 will add `--color-error`)
- Uses `outline-hidden` (Tailwind v4 name, not `outline-none`)
- Has `autoComplete="username"` and `autoComplete="current-password"` for password manager support
- Calls `loginRequest(username, password)` on submit; navigates to `/` on success; shows error message on failure
- Disables submit button while `submitting` state is true (Rule T-02.5-06 mitigation)
- Bounces to `/` via `<Navigate replace>` when `token` is already set

### Task 3: Router wiring and server smoke-test

Created `frontend/src/routes/routes.tsx` using `createBrowserRouter`:
- `/login` as a top-level public route rendering `<LoginPage />`
- A pathless layout route with `element: <PrivateRoute />` containing `{ path: '/', element: <App /> }` as its only child

Updated `frontend/src/main.tsx`:
- Replaced direct `<App />` mount with `<RouterProvider router={router} />`
- Preserved existing `./styles/index.css` import path

Replaced `frontend/src/App.tsx` with temporary authenticated placeholder:
- Shows "Benny Dashboard — Authenticated" heading in Electric Noir tokens
- Includes a Logout button wired to `logoutRequest()` + `navigate('/login', { replace: true })`
- No raw hex colors — all design values via CSS custom properties

Smoke-tested: `GET http://localhost:5173/login` returned 200 HTML with dev servers running.

## Decisions Made

- **`null` not spinner in PrivateRoute:** localStorage hydration is synchronous — returning null renders nothing for at most 1 frame. A spinner component would be visible briefly on every reload for no benefit.
- **`#ff6b6b` error red as raw hex:** The Electric Noir design system has no `--color-error` token yet. Using a raw hex is acceptable as a temporary measure; a comment marks it for Phase 3 to tokenize.
- **App.tsx as temp placeholder:** Rather than creating a separate placeholder component, App.tsx is repurposed. Phase 3 will replace it with AppShell + sidebar — this minimizes the diff surface.

## Deviations from Plan

None — plan executed exactly as written.

## Threat Model Coverage

All mitigations marked in the threat register were implemented:

| Threat ID | Mitigation Applied |
|-----------|-------------------|
| T-02.5-01 | PrivateRoute returns null until hasHydrated() is true, then redirects if token missing |
| T-02.5-02 | `<Navigate replace>` used on both login→/ and logout→/login |
| T-02.5-03 | autoComplete="current-password" present; credentials POSTed via axios (URL never contains password) |
| T-02.5-04 | loginRequest maps 401/429/400 to generic user-facing strings (implemented in Plan 2.4) |
| T-02.5-06 | `submitting` state disables button; backend rate limiter caps at 10/15min |
| T-02.5-07 | routes.tsx is the single import boundary; LoginPage only imports from api/ and store/ |

Accepted risks T-02.5-05 documented in plan threat register.

## Known Stubs

None — all data flows are wired. App.tsx is a temporary placeholder by design (not a stub); it renders real authenticated state and a functional logout.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced. This plan is purely frontend routing and UI.

## Self-Check

| Item | Status |
|------|--------|
| frontend/src/routes/PrivateRoute.tsx | FOUND |
| frontend/src/pages/LoginPage.tsx | FOUND |
| frontend/src/routes/routes.tsx | FOUND |
| frontend/src/main.tsx (modified) | FOUND |
| frontend/src/App.tsx (modified) | FOUND |
| Commit 12b29be (Task 1) | FOUND |
| Commit ecbbab6 (Task 2) | FOUND |
| Commit c422207 (Task 3) | FOUND |
| npx tsc --noEmit | PASSED |
| GET /login returns 200 HTML | PASSED |

## Self-Check: PASSED

Human UAT: APPROVED (2026-04-08) — all 8 UAT steps passed.
