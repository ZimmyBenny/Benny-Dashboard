import { useEffect, useRef, useState } from 'react';
import {
  getListingImageObjectUrl, getAmazonProductImageObjectUrl, type ListingImage,
} from '../../../api/amazon.api';
import {
  useUploadListingImage, useDeleteListingImage, useUpdateListingImageLabel,
} from '../../../hooks/amazon/useListing';

const ACCENT = '#fb923c';
const MAX_BYTES = 20 * 1024 * 1024;

// Eigenes Produkt-Hauptbild als quadratische Kachel (Badge „Dein Bild").
function OwnMainImageTile({ productId }: { productId: number }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let revoked = false; let url: string | null = null;
    getAmazonProductImageObjectUrl(productId)
      .then(u => { if (revoked) { URL.revokeObjectURL(u); return; } url = u; setSrc(u); setLoaded(true); })
      .catch(() => { setSrc(null); setLoaded(true); });
    return () => { revoked = true; if (url) URL.revokeObjectURL(url); };
  }, [productId]);
  return (
    <div className="flex flex-col gap-1">
      <div className="relative aspect-square rounded-md overflow-hidden"
        style={{ border: `2px solid ${ACCENT}`, background: 'var(--color-surface-container-low)' }}>
        {src
          ? <img src={src} alt="Eigenes Hauptbild" className="w-full h-full object-cover" />
          : (
            <div className="w-full h-full flex items-center justify-center text-xs text-center px-2"
              style={{ color: 'var(--color-on-surface-variant)' }}>
              {loaded ? 'Kein Hauptbild' : '…'}
            </div>
          )}
        <span className="absolute top-1 left-1 text-xs px-1.5 py-0.5 rounded-full font-medium"
          style={{ background: ACCENT, color: '#1a1a1a' }}>Dein Bild</span>
      </div>
      <span className="text-xs h-4" />
    </div>
  );
}

// Wettbewerber-Kachel mit editierbarem Label + Delete (Hover).
function CompetitorTile({ productId, image, onDelete }: { productId: number; image: ListingImage; onDelete: () => void }) {
  const updateLabel = useUpdateListingImageLabel(productId);
  const [src, setSrc] = useState<string | null>(null);
  const [label, setLabel] = useState<string>(image.label ?? '');
  const lastSaved = useRef<string>(image.label ?? '');

  useEffect(() => {
    let revoked = false; let url: string | null = null;
    getListingImageObjectUrl(productId, image.id)
      .then(u => { if (revoked) { URL.revokeObjectURL(u); return; } url = u; setSrc(u); })
      .catch(() => setSrc(null));
    return () => { revoked = true; if (url) URL.revokeObjectURL(url); };
  }, [productId, image.id]);

  useEffect(() => { setLabel(image.label ?? ''); lastSaved.current = image.label ?? ''; }, [image.label]);

  function saveLabel() {
    if (label === lastSaved.current) return;
    lastSaved.current = label;
    updateLabel.mutate({ imageId: image.id, label: label.trim().length === 0 ? null : label });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="relative group aspect-square rounded-md overflow-hidden"
        style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'var(--color-surface-container-low)' }}>
        {src
          ? <a href={src} target="_blank" rel="noopener noreferrer"><img src={src} alt="" className="w-full h-full object-cover" /></a>
          : <div className="w-full h-full" />}
        <button type="button" onClick={onDelete}
          className="absolute top-1 right-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity px-1"
          style={{ background: 'rgba(0,0,0,0.6)', color: '#fca5a5' }} aria-label="Wettbewerber-Bild entfernen">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
        </button>
      </div>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={saveLabel}
        placeholder="Preis / Name …"
        className="text-xs rounded px-1.5 py-0.5 w-full"
        style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.06)' }}
      />
    </div>
  );
}

export function MainImageComparator({ productId, competitorImages }: { productId: number; competitorImages: ListingImage[] }) {
  const upload = useUploadListingImage(productId);
  const del = useDeleteListingImage(productId);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function pick(f: File | undefined | null) {
    if (!f) return;
    if (f.size > MAX_BYTES) { setErr('Datei größer als 20 MB.'); return; }
    setErr(null);
    upload.mutate({ kind: 'competitor', file: f });
  }
  function pickMany(files: FileList | null | undefined) {
    if (!files) return;
    Array.from(files).forEach(pick);
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium" style={{ color: 'var(--color-on-surface)' }}>Hauptbild-Vergleich</h3>
      <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)', opacity: 0.7 }}>
        Dein Hauptbild neben Wettbewerber-Bildern — wie im Amazon-Suchraster.
      </p>
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
        <OwnMainImageTile productId={productId} />
        {competitorImages.map(im => (
          <CompetitorTile key={im.id} productId={productId} image={im} onDelete={() => del.mutate(im.id)} />
        ))}
        <div className="flex flex-col gap-1">
          <button type="button" onClick={() => fileInput.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); pickMany(e.dataTransfer.files); }}
            className="aspect-square flex items-center justify-center rounded-md"
            style={{ border: '1px dashed rgba(255,255,255,0.2)', color: 'var(--color-on-surface-variant)' }}
            aria-label="Wettbewerber-Bild hinzufügen" title="Wettbewerber-Bild hinzufügen">
            <span className="material-symbols-outlined">add</span>
          </button>
          <span className="text-xs h-4" />
        </div>
      </div>
      <input ref={fileInput} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { pickMany(e.target.files); e.target.value = ''; }} />
      {err && <p className="text-xs" style={{ color: '#fca5a5' }}>{err}</p>}
    </div>
  );
}
