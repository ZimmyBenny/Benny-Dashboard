---
phase: 2
plan: 4
subsystem: frontend-auth
tags: [zustand, axios, auth, interceptors, localStorage]
dependency_graph:
  requires: ["02-02"]
  provides: ["authStore", "apiClient", "loginRequest", "logoutRequest"]
  affects: ["02-05"]
tech_stack:
  added: ["zustand@5.0.x", "axios@1.15.x", "react-router-dom@7.x", "@tanstack/react-query@5.x"]
  patterns: ["Zustand persist middleware", "axios request/response interceptors", "module-level redirect guard"]
key_files:
  created:
    - frontend/src/store/authStore.ts
    - frontend/src/api/client.ts
    - frontend/src/api/auth.api.ts
  modified:
    - frontend/package.json
    - frontend/package-lock.json
key_decisions:
  - "baseURL='/api' relative (never full host) — Vite proxy handles routing to :3001 in dev"
  - "module-level redirecting flag in client.ts prevents 401 storm when multiple requests fail simultaneously"
  - "logoutRequest uses finally block — client state always cleared regardless of server response"
metrics:
  duration_seconds: 85
  completed_date: "2026-04-08"
  tasks_completed: 3
  tasks_total: 3
  files_created: 3
  files_modified: 2
requirements:
  - AUTH-08
  - AUTH-09
  - AUTH-10
  - AUTH-12
---

# Phase 2 Plan 4: Frontend auth deps, Zustand authStore, axios client, auth API Summary

**One-liner:** Persisted Zustand authStore (benny-auth key in localStorage) + axios apiClient with Bearer-token interceptor and 401-redirect guard + typed loginRequest/logoutRequest helpers bridging API to store.

## What Was Built

### Task 1: Install frontend auth deps and create authStore

Installed four runtime dependencies in `frontend/`: `zustand@^5.0.12`, `axios@^1.15.0`, `react-router-dom@^7.14.0`, `@tanstack/react-query@^5.96.2`. None required `@types/*` packages (all bundle their own types).

Created `frontend/src/store/authStore.ts` using the Zustand v5 `create<AuthState>()()` double-call syntax required for TypeScript middleware inference. The store exposes `token: string | null`, `login(token)`, and `logout()`. The `persist` middleware writes under localStorage key `benny-auth` using `createJSONStorage(() => localStorage)`.

### Task 2: Create axios client with interceptors

Created `frontend/src/api/client.ts` with:
- `baseURL: '/api'` (relative — Vite proxy routes to localhost:3001 in dev)
- Request interceptor: reads `useAuthStore.getState().token` synchronously and attaches `Authorization: Bearer <token>` when set
- Response interceptor: on 401, calls `useAuthStore.getState().logout()` and redirects via `window.location.href = '/login'`
- Module-level `let redirecting = false` flag prevents multiple concurrent 401 responses from each triggering a navigation (T-02.4-03 mitigation)

### Task 3: Create auth.api.ts request helpers

Created `frontend/src/api/auth.api.ts` with:
- `loginRequest(username, password)`: POSTs to `/auth/login`, calls `useAuthStore.getState().login(token)` on success, maps 401/429/400 to user-facing error strings for the LoginPage form
- `logoutRequest()`: POSTs to `/auth/logout`, always calls `useAuthStore.getState().logout()` in the `finally` block so client state clears even on network failure

Backend contract verified by curl: login returns `{"token": "..."}` (200), logout returns 200.

## Decisions Made

- **baseURL relative `/api`**: Enforces that all frontend API calls go through the Vite dev proxy, keeping dev and prod routing consistent. No hardcoded `localhost:3001`.
- **`redirecting` module flag**: Guards against concurrent 401s causing repeated `window.location.href` assignments which create browser history pollution.
- **`finally` for logout**: Ensures client auth state is always cleared on logout regardless of server availability — correct behavior for a local app where network errors should not block sign-out.

## Deviations from Plan

None — plan executed exactly as written.

## Threat Model Coverage

All mitigations marked in the threat register were implemented:

| Threat ID | Mitigation Applied |
|-----------|-------------------|
| T-02.4-02 | Tampered token causes backend 401 → interceptor logs out client |
| T-02.4-03 | `redirecting` flag in client.ts prevents 401 navigation storm |
| T-02.4-04 | `baseURL: '/api'` relative; acceptance criterion grep forbids `http://localhost:3001` in client.ts |
| T-02.4-05 | apiClient is module-private, baseURL-scoped; no code path sends it cross-origin |

Accepted risks T-02.4-01 (localStorage XSS) and T-02.4-06 (logout network failure) are documented in the plan threat register.

## Self-Check

| Item | Status |
|------|--------|
| frontend/src/store/authStore.ts | FOUND |
| frontend/src/api/client.ts | FOUND |
| frontend/src/api/auth.api.ts | FOUND |
| Commit 5f217d9 (Task 1) | FOUND |
| Commit e992393 (Task 2) | FOUND |
| Commit fdb4251 (Task 3) | FOUND |
| npx tsc --noEmit | PASSED |
| Backend curl contract | PASSED (login 200+token, logout 200) |

## Self-Check: PASSED
