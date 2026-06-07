import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useAmazonProducts } from '../../hooks/amazon/useAmazonProducts';
import { BrandNameSection } from '../../components/amazon/BrandNameSection';

const ACCENT = '#f472b6';
const STORAGE_KEY = 'amazon.brand.selected-product';

function readStoredId(): number | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isInteger(n) ? n : null;
  } catch {
    return null;
  }
}

export function AmazonBrandPage() {
  const { data: products = [], isLoading, isError, refetch } = useAmazonProducts(true);
  const [selectedId, setSelectedId] = useState<number | null>(readStoredId);

  // Auswahl gegen die geladene Liste abgleichen: gemerktes Produkt wählen,
  // sonst auf das erste Produkt zurückfallen.
  useEffect(() => {
    if (products.length === 0) return;
    const exists = selectedId != null && products.some(p => p.id === selectedId);
    if (!exists) setSelectedId(products[0].id);
  }, [products, selectedId]);

  // Auswahl persistieren.
  useEffect(() => {
    if (selectedId == null) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(selectedId));
    } catch {
      /* ignore */
    }
  }, [selectedId]);

  const selected = products.find(p => p.id === selectedId) ?? null;

  return (
    <PageWrapper>
      <header className="flex items-center gap-3 mb-6">
        <div
          className="w-12 h-12 rounded-lg flex items-center justify-center"
          style={{ background: 'var(--color-surface-container)' }}
        >
          <span className="material-symbols-outlined" style={{ color: ACCENT }}>
            label
          </span>
        </div>
        <div>
          <h1
            className="text-2xl font-bold leading-tight"
            style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
          >
            Markenname
          </h1>
          <p style={{ color: 'var(--color-on-surface-variant)' }}>
            Markennamen je Produkt recherchieren
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

      {!isLoading && !isError && products.length === 0 && (
        <div className="rounded-lg p-4" style={{ background: 'var(--color-surface-container-low)' }}>
          <p className="mb-2" style={{ color: 'var(--color-on-surface)' }}>
            Noch keine Produkte vorhanden.
          </p>
          <Link
            to="/amazon/entwicklung"
            className="px-3 py-1.5 rounded-md text-sm inline-block"
            style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}
          >
            Zur Entwicklung
          </Link>
        </div>
      )}

      {!isLoading && !isError && products.length > 0 && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1.5 max-w-md">
            <label
              htmlFor="brand-product-select"
              className="text-sm"
              style={{ color: 'var(--color-on-surface-variant)' }}
            >
              Produkt
            </label>
            <select
              id="brand-product-select"
              value={selectedId ?? ''}
              onChange={(e) => setSelectedId(Number(e.target.value))}
              className="px-3 py-2 rounded-md text-sm"
              style={{
                background: 'var(--color-surface-container-high)',
                color: 'var(--color-on-surface)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {products.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {selected && (
            <BrandNameSection productId={selected.id} productName={selected.name} />
          )}
        </div>
      )}
    </PageWrapper>
  );
}
