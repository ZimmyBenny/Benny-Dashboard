import { useState } from 'react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useAmazonProducts } from '../../hooks/amazon/useAmazonProducts';

export function AmazonOverviewPage() {
  const [showDiscarded, _setShowDiscarded] = useState(false);
  const { data: products = [], isLoading, isError, refetch } = useAmazonProducts(showDiscarded);

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
        <p style={{ color: 'var(--color-on-surface-variant)' }}>
          {products.length} Produkt(e) — Komponenten folgen in den nächsten Tasks.
        </p>
      )}
    </PageWrapper>
  );
}
