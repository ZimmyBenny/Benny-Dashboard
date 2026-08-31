# Arbeitsmappe — Pfeile & Beschriftung (freie Annotationen) — Design-Spec

**Datum:** 2026-08-27
**Status:** Freigegeben, direkt bauen
**Baut auf:** [[2026-08-27-arbeitsmappe-freie-bilder-design]]
**Modell:** freie Elemente auf der Seite (OneNote-Stil), unabhängig von Bildern.

## Datenmodell — Migration 139

`workbook_page_annotations`:
| Spalte | Typ | Notiz |
|---|---|---|
| id | INTEGER PK | |
| page_id | INTEGER NOT NULL | FK → workbook_pages(id) ON DELETE CASCADE |
| kind | TEXT NOT NULL | 'arrow' \| 'text' |
| x1, y1 | REAL NOT NULL | Pfeil-Start / Text-Position |
| x2, y2 | REAL NOT NULL DEFAULT 0 | Pfeil-Ende (Text: ungenutzt) |
| text | TEXT NOT NULL DEFAULT '' | Text-Inhalt |
| color | TEXT NOT NULL DEFAULT '#ef4444' | Farbe (Pfeil rot default) |
| size | REAL NOT NULL DEFAULT 3 | Pfeil = Linienstärke; Text = Schriftgröße |
| z | INTEGER NOT NULL DEFAULT 0 | |
| created_at | INTEGER | |

Index auf `page_id`.

## Backend (`workbook.routes.ts`)
- `GET /pages/:id/annotations` — Liste (ORDER BY z, id).
- `POST /pages/:id/annotations` — `{ kind, x1, y1, x2?, y2?, text?, color?, size? }`.
- `PATCH /pages/annotations/:aid` — `{ x1?, y1?, x2?, y2?, text?, color?, size?, z? }`.
- `DELETE /pages/annotations/:aid`.
- Validierung: kind ∈ {arrow,text}; Zahlen; text/color/size mit Kappung.

## Frontend

### API/Hooks (`workbook.api.ts`)
Typ `PageAnnotation`; `fetchAnnotations`, `createAnnotation`, `updateAnnotation`,
`deleteAnnotation`.

### Werkzeugleiste (`WorkbookEditor.tsx`)
Zwei Icon-Knöpfe in der Editor-Leiste:
- **➤ Pfeil** (`arrow_outward`) → `annotationMode='arrow'` (Cursor Fadenkreuz).
- **T Text** (`title`) → `annotationMode='text'`.
Aktiver Modus ist hervorgehoben; Esc/erneuter Klick beendet ihn.

### Zeichnen (Capture-Fläche)
Nur im Zeichnen-Modus liegt eine transparente Capture-Fläche über dem Content
(`position:absolute; top/left 0; width=scrollWidth; height=scrollHeight;
pointerEvents:auto`, im scrollRef-Container):
- **Pfeil:** Pointer-Down = Start, Ziehen, Pointer-Up = Ende → `createAnnotation`
  (kind arrow). Danach Modus aus.
- **Text:** Klick = Position → `createAnnotation` (kind text, leer) → fokussieren.
  Danach Modus aus.
Im Normalmodus existiert die Fläche nicht → Klicks gehen an den Editor-Text.

### Rendering (je Element einzeln, Kinder des scrollRef — wie FloatingImage)
- **`ArrowAnnotation`** — eigenes absolut positioniertes `<svg>` über der Bounding-
  Box; Linie + Pfeilspitze (Polygon) in `color`, Stärke `size`. `pointerEvents:auto`
  (breite unsichtbare Trefferlinie zum Selektieren). Ausgewählt: zwei Endpunkt-Griffe
  (einzeln ziehbar → x/y updaten) + Ziehen der ganzen Linie (beide Punkte).
- **`TextAnnotation`** — absolut positionierter `contentEditable`-Kasten in `color`,
  Schriftgröße `size`. Tippen editiert; `onBlur` speichert `text`. Ausgewählt:
  Move-Griff (oben links, Pointer-Drag → x/y) + ×-Löschen.
- **Auswahl:** eine Annotation aktiv; ausgewählte zeigt eine **kompakte
  Kontroll-Leiste**: Farb-Swatches (Rot/Blau/Grün/Gelb/Weiß/Schwarz), bei Text
  zusätzlich Schriftgröße −/+, und Löschen.
- Speichern jeweils bei Pointer-Up / Blur (`updateAnnotation`).
- `pointerEvents`: Container-Overlay none, einzelne Elemente auto → Editor-Text
  bleibt bedienbar.

## Export
- **PNG** (html-to-image) erfasst SVG-Pfeile + Text-Kästen **automatisch** — der
  annotierte Export. ✅
- **PDF:** pixelgenaue Annotation-Positionierung **später** (wie bei Bildern).

## Konventionen
- Pointer-Events + `setPointerCapture` (DnD-Standard); echte Umlaute; Löschen mit
  Rückfrage (bei Text mit Inhalt) bzw. direkt (leerer Text/Pfeil).
- Backend nach Routen-Änderung neu laden.

## NICHT im Scope (später)
- Freihand/Stift, Rechteck/Kreis, gebogene Pfeile, Textbox-Hintergrund/Rahmen,
  Mehrfach-Auswahl, PDF-Positionierung, Rotation.
