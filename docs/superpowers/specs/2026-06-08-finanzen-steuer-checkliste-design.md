# Finanzen — Steuer-Checkliste

**Status:** Entwurf — vom Nutzer bestätigt („bau Phase A")
**Datum:** 2026-06-08
**Modul:** Finanzen (neuer Bereich „Steuer-Checkliste")

---

## Ziel
Ein kleines Checklisten-Tool für die Steuer: pro **Steuerjahr** legt der Nutzer **Überbegriffe**
(z.B. „Privat", „DJ") an, darunter **abhakbare Punkte**, und lädt je Punkt **Dokumente** hoch.
Ausgewählte Punkte (oder alle) lassen sich als **ein zusammengeführtes PDF** exportieren, um es dem
Steuerberater zu schicken.

## Entscheidungen
- **Hierarchie:** Überbegriff → Punkte (abhakbar) → Dokumente je Punkt.
- **Pro Steuerjahr** getrennt; neues Jahr anlegbar, Struktur vom Vorjahr leer übernehmbar.
- **PDF:** ausgewählte Dokumente zusammengeführt, gruppiert mit Überschriften.
- **Auswahl:** Häkchen pro Punkt + „Alle exportieren".
- **Phasen:** A = Checkliste + Dokumente (diese Spec baut Phase A). B = PDF-Export.

## Datensicherheit
Additiv (drei neue Tabellen, ein Upload-Ordner). Löschen (Kategorie/Punkt) entfernt Kinder + Dateien
in einer Transaktion (Disk nach Commit). Einzel-Operationen, kein Bulk → kein `createBackup` nötig.

---

## Datenmodell — Migration `083_steuer_checkliste.sql`
```sql
CREATE TABLE steuer_categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  jahr       INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  name       TEXT    NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX steuer_categories_jahr_idx ON steuer_categories (jahr);

CREATE TABLE steuer_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES steuer_categories(id),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  title       TEXT    NOT NULL DEFAULT '',
  is_done     INTEGER NOT NULL DEFAULT 0 CHECK (is_done IN (0,1)),
  note        TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX steuer_items_category_idx ON steuer_items (category_id);

CREATE TABLE steuer_item_files (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id       INTEGER NOT NULL REFERENCES steuer_items(id),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  file_path     TEXT    NOT NULL,
  original_name TEXT,
  mime          TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX steuer_item_files_item_idx ON steuer_item_files (item_id);
```
Kein `PRAGMA foreign_keys` in der Migration.

---

## Backend — neue Datei `backend/src/routes/steuer.routes.ts`, gemountet `app.use('/api/steuer', steuerRoutes)` (hinter `verifyToken`).
Upload-Ordner: `~/.local/share/benny-dashboard/steuer-files/` (Multer, UUID-Namen, 20 MB), Path-Traversal-Guard wie bei den Amazon-Dateien.

### Routen (Phase A)
- `GET /steuer/jahre` → `{ jahre: number[] }` — distinct `jahr` aus `steuer_categories`, absteigend; das aktuelle Jahr immer enthalten (auch wenn leer).
- `GET /steuer/:jahr` → `{ jahr, categories: [{ …cat, items: [{ …item, files: [...] }] }] }` (Kategorien/Punkte/Dateien nach `sort_order, id`).
- `POST /steuer/:jahr/categories` (Body `{ name? }`) → `201 { category }` (mit leeren items), `sort_order = MAX+1` im Jahr.
- `PATCH /steuer/categories/:id` (Body `{ name }`) → getrimmt, `updated_at`.
- `DELETE /steuer/categories/:id` → Punkte + deren Dateien (Zeilen + Disk) + Kategorie löschen (Transaktion, Disk nach Commit). 204.
- `PATCH /steuer/:jahr/categories/reorder` (Body `{ order: number[] }`) → nur eigene IDs des Jahres, sonst 400.
- `POST /steuer/categories/:id/items` (Body `{ title? }`) → `201 { item }`.
- `PATCH /steuer/items/:id` (Body `{ title?, is_done? (0/1), note? }`) → validieren, `updated_at`.
- `DELETE /steuer/items/:id` → Dateien (Zeilen + Disk) + Punkt löschen. 204.
- `PATCH /steuer/categories/:id/items/reorder` (Body `{ order }`).
- `POST /steuer/items/:id/files` (multipart `file`) → `201 { file }`.
- `GET /steuer/items/:id/files/:fId` → Datei inline streamen (Content-Type = mime, RFC-5987-Disposition).
- `DELETE /steuer/items/:id/files/:fId` → Datei + Zeile löschen. 204.
- `POST /steuer/copy-year` (Body `{ from_jahr, to_jahr }`) → kopiert alle Kategorien + Punkte von `from_jahr` nach `to_jahr` (ohne Dateien, `is_done = 0`, Notiz übernommen). 400, wenn `to_jahr` bereits Kategorien hat. `201 { categories }` (des Zieljahres).

Validierung: Integer-Params, Ownership (Punkt gehört zu Kategorie, Datei zu Punkt), nur Prepared
Statements, Textlängen begrenzen (Name/Title ≤ 300, Note ≤ 2000).

### Routen (Phase B — nur skizziert, NICHT in Phase A)
- `POST /steuer/:jahr/export` (Body `{ item_ids: number[] | 'all' }`) → serverseitig per **pdf-lib** ein
  PDF: je gewähltem Punkt eine Trennseite „Überbegriff › Punkt", dann die Dokumente (JPG/PNG als
  Bildseiten, hochgeladene PDFs als kopierte Seiten; nicht einbettbare Typen als Hinweiszeile).
  Stream als `Steuer-<jahr>.pdf`.

---

## Frontend (Phase A)

### Navigation
- `frontend/src/components/layout/navConfig.ts`: unter Finanzen-`subItems` ergänzen
  `{ path: '/finances/steuer-checkliste', label: 'Steuer-Checkliste', icon: 'checklist' }` und im
  `pageNames`-Mapping `'/finances/steuer-checkliste': 'Steuer-Checkliste'`.
- `frontend/src/routes/routes.tsx`: `{ path: '/finances/steuer-checkliste', element: <TaxChecklistPage /> }` + Import.

### API/Hooks
- `frontend/src/api/steuer.api.ts`: Typen `SteuerFile`, `SteuerItem` (mit `files`), `SteuerCategory`
  (mit `items`), `SteuerPayload`; Funktionen für alle Phase-A-Routen + `getSteuerFileObjectUrl`
  (Blob → Object-URL, für die Vorschau).
- `frontend/src/hooks/amazon/`… nein → `frontend/src/hooks/finanzen/useSteuer.ts`: Query je Jahr +
  Mutationen (Invalidierung des Jahr-Query-Keys).

### Seite `frontend/src/pages/finanzen/TaxChecklistPage.tsx`
- `PageWrapper`, Header (Icon `checklist`, Titel „Steuer-Checkliste").
- **Jahr-Wähler**: Dropdown der Jahre (`GET /steuer/jahre`, vereinigt mit aktuellem Jahr), Default
  aktuelles Jahr. „+ Neues Jahr" (z.B. höchstes Jahr +1 bzw. aktuelles Jahr) wechselt dorthin.
- Wenn das gewählte Jahr **keine** Kategorien hat und ein anderes Jahr welche hat: Button
  „Struktur von <Vorjahr> übernehmen" → `copy-year`.
- **Kategorien-Liste** (Drag-Sortierung wie bei den Herstellern/USP): pro Kategorie ein Block mit
  editierbarem Namen, Löschen (Bestätigung), und darunter die **Punkte**.
- **Punkt**: Checkbox (`is_done`), Titel (Inline-Edit), optionale Notiz (kleines Feld/aufklappbar),
  **Dokumente**: Liste mit Vorschau (`FilePreviewModal` wiederverwenden) + Download + Löschen
  (Bestätigung) + „Datei hochladen". „Punkt hinzufügen" je Kategorie.
- „Überbegriff hinzufügen".
- Echte Umlaute überall; Confirm vor jedem Löschen.

## Fehlerbehandlung
- Unbekannte IDs → 404; ungültige `order`/Body → 400; `copy-year` in nicht-leeres Jahr → 400.
- Datei > 20 MB / kein File → 400.

## Tests (Phase A)
### Backend `backend/test/integration.steuer.test.ts`
- Jahre: leer → liefert aktuelles Jahr; nach Anlegen einer Kategorie 2025 erscheint 2025.
- Kategorie-CRUD; Punkt-CRUD (inkl. `is_done` toggeln, ungültig → 400); Reorder (fremde IDs → 400).
- Datei: Upload + im GET eingebettet; Löschen entfernt Zeile; fremder Punkt → 404.
- Kaskaden: Kategorie löschen entfernt Punkte + Dateien-Zeilen; Punkt löschen entfernt Dateien-Zeilen.
- `copy-year`: kopiert Struktur (Kategorien+Punkte, `is_done=0`, keine Dateien); Zieljahr nicht leer → 400.
### Frontend
`tsc` + `vite build`; manuelles UAT (Jahr wählen, Überbegriff/Punkt anlegen, abhaken, Dokument
hochladen + ansehen + löschen, Struktur vom Vorjahr übernehmen).

## Sicherheit
Alle Routen hinter JWT; Prepared Statements; Path-Traversal-Guards beim Datei-Handling;
Schema-Migration → Auto-Backup.

## Phasen
- **A (jetzt):** Migration 083, Backend-CRUD + Upload + copy-year, Frontend-Seite + Navigation.
- **B (später):** PDF-Export (pdf-lib) — Auswahl pro Punkt + „Alle", serverseitiges Zusammenführen.
