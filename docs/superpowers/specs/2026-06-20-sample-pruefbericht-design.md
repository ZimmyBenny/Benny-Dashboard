# Sample-Prüfbericht — Design-Spezifikation

**Datum:** 2026-06-20
**Status:** Zur Freigabe (Spec-Review durch Benny ausstehend)

## Ziel

Für ein konkret erhaltenes **Sample** soll ein **Prüfbericht** auf Basis der **USP-Anforderungen** des Produkts erstellbar sein:
- **digital erfassbar** (Status + Bemerkung je Anforderung, dauerhaft gespeichert, jederzeit weiter bearbeitbar)
- als **Druck-PDF**, das den digitalen Stand zeigt und für leere Felder Linien/Kästchen zum Handausfüllen lässt
- mit einer **letzten Seite für Zusatz-Notizen** (viel Platz zum Handschreiben)

## Verankerung

**Pro Sample** (`amazon_manufacturer_samples`). Jedes Sample hat genau einen Prüfbericht. Einstieg über einen Knopf **„Prüfbericht"** an jedem Sample (im `ManufacturerSamples`-Bereich, neben Bewertung/Status).

Daten-Bezug:
- Sample → Hersteller (`manufacturer_id` → `amazon_manufacturers`) → Produkt (`product_id`)
- Produkt → USP-Punkte (`amazon_usp_points`) = die Anforderungen, die geprüft werden
- „Soll" je Anforderung = die Hersteller-Angabe aus dem USP: `amazon_usp_feasibility` für die `UspManufacturer`-Zeile, deren `manufacturer_id` = `manufacturer_id` des Samples (falls verknüpft; sonst entfällt die Soll-Spalte)

## UI

**Verschiebbares Modal** (am Header ziehbar — entspricht der Projekt-Vorgabe für alle freischwebenden Modals), geöffnet über „Prüfbericht" am Sample.

Inhalt des Modals:

1. **Kopf — automatisch befüllt** (keine Doppeleingabe): Produkt, Marke (die markierte `final_marke`), Hersteller, Sample-Bezeichnung, Erhalten-am, Sendungsnr., Sample-Notiz/Maße.
2. **Übersicht:** kleine Zähl-Anzeige „X von Y erfüllt".
3. **Prüfzeilen — eine je USP-Punkt** (in USP-Reihenfolge):
   - Anzeige: Thema, Anforderungstext (`body`), zugehörige Fragen
   - *Soll* (dezent): Hersteller-Angabe aus USP (Erfüllt/Teilweise/Nicht/Offen), falls Hersteller verknüpft
   - *Ist* (Eingabe): **Prüf-Status** (Erfüllt / Teilweise / Nicht / Offen) + **Bemerkung/Messwert** (Freitext)
4. **Zusatz-Notizen:** großes Freitextfeld für den Bericht.
5. **Aktionen:** Speichern erfolgt automatisch (onBlur/onChange wie bestehende USP-Felder); Knopf **„PDF drucken"**.

## Datenmodell

Neue Migration (nächste freie Nummer), Backup ist über `migrate.ts` automatisch:

- **`amazon_sample_inspection_results`**
  - `id` INTEGER PK
  - `sample_id` INTEGER NOT NULL → `amazon_manufacturer_samples(id)` ON DELETE CASCADE
  - `point_id` INTEGER NOT NULL → `amazon_usp_points(id)` ON DELETE CASCADE
  - `status` TEXT NOT NULL DEFAULT 'offen'  // 'erfuellt' | 'teilweise' | 'nicht' | 'offen'
  - `note` TEXT
  - `updated_at` INTEGER
  - UNIQUE(`sample_id`, `point_id`)
- **`amazon_manufacturer_samples`** erhält Spalte **`inspection_notes`** TEXT (Zusatz-Notizen für die letzte PDF-Seite). Optional zusätzlich `inspected_at` INTEGER.

Anbindung: Prüfzeilen sind **live** an die aktuellen USP-Punkte gebunden (Verknüpfung über `point_id`). Das gedruckte PDF dient als archivierter Stand. (Kein Snapshot der Anforderungen in v1.)

## Backend-Routen (Express, unter dem JWT-Guard)

- `GET  /api/amazon/manufacturers/samples/:sampleId/inspection`
  → liefert: USP-Punkte des Produkts (Thema/Anforderung/Fragen), je Punkt das gespeicherte Ist-Ergebnis, das Soll (Hersteller-Angabe, falls verknüpft), `inspection_notes` + Kopf-Daten
- `PUT  /api/amazon/manufacturers/samples/:sampleId/inspection/:pointId`
  → speichert Status + Bemerkung für einen Punkt (Upsert; Einzel-CRUD)
- `PATCH /api/amazon/manufacturers/samples/:sampleId/inspection`
  → speichert `inspection_notes`

Einzeloperationen — kein Massen-Insert/Update/Delete, daher kein zusätzlicher `createBackup`-Aufruf nötig (gemäß Projekt-Konvention).

## Frontend

- Neuer Knopf + Modal-Komponente im `ManufacturerSamples`-Bereich (Drag am Header wiederverwenden).
- TanStack-Query-Hook für Laden/Speichern der Inspektionsdaten.
- PDF-Generator `frontend/src/lib/amazon/exportSamplePruefberichtPdf.ts` mit **jsPDF** (gleiches Muster wie `exportUspPdf.ts`).

### PDF-Aufbau

- **Kopf:** Produkt, Marke, Hersteller, Sample, Erhalten-am, Sendungsnr., Datum.
- **Tabelle (eine Zeile je Anforderung):** Nr | Thema + Anforderung | Soll (Hersteller) | Prüf-Status | Bemerkung.
  - Eingetragene Werte werden gedruckt; **leere** Status/Bemerkungen erscheinen als **leere Kästchen/Linien** zum Handausfüllen.
- **Letzte Seite:** „Zusatz-Notizen" — eingetragener Text + linierter Freiraum zum Handschreiben.

## Datensicherheit

- Neue Tabelle + `ALTER TABLE` über Migration → automatisches Backup via `migrate.ts`.
- Keine destruktiven Bulk-Operationen.
- Löschen eines Samples kaskadiert die zugehörigen Prüfergebnisse (gewollt).

## Bewusst NICHT enthalten (YAGNI, v1)

- Kein Snapshot/Versionierung der Anforderungen pro Bericht.
- Keine Fotos im Prüfbericht-PDF (die liegen schon beim Sample).
- Kein Export über mehrere Samples/Hersteller hinweg.
- Keine eigene Prüfbericht-Übersichtsseite/Modul.

## Offene Punkte (beim Review bestätigen)

1. **Soll/Ist:** Hersteller-Angabe als „Soll" anzeigen — aktuell **ja** vorgesehen.
2. **UI-Form:** verschiebbares **Modal** — alternativ aufklappbarer Bereich direkt unter dem Sample.
