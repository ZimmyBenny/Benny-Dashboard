# Arbeitsmappe — frei platzierbare Bilder (OneNote-Schritt 1) — Design-Spec

**Datum:** 2026-08-27
**Status:** Freigegeben, direkt bauen
**Baut auf:** [[2026-08-27-arbeitsmappe-bilder-inline-design]]
**Richtung:** langfristig Richtung Microsoft OneNote (freie Fläche). Dieser Schritt:
Bilder frei platzierbar; Text bleibt vorerst Fließtext.

## Datenmodell — Migration 138

`workbook_page_images` (frei positioniertes Bild je Seite):
| Spalte | Typ | Notiz |
|---|---|---|
| id | INTEGER PK | |
| page_id | INTEGER NOT NULL | FK → workbook_pages(id) ON DELETE CASCADE |
| attachment_id | INTEGER NOT NULL | FK → workbook_attachments(id) ON DELETE CASCADE |
| x, y | REAL NOT NULL DEFAULT 20 | Position (px, relativ zum Content-Container) |
| width, height | REAL NOT NULL DEFAULT 300/200 | Größe (px) |
| z | INTEGER NOT NULL DEFAULT 0 | Stapel-Reihenfolge |
| created_at | INTEGER | |

Index auf `page_id`.

## Backend (`workbook.routes.ts`)
- `GET /pages/:id/images` — Liste (ORDER BY z, id).
- `POST /pages/:id/images` — Body `{ attachment_id, x?, y?, width?, height? }`
  (Defaults 20/20/300/200; z = max+1). Antwort: die Zeile.
- `PATCH /pages/images/:imgId` — `{ x?, y?, width?, height?, z? }` (Zahlen, ≥ 0;
  width/height min. 40).
- `DELETE /pages/images/:imgId` — löscht die Bild-Zeile **und** den zugehörigen
  Anhang (Zeile + Datei), da 1:1 (kein Orphan).

## Frontend

### API/Hooks (`workbook.api.ts`)
Typ `PageImage`; `fetchPageImages`, `createPageImage`, `updatePageImage`,
`deletePageImage`. Blob-Laden über bestehendes `getAttachmentObjectUrl`.

### Editor-Integration (`WorkbookEditor.tsx`)
- Editor-Content + **Bild-Ebene** in einen `position: relative`-Container wickeln.
- Bilder aus State (geladen per `fetchPageImages` bei Seitenwechsel) als absolut
  positionierte `FloatingImage`-Komponenten darüber rendern.
- **Drop & Paste** eines Bildes: `uploadAttachment` → `createPageImage` an der
  **Drop-/Cursor-Position** (Koordinaten relativ zum Container; Fallback 20/20) →
  in State aufnehmen. Ersetzt das Inline-Einfügen (der `imageAttachment`-Node
  bleibt nur registriert, damit evtl. schon eingefügte Inline-Bilder weiter gehen).

### Komponente `FloatingImage.tsx`
- Absolut positioniert (`left/top/width/height`), lädt Blob mit Auth.
- **Ziehen:** Pointer-Down auf dem Bild → `setPointerCapture` → move aktualisiert
  x/y (lokal) → **Pointer-Up speichert** (`updatePageImage`). Button/Handles lösen
  kein Drag aus (stopPropagation).
- **Skalieren:** Eck-Griff unten rechts → Breite ändern, Höhe = Breite/Seiten­
  verhältnis (Verhältnis beim Laden gemerkt). Pointer-Up speichert.
- **Auswahl:** Klick markiert (Rahmen); dann **×-Knopf** oben rechts → Rückfrage →
  `deletePageImage`.
- z-Index: ausgewähltes Bild nach vorn.

## PDF-Export
Nach dem Text jeder Seite die zugehörigen `workbook_page_images` (per `page_id`)
anhängen: `doc.image(pfad, { fit: [Content-Breite, 400] })` je Bild.
Pixelgenaue Positionierung im PDF ist **nicht** in diesem Schritt (kommt später) —
erst mal sind die Bilder überhaupt drin.

## Konventionen
- Nur Bild-MIME wird als freies Bild angelegt; Nicht-Bilder behalten Anhang/
  E-Mail-Karten-Verhalten.
- Pointer-Events + `setPointerCapture` (DnD-Standard); Backend nach Routen-
  Änderung neu laden. Echte Umlaute.

## NICHT im Scope (später Richtung OneNote)
- Freie Textboxen, pixelgenaue PDF-Positionierung, Drehen, Ebenen-UI,
  Mehrfach-Auswahl, Ausrichthilfen/Snapping.
