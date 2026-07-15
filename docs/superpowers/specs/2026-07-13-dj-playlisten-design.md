# DJ-Modul: Playlisten

**Datum:** 2026-07-13 · **Status:** Von Benny freigegeben

## Problem

Benny bekommt Playlisten als Excel-, PDF- oder HTML-Dateien. Er will sie im DJ-Modul
hochladen, per Klick groß ansehen, einer Kategorie zuordnen (Hochzeit, 80er, 90er …)
und die Liste nach Name/Kategorie/Datum sortieren. Fester Ablageort:
**Dokumente → DJ → Playlisten**.

## Geklärte Anforderungen

- Kategorien **selbst verwaltbar**, genau **eine** Kategorie pro Playlist (Frage 1: A)
- Groß-Ansicht als **Vollbild-Overlay** in der App (Frage 2: A)
- Übersicht als **Tabelle** mit Spalten-Sortierung (Frage 3: B)
- **Eigener editierbarer Anzeigename**, Dateiname als Vorschlag (Frage 4: A)

## Architektur: dünne DJ-Schicht über dem Dokumente-Speicher

Dateien sind normale `doc_files` im festen Ordner **DJ → Playlisten** (Ordner wird
on-demand unter dem DJ-Bereichs-Root angelegt, analog `getOrCreateContractAreaFolder`;
App-Speicher = Quelle der Wahrheit, iCloud-Spiegel best-effort — bestehende Helper aus
`backend/src/lib/docFiles.ts` wiederverwenden). Die Playlisten-Seite ist eine Sicht
auf diesen Ordner plus Metadaten.

## Datenmodell (Migration 120, rein additiv, kein Rebuild, kein PRAGMA foreign_keys)

```sql
CREATE TABLE dj_playlist_categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE dj_playlists (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  category_id INTEGER REFERENCES dj_playlist_categories(id) ON DELETE SET NULL,
  doc_file_id INTEGER NOT NULL REFERENCES doc_files(id) ON DELETE CASCADE,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_dj_playlists_category ON dj_playlists(category_id);
CREATE INDEX idx_dj_playlists_doc_file ON dj_playlists(doc_file_id);
```

- Datei im Dokumente-Modul gelöscht → Playlist-Zeile verschwindet mit (CASCADE).
- Kategorie gelöscht → Playlists werden „Ohne Kategorie" (SET NULL).

## API (neue Datei backend/src/routes/dj.playlists.routes.ts, Muster der DJ-Routen)

- `GET    /api/dj/playlists` → Liste mit Join: id, title, category (id+name), Datei-Info
  (doc_file_id, filename, mime_type, size_bytes), created_at
- `POST   /api/dj/playlists` → multipart, EINE Datei pro Request (Frontend loopt bei
  Mehrfach-Auswahl) + Felder `title`, `category_id?`; erlaubte Typen: .xlsx/.xls/.pdf/.html/.htm;
  legt doc_file im Playlisten-Ordner an (App-Speicher + Spiegel, Kollisions-Suffix wie
  documents.routes.ts POST /files) + dj_playlists-Zeile
- `PATCH  /api/dj/playlists/:id` → `{ title?, category_id? }` (category_id null erlaubt)
- `DELETE /api/dj/playlists/:id` → löscht Datei (moveToTrash + Spiegel-Datei entfernen,
  wie documents.routes.ts DELETE /files/:id) und doc_files-Zeile; Playlist-Zeile fällt
  per CASCADE
- `GET/POST/PATCH/DELETE /api/dj/playlist-categories` → Kategorien-CRUD
- Datei-Inhalt für den Viewer: bestehende Route `GET /api/dokumente/files/:id/blob`

Einzel-CRUD → kein createBackup (CLAUDE.md-Regel).

## UI

**Menü:** navConfig.ts — `{ path: '/dj/playlists', label: 'Playlisten', icon: 'queue_music' }`
direkt VOR dem Eintrag „Dokumente" im DJ-Untermenü; PAGE_TITLES-Eintrag.

**Seite `DjPlaylistsPage.tsx`** (DJ-Optik, echte Umlaute):
- Kopf: Suchfeld, „Kategorien"-Button, „Hochladen"-Button (multiple)
- Upload-Flow: je Datei ein Dialog (Anzeigename vorbefüllt mit Dateiname ohne Extension,
  Kategorie-Dropdown inkl. „Ohne Kategorie" + Schnell-Anlegen), dann POST
- Tabelle: Name / Kategorie / Typ (Excel|PDF|HTML, aus Extension) / Hochgeladen —
  Sortierung per Spaltenklick (asc/desc-Toggle, Default Name asc); Zeilen-Aktionen:
  Bearbeiten (Name/Kategorie), Löschen mit Rückfrage („…löscht auch die Datei in
  Dokumente → DJ → Playlisten")
- Kategorien-Dialog: Liste + anlegen/umbenennen/löschen (Rückfrage: „Playlists behalten,
  werden ‚Ohne Kategorie'")
- Alle frei schwebenden Dialoge am Header verschiebbar (Draggable-Modal-Regel)

**Viewer-Overlay `PlaylistViewerOverlay.tsx`** (Vollbild, dunkler Backdrop, Titel +
Kategorie-Badge + Schließen-X, ESC schließt):
- **PDF:** `<iframe src={blobUrl}>` (Blob via bestehender blob-Route laden)
- **HTML:** `<iframe sandbox srcDoc={html}>` — sandboxed ohne Skripte (fremde Dateien!)
- **Excel:** mit vorhandener `xlsx`-Lib erstes Sheet → HTML-Tabelle rendern
  (`overflow: auto`-Container, tabellarischer DJ-Stil); Fehler beim Parsen → Hinweis +
  Download-Button
- Download-Button für alle Typen

## Nicht im Scope

- Mehrere Kategorien pro Playlist (Tags)
- Playlist-Inhalte durchsuchen/parsen (Suche geht nur über Name/Kategorie)
- Verknüpfung Playlist ↔ Event (später denkbar)
- Rekordbox-Abgleich
