# Amazon Produkt-Detail — Sourcing-Sektion (Schritt 2)

**Status:** Entwurf — bereit zur Review
**Datum:** 2026-06-01
**Modul:** Amazon Produkt-Detail (`/amazon/products/:id`)

---

## Ziel

Die erste inhaltliche Sektion der Produkt-Detail-Seite: **Sourcing**. Sie enthält eine 9-Punkte-Checkliste ("Sourcing Schritte anzeigen") und eine erweiterbare Sample-Vergleichs-Tabelle. Die Sektion ist als aufklappbares Akkordeon implementiert, hat einen manuell setzbaren Status und speichert alle Eingaben automatisch. Architektur und Komponenten werden so angelegt, dass weitere Sektionen (Marketing, Produktentwicklung etc.) später additiv ergänzt werden können — Drag&Drop zwischen Sektionen kommt, sobald mindestens zwei existieren.

## Scope

### In Scope (Schritt 2)
- Backend: zwei neue Tabellen `amazon_sourcing` (1:1) und `amazon_sourcing_samples` (1:n) mit Cascade-Delete am Produkt.
- Backend-Routes für GET, PATCH, sample CRUD inkl. Winner-Exklusivität.
- Frontend: `SourcingSection` als aufklappbares Akkordeon, eingebunden in die rechte Spalte der Detail-Seite.
- Wiederverwendbare `SectionHeader`-Komponente (Icon + Titel + Status-Badge + Chevron) — als Basis für spätere Sektionen.
- 9 hartkodierte Checkpoints, Klick toggelt mit Auto-Save (optimistic).
- Sample-Tabelle: Zeilen hinzufügen / löschen, alle Felder inline editierbar, on-blur bzw. on-change Auto-Save.
- Winner-Radio: nur eine Zeile pro Produkt; das Setzen entfernt den Winner-Flag aller anderen Samples in einer Transaktion.
- `AutosaveIndicator` auf der Detail-Seite zeigt globalen Speicherzustand.

### Explizit out of Scope (folgt später)
- Drag&Drop zum Umsortieren der Samples (neue Samples landen unten via `sort_order = max+1`).
- Drag&Drop zwischen Sektionen (heute existiert nur eine).
- Status-Automatik aus Checklist-Fortschritt — Status ist heute manuell setzbar.
- Export der Vergleichstabelle als PDF/CSV.
- Sample-Bilder (nur ein Notizen-Textfeld).
- Mehrwährungs-Konvertierung für `sample_kosten` (Freitext mit Suffix wie "USD").
- Weitere Sektionen (Produktentwicklung, Marketing, etc.).

## Datenmodell

Neue Migration `058_amazon_sourcing.sql` in `backend/src/db/migrations/`.

```sql
CREATE TABLE amazon_sourcing (
  product_id                    INTEGER PRIMARY KEY
                                REFERENCES amazon_products(id) ON DELETE CASCADE,
  status                        TEXT    NOT NULL DEFAULT 'offen'
                                CHECK (status IN ('offen','in_bearbeitung','erledigt')),
  is_expanded                   INTEGER NOT NULL DEFAULT 1
                                CHECK (is_expanded IN (0,1)),
  cp_hersteller_gefiltert       INTEGER NOT NULL DEFAULT 0 CHECK (cp_hersteller_gefiltert IN (0,1)),
  cp_anforderungen_kommuniziert INTEGER NOT NULL DEFAULT 0 CHECK (cp_anforderungen_kommuniziert IN (0,1)),
  cp_erste_preise_erhalten      INTEGER NOT NULL DEFAULT 0 CHECK (cp_erste_preise_erhalten IN (0,1)),
  cp_usp_geprueft               INTEGER NOT NULL DEFAULT 0 CHECK (cp_usp_geprueft IN (0,1)),
  cp_samples_angefragt          INTEGER NOT NULL DEFAULT 0 CHECK (cp_samples_angefragt IN (0,1)),
  cp_sample_analyse             INTEGER NOT NULL DEFAULT 0 CHECK (cp_sample_analyse IN (0,1)),
  cp_vergleichstabelle          INTEGER NOT NULL DEFAULT 0 CHECK (cp_vergleichstabelle IN (0,1)),
  cp_finale_verhandlung         INTEGER NOT NULL DEFAULT 0 CHECK (cp_finale_verhandlung IN (0,1)),
  cp_zahlungsziel               INTEGER NOT NULL DEFAULT 0 CHECK (cp_zahlungsziel IN (0,1)),
  updated_at                    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE amazon_sourcing_samples (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id      INTEGER NOT NULL
                  REFERENCES amazon_products(id) ON DELETE CASCADE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_winner       INTEGER NOT NULL DEFAULT 0 CHECK (is_winner IN (0,1)),
  hersteller      TEXT,
  sample_kosten   TEXT,
  besonderheiten  TEXT,
  lieferzeit      TEXT,
  qualitaet       TEXT CHECK (qualitaet IS NULL OR qualitaet IN ('sehr_gut','gut','mittel','schlecht')),
  bewertung       INTEGER CHECK (bewertung IS NULL OR (bewertung >= 0 AND bewertung <= 5)),
  status          TEXT CHECK (status IS NULL OR status IN ('angefragt','bestellt','erhalten','abgelehnt')),
  notizen         TEXT,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX amazon_sourcing_samples_product_idx
  ON amazon_sourcing_samples (product_id, sort_order, id);
```

**Verhalten:**
- Cascade-Delete: Löschen eines Produkts entfernt automatisch `amazon_sourcing` und alle `amazon_sourcing_samples`.
- Lazy-Init: `GET /products/:id/sourcing` legt den `amazon_sourcing`-Eintrag mit Default-Werten an, falls noch nicht vorhanden.
- Winner-Exklusivität wird im Backend in einer Transaktion erzwungen (CHECK reicht nicht, weil mehrere Zeilen betroffen sind).

## Backend-API

Neue Datei `backend/src/routes/amazon.sourcing.routes.ts`, in `backend/src/app.ts` zusätzlich unter `/api/amazon` gemountet (nach den existierenden `amazonProductsRoutes`).

| Methode | Pfad | Body | Antwort |
|--------|------|------|---------|
| GET    | `/api/amazon/products/:id/sourcing` | — | `200 { sourcing: {...}, samples: [...] }`. Legt `amazon_sourcing` bei Bedarf an. Samples sortiert nach `sort_order, id`. |
| PATCH  | `/api/amazon/products/:id/sourcing` | `Partial<{ status, is_expanded, cp_*: 0|1 }>` | `200 { sourcing }` |
| POST   | `/api/amazon/products/:id/sourcing/samples` | `{}` | `201 { sample }` — leere Zeile, `sort_order = max+1` |
| PATCH  | `/api/amazon/products/:id/sourcing/samples/:sampleId` | `Partial<{ is_winner, hersteller, sample_kosten, besonderheiten, lieferzeit, qualitaet, bewertung, status, notizen, sort_order }>` | `200 { sample }` |
| DELETE | `/api/amazon/products/:id/sourcing/samples/:sampleId` | — | `204` |

### Validierungsregeln
- `status` (sourcing): genau einer aus `offen | in_bearbeitung | erledigt`.
- `qualitaet` (sample): einer aus `sehr_gut | gut | mittel | schlecht` oder `null`.
- `status` (sample): einer aus `angefragt | bestellt | erhalten | abgelehnt` oder `null`.
- `bewertung`: Integer `0..5` oder `null`.
- `is_winner`, `is_expanded`, `cp_*`: exakt 0 oder 1.
- Textfelder werden serverseitig getrimmt. Leerer String wird zu `null` umgewandelt.
- `sample_kosten`, `besonderheiten`, `lieferzeit`, `hersteller`, `notizen`: max 500 Zeichen → 400 bei Überschreitung.
- Sample-Limit pro Produkt: 50. Überschreitung beim POST → `400 { error: 'sample limit reached' }`.
- Produkt-ID ungültig oder nicht gefunden → `404`. Sample gehört nicht zum Produkt → `404`.

### Mechanik
- **Winner-Exklusivität** (PATCH `.../samples/:id { is_winner: 1 }`): in einer SQL-Transaktion erst alle Samples mit `product_id = ?` auf `is_winner = 0` setzen, dann das gewählte auf 1.
- Alle PATCH-Handler aktualisieren `updated_at = unixepoch()` automatisch.
- Sample-Limit-Check vor `INSERT` mit `SELECT COUNT(*)`.

## Frontend-Struktur

### Dateien
```
frontend/src/components/amazon/
  SectionHeader.tsx               # wiederverwendbar (Icon, Titel, Status, Chevron)
  SectionStatusBadge.tsx          # 3-Werte-Dropdown (offen/in_bearbeitung/erledigt)
  SourcingSection.tsx             # Akkordeon-Wrapper, lädt Sourcing-Daten
  SourcingChecklist.tsx           # die 9 Checkboxen mit hartkodierten Labels
  SourcingSampleTable.tsx         # Tabellen-Container + "+ Sample hinzufuegen"
  SourcingSampleRow.tsx           # eine editierbare Zeile
  AutosaveIndicator.tsx           # Footer auf Detail-Seite
  DeleteSampleDialog.tsx          # Confirm vor Sample-Loeschen

frontend/src/hooks/amazon/
  useSourcing.ts                  # TanStack-Query Hooks fuer Sourcing + Samples

frontend/src/api/amazon.api.ts    # ergaenzt um Types + Wrappers
```

### Erweiterung von `amazon.api.ts`
Neue Types:
- `SourcingStatus = 'offen' | 'in_bearbeitung' | 'erledigt'`
- `SampleQuality = 'sehr_gut' | 'gut' | 'mittel' | 'schlecht'`
- `SampleStatus = 'angefragt' | 'bestellt' | 'erhalten' | 'abgelehnt'`
- `Sourcing` (alle 9 cp_-Felder, status, is_expanded, updated_at)
- `SourcingSample` (alle Sample-Spalten)
- `SourcingPayload = { sourcing: Sourcing; samples: SourcingSample[] }`

Neue Funktionen:
- `fetchSourcing(productId)`
- `updateSourcing(productId, patch)`
- `createSample(productId)`
- `updateSample(productId, sampleId, patch)`
- `deleteSample(productId, sampleId)`

### Hook `useSourcing.ts`
- `useSourcing(productId)` → `useQuery({ queryKey: ['amazon','products', productId, 'sourcing'], ... })`
- `useUpdateSourcing(productId)` → `useMutation` mit optimistic Update auf der `sourcing`-Query.
- `useCreateSample(productId)` → `useMutation`, append-to-list via `setQueryData`.
- `useUpdateSample(productId)` → `useMutation` mit optimistic Update der Liste; bei `is_winner: 1` alle anderen lokal auf 0 setzen.
- `useDeleteSample(productId)` → `useMutation`, remove-from-list.

### Einbindung in `AmazonProductDetailPage.tsx`
- Rechte Spalte wird zu `<div className="flex flex-col gap-4">` mit `<SourcingSection productId={id} />` als erstem (und vorerst einzigem) Kind.
- Unter dem Grid: `<AutosaveIndicator />`.
- Der bisherige „Details — Felder folgen…"-Platzhalter wird entfernt.

### Komponenten-Verhalten

**SectionHeader** (Props: `icon`, `title`, `status`, `expanded`, `onToggleExpand`, `onChangeStatus`)
- Linke Seite: Icon + Titel.
- Rechte Seite: `SectionStatusBadge` + Chevron-Icon.
- Header ist klickbar; klick togglt `expanded` (außer auf Status-Badge und seinem Dropdown — `stopPropagation`).
- Chevron rotiert um 180° wenn ausgeklappt.

**SectionStatusBadge** (3 Werte, Pattern aus `ProductStatusBadge`)
- Farbcode: `offen` grau, `in_bearbeitung` blau, `erledigt` grün.
- Click-outside und Escape schließen das Dropdown.
- Pending-Spinner am gewählten Eintrag während Mutation.

**SourcingChecklist**
- Liste mit 9 hartkodierten Items: `{ key: 'cp_xxx', label: 'Hersteller gefiltert' }` etc.
- Klick auf die Zeile (oder die Checkbox) ruft `updateSourcing({ [key]: value ? 0 : 1 })`.
- Optimistic Update; bei Fehler Rollback + Autosave-Indikator zeigt Fehler.

**SourcingSampleTable**
- Spaltenüberschriften: Winner · Hersteller · Sample Kosten · Besonderheiten · Lieferzeit · Qualität · Bewertung · Status · Notizen · (Aktionen).
- Body: `samples.map(s => <SourcingSampleRow ... />)`.
- Empty State: zentrierter Text "Noch keine Samples — auf '+ Sample hinzufuegen' klicken".
- Unten: `+ Sample hinzufuegen`-Button. Disabled bei `samples.length >= 50`. Bei Klick: `createSample.mutate()`.

**SourcingSampleRow** (Props: `sample`, `productId`)
- Inputs sind kontrolliert; lokaler State spiegelt `sample.*`-Werte, on-blur PATCH.
- Winner-Radio: Klick ruft `updateSample({ is_winner: 1 })`.
- Selects (Qualität, Status): on-change PATCH.
- Bewertung: 5 Sterne-Buttons; Klick auf den n-ten Stern sendet `bewertung: n`.
- Mülltonne (Hover-revealed): öffnet `DeleteSampleDialog`.
- Felder-Layout: horizontal scrollbarer Table-Row; auf engen Bildschirmen scrollt der Body, Header bleibt sticky.

**AutosaveIndicator**
- Beobachtet TanStack Querys über `useIsMutating({ queryKey: ['amazon'] })`.
- States: 
  - default: `Aenderungen werden automatisch gespeichert` (subtil grau)
  - während Mutation: `Speichere …` (kleines Spinner-Icon)
  - nach Erfolg: `Gespeichert ✓` für 2 Sekunden (grün), dann zurück zum Default
  - bei Fehler: `Speichern fehlgeschlagen` (rot)
- Lebt in der Detail-Seite, beobachtet alle Amazon-Mutations.

## Visual Design

- Sektion-Karte: gleicher Look wie heutige Spalten (`var(--color-surface-container-low)`, dezenter Border, `rounded-xl`).
- Section-Header-Padding: `px-5 py-4`.
- Sourcing-Akzentfarbe: `#a78bfa` (purple-400) — passt zum Sourcing-Icon `inventory_2` aus material-symbols.
- Status-Badge-Farben: `offen` `#9ca3af` (gray), `in_bearbeitung` `#60a5fa` (blue), `erledigt` `#34d399` (emerald).
- Checkboxen: native HTML-Checkboxen mit `accent-color: var(--color-primary)`.
- Tabellen-Inputs: dezent, `rounded-md`, `border` in `rgba(255,255,255,0.08)`. Hover-Border heller.
- Sterne-Bewertung: 5 `star`-Icons aus material-symbols, gefüllte vs. outline-Variante je nach Status.
- Sample-Row Trennlinie: `border-b` in `rgba(255,255,255,0.04)`.

## Fehlerbehandlung

### Client-Validierung (UX)
- Bewertung nur per Stern-Klick (kein Freitext).
- Sample-Limit (50) blockiert Hinzufügen mit Tooltip.

### Server-Validierung (autoritativ)
- Alle Enums geprüft, ungültige Werte → 400 mit klarer Message.
- Bewertung außerhalb 0..5 → 400.
- Sample-Limit-Überschreitung → 400.
- Produkt/Sample nicht gefunden → 404.

### UI-Fehlerverhalten
- Save-Fehler: optimistic Update wird zurückgerollt; `AutosaveIndicator` zeigt rot „Speichern fehlgeschlagen". Eingabe bleibt im Feld stehen, erneuter Blur löst neuen Versuch aus.
- GET-Fehler: oberhalb der Sektion ein Inline-Hinweis „Sourcing konnte nicht geladen werden" mit „Erneut laden"-Button.
- Sample-Löschen-Fehler: Confirm-Modal zeigt Fehlerzeile, Eintrag bleibt.

## Tests

### Backend (vitest, gegen :memory:-DB)
- Schema-Test: beide Tabellen existieren, CHECK-Constraints für Status/Qualität/Bewertung/Bool-Felder.
- Integration-Tests:
  - `GET .../sourcing` legt Default-Eintrag an.
  - Zweiter GET liefert denselben Eintrag (keine Duplikate).
  - `PATCH .../sourcing { cp_samples_angefragt: 1 }` setzt das Feld; ungültiger Wert (z.B. 2) → 400.
  - `PATCH .../sourcing { status: 'offen' }` OK; `{ status: 'kaputt' }` → 400.
  - `POST .../samples`: legt leere Zeile an, `sort_order = max+1`. Nach 3 POSTs: sort_orders 1, 2, 3.
  - `PATCH .../samples/:id { is_winner: 1 }`: setzt alle anderen auf 0 (Transaktion). Nochmal anderes Sample auf Winner → vorheriges wird 0.
  - `PATCH .../samples/:id { bewertung: 7 }` → 400.
  - `PATCH .../samples/:id { qualitaet: 'mittel' }` OK; `'super_gut'` → 400.
  - `DELETE .../samples/:id` entfernt nur das Sample.
  - Cascade: `DELETE /products/:id` entfernt `amazon_sourcing` + alle Samples.
  - Sample-Limit: 50 anlegen OK, 51. → 400.

### Manuelles UAT (in Spec dokumentiert)
- Detail-Seite eines Produkts ohne Sourcing-Eintrag aufrufen → Sektion erscheint mit Default-State (Status `offen`, alle Checkboxen leer, keine Samples).
- Status auf `in_bearbeitung` → Reload → Status bleibt.
- Checkbox "Samples angefragt" setzen → Reload → bleibt.
- "+ Sample hinzufuegen" → leere Zeile erscheint.
- Hersteller eintippen, Tab/Blur → Autosave-Footer: "Speichere…" → "Gespeichert ✓".
- Qualität-Dropdown ändern → sofort Autosave.
- Sterne anklicken: 3. Stern → Bewertung = 3.
- Zweites Sample anlegen, Winner darauf setzen → erstes verliert Winner-Status.
- Sample löschen mit Confirm.
- Sektion zuklappen → Reload → bleibt zugeklappt.
- Bekannte Fallen aus `feedback_uat_workflow`: Backend nach Routen-Änderung neu starten.

## Sicherheits- und Datenschutz-Hinweise
- Alle neuen Routes hinter dem JWT-Guard (analog `amazon.products.routes.ts`).
- Keine User-Inputs werden in SQL interpoliert — ausschließlich Prepared Statements.
- Sample-Limit verhindert versehentliche unbegrenzte Insert-Loops durch fehlerhafte Frontend-Mutationen.
- Schema-only-Migration → automatisches Backup von `migrate.ts` greift.

## Offene Punkte (für Schritt 3+ vorbereiten)
- Weitere Sektionen (Produktentwicklung, Marketing, Preisstrategie etc.) — Schema-Pattern liegt vor, jede Sektion bekommt eigene Tabelle(n).
- Sobald 2. Sektion existiert: Drag&Drop zwischen Sektionen ergänzen (additive `amazon_product_sections`-Master-Tabelle mit `sort_order` und Section-Status).
- Status-Automatik aus Checklist-Fortschritt — auf User-Wunsch ergänzbar.
- Sample-Bilder im Notizfeld → falls gewünscht, separater Upload-Endpoint analog zu Produktbild.
