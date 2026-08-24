import { useState } from 'react';
import { useCompetitors, useCreateCompetitor, useDeleteCompetitor } from '../../../hooks/amazon/useCompetitors';
import { SectionHeader } from '../SectionHeader';
import { CompetitorCard } from './CompetitorCard';

const ACCENT = '#fb7185';
const STORAGE_KEY = (productId: number) => `amazon.competitors.expanded.${productId}`;

export function CompetitorsSection({ productId }: { productId: number }) {
  const { data, isLoading, isError, refetch } = useCompetitors(productId);
  const createC = useCreateCompetitor(productId);
  const deleteC = useDeleteCompetitor(productId);

  const [expanded, setExpanded] = useState<boolean>(() => {
    const v = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY(productId)) : null;
    return v === null ? true : v === '1';
  });
  function toggle() {
    setExpanded(prev => {
      const next = !prev;
      try { window.localStorage.setItem(STORAGE_KEY(productId), next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }

  const count = data?.length ?? 0;

  return (
    <section className="rounded-xl" style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <SectionHeader
        icon="groups"
        title="Mitbewerber"
        accent={ACCENT}
        expanded={expanded}
        onToggleExpand={toggle}
        rightSlot={
          <div className="flex items-center gap-2">
            <button
              type="button"
              title="Mitbewerber hinzufügen"
              onClick={(e) => { e.stopPropagation(); createC.mutate(); }}
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
              style={{ background: `${ACCENT}22`, color: ACCENT, border: `1px solid ${ACCENT}55` }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>add</span>
              Mitbewerber
            </button>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${ACCENT}22`, color: ACCENT }}>{count}</span>
          </div>
        }
      />
      {expanded && (
        <div className="px-3 pb-4">
          {isLoading && <p className="px-2 py-3 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>Lade Mitbewerber …</p>}
          {isError && (
            <div className="px-2 py-3">
              <p className="mb-2 text-sm" style={{ color: 'var(--color-on-surface)' }}>Mitbewerber konnten nicht geladen werden.</p>
              <button type="button" onClick={() => refetch()} className="px-3 py-1.5 rounded-md text-sm"
                style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}>Erneut laden</button>
            </div>
          )}
          {!isLoading && !isError && data && (
            <>
              {count === 0 && (
                <p className="px-2 py-3 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                  Noch keine Mitbewerber erfasst. Mit „+ Mitbewerber" den ersten anlegen.
                </p>
              )}
              {data.map(c => (
                <CompetitorCard
                  key={c.id}
                  productId={productId}
                  competitor={c}
                  onRequestDelete={() => {
                    if (confirm(`Mitbewerber „${c.title || 'ohne Titel'}" inklusive Anhängen löschen?`)) {
                      deleteC.mutate(c.id);
                    }
                  }}
                />
              ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}
