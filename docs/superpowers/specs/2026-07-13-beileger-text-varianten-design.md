# Text-Varianten für Design-&-Druck-Topics (Beileger)

**Datum:** 2026-07-13 · **Status:** Von Benny freigegeben (Weg 1)

## Problem

Benny sucht den richtigen Text für die Beileger-Karte eines Amazon-Produkts und will
mehrere Formulierungs-Kandidaten nebeneinander speichern und vergleichen. Das eine
Notizfeld pro Hersteller-Tab ist dafür ungeeignet (Freitext-Kladde, keine Struktur,
Hersteller-Kopplung ist für Kartentexte sinnlos).

## Entscheidung (Weg 1)

Eigener Bereich **„Text-Varianten"** je Design-&-Druck-Topic — Topic-weit,
unabhängig vom Hersteller-Tab. Funktioniert damit automatisch für alle Topics
(Beileger, Verpackungsdesign, Anleitung …), nicht nur den Beileger.

Geklärte Anforderungen:
- Varianten hängen **pro Produkt/Topic** (keine produktübergreifende Bibliothek)
- Eine Variante = **nur ein Textfeld** (kein Titel, keine Strukturfelder)
- **Favorit-Markierung**: genau eine Variante pro Topic als final markierbar

## Datenmodell (Migration 119)

```sql
CREATE TABLE amazon_product_doc_text_variants (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id    INTEGER NOT NULL REFERENCES amazon_product_doc_topics(id) ON DELETE CASCADE,
  text        TEXT    NOT NULL DEFAULT '',
  is_favorite INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_apdtv_topic ON amazon_product_doc_text_variants(topic_id, sort_order);
```

Keine Kind-Tabellen, kein Rebuild — additive Migration, unkritisch.

## API (backend/src/routes/amazon.productdocs.routes.ts, bestehendes Router-Muster)

- `GET  /products/:id/docs/:topicId` → Antwort um `textVariants: [...]` erweitern
- `POST /products/:id/docs/:topicId/text-variants` → neue leere Variante (sort ans Ende)
- `PATCH /products/:id/docs/:topicId/text-variants/:variantId` → `{ text?, is_favorite? }`;
  `is_favorite: true` setzt alle anderen Varianten des Topics auf 0 (exklusiv, eine Transaktion)
- `DELETE /products/:id/docs/:topicId/text-variants/:variantId`

Einzel-CRUD → kein createBackup nötig (CLAUDE.md-Regel).

## UI (frontend/src/components/amazon/productdocs/ProductDocsSection.tsx)

Block **„Text-Varianten"** zwischen „Finale Dateien" und „Notizen":
- Varianten-Karten untereinander; je Karte: Textarea (Auto-Save mit Debounce wie
  Notizen, „Wird automatisch gespeichert."), Stern-Button (Favorit, exklusiv,
  hervorgehobener Rahmen), Kopier-Button (Text → Zwischenablage), Löschen **mit
  Rückfrage** (Benny-Regel: nie still löschen)
- „+ Variante"-Button
- Amazon-Optik wie bestehende Blöcke; echte Umlaute

## Nicht im Scope

- Produktübergreifende Textbibliothek / Vorlagen-Kopie (bewusst abgewählt, Option C)
- Mehrsprachige Struktur-Felder
- Export der Varianten
