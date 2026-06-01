import { useEffect, useState } from 'react';
import { type AmazonProduct, type AmazonProductStatus, getAmazonProductImageObjectUrl } from '../../api/amazon.api';

const STATUS_LABEL: Record<AmazonProductStatus, string> = {
  interessant: 'Interessant',
  aktiv:       'Aktiv',
  bestehend:   'Bestehend',
  verworfen:   'Verworfen',
};
const STATUS_ICON: Record<AmazonProductStatus, string> = {
  interessant: 'star',
  aktiv:       'settings',
  bestehend:   'check_circle',
  verworfen:   'archive',
};
const STATUS_COLOR: Record<AmazonProductStatus, string> = {
  interessant: '#60a5fa', // blue-400
  aktiv:       '#60a5fa',
  bestehend:   '#34d399', // emerald-400
  verworfen:   '#fdba74', // orange-300
};

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
        className="aspect-[16/9] rounded-t-xl flex items-center justify-center"
        style={{ background: 'var(--color-surface-container-low)' }}
      >
        <span
          className="material-symbols-outlined text-4xl"
          style={{ color: 'var(--color-on-surface-variant)', opacity: 0.5 }}
        >
          image
        </span>
      </div>
    );
  }
  return <img src={src} alt={product.name} className="aspect-[16/9] w-full object-cover rounded-t-xl" />;
}

export function ProductCard({ product }: { product: AmazonProduct }) {
  const color = STATUS_COLOR[product.status];
  return (
    <article
      className="rounded-xl overflow-hidden"
      style={{
        background: 'var(--color-surface-container-low)',
        border: `1px solid ${color}26`, // ~15% alpha
      }}
    >
      <div className="relative">
        <ProductImage product={product} />
        <div
          className="absolute top-2 left-2 px-2.5 py-1 rounded-full text-xs flex items-center gap-1 backdrop-blur-sm"
          style={{ background: `${color}33`, color }}
        >
          <span className="material-symbols-outlined text-base">{STATUS_ICON[product.status]}</span>
          {STATUS_LABEL[product.status]}
        </div>
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
