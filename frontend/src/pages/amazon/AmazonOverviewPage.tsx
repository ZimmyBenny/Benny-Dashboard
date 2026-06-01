import { useState } from 'react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useAmazonProducts } from '../../hooks/amazon/useAmazonProducts';
import { ProductBoard } from '../../components/amazon/ProductBoard';
import { NewProductDialog } from '../../components/amazon/NewProductDialog';
import { DiscardedToggleButton } from '../../components/amazon/DiscardedToggleButton';
import { DeleteProductDialog } from '../../components/amazon/DeleteProductDialog';
import { type AmazonProduct } from '../../api/amazon.api';

export function AmazonOverviewPage() {
  const [showDiscarded, setShowDiscarded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AmazonProduct | null>(null);
  const { data: products = [], isLoading, isError, refetch } = useAmazonProducts(true);
  const discardedCount = products.filter(p => p.status === 'verworfen').length;
  const visibleProducts = showDiscarded ? products : products.filter(p => p.status !== 'verworfen');

  return (
    <PageWrapper>
      <header className="flex items-center gap-3 mb-6">
        <div
          className="w-12 h-12 rounded-lg flex items-center justify-center"
          style={{ background: 'var(--color-surface-container)' }}
        >
          <span className="material-symbols-outlined" style={{ color: 'var(--color-primary)' }}>
            settings
          </span>
        </div>
        <div>
          <h1
            className="text-2xl font-bold leading-tight"
            style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
          >
            ECO-Dashboard
          </h1>
          <p style={{ color: 'var(--color-on-surface-variant)' }}>
            Übersicht für Produktentwicklung
          </p>
        </div>
      </header>

      <div className="flex justify-end mb-4">
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="px-4 py-2 rounded-md text-sm flex items-center gap-2"
          style={{
            background: 'var(--color-surface-container-high)',
            color: 'var(--color-on-surface)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <span className="material-symbols-outlined text-base">add</span>
          Produkt direkt entwickeln
        </button>
      </div>

      <div className="flex justify-end mb-4">
        <DiscardedToggleButton
          active={showDiscarded}
          count={discardedCount}
          onToggle={() => setShowDiscarded(v => !v)}
        />
      </div>

      {isLoading && <p style={{ color: 'var(--color-on-surface-variant)' }}>Lade Produkte …</p>}
      {isError && (
        <div className="rounded-lg p-4" style={{ background: 'var(--color-surface-container-low)' }}>
          <p style={{ color: 'var(--color-on-surface)' }}>Produkte konnten nicht geladen werden.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-2 px-3 py-1.5 rounded-md text-sm"
            style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
          >
            Erneut laden
          </button>
        </div>
      )}
      {!isLoading && !isError && (
        <ProductBoard
          products={visibleProducts}
          showDiscarded={showDiscarded}
          onRequestDelete={setPendingDelete}
        />
      )}
      <DeleteProductDialog product={pendingDelete} onClose={() => setPendingDelete(null)} />
      <NewProductDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </PageWrapper>
  );
}
