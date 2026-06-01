import { useEffect, useRef, useState } from 'react';
import { type AmazonProduct, getAmazonProductImageObjectUrl } from '../../api/amazon.api';
import { useUploadAmazonProductImage } from '../../hooks/amazon/useAmazonProducts';
import { ProductStatusBadge } from './ProductStatusBadge';

const BORDER_COLOR: Record<AmazonProduct['status'], string> = {
  interessant: '#60a5fa',
  aktiv:       '#60a5fa',
  bestehend:   '#34d399',
  verworfen:   '#fdba74',
};

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

interface ProductCardProps {
  product: AmazonProduct;
  onRequestDelete: (product: AmazonProduct) => void;
}

function ProductImage({ product }: { product: AmazonProduct }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    if (!product.image_path) { setSrc(null); return; }
    getAmazonProductImageObjectUrl(product.id)
      .then(url => {
        if (revoked) { URL.revokeObjectURL(url); return; }
        objectUrl = url;
        setSrc(url);
      })
      .catch(() => setSrc(null));
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [product.id, product.image_path]);

  if (!src) {
    return (
      <div
        className="aspect-[4/3] rounded-t-xl flex items-center justify-center"
        style={{ background: 'var(--color-surface-container-low)' }}
      >
        <span className="material-symbols-outlined text-4xl" style={{ color: 'var(--color-on-surface-variant)', opacity: 0.5 }}>
          image
        </span>
      </div>
    );
  }
  return (
    <div
      className="aspect-[4/3] w-full rounded-t-xl flex items-center justify-center"
      style={{ background: 'var(--color-surface-container-lowest)' }}
    >
      <img src={src} alt={product.name} className="max-h-full max-w-full object-contain" />
    </div>
  );
}

export function ProductCard({ product, onRequestDelete }: ProductCardProps) {
  const color = BORDER_COLOR[product.status];
  const upload = useUploadAmazonProductImage();
  const fileInput = useRef<HTMLInputElement | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!ALLOWED_TYPES.includes(f.type) || f.size > MAX_BYTES) return;
    upload.mutate({ id: product.id, file: f });
  }

  return (
    <article
      className="rounded-xl overflow-hidden group"
      style={{
        background: 'var(--color-surface-container-low)',
        border: `1px solid ${color}26`,
      }}
    >
      <div className="relative">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          aria-label={product.image_path ? 'Bild ersetzen' : 'Bild hinzufügen'}
          className="block w-full relative"
        >
          <ProductImage product={product} />
          <span
            className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
            style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }}
          >
            <span
              className="px-2.5 py-1 rounded-md text-xs flex items-center gap-1"
              style={{ background: 'var(--color-surface-container)', color: 'var(--color-on-surface)' }}
            >
              <span className="material-symbols-outlined text-base">photo_camera</span>
              {product.image_path ? 'Ersetzen' : 'Hinzufügen'}
            </span>
          </span>
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={onPick}
        />
        <div className="absolute top-2 left-2 z-10">
          <ProductStatusBadge productId={product.id} status={product.status} />
        </div>
        <button
          type="button"
          onClick={() => onRequestDelete(product)}
          aria-label="Produkt löschen"
          className="absolute top-2 right-2 z-10 p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
        >
          <span className="material-symbols-outlined text-base" style={{ color: '#fca5a5' }}>delete</span>
        </button>
      </div>
      <div className="p-3">
        <h3 className="font-semibold mb-2" style={{ color: 'var(--color-on-surface)' }}>
          {product.name}
        </h3>
        <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
          {new Date(product.created_at * 1000).toLocaleDateString('de-DE')}
        </p>
      </div>
    </article>
  );
}
