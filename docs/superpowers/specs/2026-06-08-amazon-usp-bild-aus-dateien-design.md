# Amazon USP — Bild aus persönlichen Dateien als Punkt-Bild übernehmen

**Status:** Entwurf — vom Nutzer bestätigt
**Datum:** 2026-06-08
**Modul:** Amazon USP (Produkt-Detailseite)

---

## Ziel

Beim Anlegen/Bearbeiten eines Anforderungs-Punkts soll ein bereits im „Dateien &
Bild-Ideen"-Bereich (Persönlich-Block) hochgeladenes **Bild** mit einem Klick als Punkt-Bild
übernommen werden können — ohne erneuten Upload. Die Datei wird **kopiert**, damit das Punkt-Bild
erhalten bleibt, falls die persönliche Datei später gelöscht wird.

## Entscheidungen

- **Kopie, nicht Referenz:** Das gewählte Bild wird physisch in den Punkt-Bild-Ordner kopiert
  (eigene `amazon_usp_point_images`-Zeile, eigene Datei). Löschen der persönlichen Datei berührt das
  Punkt-Bild nicht.
- **Nur Bilder:** Das Auswahl-Panel zeigt ausschließlich persönliche Dateien mit MIME `image/*`.
  Nicht-Bilder (PDF o. ä.) werden ausgeblendet. Das Backend lehnt Nicht-Bild-Dateien mit 400 ab.
- **Kein freischwebendes Modal:** Die Auswahl ist ein eingeklapptes Panel direkt unter den Buttons
  des Punkts (keine Drag-Pflicht).

## Scope

### In Scope
- Backend: neue Route `POST /products/:id/usp/points/:pointId/images/from-file` (`{ file_id }`),
  kopiert eine persönliche Bild-Datei in den Punkt-Bild-Speicher.
- Frontend: API-Funktion + Hook + „Aus Dateien wählen"-Panel in `UspPointRow`; `files` werden von
  `UspSection` über `UspPointList` an `UspPointRow` durchgereicht.

### Explizit out of Scope
- Keine Migration (bestehende Tabellen `amazon_usp_files` + `amazon_usp_point_images` genügen).
- Keine Referenz-/Verknüpfungslogik (bewusst Kopie).
- Keine Bild-Verkleinerung beim Kopieren (1:1-Kopie der Originaldatei; PDF-Export verkleinert
  ohnehin clientseitig).

## Datensicherheit

Rein additiv. Es werden nur neue Dateien kopiert und neue Zeilen eingefügt — keine bestehenden
Daten verändert oder gelöscht. Kein Bulk-Vorgang → kein `createBackup` nötig.

## Backend (`backend/src/routes/amazon.usp.routes.ts`)

### Neue Route
```
POST /products/:id/usp/points/:pointId/images/from-file
Body: { file_id: number }
```

Ablauf:
1. `id`, `pointId` als Integer validieren; `ensureProduct(id)` und `loadPointForProduct(id, pointId)`
   → sonst 404.
2. `file_id` aus dem Body lesen, als Integer validieren → sonst 400 `{ error: 'invalid file_id' }`.
3. `loadFileForProduct(id, file_id)` → fehlt/fremd → 404 `{ error: 'not found' }`.
4. MIME prüfen: `row.mime` muss mit `image/` beginnen → sonst 400 `{ error: 'not an image' }`.
5. Quelldatei `path.resolve(FILES_DIR, row.file_path)` — Path-Traversal-Guard
   (`abs.startsWith(path.resolve(FILES_DIR) + path.sep)`) und Existenz prüfen → sonst 404.
6. Zieldateiname: neue UUID + Originalendung (`path.extname(row.file_path)`), Ziel in `UPLOAD_DIR`.
   Mit `fs.copyFileSync(src, dest)` kopieren.
7. `sort_order` = `MAX(sort_order)+1` für den Punkt; Insert in `amazon_usp_point_images`
   (`point_id, sort_order, file_path`) mit dem neuen Dateinamen.
8. Antwort `201 { image }` (frisch geladene `ImageRow`) — identisches Format wie der normale
   Upload-Endpoint.

UUID: `crypto.randomUUID()` (Node), passend zur bestehenden Multer-Namensgebung im File.

### Reihenfolge im Router
Direkt nach dem bestehenden `POST .../points/:pointId/images`-Handler einfügen, damit verwandte
Routen beieinanderstehen. (Express 5 matcht exakte Pfade, keine Reihenfolge-Kollision mit
`/images/reorder` o. ä.)

## Frontend

### `frontend/src/api/amazon.api.ts`
Neue Funktion analog zu `uploadUspPointImage`:
```ts
export async function addUspPointImageFromFile(productId: number, pointId: number, fileId: number) {
  const { data } = await apiClient.post(
    `/amazon/products/${productId}/usp/points/${pointId}/images/from-file`,
    { file_id: fileId },
  );
  return data.image as UspPointImage;
}
```
(Genauen Basis-Pfad an die vorhandenen USP-Funktionen im File angleichen.)

### `frontend/src/hooks/amazon/useUsp.ts`
```ts
export function useAddUspPointImageFromFile(productId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pointId, fileId }: { pointId: number; fileId: number }) =>
      addUspPointImageFromFile(productId, pointId, fileId),
    onSettled: () => inval(productId, qc),
  });
}
```
(An vorhandene Hook-Konventionen im File angleichen — `inval(productId, qc)`-Helper existiert.)

### `UspPointRow.tsx`
- Neue Prop `imageFiles: UspFile[]` (bereits auf `image/*` gefiltert vom Parent).
- Neuer State `pickerOpen: boolean`.
- Hook `useAddUspPointImageFromFile(productId)`.
- Neben „Bild hinzufügen" ein zweiter Button **„Aus Dateien wählen"** (Icon z. B.
  `imagesmode`/`collections`), togglet `pickerOpen`.
- Wenn `pickerOpen`: Panel direkt darunter (gleiche Card, kein Overlay):
  - Bei `imageFiles.length === 0`: Hinweis „Noch keine Bilder im Dateien-Bereich".
  - Sonst: Thumbnail-Grid; jedes Thumbnail nutzt `getUspFileObjectUrl(productId, file.id)` (wie in
    `UspFiles`), Klick → `add.mutate({ pointId: point.id, fileId: file.id })`, danach
    `setPickerOpen(false)`.
  - Object-URLs sauber wieder freigeben (`URL.revokeObjectURL`) beim Schließen/Unmount —
    Muster aus `UspFiles` übernehmen.

### `UspPointList.tsx`
- Neue Prop `imageFiles: UspFile[]` annehmen und unverändert an jede `UspPointRow` durchreichen.

### `UspSection.tsx` (bzw. die Komponente, die `UspPointList` rendert)
- Aus `data.files` die Bild-Dateien filtern: `data.files.filter(f => f.mime.startsWith('image/'))`
  und als `imageFiles` an `UspPointList` übergeben.

## Fehlerbehandlung

- Datei nicht gefunden / fremdes Produkt → 404 (Frontend: Mutation-Fehler, Panel bleibt offen).
- Datei ist kein Bild → 400 `{ error: 'not an image' }` (kommt im UI nicht vor, da nur Bilder
  angezeigt werden — Defense-in-Depth).
- Quelldatei fehlt physisch → 404.

## Tests

### Backend (`backend/test/...amazon.usp...`)
1. **from-file kopiert Bild:** persönliche Bild-Datei anlegen (PNG), `from-file` aufrufen →
   201, Punkt hat ein neues `amazon_usp_point_images`; die Zieldatei existiert in `UPLOAD_DIR` und
   ist eine **andere** Datei als die Quelle (eigener Pfad).
2. **Kopie überlebt Löschen:** nach `from-file` die persönliche Datei via
   `DELETE .../usp/files/:fId` löschen → Punkt-Bild-Zeile + Zieldatei bestehen weiter; GET des
   Punkt-Bilds liefert weiter 200.
3. **Nicht-Bild → 400:** persönliche Datei mit MIME `application/pdf` → `from-file` → 400
   `not an image`, kein Punkt-Bild angelegt.
4. **Fremde/fehlende Datei → 404:** `file_id` eines anderen Produkts bzw. nicht existierend → 404.
5. **Ungültige `file_id` → 400.**

### Frontend
`tsc --noEmit` + `vite build` grün; manuelles UAT.

### Manuelles UAT
1. Im Persönlich-Block ein Bild + eine PDF in „Dateien & Bild-Ideen" hochladen.
2. Bei einem Anforderungs-Punkt „Aus Dateien wählen" → Panel zeigt **nur** das Bild (keine PDF).
3. Bild anklicken → erscheint als Punkt-Bild; Panel schließt.
4. Die persönliche Bild-Datei im Dateien-Bereich löschen → Punkt-Bild bleibt sichtbar.
5. Punkt ohne persönliche Bilder: „Aus Dateien wählen" zeigt den Leer-Hinweis.

## Sicherheit

Route hinter JWT (wie alle USP-Routen). Nur Prepared Statements. Path-Traversal-Guards auf Quelle
(`FILES_DIR`) und Ziel (`UPLOAD_DIR`). Keine destruktive Operation.
