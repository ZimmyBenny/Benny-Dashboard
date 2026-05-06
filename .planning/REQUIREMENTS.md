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

## Phase 4 Requirements

Scope: GoBD-konformes Belege-Modul (`/belege`) als zentraler Hauptbereich. Generisches `audit_log` ersetzt `dj_audit_log`. DJ-Buchhaltung wird Read-Only-Sicht auf `receipts WHERE area=DJ`. DJ-Ausgangsrechnungen via Sync-Service. Fahrten ziehen in eigene `trips`-Tabelle.

### Audit-Log (generisch)

- [x] **BELEG-AUDIT-01**: Generische `audit_log`-Tabelle existiert mit Feldern (id, entity_type, entity_id, action, field_name, old_value, new_value, actor, user_id, ip_address, user_agent, created_at)
- [x] **BELEG-AUDIT-02**: Append-only Triggers (BEFORE UPDATE/DELETE → RAISE ABORT) blocken jede Änderung
- [x] **BELEG-AUDIT-03**: `dj.audit.service.ts` umbenannt zu `audit.service.ts`; `logAudit`-Signatur identisch (entityType erweitert)
- [x] **BELEG-AUDIT-04**: Bestehende `dj_audit_log`-Daten wurden per `INSERT INTO audit_log SELECT ...` migriert; `dj_audit_log` bleibt erhalten (kein DROP in dieser Phase)
- [x] **BELEG-AUDIT-05**: Alle 6 DJ-Routes (invoices, quotes, events, expenses, services, settings) nutzen den neuen Import `import { logAudit } from '../services/audit.service'`

### Test-Infrastruktur (Wave 0)

- [x] **BELEG-TEST-01**: `vitest` + `@vitest/ui` in `backend/package.json` devDependencies; `npm test`-Script vorhanden
- [x] **BELEG-TEST-02**: `backend/vitest.config.ts` konfiguriert mit `pool: 'forks'` (better-sqlite3 nicht Worker-safe)
- [x] **BELEG-TEST-03**: `backend/test/setup.ts` erzeugt In-Memory-DB (`:memory:`) und führt Migrationen aus
- [x] **BELEG-TEST-04**: Mindestens ein grüner Audit-Smoke-Test (`backend/test/audit.test.ts`) — `npx vitest run` exited mit Code 0

### Schema (Migration 039)

- [x] **BELEG-SCHEMA-01**: Migration `039_belege.sql` erstellt Tabellen: `areas`, `tax_categories`, `trips`, `receipts`, `receipt_files`, `receipt_area_links`, `receipt_links`, `receipt_ocr_results`, `supplier_memory`
- [x] **BELEG-SCHEMA-02**: `receipts`-Tabelle hat alle 30+ Felder gemäß CONTEXT.md (inkl. `private_share_percent`, `corrects_receipt_id`, `corrected_by_receipt_id`, `freigegeben_at`, `file_hash_sha256`, `linked_invoice_id`, `linked_trip_id`, `source`, `steuerrelevant`, `import_eust`, `reverse_charge`, `input_tax_deductible`)
- [x] **BELEG-SCHEMA-03**: ALLE Geld-Felder INTEGER (Cents) — kein REAL/FLOAT in neuen Tabellen
- [x] **BELEG-SCHEMA-04**: GoBD-Lock-Trigger `trg_receipts_no_update_after_freigabe` (BEFORE UPDATE WHEN OLD.freigegeben_at IS NOT NULL für Felder: supplier_name, amount_gross_cents, amount_net_cents, vat_rate, vat_amount_cents, receipt_date, supplier_invoice_number, reverse_charge, file_hash_sha256)
- [x] **BELEG-SCHEMA-05**: GoBD-Lock-Trigger auch für `receipt_files` (NO UPDATE/DELETE/INSERT, wenn parent receipt freigegeben)
- [x] **BELEG-SCHEMA-06**: 3 Areas seeded: "Amazon FBA", "DJ", "Privat"
- [x] **BELEG-SCHEMA-07**: Tax-Categories seeded (17 Kategorien aus CONTEXT.md specifics)
- [x] **BELEG-SCHEMA-08**: 9 neue Settings-Keys in `app_settings`: `ustva_zeitraum`, `ist_versteuerung`, `payment_task_lead_days`, `max_upload_size_mb`, `ocr_confidence_threshold`, `ocr_engine`, `mileage_rate_default_per_km`, `mileage_rate_above_20km_per_km`, `belege_storage_path`
- [x] **BELEG-SCHEMA-09**: `createBackup('phase-04-plan-01-migration-039')` wird vor dem Migration-Run aufgerufen (im Plan-Task explicit)

### Services

- [x] **BELEG-SERVICE-01**: `lib/cents.ts` mit `toCents`, `toEur`, `calcVatCents`, `calcGrossCents`, `calcNetCents` (alle `Math.round`)
- [x] **BELEG-SERVICE-02**: `receiptService.create(...)`, `receiptService.update(...)`, `receiptService.applyOcrResult(...)`, `receiptService.markOcrFailed(...)`, `receiptService.freigeben(...)`
- [x] **BELEG-SERVICE-03**: `taxCalcService.aggregateForUstva(year, period)` — RC ist Nullsumme bei Vorsteuerberechtigung; private_share_percent zieht ab; Ist-Versteuerung über `payment_date`
- [x] **BELEG-SERVICE-04**: `duplicateCheckService.findBySha256(sha)` und `findByHeuristic(supplier, invoiceNumber, date)`

### Upload + OCR

- [x] **BELEG-OCR-01**: `POST /api/belege/upload` (multer.array, max 20 files, fileFilter PDF/JPG/JPEG/PNG, fileSize aus `max_upload_size_mb` Setting)
- [x] **BELEG-OCR-02**: SHA-256-Streaming via `crypto.createHash` über `fs.createReadStream` (kein readFileSync)
- [x] **BELEG-OCR-03**: Datei wird in `~/.local/share/benny-dashboard/belege/YYYY/MM/` gespeichert (NICHT iCloud); Filename `YYYY-MM-DD_supplier_amount_type.ext` sanitisiert via `sanitizeForFilename`
- [x] **BELEG-OCR-04**: `ocrService.ocrFile(path)` nutzt tesseract.js (deu+eng) im Hintergrund via `setImmediate`; PDF wird via `pdf-to-img` (scale=2.0) zu PNG der ersten Seite
- [x] **BELEG-OCR-05**: tesseract.js Worker wird `await worker.terminate()` nach JEDEM Job (kein Pool — Memory-Leak-Schutz)
- [x] **BELEG-OCR-06**: Fallback `mockOcr` wenn tesseract.js Worker-Init fehlschlägt; Setting `ocr_engine='mock'` aktiviert Mock direkt
- [x] **BELEG-OCR-07**: `receiptParserService.parse(text)` extrahiert Datum, Lieferant, Beträge, USt, IBAN, RC mit per-Feld-Konfidenz (0-1)
- [x] **BELEG-OCR-08**: Felder mit Confidence < `ocr_confidence_threshold` Setting bekommen UI-Badge "manuell prüfen"

### Lieferanten-Lerngedächtnis

- [x] **BELEG-SUPPLIER-01**: `supplier_memory`-Tabelle mit (supplier_normalized, area_id, tax_category_id, usage_count, last_used)
- [x] **BELEG-SUPPLIER-02**: `supplierMemoryService.suggest(supplierName)` liefert (area_id, tax_category_id) basierend auf höchstem usage_count
- [x] **BELEG-SUPPLIER-03**: `supplierMemoryService.recordUsage(supplierName, areaId, taxCategoryId)` inkrementiert usage_count und updatet last_used
- [x] **BELEG-SUPPLIER-04**: Beim 2. Upload mit gleichem Lieferant wird Auto-Vorschlag im Upload-UI gezeigt

### Task-Automation

- [x] **BELEG-TASK-01**: `taskAutomationService.checkOpenPayments()` läuft täglich (Cron oder beim Server-Start), erstellt Task in `tasks` für jeden Beleg mit `due_date - lead_days <= today` und `status='offen'` (idempotent — kein Duplikat wenn Task schon existiert)
- [x] **BELEG-TASK-02**: Task-Verlinkung: `tasks.source_receipt_id` referenziert `receipts.id` (FK) — falls noch nicht in tasks-Tabelle: in Migration 039 ergänzen
- [x] **BELEG-TASK-03**: Lead-Days konfigurierbar via Setting `payment_task_lead_days` (Default 3)

### DJ-Sync + Trips-Migration

- [x] **BELEG-DJSYNC-01**: `djSyncService.mirrorInvoiceToReceipts(invoiceId)` ist idempotent (UPSERT via `WHERE source='dj_invoice_sync' AND linked_invoice_id=?`)
- [x] **BELEG-DJSYNC-02**: `dj.invoices.routes.ts` ruft `mirrorInvoiceToReceipts` am Ende von POST/PATCH/finalize/pay/cancel auf
- [x] **BELEG-DJSYNC-03**: Stornorechnungen bekommen eigenen Mirror mit `corrects_receipt_id` auf Original-Mirror und negative `amount_gross_cents`
- [x] **BELEG-DJSYNC-04**: REAL-Beträge aus dj_invoices werden via `Math.round(value * 100)` zu Cents konvertiert
- [x] **BELEG-DJSYNC-05**: `tripSyncService.mirrorTripToReceipts(tripId)` spiegelt Trip in receipts mit `type='fahrt'`, `vat_rate=0`, `tax_category=Fahrtkosten`, `input_tax_deductible=0`
- [x] **BELEG-DJSYNC-06**: Fahrten-Migration: `dj_expenses WHERE category='fahrzeug'` → `trips`-Tabelle; `createBackup('phase-04-plan-06-fahrten')` davor
- [x] **BELEG-DJSYNC-07**: `dj.events.routes.ts` Vorgespräch-Erledigt-Handler erstellt `trips`-Eintrag (statt `dj_expenses`-Insert)

### UI

- [x] **BELEG-UI-01**: Route `/belege` registriert in `routes.tsx`; Sub-Routes `/belege/alle`, `/belege/neu`, `/belege/:id`, `/belege/offen`, `/belege/zu-pruefen`, `/belege/steuer`, `/belege/export`, `/belege/einstellungen`
- [x] **BELEG-UI-02**: navConfig.ts hat Top-Level-Eintrag `/belege` mit Icon `receipt_long`, Position zwischen "Verträge & Fristen" und "KI Agenten", subItems: Übersicht, Alle, Neu, Offene Zahlungen, Zu prüfen, Steuer, Export, Einstellungen
- [x] **BELEG-UI-03**: BelegeOverviewPage zeigt 6 KPICards (Neue Belege 7d, Zu prüfen, Offene Zahlungen, Überfällig, Steuerzahllast aktueller Zeitraum, Steuerrelevant aktuelles Jahr) + 2 Listen (Letzte 10, Nächste 10 Fälligkeiten); KPI "Steuerzahllast" wird ausgeblendet wenn `ustva_zeitraum='keine'`
- [x] **BELEG-UI-04**: BelegeListPage zeigt sortier-/filterbare Tabelle mit Suche über Lieferant/Belegnummer/Betrag/Titel/OCR-Text
- [x] **BELEG-UI-05**: BelegeDetailPage zeigt PDF/Bild-Vorschau links (via `react-pdf`/Image) + Daten rechts in Sektionen + Audit-Log-Verlauf; Felder werden disabled wenn `freigegeben_at IS NOT NULL` (außer notes/tags); "Korrekturbeleg"-Button vorhanden
- [ ] **BELEG-UI-06**: BelegeUploadPage hat react-dropzone (PDF/JPG/PNG bis maxUploadSize), zeigt OCR-Vorschläge mit `OcrConfidenceBadge`, supplier-Vorschlag aus `supplierMemoryService.suggest`
- [ ] **BELEG-UI-07**: BelegeTaxPage Layout abhängig von Setting `ustva_zeitraum` (Jahr/4 Quartale/12 Monate); pro Bucket: KZ 81/86, KZ 66, KZ 84/85/67, KZ 62, Zahllast, Drilldown-Liste
- [ ] **BELEG-UI-08**: BelegeExportPage erlaubt CSV-Export mit Filtern (Jahr, Bereich, Kategorie); kein ZIP in dieser Phase
- [ ] **BELEG-UI-09**: BelegeSettingsPage erlaubt Areas-CRUD + TaxCategories-CRUD + alle 9 Settings (ustva_zeitraum/ist_versteuerung/lead_days/max_upload/ocr_threshold/ocr_engine/mileage rates/storage_path) + "DB-Backup jetzt"-Button (ruft `createBackup`)
- [x] **BELEG-UI-10**: StatusBadge erweitert um `zu_pruefen` (gelb), `freigegeben` (grün), `archiviert` (grau), `nicht_relevant` (grau gedimmt), `ocr_pending` (primary)
- [x] **BELEG-UI-11**: `formatCurrencyFromCents(cents)` Helper in `frontend/src/lib/format.ts`

### DJ-Refactor

- [ ] **BELEG-DJREF-01**: DjAccountingPage zeigt Daten aus `receipts WHERE area=DJ` (NICHT mehr aus dj_invoices/dj_expenses für Tab Übersicht)
- [ ] **BELEG-DJREF-02**: DjAccountingPage Tab "Ausgaben" entfernt (oder zeigt Hinweis "Ausgaben werden im Belege-Modul erfasst" mit Link zu `/belege/neu?area=DJ`)
- [ ] **BELEG-DJREF-03**: `dj.expenses.routes.ts` entfernt; `app.use('/api/dj/expenses', ...)` aus `dj.routes.ts` entfernt
- [ ] **BELEG-DJREF-04**: `dj_expenses`-Tabelle in Migration 039 mit `DROP TABLE IF EXISTS dj_expenses` entfernt (nach Trips-Migration; `createBackup` davor)
- [ ] **BELEG-DJREF-05**: `dj.accounting.routes.ts` Aggregations-Queries umgeschrieben auf `receipts` (revenue, expenses, vat, profit)

### Seed + Final-Verifikation

- [ ] **BELEG-SEED-01**: 5 Beispiel-Belege (Alibaba, Thomann, E.ON, Google Ireland, Hochzeit Müller) seeded mit korrekten area/tax_category/Status
- [ ] **BELEG-SEED-02**: Passende contacts (Alibaba Supplier, Thomann, E.ON, Google Ireland Limited, Familie Müller) seeded
- [ ] **BELEG-SEED-03**: Beispiel-DJ-Gig in `dj_events` + Beispiel-Trip "Fahrt zur Hochzeit Müller, 87 km" in `trips`
- [ ] **BELEG-SEED-04**: `tsc --noEmit` clean (Backend + Frontend); `vitest run` grün

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
| BELEG-AUDIT-01 bis BELEG-AUDIT-05 | Phase 4 | Pending |
| BELEG-TEST-01 bis BELEG-TEST-04 | Phase 4 | Pending |
| BELEG-SCHEMA-01 bis BELEG-SCHEMA-09 | Phase 4 | Pending |
| BELEG-SERVICE-01 bis BELEG-SERVICE-04 | Phase 4 | Complete (2026-05-06) |
| BELEG-OCR-01 bis BELEG-OCR-08 | Phase 4 | Complete (2026-05-06) |
| BELEG-SUPPLIER-01 bis BELEG-SUPPLIER-04 | Phase 4 | Pending |
| BELEG-TASK-01 bis BELEG-TASK-03 | Phase 4 | Complete (2026-05-06) |
| BELEG-DJSYNC-01 bis BELEG-DJSYNC-07 | Phase 4 | Pending |
| BELEG-UI-01 bis BELEG-UI-11 | Phase 4 | Pending |
| BELEG-DJREF-01 bis BELEG-DJREF-05 | Phase 4 | Pending |
| BELEG-SEED-01 bis BELEG-SEED-04 | Phase 4 | Pending |

**Coverage:**
- Milestone 1 requirements: 56 total
- Phase 4 requirements: 56 total
- Mapped to phases: 112
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-07*
*Phase 4 requirements added: 2026-05-05*
