# Amazon ECO-Dashboard — Design (Schritt 1)

**Status:** Entwurf — bereit zur Review
**Datum:** 2026-06-01
**Modul:** Amazon (ersetzt heutigen Placeholder unter `/amazon`)

---

## Ziel

Eine Kanban-artige Übersichtsseite für Produktentwicklung im Amazon-Reiter. Produkte werden in vier Status-Spuren geführt (**Interessant**, **Aktiv am entwickeln**, **Meine bestehenden Produkte**, **Verworfen**), wobei verworfene Produkte standardmäßig versteckt sind. Schritt 1 liefert die Übersicht und das Anlegen — Detail-Seite, Brand-Tab und alle Fortschritts-/Tag-Felder folgen in späteren Schritten.

## Scope

### In Scope (Schritt 1)
- Übersichts-Seite `/amazon` mit drei sichtbaren Spalten (Interessant / Aktiv / Bestehend) und einer optionalen vierten Spalte (Verworfen).
- "Verworfene einblenden (N)"-Toggle als einziges Header-Bedienelement.
- "+ Produkt direkt entwickeln"-Dialog mit Pflichtfeld **Name** und optionalem Bild-Upload (Datei oder Cmd+V).
- Status-Wechsel per Klick auf das Status-Badge der Karte → Dropdown mit allen vier Status.
- Bild-Upload nachträglich über Klick auf den Bild-Bereich der Karte.
- Hartes Löschen eines Produkts mit Confirm-Modal.

### Explizit out of Scope (folgt später)
- Detail-Seite mit USP/Marge/Sourcing-Feldern, Tags ("Singlebox fehlt" usw.), 35%-Fortschritts-Ringe, Notizen.
- Zweiter Tab "Brand-Entwicklung" — keine Tab-Bar in Schritt 1.
- Partner-Button oben rechts.
- Sortier-Dropdown, Filter-Dropdown, Grid/Listen-Umschalter, Produkt-Zähler.
- Drag & Drop zwischen oder innerhalb der Spalten.

## Datenmodell

Neue Tabelle in der bestehenden `backend/dashboard.db` (kein zweites DB-File).

```sql
CREATE TABLE amazon_products (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'interessant'
                       CHECK (status IN ('interessant','aktiv','bestehend','verworfen')),
  image_path   TEXT    NULL,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX amazon_products_status_idx
  ON amazon_products (status, created_at DESC);
```

- **Sortierung in Spalten:** `created_at DESC` (neueste oben). Kein `sort_order` jetzt — kann später additiv ergänzt werden.
- **Bilder:** Pfad relativ zum Uploads-Root (`amazon/<uuid>.png`). Datei liegt in `backend/uploads/amazon/`.
- **Migration:** neue Datei in `backend/src/db/migrations/`. Schema-only — automatisches Backup von `migrate.ts` greift, kein manueller `createBackup()`-Aufruf nötig.

## Backend-API

Neue Datei `backend/src/routes/amazon.products.routes.ts`, in `backend/src/app.ts` unter `/api/amazon` registriert. JWT-Middleware analog zu allen anderen Modulen.

| Methode | Pfad | Body / Query | Antwort |
|--------|------|--------------|---------|
| GET    | `/api/amazon/products` | `?include_discarded=true|false` (default `false`) | `200 [{ id, name, status, image_path, created_at, updated_at }, …]`, sortiert `created_at DESC` |
| POST   | `/api/amazon/products` | `{ name: string }` | `201 { id, name, status:'interessant', image_path:null, created_at, updated_at }` |
| PATCH  | `/api/amazon/products/:id` | `Partial<{ name, status }>` | `200 { … aktualisiertes Produkt }` |
| POST   | `/api/amazon/products/:id/image` | `multipart/form-data` (Feld `file`) | `200 { image_path }` |
| DELETE | `/api/amazon/products/:id/image` | — | `204` |
| DELETE | `/api/amazon/products/:id` | — | `204` |

### Validierungsregeln
- `name`: getrimmt, Länge 1..200. Sonst `400 { error: 'name length invalid' }`.
- `status`: aus Enum. Sonst `400 { error: 'invalid status' }`.
- Bild: MIME-Filter `image/jpeg | image/png | image/webp`, Limit 5 MB. Multer-Errors werden zu `400` gemappt.

### Mechanik
- **Image-Upload:** `multer` mit Disk-Storage in `backend/uploads/amazon/`. Dateiname = `crypto.randomUUID() + ext`. Bei Ersetzen wird die alte Datei via `fs.unlink` entfernt (Fehler ignoriert, falls Datei fehlt). Vor Implementierung wird geprüft, dass `express.static('uploads')` in `app.ts` aktiv ist; falls nicht, wird sie ergänzt.
- **Hartes Löschen** (`DELETE /:id`): entfernt Zeile **und** ggf. zugehörige Bilddatei.
- Trennung zwischen JSON-CRUD und Datei-Upload-Endpoints folgt dem DJ-Event-Attachment-Pattern — keine gemischten `multipart/json`-Bodies.

## Frontend-Struktur

### Routes (`frontend/src/routes/routes.tsx`)
```
/amazon  →  AmazonOverviewPage   // ersetzt den bisherigen Placeholder
```
Detail-Route wird in Schritt 2 ergänzt; bis dahin kein "Details →"-Link auf der Karte.

### Dateien
```
frontend/src/pages/amazon/
  AmazonOverviewPage.tsx          // Page-Container, lädt Produkte, hält UI-State

frontend/src/components/amazon/
  ProductBoard.tsx                // 3- bzw. 4-Spalten-Layout
  ProductColumn.tsx               // Spalten-Header + Karten-Liste + Leerzustand
  ProductCard.tsx                 // einzelne Karte (Bild, Name, Datum, Badge)
  ProductStatusBadge.tsx          // klickbares Badge mit Dropdown
  NewProductDialog.tsx            // draggable Modal: Name + optionales Bild
  DiscardedToggleButton.tsx       // "Verworfene einblenden (N)"
  DeleteProductDialog.tsx         // Confirm-Modal für hartes Löschen

frontend/src/api/amazon.ts        // typisierter fetch-Wrapper
frontend/src/hooks/amazon/
  useAmazonProducts.ts            // TanStack Query: list + create/update/delete/image
```

### State
- **Server-State** (TanStack Query): Produkt-Liste, Mutationen.
- **Lokaler UI-State** in `AmazonOverviewPage`: `showDiscarded: boolean`, `dialogOpen: boolean`, `pendingDelete: Product | null`.
- Kein Zustand-Store nötig.

### Layout
- Drei Spalten als `grid-cols-3` auf Desktop; vierte (Verworfen) wird angehängt, wenn Toggle aktiv ist → `grid-cols-4`.
- Spalten scrollen vertikal bei langen Listen.
- Spalten-Header: Icon + Titel + Zähler-Pill in Akzentfarbe.
- Header-Bereich oben: links Settings-Icon-Box + "ECO-Dashboard" + Untertitel; rechtsbündig darunter "+ Produkt direkt entwickeln" als Primary-Button.
- "Verworfene einblenden"-Pille rechtsbündig oberhalb des Boards.

### Datenfluss beim Status-Wechsel
1. Klick auf Badge öffnet Dropdown mit vier Status-Einträgen (Häkchen bei aktuellem).
2. Auswahl löst `useMutation` (`PATCH /:id`) aus.
3. Optimistic Update der Liste — Karte wandert sofort in die neue Spalte.
4. Bei Erfolg: `queryClient.invalidateQueries(['amazon','products'])`.
5. Bei Fehler: Toast mit Server-Message, optimistic Update wird zurückgerollt.
6. Während der Mutation: Spinner am gewählten Eintrag, Dropdown bleibt offen (verhindert Doppelklicks).

### Anlege-Dialog
- Draggable am Header (Memory-Regel: alle freischwebenden Modals draggable).
- Name-Input mit Autofocus, Enter submitted.
- Drop-Zone darunter: Klick zum Auswählen, Drag&Drop einer Datei, oder Cmd+V (analog DJ-Attachment-Paste).
- "Anlegen" sendet erst `POST /products` (Name), danach — falls Bild gewählt — `POST /:id/image`. Bild-Fehler blockiert nicht das Produkt: Toast informiert, Karte zeigt Platzhalter.
- "Abbrechen" schließt ohne Speichern.

## Visual Design (Electric Noir)

Alle Akzentfarben über `var(--color-…)`-Tokens. Falls Tokens fehlen, werden sie in `frontend/src/styles/index.css` (`@theme`-Block) ergänzt.

### Spalten-Akzente
| Spalte | Icon | Akzentfarbe |
|--------|------|-------------|
| Interessant | `star` | blau (`text-blue-400`) |
| Aktiv am entwickeln | `settings` | blau (`text-blue-400`, gleiche Farbe wie Interessant — laut Vorlage) |
| Meine bestehenden Produkte | `check_circle` | grün (`text-emerald-400`) |
| Verworfen | `archive` | orange (`text-orange-300`) |

### Karten-Look
- Hintergrund: `var(--color-surface)`, 1px Border in Akzentfarbe mit ~15 % Opazität.
- `rounded-xl`.
- Bild-Bereich oben: 16:9, `object-cover`, abgerundete obere Ecken.
- Ohne Bild: Material-Symbol `image` zentriert + Hover-Hinweis "Bild hinzufügen".
- Klick auf den Bild-Bereich öffnet Datei-Auswahl. Auch bestehende Bilder lassen sich so ersetzen (gleicher `POST /:id/image`-Endpoint, Backend entfernt das alte File). Bei Hover über ein vorhandenes Bild erscheint ein kleines Edit-Overlay.
- Status-Badge oben-links auf dem Bild mit `backdrop-blur-sm`.
- Unter dem Bild: Produktname (fett), Datum-Footer in `text-muted`.
- In Schritt 1 kein "35 %"-Wert oben-rechts, keine USP/Marge/Sourcing-Balken, keine Tags.

### Status-Dropdown
- Implementierung: einfacher Click-outside-Handler + Tastatur-Navigation (Pfeil hoch/runter, Enter, Escape). Falls `@radix-ui/react-dropdown-menu` bereits im Projekt verwendet wird, dieses nutzen — Entscheidung wird beim Setup geprüft.
- Vier Einträge mit Häkchen beim aktuellen Status. Hover-Highlight in Akzentfarbe.
- Position direkt unter dem Badge, mit Schatten und Backdrop.

### Leerzustände
- Pro Spalte zentrierter, gedämpfter Text — kein Icon:
  - "Keine interessanten Produkte"
  - "Noch keine aktiven Produkte"
  - "Noch keine bestehenden Produkte"
  - "Keine verworfenen Produkte"

## Fehlerbehandlung

### Client-Validierung (UX)
- Name-Länge geprüft vor Submit; Button bleibt disabled mit Hinweistext.
- Bild-Typ und -Größe vor Upload geprüft.

### Server-Validierung (autoritativ)
- Identische Checks zusätzlich serverseitig.
- Unbekannter Status → 400.
- Multer-Limits werden zu 400 mit klarer Message.

### UI-Fehlerverhalten
- **Listen-Load-Fehler:** Inline-Error oberhalb des Boards mit "Erneut laden"-Button.
- **Mutationen-Fehler:** Toast mit Server-Message + Rollback des optimistic Update + Query-Invalidierung.
- **Status-Dropdown:** Spinner am gewählten Eintrag während Mutation; verhindert Doppel-Submits.
- **Bild-Upload-Fehler im Anlege-Flow:** Produkt bleibt bestehen, Toast informiert, Karte zeigt Platzhalter.

### Hartes Löschen
- Confirm-Modal mit Hinweis: "Produkt 'X' und zugehöriges Bild werden dauerhaft entfernt." (Memory-Regel: Confirm vor Löschen.)
- Backend entfernt Zeile + Bilddatei.

## Tests

### Backend (vitest, gegen temporäre `dashboard.test.db`)
- `POST /products` legt Produkt mit Default-Status `interessant` an.
- `POST /products` weist Namen mit Länge 0 und >200 ab (400).
- `PATCH /products/:id` ändert Status; ungültiger Status → 400.
- `GET /products` filtert `verworfen` ohne `include_discarded`; mit `include_discarded=true` werden sie zurückgegeben.
- `POST /products/:id/image` speichert Datei; bestehendes Bild wird auf Platte entfernt.
- `DELETE /products/:id` entfernt Zeile + Datei; fehlende Datei verursacht keinen Fehler.
- **Keine Mocks** der DB (Memory-Regel: integration tests treffen echte DB).

### Manuelles UAT (in der Spec dokumentiert)
- Produkt anlegen ohne Bild → erscheint in "Interessant".
- Produkt anlegen mit Bild via Klick → Bild sichtbar in Spalte.
- Produkt anlegen mit Bild via Cmd+V → Bild sichtbar.
- Status per Dropdown auf "Aktiv" → Karte wandert.
- "Verworfene einblenden" → 4. Spalte erscheint, Toggle-Text wechselt.
- Verworfenes Produkt zurück auf "Interessant" → Karte wandert.
- Hartes Löschen → Confirm-Modal → Karte und Bild entfernt.
- UAT achtet auf bekannte Fallen aus `feedback_uat_workflow`: Backend nach Routen-Änderung neustarten, Browser-Cache umgehen.

## Sicherheits- und Datenschutz-Hinweise
- JWT-Schutz auf allen Endpoints (analog bestehende Module).
- MIME-Filter und Größenlimit serverseitig hart gesetzt — keine Polyglot-Dateien.
- Dateinamen werden über `crypto.randomUUID()` neu vergeben; vom Client gelieferte Namen werden nie als Pfad verwendet.
- Schema-only-Migration → automatisches Backup via `migrate.ts` deckt Rollback ab (CLAUDE.md-Regel zur Datensicherheit).

## Offene Punkte (für Schritt 2 vorbereiten)
- Detail-Seite: Inhalt + Route `/amazon/products/:id`. "Details →"-Link erst dann aktivieren.
- Brand-Tab: Datenmodell, Felder, eigene Routen — bewusst nicht heute mitgeplant.
- USP/Marge/Sourcing-Fortschritt, Tags, 35 %-Ring: hängen am Datenmodell der Detail-Seite und werden dort spezifiziert.
