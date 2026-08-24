import { useEffect, useRef, useState } from 'react';
import { getCompetitorFileObjectUrl, type CompetitorFile } from '../../../api/amazon.api';
import { useUploadCompetitorFile, useDeleteCompetitorFile } from '../../../hooks/amazon/useCompetitors';

const MAX_BYTES = 20 * 1024 * 1024;

function isImage(att: CompetitorFile): boolean {
  return (att.mime ?? '').startsWith('image/');
}
function fileIcon(att: CompetitorFile): string {
  const mime = att.mime ?? '';
  const name = (att.original_name ?? '').toLowerCase();
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'picture_as_pdf';
  if (mime.startsWith('video/')) return 'video_file';
  return 'description';
}

function ImageThumb({ productId, att, onDelete }: { productId: number; att: CompetitorFile; onDelete: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let revoked = false; let url: string | null = null;
    getCompetitorFileObjectUrl(productId, att.id).then(u => { if (revoked) { URL.revokeObjectURL(u); return; } url = u; setSrc(u); }).catch(() => setSrc(null));
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

export function CompetitorFiles({ productId, competitorId, files }: { productId: number; competitorId: number; files: CompetitorFile[] }) {
  const upload = useUploadCompetitorFile(productId);
  const del = useDeleteCompetitorFile(productId);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const images = files.filter(isImage);
  const others = files.filter(a => !isImage(a));

  function pick(f: File | undefined | null) {
    if (!f) return;
    if (f.size > MAX_BYTES) { setErr('Datei größer als 20 MB.'); return; }
    setErr(null);
    upload.mutate({ cid: competitorId, file: f });
  }
  function pickMany(list: FileList | null | undefined) {
    if (!list) return;
    Array.from(list).forEach(pick);
  }
  async function download(att: CompetitorFile) {
    try {
      const url = await getCompetitorFileObjectUrl(productId, att.id);
      const a = document.createElement('a');
      a.href = url; a.download = att.original_name ?? 'datei';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch { setErr('Download fehlgeschlagen.'); }
  }

  return (
    <div className="mt-2">
      {others.length > 0 && (
        <div className="flex flex-col gap-1 mb-2">
          {others.map(att => (
            <div key={att.id} className="flex items-center gap-2 text-sm group rounded px-2 py-1"
              style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--color-on-surface-variant)' }}>{fileIcon(att)}</span>
              <button type="button" onClick={() => download(att)} className="flex-1 min-w-0 truncate text-left"
                style={{ color: 'var(--color-on-surface)' }} title="Herunterladen">
                {att.original_name ?? 'Datei'}
              </button>
              <button type="button" onClick={() => del.mutate(att.id)} aria-label="Anhang entfernen"
                className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#fca5a5' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        {images.map(att => <ImageThumb key={att.id} productId={productId} att={att} onDelete={() => del.mutate(att.id)} />)}
        <button type="button" onClick={() => fileInput.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); pickMany(e.dataTransfer.files); }}
          className="flex items-center justify-center rounded-md"
          style={{ width: 88, height: 88, border: '1px dashed rgba(255,255,255,0.2)', color: 'var(--color-on-surface-variant)' }}
          aria-label="Screenshot/Anhang hinzufügen" title="Klick oder Drag&Drop — Screenshot, PDF …">
          <span className="material-symbols-outlined">add_photo_alternate</span>
        </button>
      </div>
      <p className="text-xs mt-1" style={{ color: 'var(--color-on-surface-variant)', opacity: 0.7 }}>
        Screenshots/Dateien — auch reinziehen (Drag&Drop).
      </p>
      {err && <p className="text-xs mt-1" style={{ color: '#fca5a5' }}>{err}</p>}
      <input ref={fileInput} type="file" multiple className="hidden"
        onChange={(e) => { pickMany(e.target.files); e.target.value = ''; }} />
    </div>
  );
}
