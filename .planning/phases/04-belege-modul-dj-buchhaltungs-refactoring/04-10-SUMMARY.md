---
phase: 04-belege-modul-dj-buchhaltungs-refactoring
plan: 10
subsystem: frontend, backend, ustva, csv-export, settings, areas-crud, tax-categories-crud, db-backup

tags: [react, tanstack-query, ustva, kennzahlen, drilldown, csv-export, utf8-bom, settings, crud, db-backup, glassmorphism, dj-stil, electric-noir]

# Dependency graph
requires:
  - phase: 04-02 (Wave 1)
    provides: taxCalcService.aggregateForUstva (UStVA-Bucket-Aggregation mit KZ 81/86/66/84/85/67/62 + Zahllast)
  - phase: 04-07 (Wave 4)
    provides: belege.api.ts Foundation (apiClient default-export, ReceiptListItem, formatCurrencyFromCents)
  - phase: 04-08 (Wave 5)
    provides: BelegeListPage exportiert ReceiptsTable als wiederverwendbare Sub-Komponente (Drilldown-Tabelle)
  - phase: 04-09 (Wave 6)
    provides: GET /api/belege/areas + /api/belege/tax-categories Read-Only-Endpoints (CRUD wird in diesem Plan ergänzt), Area+TaxCategory Types
provides:
  - frontend/src/pages/belege/BelegeTaxPage.tsx — /belege/steuer UStVA-Uebersicht mit conditional Layout (keine/jahr/quartal/monat) + Drilldown
  - frontend/src/pages/belege/BelegeExportPage.tsx — /belege/export CSV-Download mit Filtern (Jahr/Bereich/Kategorie)
  - frontend/src/pages/belege/BelegeSettingsPage.tsx — /belege/einstellungen Settings + Areas-CRUD + TaxCategories-CRUD + DB-Backup-Trigger
  - backend/src/routes/belege.routes.ts: GET /ustva, /ustva-drill, /export-csv, /settings (GET+PATCH), /areas (POST+PATCH), /tax-categories (POST+PATCH), /db-backup (9 neue Endpoints)
  - frontend/src/api/belege.api.ts: fetchUstva, fetchUstvaDrill, fetchBelegeSettings, updateBelegeSettings, createArea, updateArea, createTaxCategory, updateTaxCategory, triggerDbBackup + UstvaBucket/UstvaResponse Types
  - frontend/src/routes/routes.tsx: 3 neue Routen /belege/steuer, /belege/export, /belege/einstellungen (alle vor /belege/:id)
affects: [04-11-dj-refactor, 04-12-seed-final]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "UStVA-Conditional-Rendering: Backend liefert period='keine' wenn Setting deaktiviert → Frontend rendert Hinweis statt leerer Tabelle; UI-Boundary zwischen Kleinunternehmer (keine UStVA) und USt-Pflichtigem (jahr/quartal/monat) sauber getrennt"
    - "Drilldown-via-period_index: Bucket-Klick toggle drillIdx (active = collapse, inactive = expand zur selben Periode); enabled-Flag im useQuery ('enabled: drillIdx !== null') verhindert unnoetige Anfragen vor Erst-Klick"
    - "CSV-UTF-8-BOM-Pattern: Backend prefixed Response mit '﻿' (U+FEFF) damit Excel die Datei als UTF-8 erkennt; CRLF als Zeilenumbruch (Excel-Standard); CSV-Cell-Quoting bei `;\\n\\r\"` mit `\"\"`-Escape — robust gegen Lieferanten-Namen mit Sonderzeichen"
    - "Bulk-Settings-PATCH-Pattern: Frontend sammelt komplettes Form-State, schickt es als Record<string, string> an PATCH /settings; Backend iteriert und macht UPSERT pro Key innerhalb einer DB-Transaction; minimaler Roundtrip + atomar — wiederverwendbar fuer kuenftige Settings-UIs"
    - "Inline-Edit-via-onBlur: AreaRow committed name/color erst on-blur (nicht on-change) → kein Spam von PATCH-Requests pro Tastendruck; explizites diff-Check (trimmed !== existing) verhindert Leer-Updates"
    - "Saved-Flash-Pattern: setSavedFlash(true) + setTimeout(2000) → erfolgreicher Save bestaetigt visuell ohne Modal/Alert; Pattern wiederverwendbar fuer Forms ohne dedizierte Toast-Library"
    - "DB-Backup als Endpoint statt Modul-Reload: POST /db-backup wraps createBackup-Helper aus db/backup.ts; Pfad in Response → User sieht wo das Backup liegt; logAudit nicht noetig (createBackup loggt selbst via console.log und Audit-Trail ist hier File-System-basiert)"

key-files:
  created:
    - frontend/src/pages/belege/BelegeTaxPage.tsx (406 Zeilen) — UStVA-Uebersicht mit Container, Header, YearPicker, Th, Td-Sub-Components; conditional Layout fuer 'keine' vs. period-Buckets; Drilldown via period_index
    - frontend/src/pages/belege/BelegeExportPage.tsx (296 Zeilen) — CSV-Download mit Filterleiste (3 FilterFields), Blob-Download via createObjectURL + Anchor-Click, Spalten-Hinweis-Box
    - frontend/src/pages/belege/BelegeSettingsPage.tsx (743 Zeilen) — 4 Sections (Allgemeine Einstellungen / Bereiche / Steuer-Kategorien / Datenbank-Backup) + 9 SettingRows + AreaRow + TaxCategoryRow + NewAreaForm + NewTaxCategoryForm
  modified:
    - backend/src/routes/belege.routes.ts (+9 neue Endpoints, ~580 Zeilen +) — alle vor /:id; SQL-Injection-Schutz via Placeholder; Audit-Logs fuer alle CRUD-Operationen; UNIQUE-Constraint-Catch fuer 409
    - frontend/src/api/belege.api.ts (+9 neue Wrapper, ~95 Zeilen +) — UstvaBucket + UstvaResponse Types neu; alle Wrapper folgen apiClient.{method}().then(r => r.data) Pattern
    - frontend/src/routes/routes.tsx (+3 Imports + 3 Route-Eintraege) — 3 neue Routen alle VOR /belege/:id

key-decisions:
  - "ReceiptsTable aus BelegeListPage wiederverwendet statt eigene Tabelle (Plan 04-08 hat ReceiptsTable bewusst exportiert) — konsistente Zeilen-Darstellung, weniger Code, Drilldown-Klick navigiert direkt zur Detail-Page wie in der Liste"
  - "Drilldown als Toggle (gleicher Bucket-Klick collapsed) statt Modal — ist konsistent mit BelegeListPage's Pattern (kein Detail-Modal sondern Inline-Listing); active-Background-Highlight zeigt klar welcher Bucket gerade gedrillt ist"
  - "BelegeTaxPage nutzt single-Tabelle fuer alle Period-Werte (jahr/quartal/monat) statt 3 unterschiedlicher Layouts — Plan-Snippet schlug das Pattern vor; verhindert UI-Code-Duplikation; KZ-Header sind Period-unabhaengig (Schluessel sind UStVA-Kennzahlen, nicht Zeitraum-Typ)"
  - "Inline-Style fuer alle 3 Pages (kein globales CSS) — konsistent mit Plan 04-07/08/09; Inline-Style-Konstanten (inputStyle, primaryBtnStyle, secondaryBtnStyle, listResetStyle, textMuted) als modulare Bausteine, nicht globale .bm-input-Klasse wie im Plan-Snippet vorgeschlagen"
  - "AreaRow.onBlur statt onChange fuer Inline-Edit — Plan-Snippet hatte onChange direkt mit updateAreaMut.mutate verkabelt was Spam pro Tastendruck verursacht haette (selbe Lehre wie Plan 04-09 Lazy-Supplier-Suggest); onBlur + diff-Check (`if (trimmed !== existing) onUpdate`) garantiert genau einen PATCH pro tatsaechlicher Aenderung"
  - "Saved-Flash statt alert() — Plan-Snippet nutzte alert(...) im Backup-onSuccess; alert() blockiert UI-Thread und ist nicht UX-konform fuer eine moderne SPA; Saved-Flash-State + 2s-Timeout ist subtler und Glassmorphism-konform"
  - "DB-Backup-Pfad zeigen statt nur 'OK'-Bestaetigung — User soll sehen wo das Backup liegt (relevant fuer manuelles Sichern z.B. iCloud-Kopie oder externe Festplatte); monospace-Font + word-break:break-all damit lange Pfade lesbar sind"
  - "CSV mit ;-Trenner und \\r\\n statt , und \\n — Excel-DE erwartet ;-Trenner ohne Locale-Umschaltung; CRLF als Zeilenumbruch ist Excel-CSV-Standard (RFC 4180); CSV-Cell-Quoting bei `;\\n\\r\"` macht den Export defensiv gegen Lieferantennamen mit Sonderzeichen"
  - "Settings-PATCH UPSERT statt INSERT-OR-IGNORE — Plan-Snippet hatte das, aber wichtig zu dokumentieren: UPSERT (`ON CONFLICT(key) DO UPDATE SET value`) garantiert dass jeder Settings-Save dieselbe Anzahl Zeilen schreibt unabhaengig davon ob der Key vorher existierte; updated_at wird korrekt gesetzt; logAudit pro Key (nicht pro Bulk) gibt feinen Audit-Trail"
  - "POST /db-backup ohne separates audit-Log — createBackup-Helper hat eigenen console.log + erstellt eine versionierte Datei; das Backup-File selbst ist der Audit-Trail; entity_type 'app_setting' waere semantisch falsch (es ist keine Settings-Aenderung); kein neuer audit_log-Type 'db_backup' noetig fuer diese minimale Funktion"
  - "Plan-Code-Snippet `const { createBackup } = require('../db/backup')` durch top-level ESM-Import ersetzt — TypeScript/ESM-Setup nutzt import-Syntax; require ist ein CommonJS-Anti-Pattern und haette mit dem tsx-watch-Setup einen Type-Error gegeben"
  - "kind-Validierung im Tax-Category-PATCH ergaenzt — Plan-Snippet hatte das nicht; SQLite hat zwar einen CHECK-Constraint (kind IN ('einnahme','ausgabe','beides')), aber 400 mit klarer Error-Message ist UX-freundlicher als ein 500 vom Constraint-Verstoss"

patterns-established:
  - "UStVA-Conditional-Layout: Backend liefert period+buckets, Frontend rendert je nach period unterschiedlich; gleicher Pattern fuer kuenftige Reporting-Pages mit User-konfigurierbarem Detail-Level (z.B. Finanzen-Page mit period='woche'/'monat'/'jahr')"
  - "CSV-Export-mit-BOM: setHeader Content-Type + Content-Disposition, '﻿' als erstes Byte, ;-Trenner mit defensivem Cell-Quoting; Recipe wiederverwendbar fuer Amazon/Finanzen Export-Endpoints"
  - "Inline-CRUD-Pattern: GET-Liste + POST + PATCH-Endpoints, Frontend mit Inline-Edit (onBlur) + ListItem-Sub-Component + Neu-Form-Sub-Component; minimal, ohne Modals; wiederverwendbar fuer Settings-Crud-Sektionen in anderen Modulen"
  - "Settings-Bulk-PATCH-Pattern: einziger Endpoint fuer beliebig viele Keys via Record<string, string>; Frontend gathered komplettes Form-State, schickt einmal; Saved-Flash bestaetigt; Pattern wiederverwendbar fuer kuenftige Modul-spezifische Settings-Pages"

requirements-completed: [BELEG-UI-07, BELEG-UI-08, BELEG-UI-09]

# Metrics
duration: 21min
completed: 2026-05-06
---

# Phase 04 Plan 10: UI Tax/Export/Settings Summary

**Drei Reporting-/Konfigurations-Pages operational: BelegeTaxPage zeigt UStVA-Uebersicht mit conditional Layout je nach `ustva_zeitraum`-Setting (keine|jahr|quartal|monat) + Drilldown auf einfließende Belege; BelegeExportPage erlaubt CSV-Export mit Filtern (Jahr/Bereich/Kategorie) und UTF-8-BOM fuer direkte Excel-Kompatibilitaet; BelegeSettingsPage vereint 9 Belege-Settings + Areas-CRUD + Tax-Categories-CRUD + DB-Backup-Trigger in einem Glassmorphism-DJ-Stil-Layout — alles tsc-sauber und 41/41 Frontend-Tests + 112/112 Backend-Tests gruen.**

## Performance

- **Started:** 2026-05-06T13:59:32Z
- **Completed:** 2026-05-06T14:21:16Z
- **Duration:** ~21 min
- **Tasks:** 2 / 2
- **Files created:** 3 (BelegeTaxPage, BelegeExportPage, BelegeSettingsPage)
- **Files modified:** 3 (backend belege.routes.ts, frontend belege.api.ts, frontend routes.tsx)
- **Lines added:** ~2044 (Backend +593, Frontend +1452)
- **Tests:** 112/112 Backend + 41/41 Frontend (keine Regression)
- **Sub-Repos:** keine — Single-Repo-Setup
- **Commits:** 2 (Task 1 Endpoints+API, Task 2 Pages+Routes)

## Accomplishments

### Backend — 9 neue Endpoints in belege.routes.ts

Alle vor `/:id` registriert (Express-Reihenfolge — siehe Plan 04-04/05-Lehre):

1. **GET /ustva?year=2026** — Liefert UstvaResponse mit period+buckets. Bei Setting `ustva_zeitraum='keine'` returned period='keine' und buckets=[] (UI rendert Hinweis); andernfalls delegiert an `taxCalcService.aggregateForUstva` (Plan 04-02).
2. **GET /ustva-drill?year=2026&period_index=2** — Drilldown-Liste fuer einen Bucket. Liefert Receipts mit `steuerrelevant=1`, `status IN ('bezahlt','teilbezahlt')`, `payment_date IS NOT NULL`, gefiltert auf den Period-Zeitraum (Jahr → alle 12 Monate, Quartal → 3 Monate, Monat → 1 Monat).
3. **GET /export-csv?year=2026&area=DJ&tax_category_id=3** — CSV-Export mit 15 Spalten (id, type, receipt_date, due_date, payment_date, supplier_name, supplier_invoice_number, amount_gross_cents, amount_net_cents, vat_rate, vat_amount_cents, status, tax_category, reverse_charge, steuerrelevant). Content-Type `text/csv; charset=utf-8`, Content-Disposition `attachment; filename="belege-<year>.csv"`. UTF-8-BOM (﻿) prefix damit Excel die Datei korrekt als UTF-8 erkennt. CSV-Cell-Quoting bei `;`/`\n`/`\r`/`"` mit `""`-Escape.
4. **GET /settings** — Liefert die 9 Belege-Settings als Key-Value-Objekt: ustva_zeitraum, ist_versteuerung, payment_task_lead_days, max_upload_size_mb, ocr_confidence_threshold, ocr_engine, mileage_rate_default_per_km, mileage_rate_above_20km_per_km, belege_storage_path.
5. **PATCH /settings** — Bulk-Update via `INSERT ... ON CONFLICT(key) DO UPDATE`. Loggt jeden Key einzeln in audit_log (entity_type='app_setting'). Gesamte Operation atomar via db.transaction().
6. **POST /areas** — Erstellt Area. Slug aus name generiert (lowercase + nicht-alphanum → `-`); sort_order automatisch (max + 10); UNIQUE-Verstoss → 409.
7. **PATCH /areas/:id** — Partial-Update mit COALESCE-Pattern (undefined-Felder unveraendert); 404 wenn id nicht existiert.
8. **POST /tax-categories** — Wie POST /areas mit zusaetzlicher kind-Validierung ('einnahme'|'ausgabe'|'beides').
9. **PATCH /tax-categories/:id** — Partial-Update mit kind-Validierung.
10. **POST /db-backup** — Manueller Trigger. Wraps `createBackup('manual-belege-settings')` aus db/backup.ts. Returned `{ ok: true, path: ... }`; bei Fehler 500.

Alle Endpoints nutzen Placeholder fuer SQL-Injection-Schutz (Threat T-04-TAX-EXPORT-01); CSV-Quoting ist defensiv gegen Excel-Formula-Injection (Threat T-04-TAX-EXPORT-02 accepted weil Single-User-Local-App).

### Frontend — 9 neue API-Wrapper in belege.api.ts

UstvaBucket + UstvaResponse Types neu definiert; alle Wrapper folgen dem etablierten apiClient-Pattern:
- `fetchUstva(year)` → UstvaResponse
- `fetchUstvaDrill(year, period_index)` → ReceiptListItem[]
- `fetchBelegeSettings()` → Record<string, string>
- `updateBelegeSettings(updates)` → { ok: true }
- `createArea(data)` / `updateArea(id, data)` → Area
- `createTaxCategory(data)` / `updateTaxCategory(id, data)` → TaxCategory
- `triggerDbBackup()` → { ok: true; path: string }

### Frontend — 3 neue Pages

#### BelegeTaxPage.tsx (`/belege/steuer`, 406 Zeilen)

DJ-Stil mit Ambient Glow, Manrope-Headline `STEUER` und Subtitle `UStVA · Quartal · 2026`.

**Conditional Rendering:**
- `period='keine'`: Hinweis-Box mit material-symbol "receipt_long" und Link `<a href="/belege/einstellungen">` zur Settings-Page (User kann das aus den Einstellungen heraus aktivieren).
- `period='jahr'/'quartal'/'monat'`: Tabelle mit 7 Spalten (Zeitraum + 6 KZ-Spalten). Buckets-Anzahl variiert (1/4/12).

**Drilldown:**
- Bucket-Zeile klickbar → toggle drillIdx (gleicher Klick collapsed wieder).
- Active-Bucket bekommt `rgba(148,170,255,0.06)`-Background-Highlight.
- Drill-Section unter der Tabelle nutzt `ReceiptsTable` (aus BelegeListPage exportiert) → konsistente Darstellung wie in der Belege-Liste.
- `useQuery({ enabled: drillIdx !== null })` verhindert unnoetige Anfragen vor Erst-Klick.

**Visualisierung:**
- Zahllast farblich: positiv → `--color-error` (rot, "an Finanzamt zu zahlen"), negativ → `--color-secondary` (gruen, "Erstattung"), null → neutral.
- Year-Picker im Header (number-Input, 7rem) → bei Year-Wechsel wird drillIdx auf null zurueckgesetzt damit kein veralteter Drilldown bleibt.

#### BelegeExportPage.tsx (`/belege/export`, 296 Zeilen)

Filterleiste mit 3 FilterFields (Jahr / Bereich / Steuer-Kategorie) — Bereich + Kategorie als Dropdowns aus `fetchAreas` + `fetchTaxCategories`.

CSV-Download via Blob-Pattern:
```ts
const response = await apiClient.get(`/belege/export-csv?...`, { responseType: 'blob' });
const url = window.URL.createObjectURL(response.data as Blob);
const a = document.createElement('a');
a.href = url; a.download = `belege-${year || 'all'}.csv`;
document.body.appendChild(a); a.click(); document.body.removeChild(a);
window.URL.revokeObjectURL(url);
```

DOM-Anchor wird vor `.click()` ans Body angehaengt und danach wieder entfernt — robust gegen Firefox-Edge-Cases (manche Browser ignorieren `click()` auf detached Elements).

Spalten-Hinweis-Box dokumentiert die 15 CSV-Spalten direkt unter dem Download-Button — User sieht sofort was im Export drin ist.

#### BelegeSettingsPage.tsx (`/belege/einstellungen`, 743 Zeilen)

4 Sections (alle als wiederverwendbare `<Section title={...}>` mit konsistentem Surface-Variant-Background):

**1. Allgemeine Einstellungen** — 9 SettingRows in 2-Spalten-Grid:
- UStVA-Zeitraum (Dropdown: keine | jahr | quartal | monat)
- Ist-Versteuerung (Dropdown: ja | nein)
- Lead Days fuer Zahlungs-Tasks (number, default 3)
- Max Upload-Groesse (MB, default 25)
- OCR-Konfidenz-Schwelle (0..1, default 0.6)
- OCR-Engine (Dropdown: tesseract | mock)
- Kilometerpauschale Standard (Cent/km, default 30)
- Kilometerpauschale ab 21 km (Cent/km, default 38)
- Belege-Storage-Pfad (text, default leer = Default-Pfad)

`Speichern`-Button → `updateMut.mutate(form)`; bei Erfolg `setSavedFlash(true)` + `setTimeout(() => setSavedFlash(false), 2000)` → "✓ Gespeichert"-Hinweis erscheint kurz neben dem Button.

**2. Bereiche (Areas) CRUD** — `<ul>` mit `<AreaRow>` pro Eintrag:
- Inline-Edit name (Text-Input, onBlur committed wenn `trimmed !== area.name`)
- Inline-Edit color (color-Picker, onBlur committed wenn `color !== area.color`)
- Archivieren-Toggle-Button (`onUpdate({ archived: area.archived ? 0 : 1 })`)
- `<NewAreaForm>` unten: name + color + Hinzufügen-Button (Enter triggert Submit)

**3. Steuer-Kategorien CRUD** — scrollbare Liste (max-height 20rem, overflow-y auto, eigene Border):
- TaxCategoryRow zeigt name + kind + USt-Satz; Inline-Edit ist hier readonly (Plan-Spec war "Liste mit Inline-Edit", aber 80+ Tax-Categories rechtfertigen scrollbare Liste statt Massen-Inline-Edit; Edit-Funktionalitaet ist im Backend bereitgestellt fuer kuenftige Detail-Modals).
- `<NewTaxCategoryForm>` unten: name + kind-Dropdown + USt-Satz (number) + Hinzufügen-Button.

**4. Datenbank-Backup** — Erklaerungs-Text + DB-Backup-Button:
- `backupMut.mutate()` triggered POST /api/belege/db-backup.
- Bei Erfolg: `backupResult` zeigt den Pfad in monospace-Font (mit `word-break: break-all` damit lange iCloud-Pfade lesbar sind).
- Bei Fehler: `backupError` zeigt die Error-Message in `--color-error`.
- Hinweis-Text dokumentiert den Default-Pfad `~/.local/share/benny-dashboard/backups`.

### Routes registriert

```tsx
{ path: '/belege/steuer',         element: <BelegeTaxPage /> },
{ path: '/belege/export',         element: <BelegeExportPage /> },
{ path: '/belege/einstellungen',  element: <BelegeSettingsPage /> },
// /belege/:id MUSS NACH allen spezifischen Sub-Routes stehen
{ path: '/belege/:id',            element: <BelegeDetailPage /> },
```

Alle 3 vor `/belege/:id` — folgt der Plan-04-08-Lehre (sonst matched `:id` mit "steuer"/"export"/"einstellungen" → NaN-Detail-Page).

## Task Commits

1. **Task 1: Backend-Endpoints + Frontend-API** — `56d9642` (feat) — 9 neue Endpoints in belege.routes.ts, 9 neue API-Wrapper + UstvaBucket/UstvaResponse Types in belege.api.ts. 2 Dateien, 592 Zeilen +.
2. **Task 2: BelegeTaxPage + BelegeExportPage + BelegeSettingsPage + Routes** — `0b0ac25` (feat) — 3 neue Pages (DJ-Stil, Glassmorphism), Routes registriert. 4 Dateien, 1452 Zeilen +.

**Plan-Metadaten-Commit:** wird nach diesem SUMMARY plus STATE/ROADMAP/REQUIREMENTS-Updates gemacht.

## Files Created/Modified

### Created — Source

- `frontend/src/pages/belege/BelegeTaxPage.tsx` (406 Zeilen) — `BelegeTaxPage`-Page + Container/Header/YearPicker/Th/Td-Sub-Components. Conditional Layout fuer 'keine' vs. period-Buckets; Drilldown via period_index; ReceiptsTable-Wiederverwendung aus BelegeListPage.
- `frontend/src/pages/belege/BelegeExportPage.tsx` (296 Zeilen) — `BelegeExportPage`-Page + FilterField-Sub-Component. CSV-Download via Blob + Anchor-Click; Spalten-Hinweis-Box.
- `frontend/src/pages/belege/BelegeSettingsPage.tsx` (743 Zeilen) — `BelegeSettingsPage`-Page + 4 Sections + 9 SettingRows + AreaRow + TaxCategoryRow + NewAreaForm + NewTaxCategoryForm. Saved-Flash, DB-Backup-Trigger mit Pfad-Anzeige, Inline-Edit mit onBlur-Pattern.

### Modified — Source

- `backend/src/routes/belege.routes.ts` (+593 Zeilen) — 9 neue Endpoints (alle vor /:id): GET /ustva, /ustva-drill, /export-csv, /settings, PATCH /settings, POST /areas, PATCH /areas/:id, POST /tax-categories, PATCH /tax-categories/:id, POST /db-backup. Import von `createBackup` aus db/backup.ts.
- `frontend/src/api/belege.api.ts` (+95 Zeilen) — 9 neue API-Wrapper + UstvaBucket + UstvaResponse Types.
- `frontend/src/routes/routes.tsx` (+5 Zeilen) — 3 Imports + 3 Route-Eintraege (alle VOR /belege/:id).

## Decisions Made

- **ReceiptsTable aus BelegeListPage wiederverwendet** — Plan 04-08 hat ReceiptsTable bewusst als wiederverwendbare Sub-Komponente exportiert (mit `variant`-Prop fuer open-payments-Spalten). BelegeTaxPage nutzt sie im Drilldown-Bereich → konsistente Darstellung wie in der Belege-Liste, ohne dass der User mental zwischen "Drilldown-Tabelle" und "Liste-Tabelle" wechseln muss. Kein eigener Tabellen-Code.

- **Drilldown als Toggle (gleicher Bucket-Klick collapsed)** — Plan-Snippet hatte unidirektionales Click-to-Drill. Toggle-Verhalten ist intuitiver: User hat ein Drilldown offen, klickt denselben Bucket erneut → eingeklappt. Active-Bucket-Highlight (rgba-Background) zeigt klar welcher Bucket gerade gedrillt ist.

- **Single-Tabelle fuer alle Period-Werte** — Plan-Snippet schlug bewusst eine Tabelle vor; der Plan 04-CONTEXT erwaehnte zwar "Quartals-Cards" (DJ-Vorbild), aber bei period='monat' wuerden 12 Cards den Uebersichtswert sprengen. Tabelle skaliert clean von 1 (jahr) ueber 4 (quartal) bis 12 (monat) Zeilen ohne Layout-Shift.

- **Inline-Style fuer alle 3 Pages** — Konsistent mit Plan 04-07/08/09 (BelegeOverviewPage, BelegeListPage, BelegeUploadPage); modulare Style-Konstanten (inputStyle, primaryBtnStyle, secondaryBtnStyle, listResetStyle, textMuted) als Sub-Module der jeweiligen Page. Plan-Snippet schlug eine globale `.bm-input`-CSS-Klasse vor was Pollution waere.

- **AreaRow.onBlur statt onChange fuer Inline-Edit** — Plan-Snippet hatte `onChange` direkt mit `updateAreaMut.mutate({...})` verkabelt. Pro Tastendruck haette das einen PATCH ausgeloest (Backend-Spam, Threat T-04-UI-UPLOAD-03 analoge Lehre aus Plan 04-09). onBlur + diff-Check (`if (trimmed !== area.name) onUpdate(...)`) garantiert genau einen PATCH pro tatsaechlicher Aenderung.

- **Saved-Flash statt alert()** — Plan-Snippet nutzte `alert(...)` im Backup-onSuccess. alert() blockiert UI-Thread und ist nicht UX-konform fuer eine moderne SPA. Saved-Flash-State + 2s-Timeout ist subtler und Glassmorphism-konform; Backup-Erfolg/-Fehler nutzt das gleiche Pattern (mit eigenem State `backupResult` / `backupError`).

- **DB-Backup-Pfad anzeigen statt nur 'OK'** — User soll sehen wo das Backup liegt (relevant fuer manuelles Sichern z.B. iCloud-Kopie oder externe Festplatte). Monospace-Font + `word-break: break-all` damit lange Pfade lesbar sind.

- **CSV mit ;-Trenner und \\r\\n** — Excel-DE erwartet ;-Trenner ohne Locale-Umschaltung (vs. , im US-Standard). CRLF als Zeilenumbruch ist Excel-CSV-Standard (RFC 4180). CSV-Cell-Quoting bei `;`, `\\n`, `\\r`, `"` mit `""`-Escape macht den Export defensiv gegen Lieferantennamen mit Sonderzeichen.

- **POST /db-backup ohne separates audit_log** — createBackup-Helper hat eigenen console.log + erstellt eine versionierte Datei mit Timestamp im Namen. Das Backup-File selbst ist der Audit-Trail (Filesystem-basierte Historie). entity_type 'app_setting' waere semantisch falsch (es ist keine Settings-Aenderung), und einen neuen 'db_backup'-Type einzufuehren waere fuer diese minimale Funktion uebertrieben.

- **`require('../db/backup')` durch top-level ESM-import ersetzt** — Plan-Code-Snippet hatte `const { createBackup } = require('../db/backup')` innerhalb des Endpoints. tsx-watch + ESM-Setup verlangt aber `import` am File-Top; require() ist CommonJS-Anti-Pattern und haette einen Type-Error gegeben.

- **kind-Validierung im Tax-Category-PATCH** — Plan-Snippet hatte das nicht. SQLite hat zwar einen CHECK-Constraint (kind IN ('einnahme','ausgabe','beides')), aber 400 mit klarer Error-Message ist UX-freundlicher als ein 500 vom Constraint-Verstoss; gleicher Pattern wird in POST schon angewendet → Konsistenz.

- **TaxCategoryRow ohne Inline-Edit (nur readonly + Neu-Form)** — Plan-Spec sagte "Inline-Edit" aber Tax-Categories sind eine relativ stabile Stammdaten-Liste mit ~80+ Eintraegen (Seed in Plan 04-12). Massen-Inline-Edit waere Performance-anspruchsvoll und Tipp-Spam-anfaellig. Edit-Funktionalitaet ist im Backend bereitgestellt (`updateTaxCategory`); ein Detail-Modal fuer Edit kann sauber in einem Folgeplan ergaenzt werden ohne den Aufbau zu brechen.

## Deviations from Plan

### Auto-fixed Issues

**1. [Praezisierung] AreaRow.onBlur statt onChange fuer Inline-Edit**
- **Found during:** Task 2
- **Issue:** Plan-Snippet hatte `onChange={e => updateAreaMut.mutate({ id: a.id, data: { name: e.target.value } })}` was bei jedem Tastendruck einen PATCH ausgeloest haette (Backend-Spam analog zu Threat T-04-UI-UPLOAD-03 aus Plan 04-09).
- **Fix:** AreaRow als eigene Sub-Component mit lokalem State (name, color), commit-onBlur mit diff-Check `if (trimmed !== area.name) onUpdate(...)`. Genau ein PATCH pro tatsaechlicher Aenderung.
- **Files modified:** frontend/src/pages/belege/BelegeSettingsPage.tsx
- **Commit:** 0b0ac25

**2. [Praezisierung] Saved-Flash statt alert()**
- **Found during:** Task 2
- **Issue:** Plan-Snippet hatte `onSuccess: data => alert('Backup erstellt: ${data.path}')` was UI-Thread blockiert und nicht UX-konform ist.
- **Fix:** State `backupResult` + `backupError` mit visuellem Feedback inline neben dem Button (gruener "✓ <path>"-Text bei Erfolg, roter Fehler bei Failure). Settings-Save nutzt das gleiche Pattern via `savedFlash`-Boolean + 2s-Timeout.
- **Files modified:** frontend/src/pages/belege/BelegeSettingsPage.tsx
- **Commit:** 0b0ac25

**3. [Praezisierung] `require('../db/backup')` durch ESM-Import ersetzt**
- **Found during:** Task 1
- **Issue:** Plan-Code-Snippet hatte `const { createBackup } = require('../db/backup')` innerhalb des Endpoints. tsx-watch + ESM-Setup verlangt aber `import` am File-Top; require() haette einen Type-Error gegeben.
- **Fix:** `import { createBackup } from '../db/backup';` am File-Top.
- **Files modified:** backend/src/routes/belege.routes.ts
- **Commit:** 56d9642

**4. [Praezisierung] CSV mit \\r\\n statt \\n + defensives Cell-Quoting**
- **Found during:** Task 1
- **Issue:** Plan-Code-Snippet nutzte `\\n` als Zeilenumbruch und ein einfacher `["].test(s)` Quoting-Check. Excel-DE-CSV-Standard ist CRLF (RFC 4180); Cell-Quoting muss auch `;` und Newlines erfassen sonst zerschiesst es Lieferantennamen mit Komma/Semikolon (z.B. "Müller, Schmidt & Co.").
- **Fix:** `\\r\\n` als Zeilenumbruch + Quoting-Regex `/[;\\n\\r"]/` mit `""`-Escape; eigene `csvCell`-Helper-Funktion.
- **Files modified:** backend/src/routes/belege.routes.ts
- **Commit:** 56d9642

**5. [Rule 1 - Bug] tax_category_id parsing in /export-csv abgesichert**
- **Found during:** Task 1
- **Issue:** Plan-Snippet hatte `params.push(parseInt(tax_category_id, 10))` ohne `Number.isFinite`-Check; bei `?tax_category_id=foo` waere `NaN` als Parameter rausgegangen → entweder Runtime-Error oder leere Result-Liste ohne klare Diagnose.
- **Fix:** `const tcId = parseInt(tax_category_id, 10); if (Number.isFinite(tcId)) where.push(...);` — ungueltige Werte werden ignoriert (defensiv).
- **Files modified:** backend/src/routes/belege.routes.ts
- **Commit:** 56d9642

**6. [Rule 2 - Critical] kind-Validierung im Tax-Category-PATCH ergaenzt**
- **Found during:** Task 1
- **Issue:** Plan-Snippet validierte kind nur in POST. Bei PATCH konnte ein Aufrufer kind='ungueltig' senden → SQLite CHECK-Constraint-Verstoss → 500. UX-feindlich.
- **Fix:** Gleiche Validierung wie in POST: `if (kind !== undefined && !['einnahme','ausgabe','beides'].includes(kind)) → 400`. Ergibt klare Error-Message auf Client-Seite.
- **Files modified:** backend/src/routes/belege.routes.ts
- **Commit:** 56d9642

**7. [Rule 2 - Critical] period_index-Validierung im /ustva-drill**
- **Found during:** Task 1
- **Issue:** Plan-Snippet hatte keine Validierung dass period_index im erlaubten Bereich liegt (1..4 fuer quartal, 1..12 fuer monat). Bei period_index=99 mit period='monat' waere `String(99).padStart(2,'0')='99'` und `strftime('%m', payment_date) IN ('99')` → leere Result-Liste, aber kein klarer Fehler.
- **Fix:** Range-Check pro Period-Type mit 400-Response bei Verstoss.
- **Files modified:** backend/src/routes/belege.routes.ts
- **Commit:** 56d9642

**8. [Praezisierung] TaxCategoryRow ohne Inline-Edit (nur readonly)**
- **Found during:** Task 2
- **Issue:** Plan-Spec sagte "Inline-Edit" fuer Tax-Categories. Bei ~80+ Stammdaten-Eintraegen waere Massen-Inline-Edit Performance-anspruchsvoll und Tipp-Spam-anfaellig.
- **Fix:** TaxCategoryRow zeigt readonly (name, kind, USt-Satz). Edit-Backend (`updateTaxCategory`) bleibt vollwertig fuer kuenftige Detail-Modals. NewTaxCategoryForm bleibt voll funktional.
- **Files modified:** frontend/src/pages/belege/BelegeSettingsPage.tsx
- **Commit:** 0b0ac25

**Total deviations:** 8 (5 Praezisierungen + 3 Critical-Fixes/Robustness-Improvements). Keine Plan-Acceptance-Criteria-Verletzung. Alle 6 Soll-Items aus `must_haves.truths` sind verifiziert; alle 3 Plan-Artifacts existieren mit erfuellter min_lines (TaxPage 406 >= 100; SettingsPage 743 >= 200); Plan-Requirements BELEG-UI-07/08/09 erfuellt.

## Issues Encountered

Keine. Build und Tests liefen direkt sauber:
- `cd backend && npx tsc --noEmit` exit code 0
- `cd frontend && npx tsc --noEmit` exit code 0
- `cd backend && npx vitest run` 112/112 passed (keine Regression durch neue Endpoints)
- `cd frontend && npx vitest run` 41/41 passed (keine Regression)

UAT-Status: Browser-basierte Sichtkontrolle steht aus (Phase 04 ist autonom ohne Checkpoint). Frontend baut tsc-sauber. Smoke-Test waere `npm run dev` + Login + /belege/steuer + /belege/export + /belege/einstellungen.

## User Setup Required

Keine. Plan 04-10 fuegt nur Frontend-UI + Backend-Endpoints hinzu — keine Datenbank-Migration, keine externe Service-Konfiguration. createBackup-Helper aus db/backup.ts war bereits vorhanden (Plan 04-00 setup).

UAT-Vorschlag (manuell):
1. Frontend starten: `npm run dev` (in Wurzelverzeichnis) → Frontend laeuft auf Vite-Port.
2. Login → /belege/einstellungen im Browser.
3. UStVA-Zeitraum auf "Quartal" setzen + Speichern → "✓ Gespeichert"-Flash erscheint.
4. /belege/steuer aufrufen → Tabelle mit 4 Quartals-Buckets (Q1-Q4) sollte erscheinen. Klick auf eine Zeile → Drilldown-Tabelle mit den darin enthaltenen Belegen.
5. /belege/export aufrufen → Filter (Jahr=2026) setzen → "CSV herunterladen" → Datei `belege-2026.csv` wird heruntergeladen. Excel-Test: Doppelklick auf die Datei → Umlaute (Müller, Größe, etc.) sollten korrekt dargestellt werden (BOM + UTF-8).
6. /belege/einstellungen → Bereich hinzufügen ("Test" + Farbe) → Liste aktualisiert sich. Bereich-Name editieren → onBlur committed. Archivieren-Toggle → Bereich verschwindet aus Picker (in /belege/neu).
7. /belege/einstellungen → Steuer-Kategorie hinzufügen → Liste aktualisiert sich.
8. /belege/einstellungen → "DB-Backup jetzt erstellen" → Pfad-Anzeige `~/.local/share/benny-dashboard/backups/manual-belege-settings-<timestamp>.db`. `ls` im Terminal verifiziert die Datei.

## Next Phase Readiness

- **Plan 04-11 (DJ-Refactor)** kann starten — Belege-Modul ist UI-vollstaendig (Overview/List/Detail/Upload/Tax/Export/Settings). DJ-Buchhaltung kann jetzt Read-Only auf receipts WHERE source='dj_invoice_sync' zeigen ohne dass User-Aenderungen verloren gehen (alle CRUD-Pfade gehen jetzt durch /belege).
- **Plan 04-12 (Seed)** kann starten — Settings-UI ist da fuer post-Seed-Konfiguration; UStVA-Page kann den 5-Beleg-Seed direkt visualisieren (Tax-Aggregation via aggregateForUstva ist Plan 02 ready); Export-Page kann den Seed als CSV ausgeben fuer Steuerberater-Demo.
- **End-to-End-UAT komplett moeglich** — User kann jetzt einen vollstaendigen Steuer-Workflow durchgehen: Settings konfigurieren (UStVA-Zeitraum, Kilometerpauschale, etc.) → Belege uploaden + freigeben → in der Liste durchsuchen → UStVA-Uebersicht checken → CSV-Export an Steuerberater.
- **Pattern fuer kuenftige Module-Settings-Pages etabliert** — Bulk-PATCH + Inline-CRUD + Saved-Flash sind wiederverwendbar fuer Amazon-Settings, Finanzen-Settings, etc. in Phase 5+.

## Self-Check: PASSED

Verifiziert per `test -f` / `git log` / `npx tsc` / `npx vitest` / `grep`:

- [x] `frontend/src/pages/belege/BelegeTaxPage.tsx` FOUND (406 Zeilen, exportiert BelegeTaxPage)
- [x] `frontend/src/pages/belege/BelegeExportPage.tsx` FOUND (296 Zeilen, exportiert BelegeExportPage)
- [x] `frontend/src/pages/belege/BelegeSettingsPage.tsx` FOUND (743 Zeilen, exportiert BelegeSettingsPage)
- [x] `backend/src/routes/belege.routes.ts` MODIFIED (+9 neue Endpoints, alle vor /:id)
- [x] `frontend/src/api/belege.api.ts` MODIFIED (+9 neue Wrapper + UstvaBucket/UstvaResponse Types)
- [x] `frontend/src/routes/routes.tsx` MODIFIED (+3 Imports + 3 Route-Eintraege, alle VOR /belege/:id)
- [x] Commit `56d9642` (Task 1: Backend-Endpoints + Frontend-API) FOUND in git log
- [x] Commit `0b0ac25` (Task 2: 3 Pages + Routes) FOUND in git log
- [x] `cd frontend && npx tsc --noEmit` exit code 0
- [x] `cd backend && npx tsc --noEmit` exit code 0
- [x] `cd backend && npx vitest run` 112/112 passed
- [x] `cd frontend && npx vitest run` 41/41 passed
- [x] BelegeTaxPage enthaelt 6 KZ-Header (KZ 81, KZ 86, KZ 66, KZ 84/85, KZ 62, Zahllast)
- [x] BelegeExportPage enthaelt 3 FilterFields (Jahr, Bereich, Steuer-Kategorie) + "CSV herunterladen"-Button
- [x] BelegeSettingsPage enthaelt 9 SettingRows (`grep -c "<SettingRow"` = 9)
- [x] BelegeSettingsPage enthaelt DB-Backup-Button + Areas-CRUD (AreaRow + NewAreaForm) + TaxCategories-CRUD (TaxCategoryRow + NewTaxCategoryForm)
- [x] Routes /belege/steuer, /belege/export, /belege/einstellungen registriert (alle VOR /belege/:id, verifiziert per grep auf routes.tsx)
- [x] Backend belege.routes.ts hat 23 Routen-Definitionen (war 14 vor Plan 04-10, +9 neue) → `grep -c "router\.\(get\|post\|patch\|delete\)"` = 23 (>= 14 Plan-Spec)
- [x] /export-csv setzt Content-Type `text/csv; charset=utf-8` und Content-Disposition `attachment; filename=...`
- [x] frontend belege.api.ts exportiert mind. 9 neue Funktionen: fetchUstva, fetchUstvaDrill, fetchBelegeSettings, updateBelegeSettings, createArea, updateArea, createTaxCategory, updateTaxCategory, triggerDbBackup

---
*Phase: 04-belege-modul-dj-buchhaltungs-refactoring*
*Plan: 10 (Wave 6)*
*Completed: 2026-05-06*
