# Arbeitsmappe — Bilder inline per Drag&Drop — Design-Spec

**Datum:** 2026-08-27
**Status:** Freigegeben, direkt bauen
**Baut auf:** [[2026-08-27-arbeitsmappe-pdf-export-strukturiert-design]]

## Ziel

Bilder direkt in den Seiten-Inhalt ziehen/einfügen (nicht nur als Anhang), sicht­
bar im Editor und im PDF-Export. Fundament für spätere Pfeile/Beschriftung.

## Kernproblem & Entscheidung

Alle `/api`-Routen sind JWT-geschützt (`app.use('/api', verifyToken)`), Header-
basiert. Ein reines `<img src="/api/.../download">` bekäme 401. Deshalb:
**eigener Tiptap-Node mit React-NodeView, der die Datei mit Auth als Blob lädt.**
Content-JSON speichert nur die `attachmentId` (kein Base64). Der Anhang-Speicher
(`workbook_attachments`, `uploadAttachment`) wird wiederverwendet — kein neuer
Upload-Endpoint.

## Frontend

### Node + NodeView
- `frontend/src/lib/ImageAttachmentExtension.ts` — `Node.create` Name
  `imageAttachment`, `group: 'block'`, `atom: true`, `draggable: true`,
  attrs `{ attachmentId: number|null, alt: string }`.
  - `parseHTML`: `img[data-attachment-id]` → attrs (für Robustheit).
  - `renderHTML`: `<img data-attachment-id=… alt=…>` (Fallback/Serialisierung).
  - `addNodeView`: `ReactNodeViewRenderer(ImageNodeView)`.
- `frontend/src/components/workbook/ImageNodeView.tsx` — React-Komponente
  (`NodeViewWrapper`): lädt per `getAttachmentObjectUrl(attachmentId)` (Blob mit
  Auth) → `<img style="max-width:100%">`; Object-URL bei Unmount freigeben;
  Lade-/Fehlerzustand. Auswahl-Rahmen wenn `selected`.

### API
- `frontend/src/api/workbook.api.ts` — `getAttachmentObjectUrl(id): Promise<string>`
  (`apiClient.get(url, { responseType: 'blob' })` → `URL.createObjectURL`).

### Editor-Integration (`WorkbookEditor.tsx`)
- Extension registrieren.
- **Drop:** im bestehenden Drop-Handler zuerst prüfen, ob die Datei ein **Bild**
  ist (`file.type.startsWith('image/')`). Falls ja: `uploadAttachment(page.id,
  file)` → `editor.chain().focus().insertContent({ type: 'imageAttachment',
  attrs: { attachmentId: att.id, alt: att.file_name } }).run()`. Sonst: bisheriges
  Verhalten (Anhang / E-Mail-Karte).
- **Paste:** `editorProps.handlePaste` — Clipboard-Items nach Bild durchsuchen;
  gleiche Insert-Logik.
- Mehrere Bilder nacheinander möglich; Upload-Guard beibehalten.

## Backend — PDF-Export

`workbook.routes.ts`, Renderer: neuer Fall `imageAttachment`:
- `SELECT storage_path FROM workbook_attachments WHERE id = ?` (attrs.attachmentId).
- Datei aus `UPLOADS_DIR` lesen; `doc.image(path, { fit: [contentWidth, 400] })`,
  danach `moveDown`. Datei fehlt/kein Bild → still überspringen (Text geht nie
  verloren). Auch stock `image`-Node (falls je vorhanden) mit `attrs.src`-DataURL
  wird ignoriert/robust behandelt.

## Konventionen
- Nur Bild-MIME (`image/*`) wird inline; Upload nutzt bestehende multer-Route
  (latin1→utf8 bereits dort). Echte Umlaute in Alt/Namen.
- Kein Datenmodell-Änderung, keine Migration (Anhänge existieren schon).

## NICHT im Scope (später)
- Manuelles Größe-Ziehen / Ausrichtung (kommt mit dem Annotations-Feature #3).
- Bild-Galerie/Verwaltung, Alt-Text-Bearbeitung im UI.
- Bild-Komprimierung.
