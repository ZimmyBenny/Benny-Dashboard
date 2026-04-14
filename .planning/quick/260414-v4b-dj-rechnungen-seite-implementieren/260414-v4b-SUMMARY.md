---
phase: quick-260414-v4b
plan: 01
subsystem: dj-invoices
tags: [dj, invoices, gobd, frontend, react]
dependency_graph:
  requires: [dj.api.ts, StatusBadge, PageWrapper, DjQuotesPage pattern]
  provides: [DjInvoicesPage, DjInvoiceDetailPage]
  affects: [/dj/invoices route, /dj/invoices/:id route]
tech_stack:
  added: []
  patterns: [CSS variables only, KpiCard inline, InvoiceRow inline, LocalItem pattern, contact picker with outside-click]
key_files:
  created: []
  modified:
    - frontend/src/pages/dj/DjInvoicesPage.tsx
    - frontend/src/pages/dj/DjInvoiceDetailPage.tsx
decisions:
  - Summen bei finalized aus invoice-Objekt gelesen (subtotal_net/tax_total via cast), live bei Entwurf
  - Überfällig-Tab filtert clientseitig (due_date < today + unpaid), nicht nur nach Backend-Status
  - Stornorechnung- und Storniert-Banner getrennt (is_cancellation vs. cancelled_by_invoice_id)
  - Bezahlt/Offen-Zeilen in Summen-Block nur wenn paid_amount > 0 bzw. Restbetrag vorhanden
metrics:
  duration: ~25 min
  completed: 2026-04-14
  tasks_completed: 3
  files_changed: 2
---

# Phase quick-260414-v4b Plan 01: DJ-Rechnungen-Seite implementieren — Summary

**One-liner:** Vollständige GoBD-konforme Rechnungsseiten mit KPI-Liste, 7 Filter-Tabs und Detail-Formular mit Positionen, Finalisieren, Stornieren und Zahlungserfassung.

## Was wurde gebaut

### Task 1: DjInvoicesPage

`frontend/src/pages/dj/DjInvoicesPage.tsx` — vollständig neu implementiert (war Skeleton).

- 4 KPI-Karten: Gesamt / Offen / Überfällig / Bezahlt
- 7 Filter-Tabs: Alle / Entwurf / Offen / Teilbezahlt / Bezahlt / Überfällig / Storniert
- Überfällig-Tab filtert clientseitig: `due_date < today && paid_amount < total_gross && status !== 'storniert'`
- 8-spaltige Tabelle: Rechnungsnr. | Datum | Fälligkeit | Betreff | Kunde | Brutto | Status | Edit
- Entwurf-Chip (surface-container-high) wenn `number === null`
- Fälligkeitsdatum in `var(--color-error)` wenn Rechnung überfällig
- `receipt_long_off` für leeren Zustand

### Task 2: DjInvoiceDetailPage

`frontend/src/pages/dj/DjInvoiceDetailPage.tsx` — vollständig neu implementiert (war Skeleton).

- Kontakt-Picker mit Suche, Outside-Click + Escape, max 8 Ergebnisse, Auswahlindikator
- Formularfelder: Event (optional), Betreff, Fälligkeitsdatum, Zahlungskonditionen
- Positionsliste identisch DjQuoteDetailPage: Service-Dropdown + Freitext, Menge, Einheit, Preis, MwSt, Netto-Summe, Löschen
- Live-Summen (Netto / MwSt / Brutto) — bei finalisierten Rechnungen aus Backend-Objekt
- Bezahlt/Offen-Zeilen in Summen-Block für finalisierte Rechnungen
- GoBD-readonly-Banner + alle Inputs/Selects disabled/readOnly wenn `finalized_at !== null`
- Finalisieren-Button (nur Entwurf): Confirm-Dialog, POST /finalize, Header-Buttons aktualisiert
- Stornieren-Button (nur finalized, nicht storniert): Danger-Styling, Confirm-Dialog, POST /cancel, redirect zur Liste
- Zahlung verbuchen (nur offen/teilbezahlt): Modal mit vorbelegt offenem Betrag, heutigem Datum, Dropdown (Überweisung/Bar/PayPal/Sonstige), nach Buchung Rechnung neu geladen
- Stornorechnung-Banner (gelb, wenn `is_cancellation === 1`)
- Storniert-Banner (rot, wenn `cancelled_by_invoice_id !== null`)

### Task 3: TypeScript-Build

`npx tsc --noEmit` — Exit 0, keine Fehler in neuen oder bestehenden Dateien.

## Commits

| Task | Hash | Message |
|------|------|---------|
| Task 1 | 300380b | feat(quick-260414-v4b-01): DjInvoicesPage — Liste mit KPIs, Filter-Tabs, Tabelle |
| Task 2 | f5a35c8 | feat(quick-260414-v4b-01): DjInvoiceDetailPage — Formular, Positionen, GoBD-Schutz, ... |

## Deviations from Plan

None — Plan executed exactly as written.

## Known Stubs

None — beide Seiten sind vollständig implementiert und mit dem Backend verdrahtet.

## Threat Flags

Keine neuen Angriffsflächen eingeführt. Alle Aktionen (finalize, cancel, pay) gehen als authenticated API-Calls. GoBD-readonly im Frontend ist UX — Backend `gobdGuardInvoice`-Middleware blockiert PATCH auf finalisierte Rechnungen unabhängig vom Frontend-State (T-v4b-01, accept).

## Self-Check: PASSED

- `frontend/src/pages/dj/DjInvoicesPage.tsx` — FOUND
- `frontend/src/pages/dj/DjInvoiceDetailPage.tsx` — FOUND
- Commit 300380b — FOUND
- Commit f5a35c8 — FOUND
- TypeScript Build — Exit 0
