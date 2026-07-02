import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getAmazonProductImageObjectUrl,
  type AmazonDashboardActiveProduct,
} from '../../api/amazon.api';

interface Props {
  products: AmazonDashboardActiveProduct[];
}

function ProgressBar({ label, done, total, color }: { label: string; done: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min(100, (done / total) * 100) : 0;
  return (
    <div style={{ marginTop: '0.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-on-surface-variant)' }}>
          {label}
        </span>
        <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '0.68rem', color: 'var(--color-on-surface)' }}>
          {done}/{total}
        </span>
      </div>
      <div style={{ height: '5px', borderRadius: '9999px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '9999px', transition: 'width 200ms ease' }} />
      </div>
    </div>
  );
}

function ProductCard({ product }: { product: AmazonDashboardActiveProduct }) {
  const navigate = useNavigate();
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!product.has_image) return;
    let url: string | null = null;
    let cancelled = false;
    getAmazonProductImageObjectUrl(product.id)
      .then((u) => { if (cancelled) { URL.revokeObjectURL(u); } else { url = u; setImgUrl(u); } })
      .catch(() => {});
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [product.id, product.has_image]);

  return (
    <button
      className="module-card"
      onClick={() => navigate(`/amazon/entwicklung/products/${product.id}`)}
      style={{ textAlign: 'left', padding: '1rem', cursor: 'pointer' }}
    >
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', gap: '0.875rem', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
          <div style={{
            width: '52px', height: '52px', borderRadius: '0.5rem', flexShrink: 0, overflow: 'hidden',
            background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {imgUrl ? (
              <img src={imgUrl} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span className="material-symbols-outlined" style={{ fontSize: '1.5rem', color: 'var(--color-outline)' }}>image</span>
            )}
          </div>
          <p style={{
            fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '0.85rem',
            color: 'var(--color-on-surface)', margin: 0, lineHeight: 1.3, minWidth: 0,
          }}>
            {product.name}
          </p>
        </div>
        <ProgressBar label="Checkliste" done={product.checklist.done} total={product.checklist.total} color="var(--color-primary)" />
        <ProgressBar label="Sourcing" done={product.sourcing.done} total={product.sourcing.total} color="var(--color-secondary)" />
      </div>
    </button>
  );
}

export function AmazonActiveProducts({ products }: Props) {
  if (products.length === 0) {
    return (
      <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', fontStyle: 'italic' }}>
        Keine aktiven Produkte
      </p>
    );
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
      {products.map((p) => <ProductCard key={p.id} product={p} />)}
    </div>
  );
}
