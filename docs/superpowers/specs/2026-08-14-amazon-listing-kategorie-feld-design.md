# Feld „Kategorie" im Amazon-Listing

**Datum:** 2026-08-14 · **Status:** Von Benny freigegeben (kleiner Schritt; ASIN-Tool separat vertagt)

## Ziel

Dem Listing-Bereich ein Textfeld **„Kategorie"** hinzufügen (Amazon-Produktkategorie).
Reine additive Erweiterung — das größere ASIN-Puller-Thema ist bewusst getrennt/vertagt.

## Befund

- Tabelle `amazon_listing` (Migr. 103): `title, bullet_1..5, description,
  keywords_main, keywords_backend` — keine Kategorie.
- Backend `amazon.listing.routes.ts`: `TEXT_FIELDS`-Konstante (Zeile 68) steuert,
  welche Textfelder per PATCH aktualisierbar sind; Default-Leer-Listing (Zeile 92-93).
- Frontend: `ListingEditor.tsx` (Felder + Byte-Zähler), `ListingProductPreview.tsx`
  (Amazon-Vorschau).

## Umsetzung

**Migration 128:** `ALTER TABLE amazon_listing ADD COLUMN category TEXT NOT NULL DEFAULT '';`
(additiv, kein Rebuild, kein PRAGMA foreign_keys).

**Backend (`amazon.listing.routes.ts`):**
- `category: string` in den ListingRow-Typ.
- `'category'` in `TEXT_FIELDS` (→ GET liefert es, PATCH akzeptiert es).
- `category: ''` im Default-Leer-Listing.

**Frontend:**
- API-Typ `Listing` um `category: string` erweitern.
- `ListingEditor.tsx`: „Kategorie"-Feld (einzeilig, oben — über dem Titel, da es das
  Listing einordnet). Kein Amazon-Byte-Limit für Kategorie (nur internes Feld) → nur
  ein schlichtes Input ohne Byte-Zähler, konsistent gestylt.
- `ListingProductPreview.tsx`: Kategorie oben klein anzeigen (z.B. als Breadcrumb-artige
  Zeile), falls gesetzt.

## Verifikation

1. Migration: Spalte `category` existiert.
2. Kategorie eingeben → auto-save (wie andere Felder) → nach Reload noch da.
3. Amazon-Vorschau zeigt die Kategorie.
4. Bestehende Listings unberührt (Default '').

## Nicht im Scope

- ASIN-Puller / Kategoriefinder-Automatik (separat, vertagt)
- Vorgegebene Amazon-Kategorie-Liste/Dropdown (erst mal freies Textfeld)
