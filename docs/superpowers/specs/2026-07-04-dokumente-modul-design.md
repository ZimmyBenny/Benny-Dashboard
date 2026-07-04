# Dokumente-Modul — Design

**Datum:** 2026-07-04
**Status:** Vom User freigegeben (Brainstorming-Session 2026-07-04)

## Ziel

Zentrale Dokumentenablage im Dashboard: Sidebar-Reiter „Dokumente" (unter Belege) mit frei anlegbaren Ordnern/Unterordnern je Bereich, Datei-Upload, Speicher-Nutzungs-Anzeige — und automatischer 1:1-Spiegelung der Struktur in Bennys iCloud-Ordner `Dokumente/` im Projektverzeichnis, damit alles auch im Finder sichtbar ist.

## Gelockte Entscheidungen (User, 2026-07-04)

1. **Speicherort:** App-Speicher ist Quelle der Wahrheit (`~/.local/share/benny-dashboard/dokumente/…`, Belege-Muster). Zusätzlich einseitiger Spiegel Dashboard → Finder in den iCloud-Ordner `Dokumente/`. Doppelter Speicherplatz bewusst akzeptiert.
2. **Struktur:** Oberste Ebene = Bereiche (fix), darunter freie Ordner/Unterordner (beliebig tief).
3. **Zugriff je Bereich:** Sidebar-Unter-Item „Dokumente" bei Amazon, DJ und Finanzen — gleiche Ansicht, fest auf den Bereich eingegrenzt.
4. **Start-Bereiche:** Amazon, DJ, Finanzen, Privat (Privat ohne Sidebar-Modul, nur über Hauptseite).
5. **Wurzel-Bereichsordner sind fix** — nicht umbenennbar, nicht löschbar (Anker für Filterung + Sidebar-Mapping). Vom User explizit bestätigt.
6. **Finder-Ordner ist reiner Spiegel** — im Finder abgelegte Dateien kennt die App nicht; Upload nur übers Dashboard. Rück-Import ist ein späteres, separates Feature. Vom User explizit bestätigt.
7. **Speicher-Budget:** Einstellung (Default 1 GB / 1024 MB), rein informativ — Anzeige mit Balken und Prozent, ab 100 % Warnfarbe, KEINE Blockade.

## Datenmodell (1 Migration, nächste freie Nummer)

```sql
CREATE TABLE doc_folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER REFERENCES doc_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_area_root INTEGER NOT NULL DEFAULT 0,   -- 1 = fixer Bereichs-Ordner
  area_slug TEXT,                            -- nur an Wurzel gesetzt: 'amazon'|'dj'|'finanzen'|'privat'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(parent_id, name)
);

CREATE TABLE doc_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folder_id INTEGER NOT NULL REFERENCES doc_folders(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  mime_type TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(folder_id, filename)
);
```

- Migration seedet die 4 Wurzel-Ordner (`is_area_root=1`, `area_slug` gesetzt).
- Rein additiv → kein `createBackup` nötig (Migrations-Pipeline sichert automatisch).
- KEIN `PRAGMA foreign_keys` in der Migration (Projektregel).
- Namens-Eindeutigkeit je Ebene via UNIQUE; bei Datei-Upload-Kollision hängt das Backend ` (2)`, ` (3)` … an.

## Speicherung & Spiegel

- **Primär:** `~/.local/share/benny-dashboard/dokumente/<Bereich>/<Ordnerpfad>/<Datei>` — Pfad wird aus dem DB-Baum abgeleitet. Analog `lib/files.ts` (Belege): eigener Helper `lib/docFiles.ts` mit `getDokumenteRoot()` (Setting `dokumente_storage_path`, leer → Default).
- **Spiegel:** Setting `dokumente_mirror_path`, Default = `<Projektverzeichnis>/Dokumente`. Jede Mutation (Ordner anlegen/umbenennen/löschen, Upload, Datei umbenennen/verschieben/löschen) führt die gleiche Operation im Spiegel aus — **best-effort** in try/catch: Spiegel-Fehler (z. B. iCloud zickt) darf die Hauptoperation NIE scheitern lassen; Fehler wird geloggt.
- **„Spiegel neu aufbauen"** (Button in den Dokumente-Einstellungen, `POST /api/dokumente/mirror-rebuild`): löscht den Spiegel-Inhalt und kopiert alles frisch aus dem App-Speicher. Repariert Finder-Eingriffe.
- Datei-/Ordnernamen werden für das Dateisystem sanitisiert (bestehendes `sanitizeForFilename`-Muster); der DB-Name bleibt das Original (mit echten Umlauten), Anzeige immer aus der DB.

## Löschen = soft (Datensicherheits-Regel)

- Datei löschen: Confirm-Dialog → Datei wandert in `~/.local/share/benny-dashboard/dokumente/.trash/<timestamp>_<name>`, DB-Zeile weg, Spiegel-Datei weg.
- Ordner löschen: Confirm mit Inhalts-Zählung („enthält N Dateien in M Ordnern") → alle Dateien in den Trash, dann DB-CASCADE.
- Trash-Aufräumen: Server-Start-Sweep löscht Trash-Einträge älter als 30 Tage (Muster: bestehender Startup-Sweep aus Phase 04).

## API (`backend/src/routes/documents.routes.ts`, auth wie Belege)

| Route | Zweck |
|---|---|
| `GET /api/dokumente/tree` | kompletter Ordnerbaum + Dateizähler (eine Query, Frontend baut Baum) |
| `GET /api/dokumente/folders/:id` | Inhalt eines Ordners (Unterordner + Dateien) |
| `POST /api/dokumente/folders` | Ordner anlegen (parent_id, name) — Wurzel-Anlage abgelehnt (403) |
| `PATCH /api/dokumente/folders/:id` | umbenennen / verschieben (parent_id) — `is_area_root=1` → 403 |
| `DELETE /api/dokumente/folders/:id` | löschen (soft, s. o.) — `is_area_root=1` → 403 |
| `POST /api/dokumente/files` | Upload (multipart, mehrere Dateien, folder_id) — multer, Extension-Blocklist (.exe/.bat/…), Limit aus `max_upload_size_mb` |
| `GET /api/dokumente/files/:id/blob` | Datei ausliefern (für Vorschau/Download, auth) |
| `PATCH /api/dokumente/files/:id` | umbenennen / in anderen Ordner verschieben |
| `DELETE /api/dokumente/files/:id` | löschen (soft) |
| `GET /api/dokumente/usage` | `{ usedBytes, budgetMb }` (SUM(size_bytes) + Setting) |
| `POST /api/dokumente/mirror-rebuild` | Spiegel neu aufbauen |

## UI

- **Sidebar (`navConfig.ts`):** Hauptpunkt `{ path: '/dokumente', label: 'Dokumente', icon: 'folder_open' }` direkt nach dem Belege-Block. Zusätzlich je ein Sub-Item „Dokumente" in den subItems von Amazon (`/amazon/dokumente`), DJ (`/dj/dokumente`) und Finanzen (`/finances/dokumente`).
- **Eine Seite, drei Routen:** `DocumentsPage` mit optionaler `areaSlug`-Prop. Bereichs-Routen rendern dieselbe Komponente mit fixiertem Wurzel-Ordner (Breadcrumb beginnt beim Bereich, kein Wechsel in andere Bereiche möglich); Modul-Theming (`data-module`) greift automatisch über die Route.
- **Aufbau wie Mockup:** Header (Titel, „Dateien hochladen"-Button) → Speicher-Nutzungs-Karte (Balken, „X MB / Y GB", Prozent; >100 % → error-Akzent) → Breadcrumb („Zurück" + Pfad) → Inhalts-Karte („Neuer Ordner"-Button, Liste: Ordner zuerst, dann Dateien mit Icon/Name/Größe/Datum) → Empty-State mit Upload-Button.
- **Upload:** Button + Drag-and-drop auf die Inhaltsfläche (react-dropzone, wie Belege-Upload), Mehrfach-Upload, Fortschritt pro Datei.
- **Neuer Ordner / Umbenennen:** Inline-Eingabezeile in der Liste (kein Modal → Draggable-Modal-Regel greift nicht).
- **Verschieben:** kleines Modal mit Ordnerbaum-Picker — am Header verschiebbar (Draggable-Modal-Regel), Backdrop-Klick schließt NICHT.
- **Vorschau:** bestehendes `FilePreviewModal` (kann PDF, Bilder, xlsx/csv) wiederverwenden, Blob via auth-API.
- **Echte Umlaute** in allen UI-Texten.

## Einstellungen

Eigener kleiner Einstellungs-Bereich, erreichbar über ein Zahnrad-Icon im Header der Dokumente-Hauptseite (nicht in den globalen Settings — Modul-Settings bleiben beim Modul, wie bei Belege):
- `dokumente_budget_mb` (Default 1024) — Zahl, frei editierbar.
- `dokumente_mirror_path` (Default Projektordner/Dokumente) — Text, leer = Spiegel aus.
- Button „Spiegel neu aufbauen".

## Nicht-Ziele (YAGNI)

- Kein Rück-Import aus dem Finder (Spiegel ist einseitig) — später separat.
- Keine Datei-Versionierung, kein Papierkorb-UI (Trash ist nur Sicherheitsnetz im Dateisystem).
- Keine Volltext-Suche in Dokumenten; nur Name-Suche kann später kommen.
- Keine Verknüpfung Dokumente ↔ andere Module (Belege/Verträge haben eigene Anhänge).
- Kein OCR.

## Betroffene Bereiche

- **DB:** 1 additive Migration (doc_folders, doc_files, Seed der 4 Bereiche).
- **Backend:** `documents.routes.ts` (neu), `lib/docFiles.ts` (neu, Storage + Spiegel + Trash), app.ts-Mount, Startup-Sweep-Erweiterung (Trash-Purge).
- **Frontend:** `DocumentsPage.tsx` (neu), `documents.api.ts` (neu), Routen in App.tsx (3×), `navConfig.ts` (Haupt-Item + 3 Sub-Items + pageNames), Wiederverwendung FilePreviewModal.
- **Datensicherheit:** alles additiv; Soft-Delete mit 30-Tage-Trash; Spiegel-Fehler nie fatal.
