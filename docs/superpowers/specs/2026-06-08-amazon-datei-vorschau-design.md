# Amazon — Datei-Vorschau (In-App-Lightbox)

**Status:** Entwurf — vom Nutzer bestätigt
**Datum:** 2026-06-08
**Module:** Amazon Hersteller-Angebote + USP „Dateien & Bild-Ideen" (reines Frontend)

---

## Ziel
Hochgeladene Dateien sollen **ohne Download** ansehbar sein. Bilder bekommen ein Vorschau-Thumbnail
in der Zeile; Klick öffnet sie groß in einem **In-App-Overlay (Lightbox)**. PDFs/andere Dateien
öffnen per **„Ansehen"** in einem eingebetteten Fenster (gleiches Overlay, `<iframe>`). Gilt für die
**Angebots-Dateien** des Herstellers **und** den USP-Bereich „Dateien & Bild-Ideen".

## Entscheidungen
- **In-App-Lightbox/Modal** (kein neuer Browser-Tab).
- Umfang: **Angebots-Dateien + USP-Dateien**.
- Reines Frontend — die GET-Routen liefern bereits inline mit korrektem `Content-Type` (der Blob trägt
  den MIME-Typ), kein Backend-Eingriff nötig.

## Datensicherheit
Keine Datenänderung, keine neuen Endpunkte. Object-URLs werden nach Schließen wieder freigegeben.

---

## Komponenten

### Neu: `frontend/src/components/amazon/FilePreviewModal.tsx`
Zwei Exporte:
1. **`useFilePreview()`** — verwaltet `preview: { url; mime; name } | null`; `open(url, mime, name)`
   setzt den Zustand, `close()` ruft `URL.revokeObjectURL(url)` und setzt null.
2. **`FilePreviewModal({ preview, onClose })`** — Vollbild-Overlay (kein verschiebbares Tool-Modal,
   sondern Lightbox; Klick auf Hintergrund + ESC schließt):
   - Kopfzeile: Icon (Bild/PDF/Datei) + Dateiname + Download-Link (`<a download>`) + Schließen (×).
   - Inhalt:
     - `mime` beginnt mit `image/` → `<img>` (contain, max 100% / 100%).
     - `mime === 'application/pdf'` oder beginnt mit `text/` → `<iframe src={url}>` (volle Fläche,
       weißer Hintergrund).
     - sonst → Hinweis „Für diesen Dateityp ist keine Vorschau möglich." + Download-Button.

### Anbindung A: `frontend/src/components/amazon/manufacturers/ManufacturerOffers.tsx`
- `OfferFileRow` bekommt `useFilePreview()`.
- **Bild-Datei** (`file.mime` beginnt mit `image/`): kleines Thumbnail in der Zeile (Object-URL via
  `getOfferFileObjectUrl`, beim Unmount freigeben). Klick auf das Thumbnail → Modal öffnen (frische
  URL holen, an `open` geben).
- **Andere Datei**: Datei-Icon + **„Ansehen"-Button** (Auge) → holt URL via
  `getOfferFileObjectUrl` und öffnet das Modal.
- Download- und Lösch-Button bleiben.
- `<FilePreviewModal preview={fp.preview} onClose={fp.close} />` in der Zeile rendern.

### Anbindung B: `frontend/src/components/amazon/usp/UspFiles.tsx`
- `FileCard` bekommt `useFilePreview()`.
- Vorhandenes Bild-Thumbnail wird **klickbar** → Modal mit frischer URL (`getUspFileObjectUrl`).
- Für Nicht-Bilder zusätzlich ein **„Ansehen"-Button** (Auge) → Modal (`<iframe>`/Fallback).
- Download/Löschen bleiben. `<FilePreviewModal …>` rendern.

## Hinweise
- Für das Modal wird die URL **frisch** geholt (eigener Object-URL) und beim Schließen freigegeben —
  unabhängig vom Thumbnail-Object-URL (das seinen eigenen Lebenszyklus hat). Vermeidet doppelte
  Freigabe.
- MIME kommt aus den Datei-Metadaten (`file.mime`), nicht aus dem Blob.

## Fehlerbehandlung
- URL-Abruf schlägt fehl (z. B. Datei fehlt) → Promise-Fehler; Modal öffnet nicht (still). Optional
  ein kleiner Hinweis — nicht zwingend.
- Unbekannter MIME → Fallback-Hinweis im Modal mit Download.

## Tests
Reines Frontend ohne Komponenten-Test-Harness:
- `tsc --noEmit` + `vite build` grün.
- **Manuelles UAT:**
  1. Angebot mit Bild-Datei → Thumbnail sichtbar; Klick öffnet großes Overlay; ESC/Hintergrund-Klick
     schließt.
  2. Angebot mit PDF → „Ansehen" öffnet eingebettetes PDF (ohne Download).
  3. Datei vom unbekannten Typ → Hinweis + Download im Modal.
  4. USP „Dateien & Bild-Ideen": Bild-Thumbnail klickbar; PDF „Ansehen" eingebettet.
  5. Nach Schließen kein Speicher-Leak (Object-URLs freigegeben — Code-Review).

## Sicherheit
Object-URLs lokal; keine externen Aufrufe. Bestehende JWT-geschützte GET-Routen liefern die Bytes.
