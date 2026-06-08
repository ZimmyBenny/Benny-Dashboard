# Amazon USP — Phase 1: Anforderungs-Punkte + Hersteller-Vergleich + PDF-Export

**Status:** Entwurf — bereit zur Review (überarbeitet: Hersteller-Vergleich integriert)
**Datum:** 2026-06-08
**Modul:** Amazon Produkt-Entwicklung — neue Sektion „USP" auf der Produkt-Detailseite

---

## Ziel

Aufklappbare Sektion **„USP"** auf der Produktseite (neben Sourcing/Checkliste, per Drag
sortierbar). Sie vereint zwei Dinge:

1. **Anforderungsliste (Punkte):** eine kanonische Liste nummerierter Punkte (Titel + Freitext +
   Bilder) — die Hersteller-Anfrage. Als **deutsches PDF** pro Hersteller exportierbar.
2. **Hersteller-Vergleich:** beliebig viele Hersteller pro Produkt; pro Punkt × Hersteller die
   Machbarkeit (umsetzbar / teilweise / nicht / offen) + Notiz. Eine **Übersicht** zeigt, welcher
   Hersteller wie viel umsetzen kann. Ersetzt Excel-Vergleiche.

Versions-Verlauf (Phase 2), persönlicher Arbeitsbereich (Phase 3) und KI-Übersetzung/Marke-aus-
Modul (Phase 4) folgen separat.

## Gesamt-Fahrplan (Kontext)

| Phase | Inhalt |
|---|---|
| **1 (diese Spec)** | Punkte (Titel/Text/Bilder, sortierbar) · Hersteller-Vergleich (Matrix + Übersicht) · PDF pro Hersteller (DE) |
| 2 | Versions-Verlauf: Snapshot bei jedem Export, Liste, ansehen + PDF erneut |
| 3 | Persönlicher Arbeitsbereich (Beispiele & Links, Kaufgründe, Bild-Ideen, Dateien) — nicht im PDF |
| 4 | Englisches PDF (Claude-API) · Marke aus Markenname-Modul · ggf. Hersteller-Kontaktdaten/Status-Verlauf |

## Datensicherheit

Rein **additiv**: nur neue Tabellen (Migration 065). Auto-Backup der Migration genügt; kein
`createBackup`, kein destruktiver Schritt, kein `PRAGMA foreign_keys` in der Migration.

## Kern-Designentscheidung

**Punkte gehören zum Produkt** (eine kanonische Anforderungsliste), **Hersteller** sind eine
eigene Einheit pro Produkt, **Machbarkeit** ist eine Matrix (Punkt × Hersteller). So ist der
Vergleich sauber abbildbar und das PDF wird je Hersteller aus denselben Punkten erzeugt.

## Datenmodell — Migration 065

```sql
-- Produkt-weite USP-Meta (gilt fuer alle Hersteller)
CREATE TABLE amazon_usp (
  product_id  INTEGER PRIMARY KEY REFERENCES amazon_products(id) ON DELETE CASCADE,
  marke       TEXT,
  hauptfokus  TEXT,
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Kanonische Anforderungs-Punkte (am Produkt)
CREATE TABLE amazon_usp_points (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES amazon_products(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  title       TEXT    NOT NULL DEFAULT '',
  body        TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX amazon_usp_points_product_idx ON amazon_usp_points (product_id, sort_order, id);

-- Bilder je Punkt
CREATE TABLE amazon_usp_point_images (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  point_id    INTEGER NOT NULL REFERENCES amazon_usp_points(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  file_path   TEXT    NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX amazon_usp_point_images_point_idx ON amazon_usp_point_images (point_id, sort_order, id);

-- Hersteller (am Produkt)
CREATE TABLE amazon_usp_manufacturers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES amazon_products(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  name        TEXT    NOT NULL DEFAULT '',
  datum       TEXT,
  notes       TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX amazon_usp_manufacturers_product_idx ON amazon_usp_manufacturers (product_id, sort_order, id);

-- Machbarkeit (Punkt x Hersteller). Fehlende Zeile = 'offen'.
CREATE TABLE amazon_usp_feasibility (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  point_id        INTEGER NOT NULL REFERENCES amazon_usp_points(id) ON DELETE CASCADE,
  manufacturer_id INTEGER NOT NULL REFERENCES amazon_usp_manufacturers(id) ON DELETE CASCADE,
  status          TEXT    NOT NULL DEFAULT 'offen' CHECK (status IN ('offen','umsetzbar','teilweise','nicht')),
  note            TEXT,
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (point_id, manufacturer_id)
);
CREATE INDEX amazon_usp_feasibility_point_idx ON amazon_usp_feasibility (point_id);
CREATE INDEX amazon_usp_feasibility_manufacturer_idx ON amazon_usp_feasibility (manufacturer_id);
```

**Cascade:** Produkt löschen → Meta, Punkte (→ Bilder, → Feasibility), Hersteller (→ Feasibility).
Bild-**Dateien** werden beim DELETE eines Punktes/Bildes über die Route explizit von der Platte
entfernt (Cascade löscht nur Zeilen).

## Bild-Dateien
Wie Produktbilder: Multer-Disk-Storage, Verzeichnis `~/.local/share/benny-dashboard/amazon-usp`,
UUID-Dateinamen, 5 MB Limit, MIME `image/jpeg|png|webp`, Pfad-Traversal-sicheres Löschen.
Authentifizierte GET-Route streamt die Datei (Frontend lädt als Blob/Object-URL).

## Backend — `amazon.usp.routes.ts`

Neue Datei, in `app.ts` gemountet (`app.use('/api/amazon', amazonUspRoutes)`), hinter JWT, nur
Prepared Statements. Limits: `marke`/Hersteller-`name` ≤200, `hauptfokus` ≤2000, Punkt-`title`
≤200, Punkt-`body` ≤5000, `datum` ≤50, Hersteller-`notes` ≤2000, Feasibility-`note` ≤1000.

**Lazy-Init** bei `GET /products/:id/usp`: legt `amazon_usp`-Zeile an (falls fehlt) und **einen**
Default-Hersteller (falls noch keiner existiert — die Matrix braucht ≥1 Spalte).

| Methode | Pfad | Zweck |
|--------|------|-------|
| GET | `/products/:id/usp` | Lazy-Init; liefert `{ meta, points:[{…,images}], manufacturers:[], feasibility:[] }`. |
| PATCH | `/products/:id/usp` | Meta `marke?`, `hauptfokus?`. |
| POST | `/products/:id/usp/points` | Punkt anlegen, `sort_order=max+1`. |
| PATCH | `/products/:id/usp/points/:pointId` | `title?`, `body?`. |
| DELETE | `/products/:id/usp/points/:pointId` | Punkt + Bilder(+Dateien) + Feasibility. `204`. |
| PATCH | `/products/:id/usp/points/reorder` | `{ order:number[] }`. |
| POST | `/products/:id/usp/points/:pointId/images` | Multipart Upload. |
| PATCH | `/products/:id/usp/points/:pointId/images/reorder` | `{ order:number[] }`. |
| DELETE | `/products/:id/usp/points/:pointId/images/:imageId` | Bild-Zeile + Datei. `204`. |
| GET | `/products/:id/usp/images/:imageId` | Bild streamen. |
| POST | `/products/:id/usp/manufacturers` | Hersteller anlegen, `sort_order=max+1`. |
| PATCH | `/products/:id/usp/manufacturers/:mId` | `name?`, `datum?`, `notes?`. |
| DELETE | `/products/:id/usp/manufacturers/:mId` | Hersteller + dessen Feasibility. `204`. |
| PATCH | `/products/:id/usp/manufacturers/reorder` | `{ order:number[] }`. |
| PUT | `/products/:id/usp/feasibility` | Upsert `{ point_id, manufacturer_id, status?, note? }` (beide müssen zum Produkt gehören). Liefert die Zeile. |

**Fehler:** Produkt/Punkt/Hersteller/Bild nicht zum Produkt → 404. Validierung → 400.

## Frontend

### API (`amazon.api.ts`) — neue Typen + Funktionen
Typen: `UspMeta` (product_id, marke, hauptfokus, updated_at), `UspPointImage`, `UspPoint`
(id, product_id, sort_order, title, body, images), `UspManufacturer` (id, product_id, sort_order,
name, datum, notes), `UspFeasibilityStatus = 'offen'|'umsetzbar'|'teilweise'|'nicht'`,
`UspFeasibility` (id, point_id, manufacturer_id, status, note), `UspPayload`
(`{ meta, points, manufacturers, feasibility }`), plus Patch-Typen.
Funktionen: `fetchUsp`, `updateUspMeta`, `createUspPoint`, `updateUspPoint`, `deleteUspPoint`,
`reorderUspPoints`, `uploadUspPointImage`, `reorderUspPointImages`, `deleteUspPointImage`,
`getUspImageObjectUrl`, `createUspManufacturer`, `updateUspManufacturer`, `deleteUspManufacturer`,
`reorderUspManufacturers`, `setUspFeasibility`.

### Hooks (`useUsp.ts`)
`useUsp(productId)` + Mutationen für alle obigen Operationen, optimistisch wo sinnvoll, sonst
`invalidateQueries` in `onSettled` (wie Brand/Checklist).

### Komponenten (`components/amazon/usp/`)
- **`UspSection.tsx`** — Akkordeon (`SectionHeader`, Icon `lightbulb`, Akzent Blau `#60a5fa`,
  Aufklappen via `localStorage` je Produkt). Reihenfolge im Body: Meta-Formular → Punkte-Editor →
  Hersteller-Leiste → Vergleichs-Matrix → Übersicht → PDF-Export-Leiste.
- **`UspMetaForm.tsx`** — Marke, Hauptfokus (Autosave on-blur).
- **`UspPointList.tsx` / `UspPointRow.tsx`** — Punkte mit Titel/Text/Bildern; Drag-Reorder
  (native pointer events + `setPointerCapture`, Buttons/Inputs als Ausnahme); „+ Punkt"; Löschen
  via `DeleteUspPointDialog`.
- **`UspPointImages.tsx`** — Thumbnails (Object-URL), Upload (Dialog + Drag&Drop), Löschen.
- **`UspManufacturers.tsx`** — Hersteller hinzufügen/umbenennen (inline)/löschen
  (`DeleteUspManufacturerDialog`), Datum/Notizen je Hersteller.
- **`UspMatrix.tsx`** — kompakte Tabelle: Punkt-Titel (Zeilen) × Hersteller (Spalten); Zelle =
  3-Status-Umschalter (umsetzbar/teilweise/nicht, Default offen) + kleines Notiz-Feld/Popover je
  Zelle. Klick setzt Status via `setUspFeasibility` (optimistisch). Horizontaler Scroll bei vielen
  Herstellern.
- **`UspOverview.tsx`** — pro Hersteller eine Zusammenfassung: „X umsetzbar / Y teilweise / Z nicht
  / R offen" von N Punkten; hebt Hersteller mit den meisten „umsetzbar" hervor (bzw. „kann alles",
  wenn alle Punkte umsetzbar). Rein berechnet aus `points` + `feasibility`.
- **`DeleteUspPointDialog.tsx` / `DeleteUspManufacturerDialog.tsx`** — Confirm vor Löschen.

### Status-Farben (Electric Noir)
- umsetzbar → grün `#34d399`, teilweise → orange `#fdba74`, nicht → rot `#fca5a5`,
  offen → neutral `var(--color-on-surface-variant)`.

### Einbindung Produktseite
- `useDetailSectionOrder.ts`: `DEFAULT_ORDER` `['sourcing','checklist']` → `['sourcing','checklist','usp']`.
- `AmazonProductDetailPage.tsx`: `if (id==='usp') return <UspSection productId={…} productName={…} />`.

## PDF-Export — `exportUspPdf.ts`
jsPDF (`pt`, `a4`), **async** (Bilder laden), je Hersteller. Vor Export `blur()` + kurze Wartezeit
+ `refetch`. Inhalt: Kopf „PRODUKTANFRAGE" + Produktname; Meta `Marke` (aus `meta.marke`),
`Hersteller` (Name des gewählten Herstellers), `Datum` (des Herstellers); Block „Hauptfokus";
dann je Punkt „Punkt N – Titel" + Text + Bilder (`addImage`, skaliert, Seitenumbruch). **Machbarkeit
ist NICHT im PDF** (interne Vergleichs-Info). Dateiname
`Produktanfrage_<slug(productName)>_<slug(herstellerName)>_<YYYY-MM-DD>.pdf`.
Auswahl des Herstellers: Dropdown in der PDF-Export-Leiste; Default = erster Hersteller.

## Übersicht-Logik (Frontend, berechnet)
Für jeden Hersteller M: für jeden Punkt P den Status aus `feasibility` (Default 'offen' wenn keine
Zeile). Zähle je Status. „Kann alles" wenn `umsetzbar == Anzahl Punkte` (und Punkte > 0). Sortiere
Hersteller in der Übersicht nach `umsetzbar` desc.

## Fehlerbehandlung
- Load-Fehler: Inline + „Erneut laden". Upload-Fehler: Hinweis am Punkt. Save: `AutosaveIndicator`.
- PDF: fehlschlagendes Bild wird übersprungen, Text bleibt.

## Tests

### Backend — `integration.amazon_usp.test.ts`
- Migration 065: alle 5 Tabellen + Spalten; Cascades (Produkt→alles; Punkt→Bilder+Feasibility;
  Hersteller→Feasibility).
- GET lazy-init: Meta-Zeile + 1 Default-Hersteller; zweiter GET dupliziert nicht; 404 unbekannt.
- Meta-PATCH (Trim, Leerstring→null, zu lang→400).
- Punkt CRUD + Reorder (sort_order=max+1, body>5000→400, Cross-Produkt→404, fremde Reorder-IDs→400).
- Bild Upload/Serve/Reorder/Delete (supertest `.attach` mit 1×1-PNG); Cascade Punkt→Bilder.
- Hersteller CRUD + Reorder.
- Feasibility PUT: Upsert (zweimal selbe Kombi → eine Zeile, Status aktualisiert); ungültiger
  Status→400; Punkt/Hersteller fremd→404; `note`>1000→400.
- Cascade: Hersteller löschen → seine Feasibility weg; Punkt löschen → seine Feasibility weg.

### Frontend
Keine Unit-Test-Infra → `tsc --noEmit` + `vite build` + manuelles UAT.

### Manuelles UAT
1. USP-Sektion auf Produktseite, sortierbar.
2. Marke/Hauptfokus → Autosave.
3. „+ Punkt" Titel/Text + Bild-Upload → bleibt nach Reload.
4. Punkte per Drag tauschen → bleibt.
5. 2. Hersteller anlegen, umbenennen.
6. In der Matrix Status setzen (umsetzbar/teilweise/nicht) + Notiz → bleibt nach Reload.
7. Übersicht zeigt korrekte Zählung „X von Y umsetzbar" je Hersteller.
8. Hersteller löschen → Spalte + dessen Status weg; Punkte/andere Hersteller unberührt.
9. PDF pro Hersteller exportieren → Kopf + nummerierte Punkte + Bilder; **keine** Machbarkeit im PDF.
10. Backend nach Routen-Änderung neu starten; HMR/Cache beachten.

## Sicherheit
Alle Routen hinter JWT; Prepared Statements; Upload MIME/Größe begrenzt; Pfad-Traversal-sicheres
Löschen; Schema-only-Migration → Auto-Backup.

## Offene Punkte / spätere Phasen
- Versionierung (P2, inkl. Bild-Stabilität in alten Versionen).
- Persönlicher Bereich (P3). Englisches PDF via Claude-API + Marke aus Markenname-Modul (P4).
- Optional später: Bild-Reorder per Drag (Phase-1-Anzeige folgt Backend-`sort_order`).
