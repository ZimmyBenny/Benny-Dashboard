# Amazon-Produkt-Checkliste als PDF exportieren

**Datum:** 2026-08-14 · **Status:** Von Benny freigegeben

## Ziel

Die Produkt-Checkliste (Amazon-Entwicklung) als PDF exportieren — **je Bereich
einzeln** ODER die **komplette** Checkliste.

## Entscheidungen (mit Benny geklärt)

1. **Komplett mit Haken** — alle Punkte inkl. Erledigt-Status (nicht nur offene).
2. **Spalten wie am Bildschirm:** Nr · Beschreibung · Erledigt · Bemerkung · Link.

## Befund

- Datenmodell (`amazon.api.ts`): `ChecklistSection { id, title, items[] }`,
  `ChecklistItem { description, remark, link_url, link_label, is_done }`.
- Amazon-Exporte laufen **clientseitig** mit **jsPDF + jspdf-autotable**
  (Vorlage: `exportBrandPdf.ts`). Beide Libs installiert.
- Container: `ChecklistSection.tsx` (Kopf mit „done/total"), Bereiche:
  `ChecklistSectionBlock.tsx` (Header mit „done/total" + Löschen-Icon).

## Umsetzung — rein Frontend, kein Backend, keine Migration

**Neue Datei `frontend/src/lib/amazon/exportChecklistPdf.ts`** (jsPDF + autotable):
- `exportChecklistPdf(productName, sections)` — `sections` = alle (Gesamt) oder [einer].
- Kopf: Produktname · „Checkliste" · Datum · Gesamt-Fortschritt „X / Y erledigt".
- Pro Bereich: Überschrift „<Titel> — done/total", darunter `autoTable`:
  - Spalten: **Nr · Beschreibung · Erledigt · Bemerkung · Link**.
  - Erledigt: `'X'` wenn `is_done===1`, sonst leer.
  - Link: `link_label || link_url || ''`.
  - Erledigte Zeilen leicht ausgegraut (`didParseCell` → textColor grau bei is_done).
  - Seitenumbruch/Zeilenumbruch via autotable.
- Download: `Checkliste - <Produkt>.pdf` (gesamt) bzw.
  `Checkliste - <Bereich> - <Produkt>.pdf` (einzeln). Dateiname via
  `sanitize` (keine `/ \ :`), Umlaute in jsPDF-Text sind ok (WinAnsi).
- Rückgabe: löst den Download direkt aus (`doc.save(filename)`), wie exportBrandPdf.

**Knopf Gesamt** — `ChecklistSection.tsx`, im Kopf neben „done/total":
kleiner „PDF"-Button → `exportChecklistPdf(productName, data.sections)`.
Produktname: liegt bereits vor (Prop/Query der Detailseite) — sonst über
`productId` laden. Falls productName nicht direkt verfügbar → als Prop durchreichen.

**Knopf je Bereich** — `ChecklistSectionBlock.tsx`, im Header vor dem Löschen-Icon:
PDF-Icon → `exportChecklistPdf(productName, [section])`. productName als neue Prop.

## Verifikation

1. Gesamt-Export: PDF mit allen Bereichen, Kopf-Fortschritt korrekt (z.B. 23/115),
   je Bereich Tabelle mit 5 Spalten, Erledigt-„X" stimmt mit UI überein.
2. Einzel-Export eines Bereichs: nur dieser Bereich, Dateiname mit Bereichsnamen.
3. Umlaute (Beschreibung/Bemerkung) korrekt im PDF.
4. Langer Text bricht um, Seitenumbruch funktioniert.

## Nicht im Scope

- Produktbild/Notizen im PDF (nur die Checkliste)
- Backend-Export / serverseitige Generierung
- Nur-offene-Punkte-Variante (bewusst „komplett mit Haken")
