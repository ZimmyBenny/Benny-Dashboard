# Requirements: Benny Dashboard

**Defined:** 2026-04-07
**Core Value:** Alles an einem Ort, lokal und privat — ohne Cloud-Abhängigkeiten, ohne Reibung beim täglichen Zugriff.

---

## Milestone 1 Requirements

Scope: Foundation, Auth, Shell, Design System, Home Page. All 7 module routes registered with placeholder pages.

### Foundation

- [ ] **FOUND-01**: React + Vite + Tailwind v4 frontend project ist konfiguriert und lauffähig
- [ ] **FOUND-02**: Node.js + Express backend läuft lokal auf Port 3001, antwortet auf `GET /api/health`
- [ ] **FOUND-03**: `GET /api/health` gibt `{ status: "ok" }` zurück
- [ ] **FOUND-04**: Vite dev proxy leitet `/api/*` an `localhost:3001` weiter (kein CORS in der Entwicklung)
- [ ] **FOUND-05**: SQLite-Datenbankdatei liegt AUSSERHALB von iCloud Drive (`~/.local/share/benny-dashboard/`)
- [ ] **FOUND-06**: WAL-Modus aktiviert: `PRAGMA journal_mode = WAL`
- [ ] **FOUND-07**: Migrations-Runner startet beim Serverstart und führt noch nicht angewandte SQL-Dateien aus
- [ ] **FOUND-08**: `_migrations`-Tabelle trackt angewandte Migrationen
- [ ] **FOUND-09**: Initiale Migration erstellt `user`-Tabelle mit Single-User-Constraint (`CHECK (id = 1)`)
- [ ] **FOUND-10**: `concurrently`-Skript startet Frontend und Backend gleichzeitig mit einem Befehl (`npm run dev`)
- [ ] **FOUND-11**: TypeScript auf beiden Seiten (Frontend und Backend) konfiguriert
- [ ] **FOUND-12**: `.env` mit `JWT_SECRET`, `DB_PATH`, `PORT` ist gitignored; `.env.example` ist committed

### Authentication

- [x] **AUTH-01**: `POST /api/auth/login` akzeptiert `{ username, password }` und gibt ein JWT zurück
- [ ] **AUTH-02**: Passwort wird mit bcrypt (Cost Factor 12) gehasht in der `user`-Tabelle gespeichert
- [ ] **AUTH-03**: Ein Seed-Skript erstellt den einzigen User-Account (einmalig ausführen)
- [x] **AUTH-04**: JWT hat 7 Tage Laufzeit und wird mit `algorithms: ['HS256']` verifiziert
- [ ] **AUTH-05**: `JWT_SECRET` wirft beim Serverstart einen Fehler wenn nicht gesetzt (kein Fallback)
- [x] **AUTH-06**: Login-Endpoint ist auf 10 Requests pro 15 Minuten begrenzt
- [x] **AUTH-07**: `verifyToken`-Middleware schützt alle `/api/*`-Routen außer `/api/auth/*`
- [x] **AUTH-08**: Token wird im Zustand-Store (Zustand) gespeichert und via `persist` in localStorage
- [x] **AUTH-09**: axios-Interceptor fügt `Authorization: Bearer <token>` zu allen API-Requests hinzu
- [x] **AUTH-10**: axios-Interceptor auf 401-Fehler loggt den User aus und leitet zu `/login` weiter
- [x] **AUTH-11**: Login-Seite ist öffentlich; alle anderen Routen sind durch `<PrivateRoute>` geschützt
- [x] **AUTH-12**: Session überlebt Browser-Reload (Token im localStorage via Zustand persist)
- [x] **AUTH-13**: `POST /api/auth/logout` invalidiert die Session auf Client-Seite

### Shell & Layout

- [ ] **SHELL-01**: `<AppShell>` rendert Sidebar + Header + `<Outlet />` für alle geschützten Routen
- [ ] **SHELL-02**: Sidebar zeigt alle 7 Navigationspunkte: Dashboard, Aufgaben, Kalender, Amazon, DJ, Finanzen, Einstellungen
- [ ] **SHELL-03**: Sidebar kann auf Icon-only-Breite (48-56px) eingeklappt werden; Labels verschwinden
- [ ] **SHELL-04**: Sidebar bleibt im ausgeklappten Zustand (220-240px) mit Icons und Labels
- [ ] **SHELL-05**: Einklapp-Zustand wird in `uiStore` gespeichert und überlebt Page-Reloads
- [ ] **SHELL-06**: Keyboard-Shortcut (`[`) togglet die Sidebar
- [ ] **SHELL-07**: Sidebar-Collapse-Animation ist smooth (150-200ms ease-out)
- [ ] **SHELL-08**: Aktiver Navigationspunkt ist mit Primary-Akzentfarbe (`#cc97ff`) hervorgehoben
- [ ] **SHELL-09**: Einstellungen ist visuell vom Rest der Navigation getrennt (unten in der Sidebar)
- [ ] **SHELL-10**: Tooltips zeigen Labels wenn Sidebar eingeklappt ist und Nutzer hover
- [ ] **SHELL-11**: Alle 7 Modul-Routen sind registriert mit Placeholder-Seiten (kein 404)

### Design System

- [ ] **DS-01**: Electric Noir Farbtokens sind als CSS Custom Properties in `@theme` definiert: `#060e20` (bg), `#cc97ff` (primary), `#34b5fa` (secondary), Oberflächen-Hierarchie
- [ ] **DS-02**: Typografie: Epilogue (Display/Headlines) und Inter (Body/Labels) sind eingebunden
- [ ] **DS-03**: `<Card>`-Komponente verwendet Glassmorphism: `surface-variant` 40% Opacity + 20px `backdrop-blur`
- [ ] **DS-04**: `<Button>`-Komponente hat Primary- (Gradient + full rounded) und Secondary-Variante (Glass-Style)
- [ ] **DS-05**: `<Input>`-Komponente hat stateful Design: Default, Focus (secondary glow), Error-Zustand
- [ ] **DS-06**: Kein 1px solid Border zwischen Sektionen — Übergänge nur durch Hintergrundwechsel
- [ ] **DS-07**: Keine klassischen Drop Shadows — nur Ambient Glows (`0px 0px 12px rgba(52, 181, 250, 0.1)`)
- [ ] **DS-08**: `backdrop-filter: blur()` nur auf Cards und Modals, NICHT auf Sidebar oder Header
- [ ] **DS-09**: Focus-Ringe verwenden Primary-Akzentfarbe (`#cc97ff`) — keine unsichtbaren Fokus-Indikatoren
- [ ] **DS-10**: `<PageWrapper>`-Komponente handhabt Padding und Scroll für alle Seiten einheitlich
- [ ] **DS-11**: CSS Scrollbar ist styled und passt zum Electric Noir Design

### Home Dashboard

- [ ] **HOME-01**: Startseite zeigt ein Grid mit Karten für alle 7 Hauptbereiche
- [ ] **HOME-02**: Jede Karte zeigt: Icon, Modulname, kurze Beschreibung (Microcopy)
- [ ] **HOME-03**: Jede Karte ist vollständig klickbar und navigiert zum jeweiligen Modul
- [ ] **HOME-04**: Karten haben einen Hover-Zustand (subtiler Glow oder Border-Highlight)
- [ ] **HOME-05**: Grid ist responsive: 3 Spalten ab 1280px, 2 Spalten ab 768px
- [ ] **HOME-06**: Startseite hat eine Begrüßungszeile (z.B. "Good morning, Benny")

### Settings

- [ ] **SETT-01**: Einstellungen-Seite ist erreichbar und geschützt (nur nach Login)
- [ ] **SETT-02**: Nutzer kann sein Passwort ändern (`POST /api/auth/change-password`)
- [ ] **SETT-03**: Logout-Button auf der Einstellungen-Seite — löscht Token und leitet zu `/login` weiter
- [ ] **SETT-04**: App-Version und Build-Info sind sichtbar

---

## Milestone 2+ Requirements (deferred)

### Aufgaben-Modul

- **TASK-01**: Aufgaben erstellen, bearbeiten, löschen
- **TASK-02**: Fälligkeitsdaten und Priorität (low/normal/high)
- **TASK-03**: Status-Wechsel: todo → in_progress → done
- **TASK-04**: Filter: Offen / Erledigt / Überfällig / Alle
- **TASK-05**: Aufgaben in SQLite gespeichert

### Kalender-Modul

- **CAL-01**: Monatsansicht (primär) und Wochenansicht (sekundär)
- **CAL-02**: Events erstellen, bearbeiten, löschen (lokal in SQLite)
- **CAL-03**: Heute deutlich hervorgehoben
- **CAL-04**: iCal/.ics-Datei-Import (ohne Live-Sync)
- **CAL-05**: Farbkategorien für Events

### Finanzen-Modul

- **FIN-01**: Transaktionen manuell erfassen (Betrag, Kategorie, Datum, Notiz)
- **FIN-02**: Einnahmen vs. Ausgaben unterscheiden
- **FIN-03**: Monatliche Zusammenfassung (Einnahmen / Ausgaben / Saldo)
- **FIN-04**: Budget-Ziele pro Kategorie mit Fortschrittsbalken
- **FIN-05**: CSV-Export für Steuerzwecke
- **FIN-06**: Chart: Monatsvergleich (aktueller Monat vs. letzter Monat)

### DJ-Modul

- **DJ-01**: Gig-Liste mit Datum, Venue, Kunde, Zahlungsstatus
- **DJ-02**: Gigs als bezahlt/ausstehend/storniert markieren
- **DJ-03**: Notizen pro Gig
- **DJ-04**: Gig als bezahlt markiert → optional: Transaktion im Finanzmodul erstellen

### Amazon-Modul

- **AMZ-01**: Scope-Entscheidung MUSS vor diesem Milestone getroffen werden (Kauflog vs. Wunschliste vs. Rückgabe-Tracker)

### Einstellungen (Erweiterungen)

- **SETT-10**: Datenexport: alle SQLite-Daten als JSON/CSV
- **SETT-11**: Manuelles Backup-Trigger (`VACUUM INTO`)
- **SETT-12**: Keyboard-Shortcuts Cheat-Sheet Modal

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Cloud-Hosting / Remote-Zugriff | Lokale App by design — bewusste Entscheidung für Privatsphäre |
| Multi-User / Registrierung | Single-User-System — nur ein Account |
| Online-Buchungsformular (DJ) | Erfordert Cloud, verletzt Local-Only-Constraint |
| Bank-Synchronisation (Finanzen) | Cloud-Abhängigkeit + Privatsphäre-Bedenken |
| Live-Investmentpreise | Netzwerk-Abhängigkeit |
| Automatische PDF-Rechnungen | Hohe Komplexität, außerhalb des Scopes |
| Musik-Bibliotheksverwaltung | Dedizierte DJ-Software übernimmt das |
| Google Calendar Live-Sync | Cloud-Abhängigkeit |
| Light/Dark-Mode-Toggle | Electric Noir ist immer dark — zwei Modi = doppelter Designaufwand |
| PWA / Service Worker | Lokale App ist by architecture bereits offline-first |
| WebSockets / Echtzeit | Keine Funktion erfordert sub-Sekunden-Updates |
| Drag-and-Drop Home Layout | Produkt für sich — prematur ohne echte Modul-Daten |
| Onboarding-Wizard | Single User der die App selbst gebaut hat — nicht nötig |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 bis FOUND-12 | Phase 1 | Pending |
| AUTH-01 bis AUTH-13 | Phase 2 | Pending |
| SHELL-01 bis SHELL-11 | Phase 3 | Pending |
| DS-01 bis DS-11 | Phase 3 | Pending |
| HOME-01 bis HOME-06 | Phase 3 | Pending |
| SETT-01 bis SETT-04 | Phase 3 | Pending |

**Coverage:**
- Milestone 1 requirements: 56 total
- Mapped to phases: 56
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-07*
*Last updated: 2026-04-07 after initial definition*
