---
phase: 2
plan: 3
subsystem: backend/auth
tags: [jwt, verifyToken, middleware, express, hs256, alg-none-defense]
dependency_graph:
  requires: [02-02]
  provides: [verifyToken-middleware, jwt-guard-mounted, probe-route]
  affects: [02-04, 02-05]
tech_stack:
  added: []
  patterns: [express-route-ordering-guard, hs256-algorithm-pinning, generic-401-error-body, augmented-request-interface]
key_files:
  created:
    - backend/src/middleware/auth.ts
  modified:
    - backend/src/app.ts
decisions:
  - "algorithms: ['HS256'] as a literal array in jwt.verify — never read from config to prevent weakening"
  - "catch block returns generic INVALID_TOKEN regardless of error type — no error.message leak to client"
  - "app.use('/api', verifyToken) positioned AFTER /api/health and /api/auth mounts — enforced by grep in verify script"
  - "Temporary /api/_probe route retained post-plan for future integration tests; Plan 3 may remove"
metrics:
  duration_minutes: 6
  completed_date: "2026-04-08"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 2
---

# Phase 2 Plan 3: verifyToken Middleware Protects All Non-Auth API Routes Summary

**One-liner:** HS256-pinned verifyToken middleware mounted once in app.ts after public routes, blocking all unprotected /api/* access with distinct MISSING_TOKEN and INVALID_TOKEN error codes.

## What Was Built

The backend now enforces JWT authentication on all `/api/*` routes except `/api/health` and `/api/auth/*`. A new `verifyToken` middleware in `backend/src/middleware/auth.ts` extracts the Bearer token, verifies it with `jwt.verify` using an explicit `algorithms: ['HS256']` literal (blocking the alg:none attack), attaches the decoded payload to `req.user` via the `AuthenticatedRequest` interface, and calls `next()`. Any missing or invalid token returns 401 with a generic error body — no error details are leaked to the client.

The middleware is mounted exactly once in `createApp()` via `app.use('/api', verifyToken)`, positioned AFTER the `/api/health` and `/api/auth` registrations. A temporary `GET /api/_probe` route returns `{ ok: true, user: req.user }` and was used to verify the guard end-to-end. All future protected routes registered after the guard line automatically inherit JWT protection.

**Key behaviors delivered:**
- `GET /api/_probe` with no Authorization header → 401 `{ error: "Unauthorized", code: "MISSING_TOKEN" }`
- `GET /api/_probe` with `Authorization: Bearer notavalidtoken` → 401 `{ error: "Unauthorized", code: "INVALID_TOKEN" }`
- `GET /api/health` without token → 200 (public preserved)
- `POST /api/auth/login` with correct credentials → 200 + JWT (public preserved)
- `GET /api/_probe` with valid Bearer token → 200 `{ ok: true, user: { sub: 1, username: "benny", ... } }`

## Tasks

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create verifyToken middleware | 910d7af | backend/src/middleware/auth.ts |
| 2 | Mount verifyToken in app.ts, add probe route, curl-verify | 655c3b8 | backend/src/app.ts |

## Deviations from Plan

None — plan executed exactly as written. Both tasks implemented per spec; all acceptance criteria verified end-to-end with curl.

## Threat Surface Scan

All T-02.3-* mitigations applied as specified in the plan's threat model:

| Threat | Mitigation Applied |
|--------|--------------------|
| T-02.3-01: JWT alg:none attack | `algorithms: ['HS256']` literal in jwt.verify — blocks any other algorithm |
| T-02.3-02: Missing Authorization header silently allowed | Explicit `startsWith('Bearer ')` check returns 401 MISSING_TOKEN |
| T-02.3-03: Error details leak expired vs tampered | Catch-all returns generic INVALID_TOKEN; no error.message in response |
| T-02.3-04: /api/health or /api/auth accidentally guarded | Registration order verified by grep: authRoutes at line 24, guard at line 27 |
| T-02.3-05: verifyToken mounted twice or skipped | Single `app.use('/api', verifyToken)` line; future routes after it auto-inherit |
| T-02.3-06: No log of rejected tokens | Accepted — single-user local app, audit logging deferred |

No new threat surface introduced beyond what the plan's threat model covers.

## Known Stubs

None — this plan produces no UI. The guard operates against the live SQLite-backed JWT from Plan 2.2.

## Self-Check: PASSED

- `backend/src/middleware/auth.ts` exists: FOUND
- `backend/src/app.ts` updated with verifyToken import and mount: FOUND
- Commit 910d7af exists: VERIFIED
- Commit 655c3b8 exists: VERIFIED
- `npx tsc --noEmit` exits 0: VERIFIED
- `GET /api/health` without token returns 200: VERIFIED
- `GET /api/_probe` without token returns 401 MISSING_TOKEN: VERIFIED
- `GET /api/_probe` with bad token returns 401 INVALID_TOKEN: VERIFIED
- `POST /api/auth/login` with correct credentials returns 200 + JWT: VERIFIED
- `GET /api/_probe` with valid token returns 200 with username:benny in body: VERIFIED
- Registration order enforced (authRoutes before verifyToken): VERIFIED
