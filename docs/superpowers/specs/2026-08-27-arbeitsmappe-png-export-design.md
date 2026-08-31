# Arbeitsmappe — Seite als PNG exportieren — Design-Spec

**Datum:** 2026-08-27
**Status:** Freigegeben, direkt bauen
**Baut auf:** [[2026-08-27-arbeitsmappe-freie-bilder-design]]

## Ziel

Die aktuelle Seite (Text + frei platzierte Bilder, so wie sie aussieht) als
**ein PNG** exportieren — im Browser gerendert.

## Umsetzung (Frontend only)

- Neue Lib **`html-to-image`** (installiert).
- Knopf **„Diese Seite als PNG"** im Editor (neben „Diese Seite als PDF").
- Handler in `WorkbookEditor.tsx`:
  1. Auswahl aufheben (`setSelectedImageId(null)`) + kurz warten (Handles/×
     sollen nicht im Bild sein).
  2. Ziel = der Content-Container (`scrollRef`). Hintergrundfarbe aus
     `getComputedStyle(el).backgroundColor` (Fallback `#0f161e`).
  3. `toPng(el, { backgroundColor, width: el.scrollWidth, height: el.scrollHeight,
     pixelRatio: 2, style: { overflow: 'visible' } })` → volle Seitenhöhe.
  4. Data-URL als `<a download="<Titel>.png">` herunterladen.
  - Fehler: still fangen (kein Absturz), ggf. `console` — kein Blocker.

## Hinweise
- Frei platzierte Bilder nutzen Blob-Object-URLs (same-origin) → werden von
  html-to-image eingebettet.
- Fonts/CSS-Variablen inline-t die Lib weitgehend; Fallback-Font ist okay.
- Kein Backend, keine Migration.

## NICHT im Scope
- Auswahl-Ausschnitt, mehrere Seiten, Server-seitiges Rendern.
