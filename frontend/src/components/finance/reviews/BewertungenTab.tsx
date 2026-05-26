import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchReviewStats, type Review, type ReviewStats } from '../../../api/reviews.api';
import { formatCurrencyFromCents } from '../../../lib/format';
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
  const profitColor =
    profit > 0 ? 'var(--color-secondary)' :
    profit < 0 ? 'var(--color-error)' :
    'var(--color-on-surface)';

  const yearLabel = selectedYear === 'all' ? 'gesamt' : `im Jahr ${selectedYear}`;

  // KPI-Card-Style — DJ-OverviewPage Pattern (inline, rgba-Background, 2rem Value)
  const kpiCardStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '0.75rem',
    padding: '1.5rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  };
  const kpiLabelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-body)',
    fontSize: '0.7rem',
    fontWeight: 500,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--color-on-surface-variant)',
    margin: 0,
    marginBottom: '0.375rem',
  };
  const kpiValueStyle = (color: string): React.CSSProperties => ({
    fontFamily: 'var(--font-headline)',
    fontSize: '2rem',
    fontWeight: 700,
    color,
    lineHeight: 1,
    margin: 0,
  });
  const kpiSubStyle: React.CSSProperties = {
    fontFamily: 'var(--font-body)',
    fontSize: '0.7rem',
    color: 'var(--color-on-surface-variant)',
    margin: 0,
    marginTop: '0.4rem',
  };

  return (
    <div>
      {/* Year-Filter — DJ-Toggle-Style (Pill-Container) */}
      <div style={{
        display: 'inline-flex',
        gap: '0.375rem',
        background: 'rgba(0,0,0,0.2)',
        padding: '0.25rem',
        borderRadius: '999px',
        marginBottom: '1.5rem',
      }}>
        {yearOptions.map(opt => {
          const active = opt.value === selectedYear;
          return (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => setSelectedYear(opt.value)}
              style={{
                background: active
                  ? 'linear-gradient(135deg, rgba(148,170,255,0.25), rgba(148,170,255,0.1))'
                  : 'transparent',
                border: active ? '1px solid rgba(148,170,255,0.4)' : '1px solid transparent',
                borderRadius: '999px',
                color: active ? '#94aaff' : 'var(--color-on-surface-variant)',
                padding: '0.3rem 0.875rem',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-body)',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s',
                boxShadow: active ? '0 0 12px rgba(148,170,255,0.2)' : 'none',
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Saldo — eine prominente Anzeige (User-Decision 2026-05-26: KPIs reduziert auf das Wesentliche) */}
      <div style={{
        ...kpiCardStyle,
        marginBottom: '1.5rem',
      }}>
        <div>
          <p style={kpiLabelStyle}>Saldo {yearLabel}</p>
          <p style={{ ...kpiValueStyle(profitColor), fontSize: '2.5rem' }}>
            {formatCurrencyFromCents(profit)}
          </p>
          <p style={kpiSubStyle}>
            {stats?.total ?? 0} Einträge · Ware: {formatCurrencyFromCents(stats?.spent_cents ?? 0)} · {stats?.open_refunds ?? 0} offene Refunds
          </p>
        </div>
        <span
          className="material-symbols-outlined"
          style={{ fontSize: '36px', color: profitColor, opacity: 0.7 }}
        >
          payments
        </span>
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
