import { useState } from 'react';
import { useListing } from '../../../hooks/amazon/useListing';
import { useSectionExpanded } from '../../../hooks/amazon/useSectionExpanded';
import { SectionHeader } from '../SectionHeader';
import { ListingEditor } from './ListingEditor';
import { MainImageComparator } from './MainImageComparator';
import { ListingImages } from './ListingImages';
import { ListingProductPreview } from './ListingProductPreview';

const ACCENT = '#fb923c'; // orange — eigene Akzentfarbe für Listing

type Mode = 'edit' | 'preview';

export function ListingSection({ productId, productName = '', defaultOpen = false }: { productId: number; productName?: string; defaultOpen?: boolean }) {
  const { data, isLoading, isError, refetch } = useListing(productId);
  const { expanded, toggle } = useSectionExpanded(productId, 'listing', defaultOpen);
  const [mode, setMode] = useState<Mode>('edit');

  return (
    <section className="rounded-xl" style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <SectionHeader
        icon="sell"
        title="Listing"
        accent={ACCENT}
        expanded={expanded}
        onToggleExpand={toggle}
      />
      {expanded && (
        <div className="p-4 pt-0 flex flex-col gap-6">
          {/* Segmented-Control: Bearbeiten | Amazon-Vorschau */}
          <div className="inline-flex rounded-lg overflow-hidden self-start" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
            {(['edit', 'preview'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className="px-3 py-1.5 text-sm"
                style={{
                  background: mode === m ? ACCENT : 'transparent',
                  color: mode === m ? '#1a1a1a' : 'var(--color-on-surface-variant)',
                  fontWeight: mode === m ? 600 : 400,
                }}
              >
                {m === 'edit' ? 'Bearbeiten' : 'Amazon-Vorschau'}
              </button>
            ))}
          </div>

          {isLoading && <p style={{ color: 'var(--color-on-surface-variant)' }}>Lade …</p>}
          {isError && (
            <button type="button" onClick={() => refetch()} className="self-start px-3 py-1.5 rounded-md text-sm"
              style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}>Erneut laden</button>
          )}
          {data && mode === 'edit' && (
            <>
              <ListingEditor productId={productId} initial={data.listing} />
              <MainImageComparator productId={productId} competitorImages={data.images.competitor} listing={data.listing} />
              <ListingImages productId={productId} images={data.images.listing} />
            </>
          )}
          {data && mode === 'preview' && (
            <ListingProductPreview productId={productId} listing={data.listing} productName={productName} />
          )}
        </div>
      )}
    </section>
  );
}
