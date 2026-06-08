# Amazon Datei-Vorschau Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Hochgeladene Dateien ohne Download ansehen: Bild-Thumbnail + Klick öffnet großes In-App-Overlay; PDFs/andere per „Ansehen" eingebettet. Für Angebots-Dateien (Hersteller) und USP „Dateien & Bild-Ideen".

**Architecture:** Wiederverwendbares `FilePreviewModal` + `useFilePreview()`-Hook. Beide Datei-Bereiche holen die Datei-Bytes per vorhandener Object-URL-Funktion und öffnen das Modal. Reines Frontend.

**Tech Stack:** React 19, TanStack Query, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-08-amazon-datei-vorschau-design.md`

---

### Task 1: `FilePreviewModal` + `useFilePreview` (neu)

**Files:** Create `frontend/src/components/amazon/FilePreviewModal.tsx`

- [ ] **Step 1: Datei anlegen** mit genau:
```tsx
import { useEffect, useState } from 'react';

export interface FilePreviewState { url: string; mime: string | null; name: string; }

export function useFilePreview() {
  const [preview, setPreview] = useState<FilePreviewState | null>(null);
  function open(url: string, mime: string | null, name: string) { setPreview({ url, mime, name }); }
  function close() { setPreview(prev => { if (prev) URL.revokeObjectURL(prev.url); return null; }); }
  return { preview, open, close };
}

export function FilePreviewModal({ preview, onClose }: { preview: FilePreviewState | null; onClose: () => void }) {
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [preview, onClose]);
  if (!preview) return null;
  const mime = preview.mime ?? '';
  const isImage = mime.startsWith('image/');
  const isPdf = mime === 'application/pdf';
  const isText = mime.startsWith('text/');
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.85)' }} onClick={onClose}>
      <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,0.7)' }}>{isImage ? 'image' : isPdf ? 'picture_as_pdf' : 'description'}</span>
        <span className="text-sm truncate flex-1" style={{ color: '#fff' }} title={preview.name}>{preview.name}</span>
        <a href={preview.url} download={preview.name} onClick={(e) => e.stopPropagation()} className="p-2 rounded-md" style={{ color: '#fff' }} title="Herunterladen">
          <span className="material-symbols-outlined">download</span>
        </a>
        <button type="button" onClick={onClose} className="p-2 rounded-md" style={{ color: '#fff' }} aria-label="Schließen">
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
        {isImage ? (
          <img src={preview.url} alt={preview.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        ) : (isPdf || isText) ? (
          <iframe src={preview.url} title={preview.name} style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }} />
        ) : (
          <div className="flex flex-col items-center gap-3" style={{ color: '#fff' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 48 }}>draft</span>
            <p className="text-sm">Für diesen Dateityp ist keine Vorschau möglich.</p>
            <a href={preview.url} download={preview.name} className="px-3 py-1.5 rounded-md text-sm" style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}>Herunterladen</a>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck** `cd frontend && npx tsc --noEmit` → PASS.
- [ ] **Step 3: Commit**
```bash
git add frontend/src/components/amazon/FilePreviewModal.tsx
git commit -m "feat(amazon): FilePreviewModal + useFilePreview (Lightbox)"
```

---

### Task 2: Anbindung in `ManufacturerOffers.tsx`

**Files:** Modify `frontend/src/components/amazon/manufacturers/ManufacturerOffers.tsx`

- [ ] **Step 1: Import ergänzen** (oben): `import { FilePreviewModal, useFilePreview } from '../FilePreviewModal';`

- [ ] **Step 2: `OfferFileRow` ersetzen** durch:
```tsx
function OfferFileRow({ productId, mId, oId, file, onDelete }: OfferFileRowProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fp = useFilePreview();
  const isImage = (file.mime ?? '').startsWith('image/');
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    if (!isImage) return;
    let revoked = false; let url: string | null = null;
    getOfferFileObjectUrl(productId, mId, oId, file.id).then(u => { if (revoked) { URL.revokeObjectURL(u); return; } url = u; setThumb(u); }).catch(() => setThumb(null));
    return () => { revoked = true; if (url) URL.revokeObjectURL(url); };
  }, [isImage, productId, mId, oId, file.id]);

  async function view() {
    const url = await getOfferFileObjectUrl(productId, mId, oId, file.id);
    fp.open(url, file.mime, file.original_name || 'Datei');
  }
  async function download() {
    const url = await getOfferFileObjectUrl(productId, mId, oId, file.id);
    const a = document.createElement('a'); a.href = url; a.download = file.original_name || 'datei'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md"
      style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
      {isImage && thumb
        ? <button type="button" onClick={view} className="flex-shrink-0 rounded overflow-hidden" style={{ width: 28, height: 28, border: '1px solid rgba(255,255,255,0.08)' }} title="Vorschau"><img src={thumb} alt="" className="w-full h-full object-cover" /></button>
        : <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: 14, color: 'var(--color-on-surface-variant)' }}>description</span>}
      <span className="text-xs truncate flex-1 min-w-0" style={{ color: 'var(--color-on-surface)' }} title={file.original_name ?? undefined}>
        {file.original_name || 'Datei'}
      </span>
      {!isImage && (
        <button type="button" onClick={view} className="p-1 rounded-md flex-shrink-0" style={{ color: 'var(--color-on-surface-variant)' }} aria-label="Datei ansehen" title="Ansehen">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>visibility</span>
        </button>
      )}
      <button type="button" onClick={download} className="p-1 rounded-md flex-shrink-0" style={{ color: 'var(--color-on-surface-variant)' }} aria-label="Datei herunterladen">
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>download</span>
      </button>
      {confirmDelete ? (
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-xs" style={{ color: '#fca5a5' }}>Wirklich löschen?</span>
          <button type="button" onClick={() => { onDelete(); setConfirmDelete(false); }} className="px-1.5 py-0.5 rounded-md text-xs" style={{ background: '#7f1d1d', color: '#fecaca' }}>Ja</button>
          <button type="button" onClick={() => setConfirmDelete(false)} className="px-1.5 py-0.5 rounded-md text-xs" style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}>Nein</button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmDelete(true)} className="p-1 rounded-md flex-shrink-0" style={{ color: '#fca5a5' }} aria-label="Datei löschen">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
        </button>
      )}
      <FilePreviewModal preview={fp.preview} onClose={fp.close} />
    </div>
  );
}
```
(`useEffect`, `useState`, `getOfferFileObjectUrl` sind in der Datei bereits importiert.)

- [ ] **Step 3: Typecheck + Build** → PASS.
- [ ] **Step 4: Commit**
```bash
git add frontend/src/components/amazon/manufacturers/ManufacturerOffers.tsx
git commit -m "feat(amazon-hersteller): Datei-Vorschau bei Angebots-Dateien"
```

---

### Task 3: Anbindung in `UspFiles.tsx`

**Files:** Modify `frontend/src/components/amazon/usp/UspFiles.tsx`

- [ ] **Step 1: Import ergänzen**: `import { FilePreviewModal, useFilePreview } from '../FilePreviewModal';`

- [ ] **Step 2: `FileCard` ersetzen** durch:
```tsx
function FileCard({ productId, file, onRequestDelete }: { productId: number; file: UspFile; onRequestDelete: () => void }) {
  const isImage = file.mime.startsWith('image/');
  const [src, setSrc] = useState<string | null>(null);
  const fp = useFilePreview();
  useEffect(() => {
    if (!isImage) return;
    let revoked = false; let url: string | null = null;
    getUspFileObjectUrl(productId, file.id).then(u => { if (revoked) { URL.revokeObjectURL(u); return; } url = u; setSrc(u); }).catch(() => setSrc(null));
    return () => { revoked = true; if (url) URL.revokeObjectURL(url); };
  }, [isImage, productId, file.id]);
  async function view() {
    const url = await getUspFileObjectUrl(productId, file.id);
    fp.open(url, file.mime, file.original_name || 'Datei');
  }
  async function download() {
    const url = await getUspFileObjectUrl(productId, file.id);
    const a = document.createElement('a'); a.href = url; a.download = file.original_name || 'datei'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return (
    <div className="rounded-lg p-2 flex flex-col gap-1.5" style={{ width: 140, background: 'var(--color-surface-container)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <button type="button" onClick={view} className="rounded-md flex items-center justify-center overflow-hidden" style={{ height: 90, background: 'var(--color-surface-container-low)' }} title="Vorschau">
        {isImage && src
          ? <img src={src} alt="" className="w-full h-full object-cover" />
          : <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--color-on-surface-variant)' }}>description</span>}
      </button>
      <span className="text-xs truncate" style={{ color: 'var(--color-on-surface)' }} title={file.original_name}>{file.original_name || 'Datei'}</span>
      <div className="flex items-center gap-1">
        <button type="button" onClick={view} className="flex-1 px-2 py-1 rounded-md text-xs flex items-center justify-center gap-1"
          style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>visibility</span>Ansehen
        </button>
        <button type="button" onClick={download} className="p-1 rounded-md" style={{ color: 'var(--color-on-surface-variant)' }} aria-label="Datei herunterladen" title="Herunterladen">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span>
        </button>
        <button type="button" onClick={onRequestDelete} className="p-1 rounded-md" style={{ color: '#fca5a5' }} aria-label="Datei löschen">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
        </button>
      </div>
      <FilePreviewModal preview={fp.preview} onClose={fp.close} />
    </div>
  );
}
```
(`useEffect`, `useState`, `getUspFileObjectUrl` sind bereits importiert. Der „Laden"-Button wird durch „Ansehen" ersetzt; Herunterladen bleibt als Icon-Button erhalten.)

- [ ] **Step 3: Typecheck + Build** → PASS.
- [ ] **Step 4: Commit**
```bash
git add frontend/src/components/amazon/usp/UspFiles.tsx
git commit -m "feat(amazon-usp): Datei-Vorschau bei 'Dateien & Bild-Ideen'"
```

---

## Manuelles UAT
1. Hersteller-Detailseite → Angebot mit Bild-Datei: Thumbnail sichtbar, Klick öffnet großes Overlay; ESC/Hintergrund schließt.
2. Angebot mit PDF → „Ansehen" zeigt PDF eingebettet (ohne Download).
3. USP „Dateien & Bild-Ideen": Bild-Thumbnail klickbar; „Ansehen" bei PDF zeigt es eingebettet.
4. Unbekannter Dateityp → Hinweis + Download im Overlay.
```
