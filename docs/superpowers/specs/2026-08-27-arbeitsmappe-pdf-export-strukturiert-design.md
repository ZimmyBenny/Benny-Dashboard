# Arbeitsmappe PDF-Export strukturiert + Direkt-Knopf — Design-Spec

**Datum:** 2026-08-27
**Status:** Freigegeben, direkt bauen

## Problem

Der PDF-Export ist unbrauchbar: er rendert `content_text` (die platt­geklopfte
Textversion — `join(' ')` + `replace(/\s+/g,' ')`). Überschriften, Checklisten,
Absätze kleben zu einem Textbrei zusammen, keine Umbrüche/Checkboxen.

## Teil 1 — Strukturierter PDF-Renderer (Backend)

`backend/src/routes/workbook.routes.ts`, Export-Route:
- **`p.content`** (rohes Tiptap-JSON) zur SELECT hinzufügen (bisher nur
  `content_text`).
- Body je Seite über einen **Node-Walker** rendern statt `doc.text(content_text)`.
  Behalten: Bereichs-Überschrift, Seitentitel, Meta-Zeile, Scopes.

**Renderer `renderDoc(doc, contentJson)`** — behandelt die Tiptap-Node-Typen:
| Node | PDF-Ausgabe |
|---|---|
| `heading` (level 1–3) | fett, Größe 16 / 13.5 / 12; Abstand danach |
| `paragraph` | Inline-Runs, Größe 11; Leerzeile danach; leerer Absatz = kleiner Abstand |
| `bulletList` › `listItem` | `•  ` + Inline, je Zeile |
| `orderedList` › `listItem` | `1.  `, `2.  ` … |
| `taskList` › `taskItem` (attrs.checked) | `☑  ` bzw. `☐  ` + Inline |
| `blockquote` | eingerückt, grau |
| `codeBlock` | Courier |
| `horizontalRule` | dünne Linie |
| `hardBreak` | Zeilenumbruch |
| `emailCard` (custom) | „✉ <subject> — <from>" als Block |
| Bilder | vorerst ignoriert (kommen mit dem Inline-Bild-Feature) |

**Inline-Marks:** Helfer `writeInline(doc, runs, size)` sammelt Text-Runs mit
`bold`/`italic`/`link` und gibt sie per pdfkit-`continued`-Verkettung aus
(bold → `Helvetica-Bold`, italic → `Helvetica-Oblique`, beide → `-BoldOblique`,
link → unterstrichen, blau). Unbekannte Node-Typen: rekursiv über `content`
absteigen (Text geht nie verloren).

Robustheit: JSON parse in try/catch; ist `content` leer/kaputt → Fallback auf
`content_text` (aktuelles Verhalten) für diese Seite.

## Teil 2 — „Diese Seite als PDF" (Frontend)

`frontend/src/components/workbook/WorkbookEditor.tsx`: Knopf in der oberen
Editor-Leiste (rechter Bereich). Klick → `exportWorkbook({ format: 'pdf',
page_id: page.id })` (bestehende Funktion, lädt Blob + Download). Kein neuer
Endpoint. Tooltip „Diese Seite als PDF exportieren".

Der bestehende Export-Dialog (Bereich → Seite → CSV/PDF) bleibt unverändert —
Einzelseiten-Export geht dort bereits, wird durch den Renderer nur brauchbar.

## Konventionen
- Echte Umlaute (pdfkit Standard-Font WinAnsi deckt Ä/Ö/Ü/ß + Aufzählungszeichen
  ab; ☐/☑ notfalls durch `[ ]`/`[x]` ersetzen, falls Glyphe fehlt — im Bau prüfen).
- Kein Datenmodell-Änderung, keine Migration.

## NICHT im Scope
- Bilder im PDF (folgt mit „Bilder inline").
- Tabellen/komplexe Nodes (aktuell nicht im Editor).
- CSV-Export ändern (bleibt wie er ist).
