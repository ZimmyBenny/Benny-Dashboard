# USP + Hersteller zusammenführen (eine Wahrheit)

**Datum:** 2026-07-28 · **Status:** Von Benny freigegeben (Option A)

## Problem

Auf der Amazon-Produktseite gibt es zwei getrennte Hersteller-Listen:
1. **Hersteller-Sektion** — `amazon_manufacturers` (mit Angeboten/Angebotsvergleich).
2. **USP-eigene Liste** — `amazon_usp_manufacturers` (speist Machbarkeits-Matrix +
   Vorschau/Version/Export-Dropdown).

Ein in der Hersteller-Sektion angelegter Hersteller erscheint NICHT automatisch im
USP-Bereich → Benny kann ihn dort nicht auswählen. Konkret (Produkt 1): Hersteller-
Sektion hat 4, USP nur 2 (Taizhou + Guangzhou Tusunny fehlen im USP).

## Datenmodell (Ist-Zustand, untersucht)

- `amazon_usp_manufacturers`: eigene id, name, ansprechpartner, datum, notes,
  `manufacturer_id` (nullable FK → `amazon_manufacturers`).
- `amazon_usp_feasibility`: **Machbarkeitsdaten, keyed auf
  `manufacturer_id` → amazon_usp_manufacturers.id** (NICHT amazon_manufacturers).
  Diese Daten dürfen NICHT verloren gehen.
- `ensureDefaultManufacturer(productId)` in amazon.usp.routes.ts legt bei 0 Einträgen
  einen leeren ('') an — wird beim USP-GET aufgerufen.
- DB-weit: 2 usp_manufacturers, beide verknüpft, keine unverknüpften mit Machbarkeit.
- Reverse-Flow existiert: „In Hersteller übernehmen" (USP → amazon_manufacturers,
  setzt manufacturer_id) in UspManufacturers.tsx.

## Entscheidung (Option A)

USP-Bereich **spiegelt** die Hersteller-Sektion. Hersteller werden nur noch in der
Sektion gepflegt; im USP erscheinen sie automatisch. Feasibility-Daten bleiben
erhalten (weiter an amazon_usp_manufacturers gekoppelt — nur additiv synchronisiert).
Kein Umbau des Feasibility-Schemas (Datensicherheit).

## Backend (amazon.usp.routes.ts)

Neue Funktion `syncManufacturersFromHersteller(productId)` ersetzt
`ensureDefaultManufacturer`. Aufruf an denselben Stellen (USP-GET-Pfad). In einer
`db.transaction`:

1. Alle `amazon_manufacturers` des Produkts lesen (id, name, ansprechpartner,
   sort_order).
2. Für jeden Master: passenden `amazon_usp_manufacturers` per `manufacturer_id`
   suchen.
   - **Existiert** → UPDATE `name`, `ansprechpartner`, `sort_order` aus dem Master
     (Renames/Ansprechpartner ziehen nach). `datum`/`notes` (USP-spezifisch)
     unangetastet lassen.
   - **Fehlt** → INSERT (`product_id`, `sort_order`, `name`, `ansprechpartner`,
     `manufacturer_id`). Kein Feasibility-Insert (entsteht bei Bedarf).
3. **Sichere Aufräumung:** `amazon_usp_manufacturers` löschen, die
   `manufacturer_id IS NULL` UND `name = ''` (getrimmt) UND **keine**
   Feasibility-Zeilen haben. Nur echte Leer-Platzhalter — nie Einträge mit Daten.
4. Verknüpfte, deren Master gelöscht wurde (dangling `manufacturer_id`): NICHT
   anfassen (Feasibility bleibt; Name = zuletzt gesynct). Out of Scope.

Idempotent, additiv, keine Feasibility-Zerstörung. Kein PRAGMA foreign_keys,
keine Migration nötig (nur Code). Kein createBackup (Einzel-Sync, additiv).

`loadManufacturers` unverändert (liefert die nun gesyncte Liste inkl. frischer Namen).

## Frontend (UspManufacturers.tsx)

Der USP-Hersteller-Bereich wird zur Spiegelung:
- **„+ Hersteller"-Knopf entfernen** (Header). Hersteller pflegt man in der Sektion.
- Karten: **Name + Ansprechpartner nur Anzeige** (Text statt Input) — Quelle ist
  die Hersteller-Sektion. **Datum bleibt editierbar** (USP-Prüfnotiz, `update.mutate`
  wie bisher).
- **„In Hersteller übernehmen"-Knopf entfernen** (alle sind schon verknüpft).
- **Löschen im USP entfernen** (Verwaltung in der Sektion). `DeleteUspManufacturerDialog`
  wird hier nicht mehr benötigt.
- Ungenutzt werdende Hooks-Aufrufe (`useCreateUspManufacturer`,
  `useUebernehmeUspManufacturer`, `useDeleteUspManufacturer`) aus der Komponente
  entfernen. Die Hooks/Endpoints selbst bleiben bestehen (kein Backend-Abbau).
- Defensiv: sollte doch eine unverknüpfte Legacy-Karte auftauchen
  (`manufacturer_id == null`), Name aus ihrem eigenen Feld anzeigen (kein Crash).

Echte Umlaute. Keine Rückfrage-Dialoge entfallen ausser dem nicht mehr genutzten
Delete.

## Verifikation

1. Backend neu starten. USP von Produkt 1 laden (GET) → `amazon_usp_manufacturers`
   hat danach 4 Einträge (Zhongshan, JingSourcing, Taizhou, Guangzhou), alle mit
   `manufacturer_id` gesetzt.
2. Feasibility-Zeilen von Zhongshan/JingSourcing unverändert vorhanden (Count vor/nach
   gleich).
3. USP-Vorschau/Version-Dropdown zeigt alle 4 Hersteller.
4. Hersteller in der Sektion umbenennen → nach USP-Reload zeigt USP den neuen Namen.
5. Neuer Hersteller in der Sektion → erscheint nach USP-Reload im USP-Dropdown.
6. Gegenprobe Aufräumung: ein Leer-Platzhalter (name='', kein Link, keine Feasibility)
   verschwindet; ein Eintrag mit Feasibility oder Namen bleibt IMMER.

## Nicht im Scope

- Feasibility-Schema auf amazon_manufacturers umschlüsseln
- Hersteller-Löschen aus der Sektion → USP-Kaskade neu bauen
- Backend-Endpoints für USP-Manufacturer-Create/Delete entfernen
