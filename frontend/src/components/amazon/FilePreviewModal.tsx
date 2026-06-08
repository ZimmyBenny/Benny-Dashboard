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
