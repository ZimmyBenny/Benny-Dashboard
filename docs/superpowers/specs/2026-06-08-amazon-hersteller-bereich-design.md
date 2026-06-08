# Amazon — Hersteller-Bereich + „In Hersteller übernehmen"

**Status:** Entwurf — vom Nutzer bestätigt („mach mal")
**Datum:** 2026-06-08
**Module:** Amazon (Produkt-Detailseite) — neuer Bereich „Hersteller"; Integration in USP + Sourcing

---

## Ziel

Eine zentrale **Hersteller-Stammliste pro Produkt** als eigener Bereich, in dem jeder Hersteller
mit Stammdaten (Name, Ansprechpartner, Adresse, E-Mail, Webseite, Notizen) und beliebig vielen
**Angeboten/Einkaufspreisen** gepflegt wird, samt **Preis-Vergleichsübersicht** (günstigstes
hervorgehoben). Aus dem **USP-Hersteller** lässt sich ein Hersteller per Button in diese Stammliste
**übernehmen** — dabei wird zusätzlich eine vorausgefüllte **Sourcing-Muster-Zeile** angelegt.

## Entscheidungen (aus der Diskussion)

- **Zentrale Stammliste:** Der neue Hersteller-Bereich ist die Master-Liste. USP-Hersteller
  verlinken darauf (`manufacturer_id`).
- **Button „In Hersteller übernehmen"** am USP-Hersteller: legt **beides** an — einen Stammeintrag
  (Name + Ansprechpartner) **und** eine Sourcing-Muster-Zeile (Hersteller-Name; Ansprechpartner in
  den Notizen). Danach „✓ übernommen" (idempotent, kein Doppelt-Anlegen).
- **Hersteller-Stammdaten:** Name, Ansprechpartner, **Adresse, E-Mail, Webseite, Notizen**
  (kein Telefon).
- **Angebote:** mehrere pro Hersteller, Felder **Menge/Variante, Preis, MOQ, Lieferzeit, Datum,
  Notiz**; Vergleichstabelle hebt das günstigste hervor.
- **Sourcing-Muster ↔ Stammliste fest verknüpfen:** bewusst **später** (eigene Phase), nicht jetzt.

## Scope

### In Scope
- Neuer per-Produkt-Bereich „Hersteller" (eigene verschiebbare Sektion auf der Produkt-Detailseite).
- Hersteller-CRUD (Stammdaten) + Angebot-CRUD (mehrere je Hersteller, sortierbar) + Vergleichstabelle.
- USP-Hersteller: nullable Verknüpfung `manufacturer_id` + Button „In Hersteller übernehmen", der
  Stammeintrag **und** Sourcing-Muster anlegt und den Zustand „übernommen" anzeigt.

### Explizit out of Scope (für später)
- Sourcing-Muster fest an die Stammliste binden (Dropdown statt freiem Text).
- „Finaler Hersteller" markieren (Gewinner).
- Staffelpreise/Preis-Tiers, Währungsrechnung, Incoterms.

## Datensicherheit
Rein additiv: zwei neue Tabellen + eine nullable Spalte. Auto-Backup der Migration greift. Der
Übernehmen-Button macht nur **einzelne** Inserts (ein Stammeintrag, eine Sourcing-Muster-Zeile) —
keine Bulk-Operation, kein manuelles `createBackup` nötig. Keine bestehenden Daten werden verändert
oder gelöscht.

---

## Datenmodell

### Migration `077_amazon_manufacturers.sql`
```sql
CREATE TABLE amazon_manufacturers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id      INTEGER NOT NULL REFERENCES amazon_products(id),
  sort_order      INTEGER NOT NULL DEFAULT 0,
  name            TEXT    NOT NULL DEFAULT '',
  ansprechpartner TEXT,
  adresse         TEXT,
  email           TEXT,
  webseite        TEXT,
  notizen         TEXT,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE amazon_manufacturer_offers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  manufacturer_id INTEGER NOT NULL REFERENCES amazon_manufacturers(id),
  sort_order      INTEGER NOT NULL DEFAULT 0,
  menge_variante  TEXT,
  preis           TEXT,
  moq             TEXT,
  lieferzeit      TEXT,
  datum           TEXT,
  notiz           TEXT,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);
```
(Kein `PRAGMA foreign_keys` in der Migration — wird zentral in `migrate.ts` gesteuert.)

### Migration `078_amazon_usp_manufacturer_link.sql`
```sql
ALTER TABLE amazon_usp_manufacturers
  ADD COLUMN manufacturer_id INTEGER REFERENCES amazon_manufacturers(id);
```
Nullable; gesetzt, sobald ein USP-Hersteller übernommen wurde.

**Preis-Format:** `preis` ist Text (wie `sample_kosten` im Sourcing), damit der Nutzer frei tippen
kann (z. B. „12,50 €"). Für die „günstigstes hervorheben"-Logik wird der Zahlenwert bestmöglich
geparst (Komma→Punkt, nicht-numerische Zeichen entfernt); nicht parsebare Preise werden bei der
Hervorhebung ignoriert.

---

## Backend

### Neue Routen-Datei `backend/src/routes/amazon.manufacturers.routes.ts`
Gemountet in `app.ts` unter `/api/amazon` (wie die anderen Amazon-Routen).

- `GET /products/:id/manufacturers` → Payload `{ manufacturers: ManufacturerWithOffers[] }`,
  wobei jeder Hersteller seine `offers: Offer[]` (nach `sort_order, id`) enthält. Hersteller nach
  `sort_order, id`. 404 wenn Produkt unbekannt.
- `POST /products/:id/manufacturers` (Body optional `{ name }`) → legt Hersteller an
  (`sort_order = MAX+1`), `201 { manufacturer }` (mit leerem `offers`).
- `PATCH /products/:id/manufacturers/:mId` → Felder `name, ansprechpartner, adresse, email,
  webseite, notizen` (jeweils optional, getrimmt; leer→null außer `name`→''). `updated_at` setzen.
- `DELETE /products/:id/manufacturers/:mId` → löscht Hersteller **und seine Angebote** (Offers
  zuerst löschen, dann Hersteller). Außerdem bei verknüpften USP-Herstellern `manufacturer_id` auf
  NULL setzen (Verknüpfung lösen, USP-Hersteller bleibt bestehen). 204.
- `PATCH /products/:id/manufacturers/reorder` (Body `{ order: number[] }`) → Hersteller umsortieren
  (nur eigene IDs; sonst 400).
- `POST /products/:id/manufacturers/:mId/offers` → Angebot anlegen (`sort_order = MAX+1`),
  `201 { offer }`.
- `PATCH /products/:id/manufacturers/:mId/offers/:oId` → Felder `menge_variante, preis, moq,
  lieferzeit, datum, notiz`. `updated_at` setzen.
- `DELETE /products/:id/manufacturers/:mId/offers/:oId` → 204.
- `PATCH /products/:id/manufacturers/:mId/offers/reorder` (Body `{ order: number[] }`).

Alle Routen: Integer-Validierung der Params, Produkt-/Hersteller-Ownership prüfen (Hersteller muss
zum Produkt gehören, Angebot zum Hersteller), nur Prepared Statements, Längen-Limits analog
bestehender Routen (z. B. Textfelder auf ~2000 Zeichen begrenzen wo sinnvoll).

### USP-Übernahme (Phase B) — Erweiterung von `amazon.usp.routes.ts`
- GET-USP-Payload: `manufacturer_id` der USP-Hersteller wird mitgeliefert (SELECT * liefert die neue
  Spalte automatisch; Typ ergänzen).
- Neue Route `POST /products/:id/usp/manufacturers/:mId/uebernehmen`:
  1. USP-Hersteller laden (Ownership). Wenn `name` leer → 400 `{ error: 'kein name' }`.
  2. Wenn bereits `manufacturer_id` gesetzt → 409 `{ error: 'bereits übernommen' }` (idempotent,
     kein Doppelt-Anlegen).
  3. Sonst: Stammeintrag in `amazon_manufacturers` anlegen (`name`, `ansprechpartner` aus dem
     USP-Hersteller; `sort_order = MAX+1`). `manufacturer_id` am USP-Hersteller setzen.
  4. Sourcing sicherstellen (`amazon_sourcing`-Zeile lazy anlegen falls nötig, wie im Sourcing-GET)
     und eine `amazon_sourcing_samples`-Zeile anlegen: `hersteller = name`, `notizen =
     'Ansprechpartner: <ansprechpartner>'` (nur wenn Ansprechpartner vorhanden, sonst leer),
     `sort_order = MAX+1`.
  5. `201 { manufacturer, usp_manufacturer }` (oder `{ manufacturer_id }`), damit das Frontend den
     Zustand aktualisieren kann.

Hinweis: Schritt 3+4 in **einer** `db.transaction(...)`-Klammer ausführen, damit kein halber Zustand
entsteht (Stammeintrag ohne Verknüpfung o. ä.).

---

## Frontend

### API (`frontend/src/api/amazon.api.ts`)
- Typen `Manufacturer` (Stammdaten + `offers: ManufacturerOffer[]`), `ManufacturerOffer`,
  `ManufacturersPayload`.
- Funktionen: `fetchManufacturers`, `createManufacturer`, `updateManufacturer`,
  `deleteManufacturer`, `reorderManufacturers`, `createOffer`, `updateOffer`, `deleteOffer`,
  `reorderOffers`, sowie (Phase B) `uebernehmeUspManufacturer(productId, mId)`.
- USP-Typ `UspManufacturer` um `manufacturer_id: number | null` erweitern.

### Hooks (`frontend/src/hooks/amazon/useManufacturers.ts`)
- `useManufacturers(productId)` (Query) + Mutationen analog zu `useSourcing`/`useUsp`
  (`onSettled`-Invalidierung des Manufacturers-Query-Keys). Phase B: `useUebernehmeUspManufacturer`
  invalidiert **USP-** und **Manufacturers-** und **Sourcing-**Query-Keys.

### Sektion (`frontend/src/components/amazon/manufacturers/ManufacturersSection.tsx` + Unterkomponenten)
- `ManufacturersSection` — Wrapper mit `SectionHeader` (Muster wie `SourcingSection`), lädt Daten,
  rendert Liste + Vergleich + „Hersteller hinzufügen".
- `ManufacturerCard` — Stammdaten-Inline-Edit (Name, Ansprechpartner, Adresse [mehrzeilig], E-Mail,
  Webseite, Notizen), Löschen (mit Bestätigungsdialog — Projektregel „Confirm vor Löschen"),
  sortierbar (native Pointer-Events wie bei USP-Punkten).
- `ManufacturerOffers` — Angebots-Liste je Hersteller: Zeilen mit Menge/Variante, Preis, MOQ,
  Lieferzeit, Datum, Notiz; hinzufügen/löschen/sortieren.
- `ManufacturerComparison` — Tabelle über **alle** Angebote aller Hersteller des Produkts:
  Spalten Hersteller · Menge/Variante · Preis · MOQ · Lieferzeit · Datum; nach geparstem Preis
  aufsteigend sortiert; günstigste Zeile hervorgehoben (z. B. grüner Akzent). Leerer Zustand:
  Hinweistext, wenn noch keine Angebote.

### Sektion einhängen
- `useDetailSectionOrder.ts`: `DetailSectionId` um `'manufacturers'` erweitern, `DEFAULT_ORDER` am
  Ende ergänzen (`['sourcing','checklist','usp','manufacturers']`). Bestehende gespeicherte
  Reihenfolgen (localStorage) müssen weiter funktionieren: fehlt `'manufacturers'` in einer
  gespeicherten Order, wird es ans Ende ergänzt (Merge-Logik prüfen/anpassen).
- `AmazonProductDetailPage.tsx`: `ManufacturersSection` importieren und im `DraggableSectionList`
  unter der ID `'manufacturers'` rendern.

### USP-Button (Phase B) — `UspManufacturers.tsx`
- Pro USP-Hersteller-Karte ein Button **„In Hersteller übernehmen"**.
- `manufacturer_id == null` **und** Name nicht leer → Button aktiv; Klick ruft
  `useUebernehmeUspManufacturer`. Bei leerem Namen → Button deaktiviert (Tooltip „erst Name
  eingeben").
- `manufacturer_id != null` → Button zeigt **„✓ übernommen"** (deaktiviert).
- Echte Umlaute in allen sichtbaren Texten.

---

## Fehlerbehandlung
- Unbekanntes Produkt/Hersteller/Angebot → 404. Ungültige `order`/Body → 400.
- Übernehmen ohne Namen → 400; bereits übernommen → 409 (Frontend zeigt einfach „übernommen").
- Preis nicht parsebar → wird bei der Hervorhebung ignoriert (kein Crash), Text bleibt sichtbar.

## Tests

### Backend (`backend/test/integration.amazon_manufacturers.test.ts`)
- GET legt nichts an, liefert leere Liste; 404 unbekanntes Produkt.
- Hersteller-CRUD: anlegen/patchen (Felder getrimmt, leer→null, name→''), löschen entfernt
  Hersteller **und** seine Angebote; reorder nur eigene IDs (sonst 400).
- Angebot-CRUD: anlegen/patchen/löschen; reorder; Angebot fremden Herstellers → 404.
- Ownership: Hersteller/Angebot eines anderen Produkts → 404.

### Backend USP-Übernahme (ergänzt `integration.amazon_usp.test.ts` oder eigene Datei)
- Übernehmen legt Stammeintrag an (Name+Ansprechpartner), setzt `manufacturer_id`, legt **eine**
  Sourcing-Muster-Zeile an (`hersteller` = Name; `notizen` enthält Ansprechpartner). 
- Zweiter Aufruf desselben USP-Herstellers → 409, **kein** zweiter Stammeintrag, **keine** zweite
  Muster-Zeile.
- Übernehmen ohne Namen → 400.
- Löschen eines Stammeintrags setzt `manufacturer_id` der verknüpften USP-Hersteller auf NULL.

### Frontend
`tsc --noEmit` + `vite build` grün; manuelles UAT.

### Manuelles UAT
1. Produkt öffnen → neuer Bereich **Hersteller** sichtbar (am Ende, verschiebbar).
2. Hersteller anlegen, Stammdaten füllen; mehrere Angebote anlegen → Vergleichstabelle zeigt sie,
   günstigstes hervorgehoben.
3. Hersteller löschen (mit Bestätigung) → Hersteller + Angebote weg.
4. In USP einen Hersteller anlegen (Name + Ansprechpartner) → „In Hersteller übernehmen" klicken →
   erscheint im Hersteller-Bereich (Name+Ansprechpartner) **und** als Muster-Zeile im Sourcing;
   USP-Button zeigt „✓ übernommen". Zweiter Klick legt nichts doppelt an.
5. Den übernommenen Stammeintrag löschen → USP-Button wird wieder aktiv („übernehmen").

## Sicherheit
Alle Routen hinter JWT (wie der Rest von `/api/amazon`). Nur Prepared Statements. Schema-Migration →
Auto-Backup.

## Umsetzung in Phasen
- **Phase A:** Migration 077, Manufacturers-Routen, API/Hooks, Sektion + Vergleich, Einhängen.
  Eigenständig nutzbar (Hersteller direkt im Bereich anlegen).
- **Phase B:** Migration 078 (Link-Spalte), USP-Übernehmen-Route, USP-Button + Zustand,
  Sourcing-Muster-Anlage. Baut auf Phase A auf.
