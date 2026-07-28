# DJ-Anfragen: Anhänge beim Anlegen + Vorschau

**Datum:** 2026-07-28 · **Status:** Von Benny freigegeben

## Problem

1. Der Bereich „Dokumente & E-Mails" erscheint nur im Bearbeiten-Modus
   (`{isEdit && eventId && ...}`). Benny bekommt Anfragen oft per E-Mail und will
   die E-Mail bzw. einen Screenshot **direkt beim Anlegen** anhängen — aktuell muss
   er erst speichern, dann erneut öffnen.
2. Anhänge lassen sich nur herunterladen, nicht ansehen. Ein angehängter Screenshot
   zeigt nur den Dateinamen.

**Ist-Zustand (untersucht):**
- `EventAttachmentsSection` erwartet `eventId: number` und lädt/uploadet sofort
  gegen die API — beim Anlegen existiert die ID noch nicht.
- `uploadEventAttachments(eventId, files, label?)` erwartet ebenfalls eine ID.
- Im Create-Zweig von `NeueAnfrageModal` ist nach dem Anlegen `newEvent.id`
  verfügbar (wird schon für den Kalender-Sync genutzt).
- Wiederverwendbar vorhanden: `useFilePreview()` + `<FilePreviewModal>` in
  `frontend/src/components/amazon/FilePreviewModal.tsx` — kann Bilder, PDF,
  Excel/CSV und Text. `FilePreviewState = { url, mime, name }`; `close()` ruft
  `URL.revokeObjectURL(url)` auf.

## Geklärte Anforderungen

- Vorschau **per Klick im Vollbild**, keine Mini-Vorschaubilder in der Liste (Frage: A).

## Teil 1 — Anhänge im Neu-Modus (Zwischenspeichern + Upload nach dem Speichern)

**Ansatz:** Dateien werden im Dialog lokal gesammelt (`File[]` im State) und erst
nach erfolgreichem Anlegen hochgeladen. Kein Draft-Datensatz, keine verwaisten
Dateien bei Abbruch.

- `EventAttachmentsSection` bekommt einen **zweiten Modus**:
  - **Gespeichert-Modus** (wie bisher): `eventId` gesetzt → lädt/uploadet direkt.
  - **Entwurfs-Modus** (neu): `eventId` fehlt → arbeitet auf `pendingFiles: File[]`
    plus Callbacks `onAddFiles(files)` / `onRemoveFile(index)`; kein API-Zugriff.
  - Drop-Zone, „Datei hinzufügen" und ⌘V-Screenshot-Einfügen funktionieren in
    beiden Modi identisch (Paste-Logik bleibt in der Komponente).
  - Anzeige im Entwurfs-Modus: Dateiname, Größe, ✕ zum Entfernen (kein Download,
    kein Server-Löschen).
- `NeueAnfrageModal`:
  - Der Block wird künftig **immer** gerendert (bisher `{isEdit && eventId && …}`);
    im Neu-Modus mit `pendingFiles`.
  - Nach `createDjEvent(...)`: wenn `newEvent?.id` und `pendingFiles.length > 0` →
    `await uploadEventAttachments(newEvent.id, pendingFiles)`.
  - **Reihenfolge:** Upload NACH dem Anlegen, aber VOR `onCreated()`, damit die
    Liste die Anhänge sofort zeigt.
  - **Fehlerbehandlung:** Schlägt der Upload fehl, bleibt die Anfrage bestehen.
    Kein stiller Verlust: `window.alert` mit der Server-Meldung und dem Hinweis,
    dass die Anfrage gespeichert wurde und die Datei beim Bearbeiten erneut
    angehängt werden kann. `onCreated()` wird trotzdem aufgerufen.
  - `pendingFiles` wird beim Schließen/Zurücksetzen des Dialogs geleert.

## Teil 2 — Vorschau per Klick

- `useFilePreview()` in `EventAttachmentsSection` einbinden, `<FilePreviewModal>`
  am Ende der Komponente rendern.
- **Gespeicherter Anhang:** Klick auf den Eintrag lädt die Datei über die
  bestehende Download-Route als Blob (`downloadEventAttachmentUrl`, wie schon im
  Download-Pfad genutzt), erzeugt `URL.createObjectURL(blob)` und öffnet die
  Vorschau mit `mime_type` und `original_name`.
- **Noch nicht hochgeladener Anhang (Entwurfs-Modus):** Klick öffnet die Vorschau
  direkt aus dem `File`-Objekt (`URL.createObjectURL(file)`, `file.type`,
  `file.name`). Da `close()` die URL freigibt, wird bei erneutem Öffnen eine neue
  erzeugt — kein Leak, kein toter Link.
- Download- und Löschen-Buttons behalten ihre Funktion und dürfen die Vorschau
  NICHT auslösen (`stopPropagation`).
- Dateitypen ohne Vorschau (z. B. `.eml`, `.docx`): `FilePreviewModal` zeigt seinen
  vorhandenen Fallback mit Download-Möglichkeit — keine Sonderbehandlung nötig.

## Verifikation

1. Neue Anfrage: Screenshot per ⌘V einfügen + PDF per Drag & Drop → beide in der
   Liste sichtbar (Entwurfs-Modus), ✕ entfernt einen → speichern → Anfrage öffnen:
   die verbleibenden Anhänge hängen dran.
2. Neue Anfrage mit Anhang, dann **Abbrechen** → keine Anfrage, keine Datei
   (Gegenprobe in `dj_event_attachments` und im Upload-Verzeichnis).
3. Klick auf Bild-Anhang (gespeichert) → Vollbild-Vorschau; Klick auf PDF → PDF-Ansicht.
4. Klick auf noch nicht hochgeladenen Anhang im Neu-Dialog → Vorschau erscheint;
   zweimal öffnen/schließen funktioniert weiterhin (URL-Revoke-Falle).
5. Download- und Löschen-Button funktionieren wie bisher und öffnen keine Vorschau.
6. Bearbeiten-Modus unverändert: Anhänge laden, hochladen, löschen wie zuvor.

## Nicht im Scope

- Mini-Vorschaubilder (Thumbnails) in der Liste
- Anhänge umbenennen/bearbeiten
- `.eml`-Inhalte (Betreff/Text) darstellen
- Anhänge im Neu-Modus zwischen Dialog-Sitzungen speichern
