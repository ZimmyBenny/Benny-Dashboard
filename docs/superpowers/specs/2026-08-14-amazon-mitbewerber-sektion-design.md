# Amazon-Produkt: Sektion „Mitbewerber"

**Datum:** 2026-08-14 · **Status:** Von Benny freigegeben (erste Ausbaustufe)

## Ziel

Neue auf-/zuklappbare Sektion „Mitbewerber" auf der Amazon-Produkt-Detailseite —
Konkurrenzprodukte erfassen & analysieren. Reiht sich wie USP/Hersteller/Recherche ein.
Natürlicher Ort für die ASINs (späteres Auto-Ausfüllen dockt hier an).

## Entscheidungen (mit Benny geklärt)

- **Schlank bei Werkzeugen** (KEINE Vergleichstabelle, KEIN PDF, KEIN BSR, KEIN
  ASIN-Auto-Ausfüllen — alles spätere Schritte), **aber mit den Analyse-Feldern**.

## Datenmodell

**Tabelle `amazon_competitors`:**
- `id` PK, `product_id` INTEGER REFERENCES amazon_products(id) ON DELETE CASCADE
- `sort_order` INTEGER
- `asin` TEXT, `url` TEXT (Amazon-Link)
- `title` TEXT
- `price` TEXT (Freitext — Format/Währung variiert, wie bei Hersteller-Angeboten)
- `rating` REAL NULL (0–5), `reviews` INTEGER NULL
- `strengths` TEXT, `weaknesses` TEXT, `differentiation` TEXT
- `is_main` INTEGER NOT NULL DEFAULT 0 (Hauptkonkurrent-Stern)
- `created_at`, `updated_at` INTEGER
- Alle Textfelder DEFAULT '' bzw. NULL; additive Migration, kein Rebuild, kein PRAGMA.

**Tabelle `amazon_competitor_files`** (Anhänge/Screenshots, wie USP-Files):
- `id` PK, `competitor_id` INTEGER REFERENCES amazon_competitors(id) ON DELETE CASCADE
- `sort_order`, `file_path` TEXT, `original_name` TEXT, `mime` TEXT, `created_at`

## Backend (`amazon.competitors.routes.ts`, in app.ts mounten)

Routen analog USP/Recherche:
- `GET  /amazon/products/:id/competitors` → Liste inkl. files (Hauptkonkurrenten zuerst,
  dann sort_order).
- `POST /amazon/products/:id/competitors` → leeren Eintrag anlegen (sort_order = max+1).
- `PATCH /amazon/products/:id/competitors/:cid` → Feld-Patch (asin/url/title/price/
  rating(clamp 0–5)/reviews(int≥0)/strengths/weaknesses/differentiation/is_main(0/1)).
- `PATCH /.../competitors/reorder` → sort_order-Array.
- `DELETE /.../competitors/:cid`.
- Datei: `POST /.../competitors/:cid/files` (multer, **originalname latin1→utf8**),
  `GET /.../competitors/files/:fid/blob`, `DELETE /.../competitors/files/:fid`.
- Dateien unter `<DATA_DIR>/amazon/competitors/<productId>/…` (wie andere Amazon-Uploads;
  __dirname-Basis, nicht cwd).

## Frontend

- API-Typen + `useCompetitors`-Hooks (fetch/create/update/delete/reorder/upload/delete-file)
  mit `invalidateQueries`.
- `CompetitorsSection` (Container, `SectionHeader`, „+ Mitbewerber"), Karten je Eintrag:
  ASIN+Link, Titel, Preis/Sterne/Bewertungen, Stärken/Schwächen/Differenzierung
  (Textareas, debounce-auto-save), Hauptkonkurrent-Stern, Datei-Block
  (Drag&Drop-Zone + `FilePreviewModal`-Vorschau, ESC schließt).
- In `AmazonProductDetailPage.tsx`: `if (id === 'competitors') return <CompetitorsSection …/>`.
- `useDetailSectionOrder.ts`: `'competitors'` in `DEFAULT_ORDER` nach `'research'`
  einfügen. **Wichtig:** gespeicherte Nutzer-Reihenfolge (localStorage) darf die neue
  Sektion nicht verschlucken → prüfen, dass der Hook fehlende DEFAULT_ORDER-Ids anhängt
  (falls nicht, ergänzen).

## Verifikation

1. Migration: beide Tabellen existieren.
2. Sektion erscheint auf der Detailseite (auch bei bestehender gespeicherter Reihenfolge),
   auf-/zuklappbar, verschiebbar.
3. Mitbewerber anlegen → Felder auto-save → nach Reload da; Hauptkonkurrent-Stern sortiert
   nach oben.
4. Screenshot-Upload (Umlaut-Dateiname korrekt) → Vorschau → löschen.
5. Löschen mit Rückfrage; CASCADE entfernt Dateien-Zeilen.

## Nicht im Scope (spätere Schritte)

Vergleichstabelle · PDF-Export · BSR · ASIN-Auto-Ausfüllen · monatliche Verkaufsschätzung.
