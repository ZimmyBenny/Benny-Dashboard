---
phase: 03-shell-design-system
plan: "05"
subsystem: frontend/pages + backend/routes
tags: [dashboard, settings, greeting, change-password, bcrypt, vite-define, app-version]
dependency_graph:
  requires:
    - AppShell Layout-Wrapper (03-03)
    - Route-Registration mit Stubs (03-04)
    - UI-Primitives Card/Button/Input/PageWrapper (03-02)
    - Electric Noir CSS-Token-Palette (03-01)
  provides:
    - DashboardPage: zeitbasierte Begruessung + 7 navigierbare Modul-Karten
    - SettingsPage: App-Version + Passwort-Change Formular + Logout
    - backend POST /api/user/change-password (bcrypt verify + hash)
    - frontend changePassword() API-Funktion
    - __APP_VERSION__ via Vite define aus package.json
  affects:
    - frontend/src/pages/DashboardPage.tsx
    - frontend/src/pages/SettingsPage.tsx
    - frontend/src/api/user.api.ts
    - frontend/vite.config.ts
    - frontend/src/vite-env.d.ts
    - backend/src/routes/user.routes.ts
    - backend/src/app.ts
tech_stack:
  added: []
  patterns:
    - Vite define mit readFileSync fuer __APP_VERSION__ (ESM-kompatibel)
    - bcryptjs.compare vor UPDATE fuer Passwort-Aenderung (Pflicht-Verifikation)
    - Formular-State mit useState + handleChangePassword (controlled inputs)
    - logoutRequest() kapselt Store-Logout + best-effort Backend-Call
    - CSS Custom Properties (var()) statt raw hex in allen neuen JSX-Dateien
key_files:
  created:
    - frontend/src/api/user.api.ts
    - frontend/src/vite-env.d.ts
    - backend/src/routes/user.routes.ts
  modified:
    - frontend/src/pages/DashboardPage.tsx
    - frontend/src/pages/SettingsPage.tsx
    - frontend/vite.config.ts
    - backend/src/app.ts
decisions:
  - "vite.config.ts nutzt readFileSync statt require() — package.json hat type:module, daher ESM-kompatible Loesung"
  - "SettingsPage ruft logoutRequest() ohne separaten useAuthStore().logout() auf — logoutRequest() enthaelt bereits Store-Logout im finally-Block"
  - "__APP_VERSION__ in vite-env.d.ts deklariert statt in einer globalen.d.ts — Vite-Konvention"
  - "user.routes.ts nutzt return-freie res.status().json() mit early return-Anweisung — Express 5 async Kompatibilitaet"
metrics:
  duration_seconds: 420
  completed_date: "2026-04-09"
  tasks_completed: 2
  files_changed: 7
---

# Phase 3 Plan 5: DashboardPage, SettingsPage und change-password Endpoint Summary

**One-liner:** DashboardPage mit zeitbasierter deutscher Begruessung und 7 navigierbaren Modul-Karten, SettingsPage mit App-Version/Passwort-Change/Logout und gesichertem POST /api/user/change-password Endpoint mit bcrypt-Verifikation.

## Was wurde gebaut

**DashboardPage.tsx** — Vollstaendige Implementierung (ersetzt Plan-04-Stub):
- `getGreeting()`: Zeitbasierte deutsche Begruessung (05-11h Morgen, 12-17h Nachmittag, 18-21h Abend, sonst Nacht)
- 7 Modul-Karten im responsiven Grid: `grid-cols-1` / `md:grid-cols-2` / `xl:grid-cols-3`
- Jede Karte: Material Symbol Icon (primary-Farbe), Modulname (Headline-Font), Microcopy (on-surface-variant)
- `hoverable` Prop aktiviert Ambient-Glow-Hover via `--glow-primary`
- Vollstaendig klickbar via `useNavigate()` — kein raw hex in JSX

**SettingsPage.tsx** — Vollstaendige Implementierung (ersetzt Plan-04-Stub):
- **App-Version Card**: Zeigt `Benny Dashboard v{__APP_VERSION__}` (injiziert via Vite define)
- **Passwort-Change Card**: Formular mit 3 Inputs (aktuell/neu/bestaetigen), client-seitige Validierung (Laenge >= 8, Passwoerter stimmen ueberein), Error/Success-Feedback, isSubmitting-State waehrend API-Call
- **Session Card**: Logout-Button ruft `logoutRequest()` auf und navigiert zu `/login`
- Kein raw hex, alle Farben via `var(--color-*)`

**backend/src/routes/user.routes.ts** (neu):
- `POST /change-password` — unter `/api/user/` gemountet
- Validierung: oldPassword + newPassword Pflichtfelder, newPassword >= 8 Zeichen
- Lädt User (id=1) aus DB, prueft altes Passwort mit `bcryptjs.compare()`
- Bei Erfolg: neues Passwort mit `bcryptjs.hash(_, 12)` gehasht und gespeichert
- Gibt nur `{ message }` zurueck — kein password_hash in Response

**backend/src/app.ts** (erweitert):
- `import userRoutes from './routes/user.routes'`
- `app.use('/api/user', userRoutes)` registriert NACH `app.use('/api', verifyToken)` — vollstaendig geschuetzt

**frontend/src/api/user.api.ts** (neu):
- `changePassword(oldPassword, newPassword)` — POST an `/user/change-password` via apiClient

**frontend/vite.config.ts** (erweitert):
- `readFileSync('./package.json')` liest Version (ESM-kompatibel, kein `require()`)
- `define: { __APP_VERSION__: JSON.stringify(pkg.version) }`

**frontend/src/vite-env.d.ts** (neu):
- `/// <reference types="vite/client" />` + `declare const __APP_VERSION__: string`

## Commits

| Task | Commit | Beschreibung |
|------|--------|--------------|
| 3.5-1 | bef23b3 | DashboardPage mit Greeting und 7-Card-Grid |
| 3.5-2 | d8808dd | SettingsPage + change-password Endpoint + Vite APP_VERSION |

## Deviations from Plan

### Auto-fixed Issues

Keine — Plan wurde exakt wie spezifiziert implementiert.

### Implementierungsdetails (keine Abweichung)

**ESM-kompatible vite.config.ts**
- Der Plan-Kommentar weist bereits darauf hin: `require()` nicht nutzbar in ESM.
- `readFileSync` + `JSON.parse` wie im Plan vorgeschlagen verwendet.
- Kein Abweichen von der Plan-Empfehlung.

**Express 5 return-freie Fehler-Responses**
- Plan nutzt `return res.status().json()` Pattern.
- In Express 5 mit TypeScript liefert `res.json()` `void` — kein `return` auf dem Rueckgabewert, stattdessen separates `return` nach dem `res.*`-Aufruf.
- Kein funktionaler Unterschied, TypeScript-konform.

**SettingsPage ohne separaten Store-Logout-Aufruf**
- `logoutRequest()` in `auth.api.ts` enthaelt bereits `useAuthStore.getState().logout()` im `finally`-Block.
- Kein doppelter Store-Aufruf noetig — `handleLogout` ruft nur `logoutRequest()` + `navigate('/login')` auf.

## Known Stubs

Keine — DashboardPage und SettingsPage sind vollstaendig implementiert. Alle Karten sind navigierbar, das Passwort-Change-Formular ist vollstaendig verdrahtet.

## Ausstehend (Checkpoint)

Task 3.5-3 (`checkpoint:human-verify`) erfordert manuelle UAT durch den Nutzer. Dieser Checkpoint wurde planmaessig erreicht — die automatisierten Tasks 1 und 2 sind abgeschlossen.

## Threat Flags

Keine neuen Sicherheits-relevanten Oberflaechen ausserhalb des Threat-Modells. Alle identifizierten Threats (T-03-01 bis T-03-06) sind durch die Implementierung adressiert:
- verifyToken-Guard schuetzt den change-password Endpoint
- bcryptjs.compare prueft altes Passwort vor dem Update
- Minimum-8-Zeichen-Validierung im Backend
- Response gibt niemals password_hash zurueck

## Self-Check: PASSED

- [x] DashboardPage.tsx: getGreeting(), 7 Karten, grid-cols-1/md:grid-cols-2/xl:grid-cols-3, useNavigate, hoverable
- [x] SettingsPage.tsx: __APP_VERSION__, Passwort-Formular, Logout, kein raw hex
- [x] user.api.ts: changePassword() via apiClient.post('/user/change-password', ...)
- [x] user.routes.ts: POST /change-password, bcryptjs.compare + hash, nur { message } in Response
- [x] app.ts: userRoutes nach verifyToken registriert
- [x] vite.config.ts: __APP_VERSION__ define via readFileSync
- [x] vite-env.d.ts: declare const __APP_VERSION__: string
- [x] Frontend TypeScript fehlerfrei
- [x] Backend TypeScript fehlerfrei
- [x] Commits bef23b3 und d8808dd vorhanden
