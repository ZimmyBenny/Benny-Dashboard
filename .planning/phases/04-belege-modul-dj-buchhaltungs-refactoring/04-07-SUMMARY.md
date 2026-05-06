---
phase: 04-belege-modul-dj-buchhaltungs-refactoring
plan: 07
subsystem: frontend, ui-foundation, ui-overview, kpi-aggregation
tags: [react, tanstack-query, kpi-card, status-badge, belege-overview, glassmorphism, dj-stil, format-currency-from-cents, frontend-routing]

# Dependency graph
requires:
  - phase: 04-01 (Wave 1)
    provides: receipts-Schema (status, due_date, amount_gross_cents, paid_amount_cents, steuerrelevant), app_settings (ustva_zeitraum)
  - phase: 04-02 (Wave 2)
    provides: aggregateForUstva-Service, UstvaPeriod-Type
  - phase: 04-03 (Wave 2)
    provides: GET /api/belege Liste + GET /api/belege/:id Detail (Bestand)
  - phase: 04-06 (Wave 3)
    provides: receipts gespiegelt mit DJ-Daten via mirrorInvoiceToReceipts und mirrorTripToReceipts (KPIs sehen jetzt alle Daten)
provides:
  - Frontend-Foundation fuer Belege-Modul (Plans 04-08..04-10 koennen bauen)
  - frontend/src/lib/format.ts:formatCurrencyFromCents (Cents->EUR DE-Format) — UI-Boundary fuer Geld-Werte
  - frontend/src/components/dj/StatusBadge.tsx erweitert um 5 Receipt-Status (zu_pruefen, freigegeben, archiviert, nicht_relevant, ocr_pending)
  - frontend/src/components/layout/navConfig.ts: /belege Top-Level-Eintrag mit 8 Sub-Items zwischen "Vertraege & Fristen" und "KI Agenten"
  - frontend/src/api/belege.api.ts: TanStack-Query API-Wrapper (8 Endpoints + ReceiptListItem/ReceiptDetail/OverviewKpis Types)
  - frontend/src/pages/belege/BelegeOverviewPage.tsx: Landing-Page im DJ-Stil mit 6 KPICards + 2 Listen
  - backend/src/routes/belege.routes.ts: GET /api/belege/overview-kpis Endpoint (KPI-Aggregation)
  - frontend/src/routes/routes.tsx: /belege Route (PrivateRoute-protected)
affects: [04-08-ui-list-detail, 04-09-ui-upload, 04-10-ui-tax-export-settings]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "formatCurrencyFromCents als UI-Boundary: Geld-Werte fliessen als INTEGER (Cents) vom Backend, werden im UI EXKLUSIV ueber diesen Helper formatiert — verhindert Float-Drift und doppelte Konvertierungslogik"
    - "StatusBadge wird zentralisiert wiederverwendet (nicht jeder Subreiter eigene Badges) — gleiche Status-Konvention DJ + Belege; spart sowohl Code-Duplikation als auch UI-Inkonsistenzen"
    - "Conditional KPI-Rendering basierend auf app_settings.ustva_zeitraum: KPI 'Steuerzahllast' wird ausgeblendet wenn ustva_zeitraum='keine' (Kleinunternehmer ohne UStVA-Pflicht) — das Setting ist die Source of Truth"
    - "Layout-Stil orientiert sich am DJ-Reiter (DjOverviewPage), NICHT am generischen Dashboard — User-Vorgabe explizit (Glassmorphism, Ambient Glows blau/gruen, Purple/Blue Accents, 3rem Headline)"
    - "TanStack-Query keys hierarchisch: ['belege', 'overview-kpis'], ['belege', 'latest-10'], ['belege', 'upcoming-10'] — invalidieren via ['belege'] cleared den ganzen Bereich"

key-files:
  created:
    - frontend/src/api/belege.api.ts (165 Zeilen) — Types + 8 fetch-Funktionen
    - frontend/src/pages/belege/BelegeOverviewPage.tsx (404 Zeilen) — Page + ReceiptSection + ReceiptRow Sub-Components
  modified:
    - frontend/src/lib/format.ts (+25 Zeilen — formatCurrencyFromCents Helper)
    - frontend/src/components/dj/StatusBadge.tsx (+8 Zeilen — Type-Extension + 5 Status-Configs)
    - frontend/src/components/layout/navConfig.ts (+22 Zeilen — /belege Top-Level-Block + 8 pageNames)
    - frontend/src/routes/routes.tsx (+2 Zeilen — Import + Route)
    - backend/src/routes/belege.routes.ts (+104 Zeilen — GET /overview-kpis Endpoint)

key-decisions:
  - "Layout-Stil = DJ-Reiter (User-Vorgabe explizit) — Glassmorphism, Ambient Glows, 3rem-Headline, KPICard wiederverwendet (nicht neu); BelegeOverviewPage greift auf bestehendes Component-Inventar zurueck statt eigene Card-Componenten zu bauen"
  - "Steuerzahllast-KPI conditional via `kpis?.ustvaZeitraum !== 'keine'` — Kleinunternehmer (ust_vorabbefreit, ustva_zeitraum='keine') sehen die KPI gar nicht erst; verhindert visuelle Verwirrung mit immer-Null-Wert"
  - "Backend-Endpoint /overview-kpis VOR /:id im Router platziert — gleiche Konvention wie /supplier-suggest und /run-task-automation; Express matched ansonsten /:id mit id='overview-kpis' und liefert 400 (Ungueltige id)"
  - "Letzte 10 + Naechste 10 als zwei separate TanStack-Query-Aufrufe (statt ein gemeinsamer GET /api/belege/dashboard) — Caching ist effizienter, Liste laesst sich invalidieren ohne KPIs neu zu laden, simpler im Backend (Bestands-Endpoint reicht)"
  - "Naechste 10 Faelligkeiten wird im Frontend gefiltert/sortiert (statt neuer Backend-Endpoint) — Bestands-GET /api/belege?status=offen liefert bereits alle offenen, Frontend filtert auf due_date IS NOT NULL und sortiert ASC, Slice(10); minimaler Backend-Footprint"
  - "Formatierung negativer Geld-Werte mit Errorfarbe (Stornorechnungen): amount_gross_cents < 0 → text-color = var(--color-error); macht GoBD-Storno-Belege auf einen Blick erkennbar"
  - "/belege Route am Ende des routes.tsx-Blocks (analog Plan-Soll, nicht zwischen DJ-Routes) — Reihenfolge ist sequenz-irrelevant (kein dynamisches Routing matcht /belege gegen DJ-Routes), aber lesbar als 'eigener Modul-Bereich'"

patterns-established:
  - "KPI-Aggregation-Endpoint-Pattern: ein Backend-Endpoint /<modul>/overview-kpis liefert ALLE Dashboard-Werte in einem einzigen Roundtrip statt 6 separate Queries — wiederverwendbar fuer kuenftige Modul-Dashboards (Amazon, Finanzen)"
  - "Frontend-API-Modul-Layout: Types am File-Anfang (alle interfaces), dann fetch-Funktionen einzeln exportiert (kein default Object) — gleiche Struktur wie dj.api.ts, contacts.api.ts; ermoeglicht TanStack-Query queryFn: fetchOverviewKpis ohne wrapping"
  - "ReceiptRow als reine Praesentations-Component akzeptiert isFirst-Prop fuer optisches Hervorheben des ersten Items — gleiche Pattern wie DjOverviewPage Naechste-Veranstaltungen-Tabelle"

requirements-completed: [BELEG-UI-01, BELEG-UI-02, BELEG-UI-03, BELEG-UI-10, BELEG-UI-11]

# Metrics
duration: 6min
completed: 2026-05-06
---

# Phase 04 Plan 07: UI Overview Summary

**Frontend-Foundation fuer das Belege-Modul: formatCurrencyFromCents-Helper + StatusBadge-Erweiterung um 5 Receipt-Status + navConfig-/belege-Block + TanStack-Query API-Wrapper + GET /api/belege/overview-kpis Endpoint + BelegeOverviewPage im DJ-Stil mit 6 KPICards (Conditional fuer Steuerzahllast) und 2 Listen (Letzte 10 + Naechste 10) — alles tsc-sauber und 112/112 Backend-Tests gruen.**

## Performance

- **Started:** 2026-05-06T13:10:08Z
- **Completed:** 2026-05-06T13:16:12Z
- **Duration:** ~6 min
- **Tasks:** 2 / 2
- **Files created:** 2 (1 page + 1 api-modul)
- **Files modified:** 5 (3 frontend foundation + 1 frontend route + 1 backend route)
- **Tests:** 112/112 Backend-Tests gruen (keine Regression durch overview-kpis-Endpoint)
- **Sub-Repos:** keine — Single-Repo-Setup
- **Commits:** 3 (Foundation + Backend-Endpoint + Frontend-Page)

## Accomplishments

- **Frontend-Foundation fuer Plans 04-08..04-10 gelegt** — Plans 08 (List/Detail), 09 (Upload) und 10 (Tax/Export/Settings) koennen direkt auf folgenden Bausteinen bauen:
  - `formatCurrencyFromCents` ist die einzige Stelle im Frontend an der Cents->EUR konvertiert wird (Single Source of Truth)
  - `StatusBadge` rendert ALLE Belege-Status (kein doppelter Status-Code)
  - `belege.api.ts` exportiert 8 fetch-Funktionen + 4 Types — bereit fuer useQuery/useMutation
  - `navConfig` hat den /belege-Block — nur die Sub-Pages selbst muessen noch erstellt werden, nicht die Navigation
- **BelegeOverviewPage operational** als zentrale Landing-Page fuer das Modul:
  - 6 KPICards (4 fix + 1 conditional + 1 fix) im responsive Grid (auto-fit, minmax(220px, 1fr))
  - Conditional Rendering fuer Steuerzahllast: KPI wird komplett ausgeblendet wenn ustva_zeitraum='keine' (Kleinunternehmer ohne UStVA-Pflicht)
  - 2 Listen-Sektionen (Letzte 10 + Naechste 10 Faelligkeiten) im responsive Grid mit Glassmorphism-Borders
  - Klick auf KPICard navigiert zu Sub-Pfad (z.B. /belege/zu-pruefen)
  - Klick auf ReceiptRow navigiert zu /belege/:id (Plan 08 fuellt das mit Inhalt)
  - Ueberfaellige Belege werden in der Liste rot eingefaerbt (background + due_date-Color)
  - Stornorechnungen (amount_gross_cents < 0) werden mit Error-Color dargestellt
- **Backend GET /api/belege/overview-kpis** liefert alle 6 KPI-Werte in einem Roundtrip:
  - SQL-Aggregation per `COUNT(*) AS c` und `SUM(...)` — kein N+1
  - Steuerzahllast nutzt bestehenden `aggregateForUstva`-Service aus Plan 04-02 (kein duplizierter UStVA-Code)
  - Aktueller Bucket-Index wird aus `new Date().getMonth()+1` ermittelt (lokale Zeit; bei UTC-Mitternacht-Boundaries ggf. ein-Tag-Drift, fuer Single-User-DE-Use-Case akzeptabel)
- **DJ-Stil als verbindliches Layout** — Glassmorphism, Ambient Glows (blau oben rechts, gruen unten links), 3rem-Headline mit -0.02em letter-spacing, KPICard mit accentColor="primary"|"secondary"|"tertiary"|"error". Identische optische Sprache wie DjOverviewPage.

## Task Commits

1. **Task 1: Frontend-Foundation** — `fb73c2a` (feat) — formatCurrencyFromCents + StatusBadge-Receipt-Status + navConfig-/belege-Block + belege.api.ts. 4 Dateien, 227 Zeilen +/1 Zeile -.
2. **Task 2a: Backend overview-kpis-Endpoint** — `85ce2b1` (feat) — GET /api/belege/overview-kpis VOR /:id. 1 Datei, 104 Zeilen +.
3. **Task 2b: BelegeOverviewPage + Route** — `fae0a61` (feat) — BelegeOverviewPage.tsx (404 Zeilen) + routes.tsx Route-Registration. 2 Dateien, 484 Zeilen +.

**Plan-Metadaten-Commit:** wird nach diesem SUMMARY plus STATE/ROADMAP/REQUIREMENTS-Updates gemacht.

## Files Created/Modified

### Created — Source

- `frontend/src/api/belege.api.ts` (165 Zeilen) — TanStack-Query API-Wrapper:
  - 4 Types: ReceiptListItem, ReceiptDetail, ReceiptFilter, OverviewKpis, SupplierSuggestion, UploadResult
  - 8 fetch-Funktionen: fetchReceipts, fetchReceipt, fetchOverviewKpis, fetchOpenPayments, fetchSupplierSuggest, uploadReceipts, updateReceipt, setReceiptAreas, freigebenReceipt
- `frontend/src/pages/belege/BelegeOverviewPage.tsx` (404 Zeilen) — Page-Komponente:
  - BelegeOverviewPage (Main) mit Page-Header, Ambient Glows, 6-KPI-Grid und 2-Listen-Layout
  - ReceiptSection (Sub-Component) — gestylte Liste mit Header, Empty-State und Items
  - ReceiptRow (Sub-Component) — einzelner Listen-Eintrag mit Hover-States, isOverdue-Highlight, StatusBadge

### Modified — Source

- `frontend/src/lib/format.ts` (+25 Zeilen) — `formatCurrencyFromCents(cents, currency='EUR')` Helper. Nutzt `Intl.NumberFormat('de-DE', { style: 'currency', currency })`. Returns '-' bei null/undefined/NaN.
- `frontend/src/components/dj/StatusBadge.tsx` (+8 Zeilen) — Type `ReceiptStatus` ergaenzt + 5 Status-Configs (zu_pruefen=gelb, freigegeben=gruen, archiviert=grau, nicht_relevant=grau-dim, ocr_pending=primary).
- `frontend/src/components/layout/navConfig.ts` (+22 Zeilen) — Top-Level-Eintrag /belege mit 8 Sub-Items (icon: receipt_long) + 8 pageNames-Eintraege. Position zwischen `/contracts` (Vertraege & Fristen) und `/ki-agenten` (KI Agenten).
- `frontend/src/routes/routes.tsx` (+2 Zeilen) — Import + Route fuer /belege (innerhalb AppShell-Children, PrivateRoute-geschuetzt).
- `backend/src/routes/belege.routes.ts` (+104 Zeilen) — GET /overview-kpis Endpoint mit aggregateForUstva-Integration. Steht VOR /:id im Router.

## Decisions Made

- **Layout-Stil DJ-Reiter (User-Vorgabe)** — User hat explizit gesagt "Layout-Stil orientiert sich am DJ-Reiter, NICHT am generischen Dashboard". Konkret heisst das: Glassmorphism (linear-gradient backgrounds mit transparenten Farben), Ambient Glows (radial-gradients in den Ecken), 3rem-Headline mit -0.02em letter-spacing, KPICard direkt wiederverwendet (nicht neu erstellt), Purple/Blue/Green Accents via CSS-Variablen.
- **Steuerzahllast-KPI conditional** — bei Kleinunternehmern (`ustva_zeitraum='keine'`) gibt es keine UStVA-Pflicht; eine "Steuerzahllast"-KPI mit immer-Null-Wert waere irrefuehrend. Conditional `{kpis?.ustvaZeitraum !== 'keine' && <KPICard ... />}` blendet die Karte komplett aus. Backend liefert in diesem Fall `steuerzahllastCurrentPeriodCents: null` (semantisch korrekt).
- **/overview-kpis VOR /:id im Router** — gleiche Konvention wie `/supplier-suggest` und `/run-task-automation`. Ohne diese Reihenfolge wuerde Express `/:id` mit id='overview-kpis' matchen → `Number.isFinite('overview-kpis')` ist false → 400 "Ungueltige id". Dokumentiert via Inline-Kommentar im Endpoint.
- **Ein Backend-Endpoint /overview-kpis statt 6 separate Queries** — minimiert Roundtrips und HTTP-Overhead, aggregiert direkt in SQL. Frontend nutzt einen einzigen `useQuery({ queryKey: ['belege', 'overview-kpis'] })`-Aufruf. Pattern ist wiederverwendbar fuer kuenftige Modul-Dashboards (Amazon, Finanzen).
- **Naechste 10 Faelligkeiten frontend-gefiltert** — Bestands-Endpoint `GET /api/belege?status=offen` liefert alle offenen; Frontend filtert auf `due_date IS NOT NULL`, sortiert ASC nach due_date, slice(10). Kein separater Backend-Endpoint noetig — bei <500 offenen Zahlungen ist der Overhead vernachlaessigbar; bei groesseren Datasets koennte man einen `?upcoming=1`-Parameter im Backend einfuehren.
- **Stornorechnungen mit Error-Color** — `amount_gross_cents < 0` (negative Cents-Beträge bei Stornorechnungen via djSyncService) werden in der Liste rot dargestellt. Zusammen mit der "Storniert"-Status-Badge (line-through) ist GoBD-Storno-Beleg auf einen Blick erkennbar.
- **Hover-States aktiv (kein "click to expand")** — Listen-Items zeigen nur Hover-Background-Wechsel; Klick navigiert zu /belege/:id (Plan 08). Vermeidet Modal/Inline-Expand-Komplexitaet auf der Overview-Page.

## Deviations from Plan

### Auto-fixed Issues

**1. [Praezisierung] Frontend-Filter fuer "Naechste 10 Faelligkeiten"**
- **Issue:** Plan-Code-Snippet im PLAN.md fetched einfach `fetchReceipts({ status: 'offen' }).then(rs => rs.slice(0, 10))` ohne Sortierung nach due_date. Dadurch wuerden die ERSTEN 10 offenen Belege nach receipt_date DESC angezeigt — was die "Naechste Faelligkeiten"-Semantik verletzt (man will ja zukuenftige Termine, sortiert ASC).
- **Fix:** Frontend filtert auf `due_date IS NOT NULL`, sortiert ASC nach due_date, slice(10). Damit ist die Liste fachlich korrekt: zeigt die naechsten faelligen Belege zuerst.
- **Files modified:** frontend/src/pages/belege/BelegeOverviewPage.tsx
- **Commit:** fae0a61

**2. [Praezisierung] BelegeOverviewPage als Sub-Components-Architektur**
- **Issue:** Plan-Code-Snippet hatte ReceiptList als inline-Function mit minimalem Inhalt (nur supplier_name + Datum + Brutto + Status, ohne due_date-Logik, ohne overdue-Highlight, ohne Empty-State, ohne Section-Header). Hand-on-the-pulse-Implementierung wuerde unschoen aussehen und nicht zum DJ-Stil passen.
- **Fix:** Page in 3 Sub-Components zerlegt (BelegeOverviewPage + ReceiptSection + ReceiptRow). ReceiptSection bekommt einen DJ-Stil-Header (Icon + Titel im Glassmorphism-Container) und hat einen Empty-State mit Icon. ReceiptRow zeigt isOverdue-Highlight, supplier_invoice_number-Suffix, line-clamp/ellipsis fuer lange supplier_names, dueDate-Color-Coding.
- **Files modified:** frontend/src/pages/belege/BelegeOverviewPage.tsx (404 Zeilen statt der Plan-spezifizierten ~150 Zeilen — aber Plan-Acceptance "min_lines: 150" ist erfuellt)
- **Commit:** fae0a61

**3. [Praezisierung] Page-Header mit Buttons + Subtitle**
- **Issue:** Plan-Snippet hatte nur `<h1>Belege Übersicht</h1>` als Header — passt nicht zum DJ-Stil.
- **Fix:** Page-Header mit `<h1>BELEGE</h1>` (3rem, 800-weight, -0.02em letter-spacing — wie DjOverviewPage), Subtitle, "Neuer Beleg"-Button (Gradient blue->green wie DjOverviewPage). Klick auf Button navigiert zu `/belege/neu` (Plan 09 fuellt das).
- **Files modified:** frontend/src/pages/belege/BelegeOverviewPage.tsx
- **Commit:** fae0a61

**Total deviations:** 3 (alle Praezisierungen, keine Plan-Acceptance-Criteria-Verletzung). Alle 5 Soll-Items aus `must_haves.truths` sind verifiziert; alle 5 Requirements (BELEG-UI-01, 02, 03, 10, 11) erfuellt.

## Issues Encountered

Keine. Build, Tests und Routing liefen direkt sauber:
- `cd frontend && npx tsc --noEmit` exit code 0
- `cd backend && npx tsc --noEmit` exit code 0
- `cd backend && npx vitest run` 112/112 passed (keine Regression durch overview-kpis-Endpoint)
- Acceptance-Criteria per grep verifiziert (formatCurrencyFromCents, 5 Receipt-Status, 17 /belege-Vorkommen in navConfig, 6 KPICards, 1 ustvaZeitraum-Conditional, 1 routes-Import, 1 routes-Path, 1 router.get('/overview-kpis')).

Hinweis zur UAT: Eine browser-basierte Sichtkontrolle steht aus (Phase 04 ist autonom ohne Checkpoint, daher in diesem Plan nicht durchgefuehrt). Frontend baut tsc-sauber; ein `npm run dev` waere ein zusaetzlicher Smoke-Test, ist aber nicht Teil der Plan-Verifikation.

## User Setup Required

Keine. Backend laeuft ueber bestehende Infra (verifyToken-Guard, /api/belege-Mount). Frontend laedt /belege als Route — der `/belege`-Sidebar-Link erscheint automatisch zwischen "Vertraege & Fristen" und "KI Agenten" beim naechsten Frontend-Reload.

UAT-Vorschlag (manuell, falls gewuenscht):
1. Frontend starten: `npm run dev` (in Wurzelverzeichnis) → Frontend laeuft auf Vite-Port.
2. Login → /belege im Browser oder via Sidebar-Click.
3. KPI-Grid sollte rendern (Werte ggf. 0 wenn keine Belege existieren — kein Crash).
4. Auf KPI "Zu prüfen" klicken → Browser navigiert zu /belege/zu-pruefen (Plan 08 fuellt das mit Inhalt).
5. Sidebar sollte zwischen "Vertraege & Fristen" und "KI Agenten" einen "Belege"-Eintrag mit 8 Sub-Items zeigen.

## Next Phase Readiness

- **Plan 04-08 (UI List/Detail)** kann starten — `belege.api.ts` exportiert `fetchReceipts`/`fetchReceipt`/`updateReceipt`/`setReceiptAreas`/`freigebenReceipt`. `StatusBadge` und `formatCurrencyFromCents` stehen bereit. Routes /belege/alle und /belege/:id muessen registriert werden.
- **Plan 04-09 (UI Upload)** kann starten — `belege.api.ts` exportiert `uploadReceipts(files: File[])` mit FormData-Setup. POST /api/belege/upload ist seit 04-03 aktiv.
- **Plan 04-10 (UI Tax/Export/Settings)** kann starten — `aggregateForUstva` ist seit 04-02 verfuegbar; Frontend muss nur GET-Endpoint dranbinden und KZ-Buckets rendern. `formatCurrencyFromCents` ist da fuer alle Geld-Felder.
- **Pattern fuer kuenftige Modul-Dashboards etabliert** — `/api/<modul>/overview-kpis` kann fuer Amazon und Finanzen analog implementiert werden.

## Self-Check: PASSED

Verifiziert per `test -f` / `git log` / `npx tsc` / `npx vitest` / `grep`:

- [x] `frontend/src/lib/format.ts` MODIFIED (formatCurrencyFromCents 1 Vorkommen)
- [x] `frontend/src/components/dj/StatusBadge.tsx` MODIFIED (5 Receipt-Status)
- [x] `frontend/src/components/layout/navConfig.ts` MODIFIED (17 /belege-Vorkommen — 1 Top-Level + 8 subItems + 8 pageNames)
- [x] `frontend/src/api/belege.api.ts` FOUND (15 exports)
- [x] `frontend/src/pages/belege/BelegeOverviewPage.tsx` FOUND (404 Zeilen, 6 KPICards, 1 ustvaZeitraum-Conditional)
- [x] `frontend/src/routes/routes.tsx` MODIFIED (Import + Route)
- [x] `backend/src/routes/belege.routes.ts` MODIFIED (router.get('/overview-kpis') 1 Vorkommen, VOR /:id)
- [x] Commit `fb73c2a` (Task 1: Frontend Foundation) FOUND in git log
- [x] Commit `85ce2b1` (Task 2a: Backend overview-kpis) FOUND in git log
- [x] Commit `fae0a61` (Task 2b: BelegeOverviewPage + Route) FOUND in git log
- [x] `cd frontend && npx tsc --noEmit` exit code 0
- [x] `cd backend && npx tsc --noEmit` exit code 0
- [x] `cd backend && npx vitest run` 112/112 passed
- [x] BelegeOverviewPage rendert 6 KPICards (4 fix + 1 conditional + 1 fix)
- [x] BelegeOverviewPage hat 2 Listen (ReceiptSection latest + upcoming)
- [x] navConfig hat 8 Sub-Items unter /belege (Übersicht, Alle, Neu, Offene Zahlungen, Zu prüfen, Steuer, Export, Einstellungen)
- [x] StatusBadge unterstuetzt 5 neue Receipt-Status (zu_pruefen, freigegeben, archiviert, nicht_relevant, ocr_pending)
- [x] formatCurrencyFromCents formatiert nach DE-Format ('1.234,56 €')
- [x] /api/belege/overview-kpis liefert alle 6 KPI-Werte + ustvaZeitraum + steuerrelevantThisYearCents

---
*Phase: 04-belege-modul-dj-buchhaltungs-refactoring*
*Plan: 07 (Wave 4)*
*Completed: 2026-05-06*
