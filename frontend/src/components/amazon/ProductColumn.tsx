import { type ReactNode } from 'react';
import { type AmazonProduct, type AmazonProductStatus } from '../../api/amazon.api';
import { ProductCard } from './ProductCard';

interface Props {
  title: string;
  icon: string;
  accent: string;
  products: AmazonProduct[];
  emptyText: string;
  status: AmazonProductStatus;
  onRequestDelete: (product: AmazonProduct) => void;
  children?: ReactNode;
}

export function ProductColumn({ title, icon, accent, products, emptyText, onRequestDelete }: Props) {
  return (
    <section
      className="rounded-xl p-3 flex flex-col gap-3"
      style={{ background: 'var(--color-surface-container-low)', border: `1px solid ${accent}26` }}
    >
      <header className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined" style={{ color: accent }}>{icon}</span>
          <h2 className="font-semibold" style={{ color: accent }}>{title}</h2>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${accent}33`, color: accent }}>
          {products.length}
        </span>
      </header>
      <div className="flex flex-col gap-3 min-h-[120px]">
        {products.length === 0
          ? <p className="text-sm text-center py-8" style={{ color: 'var(--color-on-surface-variant)', opacity: 0.7 }}>{emptyText}</p>
          : products.map(p => <ProductCard key={p.id} product={p} onRequestDelete={onRequestDelete} />)
        }
      </div>
    </section>
  );
}
