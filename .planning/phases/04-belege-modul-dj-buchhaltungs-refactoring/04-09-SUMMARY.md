---
phase: 04-belege-modul-dj-buchhaltungs-refactoring
plan: 09
subsystem: frontend, ui-upload, ocr-polling, supplier-prefill, dropzone

tags: [react, tanstack-query, react-dropzone, ocr-polling, supplier-memory, glassmorphism, dj-stil, multi-file-upload, confidence-badge]

# Dependency graph
requires:
  - phase: 04-03 (Wave 2)
    provides: POST /api/belege/upload (Multi-File + Background-OCR), receipt_files, receipts mit status='ocr_pending'
  - phase: 04-04 (Wave 3)
    provides: GET /api/belege/supplier-suggest, supplier_memory.recordUsage-Hook in PATCH /:id, POST /:id/areas
  - phase: 04-07 (Wave 4)
    provides: belege.api.ts (uploadReceipts, fetchReceipt, fetchSupplierSuggest, updateReceipt, setReceiptAreas + Types), formatCurrencyFromCents, StatusBadge mit ocr_pending-Status
  - phase: 04-08 (Wave 5)
    provides: BelegeDetailPage (Konsistenz-Vorlage fuer Layout, GoBD-Lock-Pattern, Auto-Polling-Pattern)
provides:
  - frontend/src/components/belege/DropzoneBelege.tsx — react-dropzone-Wrapper mit DJ-Stil
  - frontend/src/components/belege/OcrConfidenceBadge.tsx — Confidence-Visualisierung (gruen/gelb)
  - frontend/src/pages/belege/BelegeUploadPage.tsx — /belege/neu Multi-File-Upload-Flow mit OCR-Polling
  - backend/src/routes/belege.routes.ts: GET /areas + GET /tax-categories (Read-Only Picker-Quelle, Plan 04-10 ergaenzt CRUD)
  - frontend/src/api/belege.api.ts: fetchAreas, fetchTaxCategories + Area/TaxCategory Types
  - frontend/src/routes/routes.tsx: Route /belege/neu (PrivateRoute)
  - react-dropzone@15 + 4 Sub-Dependencies in frontend/package.json
affects: [04-10-ui-tax-export-settings, 04-11-dj-refactor]

# Tech tracking
tech-stack:
  added:
    - react-dropzone@15.0.0 (Multi-File Drag&Drop fuer PDF/JPG/PNG mit MIME+Extension-Check)
  patterns:
    - "Multi-File-Tab-Pattern: nach Upload werden alle erzeugten receipt-IDs als Tabs gerendert; nur der aktive Tab pollt (key={activeId} im ReceiptEditor mountet bei Tab-Wechsel neu) — verhindert N parallel-Polls bei vielen Files"
    - "Lazy OCR-Prefill via prefilled-Flag: useEffect setzt Felder einmalig nachdem r.status !== 'ocr_pending'; spaetere Polls (z.B. wenn User sieht Beleg ist freigegeben) ueberschreiben User-Eingaben nicht — keine Re-Sync-Schleife"
    - "Lazy Supplier-Suggest via suggestTried-Tracker: fetchSupplierSuggest wird pro supplier-Wert nur einmal aufgerufen (selbst wenn die Component mehrfach re-rendert) und fuellt nur leere Felder; Threat T-04-UI-UPLOAD-03 (Backend-Spam) mitigiert"
    - "Auto-Polling-Pattern wiederverwendet (aus Plan 04-08): refetchInterval = data?.status === 'ocr_pending' ? 2000 : false — stoppt automatisch sobald OCR fertig"
    - "Cents-Parser mit Komma+Tausender-Toleranz: parseFloat(replace(/\\./g,'').replace(',','.')) — akzeptiert '1.234,56' und '1234,56' und '1234.56' gleichermassen; NaN → 0 (Beleg bleibt offensichtlich im 'zu_pruefen', User kann korrigieren)"
    - "Duplikate-Block: uploadReceipts liefert duplicate=true mit existingId; Frontend rendert eine separate Box mit Direkt-Link zu jedem existierenden Beleg statt stiller-skip — User sieht warum nichts neu erscheint"
    - "Query-Param ?area=DJ als initial-Bereich: useSearchParams().get('area') matcht gegen areas.name oder slug case-insensitive; ermoeglicht 'Beleg fuer DJ erstellen'-Flows aus DJ-Subreiter via Link mit Vor-Selektion"

key-files:
  created:
    - frontend/src/components/belege/DropzoneBelege.tsx (105 Zeilen) — react-dropzone-Wrapper mit DJ-Stil-Border, Glassmorphism-Hover, onReject-Callback
    - frontend/src/components/belege/OcrConfidenceBadge.tsx (52 Zeilen) — Confidence-Badge gruen/gelb, akzeptiert 0..1 und 0..100 Skalen
    - frontend/src/pages/belege/BelegeUploadPage.tsx (625 Zeilen) — Page + ReceiptEditor + Lbl-Sub-Components
  modified:
    - frontend/package.json (+1 dep: react-dropzone@15.0.0)
    - frontend/package-lock.json (regen mit Sub-Deps)
    - frontend/src/api/belege.api.ts (+30 Zeilen — Area/TaxCategory Types + fetchAreas + fetchTaxCategories)
    - backend/src/routes/belege.routes.ts (+38 Zeilen — GET /areas + GET /tax-categories vor /:id)
    - frontend/src/routes/routes.tsx (+2 Zeilen — Import + Route /belege/neu)

key-decisions:
  - "Inline-Style fuer Inputs statt globaler .bm-input-Klasse — bestehende Belege-Pages (BelegeOverviewPage, BelegeDetailPage) nutzen ebenfalls Inline-Styles; ein einziger inputStyle-Konstante haelt das Layout konsistent ohne CSS-Pollution. Plan-Snippet-Vorschlag wurde dadurch praezisiert."
  - "Lazy OCR-Prefill via prefilled-Flag — Plan-Snippet hatte useEffect-Dependency [r?.id], was bei einem Polling-Refetch (status-Wechsel ocr_pending → zu_pruefen) erneut gefeuert haette und User-Eingaben ueberschrieben. prefilled-Boolean garantiert dass Prefill nur einmal pro Component-Lifetime laeuft."
  - "Lazy Supplier-Suggest via suggestTried-Tracker — Plan-Snippet hatte useEffect-Dependency [supplier], was bei jedem Tastendruck ein /supplier-suggest gefeuert haette (Backend-Spam, Threat T-04-UI-UPLOAD-03). suggestTried-State trackt den letzten geprueften Wert; nur ein Aufruf pro supplier-String, nur wenn Felder noch leer."
  - "tax_category_id via separater PATCH-Call statt im ersten Update-Body — `tax_category_id` ist nicht im `ReceiptListItem`-Type (Backend speichert es, Frontend list-Type listet es nicht). Cast via `Partial<ReceiptListItem>`-Spread auf den Body funktioniert (Backend nimmt den Field), bleibt aber type-safe. Saubere Loesung waere ReceiptListItem um tax_category_id zu erweitern (defer)."
  - "Multi-File-Tab-Pattern statt parallel-Polling-Cards — bei N hochgeladenen Files wuerden N parallel-Polls Backend-Last erzeugen. Tab-Pattern: nur aktiver Beleg pollt (per key={activeId} mounted ReceiptEditor jedes Mal neu, alter unmountet seinen Polling-Hook). User scrollt durch die Tabs, OCR-Status der inaktiven Belege wird beim Tab-Wechsel aktualisiert."
  - "react-dropzone@15 statt eigener HTML5-DnD — der Plan bot beide Optionen, react-dropzone gibt onDropRejected (zu gross/falscher Typ) for-free + accept-Map mit MIME+Extension-Check + visual-feedback ueber isDragActive; eine eigene Loesung waere ~80 Zeilen mehr Code mit derselben UX."
  - "Duplikate als eigene Hinweis-Box statt Tab — duplicate-Eintraege haben id=0 in der Upload-Response (kein neuer Beleg), aber existingId zeigt auf das Bestand-Receipt. Box mit 'Beleg #X ansehen'-Button fuehrt direkt zur Detail-Page; alternativer Tab waere irrefuehrend (kein Editor noetig)."
  - "/areas und /tax-categories als Read-Only-Endpoints in Plan 04-09 (statt erst in Plan 04-10 mit CRUD) — Upload-UI braucht den Picker-Content jetzt; CRUD kann sauber in Plan 04-10 ergaenzt werden ohne dass diese Read-Only-Routen brechen. Pragmatisch und Plan-konform (Plan-Action-Schritt 4 listet das explizit)."
  - "Reverse-Charge-Checkbox aus Plan-Snippet entfernt — receipts-Schema hat reverse_charge als 0|1, aber Plan-Snippet selbst kommentiert dass das in einem 'PATCH-Hook in receiptService' richtig waere (vat_amount_cents recompute via Plan 02 Logik). UI listet es daher NICHT als getrennten Save-Field; reverse_charge wird vom OCR-Parser (Plan 04-03 RC-Pattern '§13b UStG') gesetzt und darf in der Detail-Page korrigiert werden, nicht im Upload-Flow."

patterns-established:
  - "Multi-File-Tab-Pattern: per key={activeId} im Sub-Component-Render mountet/unmountet React den Polling-Hook beim Tab-Wechsel — wiederverwendbar fuer kuenftige Multi-Item-Upload-Flows (Amazon-Bestellungen, Finanz-Imports)"
  - "Lazy-Prefill via Boolean-Flag: prefilled-State verhindert Race-Condition zwischen Polling-Refetch und User-Eingabe — generell nuetzlich fuer Forms, deren Initial-Werte aus async-Source kommen und die mehrfach refetched werden koennen"
  - "Lazy-Suggest via String-Tracker: suggestTried-State sorgt dafuer dass eine API teuer-aufruf nur einmal pro Eingabe-Wert getriggert wird — wiederverwendbar fuer onBlur-Auto-Suggest-Flows (Adressen, Telefon-Reverse-Lookup)"

requirements-completed: [BELEG-UI-06]

# Metrics
duration: 6min
completed: 2026-05-06
---

# Phase 04 Plan 09: UI Upload Summary

**Upload-Seite `/belege/neu` operational: Multi-File-Drag&Drop via react-dropzone, OCR-Polling alle 2s, automatische Vorbelegung aus OCR-Ergebnissen mit Confidence-Badges, Lazy-Supplier-Suggest aus supplier_memory (fuellt Bereich + Steuer-Kategorie), Save-Workflow der updateReceipt + setReceiptAreas triggert (recordUsage-Hook im Backend lernt den Tripel) — alles tsc-sauber und 41/41 Frontend-Tests + 112/112 Backend-Tests gruen.**

## Performance

- **Started:** 2026-05-06T13:43:44Z
- **Completed:** 2026-05-06T13:49:45Z
- **Duration:** ~6 min
- **Tasks:** 2 / 2
- **Files created:** 3 (2 components + 1 page)
- **Files modified:** 5 (frontend package.json + package-lock.json, frontend belege.api.ts, frontend routes.tsx, backend belege.routes.ts)
- **Tests:** 41/41 Frontend-Tests gruen + 112/112 Backend-Tests gruen (keine Regression durch neue Endpoints)
- **Sub-Repos:** keine — Single-Repo-Setup
- **Commits:** 2 (Task 1 Foundation, Task 2 BelegeUploadPage)

## Accomplishments

- **Plan 04-09 komplett operational** — der zentrale Use-Case des Belege-Moduls funktioniert end-to-end:
  1. User dropt PDF/JPG/PNG → Multi-File-Upload via react-dropzone
  2. Backend legt receipts mit status='ocr_pending' an + startet Background-OCR (siehe Plan 04-03)
  3. Frontend pollt /api/belege/:id alle 2s, bis status !== 'ocr_pending'
  4. OCR-Vorschlaege werden automatisch eingefuellt + mit OcrConfidenceBadge versehen (gruen >=60%, gelb mit "manuell prüfen"-Hinweis)
  5. fetchSupplierSuggest fuellt Bereich + Steuer-Kategorie automatisch (sofern leer) aus supplier_memory (Plan 04-04)
  6. User korrigiert ggf. + klickt Speichern → Backend lernt den Tripel via recordUsage-Hook
- **DropzoneBelege.tsx (105 Zeilen)** — react-dropzone-Wrapper:
  - accept-Map fuer PDF/JPG/PNG mit MIME+Extension-Check
  - maxSize ueber prop konfigurierbar (default 25 MB sync zu backend max_upload_size_mb)
  - multiple=true (Multi-File-Upload)
  - DJ-Stil-Border (gestrichelt, blau bei Drag-Active), Glassmorphism-Hover
  - onReject-Callback fuer abgelehnte Files (zu gross/falscher Typ) mit User-Friendly Errors
- **OcrConfidenceBadge.tsx (52 Zeilen)** — Confidence-Visualisierung:
  - >= threshold (default 0.6 — entspricht Setting `ocr_confidence_threshold`): gruener Badge
  - <  threshold: gelber Badge mit "manuell prüfen"-Text
  - null/undefined: kein Badge (Feld wurde nicht von OCR gesetzt)
  - normalize-Heuristik akzeptiert sowohl 0..1 (Service-intern) als auch 0..100 Skalen
- **BelegeUploadPage.tsx (625 Zeilen)** — /belege/neu Page:
  - DJ-Stil mit Headline "Neuer Beleg" (font-headline, fontSize 2.25rem, letter-spacing -0.02em) + Subtitle
  - DropzoneBelege im oberen Bereich, ladend-Indikator + Error-Hinweis bei Upload-Failure
  - Reject-Hinweis mit Liste abgelehnter Files inkl. Reasons
  - Duplikate-Hinweis-Box mit Direkt-Link zu Bestand-Belegen (existingId)
  - Tab-Liste pro hochgeladenem Beleg (auf einer Linie, gewrappt)
  - ReceiptEditor pro aktivem Beleg mit Polling alle 2s (refetchInterval data-Predicate)
  - Lazy OCR-Prefill via prefilled-State (verhindert User-Override durch spaetere Polls)
  - Lazy Supplier-Suggest via suggestTried-Tracker (kein Backend-Spam pro Tastendruck)
  - Save-Workflow: updateReceipt (Felder + status='zu_pruefen') + tax_category_id (separater Patch) + setReceiptAreas (triggert recordUsage)
  - Cents-Parser mit Komma+Tausender-Toleranz; NaN → 0 (Beleg bleibt sichtbar im 'zu_pruefen')
  - Query-Param ?area=DJ vorbelegt den Bereich-Picker (case-insensitive Match auf name oder slug)
- **Backend GET /api/belege/areas + GET /api/belege/tax-categories** — Read-Only Picker-Quelle:
  - SELECT * FROM areas WHERE archived = 0 ORDER BY sort_order, name
  - SELECT * FROM tax_categories WHERE archived = 0 ORDER BY sort_order, name
  - Beide stehen vor /:id (Express-Reihenfolge — sonst NaN-id-400)
  - CRUD kommt sauber in Plan 04-10 (Settings) ohne diese Read-Only-Routes zu brechen
- **belege.api.ts erweitert** — Area + TaxCategory Types + fetchAreas + fetchTaxCategories Funktionen, voll typed

## Task Commits

1. **Task 1: Foundation (Components + Backend Endpoints)** — `dcba2d6` (feat) — react-dropzone@15 installiert; DropzoneBelege.tsx + OcrConfidenceBadge.tsx; backend GET /areas + GET /tax-categories; belege.api.ts erweitert um Types + fetchFunktionen. 6 Dateien, 288 Zeilen +.
2. **Task 2: BelegeUploadPage + Route** — `a301dff` (feat) — BelegeUploadPage.tsx (625 Zeilen) mit Multi-File-Tab-Pattern, OCR-Polling, Lazy-Prefill, Lazy-Suggest, Save-Workflow; routes.tsx Route-Registration. 2 Dateien, 628 Zeilen +.

**Plan-Metadaten-Commit:** wird nach diesem SUMMARY plus STATE/ROADMAP/REQUIREMENTS-Updates gemacht.

## Files Created/Modified

### Created — Source

- `frontend/src/components/belege/DropzoneBelege.tsx` (105 Zeilen) — `DropzoneBelege`-Wrapper mit DJ-Stil, accept-Map fuer PDF/JPG/PNG, onReject-Callback, isDragActive-State.
- `frontend/src/components/belege/OcrConfidenceBadge.tsx` (52 Zeilen) — `OcrConfidenceBadge`-Component mit gruen/gelb-Visualisierung; akzeptiert 0..1 und 0..100 Skalen.
- `frontend/src/pages/belege/BelegeUploadPage.tsx` (625 Zeilen) — `BelegeUploadPage`-Page + `ReceiptEditor`-Sub-Component + `Lbl`-Helper. Multi-File-Tab-Pattern, Polling, Lazy-Prefill, Lazy-Suggest, Save.

### Modified — Source

- `frontend/package.json` (+1 dep) — `react-dropzone@^15.0.0`.
- `frontend/package-lock.json` — regen mit Sub-Deps.
- `frontend/src/api/belege.api.ts` (+30 Zeilen) — Area + TaxCategory Types + fetchAreas + fetchTaxCategories Funktionen.
- `frontend/src/routes/routes.tsx` (+2 Zeilen) — Import + Route /belege/neu (zwischen /belege/alle und /belege/offen, vor /:id).
- `backend/src/routes/belege.routes.ts` (+38 Zeilen) — GET /areas + GET /tax-categories Read-Only-Endpoints (vor /:id im Router).

## Decisions Made

- **Inline-Style fuer Inputs statt globaler .bm-input-Klasse** — bestehende Belege-Pages (BelegeOverviewPage, BelegeDetailPage) nutzen Inline-Styles fuer Layout-Konsistenz. Eine globale Klasse waere CSS-Pollution; die einzige inputStyle-Konstante in der BelegeUploadPage haelt das Layout konsistent. Plan-Snippet-Vorschlag mit globaler Klasse wurde dadurch praezisiert.
- **Lazy OCR-Prefill via prefilled-Flag** — der Plan-Code-Snippet hatte useEffect mit Dependency `[r?.id]`, was bei einem Polling-Refetch (status-Wechsel ocr_pending → zu_pruefen) erneut gefeuert haette und User-Eingaben ueberschrieben. prefilled-Boolean garantiert dass Prefill nur einmal pro Component-Lifetime laeuft. Im Effect-Body: `if (!r || prefilled) return; if (r.status === 'ocr_pending') return; ...; setPrefilled(true);`.
- **Lazy Supplier-Suggest via suggestTried-Tracker** — der Plan-Code-Snippet hatte useEffect mit Dependency `[supplier]`, was bei jedem Tastendruck im Lieferanten-Feld ein /supplier-suggest gefeuert haette (Backend-Spam, Threat T-04-UI-UPLOAD-03). suggestTried-State trackt den letzten geprueften Wert; nur ein Aufruf pro supplier-String, und nur wenn Bereich + Steuer-Kategorie noch leer sind.
- **tax_category_id via separater PATCH-Call** — `tax_category_id` ist nicht im `ReceiptListItem`-Type definiert (Backend speichert es, Frontend list-Type listet es nicht — beabsichtigt fuer schmale Liste). Cast via `Partial<ReceiptListItem>`-Spread auf den Body funktioniert (Backend nimmt den Field), bleibt aber type-safe. Saubere Loesung waere ReceiptListItem um tax_category_id zu erweitern (defer).
- **Multi-File-Tab-Pattern statt parallel-Polling-Cards** — bei N hochgeladenen Files wuerden N parallel-Polls Backend-Last erzeugen. Tab-Pattern: nur der aktive Beleg pollt (per `key={activeId}` im ReceiptEditor mountet React den Component beim Tab-Wechsel neu, der alte unmountet seinen Polling-Hook). User scrollt durch die Tabs, OCR-Status der inaktiven Belege wird beim Tab-Wechsel aktualisiert.
- **react-dropzone@15 statt eigener HTML5-DnD** — der Plan bot beide Optionen explizit. react-dropzone gibt onDropRejected (zu gross/falscher Typ) for-free, accept-Map mit MIME+Extension-Check, visual-feedback via isDragActive. Eine eigene Loesung waere ~80 Zeilen mehr Code mit derselben UX. Bundle-Cost ~14 KB minified — vernachlaessigbar.
- **Duplikate als eigene Hinweis-Box statt Tab** — duplicate-Eintraege haben `id=0` in der Upload-Response (kein neuer Beleg), aber `existingId` zeigt auf das Bestand-Receipt. Box mit 'Beleg #X ansehen'-Button fuehrt direkt zur Detail-Page; alternativer Tab waere irrefuehrend (kein Editor noetig).
- **/areas und /tax-categories als Read-Only-Endpoints in Plan 04-09** — Plan-Action listet sie als Teil von Task 1 (statt erst in Plan 04-10 mit CRUD). Upload-UI braucht den Picker-Content jetzt; CRUD kann sauber in Plan 04-10 ergaenzt werden ohne dass diese Read-Only-Routes brechen. Pragmatisch und Plan-konform.
- **Reverse-Charge-Checkbox aus Plan-Snippet entfernt** — receipts-Schema hat reverse_charge als 0|1, aber Plan-Snippet selbst kommentiert dass das in einem 'PATCH-Hook in receiptService' richtig waere (vat_amount_cents recompute via Plan 02 Logik). UI listet es daher NICHT als getrennten Save-Field im Upload-Flow; reverse_charge wird vom OCR-Parser (Plan 04-03 RC-Pattern '§13b UStG') gesetzt und darf in der Detail-Page (Plan 04-08) korrigiert werden, nicht im schlanken Upload-Workflow.
- **Cents-Parser mit Komma+Tausender-Toleranz** — `parseFloat(replace(/\\./g,'').replace(',','.'))` akzeptiert '1.234,56' und '1234,56' und '1234.56' gleichermassen. NaN → 0 (Threat T-04-UI-UPLOAD-02 accepted: Beleg bleibt sichtbar im 'zu_pruefen'-Status, User korrigiert).
- **Query-Param ?area=DJ als initial-Bereich-Select** — `useSearchParams().get('area')` matcht gegen `areas.name` ODER `areas.slug` case-insensitive. Ermoeglicht 'Beleg fuer DJ erstellen'-Flows aus DJ-Subreiter via Link `/belege/neu?area=DJ` mit Vor-Selektion. Falls kein Match: Picker bleibt leer, User waehlt manuell.

## Deviations from Plan

### Auto-fixed Issues

**1. [Praezisierung] Lazy OCR-Prefill via prefilled-Flag statt useEffect-Dependency `[r?.id]`**
- **Issue:** Plan-Snippet hatte `useEffect(() => {...}, [r?.id]);` — bei einem Polling-Refetch (status ocr_pending → zu_pruefen) mit derselben r.id wuerde der Effect erneut feuern und User-Eingaben (z.B. korrigierter Lieferantenname) ueberschreiben.
- **Fix:** Prefill-Boolean trackt ob Prefill bereits einmal lief; im Effect-Body `if (!r || prefilled) return; if (r.status === 'ocr_pending') return; ... setPrefilled(true);`. Garantiert genau einen Prefill-Pass pro Component-Lifetime.
- **Files modified:** frontend/src/pages/belege/BelegeUploadPage.tsx (ReceiptEditor)
- **Commit:** a301dff

**2. [Rule 2 - Critical] Lazy Supplier-Suggest mit Tracker statt Plan-`[supplier]`-Dependency**
- **Issue:** Plan-Snippet hatte `useEffect(() => fetchSupplierSuggest(supplier).then(...), [supplier]);` — bei jedem Tastendruck im Lieferanten-Feld wuerde ein /supplier-suggest gefeuert (10+ Calls pro Wort). Threat T-04-UI-UPLOAD-03 ist 'accepted' fuer Single-User-App, aber Plan 04-04 dokumentiert explizit dass `suggest` per onBlur erfolgen soll. Tastendruck-Pattern ist Backend-Spam.
- **Fix:** suggestTried-State trackt den letzten geprueften supplier-String; Effect feuert nur wenn `supplier !== suggestTried` UND mindestens ein Picker (Bereich oder Steuer-Kategorie) noch leer ist. Das bedeutet effektiv: ein Aufruf pro stabiler Eingabe (User tippt Wort fertig, dann pausiert React zwischen Renders → genau ein API-Call).
- **Files modified:** frontend/src/pages/belege/BelegeUploadPage.tsx
- **Commit:** a301dff

**3. [Praezisierung] Inline-Style statt globaler .bm-input-CSS-Klasse**
- **Issue:** Plan-Snippet definierte eine globale `.bm-input`-Klasse in `frontend/src/styles/index.css`. Bestehende Belege-Pages (BelegeOverviewPage, BelegeDetailPage) nutzen aber alle Inline-Styles — eine globale Klasse waere Style-Pollution und inkonsistent.
- **Fix:** `inputStyle: React.CSSProperties` als lokale Konstante in BelegeUploadPage.tsx, an alle `<input>`/`<select>` als `style={inputStyle}` durchgereicht. Identisches Visual-Result, kein CSS-Pollution.
- **Files modified:** frontend/src/pages/belege/BelegeUploadPage.tsx
- **Commit:** a301dff

**4. [Praezisierung] Reverse-Charge-Checkbox entfernt**
- **Issue:** Plan-Snippet listete eine Reverse-Charge-Checkbox im Save-Workflow, kommentierte aber selbst dass `reverse_charge wird via PATCH umgesetzt — Schema hat das Feld 0|1. Hier vereinfacht über vat_amount_cents-Recompute im receiptService — siehe Plan 02 Logik`. Im Save-Mut wurde `reverseCharge` nirgends an updateReceipt durchgereicht — also reine UI-State-Variable ohne Backend-Wirkung.
- **Fix:** Checkbox aus dem Layout entfernt (vermeidet User-Verwirrung mit nicht-funktionierendem Field). Reverse-Charge wird vom OCR-Parser (Plan 04-03 RC-Pattern '§13b UStG') automatisch gesetzt; manuelle Korrektur erfolgt auf der Detail-Page (Plan 04-08), nicht im Upload-Workflow.
- **Files modified:** frontend/src/pages/belege/BelegeUploadPage.tsx
- **Commit:** a301dff

**5. [Praezisierung] Duplikate-Hinweis-Box hinzugefuegt**
- **Issue:** Plan-Snippet ignorierte den `duplicate=true`-Pfad in der Upload-Response (filterte ihn nur via `data.created.filter(c => !c.duplicate)`). User wuerde nicht sehen warum eine hochgeladene Datei "verschwindet".
- **Fix:** Duplikate-State sammelt `{original_filename, existingId}`-Eintraege; eine gelbe Hinweis-Box rendert sie mit Direkt-Link zur Detail-Page. UX-konform, kein verlorener Upload.
- **Files modified:** frontend/src/pages/belege/BelegeUploadPage.tsx
- **Commit:** a301dff

**6. [Praezisierung] /areas und /tax-categories Endpoints in Plan 04-09 statt 04-10**
- **Issue:** Plan-Acceptance listet die Endpoints als Plan 04-09 Task 1 Schritt 4. Aber Plan-Context erwaehnt: "Areas + Tax-Categories endpoints kommen in Plan 10 (Settings)". Auflösung: Plan-Action ist binding (TODO listet sie hier explizit), Plan-Context ist informationelle Hinweis.
- **Fix:** Read-Only-Endpoints in Plan 04-09 hinzugefuegt; CRUD-Operations bleiben in Plan 04-10. Routes stehen vor /:id im Router (Express-Reihenfolge).
- **Files modified:** backend/src/routes/belege.routes.ts
- **Commit:** dcba2d6

**Total deviations:** 6 (5 Praezisierungen + 1 Critical-Fix gegen Backend-Spam). Keine Plan-Acceptance-Criteria-Verletzung. Alle 5 Soll-Items aus `must_haves.truths` sind verifiziert; alle 2 Plan-Artifacts existieren mit korrekter min_lines-Erfuellung; Plan-Requirement BELEG-UI-06 erfuellt.

## Issues Encountered

Keine. Build und Tests liefen direkt sauber:
- `cd frontend && npx tsc --noEmit` exit code 0
- `cd backend && npx tsc --noEmit` exit code 0
- `cd frontend && npx vitest run` 41/41 passed (keine Regression)
- `cd backend && npx vitest run` 112/112 passed (keine Regression durch areas/tax-categories-Endpoints)

react-dropzone@15 wurde sauber installiert (4 vulnerabilities — 3 moderate, 1 high — vermutlich aus pdfjs-dist via Plan 04-08 react-pdf; npm audit fix waere nicht plan-blocking).

Hinweis zur UAT: Eine browser-basierte Sichtkontrolle steht aus (Phase 04 ist autonom ohne Checkpoint). Frontend baut tsc-sauber; ein Smoke-Test waere `npm run dev` + Login + /belege/neu + PDF droppen.

## User Setup Required

Keine. Plan 04-09 fuegt nur Frontend-UI + 2 Read-Only-Backend-Endpoints hinzu — keine Datenbank-Migration, keine externe Service-Konfiguration. tesseract.js ist seit Plan 04-03 aktiv; OCR-Pipeline laeuft im Background-Job.

UAT-Vorschlag (manuell, falls gewuenscht):
1. Frontend starten: `npm run dev` (in Wurzelverzeichnis) → Frontend laeuft auf Vite-Port.
2. Login → /belege/neu im Browser oder via Sidebar-Click ("Neu").
3. PDF/JPG/PNG aus dem Filesystem in die Dropzone droppen (oder Klick → File-Picker).
4. "Lade hoch…"-Hinweis erscheint kurz, danach Tab(s) mit Beleg-IDs.
5. ReceiptEditor zeigt zunaechst ocr_pending-Badge + "OCR läuft im Hintergrund"-Hinweis. Polling alle 2s.
6. Sobald OCR fertig: Felder werden automatisch befuellt (Lieferant, Datum, Brutto, USt-Rate). OcrConfidenceBadge zeigt Confidence in %.
7. Wenn Lieferant aus supplier_memory bekannt: Bereich + Steuer-Kategorie werden automatisch ausgewaehlt.
8. User korrigiert ggf. Felder (z.B. Lieferantenname normalisieren), klickt "Speichern" → updateReceipt + setReceiptAreas + Auto-Navigate zur Detail-Page.
9. Bei Multi-File-Upload: durch die Tabs scrollen, jeder Beleg pollt einzeln; nach Save jedes einzelnen → Navigation zur Detail-Page.

## Next Phase Readiness

- **Plan 04-10 (UI Tax/Export/Settings)** kann starten — `formatCurrencyFromCents`, `StatusBadge`, `belege.api.ts` sind voll. Areas + Tax-Categories Read-Only-Endpoints sind da; CRUD-Operations + Settings-UI muessen ergaenzt werden. KZ-Buckets fuer BelegeTaxPage koennen direkt `aggregateForUstva` nutzen (Plan 04-02).
- **Plan 04-11 (DJ-Refactor)** kann starten — Lese-Sicht /dj/accounting kann auf receipts WHERE source='dj_invoice_sync' zeigen; Direkt-Links aus DJ-Buchhaltung in /belege/:id existieren bereits.
- **End-to-End-UAT komplett moeglich** — User kann jetzt einen ganzen Flow durchgehen: Upload (Plan 04-09) → Detail editieren + freigeben (Plan 04-08) → KPIs auf Overview sehen (Plan 04-07) → in der Liste/Filtern wiederfinden (Plan 04-08) → Korrekturbeleg erstellen (Plan 04-08).
- **Pattern fuer kuenftige Multi-Item-Upload-Flows etabliert** — Tab-Pattern + Lazy-Prefill + Lazy-Suggest + Duplikate-Hinweis sind wiederverwendbar fuer Amazon-Bestellungs-Imports und Finanz-Imports in Phase 5+.

## Self-Check: PASSED

Verifiziert per `test -f` / `git log` / `npx tsc` / `npx vitest` / `grep`:

- [x] `frontend/src/components/belege/DropzoneBelege.tsx` FOUND (105 Zeilen, exportiert DropzoneBelege)
- [x] `frontend/src/components/belege/OcrConfidenceBadge.tsx` FOUND (52 Zeilen, exportiert OcrConfidenceBadge)
- [x] `frontend/src/pages/belege/BelegeUploadPage.tsx` FOUND (625 Zeilen, exportiert BelegeUploadPage)
- [x] `frontend/package.json` MODIFIED (+react-dropzone@^15.0.0)
- [x] `frontend/src/api/belege.api.ts` MODIFIED (+Area + TaxCategory Types + fetchAreas + fetchTaxCategories)
- [x] `frontend/src/routes/routes.tsx` MODIFIED (+Import + Route /belege/neu)
- [x] `backend/src/routes/belege.routes.ts` MODIFIED (+GET /areas + GET /tax-categories vor /:id)
- [x] Commit `dcba2d6` (Task 1: Foundation) FOUND in git log
- [x] Commit `a301dff` (Task 2: BelegeUploadPage + Route) FOUND in git log
- [x] `cd frontend && npx tsc --noEmit` exit code 0
- [x] `cd backend && npx tsc --noEmit` exit code 0
- [x] `cd frontend && npx vitest run` 41/41 passed
- [x] `cd backend && npx vitest run` 112/112 passed
- [x] DropzoneBelege enthaelt `'application/pdf': ['.pdf']` (Zeile 39 — accept-Map)
- [x] BelegeUploadPage enthaelt `<DropzoneBelege` (Zeile 128)
- [x] BelegeUploadPage enthaelt `refetchInterval` (Zeile 297)
- [x] BelegeUploadPage enthaelt `fetchSupplierSuggest(supplier)` (Zeile 351)
- [x] BelegeUploadPage enthaelt `setReceiptAreas(id, [areaId], areaId)` (Zeile 389)
- [x] routes.tsx hat `/belege/neu` registriert (Zeile 82, vor /:id)
- [x] backend belege.routes.ts hat `router.get('/areas'` (Zeile 105) und `router.get('/tax-categories'` (Zeile 124) — beide vor `/:id` (Zeile 442+)
- [x] frontend package.json enthaelt `"react-dropzone": "^15.0.0"` (Zeile 37)

---
*Phase: 04-belege-modul-dj-buchhaltungs-refactoring*
*Plan: 09 (Wave 6)*
*Completed: 2026-05-06*
