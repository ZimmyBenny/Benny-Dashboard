import { useEffect, useRef, useState } from 'react';
import { getResearchImageObjectUrl, type ResearchImage } from '../../../api/amazon.api';
import { useUploadImage, useDeleteImage } from '../../../hooks/amazon/useResearch';

const MAX_BYTES = 20 * 1024 * 1024;

function isImage(att: ResearchImage): boolean {
  return (att.mime ?? '').startsWith('image/');
}

function fileIcon(att: ResearchImage): string {
  const mime = att.mime ?? '';
  const name = (att.original_name ?? '').toLowerCase();
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'picture_as_pdf';
  if (mime === 'message/rfc822' || name.endsWith('.eml') || name.endsWith('.msg')) return 'mail';
  if (mime.startsWith('audio/')) return 'audio_file';
  if (mime.startsWith('video/')) return 'video_file';
  return 'description';
}

// Bild-Vorschau (88x88), Objekt-URL mit Cleanup
function ImageThumb({ productId, att, onDelete }: { productId: number; att: ResearchImage; onDelete: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let revoked = false; let url: string | null = null;
    getResearchImageObjectUrl(productId, att.id).then(u => { if (revoked) { URL.revokeObjectURL(u); return; } url = u; setSrc(u); }).catch(() => setSrc(null));
    return () => { revoked = true; if (url) URL.revokeObjectURL(url); };
  }, [productId, att.id]);
  return (
    <div className="relative group" style={{ width: 88, height: 88 }}>
      {src
        ? <a href={src} target="_blank" rel="noopener noreferrer"><img src={src} alt="" className="w-full h-full object-cover rounded-md" /></a>
        : <div className="w-full h-full rounded-md" style={{ background: 'var(--color-surface-container-low)' }} />}
      <button type="button" onClick={onDelete}
        className="absolute top-1 right-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity px-1"
        style={{ background: 'rgba(0,0,0,0.6)', color: '#fca5a5' }} aria-label="Anhang entfernen">
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
      </button>
    </div>
  );
}

export function ResearchCardAttachments({ productId, cardId, attachments }: { productId: number; cardId: number; attachments: ResearchImage[] }) {
  const upload = useUploadImage(productId);
  const del = useDeleteImage(productId);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const images = attachments.filter(isImage);
  const files = attachments.filter(a => !isImage(a));

  function pick(f: File | undefined | null) {
    if (!f) return;
    if (f.size > MAX_BYTES) { setErr('Datei größer als 20 MB.'); return; }
    setErr(null);
    upload.mutate({ cardId, file: f });
  }

  async function download(att: ResearchImage) {
    try {
      const url = await getResearchImageObjectUrl(productId, att.id);
      const a = document.createElement('a');
      a.href = url; a.download = att.original_name ?? 'datei';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch { setErr('Download fehlgeschlagen.'); }
  }

  return (
    <div className="mt-2">
      {/* Nicht-Bild-Anhänge als Zeilen (E-Mail, PDF, …) */}
      {files.length > 0 && (
        <div className="flex flex-col gap-1 mb-2">
          {files.map(att => (
            <div key={att.id} className="flex items-center gap-2 text-sm group rounded px-2 py-1"
              style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--color-on-surface-variant)' }}>{fileIcon(att)}</span>
              <button type="button" onClick={() => download(att)} className="flex-1 min-w-0 truncate text-left"
                style={{ color: 'var(--color-on-surface)' }} title="Herunterladen">
                {att.original_name ?? 'Datei'}
              </button>
              <button type="button" onClick={() => download(att)} aria-label="Herunterladen"
                className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--color-on-surface-variant)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span>
              </button>
              <button type="button" onClick={() => del.mutate(att.id)} aria-label="Anhang entfernen"
                className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#fca5a5' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Bild-Vorschauen + Hinzufügen-Button */}
      <div className="flex flex-wrap gap-2 items-center">
        {images.map(att => <ImageThumb key={att.id} productId={productId} att={att} onDelete={() => del.mutate(att.id)} />)}
        <button type="button" onClick={() => fileInput.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}
          onPaste={(e) => { for (const it of e.clipboardData.items) if (it.kind === 'file') { pick(it.getAsFile()); break; } }}
          className="flex items-center justify-center rounded-md"
          style={{ width: 88, height: 88, border: '1px dashed rgba(255,255,255,0.2)', color: 'var(--color-on-surface-variant)' }}
          aria-label="Anhang hinzufügen" title="Klick, Drag&Drop oder Cmd+V — Bild, E-Mail (.eml), PDF …">
          <span className="material-symbols-outlined">attach_file</span>
        </button>
      </div>
      <input ref={fileInput} type="file" className="hidden"
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      <p className="text-xs mt-1" style={{ color: 'var(--color-on-surface-variant)', opacity: 0.7 }}>
        Bild, E-Mail (.eml), PDF u.a. — auch AirDrop/Download-Datei reinziehen oder Cmd+V.
      </p>
      {err && <p className="text-xs mt-1" style={{ color: '#fca5a5' }}>{err}</p>}
    </div>
  );
}
