# Amazon USP — Phase 4: Marke automatisch aus dem Markenname-Modul

**Status:** Entwurf — bereit zur Review
**Datum:** 2026-06-08
**Module:** Amazon Markenname (Brand) + Amazon USP

---

## Ziel

Den Markennamen nicht mehr doppelt pflegen: Im **Markenname-Modul** markiert der Nutzer genau
**einen** Kandidaten als „finale Marke". Das **USP** zeigt diese Marke dann automatisch im Feld
„Marke" und im PDF an — überschreibbar bleibt es trotzdem.

## Entscheidungen
- **Finale Marke = explizit markiert** (genau ein Kandidat pro Produkt; beim Markieren wird der
  vorige automatisch entmarkiert).
- **USP zeigt automatisch an** (synchron): effektive Marke = manuelle USP-Eingabe, sonst finale
  Marke, sonst „wird nachgereicht". Manuelles Überschreiben bleibt möglich.

## Scope

### In Scope
- Brand: Migration 076 (Spalte `is_final`), Backend-PATCH um `is_final` (exklusiv pro Produkt),
  Frontend-Typ + Markierungs-Control in der Namensliste.
- USP: GET-Payload liefert `final_marke`; USP-Marke-Feld + PDF nutzen die effektive Marke.

### Explizit out of Scope
- Automatische Ableitung (höchster Favorit) — verworfen zugunsten expliziter Markierung.
- Synchronisation in die andere Richtung (USP → Brand).

## Datensicherheit
Rein additiv (eine Spalte). Auto-Backup der Migration greift. Brand & USP teilen `product_id`.

## Teil 1 — Markenname-Modul: „finale Marke" markieren

### Migration 076
```sql
ALTER TABLE amazon_brand_name_candidates
  ADD COLUMN is_final INTEGER NOT NULL DEFAULT 0 CHECK (is_final IN (0,1));
```

### Backend (`amazon.brand.routes.ts`)
- `CandidateRow`-Interface um `is_final: number` erweitern (SELECT * liefert es).
- Im Candidate-PATCH (`/products/:id/brand/names/:nameId`) `is_final` als 0/1-Feld zulassen
  (analog `is_favorite`). **Exklusivität:** Wenn `is_final` auf `1` gesetzt wird, danach
  `UPDATE amazon_brand_name_candidates SET is_final = 0, updated_at = unixepoch() WHERE product_id = ? AND id != ?`
  ausführen, damit nur ein Kandidat pro Produkt final ist.

### Frontend (Brand)
- `BrandCandidate`-Typ + `CandidatePatch` um `is_final` (0|1) erweitern.
- In `BrandNameRow` ein **„finale Marke"-Control** (Icon-Button, z. B. `workspace_premium`/Krone):
  - `is_final === 1` → hervorgehoben (z. B. goldfarben), Tooltip „Finale Marke".
  - Klick togglet `is_final` (1 setzen bzw. auf 0 zurück). Beim Setzen entmarkiert der Server die
    anderen automatisch → nach Refetch ist nur einer markiert.
  - Eine kompakte Spalte „Marke" in `BrandNameTable` (Kopf + Zelle), analog den anderen Status-Spalten.

## Teil 2 — USP: Marke automatisch anzeigen

### Backend (`amazon.usp.routes.ts`)
- GET `/products/:id/usp`: zusätzlich `final_marke` berechnen:
  ```sql
  SELECT name FROM amazon_brand_name_candidates WHERE product_id = ? AND is_final = 1 ORDER BY id LIMIT 1
  ```
  → `final_marke: string | null`. In den Payload aufnehmen (Top-Level).

### Frontend (USP)
- `UspPayload` um `final_marke: string | null` erweitern.
- **`UspMetaForm` (Marke-Feld)** bekommt `finalMarke`-Prop:
  - Eingabefeld zeigt `meta.marke` als Wert; **Placeholder** = `final_marke` (mit Zusatz „(aus
    Markenname)") wenn vorhanden.
  - Unter dem Feld dezenter Hinweis „Automatisch aus Markenname: <final_marke>", solange
    `meta.marke` leer ist.
  - Wenn `meta.marke` gesetzt **und** `final_marke` existiert: kleiner Button
    „↩ auf Markenname zurücksetzen" → `update.mutate({ marke: '' })` (Server normalisiert zu null).
- **`exportUspPdf`** bekommt `finalMarke`-Parameter; Marke-Zeile nutzt
  `meta.marke || finalMarke || 'wird nachgereicht'`. `UspSection.buildPdf` reicht
  `fresh.data.final_marke` durch.
- `UspSection` reicht `data.final_marke` an `UspMetaForm` weiter.

## Effektive-Marke-Logik (eine Definition, überall gleich)
`marke = meta.marke?.trim() || final_marke || 'wird nachgereicht'`
— im PDF; im USP-Feld analog als Placeholder/Hinweis.

## Fehlerbehandlung
- Kein finaler Kandidat → `final_marke = null` → Verhalten wie bisher (Placeholder „Marke",
  PDF „wird nachgereicht").
- Brand-PATCH validiert `is_final` (0/1) → 400 bei ungültig.

## Tests

### Backend
- Brand: Migration 076 — Spalte `is_final` existiert (Default 0). PATCH `is_final: 1` setzt den
  Kandidaten und entmarkiert einen vorher markierten desselben Produkts (Exklusivität). PATCH
  `is_final: 2` → 400.
- USP: GET `/usp` liefert `final_marke` = Name des markierten Kandidaten; null, wenn keiner markiert
  ist; ignoriert finale Kandidaten anderer Produkte.

### Frontend
`tsc --noEmit` + `vite build` + manuelles UAT.

### Manuelles UAT
1. Im Markenname-Modul einen Namen als „finale Marke" markieren → Icon hervorgehoben; einen
   zweiten markieren → der erste verliert die Markierung (nur einer final).
2. USP öffnen → Feld „Marke" zeigt die finale Marke (Placeholder/Hinweis); PDF zeigt sie im Kopf.
3. In USP eine eigene Marke eintippen → überschreibt; „↩ zurücksetzen" stellt die finale Marke
   wieder her.
4. Markierung im Brand-Modul entfernen → USP zeigt wieder „wird nachgereicht".

## Sicherheit
Alle Routen hinter JWT; nur Prepared Statements; schema-only-Migration → Auto-Backup.

## Offene Punkte / spätere Phasen
- Damit ist der ursprüngliche USP-Fahrplan abgeschlossen (Phasen 1–4). Englisches PDF wurde
  bewusst gestrichen.
