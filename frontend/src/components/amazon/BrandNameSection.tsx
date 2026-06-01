import { type BrandStatus } from '../../api/amazon.api';
import { useBrand, useUpdateBrand } from '../../hooks/amazon/useBrand';
import { SectionHeader } from './SectionHeader';
import { SectionStatusBadge } from './SectionStatusBadge';
import { BrandNotes } from './BrandNotes';
import { BrandNameTable } from './BrandNameTable';
import { BrandFavoritesPanel } from './BrandFavoritesPanel';
import { exportBrandPdf } from '../../lib/amazon/exportBrandPdf';

const ACCENT = '#f472b6';

interface Props {
  productId: number;
  productName: string;
}

export function BrandNameSection({ productId, productName }: Props) {
  const { data, isLoading, isError, refetch } = useBrand(productId);
  const update = useUpdateBrand(productId);

  if (isLoading) {
    return (
      <section
        className="rounded-xl p-5"
        style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <p style={{ color: 'var(--color-on-surface-variant)' }}>Lade Markenname …</p>
      </section>
    );
  }
  if (isError || !data) {
    return (
      <section
        className="rounded-xl p-5"
        style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <p className="mb-2" style={{ color: 'var(--color-on-surface)' }}>Markenname konnte nicht geladen werden.</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="px-3 py-1.5 rounded-md text-sm"
          style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
        >
          Erneut laden
        </button>
      </section>
    );
  }

  const { brand, names } = data;
  const expanded = brand.is_expanded === 1;

  function handleExport() {
    if (!data) return;
    exportBrandPdf({ name: productName }, data);
  }

  type ReuseStatus = Parameters<typeof SectionStatusBadge>[0]['status'];

  return (
    <section
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <SectionHeader
        icon="label"
        title="Markenname"
        accent={ACCENT}
        expanded={expanded}
        onToggleExpand={() => update.mutate({ is_expanded: expanded ? 0 : 1 })}
        rightSlot={
          <SectionStatusBadge
            status={brand.status as ReuseStatus}
            onChange={(next: ReuseStatus) => update.mutate({ status: next as BrandStatus })}
          />
        }
      />
      {expanded && (
        <>
          <BrandNotes productId={productId} notes={brand.notes} />
          <BrandNameTable
            productId={productId}
            brand={brand}
            candidates={names}
            onExportPdf={handleExport}
          />
          <BrandFavoritesPanel productId={productId} candidates={names} />
        </>
      )}
    </section>
  );
}
