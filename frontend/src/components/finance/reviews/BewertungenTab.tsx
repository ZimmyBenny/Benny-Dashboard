import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchReviewStats, type Review, type ReviewStats } from '../../../api/reviews.api';
import { formatCurrencyFromCents } from '../../../lib/format';
import { KPICard } from '../../dj/KPICard';
import { ReviewsKanbanBoard } from './ReviewsKanbanBoard';
import { ReviewDetailModal } from './ReviewDetailModal';
import { AddReviewModal } from './AddReviewModal';

// addOpen wird per Prop von FinancesPage gesteuert (kein interner State),
// weil der "+ Neue Bewertung"-Button im Page-Header der FinancesPage lebt.
interface Props {
  addOpen: boolean;
  onAddClose: () => void;
}

const CURRENT_YEAR = new Date().getFullYear();

export function BewertungenTab({ addOpen, onAddClose }: Props) {
  const [selectedYear, setSelectedYear] = useState<number | 'all'>(CURRENT_YEAR);
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data: stats } = useQuery<ReviewStats>({
    queryKey: ['reviews-stats', selectedYear],
    queryFn: () => fetchReviewStats(selectedYear),
  });

  const yearOptions: Array<{ value: number | 'all'; label: string }> = [
    { value: CURRENT_YEAR,      label: String(CURRENT_YEAR) },
    { value: CURRENT_YEAR - 1,  label: String(CURRENT_YEAR - 1) },
    { value: 'all',             label: 'Alle' },
  ];

  // User-Decision 2026-05-25: KPI 3 accentColor
  const profit = stats?.realized_profit_cents ?? 0;
  const profitAccent: 'primary' | 'secondary' | 'error' =
    profit > 0 ? 'secondary' : profit < 0 ? 'error' : 'primary';

  const yearLabel = selectedYear === 'all' ? 'gesamt' : `im Jahr ${selectedYear}`;

  return (
    <div>
      {/* Year-Filter Pill-Toggle */}
      <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '1.5rem' }}>
        {yearOptions.map(opt => {
          const active = opt.value === selectedYear;
          return (
            <button
              key={String(opt.value)}
              onClick={() => setSelectedYear(opt.value)}
              style={{
                background: active ? 'linear-gradient(135deg, #cc97ff 0%, #9c48ea 100%)' : 'rgba(255,255,255,0.04)',
                color: active ? '#fff' : 'var(--color-on-surface-variant)',
                border: active ? 'none' : '1px solid var(--color-outline)',
                borderRadius: '9999px',
                padding: '0.375rem 0.875rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* KPI-Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem',
      }}>
        <KPICard
          label="Einträge gesamt"
          value={stats?.total ?? 0}
          icon="inventory_2"
          sublabel={yearLabel}
          accentColor="primary"
        />
        <KPICard
          label="Offene Refunds"
          value={stats?.open_refunds ?? 0}
          icon="pending_actions"
          sublabel="vor 'Geld erhalten'"
          accentColor="secondary"
        />
        <KPICard
          label="Realisierter Gewinn"
          value={formatCurrencyFromCents(profit)}
          icon="payments"
          sublabel={yearLabel}
          accentColor={profitAccent}
        />
      </div>

      {/* Kanban-Board */}
      <ReviewsKanbanBoard
        selectedYear={selectedYear}
        onCardClick={(r) => { setSelectedReview(r); setDetailOpen(true); }}
      />

      {/* Modals */}
      <AddReviewModal isOpen={addOpen} onClose={onAddClose} />
      <ReviewDetailModal
        review={selectedReview}
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </div>
  );
}
