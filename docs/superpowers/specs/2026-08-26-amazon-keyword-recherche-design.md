# Amazon Keyword-Recherche — Design-Spec

**Datum:** 2026-08-26
**Status:** Freigegeben (Design), bereit für Planung

## Ziel

Ein Keyword-Recherche-Werkzeug für den Amazon-Bereich, auf **zwei Ebenen**, die
sich **einen** Datenbestand teilen (Keyword-Pool pro Produkt):

- **Produktebene** (neue Sektion auf der Produkt-Detailseite): **Sammeln/Minen** —
  Konkurrenz-Quellen (ASIN/Link/Umsatz) + roher, deduplizierter Keyword-Pool.
- **Hauptseite** (neuer Punkt in der linken Amazon-Nav): **Kuratieren/Zuordnen** —
  Produkt auswählen, filtern, Haupt-Keywords markieren, jedem Keyword ein
  Ziel-Feld (Titel/Bullet 1–5/Backend) zuweisen und je Feld **kopieren**.

**Datenquelle:** Manuell + Claude-Assist. Kein API-Schlüssel, keine laufenden
Kosten, kein Scraping. Echtes Amazon-Suchvolumen gibt es nur aus Bezahl-Tools —
darum ist **Suchvolumen eine manuelle Spalte** (aus Helium10/Jungle Scout/etc.
kopiert). Claude-Assist erzeugt aus vorhandenen Daten einen fertigen Prompt für
den Chat; das Ergebnis wird per Massen-Paste zurück in den Pool gefüllt.

## Entscheidungen (vom Benutzer bestätigt)

1. **Datenquelle:** Manuell + Claude-Assist (kein eingebautes LLM, kein Auto-API).
2. **Feld-Zuordnung:** **Nur kopieren** — kein Auto-Schreiben ins Listing. Nichts
   wird überschrieben; je Feld ein „Kopieren"-Knopf.
3. **Quellen-Tabelle:** **Eigene Liste + Import** — unabhängige Quellen-Liste je
   Produkt; Knopf „Aus Mitbewerber übernehmen" zieht ASIN/Link aus den
   bestehenden Mitbewerber-Karten. Umsatz + gepastete Keywords leben hier.

## Datenmodell (additive Migration, kein Rebuild, kein PRAGMA)

### Tabelle `amazon_keyword_sources` — Konkurrenz-Quellen je Produkt
| Spalte | Typ | Notiz |
|---|---|---|
| id | INTEGER PK | |
| product_id | INTEGER NOT NULL | FK → amazon_products(id) ON DELETE CASCADE |
| sort_order | INTEGER NOT NULL DEFAULT 0 | Einfüge-Reihenfolge |
| asin | TEXT NOT NULL DEFAULT '' | |
| url | TEXT NOT NULL DEFAULT '' | Link |
| revenue | TEXT NOT NULL DEFAULT '' | Umsatz, Freitext (z. B. „12.000 €/Monat") |
| created_at | INTEGER NOT NULL DEFAULT (unixepoch()) | |
| updated_at | INTEGER NOT NULL DEFAULT (unixepoch()) | |

### Tabelle `amazon_keywords` — Keyword-Pool je Produkt
| Spalte | Typ | Notiz |
|---|---|---|
| id | INTEGER PK | |
| product_id | INTEGER NOT NULL | FK → amazon_products(id) ON DELETE CASCADE |
| phrase | TEXT NOT NULL | das Keyword |
| search_volume | INTEGER | nullable — manuell |
| source | TEXT NOT NULL DEFAULT '' | Freitext/ASIN/„Claude"/„manuell" |
| is_main | INTEGER NOT NULL DEFAULT 0 | ★ Haupt-Keyword |
| target_field | TEXT NOT NULL DEFAULT '' | '' \| title \| bullet_1..bullet_5 \| backend |
| sort_order | INTEGER NOT NULL DEFAULT 0 | |
| created_at | INTEGER NOT NULL DEFAULT (unixepoch()) | |
| updated_at | INTEGER NOT NULL DEFAULT (unixepoch()) | |

**Dedup:** `CREATE UNIQUE INDEX ux_amazon_keywords_phrase ON
amazon_keywords(product_id, phrase COLLATE NOCASE);` — Massen-Paste nutzt
`INSERT OR IGNORE`, sodass Groß-/Kleinschreibungs-Duplikate je Produkt
automatisch entfallen. `phrase` wird vor dem Insert getrimmt; leere Zeilen raus.

FK-Regeln über CASCADE (wie bei den anderen Amazon-Tabellen). `PRAGMA
foreign_keys` NICHT in der Migration setzen (zentral in migrate.ts).

## Backend — neue Route-Datei `amazon.keywords.routes.ts`

Muster wie `amazon.competitors.routes.ts`. Produkt-Zugehörigkeit prüfen
(`ensureProduct`), Feld-Längen kappen, `updated_at = unixepoch()`.

### Quellen
- `GET    /products/:id/keyword-sources` — Liste (sort_order, id).
- `POST   /products/:id/keyword-sources` — leere Quelle anlegen.
- `POST   /products/:id/keyword-sources/import-competitors` — kopiert asin+url
  aus `amazon_competitors` des Produkts als neue Quellen (nur nicht-leere ASINs;
  vorhandene ASINs nicht doppeln). **`createBackup('keywords-import-competitors')`
  vor dem Massen-Insert.**
- `PATCH  /products/:id/keyword-sources/:sid` — asin/url/revenue.
- `DELETE /products/:id/keyword-sources/:sid`.

### Keywords
- `GET    /products/:id/keywords` — Liste.
- `POST   /products/:id/keywords` — einzelnes Keyword (phrase, source?),
  `INSERT OR IGNORE`; gibt Zeile (oder vorhandene) zurück.
- `POST   /products/:id/keywords/bulk` — Body: `{ phrases: string[] | text, source? }`.
  Zeilen splitten/trimmen/leere raus, `INSERT OR IGNORE` in Transaktion.
  **`createBackup('keywords-bulk-import')` vor dem Massen-Insert.** Antwort:
  `{ added: number, keywords: [...] }`.
- `PATCH  /products/:id/keywords/:kid` — phrase/search_volume/source/is_main/target_field.
  `search_volume`: Ganzzahl ≥ 0 oder null. `is_main`: 0/1. `target_field`: nur
  erlaubte Werte, sonst ''.
- `DELETE /products/:id/keywords/:kid`.

Die Hauptseite nutzt die **bestehende** Produkt-Liste (`GET /amazon/products`)
für den Auswahl-Dropdown und dann `GET /products/:id/keywords`. Kein extra
Endpoint.

**Claude-Assist braucht kein Backend** — der Prompt wird im Frontend aus bereits
geladenen Daten gebaut (Produkt-Notizen, Mitbewerber-Titel/Untertitel/ASIN,
bestehende Keywords).

## Frontend

### API + Hooks
- `frontend/src/api/amazon.keywords.api.ts` — Typen `KeywordSource`, `Keyword`,
  `KeywordPatch`, Fetch-Funktionen (inkl. `importCompetitorsAsSources`,
  `addKeywordsBulk`). Kein FormData → normaler JSON-Client.
- `frontend/src/hooks/amazon/useKeywords.ts` — TanStack-Query-Keys + Mutationen
  (Muster wie `useCompetitors.ts`).

### Produkt-Sektion — `components/amazon/keywords/`
- `KeywordsSection.tsx` (Container, in Sektions-Registry).
- `KeywordSourceRow.tsx` — Zeile ASIN · Link · Umsatz + „Keywords einfügen"-Feld
  (Textarea; Massen-Paste → `addKeywordsBulk` mit source=ASIN/Label).
- `KeywordPoolTable.tsx` — Liste `Keyword · Suchvolumen · Quelle · ★ · Ziel-Feld ▾`,
  Schnell-Eingabe + Massen-Paste (eine Zeile = ein Keyword). Spalten-Sortierung
  per Kopfklick (Suchvolumen/★/A–Z); **kein** manuelles Drag-Reorder (YAGNI).
- `ClaudePromptModal.tsx` — Knopf „Claude-Prompt erzeugen" öffnet Modal mit
  generiertem Text + „Kopieren". Draggable am Header (Projekt-Standard), ESC
  schließt (Projekt-Standard).

Registrierung: `'keywords'` in `useDetailSectionOrder.ts` (Position nach
`'competitors'`, vor `'listing'`) und im Switch in
`AmazonProductDetailPage.tsx` (`if (id === 'keywords') return <KeywordsSection …/>`).
Bestehende localStorage-Reihenfolgen bekommen die Sektion automatisch angehängt
(vorhandene `missing`-Logik).

### Hauptseite — `pages/amazon/AmazonKeywordsPage.tsx`
- **Produkt-Auswahl** (Dropdown über `GET /amazon/products`).
- **Filter-Leiste:** nur ★Haupt · Suchtext · Mindest-Suchvolumen · Ziel-Feld;
  Sortierung nach Suchvolumen.
- **Feld-Zuordnung:** Gruppen **Titel / Bullet 1 / … / Bullet 5 / Backend** +
  „ohne Zuordnung". Je Gruppe die zugewiesenen Keywords und ein
  **„Kopieren"-Knopf** (Phrasen leerzeichen-getrennt als Text). Ziel-Feld
  ändern per Dropdown (dieselbe Mutation wie in der Produkt-Sektion).

Route + Nav: Eintrag in `navConfig.ts` unter Amazon
(`{ path: '/amazon/keyword-recherche', label: 'Keyword-Recherche', icon: 'manage_search' }`),
Breadcrumb-Titel-Map ergänzen, Route in der Amazon-Routen-Datei registrieren.

## Claude-Assist — Prompt-Inhalt

Der generierte Text (deutsch) enthält:
- Produktname + Kategorie + Notizen,
- Mitbewerber: Titel, Untertitel, ASIN,
- bereits vorhandene Keywords (zur Dublettenvermeidung),
- Aufgabe: „Erzeuge relevante deutsche Amazon-Suchbegriffe für dieses Produkt,
  clustere nach Themen, markiere die stärksten, keine Dubletten zu den
  bestehenden. Gib das Ergebnis als einfache Liste zurück — ein Keyword pro
  Zeile."

Rückgabe (ein Keyword je Zeile) fügt der Benutzer per Massen-Paste in den Pool.

## Design/Konventionen
- Electric-Noir / globale Blau-Grün-Palette; Optik wie Mitbewerber/Listing-Sektion.
- Echte Umlaute in allen sichtbaren Texten.
- Löschen nur mit Bestätigung (Quelle/Keyword).
- Modals draggable am Header; ESC schließt jedes Overlay.
- „0"/leere Werte sichtbar lassen (kein Platzhalter, der wie Daten aussieht).

## Ausdrücklich NICHT im Scope (YAGNI / später)
- Auto-Schreiben in die Listing-Felder (bewusst „nur kopieren").
- Eingebautes LLM / Auto-API / echtes Live-Suchvolumen.
- Amazon-Scraping / ASIN-Auto-Ausfüllen (separat geparkt, s. Mitbewerber-Notiz).
- Manuelles Drag-Reorder im Keyword-Pool (Spalten-Sortierung reicht).
- Keyword-Sharing/Vergleich über mehrere Produkte hinweg (Hauptseite ist
  produktweise).
