import { useEffect, useState } from 'react';
import { getUspImageObjectUrl, type UspPointImage } from '../../../api/amazon.api';
import { useDeleteUspPointImage } from '../../../hooks/amazon/useUsp';

function Thumb({ productId, image, onDelete }: { productId: number; image: UspPointImage; onDelete: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let revoked = false; let url: string | null = null;
    getUspImageObjectUrl(productId, image.id).then(u => { if (revoked) { URL.revokeObjectURL(u); return; } url = u; setSrc(u); }).catch(() => setSrc(null));
    return () => { revoked = true; if (url) URL.revokeObjectURL(url); };
  }, [productId, image.id]);
  return (
    <div className="relative group" style={{ width: 88, height: 88 }}>
      {src ? <img src={src} alt="" className="w-full h-full object-cover rounded-md" />
           : <div className="w-full h-full rounded-md" style={{ background: 'var(--color-surface-container-low)' }} />}
      <button type="button" onClick={onDelete}
        className="absolute top-1 right-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity px-1"
        style={{ background: 'rgba(0,0,0,0.6)', color: '#fca5a5' }} aria-label="Bild entfernen">
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
      </button>
    </div>
  );
}

export function UspPointImages({ productId, pointId, images }: { productId: number; pointId: number; images: UspPointImage[] }) {
  const del = useDeleteUspPointImage(productId);
  if (images.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {images.map(img => <Thumb key={img.id} productId={productId} image={img} onDelete={() => del.mutate({ pointId, imageId: img.id })} />)}
    </div>
  );
}
