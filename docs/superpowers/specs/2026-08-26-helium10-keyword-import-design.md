# Helium-10 Keyword-Import — Design-Spec

**Datum:** 2026-08-26
**Status:** Freigegeben (Design), bereit für Planung
**Baut auf:** [[2026-08-26-amazon-keyword-recherche-design]] (Keyword-Modul, Migr. 134)

## Ziel

Suchvolumen und Konkurrenz-Abdeckung aus **Helium 10** in den bestehenden
Keyword-Pool importieren — **ein Importer**, der **Cerebro**- und **Magnet**-Exporte
erkennt und alles dedupliziert in denselben Produkt-Pool schreibt. Daraus werden
die **Hauptkeywords** sichtbar (Suchvolumen + wie viele Konkurrenten ranken +
Auto-Highlight).

Keine Live-API, kein Scraping. Der Benutzer exportiert aus Helium 10
(xlsx/csv); die Datei wird **im Browser** geparst (Lib `xlsx` ist vorhanden),
nur die strukturierten Daten gehen ans Backend.

## Entscheidungen (vom Benutzer bestätigt)

1. **Struktur-Tiefe:** Keyword-zentrisch mit **Konkurrenz-Abdeckung** (pro
   Keyword: „X von N deiner Quellen-ASINs ranken"), keine volle Rang-Matrix.
2. **Hauptkeywords sichtbar:** Signale (Suchvolumen + Abdeckung) **+ Auto-Highlight**
   starker Keywords. Finale Wahl weiter per ★.
3. **Cerebro-Nutzung:** mehrere ASINs zusammen (kombinierter Export); Importer
   erkennt ASIN-Rang-Spalten automatisch, Einzel-ASIN-Export ist Sonderfall.
4. **Ort:** **nur die Keyword-Recherche-Hauptseite** (`/amazon/keyword-recherche`),
   neben der Produkt-Auswahl. Produkt-Sektion bleibt unverändert.
5. **Schwellen live einstellbar** (nicht hartkodiert): Mindest-Volumen für neue
   Keywords (Default 200) live in der Import-Vorschau; Top-Highlight-Schwellen
   (Volumen ≥ 500, Konkurrenten ≥ Hälfte) live auf der Hauptseite, in
   localStorage gemerkt.

## Datenmodell (additive Migration, kein Rebuild, kein PRAGMA)

`amazon_keywords.search_volume` existiert bereits (Migr. 134).

### Neu: `amazon_keyword_source_links` — welcher Konkurrent rankt für welches Keyword
| Spalte | Typ | Notiz |
|---|---|---|
| keyword_id | INTEGER NOT NULL | FK → amazon_keywords(id) ON DELETE CASCADE |
| source_id | INTEGER NOT NULL | FK → amazon_keyword_sources(id) ON DELETE CASCADE |

- `PRIMARY KEY (keyword_id, source_id)` (n:m, dedupliziert).
- Index auf `source_id` für schnelles Aufräumen.
- **Abdeckung eines Keywords = COUNT der Links.** Wird beim GET berechnet
  (Subquery), nicht gespeichert. Löscht du eine Quelle, fallen ihre Links per
  CASCADE weg → Abdeckung sinkt automatisch.

`GET /products/:id/keywords` liefert je Keyword zusätzlich:
`coverage` (Anzahl verlinkter Quellen) und `coverage_total` (Anzahl Quellen des
Produkts gesamt) — für die Anzeige „5 / 7".

## Import — Client-seitiges Parsen (Lib `xlsx`)

Neuer Knopf **„Helium 10 importieren"** auf der Hauptseite (neben Produkt-Auswahl),
öffnet ein Import-Modal (draggable, ESC schließt).

### Ablauf
1. **Datei** per Drag&Drop **oder** Auswahl (`.xlsx`/`.csv`; Drag&Drop Pflicht,
   Projekt-Standard). `xlsx.read` liest beide Formate.
2. **Spalten-Erkennung** (case-insensitiv, per Header-Name):
   - Keyword: Spalte enthält „Keyword Phrase" (Fallback „Keyword").
   - Suchvolumen: Spalte enthält „Search Volume" (Fallback „Suchvolumen").
   - **Cerebro-Erkennung:** Export enthält ASIN-Rang-Spalten (Header sieht aus wie
     eine ASIN `B0…` bzw. „…Organic Rank"/„…Rank" je ASIN). Wenn vorhanden →
     Cerebro; sonst → **Magnet** (nur Keyword + Volumen, Quelle „Magnet").
     Fallback bei Unklarheit: Spalten-Zuordnung manuell im Modal wählbar.
3. **ASIN-Matching (nur Cerebro):** erkannte ASIN-Spalten werden gegen die
   **Quellen-ASINs des Produkts** gematcht (Text, case-insensitiv). Ein Keyword
   „rankt" für eine Quelle, wenn dessen Rang-Zelle für diese ASIN gefüllt/>0 ist.
   ASINs im Export, die keiner Quelle entsprechen, werden ignoriert (Hinweis:
   „N ASINs erkannt, davon M deinen Quellen zugeordnet").
4. **Mindest-Suchvolumen für neue Keywords** — Eingabefeld (Default 200), die
   Vorschau rechnet **live**:
   > „X vorhandene aktualisiert · Y neu (Volumen ≥ Schwelle) · Z Keyword↔ASIN-Verknüpfungen"
5. **Bestätigen** → ein Payload ans Backend.

### Regeln
- **Vorhandene** Keywords (Phrase-Match): Suchvolumen wird immer aktualisiert,
  Links werden ergänzt — unabhängig von der Schwelle.
- **Neue** Keywords: nur ab Mindest-Volumen; darunter werden sie verworfen.
- Duplikate im Export werden zusammengeführt (max. Volumen, Links vereinigt).

## Backend — Import-Endpoint

`POST /products/:id/keywords/import` (in `amazon.keywords.routes.ts`).
Body (strukturiert, vom Client geparst):
```
{
  source_label: string,              // "Cerebro" | "Magnet"
  min_volume: number,                // Schwelle für NEUE Keywords
  rows: [{ phrase: string, search_volume: number|null, asins: string[] }]
}
```
- **`createBackup('keywords-helium10-import')`** vor dem Massen-Schreiben.
- Transaktion:
  - Vorhandenes Keyword (Phrase COLLATE NOCASE): `search_volume` setzen,
    `source` ggf. auf source_label, Links zu passenden Quellen anlegen
    (`INSERT OR IGNORE` in `amazon_keyword_source_links`).
  - Neues Keyword (nur `search_volume >= min_volume`): `INSERT OR IGNORE` in
    `amazon_keywords`, dann Volumen + Links.
  - `asins[]` → Quelle je ASIN nachschlagen (`amazon_keyword_sources` des
    Produkts); nur gefundene ASINs erzeugen Links.
- Antwort: `{ updated, added, linked, keywords: [...] }` (Pool frisch).

Kein FormData nötig (Datei wird im Browser geparst) → normaler JSON-Client.

## Frontend — Hauptseite erweitern

### Neue Spalte „Konkurrenten"
In `KeywordRow` (geteilt) zwischen Suchvolumen und Quelle: **„5 / 7"**
(coverage / coverage_total). Nur-Anzeige. Auf der Hauptseite sortierbar
(Kopfklick); die Produkt-Sektion zeigt die Zahl mit an (read-only).

### Auto-Highlight „Top"
Ein Keyword gilt als **Top**, wenn `search_volume ≥ Vol-Schwelle` **UND**
`coverage ≥ Konkurrenten-Schwelle`. Visuell: farbiger linker Rand + kleines
„Top"-Badge (Teal-Akzent). Zwei **Live-Regler** oben auf der Hauptseite
(„Top ab Suchvolumen ≥ ___" und „ranken ≥ ___") steuern die Schwellen; Werte in
localStorage gemerkt (Defaults 500 / `ceil(coverage_total/2)`).

### Filter „nur Top"
Zusätzlich zur bestehenden Filterleiste (Suchtext · nur ★ · Min-Volumen) ein
Umschalter **„nur Top"** — zeigt nur hervorgehobene Keywords. Sortierung
zusätzlich nach Konkurrenz-Abdeckung.

### Import-Knopf
Neben der Produkt-Auswahl: **„Helium 10 importieren"** → öffnet das Import-Modal.

## Komponenten/Dateien
- Backend: Endpoint in `amazon.keywords.routes.ts`; Migration
  `135_amazon_keyword_source_links.sql`; `GET keywords` um coverage erweitern.
- API/Hooks: `amazon.keywords.api.ts` (+ `importHelium10`, `coverage`-Felder),
  `useKeywords.ts` (+ `useImportHelium10`).
- Frontend neu: `components/amazon/keywords/Helium10ImportModal.tsx`
  (Datei lesen, Spalten erkennen, Vorschau, Bestätigen).
- Frontend anpassen: `KeywordRow.tsx` (Konkurrenten-Spalte + Top-Highlight),
  `AmazonKeywordsPage.tsx` (Import-Knopf, Live-Regler, „nur Top", Sortierung),
  `KeywordPoolTable.tsx` (Konkurrenten-Spalte read-only).
- Parsing-Logik gekapselt in `lib/amazon/parseHelium10.ts` (testbar, ohne UI).

## Design/Konventionen
- Graphit-Look (Hauptseite ist bereits in der Whitelist), Teal-Akzent wie Modul.
- Echte Umlaute; Drag&Drop Pflicht für den Datei-Upload; Modal draggable + ESC.
- Löschen/destruktives nur mit Bestätigung; Backup vor Massen-Import.

## Ausdrücklich NICHT im Scope (YAGNI / später)
- Volle Rang-Matrix (Keyword × ASIN mit exakter Position).
- Weitere Helium-10-Spalten (CPR, Title Density, Competing Products) — erst nur
  Keyword + Volumen + Abdeckung.
- Automatischer „Score" statt Highlight.
- Import in der Produkt-Sektion (nur Hauptseite).
- Live-API / echtes automatisches Nachladen.
