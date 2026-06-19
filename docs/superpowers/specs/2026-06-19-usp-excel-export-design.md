# USP Excel-Export pro Hersteller — Design

**Datum:** 2026-06-19
**Modul:** Amazon → USP-Bereich (Vergleich)
**Status:** Entwurf abgenommen, bereit für Implementierungs-Plan

## Problem / Ziel

Benny will die USP-Anforderungen (Punkte + Anforderungstext) **pro Hersteller als
Excel** exportieren — um sie dem Hersteller zu schicken (bzw. sich selbst). Format
soll seiner bestehenden „Tracking-Tabelle" entsprechen (Anleitung-Blatt, Spalten,
Dropdowns, Farb-Formatierung). Die Vergleichsliste im Dashboard und die Excel werden
so verbunden: der Export zieht direkt aus dem Dashboard-Stand.

## Entscheidungen (aus dem Brainstorming)

1. **Befüllung:** vorausgefüllt mit dem aktuellen Dashboard-Stand des Herstellers
   (Status + Notizen), als editierbare Dropdowns/Felder.
2. **Format-Treue:** 1:1 wie Bennys Vorlage — Anleitung-Blatt + Tracking-Blatt mit
   Dropdowns + Farb-Formatierung.
3. **„Kann umgesetzt werden"-Werte:** Ja / Teilweise / Nein / Offen.
4. **Punkte-Auswahl:** nur die für den Hersteller aktivierten (`include_in_pdf = 1`),
   genau wie beim bestehenden PDF-Export.

## Ort & Technik

- **Button „Excel"** neben den bestehenden PDF-Buttons in `UspSection.tsx`, nutzt den
  **gleichen Hersteller-Dropdown** (`selectedMId`/`activeMId`). Klick → `.xlsx`-Download.
- **Client-seitig** (wie der PDF-Export), Library **ExcelJS** (`exceljs`), per
  **dynamischem Import** in der Export-Funktion geladen (kein Wachsen des Haupt-Bündels).
- Neue Datei `frontend/src/lib/amazon/exportUspExcel.ts` analog zu `exportUspPdf.ts`.
- Datenquelle: gleicher `refetch()`-Stand wie der PDF-Build (`points`, `feasibility`,
  `manufacturers`, `meta`).

## Aufbau der .xlsx

### Blatt 1 „Anleitung"
Erklärtext wie in Bennys Vorlage (echte Umlaute):
- „Diese Tabelle enthält alle Anforderungen aus der Spezifikation."
- „Jede Anforderung kann abgehakt und mit eigenen Notizen versehen werden."
- So funktioniert es: „Erledigt = Ja → ganze Zeile grün (Vorrang). Kann umgesetzt
  werden: Ja = grün, Teilweise = orange, Nein = rot, Offen = gelb."
- Spalten-Beschreibung (Punkt, Thema, Anforderung, Kann umgesetzt werden, Erledigt,
  Notizen / Freitext).

### Blatt 2 „Tracking"
Kopfzeile (gefärbt, fett) + Spalten:

| Spalte | Inhalt |
|---|---|
| **Punkt** | laufende Nummer (Index nach `sort_order`, 1..n) |
| **Thema** | `point.title` |
| **Anforderung** | `point.body` + angehängte **Fragen an Hersteller** (`point.questions[].text`, je Zeile mit „Frage: …") |
| **Kann umgesetzt werden** | Dropdown **Ja / Teilweise / Nein / Offen**, vorausgefüllt aus dem Status des Herstellers (Mapping: `umsetzbar→Ja`, `teilweise→Teilweise`, `nicht→Nein`, `offen→Offen`) |
| **Erledigt** | Dropdown **Nein / Ja**, vorbelegt mit „Nein" |
| **Notizen / Freitext** | `feasibility.note` des Herstellers für diesen Punkt (vorbelegt) |

- **Nur** Punkte mit `include_in_pdf !== 0` für den gewählten Hersteller (wie PDF).
- Zeilen sinnvoll umbrechen (Anforderung/Notizen `wrapText`, Spaltenbreiten gesetzt).

### Dropdowns (Data Validation)
- „Kann umgesetzt werden": Liste `Ja,Teilweise,Nein,Offen`.
- „Erledigt": Liste `Nein,Ja`.

### Farb-Formatierung (Conditional Formatting, dynamisch wie Vorlage)
- Auf der „Kann umgesetzt werden"-Spalte: `Ja`→grün, `Teilweise`→orange, `Nein`→rot,
  `Offen`→gelb (cellIs-Regeln).
- Auf dem gesamten Datenbereich: wenn `Erledigt = Ja` → ganze Zeile grün (Expression-
  Regel `=$<ErledigtSpalte>2="Ja"`, höhere Priorität als die Status-Farben).
- Zusätzlich werden die Status-Zellen beim Erzeugen passend eingefärbt (Startzustand),
  damit es sofort stimmt; Conditional Formatting hält es bei Änderungen aktuell.

## Dateiname

`Anforderungen_<Produkt-Slug>_<Hersteller-Slug>_<YYYY-MM-DD>.xlsx`
(Slug-Logik wie in `exportUspPdf.ts` wiederverwenden.)

## Frontend-Integration

- `exportUspExcel(productName, points, manufacturer, feasibility): Promise<{ blob, filename }>`
  in `exportUspExcel.ts`. Baut die Mapping-Tabelle (Status/Notiz je Punkt für DIESEN
  Hersteller) aus `feasibility`.
- In `UspSection.tsx`: Handler `handleExcel()` analog zu `handleDownload()` — `refetch()`,
  Hersteller + included-Punkte bestimmen (gleiche Filter-Logik wie PDF), `exportUspExcel`
  aufrufen, Blob per Download-Link speichern. Neuer Button „Excel" (Icon `table_view`/
  `grid_on`) neben „Herunterladen".

## Abhängigkeit

- `exceljs` zu `frontend/package.json` hinzufügen (`npm --prefix frontend install exceljs`).

## Testkriterien (UAT)

1. Hersteller im Dropdown wählen → „Excel" → `.xlsx` lädt herunter, Dateiname korrekt.
2. Datei hat Blätter „Anleitung" + „Tracking".
3. Tracking enthält nur die für den Hersteller aktivierten Punkte, mit Punkt-Nr, Thema,
   Anforderung (inkl. Fragen), vorausgefülltem „Kann umgesetzt werden" + Notizen.
4. Dropdowns funktionieren (Ja/Teilweise/Nein/Offen bzw. Nein/Ja).
5. Farben: Status-Zellen passend gefärbt; „Erledigt = Ja" färbt die Zeile grün.
6. PDF-Export unverändert; Vergleich/Übersicht unverändert.

## Offen / bewusst NICHT enthalten (YAGNI)

- Excel mit ALLEN Herstellern in einem Blatt (nur pro Hersteller).
- Re-Import der ausgefüllten Excel zurück ins Dashboard.
- Bilder/Logo in der Excel (nur Text; Bilder bleiben dem PDF vorbehalten).
- Backend-Generierung (bleibt client-seitig wie das PDF).
