import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { type AmazonProduct, getAmazonProductImageObjectUrl } from '../../api/amazon.api';
import { ProductStatusBadge } from './ProductStatusBadge';

const BORDER_COLOR: Record<AmazonProduct['status'], string> = {
  interessant: '#60a5fa',
  aktiv:       '#60a5fa',
  bestehend:   '#34d399',
  verworfen:   '#fdba74',
};

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
        className="aspect-[4/3] rounded-t-xl overflow-hidden flex items-center justify-center"
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
      className="aspect-[4/3] w-full rounded-t-xl overflow-hidden flex items-center justify-center"
      style={{ background: 'var(--color-surface-container-lowest)' }}
    >
      <img src={src} alt={product.name} className="w-full h-full object-contain" />
    </div>
  );
}

export function ProductCard({ product, onRequestDelete }: ProductCardProps) {
  const color = BORDER_COLOR[product.status];
  return (
    <Link
      to={`/amazon/entwicklung/products/${product.id}`}
      aria-label={`Produkt ${product.name} oeffnen`}
      className="block group"
    >
      <article
        className="rounded-xl cursor-pointer transition-shadow hover:shadow-lg"
        style={{
          background: 'var(--color-surface-container-low)',
          border: `1px solid ${color}26`,
        }}
      >
        <div className="relative">
          <ProductImage product={product} />
          <div
            className="absolute top-2 left-2 z-10"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            <ProductStatusBadge productId={product.id} status={product.status} />
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRequestDelete(product);
            }}
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
    </Link>
  );
}
