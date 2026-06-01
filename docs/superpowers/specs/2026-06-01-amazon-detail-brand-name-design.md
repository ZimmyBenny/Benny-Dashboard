# Amazon Produkt-Detail — Brand-Sektion + Sourcing-Erweiterung (Schritt 3)

**Status:** Entwurf — bereit zur Review
**Datum:** 2026-06-01
**Modul:** Amazon Produkt-Detail (`/amazon/entwicklung/products/:id`)

---

## Ziel

Bündel-Schritt mit zwei Änderungen:

1. **Sourcing-Erweiterung:** Eine zusätzliche Checkbox-Spalte "Beauftragt" in der bestehenden Sample-Vergleichs-Tabelle, um zu markieren, dass ein Sample tatsächlich in Auftrag gegeben wurde.
2. **Neue Sektion "Markenname":** Akkordeon analog zu Sourcing, mit (a) Namens-Tabelle, (b) automatisch eingeblendetem Favoriten-Recherche-Bereich für Markenrecht- und Domain-Checks, (c) PDF-Export.

## Scope

### In Scope (Schritt 3)
- Migration 059: Spalte `sample_ordered` in `amazon_sourcing_samples`.
- Backend PATCH-Validator erweitert um `sample_ordered`.
- Sample-Tabelle: neue "Beauftragt"-Checkbox-Spalte mit Optimistic-Update.
- Migration 060: zwei neue Tabellen `amazon_brand_name` (1:1) und `amazon_brand_name_candidates` (1:n).
- Backend-Routes `backend/src/routes/amazon.brand.routes.ts` mit GET, PATCH, Candidate-CRUD.
- Frontend `BrandNameSection` — Akkordeon mit Sektion-Notizen, Haupttabelle der Namen, automatisch sichtbarem Favoriten-Bereich.
- Doppelte-Namen-Warnung beim Anlegen (case-insensitive Vergleich, weiche Warnung).
- "Archivierte einblenden"-Toggle analog zur Verworfen-Logik bei Produkten.
- PDF-Export der Markenname-Sektion (nicht-archivierte Namen + Sektion-Notizen + Favoriten-Recherche-Block).

### Explizit out of Scope
- Drag&Drop zum Umsortieren von Namen (neue landen unten via `sort_order = max+1`).
- Auto-Sort nach Status (Favoriten zuerst etc.).
- API-Integration für Domain-Checks (Whois / DPMA) — der User pflegt die Recherche-Status manuell.
- Mehrsprachige Bedeutungsprüfung.
- Statistik / Übersicht über mehrere Produkte (Brand-Comparison).
- Export mehrerer Sektionen in ein PDF.

## A) Sourcing-Erweiterung — Migration 059

```sql
ALTER TABLE amazon_sourcing_samples
  ADD COLUMN sample_ordered INTEGER NOT NULL DEFAULT 0
  CHECK (sample_ordered IN (0,1));
```

**Backend:** im PATCH-Handler von `amazon.sourcing.routes.ts` `sample_ordered` als zusätzliches Bool-Feld zulassen (validiert 0/1).

**Frontend:**
- API-Type `SourcingSample` und `SamplePatch` um `sample_ordered: 0 | 1` ergänzen.
- `SourcingSampleTable.tsx`: neue `<th>Beauftragt</th>` zwischen "Lieferzeit" und "Qualität".
- `SourcingSampleRow.tsx`: neue `<td>` mit Checkbox; Klick → `patch({ sample_ordered: next })`.
- Spalten-Reihenfolge: Winner · Hersteller · Sample Kosten · Besonderheiten · Lieferzeit · **Beauftragt** · Qualität · Bewertung · Status · Notizen · ⋯

## B) Markenname-Sektion — Migration 060

```sql
CREATE TABLE amazon_brand_name (
  product_id  INTEGER PRIMARY KEY
              REFERENCES amazon_products(id) ON DELETE CASCADE,
  status      TEXT    NOT NULL DEFAULT 'offen'
              CHECK (status IN ('offen','in_bearbeitung','erledigt')),
  is_expanded INTEGER NOT NULL DEFAULT 1 CHECK (is_expanded IN (0,1)),
  notes       TEXT,
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE amazon_brand_name_candidates (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id      INTEGER NOT NULL
                  REFERENCES amazon_products(id) ON DELETE CASCADE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  name            TEXT NOT NULL,
  is_interesting  INTEGER NOT NULL DEFAULT 0 CHECK (is_interesting IN (0,1)),
  is_maybe        INTEGER NOT NULL DEFAULT 0 CHECK (is_maybe IN (0,1)),
  is_yes          INTEGER NOT NULL DEFAULT 0 CHECK (is_yes IN (0,1)),
  is_no           INTEGER NOT NULL DEFAULT 0 CHECK (is_no IN (0,1)),
  is_favorite     INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0,1)),
  is_archived     INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0,1)),
  remarks         TEXT,         -- einzeilig, max 300 Zeichen
  -- Favoriten-Recherche (nur befüllt, wenn is_favorite=1):
  trademark_status   TEXT CHECK (trademark_status   IS NULL OR trademark_status   IN ('frei','belegt','unklar')),
  domain_com_status  TEXT CHECK (domain_com_status  IS NULL OR domain_com_status  IN ('frei','belegt','unklar')),
  domain_de_status   TEXT CHECK (domain_de_status   IS NULL OR domain_de_status   IN ('frei','belegt','unklar')),
  social_status      TEXT CHECK (social_status      IS NULL OR social_status      IN ('frei','belegt','unklar')),
  research_url       TEXT,       -- max 500 Zeichen
  research_notes     TEXT,       -- mehrzeilig, max 2000 Zeichen
  created_at         INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at         INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX amazon_brand_name_candidates_product_idx
  ON amazon_brand_name_candidates (product_id, sort_order, id);
```

### Verhalten
- Cascade-Delete entfernt `amazon_brand_name` und alle Candidates wenn das Produkt gelöscht wird.
- Lazy-Init: `GET /products/:id/brand` legt den `amazon_brand_name`-Eintrag mit Default-Werten an, falls nicht vorhanden.
- Candidate-Limit: 100 Namen pro Produkt (Schutz).
- Doppelte-Namen-Erkennung **clientseitig** (lower-case + trim Vergleich). Backend speichert ohne Constraint — User darf bewusst Duplikate anlegen (nach Bestätigung).

## Backend-API

Neue Datei `backend/src/routes/amazon.brand.routes.ts`, mounted unter `/api/amazon` nach den bestehenden Amazon-Routes.

| Methode | Pfad | Body | Antwort |
|--------|------|------|---------|
| GET    | `/api/amazon/products/:id/brand` | — | `200 { brand: {...}, names: [...] }`. Lazy-Init. Sortiert `sort_order, id`. |
| PATCH  | `/api/amazon/products/:id/brand` | `Partial<{ status, is_expanded, notes }>` | `200 { brand }` |
| POST   | `/api/amazon/products/:id/brand/names` | `{ name: string }` | `201 { name: {...} }`. `sort_order = max+1`. |
| PATCH  | `/api/amazon/products/:id/brand/names/:nameId` | `Partial<{...}>` (alle Spalten ohne id/product_id/timestamps) | `200 { name }` |
| DELETE | `/api/amazon/products/:id/brand/names/:nameId` | — | `204` |

### Validierung
- `status` (brand): einer aus `offen | in_bearbeitung | erledigt`.
- `is_expanded`, `is_*` Bool-Felder: 0 oder 1.
- `name` (POST): getrimmt, 1..200 Zeichen.
- `remarks`: max 300 Zeichen, leerer String → null.
- `trademark_status`, `domain_com_status`, `domain_de_status`, `social_status`: einer aus `frei|belegt|unklar` oder `null`.
- `research_url`: max 500 Zeichen, leerer String → null.
- `research_notes`: max 2000 Zeichen, leerer String → null.
- `notes` (brand): max 2000 Zeichen, leerer String → null.
- `sort_order` (PATCH): Integer.
- Candidate-Limit (POST): 100 → `400 { error: 'candidate limit reached' }`.
- Produkt nicht gefunden → 404. Candidate gehört nicht zum Produkt → 404.

## Frontend-Struktur

### Dateien (neu)
```
frontend/src/components/amazon/
  BrandNameSection.tsx          # Akkordeon-Wrapper, lädt Brand-Daten
  BrandNotes.tsx                # Sektion-weites Notizfeld (Textarea)
  BrandNameTable.tsx            # Haupttabelle + Toolbar + Archiv-Toggle + Export-Button
  BrandNameRow.tsx              # Eine Zeile (Name, 5 Checkboxen, Bemerkungen, Archiv, Trash)
  BrandFavoritesPanel.tsx       # Container für alle Favoriten-Karten
  BrandFavoriteCard.tsx         # Pro Favorit: Recherche-Felder
  DeleteBrandNameDialog.tsx     # Confirm vor Hard-Delete

frontend/src/hooks/amazon/
  useBrand.ts                   # TanStack-Query Hooks

frontend/src/lib/amazon/
  exportBrandPdf.ts             # PDF-Generator (jspdf + jspdf-autotable)
```

### Erweiterung `amazon.api.ts`
Neue Types:
- `BrandStatus = 'offen' | 'in_bearbeitung' | 'erledigt'`
- `ResearchStatus = 'frei' | 'belegt' | 'unklar'`
- `BrandName` (product_id, status, is_expanded, notes, updated_at)
- `BrandCandidate` (alle Spalten)
- `BrandPayload = { brand: BrandName; names: BrandCandidate[] }`
- `BrandPatch`, `CandidatePatch`

Neue Funktionen:
- `fetchBrand(productId)`
- `updateBrand(productId, patch)`
- `createCandidate(productId, name)`
- `updateCandidate(productId, candidateId, patch)`
- `deleteCandidate(productId, candidateId)`

### Hook `useBrand.ts`
- `useBrand(productId)` → `useQuery({ queryKey: ['amazon','products', productId, 'brand'], ... })`
- `useUpdateBrand(productId)` → optimistic Update auf `brand`.
- `useCreateCandidate(productId)` → setQueryData appendet.
- `useUpdateCandidate(productId)` → optimistic Update der Candidate-Liste.
- `useDeleteCandidate(productId)` → optimistic Remove.
- Alle Mutationen mit Rollback bei Fehler + `invalidateQueries` in `onSettled`.

### Komponenten-Verhalten

**BrandNameSection** (Props: `productId`)
- Nutzt `useBrand`; Loading/Error-States wie `SourcingSection`.
- Akkordeon via `SectionHeader` (Icon `label`, Akzent `#f472b6`, Status-Badge, Chevron).
- Body (wenn expanded): `BrandNotes` → `BrandNameTable` → `BrandFavoritesPanel` (sichtbar wenn mind. 1 Favorit).

**BrandNotes** (Props: `productId`, `notes`)
- `<textarea>` (auto-grow, 3–8 Zeilen sichtbar, max 2000 Zeichen).
- On-blur PATCH via `useUpdateBrand`.
- Lokaler State mirrort `notes`-Prop, wird bei externen Updates re-synchronisiert.

**BrandNameTable** (Props: `productId`, `candidates`)
- Lokaler UI-State: `showArchived: boolean`, `pendingDelete: BrandCandidate | null`, `newName: string`, `nameWarning: string | null`.
- Sortierung **client-seitig**: Favoriten zuerst (`is_favorite === 1`), dann nach `sort_order, id`. So rutscht ein neu markierter Favorit sofort nach oben (Optimistic via `useUpdateCandidate`), ohne Backend-Roundtrip.
- Sichtbare Namen: `[...candidates].sort(byFavoriteThenSortOrder).filter(c => showArchived || !c.is_archived)`.
- Archivierte Anzahl im Toggle-Pill.
- **Anlege-Zeile / -Inline-Form** unter der Tabelle:
  - Input für neuen Namen + Button "Hinzufügen".
  - On-Input: prüft case-insensitive + getrimmt gegen alle nicht-archivierten + archivierten Candidates. Wenn Treffer: `nameWarning = `Name "X" existiert bereits (möglicherweise archiviert)`. Inline Hinweis-Text in dezentem Orange. Hinzufügen bleibt **nicht** disabled — User kann bestätigen.
  - Klick "Hinzufügen": ruft `createCandidate.mutate(name)`, Eingabe wird geleert.
  - Bei `candidates.length >= 100`: Input disabled, Hinweis.
- Header-Toolbar: "Archivierte einblenden (n)" + "PDF exportieren".
- Tabelle: Spalten Name · Interessant · Vielleicht · Ja · Nein · Favourit · Bemerkungen · Archiv · ⋯
- Renderloop `candidates.map(c => <BrandNameRow ... />)`.

**BrandNameRow** (Props: `productId`, `candidate`, `onRequestDelete`)
- Name: Text-Input, on-blur PATCH.
- 5 Checkboxen (interessant/vielleicht/ja/nein/favourit) — on-change PATCH.
- Bemerkungen: Text-Input (einzeilig, max 300), on-blur PATCH.
- Archiv: Checkbox — on-change PATCH; wenn aktiv und `showArchived = false` verschwindet die Zeile beim nächsten Refetch.
- Mülltonne (Hover-revealed) → `onRequestDelete(candidate)`.

**BrandFavoritesPanel** (Props: `productId`, `candidates`)
- Filtert `candidates.filter(c => c.is_favorite === 1 && !c.is_archived)`.
- Zeigt nichts, wenn leer.
- Header "Recherche" + Untertitel "Pruefe Markenrecht, Domains und Social Media".
- Grid mit `BrandFavoriteCard` pro Favorit.

**BrandFavoriteCard** (Props: `productId`, `candidate`)
- Karten-Layout, Header: Name (groß), kleiner Hinweis "Favorit".
- 4 Status-Pillen-Gruppen: Markenrecht / .com / .de / Social Media. Jede Gruppe rendert drei kleine Buttons "frei | belegt | unklar". Klick → on-change PATCH (toggle: ein bereits aktiver Wert klickt zurück auf `null`).
- URL-Feld: Text-Input mit `type="url"`, on-blur PATCH.
- Notizen: Textarea (auto-grow, max 2000), on-blur PATCH.

**DeleteBrandNameDialog** (Props: `productId`, `candidate`, `onClose`)
- Confirm-Modal analog zu `DeleteSampleDialog`. Text: "„X" wird dauerhaft entfernt".
- Verwendet `useDeleteCandidate`.

### Einbindung
In `frontend/src/pages/amazon/AmazonProductDetailPage.tsx`: unter der `<SourcingSection productId={product.id} />`-Zeile zusätzlich:

```tsx
<BrandNameSection productId={product.id} />
```

Die rechte Sektionen-Spalte (jetzt `<div className="flex flex-col gap-4">`) zeigt die Sektionen untereinander.

## PDF-Export

Hilfsmodul `frontend/src/lib/amazon/exportBrandPdf.ts`:

```ts
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import type { BrandPayload } from '../../api/amazon.api';

export function exportBrandPdf(product: { name: string }, payload: BrandPayload): void { … }
```

**Inhalt:**
1. Titelzeile: `Markennamen — <product.name>` (24pt).
2. Datums-Zeile (klein, grau): `Stand: <date>`.
3. Wenn `payload.brand.notes` vorhanden: Block "Notizen:" + Text.
4. Tabelle der nicht-archivierten Namen mit Spalten:
   - Name · Interessant (✓/—) · Vielleicht · Ja · Nein · ★ Favorit · Bemerkungen
5. Pro Favorit (nicht-archiviert) ein Recherche-Block:
   ```
   ── <Name> ──
   Markenrecht: frei/belegt/unklar (oder "—")
   .com Domain: …
   .de Domain:  …
   Social Media: …
   URL: …
   Notizen: …
   ```
6. Footer: Seitenzahl + Erzeugt von "Benny Dashboard".

**Dateiname:** `Markennamen_<slug(product.name)>_<YYYY-MM-DD>.pdf`. `slug` ersetzt Whitespace/Sonderzeichen mit `_`, max 50 Zeichen.

**Trigger:** Button "PDF exportieren" in der Toolbar von `BrandNameTable`. Klick ruft `exportBrandPdf(...)` synchron — kein Server-Roundtrip.

## Visual Design

- Brand-Sektion: Akzentfarbe `#f472b6` (pink-400), Icon `label`.
- Status-Pillen (frei/belegt/unklar):
  - `frei` → grün `#34d399`
  - `belegt` → rot `#fca5a5`
  - `unklar` → orange `#fdba74`
- Favoriten-Karten: leichter Pink-Tint im Border (`#f472b626`), `rounded-lg`, Grid `lg:grid-cols-2`.
- Doppelte-Namen-Warnung: kleiner Hinweistext orange `#fdba74` direkt unter dem Eingabefeld.
- Sektion-Notizen-Textarea: gleiche Styles wie andere Inputs, Background `var(--color-surface-container-low)`.

## Fehlerbehandlung

### Client
- Doppelte-Namen-Warnung beim Tippen (case-insensitive Vergleich gegen alle Candidates).
- 100er-Limit: Add-Button disabled mit Tooltip.

### Server (autoritativ)
- Alle Enums geprüft → 400.
- Text-Längen geprüft → 400.
- Candidate-Limit überprüft → 400 mit klarer Message.
- 404 wenn Produkt/Candidate nicht gefunden.

### UI
- Save-Fehler: `AutosaveIndicator` (bestehendes Komponent) erkennt automatisch via `useIsMutating` und zeigt Fehler.
- Listen-Load-Fehler: Inline-Error + "Erneut laden"-Button in der Sektion.

## Tests

### Backend (vitest, gegen :memory:-DB)
**Migration 059:**
- Spalte `sample_ordered` existiert mit Default 0.
- CHECK weist 2 ab.

**Migration 060:**
- Beide Brand-Tabellen existieren mit allen Spalten.
- CHECK-Constraints: status/research-status/Bool-Felder.
- Cascade-Delete: Produkt löschen → brand und alle Candidates weg.

**Integration `integration.amazon_sourcing.test.ts` (Ergänzung):**
- PATCH mit `sample_ordered: 1` setzt Wert.
- PATCH `sample_ordered: 2` → 400.

**Integration `integration.amazon_brand.test.ts` (neu):**
- GET legt brand-Eintrag bei Bedarf an.
- POST `/names` legt Eintrag an, sort_order = max+1.
- POST mit leerem Namen → 400.
- POST nach 100 Einträgen → 400 ("limit reached").
- PATCH ändert Bool-Felder, Enum-Felder, Texte (mit Trim).
- PATCH `trademark_status: 'unklar'` OK; `'kaputt'` → 400.
- PATCH `remarks` > 300 Zeichen → 400.
- PATCH `research_notes` > 2000 Zeichen → 400.
- DELETE entfernt Eintrag; 404 wenn Candidate-ID zu anderem Produkt gehört.
- Cascade-Delete vom Produkt entfernt Brand + alle Candidates.

### Manuelles UAT
- Sample-Tabelle: Beauftragt-Checkbox togglen → bleibt nach Reload.
- Brand-Sektion erscheint auf der Detail-Seite unter Sourcing.
- Sektion-Notizen tippen → on-blur Autosave-Indikator.
- Status auf "In Bearbeitung".
- "Acme" als Namen anlegen → erscheint in Tabelle.
- Nochmal "acme" tippen → Warnung "Name 'Acme' existiert bereits".
- Hinzufügen trotzdem → zweite Zeile, beide sichtbar.
- Erste Zeile auf "Interessant" + "Favourit" → Favoriten-Recherche-Block erscheint mit einer Karte.
- Markenrecht: "unklar" → Pille aktiv.
- .com: "frei" → Pille grün.
- Recherche-URL eintippen, Tab → gespeichert.
- Zweiten Namen archivieren → verschwindet bei Toggle "aus".
- Toggle "Archivierte einblenden" → erscheint wieder mit grauem Hinweis.
- "PDF exportieren" → Download startet, Datei zeigt nicht-archivierte Namen + Favoriten-Block.
- Sektion zuklappen → bleibt nach Reload zugeklappt.
- Memory-Fallen: Backend nach Routen-Änderung neu starten; Browser-Cache umgehen.

## Sicherheit
- Alle neuen Routes hinter JWT-Guard.
- Nur Prepared Statements.
- Candidate-Limit verhindert versehentliche Insert-Loops.
- Schema-only-Migrations → automatisches Backup von `migrate.ts` greift.

## Offene Punkte (Schritt 4+)
- Drag&Drop zwischen Sektionen (sobald 3+ existieren).
- Drag&Drop in Namens-Tabelle zum Umsortieren.
- Optionale Domain-Verfügbarkeits-API (Whois/DPMA) — User pflegt bisher manuell.
- Weitere Sektionen (Produktentwicklung, Marketing, Preisstrategie etc.).
