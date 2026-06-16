import { useEffect, useRef, useState } from 'react';
import { getResearchImageObjectUrl, type ResearchImage } from '../../../api/amazon.api';
import { useUploadImage, useDeleteImage } from '../../../hooks/amazon/useResearch';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

function Thumb({ productId, image, onDelete }: { productId: number; image: ResearchImage; onDelete: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let revoked = false; let url: string | null = null;
    getResearchImageObjectUrl(productId, image.id).then(u => { if (revoked) { URL.revokeObjectURL(u); return; } url = u; setSrc(u); }).catch(() => setSrc(null));
    return () => { revoked = true; if (url) URL.revokeObjectURL(url); };
  }, [productId, image.id]);
  return (
    <div className="relative group" style={{ width: 88, height: 88 }}>
      {src
        ? <a href={src} target="_blank" rel="noopener noreferrer"><img src={src} alt="" className="w-full h-full object-cover rounded-md" /></a>
        : <div className="w-full h-full rounded-md" style={{ background: 'var(--color-surface-container-low)' }} />}
      <button type="button" onClick={onDelete}
        className="absolute top-1 right-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity px-1"
        style={{ background: 'rgba(0,0,0,0.6)', color: '#fca5a5' }} aria-label="Bild entfernen">
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
      </button>
    </div>
  );
}

export function ResearchCardImages({ productId, cardId, images }: { productId: number; cardId: number; images: ResearchImage[] }) {
  const upload = useUploadImage(productId);
  const del = useDeleteImage(productId);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function pick(f: File | undefined | null) {
    if (!f) return;
    if (!ALLOWED.includes(f.type)) { setErr('Nur JPG, PNG oder WEBP.'); return; }
    if (f.size > MAX_BYTES) { setErr('Bild größer als 5 MB.'); return; }
    setErr(null);
    upload.mutate({ cardId, file: f });
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-2 items-center">
        {images.map(img => <Thumb key={img.id} productId={productId} image={img} onDelete={() => del.mutate(img.id)} />)}
        <button type="button" onClick={() => fileInput.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}
          onPaste={(e) => { for (const it of e.clipboardData.items) if (it.kind === 'file') { pick(it.getAsFile()); break; } }}
          className="flex items-center justify-center rounded-md"
          style={{ width: 88, height: 88, border: '1px dashed rgba(255,255,255,0.2)', color: 'var(--color-on-surface-variant)' }}
          aria-label="Screenshot hinzufügen" title="Klick, Drag&Drop oder Cmd+V">
          <span className="material-symbols-outlined">add_photo_alternate</span>
        </button>
      </div>
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      {err && <p className="text-xs mt-1" style={{ color: '#fca5a5' }}>{err}</p>}
    </div>
  );
}
