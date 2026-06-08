# Amazon Hersteller — Angebote erweitern (Währung, Kurs, EUR-Vergleich, Dateien, Aktuellstes, Machbarkeit)

**Status:** Entwurf — vom Nutzer bestätigt („passt")
**Datum:** 2026-06-08
**Modul:** Amazon Hersteller-Bereich (Erweiterung des bestehenden Bereichs)

---

## Ziel

Die Angebote pro Hersteller werden um **Währung** (meist USD) erweitert; ein **Umrechnungskurs
USD→EUR pro Produkt** erlaubt, im **Vergleich einen EUR-Preis** zu zeigen. Pro Angebot lassen sich
**Dateien** (die erhaltenen Angebote) hochladen, und genau **ein Angebot je Hersteller** als
**„aktuellstes"** markieren. Im Vergleich erscheint zusätzlich die **Machbarkeit** (Aufschlüsselung
aus dem USP-Vergleich) je Hersteller.

## Entscheidungen (aus der Diskussion)
- **Währungen:** USD + EUR (Dropdown pro Angebot, Standard **USD**).
- **Kurs:** ein Feld **„1 USD = X €"** pro Produkt (im Hersteller-Bereich-Kopf), jederzeit änderbar.
- **EUR-Preis:** nur in der **Vergleichstabelle** (USD × Kurs; EUR direkt; ohne Kurs → „—").
  Sortierung/„günstigstes" jetzt nach **EUR-Preis**.
- **Aktuellstes:** **exklusiv pro Hersteller** (`is_latest`; beim Setzen verlieren andere Angebote
  desselben Herstellers die Markierung). „Aktuell"-Badge.
- **Dateien:** **beliebig viele pro Angebot** (jeder Typ, bis 20 MB), Download/Löschen.
- **Machbarkeit:** **Aufschlüsselung** „X umsetzbar · Y teilweise · Z nicht · W offen (von N)",
  **nur in der Vergleichstabelle**; Quelle = USP-Machbarkeit des verknüpften USP-Herstellers; bei
  nicht-übernommenen Herstellern → „—".

## Datensicherheit
Rein additiv: zwei neue Spalten, zwei neue Tabellen. Migrations-Auto-Backup greift. Datei-Uploads
und Einzel-Updates sind keine Bulk-Operationen → kein `createBackup` nötig. Bestehende Angebote
bekommen `currency='USD'` (Default) — entspricht „meist Dollar"; der Nutzer kann je Angebot auf EUR
umstellen.

---

## Datenmodell

### Migration 079 — Angebot: Währung + Aktuellstes
```sql
ALTER TABLE amazon_manufacturer_offers
  ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','EUR'));
ALTER TABLE amazon_manufacturer_offers
  ADD COLUMN is_latest INTEGER NOT NULL DEFAULT 0 CHECK (is_latest IN (0,1));
```

### Migration 080 — Kurs pro Produkt
```sql
CREATE TABLE amazon_manufacturer_settings (
  product_id   INTEGER PRIMARY KEY REFERENCES amazon_products(id),
  usd_eur_rate TEXT,
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
```
`usd_eur_rate` = Text (z. B. „0,92"), Bedeutung **1 USD = X EUR**.

### Migration 081 — Dateien je Angebot (Phase B)
```sql
CREATE TABLE amazon_manufacturer_offer_files (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  offer_id      INTEGER NOT NULL REFERENCES amazon_manufacturer_offers(id),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  file_path     TEXT    NOT NULL,
  original_name TEXT,
  mime          TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
```
Kein `PRAGMA foreign_keys` in Migrationen.

---

## Backend (`amazon.manufacturers.routes.ts`)

### Phase A — Währung, Kurs, Aktuellstes
- **GET** `/products/:id/manufacturers`: Payload zusätzlich `settings: { usd_eur_rate: string | null }`
  (lazy anlegen wie `getOrCreateSourcing`). Jede `OfferRow` enthält nun `currency`, `is_latest`
  (über `SELECT *` automatisch).
- **Offer-PATCH** `/manufacturers/:mId/offers/:oId`: zusätzlich
  - `currency` → nur `'USD'`/`'EUR'` zulässig, sonst 400.
  - `is_latest` → 0/1; bei `1` danach `UPDATE amazon_manufacturer_offers SET is_latest = 0 WHERE
    manufacturer_id = ? AND id != ?` (exklusiv je Hersteller). In einer Transaktion.
- **Neue Route** `PATCH /products/:id/manufacturers/settings` Body `{ usd_eur_rate }` → Text trimmen
  (leer→null, max 50), `updated_at` setzen, lazy anlegen falls nötig, gibt `{ settings }` zurück.

### Phase B — Dateien je Angebot
- Multer-Disk-Storage, Ordner `amazon-manufacturer-offer-files` (UUID-Dateinamen), 20-MB-Limit,
  Path-Traversal-Guard (wie `fileUpload`/`deleteFilesFile` in `amazon.usp.routes.ts`).
- `OfferRow` im Payload bekommt `files: OfferFileRow[]` (sortiert `sort_order, id`).
- Routen (Ownership: Produkt→Hersteller→Angebot→Datei):
  - `POST /products/:id/manufacturers/:mId/offers/:oId/files` (multipart `file`) → 201 `{ file }`.
  - `GET /products/:id/manufacturers/:mId/offers/:oId/files/:fId` → Stream (Content-Disposition
    inline, RFC-5987 für Umlaute, wie USP-Files).
  - `DELETE /products/:id/manufacturers/:mId/offers/:oId/files/:fId` → Datei + Zeile löschen, 204.

### Phase C — Machbarkeit aus USP
- **GET**-Payload: jeder Hersteller bekommt
  `machbarkeit: { umsetzbar: number; teilweise: number; nicht: number; offen: number; total: number } | null`.
  Berechnung:
  - Verknüpften USP-Hersteller finden: `SELECT id FROM amazon_usp_manufacturers WHERE manufacturer_id = ? ORDER BY id LIMIT 1`. Keiner → `machbarkeit = null`.
  - `total` = `SELECT COUNT(*) FROM amazon_usp_points WHERE product_id = ?`. Wenn 0 → `null`.
  - `umsetzbar/teilweise/nicht` = Zählung in `amazon_usp_feasibility WHERE manufacturer_id =
    <uspManId> AND status = ?` (nur Punkte des Produkts; per JOIN auf `amazon_usp_points`).
  - `offen` = `total - umsetzbar - teilweise - nicht` (fehlende Zeilen + explizite „offen" zählen
    als offen).

---

## Frontend

### Phase A
- **API** (`amazon.api.ts`): `ManufacturerOffer` += `currency: 'USD' | 'EUR'`, `is_latest: number`.
  `ManufacturersPayload` += `settings: { usd_eur_rate: string | null }`. `OfferPatch` += `currency`,
  `is_latest`. Neue Funktion `updateManufacturerSettings(productId, { usd_eur_rate })`.
- **Hooks** (`useManufacturers.ts`): `useUpdateManufacturerSettings`. Helfer `parseRate` (wie
  `parsePreis`). `eurPreis(offer, rate)` als reine Funktion:
  `currency==='EUR' ? parsePreis(preis) : (preis & rate vorhanden ? parsePreis(preis)*rate : null)`.
- **`ManufacturerOffers.tsx`**: je Zeile **Währungs-Dropdown** (USD/EUR) und **„Aktuell"-Stern**
  (Toggle → `update.mutate({ mId, oId, patch: { is_latest: next } })`; gefülltes Stern-Icon wenn
  `is_latest`).
- **`ManufacturersSection.tsx`** (Kopf): Eingabefeld **„1 USD = ___ €"** (Wert `settings.usd_eur_rate`,
  `onBlur` → `useUpdateManufacturerSettings`).
- **`ManufacturerComparison.tsx`**: neue Spalte **EUR-Preis** (`eurPreis` formatiert „xx,xx €" oder
  „—"); Sortierung + günstigstes-Hervorheben nach EUR; „Aktuell"-Badge an Zeilen mit `is_latest`.
  `parsePreis`/`eurPreis`/Rate über Props bzw. aus den Daten.

### Phase B
- **API**: Typ `OfferFile` (id, offer_id, sort_order, file_path, original_name, mime, created_at);
  `ManufacturerOffer` += `files: OfferFile[]`. Funktionen `uploadOfferFile`, `getOfferFileObjectUrl`,
  `deleteOfferFile`.
- **Hooks**: `useUploadOfferFile`, `useDeleteOfferFile` (invalidate Manufacturers-Key).
- **`ManufacturerOffers.tsx`**: je Angebot ein kompakter **Datei-Bereich** (Liste mit
  Download/Löschen + „Datei hochladen") — Muster aus `UspFiles.tsx` (Object-URL-Revoke,
  Bestätigung vor Löschen).

### Phase C
- **API**: `Manufacturer` += `machbarkeit: { umsetzbar; teilweise; nicht; offen; total } | null`.
- **`ManufacturerComparison.tsx`**: neue Spalte **Machbarkeit** — `machbarkeit` formatiert
  „8 ✓ · 2 ~ · 1 ✗ · 1 offen" (oder Worte) bzw. „—" wenn `null`. Pro Hersteller gleich (wiederholt
  sich über dessen Angebots-Zeilen).

---

## Fehlerbehandlung
- Ungültige `currency`/`is_latest` → 400. Kurs nicht parsebar → EUR-Spalte „—" (kein Crash).
- Datei > 20 MB / kein File → 400. Fremde IDs (Produkt/Hersteller/Angebot/Datei) → 404.
- Hersteller ohne USP-Verknüpfung oder Produkt ohne USP-Punkte → `machbarkeit = null` → „—".

## Tests

### Backend (`integration.amazon_manufacturers.test.ts` erweitern)
- Offer-PATCH `currency`: 'USD'/'EUR' ok, anderes → 400.
- `is_latest`: Setzen auf 1 entmarkiert anderes Angebot desselben Herstellers (exklusiv);
  Angebote anderer Hersteller bleiben unberührt.
- Settings: PATCH `usd_eur_rate` setzt/leert; GET liefert `settings`.
- (Phase B) Datei-Upload: anlegen + GET liefert eingebettete `files`; Löschen entfernt Zeile+Datei;
  Datei eines fremden Angebots → 404.
- (Phase C) `machbarkeit`: für übernommenen Hersteller mit gesetzter Feasibility korrekte Zählung
  (umsetzbar/teilweise/nicht/offen, total = Punkteanzahl); ohne USP-Verknüpfung → null; Produkt
  ohne Punkte → null.

### Frontend
`tsc --noEmit` + `vite build` grün; manuelles UAT.

### Manuelles UAT
1. Angebot: Währung auf USD, Preis „1000"; Kurs „1 USD = 0,92 €" oben setzen → im Vergleich
   EUR-Spalte „920,00 €".
2. Zweites Angebot in EUR → EUR-Spalte = Preis direkt; günstigstes (nach EUR) hervorgehoben.
3. „Aktuell"-Stern bei einem Angebot setzen → anderes desselben Herstellers verliert die Markierung;
   Badge im Vergleich.
4. Datei an einem Angebot hochladen → erscheint, Download/Löschen (mit Bestätigung) funktioniert.
5. Hersteller, der aus USP übernommen wurde und Machbarkeit gesetzt hat → Vergleich zeigt
   „X umsetzbar · …"; direkt angelegter Hersteller → „—".

## Sicherheit
Alle Routen hinter JWT; nur Prepared Statements; Path-Traversal-Guards beim Datei-Handling;
Schema-Migrationen → Auto-Backup.

## Phasen
- **A:** Migr. 079+080; Währung/Kurs/Aktuellstes (Backend + Frontend + EUR-Spalte).
- **B:** Migr. 081; Datei-Upload je Angebot.
- **C:** Machbarkeits-Spalte (read-only USP-Join, keine Migration).
