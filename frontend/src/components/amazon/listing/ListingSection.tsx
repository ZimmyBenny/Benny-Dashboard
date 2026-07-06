import { useListing } from '../../../hooks/amazon/useListing';
import { useSectionExpanded } from '../../../hooks/amazon/useSectionExpanded';
import { SectionHeader } from '../SectionHeader';
import { ListingEditor } from './ListingEditor';
import { MainImageComparator } from './MainImageComparator';
import { ListingImages } from './ListingImages';

const ACCENT = '#fb923c'; // orange — eigene Akzentfarbe für Listing

export function ListingSection({ productId, defaultOpen = false }: { productId: number; defaultOpen?: boolean }) {
  const { data, isLoading, isError, refetch } = useListing(productId);
  const { expanded, toggle } = useSectionExpanded(productId, 'listing', defaultOpen);

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
          {isLoading && <p style={{ color: 'var(--color-on-surface-variant)' }}>Lade …</p>}
          {isError && (
            <button type="button" onClick={() => refetch()} className="self-start px-3 py-1.5 rounded-md text-sm"
              style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}>Erneut laden</button>
          )}
          {data && (
            <>
              <ListingEditor productId={productId} initial={data.listing} />
              <MainImageComparator productId={productId} competitorImages={data.images.competitor} listing={data.listing} />
              <ListingImages productId={productId} images={data.images.listing} />
            </>
          )}
        </div>
      )}
    </section>
  );
}
