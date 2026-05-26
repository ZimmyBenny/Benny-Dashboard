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

      {/* KPI-Grid — DJ-Style: 3-Col fix, light background, 2rem value, icon rechts */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '1rem',
        marginBottom: '1.5rem',
      }}>
        <div style={kpiCardStyle}>
          <div>
            <p style={kpiLabelStyle}>Einträge gesamt</p>
            <p style={kpiValueStyle('var(--color-on-surface)')}>{stats?.total ?? 0}</p>
            <p style={kpiSubStyle}>{yearLabel}</p>
          </div>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '28px', color: '#94aaff', opacity: 0.7 }}
          >
            inventory_2
          </span>
        </div>

        <div style={kpiCardStyle}>
          <div>
            <p style={kpiLabelStyle}>Offene Refunds</p>
            <p style={kpiValueStyle('var(--color-tertiary)')}>{stats?.open_refunds ?? 0}</p>
            <p style={kpiSubStyle}>vor &apos;Geld erhalten&apos;</p>
          </div>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '28px', color: 'var(--color-tertiary)', opacity: 0.7 }}
          >
            pending_actions
          </span>
        </div>

        <div style={kpiCardStyle}>
          <div>
            <p style={kpiLabelStyle}>Realisierter Gewinn</p>
            <p style={kpiValueStyle(profitColor)}>{formatCurrencyFromCents(profit)}</p>
            <p style={kpiSubStyle}>{yearLabel}</p>
          </div>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '28px', color: profitColor, opacity: 0.7 }}
          >
            payments
          </span>
        </div>
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
