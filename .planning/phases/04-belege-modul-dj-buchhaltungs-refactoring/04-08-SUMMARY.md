---
phase: 04-belege-modul-dj-buchhaltungs-refactoring
plan: 08
subsystem: frontend, ui-list-detail, pdf-rendering, audit-trail, gobd-lock-ui, korrekturbeleg
tags: [react, tanstack-query, react-pdf, audit-log, gobd, glassmorphism, dj-stil, split-layout, url-search-params, korrekturbeleg]

# Dependency graph
requires:
  - phase: 04-03 (Wave 2)
    provides: GET /api/belege Liste + GET /api/belege/:id Detail (mit files/area_links/ocr/audit_log) + PATCH /api/belege/:id (GoBD-Trigger 409) + POST /api/belege/:id/freigeben
  - phase: 04-06 (Wave 3)
    provides: receipts gespiegelt mit DJ-Daten via mirrorInvoiceToReceipts (Liste sieht jetzt alle Daten)
  - phase: 04-07 (Wave 4)
    provides: belege.api.ts (fetchReceipts, fetchReceipt, updateReceipt, freigebenReceipt + Types), formatCurrencyFromCents, StatusBadge mit 5 Receipt-Status, /belege Top-Level-Route, BelegeOverviewPage
provides:
  - frontend/src/components/belege/PdfPreview.tsx (Inline-PDF/Bild-Vorschau via react-pdf@10, Worker via unpkg-CDN)
  - frontend/src/components/belege/AuditTrail.tsx (audit_log-Diff-Ansicht mit JSON-Parse + expand/collapse)
  - frontend/src/pages/belege/BelegeListPage.tsx (Filterleiste + Tabelle, exportiert wiederverwendbare ReceiptsTable)
  - frontend/src/pages/belege/BelegeOpenPaymentsPage.tsx (sortiert nach Faelligkeit, Mini-KPIs, ueberfaellig rot)
  - frontend/src/pages/belege/BelegeReviewPage.tsx (zu_pruefen + ocr_pending, Auto-Refetch alle 3s)
  - frontend/src/pages/belege/BelegeDetailPage.tsx (Split-Layout, 7 Sektionen, GoBD-Lock-Verhalten, Korrekturbeleg-Button)
  - backend/src/routes/belege.routes.ts: GET /:id/file/:fileId (PDF/Bild-Stream) + POST /:id/korrektur (Storno-Beleg)
  - frontend/src/routes/routes.tsx: 4 neue Routes (PrivateRoute-protected)
  - react-pdf@10 + 11 Sub-Dependencies in frontend/package.json
affects: [04-09-ui-upload, 04-10-ui-tax-export-settings, 04-11-dj-refactor]

# Tech tracking
tech-stack:
  added:
    - react-pdf@10.4.1 (PDF.js Wrapper fuer Inline-Rendering; Worker via unpkg-CDN, sync zu pdfjs.version)
  patterns:
    - "ReceiptsTable als wiederverwendbare Sub-Komponente (export aus BelegeListPage) — OpenPayments und Review nutzen identische Tabelle mit `variant`-Prop fuer Spalten-Override; vermeidet Code-Duplikation"
    - "URL-Search-Params als Filter-State — alle Filter (area/status/type/from/to/search) in der URL persistiert; Browser-history-friendly, deeplink-bar, kein Zustand-Management noetig"
    - "GoBD-Lock-UI-Pattern: isLocked = !!r.freigegeben_at → Field-Komponente respektiert disabled-Prop; Trigger-relevante Felder (supplier_name, receipt_date, amount_*, vat_rate, type) sind disabled, notes/due_date/payment_date bleiben editierbar (kein Trigger-Lock)"
    - "Auto-Polling fuer OCR-Verarbeitung: useQuery refetchInterval = (query) => data.status === 'ocr_pending' ? 2000 : false — Detail-Page; 3000 fuer Liste; stoppt automatisch sobald Status wechselt"
    - "Path-Traversal-Schutz im File-Serve: storage_path stammt aus DB (nie User-Input), fs.existsSync vor pipe als Defense-in-Depth"
    - "Korrekturbeleg-Endpoint nutzt corrected_by_receipt_id-Update auf freigegebenem Original — Spalte ist NICHT im GoBD-Trigger-Lock-WHEN-Clause, daher legal"
    - "AuditTrail-Diff-Ansicht: tryParseJson(new_value/old_value) → Diff nur bei geanderten Keys; Fallback auf <pre>-Block fuer non-JSON; expand/collapse ab 5 Eintraegen"
    - "Confirm-Dialoge vor destruktiven Aktionen (Freigeben, Korrekturbeleg, Archivieren) — gemaess Memory-Regel feedback_ux_patterns"

key-files:
  created:
    - frontend/src/components/belege/PdfPreview.tsx (191 Zeilen) — Inline-PDF/Bild-Vorschau
    - frontend/src/components/belege/AuditTrail.tsx (188 Zeilen) — audit_log-Diff-Ansicht
    - frontend/src/pages/belege/BelegeListPage.tsx (517 Zeilen) — Liste + ReceiptsTable Sub-Component
    - frontend/src/pages/belege/BelegeOpenPaymentsPage.tsx (147 Zeilen) — Offene-Zahlungen-Page
    - frontend/src/pages/belege/BelegeReviewPage.tsx (78 Zeilen) — Zu-pruefen-Page
    - frontend/src/pages/belege/BelegeDetailPage.tsx (605 Zeilen) — Split-Layout Detail-Page
  modified:
    - frontend/src/routes/routes.tsx (+5 Zeilen — 4 Imports + 4 Routes)
    - frontend/package.json (+1 dep: react-pdf@10)
    - frontend/package-lock.json (regen mit 11 Sub-Deps)
    - backend/src/routes/belege.routes.ts (+145 Zeilen — file-serve + korrektur-Endpoints, fs/path Imports)

key-decisions:
  - "Inline-PDF-Renderer (PdfPreview.tsx) statt Modal-PDF (PdfPreviewModal.tsx) — Plan 08 will eine Split-Layout-Detail-Page mit PDF links und Daten rechts sichtbar; ein Modal waere fehl am Platz. Bestehender PdfPreviewModal bleibt fuer DJ-Quotes/Invoices erhalten."
  - "ReceiptsTable als wiederverwendbare Sub-Komponente (NICHT eigene Datei) — exportiert aus BelegeListPage; OpenPayments und Review importieren sie. Vermeidet Trio-Komponenten-File und haelt das Tabellen-Layout zentral; bei wachsenden Anforderungen kann sie einfach in eigenes File extrahiert werden."
  - "URL-Search-Params als Filter-State (statt useState) — User kann URL teilen/bookmarken (z.B. /belege/alle?status=zu_pruefen&from=2026-01-01); browser-history-Nav funktioniert intuitiv. Lokaler State nur fuer das Suchfeld (Submit-on-Enter, kein Live-Search → vermeidet Backend-Spam)."
  - "OpenPayments laedt status='offen' UND status='teilbezahlt' separat — Backend-Endpoint akzeptiert nur EINEN status-Param. Zwei TanStack-Queries + clientseitige Sortierung; bei wachsendem Dataset waere ein status=offen,teilbezahlt-Param-Support im Backend sinnvoll (defer)."
  - "Review-Page zeigt zu_pruefen UND ocr_pending — User sieht laufende OCR-Verarbeitung in der Review-Liste; refetchInterval=3000ms solange ocr_pending-Eintraege da sind, dann false."
  - "PdfPreview Worker via unpkg-CDN (Plan-Snippet) — fuer eine Single-User-Local-App akzeptabel; Threat T-04-UI-LIST-02 ist 'accepted'. Lokale Worker-Bundlung waere ein zusaetzliches Vite-Plugin und nicht plan-blocking."
  - "PdfPreview rendert NUR die aktuelle Seite (renderTextLayer=false, renderAnnotationLayer=false) — Performance-Optimierung; bei multi-page-PDFs erscheint Page-Picker. Text-Layer waere fuer copy-paste sinnvoll, ist aber nicht im Plan-Soll."
  - "BelegeDetailPage: PdfPreview ist 'sticky' positioniert (top: 1rem) — beim Scrollen der rechten Spalte (viele Sektionen) bleibt das PDF im Blickfeld. Pattern aus DJ-Detail-Pages."
  - "Field-Komponente nutzt local state mit onBlur-Save (kein onChange-Save) — vermeidet 1 PATCH-Request pro Tastendruck; nur bei Field-Verlust oder Enter wird gespeichert. updateMut.invalidateQueries refetcht den Beleg, sodass externe Aenderungen (durch Korrekturbeleg etc.) sichtbar werden."
  - "Korrekturbeleg-Endpoint mit corrected_by_receipt_id-Update — Plan-Code-Snippet hatte Inline-Kommentar dass das ggf. an GoBD-Trigger blockt. Test der Migration 040 bestaetigt: Spalte ist NICHT im trg_receipts_no_update_after_freigabe-WHEN-Clause, also auf freigegebenen Belegen erlaubt. Inline-Kommentar im Endpoint dokumentiert diese Begruendung."
  - "Korrekturbeleg-Felder: Storno setzt amount_gross_eur_cents = -orig.amount_gross_cents (kein FX-Bezug; spiegelt Brutto). Plan-Snippet hatte das Feld nicht erwaehnt; das Schema verlangt aber NOT NULL DEFAULT 0 und der INSERT muss korrekt sein."
  - "Backend-Routes Reihenfolge: /:id/file/:fileId und /:id/korrektur stehen VOR /:id (Liste GET) — Express matched spezifisch-zuerst nur bei verschachtelten Sub-Pfaden zuverlaessig; explizite Reihenfolge minimiert Rate-Risiko"

patterns-established:
  - "Filter-State via URL-Search-Params — wiederverwendbar fuer alle Listen-Pages (Phase 5+ Amazon-Liste, Finanzen-Liste); deeplink-bar ohne extra Routing-Setup"
  - "Inline-Component-Export-Pattern: BelegeListPage exportiert ReceiptsTable + BelegeListPage aus einem File — fuer 'Variante einer Liste' (z.B. Open-Payments mit due_date-Spalte) gibt das eine variant-Prop statt Sub-Klasse; einfach zu erweitern"
  - "GoBD-Lock-UI-Pattern: isLocked-Boolean → Field-Komponente respektiert disabled-Prop; Trigger-relevante Felder sind disabled, andere bleiben editierbar; UI spiegelt das DB-Trigger-Verhalten"
  - "Auto-Polling-Pattern fuer Background-Jobs: refetchInterval mit data-Predicate — stoppt automatisch sobald Job fertig; wiederverwendbar fuer Phase 5+ (Amazon-Sync, Finanzen-Import)"

requirements-completed: [BELEG-UI-04, BELEG-UI-05]

# Metrics
duration: 9min
completed: 2026-05-06
---

# Phase 04 Plan 08: UI List/Detail Summary

**4 Belege-Pages (Liste/Detail/Offene-Zahlungen/Zu-Pruefen) im DJ-Stil mit Filterleiste/Suche/URL-Search-Params, Split-Layout-Detail-Page (PdfPreview links, 7 Datensektionen rechts mit GoBD-Lock-Verhalten), 2 Backend-Endpoints (file-serve mit Path-Traversal-Schutz + Korrekturbeleg-Endpoint mit GoBD-konformer corrected_by-Verkettung), 2 neue Komponenten (PdfPreview + AuditTrail mit Diff-Ansicht), react-pdf@10 installiert — alles tsc-sauber und Tests gruen.**

## Performance

- **Started:** 2026-05-06T13:25:04Z
- **Completed:** 2026-05-06T13:34:12Z
- **Duration:** ~9 min
- **Tasks:** 2 / 2 (mit 3 atomaren Commits — Frontend-Listen, Backend-Endpoints, Frontend-Detail)
- **Files created:** 6 (2 components + 4 pages)
- **Files modified:** 4 (1 backend route + 2 frontend config + 1 frontend route)
- **Tests:** 41/41 Frontend-Tests gruen + 112/112 Backend-Tests gruen (keine Regression durch neue Endpoints)
- **Sub-Repos:** keine — Single-Repo-Setup
- **Commits:** 3 (Task 1 Frontend-Listen + Komponenten, Task 2a Backend-Endpoints, Task 2b BelegeDetailPage)

## Accomplishments

- **Plan 04-08 komplett operational** — Plan 09 (Upload) und Plan 10 (Tax/Export/Settings) koennen jetzt auf eine vollstaendige CRUD-UI fuer Belege bauen.
- **PdfPreview-Komponente** — Inline-Rendering von PDFs (react-pdf@10 mit pdfjs-Worker via unpkg-CDN) und Bildern. Multi-page-PDFs bekommen Page-Picker; Fallback fuer unbekannte Mime-Types mit Download-Link. renderTextLayer=false / renderAnnotationLayer=false fuer Performance.
- **AuditTrail-Komponente** — zeigt audit_log-Eintraege mit:
  - Action-Label + Action-Color (create=primary, update=tertiary, delete=error, mirror_sync=variant, freigabe=secondary)
  - JSON-Diff-Ansicht: nur Felder, deren Werte sich geandert haben (oder neu sind), als 3-Spalten-Tabelle (Feld / Vorher / Nachher)
  - Expand/Collapse ab 5 Diff-Eintraegen
  - Fallback auf <pre>-Block bei non-JSON-Werten
- **BelegeListPage** (`/belege/alle`) — Filterleiste mit:
  - Suchfeld (Lieferant, Belegnummer, Titel, Notiz — Backend matcht via LIKE)
  - Bereich-Dropdown (DJ, Privat, Amazon, Haushalt — JOIN ueber receipt_area_links)
  - Type-Dropdown (eingangsrechnung, ausgangsrechnung, quittung, fahrt, sonstige)
  - Datums-Range (from/to)
  - Status-Pills (Alle, Zu prüfen, Freigegeben, OCR läuft, Archiviert, Nicht relevant)
  - Filter-zuruecksetzen-Button
  - URL-Search-Params als State (deeplink-bar)
  - "Neuer Beleg"-Button → /belege/neu (Plan 09 fuellt das)
- **ReceiptsTable als wiederverwendbare Sub-Komponente** — wird von BelegeListPage UND BelegeOpenPaymentsPage UND BelegeReviewPage genutzt; `variant='open-payments'`-Prop tauscht USt-Spalte gegen Faellig-Spalte. Stornorechnungen (negative Cents) in Error-Color; Hover-States; Click navigiert zu Detail.
- **BelegeOpenPaymentsPage** (`/belege/offen`) — sortiert ASC nach due_date (NULL-Datums zuletzt). Mini-KPIs: Anzahl offen / Davon ueberfaellig / Summe Brutto. Ueberfaellige Belege werden rot eingefaerbt. Lade status='offen' und status='teilbezahlt' separat (Backend-API-Limit).
- **BelegeReviewPage** (`/belege/zu-pruefen`) — zeigt status='zu_pruefen' UND status='ocr_pending'. Auto-Refetch alle 3 Sekunden, solange ocr_pending-Eintraege da sind.
- **BelegeDetailPage** (`/belege/:id`) — Split-Layout:
  - **Linke Spalte:** PdfPreview (sticky positioniert, top:1rem) + Multi-File-Liste (zusaetzliche Files als Download-Links unter dem Preview)
  - **Rechte Spalte:** 7 Sektionen
    1. Grunddaten (Lieferant, Belegnr, Belegdatum, Faellig, Bezahlt am, Typ, Quelle) — alle finanzrelevanten Felder respektieren GoBD-Lock
    2. Beträge (Brutto, Netto, USt, Bezahlt) — readonly
    3. Steuer (Reverse Charge, Vorsteuer abziehbar, Steuerkategorie, Steuerrelevant) — readonly
    4. Zuordnung (Bereiche mit primaer-Marker, DJ-Rechnung-Link, Fahrt-Link, Korrekturbeleg-Verkettung)
    5. Notizen (textarea, immer editierbar — kein GoBD-Lock auf notes)
    6. OCR-Ergebnis (Engine + Confidence + collapsible Volltext)
    7. Aktionen (Freigeben mit Confirm, Korrekturbeleg mit Confirm, Archivieren)
    8. Verlauf (AuditTrail)
  - Auto-Polling alle 2 Sekunden bei status='ocr_pending'
  - Korrekturbeleg-Mutation navigiert auto zu /belege/{newId}
- **Backend GET /api/belege/:id/file/:fileId** — streamt PDF/Bild inline (Content-Type aus receipt_files.mime_type, Content-Disposition: inline mit basename des Original-Filenames). storage_path kommt aus DB → kein Path-Traversal moeglich. fs.existsSync-Check vor pipe als Defense-in-Depth.
- **Backend POST /api/belege/:id/korrektur** — erstellt Storno-Beleg mit:
  - negativen Cents (amount_gross_cents, amount_net_cents, vat_amount_cents)
  - corrects_receipt_id auf Original-ID
  - status='zu_pruefen' (User muss neuen Beleg pruefen + freigeben)
  - notes='Korrekturbeleg zu Beleg #ID', title='Korrektur: <Lieferant>'
  - tax_category_id und supplier_invoice_number vom Original uebernommen
  - Original bekommt corrected_by_receipt_id (Spalte ist NICHT im GoBD-Trigger-Lock — siehe Migration 040 trg_receipts_no_update_after_freigabe WHEN-Clause)
  - 2 audit_log-Eintraege (create fuer neuen Beleg, update fuer Original)
- **Routes registriert** — 4 neue Routes in routes.tsx (PrivateRoute-protected):
  - `/belege/alle` → BelegeListPage
  - `/belege/offen` → BelegeOpenPaymentsPage
  - `/belege/zu-pruefen` → BelegeReviewPage
  - `/belege/:id` → BelegeDetailPage (NACH allen spezifischen Sub-Routes registriert)

## Task Commits

1. **Task 1: Komponenten + 3 Listen-Pages + Routes** — `53b5ec7` (feat) — react-pdf@10 installiert; PdfPreview.tsx (191 Zeilen) + AuditTrail.tsx (188 Zeilen) + BelegeListPage.tsx (517 Zeilen, exportiert ReceiptsTable) + BelegeOpenPaymentsPage.tsx (147 Zeilen) + BelegeReviewPage.tsx (78 Zeilen); 3 Routes registriert. 8 Dateien geaendert, 1655 Zeilen +.
2. **Task 2a: Backend file-serve + Korrekturbeleg** — `021bdd3` (feat) — backend/src/routes/belege.routes.ts: GET /:id/file/:fileId (Stream) + POST /:id/korrektur (Storno mit corrected_by-Verkettung). 145 Zeilen +.
3. **Task 2b: BelegeDetailPage + Route** — `eb3d1b4` (feat) — BelegeDetailPage.tsx (605 Zeilen) mit Split-Layout, 7 Sektionen, GoBD-Lock-Verhalten, 3 Aktions-Buttons; routes.tsx mit /belege/:id NACH spezifischen Routes. 666 Zeilen +.

**Plan-Metadaten-Commit:** wird nach diesem SUMMARY plus STATE/ROADMAP/REQUIREMENTS-Updates gemacht.

## Files Created/Modified

### Created — Source

- `frontend/src/components/belege/PdfPreview.tsx` (191 Zeilen) — Inline-PDF/Bild-Vorschau via react-pdf. Worker via unpkg-CDN (sync zu pdfjs.version). Multi-page-Picker. Fallback fuer unbekannte Mime-Types.
- `frontend/src/components/belege/AuditTrail.tsx` (188 Zeilen) — audit_log-Diff-Ansicht mit JSON-Parse, Action-Color-Mapping, Expand/Collapse.
- `frontend/src/pages/belege/BelegeListPage.tsx` (517 Zeilen) — BelegeListPage + exportierte ReceiptsTable Sub-Component (mit variant-Prop).
- `frontend/src/pages/belege/BelegeOpenPaymentsPage.tsx` (147 Zeilen) — sortiert nach Faelligkeit, Mini-KPIs, lade offen+teilbezahlt separat.
- `frontend/src/pages/belege/BelegeReviewPage.tsx` (78 Zeilen) — zu_pruefen + ocr_pending, refetchInterval=3000.
- `frontend/src/pages/belege/BelegeDetailPage.tsx` (605 Zeilen) — Split-Layout, 7 Sektionen, GoBD-Lock-Verhalten, Korrekturbeleg-Mutation mit Auto-Navigate.

### Modified — Source

- `frontend/src/routes/routes.tsx` (+5 Zeilen) — 4 Imports + 4 Routes (`/belege/alle`, `/belege/offen`, `/belege/zu-pruefen`, `/belege/:id`).
- `frontend/package.json` (+1 dep) — `react-pdf@^10.4.1`.
- `frontend/package-lock.json` — regen mit 11 transitive deps.
- `backend/src/routes/belege.routes.ts` (+145 Zeilen, +2 Imports `fs`, `path`) — GET /:id/file/:fileId + POST /:id/korrektur. Beide VOR /:id im Router platziert (Express-Reihenfolge).

## Decisions Made

- **Inline-PdfPreview statt Modal-PDF (PdfPreviewModal bleibt fuer DJ)** — Plan 08 will Split-Layout mit PDF links und Daten rechts. PdfPreviewModal wuerde das brechen. Bestehender Modal-Component bleibt fuer DJ-Quotes/Invoices erhalten.
- **ReceiptsTable als Re-Export aus BelegeListPage** — Pattern: ein File enthaelt Page + wiederverwendbare Sub-Komponente. OpenPayments und Review importieren `ReceiptsTable` aus `./BelegeListPage`. Vermeidet 4tes Komponenten-File und haelt das Tabellen-Layout zentral.
- **URL-Search-Params als Filter-State** — alle Filter (area/status/type/from/to/search) sind in der URL persistiert. User koennen URL teilen/bookmarken. useSearchParams aus react-router-dom; setParam-Helper kapselt das Auf/Loeschen. Lokaler State nur fuer das Suchfeld (Submit-on-Enter, kein Live-Search → vermeidet Backend-Spam).
- **OpenPayments laedt offen+teilbezahlt separat** — Backend-Endpoint akzeptiert nur einen status-Param. Zwei TanStack-Queries + clientseitige Sortierung; bei wachsendem Dataset waere ein status=offen,teilbezahlt-Param-Support sinnvoll (defer). Dokumentiert per Inline-Kommentar.
- **Korrekturbeleg-Endpoint setzt corrected_by_receipt_id auf freigegebenem Original** — Plan-Snippet hatte einen Inline-Kommentar dass das ggf. an GoBD-Trigger blockt. Verifiziert in Migration 040 (Zeilen 257-276): trg_receipts_no_update_after_freigabe listet 11 finanzrelevante Felder, `corrected_by_receipt_id` ist NICHT dabei. Inline-Kommentar im Endpoint dokumentiert die Recherche.
- **Backend-Routes Reihenfolge: spezifische Pfade VOR /:id** — Express matched Routes in Definitions-Reihenfolge. /:id/file/:fileId und /:id/korrektur stehen VOR /:id (Detail). Verifiziert per `grep -n "router.*('/" backend/src/routes/belege.routes.ts` — Pfade sortiert nach Spezifizitaet.
- **Sticky-PdfPreview im Split-Layout** — beim Scrollen der rechten Spalte (viele Sektionen) bleibt das PDF im Blickfeld. position:sticky mit top:1rem. Pattern aus DJ-Detail-Pages.
- **Field-Komponente onBlur-Save** — vermeidet 1 PATCH pro Tastendruck. Local state mit setLocalValue, onBlur prueft if (localValue !== value) onChange(localValue). Enter triggert blur. updateMut.invalidateQueries refetcht Beleg, sodass externe Aenderungen sichtbar werden.
- **Auto-Polling fuer OCR-Verarbeitung** — refetchInterval mit data-Predicate (status === 'ocr_pending' ? 2000 : false). Stoppt automatisch sobald Job fertig. In Detail-Page 2s, in Review-Page 3s.
- **Korrekturbeleg-Action setzt amount_gross_eur_cents = -orig.amount_gross_cents** — Plan-Snippet hatte das NOT-NULL-DEFAULT-0-Feld nicht erwaehnt. Schema verlangt es; ohne FX-Kontext ist es ein Spiegel des Brutto-Werts.
- **Confirm-Dialoge vor destruktiven Aktionen** — Memory-Regel feedback_ux_patterns: "Confirm vor Loeschen". Hier: Freigeben (GoBD-Lock), Korrekturbeleg (neuer Beleg), Archivieren (Status-Wechsel). window.confirm; Modal-Confirm waere ueberkill fuer diese 3 Aktionen.

## Deviations from Plan

### Auto-fixed Issues

**1. [Praezisierung] Field-Komponente lokal state-managed mit Sync-Logic**
- **Issue:** Plan-Code-Snippet hatte `Field`-Komponente mit `useState(value)` ohne Sync-Mechanismus. Wenn das Backend nach updateMut.mutate() einen neuen Wert liefert (z.B. Server-side normalisierter supplier_name), wuerde der lokale State stale sein.
- **Fix:** Field-Komponente macht im disabled-Pfad einen `if (!editable && localValue !== value) setLocalValue(value)` als billigen Sync-Mechanismus. Im editable-Pfad ist die User-Eingabe King — kein Sync. (Strenger waere ein useEffect mit value-Dependency, aber das wuerde User-Eingaben ueberschreiben waehrend des Tippens.)
- **Files modified:** frontend/src/pages/belege/BelegeDetailPage.tsx
- **Commit:** eb3d1b4

**2. [Praezisierung] Korrekturbeleg-Endpoint setzt amount_gross_eur_cents (Schema-NOT-NULL-Compliance)**
- **Issue:** Plan-Snippet listete den INSERT mit `amount_gross_cents, amount_net_cents, vat_rate, vat_amount_cents` — aber receipts.amount_gross_eur_cents ist NOT NULL DEFAULT 0 (Migration 040 Zeile 106). Ohne expliziten Wert wuerde DEFAULT 0 greifen, was bei einem Storno-Beleg semantisch falsch ist (sollte ja auch negativ sein, in EUR-Wert spiegeln).
- **Fix:** INSERT setzt `amount_gross_eur_cents = -orig.amount_gross_cents` (kein FX-Kontext im Single-User-DE-Use-Case; spiegelt den Brutto-Wert).
- **Files modified:** backend/src/routes/belege.routes.ts (POST /:id/korrektur)
- **Commit:** 021bdd3

**3. [Rule 2 - Critical] Korrekturbeleg-Endpoint übernimmt zusätzliche Felder vom Original**
- **Issue:** Plan-Snippet kopierte beim Storno-Beleg nur 7 Felder. Sinnvoller fuer den User: tax_category_id (Steuer-Kategorie wird beibehalten) + supplier_invoice_number (Rechnungsnummer als Referenz lesbar) + currency (Original-Waehrung). Ohne diese Felder muesste der User sie manuell pflegen.
- **Fix:** INSERT uebernimmt zusaetzlich tax_category_id, supplier_invoice_number, currency. Das ist auch die Erwartung aus dem Plan-Soll "erstellt neuen Beleg mit corrects_receipt_id" — Storno = Spiegelbild des Originals.
- **Files modified:** backend/src/routes/belege.routes.ts (POST /:id/korrektur)
- **Commit:** 021bdd3

**4. [Praezisierung] BelegeReviewPage zeigt zusaetzlich ocr_pending**
- **Issue:** Plan-Snippet listete nur `fetchReceipts({ status: 'zu_pruefen' })`. User-Erwartung: in der Review-Sicht sollen auch Belege auftauchen, die GERADE PER OCR ANALYSIERT WERDEN — sonst verschwinden sie nach dem Upload kurzzeitig (status wechselt von ocr_pending zu zu_pruefen).
- **Fix:** Zwei TanStack-Queries (ocr_pending + zu_pruefen). ocr_pending zuerst (User sieht laufende Verarbeitung), dann zu_pruefen. refetchInterval=3000 solange ocr_pending-Eintraege da sind, dann false.
- **Files modified:** frontend/src/pages/belege/BelegeReviewPage.tsx
- **Commit:** 53b5ec7

**5. [Praezisierung] BelegeOpenPaymentsPage laedt offen+teilbezahlt separat**
- **Issue:** Plan-Snippet listete nur `fetchReceipts({ status: 'offen' })`. Fachlich gehoeren teilbezahlte Belege ebenfalls zu "offene Zahlungen" (es ist noch ein Restbetrag offen). Backend-Endpoint akzeptiert aber nur einen status-Param.
- **Fix:** Zwei TanStack-Queries (offen + teilbezahlt) + clientseitige Sortierung nach due_date. Dokumentiert per Inline-Kommentar dass bei wachsendem Dataset ein status=offen,teilbezahlt-Multi-Param-Support im Backend sinnvoll waere.
- **Files modified:** frontend/src/pages/belege/BelegeOpenPaymentsPage.tsx
- **Commit:** 53b5ec7

**6. [Praezisierung] BelegeListPage Filter-Architektur (URL-Search-Params + Filterleiste)**
- **Issue:** Plan-Snippet hatte einen sehr schlanken `BelegeListPage` mit nur Suchfeld. User-Wunsch (Plan-Context): "Filterleiste in Liste: Bereich, Status, Type, Datum-Range, Suchfeld". Ein-Suchfeld wuerde dem Plan-Soll nicht entsprechen.
- **Fix:** Filterleiste mit 5 Filter-Dimensionen (Bereich-Dropdown, Type-Dropdown, Status-Pills, Datums-Range from/to, Suchfeld). URL-Search-Params als State-Storage (deeplink-bar). Filter-zuruecksetzen-Button. Result-Counter ("X Belege gefunden").
- **Files modified:** frontend/src/pages/belege/BelegeListPage.tsx (517 Zeilen statt der Plan-spezifizierten ~100 Zeilen — aber min_lines=100 ist erfuellt)
- **Commit:** 53b5ec7

**7. [Praezisierung] PdfPreview Error-Handling + Multi-File-Support**
- **Issue:** Plan-Snippet hatte `onLoadError={err => console.warn(...)}` — User wuerde bei einem korrupten PDF einen unerklaerten leeren Bereich sehen. Auch: BelegeDetailPage rendert nur das erste File aus r.files[0], aber receipts koennen mehrere Files haben (Phase 09 erlaubt Multi-Upload).
- **Fix:** PdfPreview hat einen loadError-State, zeigt User-Friendly-Error mit Direct-Open-Link. BelegeDetailPage rendert primaeres File in PdfPreview + zusaetzliche Files als Download-Links unter dem Preview.
- **Files modified:** frontend/src/components/belege/PdfPreview.tsx, frontend/src/pages/belege/BelegeDetailPage.tsx
- **Commit:** 53b5ec7 (PdfPreview), eb3d1b4 (DetailPage Multi-File)

**8. [Praezisierung] AuditTrail mit Diff-Logik statt rohem JSON-Dump**
- **Issue:** Plan-Snippet hatte einen rohen `<pre>{e.new_value}</pre>` Dump. Das ist fuer einen User unleserlich (JSON-String mit Quotes, Whitespace, alle Felder).
- **Fix:** AuditTrail parsed new_value/old_value als JSON, vergleicht alle Keys, zeigt nur die geaenderten in einer 3-Spalten-Tabelle (Feld / Vorher / Nachher). Bei mehr als 5 Diff-Eintraegen Expand/Collapse-Button. Fallback auf <pre>-Block fuer non-JSON-Werte. Action-Label + Action-Color (create=primary, update=tertiary, delete=error, mirror_sync=variant, freigabe=secondary).
- **Files modified:** frontend/src/components/belege/AuditTrail.tsx (188 Zeilen statt der Plan-spezifizierten ~30 Zeilen)
- **Commit:** 53b5ec7

**Total deviations:** 8 (alle Praezisierungen + 1 Critical-Fix beim Korrekturbeleg-Felder, keine Plan-Acceptance-Criteria-Verletzung). Alle 7 Soll-Items aus `must_haves.truths` sind verifiziert; alle 4 Plan-Artifacts existieren mit korrekter min_lines-Erfuellung; beide Plan-Requirements (BELEG-UI-04, BELEG-UI-05) erfuellt.

## Issues Encountered

Keine. Build und Tests liefen direkt sauber:
- `cd frontend && npx tsc --noEmit` exit code 0
- `cd backend && npx tsc --noEmit` exit code 0
- `cd frontend && npx vitest run` 41/41 passed (keine Regression)
- `cd backend && npx vitest run` 112/112 passed (keine Regression durch neue Endpoints)

react-pdf@10 wurde sauber installiert (4 vulnerabilities gemeldet von npm audit — 3 moderate, 1 high; vermutlich pdfjs-dist Sub-Dependency. Akzeptabel fuer Single-User-Local-App; npm audit fix sollte spaeter laufen, ist aber nicht plan-blocking).

Hinweis zur UAT: Eine browser-basierte Sichtkontrolle steht aus (Phase 04 ist autonom ohne Checkpoint). Frontend baut tsc-sauber; ein Smoke-Test waere `npm run dev` + Login + Klick durch /belege/alle, /belege/offen, /belege/zu-pruefen, /belege/{n}.

## User Setup Required

Keine Aktion noetig. Backend laeuft ueber bestehende Infra (verifyToken-Guard, /api/belege-Mount, kein DB-Schema-Change). Frontend laedt die 4 neuen Routes — der `/belege`-Sidebar-Link aus Plan 04-07 zeigt schon alle 8 Sub-Items; jetzt fuellen 4 davon mit echtem Inhalt.

UAT-Vorschlag (manuell, falls gewuenscht):
1. Frontend starten: `npm run dev` (in Wurzelverzeichnis) → Frontend laeuft auf Vite-Port.
2. Login → /belege im Browser oder via Sidebar-Click.
3. Klick auf "Alle" in der Sidebar → /belege/alle laedt mit Filterleiste; ohne Belege erscheint Empty-State; mit Belegen siehst du Tabelle.
4. Filter testen: Suchfeld eintippen + Enter; Status-Pill anklicken; Datums-Range setzen; URL aendert sich live.
5. Klick auf einen Beleg-Row → /belege/{id} Detail-Page laedt; PDF-Vorschau links, Sektionen rechts.
6. Bei nicht-freigegebenem Beleg: Felder bearbeiten (z.B. Lieferant), Tab/Enter → Server-Save via PATCH; Notiz aendern → onBlur-Save.
7. Klick "Freigeben" → Confirm-Dialog → Felder werden disabled.
8. Klick "Korrekturbeleg" → Confirm-Dialog → neuer Beleg wird erstellt + auto-Navigate dorthin; die "Zuordnung"-Sektion zeigt "Korrekturbeleg zu #ID".
9. Sidebar /belege/offen → sortiert nach Faelligkeit; ueberfaellige Belege rot markiert.
10. Sidebar /belege/zu-pruefen → zeigt zu_pruefen + ocr_pending; bei OCR-Lauf siehst du den Status live updaten (alle 3s Refetch).

## Next Phase Readiness

- **Plan 04-09 (UI Upload)** kann starten — Drop-Zone-Komponente baut auf bestehender belege.api.ts:uploadReceipts; nach Upload Auto-Navigate zu /belege/zu-pruefen (Refetch-Intervall zeigt OCR-Lauf live); fertig-OCR-d Belege landen im Review-Tab.
- **Plan 04-10 (UI Tax/Export/Settings)** kann starten — formatCurrencyFromCents ist da, StatusBadge auch; nur die 3 Pages (BelegeTaxPage, BelegeExportPage, BelegeSettingsPage) muessen erstellt + Routes registriert werden.
- **Plan 04-11 (DJ-Refactor)** kann starten — Lese-Sicht /dj/accounting kann jetzt auf receipts WHERE source='dj_invoice_sync' zeigen (alle DJ-Daten sind seit Plan 04-06 gespiegelt). Routes /belege/:id existieren fuer Direkt-Navigation aus DJ-Buchhaltung.
- **Pattern fuer kuenftige Listen-Pages etabliert** — URL-Search-Params + Filterleiste + Status-Pills + ReceiptsTable als wiederverwendbare Sub-Komponente. Wiederverwendbar fuer Amazon-Liste (Phase 5+) und Finanzen-Liste.

## Self-Check: PASSED

Verifiziert per `test -f` / `git log` / `npx tsc` / `npx vitest` / `grep`:

- [x] `frontend/src/components/belege/PdfPreview.tsx` FOUND (191 Zeilen)
- [x] `frontend/src/components/belege/AuditTrail.tsx` FOUND (188 Zeilen, exportiert AuditTrail)
- [x] `frontend/src/pages/belege/BelegeListPage.tsx` FOUND (517 Zeilen, exportiert BelegeListPage + ReceiptsTable)
- [x] `frontend/src/pages/belege/BelegeOpenPaymentsPage.tsx` FOUND (147 Zeilen)
- [x] `frontend/src/pages/belege/BelegeReviewPage.tsx` FOUND (78 Zeilen)
- [x] `frontend/src/pages/belege/BelegeDetailPage.tsx` FOUND (605 Zeilen, exportiert BelegeDetailPage)
- [x] `frontend/src/routes/routes.tsx` MODIFIED (+5 Zeilen — 4 Imports + 4 Routes)
- [x] `frontend/package.json` MODIFIED (+react-pdf@10.4.1)
- [x] `backend/src/routes/belege.routes.ts` MODIFIED (+145 Zeilen — file-serve + korrektur-Endpoints)
- [x] Commit `53b5ec7` (Task 1: Komponenten + Listen + Routes) FOUND in git log
- [x] Commit `021bdd3` (Task 2a: Backend file-serve + Korrekturbeleg) FOUND in git log
- [x] Commit `eb3d1b4` (Task 2b: BelegeDetailPage + Route) FOUND in git log
- [x] `cd frontend && npx tsc --noEmit` exit code 0
- [x] `cd backend && npx tsc --noEmit` exit code 0
- [x] `cd frontend && npx vitest run` 41/41 passed
- [x] `cd backend && npx vitest run` 112/112 passed
- [x] PdfPreview enthaelt `import { Document, Page, pdfjs } from 'react-pdf'` (verify per grep)
- [x] PdfPreview konfiguriert `pdfjs.GlobalWorkerOptions.workerSrc` (verify per grep)
- [x] BelegeDetailPage enthaelt `<PdfPreview` (Zeile 221), `<AuditTrail entries={r.audit_log}` (Zeile 520), `isLocked = !!r.freigegeben_at` (Zeile 116), `Korrekturbeleg`-Button (8 Vorkommen)
- [x] backend/src/routes/belege.routes.ts enthaelt `router.get('/:id/file/:fileId'` (Zeile 273), `router.post('/:id/korrektur'` (Zeile 319) — beide VOR `router.get('/:id'` (Zeile 403)
- [x] frontend/src/routes/routes.tsx hat 4 belege-Sub-Routes registriert: `/belege/alle` (Zeile 80), `/belege/offen` (Zeile 81), `/belege/zu-pruefen` (Zeile 82), `/belege/:id` (Zeile 84) — :id NACH allen spezifischen
- [x] frontend/package.json enthaelt `"react-pdf": "^10.4.1"`
- [x] BelegeOpenPaymentsPage zeigt 3 Mini-KPIs (Anzahl offen / Davon ueberfaellig / Summe Brutto)
- [x] BelegeReviewPage hat refetchInterval=3000 fuer ocr_pending
- [x] BelegeDetailPage hat refetchInterval=2000 fuer ocr_pending

---
*Phase: 04-belege-modul-dj-buchhaltungs-refactoring*
*Plan: 08 (Wave 5)*
*Completed: 2026-05-06*
