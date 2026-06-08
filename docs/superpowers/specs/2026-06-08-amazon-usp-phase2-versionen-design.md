# Amazon USP — Phase 2: Versions-Verlauf (PDF-Vorschau + gespeicherte Versionen)

**Status:** Entwurf — bereit zur Review
**Datum:** 2026-06-08
**Modul:** Amazon USP (Produkt-Detailseite, Sektion „USP")

---

## Ziel

Beim PDF-Export soll der Nutzer das Ergebnis erst **als Vorschau** sehen und es bei Bedarf **als
Version speichern**. Gespeicherte Versionen werden in einer Liste geführt und lassen sich jederzeit
wieder ansehen/herunterladen. So bleibt nachvollziehbar, **was wann an welchen Hersteller** ging.

Kein automatisches Speichern bei jedem Export — speichern ist immer eine **bewusste Aktion**.

## Kern-Designentscheidung

**Eine Version ist die fertige PDF-Datei selbst** (Ansatz A). Beim „Als Version speichern" lädt das
Frontend genau das PDF hoch, das es gerade erzeugt hat; das Backend speichert die Datei. Damit sind
**Bilder/Logo automatisch eingefroren** (sie stecken im PDF) — kein separates Kopieren von Bildern,
kein JSON-Schnappschuss. „Ansehen/erneut laden" = genau diese Datei ausliefern.

## Scope

### In Scope
- Neue Tabelle `amazon_usp_versions` (Migration 074) + PDF-Datei-Ablage.
- Backend-Routen: Version speichern (Upload), Liste, PDF ausliefern, Version löschen.
- Frontend: Export-Ablauf umbauen auf **Vorschau (neuer Tab) · Herunterladen · Als Version speichern**;
  neue **Versions-Liste** in der USP-Sektion (ansehen/herunterladen/löschen).
- `exportUspPdf` liefert künftig ein `Blob` zurück statt direkt herunterzuladen.

### Explizit out of Scope
- Wiederherstellen einer alten Version als aktuellen Stand (bewusst nicht).
- JSON-Schnappschuss / Bild-Kopien (Ansatz B verworfen).
- Phase 3 (persönlicher Bereich) und Phase 4 (Marke aus Modul) — eigene Specs.

## Datensicherheit
Nur neue Tabelle + neues Datei-Verzeichnis → rein additiv. Auto-Backup der Migration genügt. PDFs
liegen außerhalb der DB als Dateien; beim Löschen einer Version wird die Datei mit entfernt.

## Datenmodell — Migration 074

```sql
CREATE TABLE amazon_usp_versions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id        INTEGER NOT NULL REFERENCES amazon_products(id) ON DELETE CASCADE,
  manufacturer_name TEXT    NOT NULL DEFAULT '',   -- Snapshot des Namens zum Speicher-Zeitpunkt
  file_path         TEXT    NOT NULL,              -- Dateiname der gespeicherten PDF
  created_at        INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX amazon_usp_versions_product_idx
  ON amazon_usp_versions (product_id, created_at, id);
```

Hinweis: Es wird der **Hersteller-Name als Text** gespeichert (kein FK auf den Hersteller), damit
die Version ihr Label behält, auch wenn der Hersteller später umbenannt/gelöscht wird.

## Datei-Ablage
PDFs unter `~/.local/share/benny-dashboard/amazon-usp-versions/`, UUID-Dateinamen mit `.pdf`.
Pfad-Traversal-sicheres Löschen analog zu den Bild-Routen.

## Backend — Erweiterung `amazon.usp.routes.ts`

Eigener Multer-Uploader für PDFs (`application/pdf`, Limit 25 MB) — getrennt vom Bild-Uploader.

| Methode | Pfad | Zweck |
|--------|------|-------|
| POST   | `/products/:id/usp/versions` | Multipart: `file` (PDF) + Feld `manufacturer_name`. Speichert Datei + Zeile. `201 { version }`. |
| GET    | `/products/:id/usp/versions` | Liste `{ versions: [{ id, manufacturer_name, created_at }] }`, sortiert `created_at DESC, id DESC`. |
| GET    | `/products/:id/usp/versions/:vId/pdf` | Liefert die PDF-Datei (`Content-Type: application/pdf`, `Content-Disposition: inline`). |
| DELETE | `/products/:id/usp/versions/:vId` | Zeile + Datei löschen. `204`. |

**Fehler:** Produkt/Version nicht gefunden → 404. Falscher MIME/zu groß → 400. Version gehört nicht
zum Produkt → 404.

## Frontend

### `exportUspPdf` — Rückgabe statt Download
`exportUspPdf(...)` ruft **nicht mehr** `doc.save()`, sondern liefert
`{ blob: Blob; filename: string }` zurück (`doc.output('blob')`). Die Aufrufer entscheiden dann:
Vorschau, Herunterladen oder Hochladen.

### API (`amazon.api.ts`)
- Typ `UspVersion { id: number; product_id: number; manufacturer_name: string; created_at: number }`.
- `fetchUspVersions(productId)` → `UspVersion[]`.
- `saveUspVersion(productId, manufacturerName, blob)` → POST multipart, `UspVersion`.
- `getUspVersionPdfObjectUrl(productId, vId)` → authentifizierter Blob-Download → Object-URL
  (wie `getUspImageObjectUrl`), zum Öffnen im neuen Tab.
- `deleteUspVersion(productId, vId)`.

### Hooks (`useUsp.ts`)
- `useUspVersions(productId)` (`useQuery`, Key `['amazon','products',productId,'usp','versions']`).
- `useSaveUspVersion(productId)`, `useDeleteUspVersion(productId)` — invalidieren den Versions-Key.

### `UspSection` — Export-Leiste umbauen
Gemeinsamer Helfer `buildPdf()`: aktives Feld `blur()` + kurze Wartezeit + `refetch`, gewählten
Hersteller + dessen „im PDF"-Punkte filtern, `exportUspPdf(...)` aufrufen → `{ blob, filename,
manufacturerName }`. Daraus drei Aktionen:
- **„Vorschau"** → `window.open(URL.createObjectURL(blob))` (PDF im neuen Tab; Download dort möglich).
- **„Herunterladen"** → `<a download={filename}>` mit der Blob-URL klicken.
- **„Als Version speichern"** → `useSaveUspVersion` mit `manufacturerName` + Blob.

Der bestehende Hersteller-Dropdown bleibt; er bestimmt weiterhin, für welchen Hersteller das PDF
erzeugt wird.

### Neue Komponente `UspVersions.tsx`
Unter der Export-Leiste: Überschrift „Versionen" + Liste (neueste zuerst). Pro Zeile:
- Hersteller-Name + Datum (`created_at`, `de-DE`).
- **„Ansehen"** → `getUspVersionPdfObjectUrl` → `window.open`.
- **„Herunterladen"** → Object-URL als `<a download>`.
- **„Löschen"** → `useDeleteUspVersion` (mit Bestätigungs-Dialog `DeleteUspVersionDialog`).
Leerer Zustand: dezenter Hinweis „Noch keine Versionen gespeichert."

## Fehlerbehandlung
- Upload-/Load-Fehler: Inline-Hinweis in der Versions-Liste, `AutosaveIndicator` greift bei Mutationen.
- „Ansehen/Herunterladen" einer fehlenden Datei → Backend 404 → Hinweis im UI.

## Tests

### Backend — `integration.amazon_usp.test.ts` (Ergänzung)
- Migration 074: Tabelle + Spalten + Cascade (Produkt löschen → Versionen weg).
- POST Version (supertest `.attach` mit kleinem PDF-Buffer + `manufacturer_name`) → Zeile angelegt,
  Datei im Verzeichnis.
- GET Liste liefert die Version (Felder id/manufacturer_name/created_at), neueste zuerst.
- GET `/versions/:vId/pdf` liefert `application/pdf`.
- DELETE entfernt Zeile (+ Datei); Cross-Produkt → 404.

### Frontend
`tsc --noEmit` + `vite build` + manuelles UAT.

### Manuelles UAT
1. Hersteller wählen → **„Vorschau"** → PDF öffnet im neuen Tab.
2. **„Als Version speichern"** → Version erscheint in der Liste (Hersteller + Datum).
3. Bild eines Punktes ändern, neue Version speichern → die **alte Version zeigt weiterhin die
   alten Bilder** (eingefroren), die neue die neuen.
4. **„Ansehen"** einer alten Version → korrektes PDF im neuen Tab. **„Herunterladen"** lädt es.
5. **„Löschen"** entfernt die Version (nach Bestätigung).
6. Backend nach Routen-Änderung neu starten.

## Sicherheit
Alle Routen hinter JWT. PDF-Upload auf `application/pdf` + Größe begrenzt. Pfad-Traversal-sicheres
Lesen/Löschen. Schema-only-Migration → Auto-Backup.

## Offene Punkte / spätere Phasen
- Phase 3 — persönlicher Arbeitsbereich (Beispiele & Links, Finale Kaufgründe, ein gemeinsamer
  Dateien-/Bild-Ideen-Upload).
- Phase 4 — Marke automatisch aus dem Markenname-Modul.
