import { useEffect, useRef, useState } from 'react';
import { getListingImageObjectUrl, type ListingImage } from '../../../api/amazon.api';
import { useUploadListingImage, useDeleteListingImage } from '../../../hooks/amazon/useListing';

const MAX_BYTES = 20 * 1024 * 1024;

// Bild-Vorschau (Objekt-URL mit Cleanup)
function ImageThumb({ productId, image, onDelete }: { productId: number; image: ListingImage; onDelete: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let revoked = false; let url: string | null = null;
    getListingImageObjectUrl(productId, image.id)
      .then(u => { if (revoked) { URL.revokeObjectURL(u); return; } url = u; setSrc(u); })
      .catch(() => setSrc(null));
    return () => { revoked = true; if (url) URL.revokeObjectURL(url); };
  }, [productId, image.id]);
  return (
    <div className="relative group" style={{ width: 96, height: 96 }}>
      {src
        ? <a href={src} target="_blank" rel="noopener noreferrer"><img src={src} alt="" className="w-full h-full object-cover rounded-md" style={{ border: '1px solid rgba(255,255,255,0.08)' }} /></a>
        : <div className="w-full h-full rounded-md" style={{ background: 'var(--color-surface-container-low)' }} />}
      <button type="button" onClick={onDelete}
        className="absolute top-1 right-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity px-1"
        style={{ background: 'rgba(0,0,0,0.6)', color: '#fca5a5' }} aria-label="Bild entfernen">
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
      </button>
    </div>
  );
}

export function ListingImages({ productId, images }: { productId: number; images: ListingImage[] }) {
  const upload = useUploadListingImage(productId);
  const del = useDeleteListingImage(productId);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function pick(f: File | undefined | null) {
    if (!f) return;
    if (f.size > MAX_BYTES) { setErr('Datei größer als 20 MB.'); return; }
    setErr(null);
    upload.mutate({ kind: 'listing', file: f });
  }
  function pickMany(files: FileList | null | undefined) {
    if (!files) return;
    Array.from(files).forEach(pick);
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium" style={{ color: 'var(--color-on-surface)' }}>Eigene Listing-Bilder</h3>
      <div className="flex flex-wrap gap-2 items-center">
        {images.map(im => <ImageThumb key={im.id} productId={productId} image={im} onDelete={() => del.mutate(im.id)} />)}
        <button type="button" onClick={() => fileInput.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); pickMany(e.dataTransfer.files); }}
          className="flex items-center justify-center rounded-md"
          style={{ width: 96, height: 96, border: '1px dashed rgba(255,255,255,0.2)', color: 'var(--color-on-surface-variant)' }}
          aria-label="Listing-Bild hinzufügen" title="Klick oder Drag&Drop — eigenes Listing-Bild">
          <span className="material-symbols-outlined">add_photo_alternate</span>
        </button>
      </div>
      <input ref={fileInput} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { pickMany(e.target.files); e.target.value = ''; }} />
      {err && <p className="text-xs" style={{ color: '#fca5a5' }}>{err}</p>}
    </div>
  );
}
