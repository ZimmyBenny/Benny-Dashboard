import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { fetchReviewStats, fetchReviews } from '../../api/reviews.api';
import { fetchSteuer } from '../../api/steuer.api';
import { fetchTasks } from '../../api/tasks.api';

export function FinanzenStatusKpis() {
  const navigate = useNavigate();
  const jahr = new Date().getFullYear();

  const { data: reviewStats } = useQuery({
    queryKey: ['finance', 'review-stats'],
    queryFn: () => fetchReviewStats(jahr),
  });

  const { data: reviews } = useQuery({
    queryKey: ['finance', 'reviews'],
    queryFn: () => fetchReviews(),
  });

  const { data: steuer } = useQuery({
    queryKey: ['finance', 'steuer'],
    queryFn: () => fetchSteuer(jahr),
  });

  const { data: financeTasks } = useQuery({
    queryKey: ['finance', 'tasks-open'],
    queryFn: () => fetchTasks({ status: 'open', area: 'Finanzen' }),
  });

  const verkaufsbereitCount = (reviews ?? []).filter(r => r.status === 'bereit_verkauf').length;
  const steuerItems = steuer ? steuer.categories.flatMap(c => c.items) : [];
  const steuerDone = steuerItems.filter(i => i.is_done === 1).length;
  const steuerTotal = steuerItems.length;

  const saldoValue = reviewStats
    ? `${(reviewStats.realized_profit_cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
    : '–';
  const saldoColor = reviewStats && reviewStats.realized_profit_cents >= 0 ? '#4ade80' : 'var(--color-error)';

  const refundsValue = reviewStats ? reviewStats.open_refunds : '–';
  const refundsColor = reviewStats && reviewStats.open_refunds > 0 ? '#fb923c' : 'var(--color-on-surface)';

  const KPIS = [
    {
      key: 'saldo',
      label: `Saldo ${jahr}`,
      icon: 'payments',
      value: saldoValue,
      color: saldoColor,
      onClick: () => navigate('/finances/bewertungen'),
    },
    {
      key: 'refunds',
      label: 'Offene Refunds',
      icon: 'currency_exchange',
      value: refundsValue,
      color: refundsColor,
      onClick: () => navigate('/finances/bewertungen'),
    },
    {
      key: 'verkaufsbereit',
      label: 'Verkaufsbereit',
      icon: 'sell',
      value: reviews ? verkaufsbereitCount : '–',
      color: 'var(--color-secondary)',
      onClick: () => navigate('/finances/bewertungen'),
    },
    {
      key: 'steuer',
      label: 'Steuer-Checkliste',
      icon: 'checklist',
      value: steuer ? `${steuerDone} / ${steuerTotal}` : '0 / 0',
      color: 'var(--color-primary)',
      onClick: () => navigate('/finances/steuer-checkliste'),
    },
    {
      key: 'aufgaben',
      label: 'Finanzen-Aufgaben',
      icon: 'task_alt',
      value: financeTasks ? financeTasks.length : '–',
      color: 'var(--color-on-surface)',
      onClick: () => navigate('/tasks'),
    },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '0.625rem',
        marginBottom: '1.75rem',
      }}
      className="finanzen-kpi-grid"
    >
      {KPIS.map((kpi) => (
        <button
          key={kpi.key}
          onClick={kpi.onClick}
          style={{
            background: 'rgba(255,255,255,0.025)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '0.75rem',
            padding: '1rem 1.125rem',
            cursor: 'pointer',
            textAlign: 'left',
            display: 'flex',
            alignItems: 'center',
            gap: '0.875rem',
            transition: 'border-color 150ms ease, background 150ms ease',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.14)';
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.06)';
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.025)';
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '1.375rem', color: kpi.color, flexShrink: 0 }}
          >
            {kpi.icon}
          </span>
          <div style={{ minWidth: 0 }}>
            <p style={{
              fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '1.75rem',
              color: kpi.color, margin: 0, lineHeight: 1,
            }}>
              {kpi.value}
            </p>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: '0.65rem', textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)', margin: 0, marginTop: '0.25rem',
            }}>
              {kpi.label}
            </p>
          </div>
        </button>
      ))}

      <style>{`
        @media (min-width: 640px) {
          .finanzen-kpi-grid { grid-template-columns: repeat(5, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}
