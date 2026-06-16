# Amazon „Samples pro Hersteller" — Design

**Datum:** 2026-06-16
**Modul:** Amazon → Hersteller-Detailseite (`/amazon/entwicklung/products/:id/hersteller/:mId`)
**Status:** Entwurf abgenommen, bereit für Implementierungs-Plan

## Problem / Ziel

Benny bekommt vom Hersteller Fotos und Muster (Samples) der einzelnen Chargen.
Er will diese **pro Hersteller** festhalten: Fotos (per AirDrop/Drag/Cmd+V),
Notizen zur Charge, Bewertung/Status, Mängel/Verbesserungspunkte und Kosten — und
über mehrere Samples/Chargen eines Herstellers den Fortschritt vergleichen können.

## Abgrenzung zum bestehenden Sourcing

Es gibt bereits **produkt-bezogene** Samples im „Sourcing"-Bereich der Produktseite
(`amazon_sourcing_samples`: hersteller als Textfeld, kosten/qualitaet/bewertung/
status/notizen, **keine Fotos**). Das bleibt **unverändert**. Die neuen Samples sind
**hersteller-spezifisch** (am Hersteller hinterlegt) und haben **Fotos**. Bewusst
getrennt — kein Umbau am Sourcing.

## Entscheidungen (aus dem Brainstorming)

1. **Ort:** Neuer Bereich „Samples" auf der Hersteller-Detailseite, direkt unter
   „Angebote", als fester (immer sichtbarer) Abschnitt im Stil von „Angebote"
   (die Hersteller-Seite nutzt keine einklappbaren Sektionen).
2. **Felder je Sample:** Bezeichnung, Erhalten-Datum, Fotos (mehrere), Bewertung
   (1–5 Sterne), Status, Favorit/Gewinner, Notizen, Mängel/Verbesserungspunkte,
   Kosten (Betrag + Währung USD/EUR).
3. **Vergleich:** Die Sample-Liste selbst ist der Vergleich (Iterationen
   untereinander mit Bewertung/Status/Favorit). Keine separate Seite-an-Seite-
   Vergleichsansicht (YAGNI).
4. **Fotos:** Upload per Klick, Drag&Drop, **Cmd+V** und AirDrop-Datei reinziehen;
   Thumbnails, Klick = Vollansicht. Muster wie Research-Attachments / Offer-Files.

## Aufbau (UI)

```
Hersteller: Zhongshan Pinsheng Commodities Co., Ltd.
  … Stammdaten + NOTIZEN …
  ANGEBOTE                              [+ Angebot]
  SAMPLES                               [+ Sample]
   ┌─ ⭐ [Sample 1 / Charge A]   Erhalten:[12.06.2026]  ★★★★☆  [Erhalten ▾]   🗑 │
   │  🖼️ 🖼️ 🖼️  [+ Foto]                                                       │
   │  Notizen:               [ … ]                                            │
   │  Mängel/Verbesserung:    [ … ]                                            │
   │  Kosten:  [40,23] [USD ▾]                                                 │
   └───────────────────────────────────────────────────────────────────────────┘
   [+ Sample]
```

- Jedes Sample ist ein eigener Block. Header: Favorit-Stern (toggle) ·
  Bezeichnung (inline) · Erhalten-Datum · Bewertung (1–5 Sterne) · Status-Select ·
  Löschen (mit Bestätigung).
- Darunter: Foto-Leiste (Thumbnails + „+ Foto"), Notizen, Mängel, Kosten.
- Samples per Drag-Griff umsortierbar. Auto-Save (on blur / on change), wie überall.
- „+ Sample" legt ein leeres Sample an.

## Datenmodell (Backend)

Neue Migration `085_amazon_manufacturer_samples.sql` (nächste freie Nummer).
Zwei Tabellen, gespiegelt an `amazon_manufacturer_offers` + `_offer_files`:

```
amazon_manufacturer_samples
  id              INTEGER PK
  manufacturer_id INTEGER NOT NULL REFERENCES amazon_manufacturers(id)
  sort_order      INTEGER NOT NULL DEFAULT 0
  bezeichnung     TEXT    NOT NULL DEFAULT ''
  received_date   TEXT             -- 'YYYY-MM-DD' o.ä., wie offers.datum (nullable)
  rating          INTEGER NOT NULL DEFAULT 0   -- 0–5 Sterne
  status          TEXT    NOT NULL DEFAULT 'erhalten'  -- angefragt|bestellt|erhalten|abgelehnt
  is_favorite     INTEGER NOT NULL DEFAULT 0
  notizen         TEXT
  maengel         TEXT             -- Mängel/Verbesserungspunkte
  kosten          TEXT             -- Betrag als Text (wie sourcing.sample_kosten)
  currency        TEXT    NOT NULL DEFAULT 'USD'  -- USD|EUR
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())

amazon_manufacturer_sample_photos
  id            INTEGER PK
  sample_id     INTEGER NOT NULL REFERENCES amazon_manufacturer_samples(id)
  sort_order    INTEGER NOT NULL DEFAULT 0
  file_path     TEXT    NOT NULL
  original_name TEXT
  mime          TEXT
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
```

- `PRAGMA foreign_keys` **nicht** in der Migration setzen (zentral in `migrate.ts`).
- Keine Bulk-Deletes über Einzel-CRUD hinaus → kein expliziter `createBackup`-Aufruf
  (Migrations-Backup automatisch).

## API-Routen

Im bestehenden Hersteller-Router (`amazon.manufacturers.routes.ts`),
Owner-Kette `ensureProduct` + Hersteller-Existenz wie bei Offers:

- **Samples:** `GET /products/:id/manufacturers/:mId/samples` (inkl. Fotos),
  `POST …/samples`, `PATCH …/samples/:sId`, `DELETE …/samples/:sId`,
  `POST …/samples/reorder`.
- **Fotos:** `POST …/samples/:sId/photos` (multipart, multer single('file'),
  20 MB), `GET …/samples/photos/:photoId` (Blob), `DELETE …/samples/photos/:photoId`,
  `POST …/samples/:sId/photos/reorder`.

Foto-Speicher: eigenes Verzeichnis
`~/.local/share/benny-dashboard/amazon-manufacturer-sample-photos/`, UUID-Dateinamen,
Pfad-Traversal-Schutz — exakt wie Offer-Files.

## Frontend

- `frontend/src/components/amazon/manufacturers/ManufacturerSamples.tsx` — Container
  (lädt Samples via TanStack Query, „+ Sample"), je Sample ein `SampleRow`/`SampleBlock`.
- Foto-Upload-Teil nach Vorbild `ResearchCardAttachments` (Thumbnails, Klick/Drag/
  Cmd+V/AirDrop). Fotos = **nur Bilder** (JPG/PNG/WEBP), max 20 MB; Nicht-Bilder
  werden mit Hinweis abgelehnt.
- API-Funktionen + Typen in `amazon.api.ts`, Hooks in `hooks/amazon/useManufacturers.ts`
  (oder eigene `useManufacturerSamples.ts`).
- Einbinden in `ManufacturerDetailPage.tsx` unter `<ManufacturerOffers>`.
- **Paste-Sicherheit:** Foto-Paste muss `stopImmediatePropagation` nutzen (Standard
  seit Research) — auch wenn die Hersteller-Seite aktuell keinen globalen
  Hauptbild-Listener hat, bleibt es so robust gegen künftige Konflikte.

## UX-Regeln (Projekt-Konventionen)

- Echte Umlaute (Ä/Ö/Ü/ä/ö/ü/ß).
- Bestätigung vor dem Löschen von Samples und Fotos.
- Zähler/Anzahl immer anzeigen (auch 0).
- Auto-Speicherung; keine extra „Speichern"-Buttons.
- Drag-and-drop: native Pointer-Events + setPointerCapture, sort_order persistieren.

## Testkriterien (UAT)

1. Sample anlegen, Bezeichnung + Erhalten-Datum setzen (Auto-Save), umsortieren,
   löschen (mit Bestätigung).
2. Mehrere Fotos per Klick, Drag&Drop und Cmd+V hochladen; Thumbnail + Vollansicht;
   Foto löschen (mit Bestätigung). Hauptbild/anderes bleibt unberührt.
3. Bewertung (Sterne), Status, Favorit-Stern setzen — bleiben nach Reload erhalten.
4. Notizen, Mängel, Kosten (mit USD/EUR) speichern; Reload zeigt gespeicherten Stand.
5. Samples bleiben pro Hersteller getrennt; anderer Hersteller hat eigene Samples.
6. Bestehender Sourcing-Bereich (Produktseite) unverändert.

## Offen / bewusst NICHT enthalten (YAGNI)

- Seite-an-Seite-Vergleichsansicht über mehrere Hersteller/Samples.
- Verknüpfung der Hersteller-Samples mit den Sourcing-Samples.
- Automatische Übernahme „bestes Sample → Gewinner" o.ä.
