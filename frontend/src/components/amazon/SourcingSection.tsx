import { type SourcingStatus } from '../../api/amazon.api';
import { useSourcing, useUpdateSourcing } from '../../hooks/amazon/useSourcing';
import { SectionHeader } from './SectionHeader';
import { SectionStatusBadge } from './SectionStatusBadge';
import { SourcingChecklist } from './SourcingChecklist';
import { SourcingSampleTable } from './SourcingSampleTable';

const ACCENT = '#a78bfa'; // purple-400

interface Props {
  productId: number;
}

export function SourcingSection({ productId }: Props) {
  const { data, isLoading, isError, refetch } = useSourcing(productId);
  const update = useUpdateSourcing(productId);

  if (isLoading) {
    return (
      <section
        className="rounded-xl p-5"
        style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <p style={{ color: 'var(--color-on-surface-variant)' }}>Lade Sourcing …</p>
      </section>
    );
  }

  if (isError || !data) {
    return (
      <section
        className="rounded-xl p-5"
        style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <p className="mb-2" style={{ color: 'var(--color-on-surface)' }}>Sourcing konnte nicht geladen werden.</p>
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

  const { sourcing, samples } = data;
  const expanded = sourcing.is_expanded === 1;

  return (
    <section
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <SectionHeader
        icon="inventory_2"
        title="Sourcing"
        accent={ACCENT}
        expanded={expanded}
        onToggleExpand={() => update.mutate({ is_expanded: expanded ? 0 : 1 })}
        rightSlot={
          <SectionStatusBadge
            status={sourcing.status}
            onChange={(next: SourcingStatus) => update.mutate({ status: next })}
          />
        }
      />
      {expanded && (
        <>
          <SourcingChecklist productId={productId} sourcing={sourcing} />
          <SourcingSampleTable productId={productId} samples={samples} />
        </>
      )}
    </section>
  );
}
