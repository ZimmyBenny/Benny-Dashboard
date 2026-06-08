# Amazon USP — Phase 3: Persönlicher Arbeitsbereich (nicht im PDF)

**Status:** Entwurf — bereit zur Review
**Datum:** 2026-06-08
**Modul:** Amazon USP (Produkt-Detailseite, Sektion „USP")

---

## Ziel

Ein **persönlicher Arbeitsbereich** je Produkt, in dem der Nutzer Recherche und Ideen sammelt —
**ausschließlich für ihn**, nicht Teil des Hersteller-PDFs. Drei Bereiche:

1. **Beispiele & Links** — 4 Freitextfelder: Amazon-, Alibaba-, Pinterest-USP-Beispiel und
   „Bedeutungsvolle Differenzierung".
2. **Finale Kaufgründe** — nummerierte, per Drag sortierbare Liste.
3. **Dateien & Bild-Ideen** — Upload beliebiger Dateien (Bilder mit Vorschau, andere mit Symbol +
   Name), je Datei herunterladen/löschen.

Sitzt als **aufklappbarer Block** (Standard: zugeklappt) unten in der USP-Sektion, klar als
„Persönlich – nicht im PDF" gekennzeichnet.

## Scope

### In Scope
- Migration 075: 4 Spalten an `amazon_usp` + 2 neue Tabellen (`amazon_usp_kaufgruende`,
  `amazon_usp_files`).
- Backend: Meta-PATCH um die 4 Felder erweitern; Kaufgründe CRUD+Reorder; Datei
  Upload/Liste/Serve/Delete; GET `/usp` liefert zusätzlich `kaufgruende` + `files`.
- Frontend: aufklappbarer `UspPersonal`-Block mit Beispiele-Formular, Kaufgründe-Liste,
  Dateien-Bereich.

### Explizit out of Scope
- Irgendetwas davon im PDF (bewusst nur persönlich).
- Phase 4 (Marke aus Markenname-Modul) — eigene Spec.

## Datensicherheit
Rein additiv (4 Spalten + 2 Tabellen + Datei-Verzeichnis). Auto-Backup der Migration genügt. Kein
`PRAGMA foreign_keys` in der Migration. Beim Löschen einer Datei wird die Datei mitentfernt.

## Datenmodell — Migration 075

```sql
ALTER TABLE amazon_usp ADD COLUMN bsp_amazon      TEXT;
ALTER TABLE amazon_usp ADD COLUMN bsp_alibaba     TEXT;
ALTER TABLE amazon_usp ADD COLUMN bsp_pinterest   TEXT;
ALTER TABLE amazon_usp ADD COLUMN differenzierung TEXT;

CREATE TABLE amazon_usp_kaufgruende (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES amazon_products(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  text        TEXT    NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX amazon_usp_kaufgruende_product_idx
  ON amazon_usp_kaufgruende (product_id, sort_order, id);

CREATE TABLE amazon_usp_files (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id    INTEGER NOT NULL REFERENCES amazon_products(id) ON DELETE CASCADE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  file_path     TEXT    NOT NULL,
  original_name TEXT    NOT NULL DEFAULT '',
  mime          TEXT    NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX amazon_usp_files_product_idx
  ON amazon_usp_files (product_id, sort_order, id);
```

## Datei-Ablage
Beliebige Dateien unter `~/.local/share/benny-dashboard/amazon-usp-files/`, UUID-Dateiname mit
der Original-Endung. `original_name` + `mime` in der DB. Limit 20 MB. Pfad-Traversal-sicher.

## Backend — Erweiterung `amazon.usp.routes.ts`

`MetaRow` + GET `/usp` liefern die 4 neuen Felder (SELECT * genügt). GET `/usp` liefert zusätzlich
`kaufgruende` und `files`.

Meta-PATCH erweitern: `bsp_amazon`, `bsp_alibaba`, `bsp_pinterest`, `differenzierung` (je ≤2000,
Leerstring→null) — analog zu `marke`/`hauptfokus`.

| Methode | Pfad | Zweck |
|--------|------|-------|
| POST   | `/products/:id/usp/kaufgruende` | Kaufgrund anlegen, `sort_order=max+1`. |
| PATCH  | `/products/:id/usp/kaufgruende/reorder` | `{ order:number[] }` (VOR `:kId` deklarieren). |
| PATCH  | `/products/:id/usp/kaufgruende/:kId` | `text` (≤500). |
| DELETE | `/products/:id/usp/kaufgruende/:kId` | `204`. |
| POST   | `/products/:id/usp/files` | Multipart `file` (beliebiger Typ), speichert Datei + `original_name`/`mime`, `sort_order=max+1`. |
| GET    | `/products/:id/usp/files/:fId` | Datei ausliefern (`Content-Type: mime`, `Content-Disposition` mit `original_name`). |
| DELETE | `/products/:id/usp/files/:fId` | Zeile + Datei löschen. `204`. |

Fehler: Produkt/Kaufgrund/Datei nicht zum Produkt → 404. Validierung → 400. Zu groß → 400.
Eigener Multer-Uploader für beliebige Dateien (kein MIME-Filter, 20 MB Limit), Dateiname
`<uuid><ext-aus-original>`.

## Frontend

### API (`amazon.api.ts`)
- `UspMeta` um `bsp_amazon`, `bsp_alibaba`, `bsp_pinterest`, `differenzierung` (alle `string | null`)
  erweitern; `UspMetaPatch` ebenfalls.
- Typen `UspKaufgrund { id, product_id, sort_order, text, created_at, updated_at }`,
  `UspFile { id, product_id, sort_order, file_path, original_name, mime, created_at }`.
- `UspPayload` um `kaufgruende: UspKaufgrund[]` + `files: UspFile[]` erweitern.
- Funktionen: `createUspKaufgrund`, `updateUspKaufgrund`, `deleteUspKaufgrund`,
  `reorderUspKaufgruende`, `uploadUspFile`, `deleteUspFile`, `getUspFileObjectUrl`.

### Hooks (`useUsp.ts`)
`useCreateUspKaufgrund`, `useUpdateUspKaufgrund`, `useDeleteUspKaufgrund`,
`useReorderUspKaufgruende`, `useUploadUspFile`, `useDeleteUspFile` — invalidieren den USP-Key.

### Komponenten (`components/amazon/usp/`)
- **`UspPersonal.tsx`** — aufklappbarer Block (Aufklapp-Zustand in `localStorage`, Key
  `amazon.usp.personal.<productId>`, Default zu). Kopf „Persönlich · nur für dich (nicht im PDF)".
  Body: `UspBeispiele` → `UspKaufgruende` → `UspFiles`.
- **`UspBeispiele.tsx`** — 4 Felder (Amazon/Alibaba/Pinterest/Bedeutungsvolle Differenzierung),
  Autosave on-blur via `useUpdateUspMeta` (wie `UspMetaForm`).
- **`UspKaufgruende.tsx` / `UspKaufgrundRow.tsx`** — nummerierte Liste, „+ Kaufgrund", Text-Input
  (on-blur PATCH), Löschen, **Drag-Reorder** (native pointer events, wie `UspPointList`).
- **`UspFiles.tsx`** — Upload (Button + Drag&Drop, beliebiger Typ); Liste: Bilder als Thumbnail
  (`getUspFileObjectUrl`), andere als Datei-Symbol + `original_name`; je Datei „Herunterladen"
  (Object-URL `<a download>`) + Löschen (Bestätigung `DeleteUspFileDialog`).
- **`DeleteUspFileDialog.tsx`** — Confirm vor Datei-Löschung.

### Einbindung
In `UspSection` unter `<UspVersions … />` ein `<UspPersonal productId={productId} />` rendern.

## Fehlerbehandlung
- Load-/Save-Fehler: `AutosaveIndicator` greift bei Mutationen; Upload-Fehler als Inline-Hinweis.
- Datei zu groß / Serve fehlt: Backend 400/404 → Hinweis.

## Tests

### Backend — `integration.amazon_usp.test.ts` (Ergänzung)
- Migration 075: 4 Spalten + 2 Tabellen vorhanden; Cascade (Produkt löschen → kaufgruende/files weg).
- Meta-PATCH setzt die 4 Beispiel-Felder (Trim, Leer→null).
- Kaufgrund POST/PATCH/DELETE + Reorder (sort_order=max+1, fremde IDs → 400/404).
- Datei-Upload (supertest `.attach` mit kleinem Buffer + `original_name`) → Zeile + Datei; GET liefert
  `Content-Type` = mime; DELETE entfernt Zeile + Datei; Cross-Produkt → 404.
- GET `/usp` enthält `kaufgruende` + `files`.

### Frontend
`tsc --noEmit` + `vite build` + manuelles UAT.

### Manuelles UAT
1. „Persönlich"-Block aufklappen (bleibt nach Reload zu/auf je Einstellung).
2. Beispiele-Felder ausfüllen → Autosave, bleibt nach Reload.
3. Kaufgrund hinzufügen, bearbeiten, per Drag sortieren → bleibt; löschen.
4. Datei hochladen (z. B. ein Bild **und** ein PDF) → Bild zeigt Vorschau, PDF zeigt Symbol + Name;
   herunterladen lädt die Originaldatei; löschen entfernt sie.
5. Prüfen: nichts davon erscheint im exportierten Hersteller-PDF.
6. Backend nach Routen-Änderung neu starten.

## Sicherheit
Alle Routen hinter JWT. Datei-Upload größenbegrenzt; Pfad-Traversal-sicheres Lesen/Löschen.
Schema-only-Migration → Auto-Backup.

## Offene Punkte / spätere Phasen
- Phase 4 — Marke automatisch aus dem Markenname-Modul.
- (Optional) Reorder der Dateien — bewusst weggelassen (Reihenfolge = Upload-Reihenfolge).
