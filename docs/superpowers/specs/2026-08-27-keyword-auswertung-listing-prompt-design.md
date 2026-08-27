# Keyword-Auswertung + Listing-Prompt — Design-Spec

**Datum:** 2026-08-27
**Status:** Freigegeben (Design), bereit für Planung
**Baut auf:** [[2026-08-26-amazon-keyword-recherche-design]], [[2026-08-26-helium10-keyword-import-design]]

## Ziel

Aus dem angereicherten Keyword-Pool (Suchvolumen + Konkurrenz-Abdeckung) zwei
Dinge liefern:
1. **Zahlen-Auswertung:** automatisch priorisieren, worauf man **ranken muss**,
   und jedem Keyword ein **Ziel-Feld vorschlagen** (Titel / Bullets / Backend).
2. **Claude-Prompt:** aus den zugewiesenen Keywords einen fertigen Prompt bauen,
   mit dem Claude **Titel + 5 Bullets + Backend-Search-Terms** formuliert.

Klare Trennung: **Zahlen priorisieren & verteilen** (Tool, sofort, kostenlos),
**Claude formuliert die Texte** (Sprach-Aufgabe). Beides auf der Keyword-Recherche-
Hauptseite (`/amazon/keyword-recherche`).

## Entscheidungen (vom Benutzer bestätigt)

1. Umfang: **Priorität + Feld-Vorschlag** (nicht nur Anzeige, nicht nur Claude).
2. Defaults der Verteilung bestätigt: Titel 5 · Bullets ~20 · Backend ~50.

## Teil 1 — „Felder automatisch vorschlagen" (Zahlen)

Ein Knopf auf der Hauptseite. Berechnet **im Browser** eine Priorität und weist
allen Keywords ein Ziel-Feld zu.

### Priorität (Reihenfolge der Kandidaten)
- Kandidaten = Keywords mit `search_volume > 0` **oder** `coverage > 0`
  (Keywords ganz ohne Daten bleiben „ohne Feld").
- Sortierung: **`coverage` desc, dann `search_volume` desc.**
  (Wenn keine Konkurrenten getrackt sind, ist coverage überall 0 → effektiv nach
  Suchvolumen.)

### Verteilung (Defaults, fest in dieser Version)
| Reihenfolge | Ziel-Feld |
|---|---|
| Platz 1–5 | `title` |
| Platz 6–25 | `bullet_1..bullet_5` **Round-Robin** (Platz 6→b1, 7→b2, …, 11→b1 …) |
| Platz 26–75 | `backend` |
| Rest | `''` (ohne Feld) |

Reine Funktion `lib/amazon/suggestKeywordFields.ts`:
`suggestFieldAssignments(keywords: Keyword[]) => { id: number; target_field: KeywordTargetField }[]`
(gibt für **alle** Keywords das neue Ziel-Feld zurück — auch `''` für die, die
zurückgesetzt werden). Testbar ohne UI.

### Anwenden (Backend, ein Aufruf)
Neuer Endpoint `POST /products/:id/keywords/assign-fields`
Body `{ assignments: [{ id, target_field }] }`:
- `createBackup('keywords-auto-assign')` (Massen-Update).
- Transaktion: je Zeile `UPDATE amazon_keywords SET target_field = ?, updated_at
  = unixepoch() WHERE id = ? AND product_id = ?`; `target_field` gegen Whitelist,
  sonst `''`.
- Antwort: `{ updated, keywords }` (Pool frisch, inkl. coverage).

### UX
- Knopf **„Felder automatisch vorschlagen"** neben Import/„Alle löschen".
- **Rückfrage** vorher: „Überschreibt bestehende Feld-Zuordnungen. Fortfahren?"
- Danach einzeln per Dropdown korrigierbar (bestehende Mechanik).
- **Auswertungs-Banner** oben (immer sichtbar, sobald Titel-Keywords existieren):
  „Pflicht-Keywords (Titel): X · Y · Z" — abgeleitet aus `target_field==='title'`.
  Das ist die direkte Antwort auf „worauf muss ich ranken".

## Teil 2 — „Listing-Prompt (Claude)"

Knopf auf der Hauptseite öffnet ein Modal (draggable, ESC), das aus den
**zugewiesenen** Keywords einen Prompt baut. Rein clientseitig, kein Backend.
Komponente `components/amazon/keywords/ListingPromptModal.tsx` (Muster wie
`ClaudePromptModal`).

### Prompt-Inhalt (deutsch)
- Produktname + Kategorie (aus `useListing`).
- **Titel-Keywords** (target_field='title') mit Suchvolumen.
- **Bullet-Keywords** je Bullet (bullet_1..5) mit Suchvolumen.
- **Backend-Keywords** (Liste).
- Aufgabe an Claude:
  - **Titel:** ein verkaufsstarker, natürlicher deutscher Titel; die Titel-Keywords
    einarbeiten; kurz/prägnant (Hinweis: neue Amazon-Titel sind kürzer, ~150–200
    Zeichen, keine Keyword-Wüste).
  - **5 Bullets:** je nutzenorientiert, die jeweiligen Bullet-Keywords einweben,
    keine ganzen Sätze aneinanderreihen, echte Umlaute.
  - **Backend-Search-Terms:** eine Zeile, leerzeichen-getrennt, **≤ 249 Bytes**,
    keine Wiederholung von Wörtern aus Titel/Bullets, Synonyme/Long-Tail/Schreib­
    varianten nutzen.
  - Rückgabe klar gelabelt: „Titel:", „Bullet 1:" … „Backend:".
- Ergebnis kopiert der Benutzer manuell in die Listing-Felder (kein Auto-Schreiben,
  konsistent mit dem Modul).

## Komponenten/Dateien
- Backend: Endpoint `assign-fields` in `amazon.keywords.routes.ts`.
- API/Hooks: `amazon.keywords.api.ts` (`assignKeywordFields`), `useKeywords.ts`
  (`useAssignKeywordFields`).
- Frontend neu: `lib/amazon/suggestKeywordFields.ts` (Heuristik, testbar),
  `components/amazon/keywords/ListingPromptModal.tsx`.
- Frontend anpassen: `pages/amazon/AmazonKeywordsPage.tsx` (zwei Knöpfe,
  Auswertungs-Banner, Verdrahtung).

## Design/Konventionen
- Graphit-Look (Seite ist in der Whitelist), Teal-Akzent.
- Echte Umlaute; Modal draggable + ESC; destruktives/überschreibendes nur mit
  Bestätigung; Backup vor Massen-Update.

## Ausdrücklich NICHT im Scope (YAGNI / später)
- Auto-Schreiben der Claude-Texte direkt ins Listing (nur kopieren).
- Einstellbare Verteilungs-Zahlen (fest 5/20/50 in dieser Version).
- Eingebautes LLM/API (Claude läuft manuell im Chat, wie gehabt).
- Mehrere Titel-/Bullet-Varianten oder A/B-Vorschläge.
