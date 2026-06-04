# Amazon Checkliste — Master + Produkt-Kopie Design

**Status:** Entwurf — bereit zur Review
**Datum:** 2026-06-04
**Modul:** Amazon

---

## Ziel

Eine zentrale "Master-Checkliste" unter `/amazon/entwicklung/checkliste`, die wiederkehrende Aufgaben rund um Produkteinführung dokumentiert (Gründung, Produktsuche, Produkteinkauf, Listing, EU-Verkauf etc.). Beim Anlegen eines neuen Produkts wird die aktuelle Master-Checkliste 1:1 in das Produkt kopiert; bestehende Produkte ohne Checkliste bekommen diese beim ersten Detail-Aufruf nachgereicht. Ab dem Kopiervorgang ist die Produkt-Checkliste unabhängig — spätere Master-Änderungen wirken nicht zurück, und Produkt-Änderungen wirken nicht auf den Master.

## Scope

### In Scope (Schritt 1)
- Sidebar-Unterpunkt "Checkliste" unter Amazon → Entwicklung.
- Master-Seite mit CRUD für Sections und Items (Beschreibung · Erledigt · Bemerkung · optionaler Link).
- Pro-Produkt-Checkliste als neue Sektion auf der Detail-Seite (analog Sourcing / Markenname), eingeklappbar.
- Auto-Init: beim ersten GET der Produkt-Checkliste wird Master kopiert, falls leer.
- Seed-Daten: 66 Items in 5 Sections aus dem Excel-Original werden via Migration eingespielt.
- "Erledigt" auf der Master-Seite ist editierbar, aber wird beim Kopieren ins Produkt immer auf 0 zurückgesetzt.

### Explizit out of Scope
- Drag&Drop zum Umsortieren von Sections/Items. Items landen via `sort_order = max+1` ans Ende. Manuelles Up/Down kommt später bei Bedarf.
- Master-Änderungen in bestehende Produkt-Checklisten zurückspielen (bewusst nicht).
- Statistik / Fortschrittsanzeige pro Section (kann später additiv kommen).
- Export der Checkliste als PDF (kann später analog Brand-PDF nachgereicht werden).
- Sections-Farben pro Section (alle Sections haben einheitliches Akzentstyling).

## Datenmodell

Vier neue Tabellen in `backend/dashboard.db` via Migration 062. Master und Produkt-Kopien sind komplett getrennt.

```sql
CREATE TABLE amazon_checklist_master_sections (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  title       TEXT    NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE amazon_checklist_master_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id  INTEGER NOT NULL
              REFERENCES amazon_checklist_master_sections(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  description TEXT    NOT NULL,
  remark      TEXT,
  link_url    TEXT,
  link_label  TEXT,
  is_done     INTEGER NOT NULL DEFAULT 0 CHECK (is_done IN (0,1)),
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX amazon_checklist_master_items_section_idx
  ON amazon_checklist_master_items (section_id, sort_order, id);

CREATE TABLE amazon_checklist_product_sections (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL
              REFERENCES amazon_products(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  title       TEXT    NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX amazon_checklist_product_sections_product_idx
  ON amazon_checklist_product_sections (product_id, sort_order, id);

CREATE TABLE amazon_checklist_product_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id  INTEGER NOT NULL
              REFERENCES amazon_checklist_product_sections(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  description TEXT    NOT NULL,
  remark      TEXT,
  link_url    TEXT,
  link_label  TEXT,
  is_done     INTEGER NOT NULL DEFAULT 0 CHECK (is_done IN (0,1)),
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX amazon_checklist_product_items_section_idx
  ON amazon_checklist_product_items (section_id, sort_order, id);
```

**Cascade-Verhalten:**
- Produkt gelöscht → product_sections weg → product_items weg.
- Master-Section gelöscht → master_items weg.
- Master-Änderungen wirken nicht auf bestehende Produkt-Kopien (keine FK zwischen Master und Produkt).

## Seed-Daten (Migration 062, Teil 2)

Direkt nach den CREATE-Statements werden via INSERT die folgenden 5 Sections + 66 Items eingespielt.

### Section 1 — Gründung und einmalige Aufgaben
| Beschreibung | Bemerkung |
|---|---|
| Erlaubnis Arbeitgeber | Kann ein Kündigungsgrund sein |
| Elster Registrierung | Mit ElsterSecureApp |
| Gewerbeanmeldung durchführen | Bei der Stadt |
| Steuerlichen Erfassungsbogen einreichen (nach Gewerbebescheinigung) | Innerhalb von 4 Wochen mit Elster |
| Steuernummer und Umsatzsteuer-ID beantragen | Mit Steuerlichem Erfassungsbogen |
| Sozialversicherung anmelden/informieren | Über Arbeitgeber/Selbstständigkeit |
| Anmeldung bei der Berufsgenossenschaft | Innerhalb einer Woche |
| EORI Nummer beantragen | Beim Zoll |
| Geschäftskonto eröffnen mit Kreditkarte | Online (N26 Bank/gebührenfrei.com) |
| Registrierung Buchhaltungssoftware | Lexware Office (Innerhalb von DE empfohlen) |
| Steuerberater finden (mit E-Commerce Expertise) | DHW in Oberhausen |
| Im Amazon Seller Center registrieren | Keine Kosten ohne Umsatz |
| Alle Unternehmensangaben bei Amazon hinterlegen (UID, Adresse…) | Markenregistrierung geht auch später noch |
| Kreditkarte bei Amazon hinterlegen | Kreditkarten und Bankkonto registrieren |

### Section 2 — Produktsuche
| Beschreibung | Bemerkung | Link |
|---|---|---|
| Profitables Produkt mit USP suchen (Helium 10) | Siehe Produktcheckliste | |
| Marge grob berechnen | Profitabilitätsrechner Helium10 | |
| Patent & Designschutz abklären | EUIPO eSearch Plus | |
| Zertifikate abklären | TÜV, QIMA, Travado Compliance | |
| Logo designen und Markennamen ausdenken | Canva, namelix, TMView, DPMA | |
| Samples bestellen | 2-3 Samples bestellen | |
| Transportkosten anfragen | asia-logistics.de, sam-logistik.de, AGL | |
| Zolltarifnummer herausfinden | erfrage bei info.gewerblich@zoll.de | EZT Online → `https://auskunft.ezt-online.de/` |
| Marge nochmals kalkulieren | Chance/Risiko Rechner | |
| Markennamen erstellen & Marke anmelden | Beim DPMA oder EUIPO mit Rabatt | |
| Domain registrieren | checkdomain.de (gluecksberg.com) | |
| Mitbewerber Produkte bestellen und vergleichen | Danach wieder zurückschicken | |
| Für einen Hersteller entscheiden | Vorteilhaft über Jingsourcing | |

### Section 3 — Produkteinkauf
| Beschreibung | Bemerkung |
|---|---|
| PO Agreement erstellen und unterzeichnen lassen | Mit ChatGPT |
| Bei GS1 registrieren und EANs kaufen | SmartStarter 10 GS1 mit Zertifikat (empfohlen) |
| Barcodes für jede Variante erstellen | GS1 GTIN anlegen |
| Verpackungsdesign erstellen (lassen) | Packaging Template bei Lieferanten anfragen |
| Flyer ertellen (lassen) | Rahad/ChatGPT/Canva |
| Product Etikett/Label (Care Label) erstellen, wenn nötig | ChatGPT/Canva |
| QR Codes (pro Variante) für Bewertungen erstellen | In der AMZ Ecosystem App (bei Ressourcen) |
| Bewertungskarten ertellen (lassen) | Rahad/ChatGPT/Canva |
| Amazon Listing anlegen | Amazon Seller Account |
| QR Code mit Bewertunglink hinterlegen | In der AMZ Ecosystem App (bei Ressourcen) |
| TÜV Zertifizierung und Labortests durchführen lassen | TÜV Süd, TÜV Rheinland, QIMA |
| Masterbox Label (mit heavy weight label) erstellen | Word Template |
| Bestellung aufgeben über Alibaba Trade Assurance | Alibaba Trade Assurance oder Jingsourcing (sicher) |
| Import organisieren (Invoice, Packliste & ZTN mitsenden) | Amazon AGL oder Asia Logistik |
| Transportversicherung abschließen | Direkt über AGL oder Allianz, AXA etc |
| Qualitätskontrolle in China organisieren | AsiaInspection, Jingsourcing, GQC (Stephan) |
| Transportversicherung abschließen | Über AGL |
| Registrierung Verpackungsregister LUCID | verpackungsregister.org |
| Verpackungslizenzierung LUCID | Usepac/Prezero/DerGrünePunkt (empfohlen) |

### Section 4 — Amazon Listing erstellen
| Beschreibung | Bemerkung |
|---|---|
| Produktbilder erstellen | KI (Freepik) |
| Keyword Recherche | Helium 10 Cerebro und Keyword Prozessor |
| Titel erstellen | <200 Bytes am besten sogar <80 Bytes |
| Bullet Points erstellen | 200-249 Bytes nicht >249 |
| Produktsuche (Backend) Keywords | <249 Bytes |
| Produktbeschreibung erstellen | <2000 Bytes |
| AGB, Impressum etc. bei Amazon hinterlegen | IT-Rechts-Kanzlei |
| Betriebs- & Produkthaftpflichtversicherung + Rechtschutz abschließen | Surein.de |
| eBook erstellen | |
| Rechnungssoftware anbinden an Seller Center | Billbee (empfohlen mit Rabattlink) |
| Anlieferplan erstellen | |
| Sellerboard anbinden | |
| Produkt launchen | |
| PPC schalten | Digital Roar |
| Bewertungsstrategie aufsetzen | |
| Vine Kampagne starten oder 3-5 Bewertungen organisieren | |
| Werbung optimieren | |
| Weitere Verkaufsstrategien einführen (Blitzangebote, Coupons…) | |
| Bewertungen analysieren und Produkt bei Nachbestellung verbessern | |

### Section 5 — Bei Verkäufen außerhalb der EU
| Beschreibung | Bemerkung |
|---|---|
| Anmeldung OSS (One-Stop-Shop) | Nur mit DHW Steuerberater |

## Backend-API

Neue Datei `backend/src/routes/amazon.checklist.routes.ts`, gemountet unter `/api/amazon` (nach den bestehenden Amazon-Routes).

### Master-Endpoints
| Methode | Pfad | Body | Antwort |
|--------|------|------|---------|
| GET    | `/api/amazon/checklist/master` | — | `200 { sections: [{ id, title, sort_order, items: [...] }, …] }` sortiert |
| POST   | `/api/amazon/checklist/master/sections` | `{ title }` | `201 { section }` (sort_order = max+1) |
| PATCH  | `/api/amazon/checklist/master/sections/:id` | `Partial<{ title, sort_order }>` | `200 { section }` |
| DELETE | `/api/amazon/checklist/master/sections/:id` | — | `204` (Cascade entfernt Items) |
| POST   | `/api/amazon/checklist/master/sections/:id/items` | `{ description, remark?, link_url?, link_label? }` | `201 { item }` |
| PATCH  | `/api/amazon/checklist/master/items/:id` | `Partial<{ description, remark, link_url, link_label, sort_order, is_done }>` | `200 { item }` |
| DELETE | `/api/amazon/checklist/master/items/:id` | — | `204` |

### Produkt-Endpoints (mit Lazy-Init)
| Methode | Pfad | Body | Antwort |
|--------|------|------|---------|
| GET    | `/api/amazon/products/:id/checklist` | — | `200 { sections: [{ id, title, sort_order, items: [...] }, …] }`. **Lazy-Init:** wenn Produkt noch keine Section hat, wird die aktuelle Master-Checkliste 1:1 kopiert (alle Items mit `is_done = 0`). |
| POST   | `/api/amazon/products/:id/checklist/sections` | `{ title }` | `201 { section }` |
| PATCH  | `/api/amazon/products/:id/checklist/sections/:sid` | `Partial<{ title, sort_order }>` | `200 { section }` |
| DELETE | `/api/amazon/products/:id/checklist/sections/:sid` | — | `204` |
| POST   | `/api/amazon/products/:id/checklist/sections/:sid/items` | `{ description, remark?, link_url?, link_label? }` | `201 { item }` |
| PATCH  | `/api/amazon/products/:id/checklist/items/:iid` | `Partial<{ description, remark, link_url, link_label, sort_order, is_done }>` | `200 { item }` |
| DELETE | `/api/amazon/products/:id/checklist/items/:iid` | — | `204` |

### Validierung
- `description`: getrimmt, 1..500 Zeichen, sonst 400.
- `title`: getrimmt, 1..200 Zeichen, sonst 400.
- `remark`: max 1000 Zeichen, leer → null.
- `link_url`: max 500 Zeichen, leer → null. Keine URL-Schema-Validierung (User kann jede Form eintragen, die Frontend macht ein `target="_blank"` `rel="noopener"`).
- `link_label`: max 100 Zeichen, leer → null.
- `is_done`: 0 oder 1, sonst 400.
- `sort_order`: Integer, sonst 400.
- Produkt-/Section-/Item-ID-Validierung mit `Number.isInteger`.
- Section gehört nicht zum Produkt → 404 (wie bei Sample/Brand-Candidate-Patterns).

### Lazy-Init-Implementierung
Bei `GET /api/amazon/products/:id/checklist`:
1. Wenn `SELECT COUNT(*) FROM amazon_checklist_product_sections WHERE product_id = :id` > 0 → bestehende Daten laden und zurückgeben.
2. Sonst: in einer Transaktion alle Master-Sections + Items kopieren. `is_done` wird auf 0 zurückgesetzt. `sort_order` wird übernommen.
3. Dann das frisch gefüllte Set zurückgeben.

## Frontend-Struktur

### Routes (`frontend/src/routes/routes.tsx`)
Neue Route ergänzen:
```
/amazon/entwicklung/checkliste   →  AmazonChecklistMasterPage
```

Bestehende Detail-Route bleibt unverändert.

### Sidebar (`frontend/src/components/layout/navConfig.ts`)
Unter Amazon → Entwicklung kommt zusätzlich:
```
{ path: '/amazon/entwicklung/checkliste',  label: 'Checkliste',  icon: 'checklist' }
```

### Dateien (neu)
```
frontend/src/pages/amazon/
  AmazonChecklistMasterPage.tsx     # Master-Seite

frontend/src/components/amazon/checklist/
  ChecklistSectionBlock.tsx         # Section mit Header + Item-Liste + Add-Form
  ChecklistItemRow.tsx              # Eine Item-Zeile (Beschreibung · Erledigt · Bemerkung · Link · Edit-/Delete-Buttons)
  AddSectionForm.tsx                # Inline-Form für neue Section
  AddItemForm.tsx                   # Inline-Form für neues Item innerhalb einer Section
  EditItemDialog.tsx                # Modal für Bemerkung + Link-URL + Link-Label
  ChecklistSection.tsx              # Akkordeon-Wrapper für die Detail-Seite (analog SourcingSection)

frontend/src/api/amazon.api.ts      # ergänzt um Types + Wrappers
frontend/src/hooks/amazon/
  useChecklistMaster.ts             # TanStack Query Hooks für Master
  useChecklistProduct.ts            # TanStack Query Hooks für Produkt
```

### Erweiterung von `amazon.api.ts`
Neue Types:
```ts
export interface ChecklistItem {
  id: number;
  section_id: number;
  sort_order: number;
  description: string;
  remark: string | null;
  link_url: string | null;
  link_label: string | null;
  is_done: 0 | 1;
  created_at: number;
  updated_at: number;
}

export interface ChecklistSection {
  id: number;
  sort_order: number;
  title: string;
  items: ChecklistItem[];
  created_at: number;
  updated_at: number;
}

export interface ChecklistPayload {
  sections: ChecklistSection[];
}

export type SectionPatch = Partial<{ title: string; sort_order: number }>;
export type ItemPatch = Partial<{
  description: string;
  remark: string | null;
  link_url: string | null;
  link_label: string | null;
  sort_order: number;
  is_done: 0 | 1;
}>;
```

Wrapper-Funktionen für Master (mit Pfad `/amazon/checklist/master/...`) und Produkt (mit Pfad `/amazon/products/:productId/checklist/...`). 14 Funktionen insgesamt (7 Master + 7 Produkt — gleiche Struktur).

### Hook-Verhalten
- Query-Keys:
  - Master: `['amazon', 'checklist', 'master']`
  - Produkt: `['amazon', 'products', productId, 'checklist']`
- Alle Mutationen mit optimistischem Update auf der jeweiligen `ChecklistPayload`-Struktur.
- `is_done`-Toggle setzt `is_done = next` optimistic auf das Item in der Cache-Struktur.
- Bei Section-Delete / Item-Delete: optimistic Filtern aus Liste.
- Bei Section/Item-Create: optimistic anhängen, mit echter ID nach Server-Antwort ersetzen.

### Komponenten

**AmazonChecklistMasterPage:**
- Header: Icon `checklist` (lila) + Titel "Checkliste — Master" + kurze Erklärung "Diese Vorlage wird beim Anlegen eines neuen Produkts ins Produkt kopiert."
- Loading / Error wie bei den anderen Pages.
- Rendert je Section ein `ChecklistSectionBlock`.
- Unten: `AddSectionForm` zum Anlegen einer neuen Section.

**ChecklistSectionBlock** (Master- und Produkt-Modus):
- Section-Header: grüner Balken mit editierbarem Titel (on-blur PATCH), Mülltonne (Confirm).
- Item-Tabelle mit Spalten:
  | # | Beschreibung | Erledigt | Bemerkung | Link | Aktionen |
  Im Master ist `# = sort_order`, im Produkt: laufende Nummer in der Section.
- Inline-Edit für Beschreibung und Bemerkung (on-blur).
- Erledigt = Checkbox (sofort speichern).
- Link wird als klickbarer `<a target="_blank" rel="noopener">` mit `link_label` angezeigt; Edit-Button (`edit`) öffnet `EditItemDialog` (Bemerkung + Link-URL + Link-Label).
- Mülltonne pro Zeile mit Confirm.
- Unten in der Section: `AddItemForm` (einzeiliges Input + Button).

**ChecklistSection (Detail-Seite):**
- Akkordeon-Wrapper wie SourcingSection / BrandNameSection.
- Icon: `checklist`, Akzentfarbe `#a3e635` (lime-400, ähnlich grün wie im Excel).
- Status-Badge oben rechts: zeigt Fortschritt `X / Y` (erledigte / gesamt) als Pille.
- Body (wenn aufgeklappt): Liste aller Sections gerendert über `ChecklistSectionBlock`-Komponente im Produkt-Modus.

**EditItemDialog:**
- Modal mit drei Feldern: Bemerkung (Textarea, max 1000), Link-URL (Input, max 500), Link-Label (Input, max 100).
- Speichern → PATCH; Abbrechen → schließt ohne Änderung.

### Detail-Seite-Einbindung
In `AmazonProductDetailPage.tsx`, in der Sektionen-Spalte, nach `<BrandNameSection>`:
```tsx
<ChecklistSection productId={product.id} />
```

## Visual Design

- Section-Header im Master/Produkt: grüner Hintergrund (`#65a30d` mit reduzierter Opazität) + weiße/helle Schrift, analog Excel-Layout.
- Item-Zeilen alternierend nicht gestreift; Hover hellt minimal auf (`white/3`).
- Erledigt-Checkbox: Standard-Checkbox mit `accentColor: 'var(--color-primary)'`.
- Link in der Zeile: `text-decoration: underline`, Farbe `var(--color-primary)`.
- Edit-/Delete-Buttons als Hover-revealed Icons rechts.

## Fehlerbehandlung

### Client-Validierung
- Section-Title leer → Add-Button disabled.
- Item-Description leer → Add-Button disabled.
- Link-URL ohne `link_label` ist OK (Label kann leer bleiben, dann wird die URL als Label angezeigt).

### Server-Validierung (autoritativ)
- Längen-Limits wie oben dokumentiert → 400 mit klarer Message.
- ID-Validierung → 404 bei nicht gefunden.

### UI-Verhalten
- AutosaveIndicator zeigt weiterhin Save / Error wie bisher (greift via `useIsMutating` automatisch).
- Listen-Load-Fehler: Inline-Error mit "Erneut laden"-Button.

## Tests

### Backend (vitest, gegen :memory:-DB)
**Schema-Test** (`schema.amazon_checklist.test.ts`):
- 4 Tabellen existieren mit allen Spalten + Indizes.
- CHECK-Constraints (`is_done` 0/1).
- Cascade-Delete: Produkt löschen → product_sections + product_items weg. Master-Section löschen → master_items weg.
- Seed-Daten: 5 Sections existieren, Section "Gründung und einmalige Aufgaben" hat 14 Items, "Produkteinkauf" hat 19 Items.

**Integration-Test** (`integration.amazon_checklist.test.ts`):
- Master CRUD: Section + Item POST/PATCH/DELETE, 400 bei zu langem Title / zu langer Beschreibung.
- Produkt GET ohne vorherige Daten → Lazy-Init kopiert Master, alle is_done = 0.
- Produkt GET nach Lazy-Init → liefert gleiche Daten, kein erneutes Kopieren.
- Produkt-Item PATCH `is_done = 1` setzt nur das Produkt-Item, Master bleibt unverändert (0).
- Produkt-Section DELETE: section + items weg, Master unverändert.
- Cross-Product / Cross-Section-Zugriff → 404.

### Manuelles UAT (in Spec dokumentiert)
- `/amazon/entwicklung/checkliste` aufrufen → 5 Sections mit allen Items sichtbar.
- Item-Beschreibung ändern → Autosave.
- Master Erledigt anhaken → bleibt nach Reload.
- Neuen Item in "Produkteinkauf" anlegen → erscheint unten.
- Neue Section "Test" anlegen → erscheint.
- Section "Test" löschen → weg.
- Bestehendes Produkt aufrufen ("Rausfallschutz Boxspringbett") → Checkliste-Sektion erscheint, ist mit Master-Inhalt befüllt, alle Erledigt-Häkchen leer.
- Im Produkt Item-Beschreibung ändern → Master bleibt unverändert.
- Master neue Section anlegen → bestehendes Produkt sieht die neue Section **nicht** (wie spezifiziert).
- Neues Produkt anlegen → beim ersten Aufruf der Detail-Seite ist die aktuelle Master-Checkliste drin.
- Link im Item bearbeiten via EditItemDialog → klickbarer Link erscheint, öffnet in neuem Tab.

## Sicherheit
- Alle Routes hinter JWT-Guard.
- Prepared Statements ausnahmslos.
- Schema-only-Migration → automatisches Backup von `migrate.ts`.
- Seed-Daten sind statische INSERTs ohne User-Input.

## Offene Punkte (für spätere Schritte)
- Drag&Drop für Items + Sections.
- Fortschritts-Statistik pro Section (z.B. "8 / 14 erledigt").
- PDF-Export der Produkt-Checkliste.
- "Master jetzt erneut importieren"-Button für Produkte (würde bestehende Items überschreiben — bewusst gefährlich).
