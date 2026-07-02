import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { fetchReviewStats, fetchReviews } from '../../api/reviews.api';
import { fetchSteuer } from '../../api/steuer.api';
import { fetchTasks } from '../../api/tasks.api';
import { fetchSaldo } from '../../api/haushalt.api';

type Kpi = {
  key: string;
  label: string;
  icon: string;
  value: string | number;
  color: string;
  onClick: () => void;
};

/** Kleiner Gruppen-Kopf (Bereichs-Label + Trennlinie). */
function GroupHeader({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.6rem' }}>
      <span style={{
        fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 700,
        letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-outline)', whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, var(--color-outline-variant) 0%, transparent 100%)' }} />
    </div>
  );
}

function KpiTile({ kpi }: { kpi: Kpi }) {
  return (
    <button
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
        width: '100%',
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
      <span className="material-symbols-outlined" style={{ fontSize: '1.375rem', color: kpi.color, flexShrink: 0 }}>
        {kpi.icon}
      </span>
      <div style={{ minWidth: 0 }}>
        <p style={{
          fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '1.6rem',
          color: kpi.color, margin: 0, lineHeight: 1, whiteSpace: 'nowrap',
        }}>
          {kpi.value}
        </p>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: '0.65rem', textTransform: 'uppercase',
          letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)', margin: 0, marginTop: '0.25rem',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {kpi.label}
        </p>
      </div>
    </button>
  );
}

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

  const { data: saldo } = useQuery({
    queryKey: ['finance', 'haushalt-saldo'],
    queryFn: () => fetchSaldo(),
  });

  // ── Bewertungen ──────────────────────────────────────
  const saldoValue = reviewStats
    ? `${(reviewStats.realized_profit_cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
    : '–';
  const saldoColor = reviewStats && reviewStats.realized_profit_cents >= 0 ? '#4ade80' : 'var(--color-error)';
  const refundsValue = reviewStats ? reviewStats.open_refunds : '–';
  const refundsColor = reviewStats && reviewStats.open_refunds > 0 ? '#fb923c' : 'var(--color-on-surface)';
  const verkaufsbereitCount = (reviews ?? []).filter((r) => r.status === 'bereit_verkauf').length;

  // ── Steuer ───────────────────────────────────────────
  const steuerItems = steuer ? steuer.categories.flatMap((c) => c.items) : [];
  const steuerDone = steuerItems.filter((i) => i.is_done === 1).length;
  const steuerTotal = steuerItems.length;

  // ── Haushalt (offener Betrag + Richtung) ─────────────
  const saldoAbs = saldo ? Math.abs(saldo.saldo) : 0;
  const haushaltValue = saldo
    ? `${saldoAbs.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
    : '–';
  const haushaltRichtung = !saldo
    ? 'Haushalt'
    : saldo.saldo === 0
      ? 'ausgeglichen'
      : saldo.saldo > 0
        ? 'Julia → Benny'
        : 'Benny → Julia';
  const haushaltColor = saldo && saldo.saldo !== 0 ? '#fb923c' : 'var(--color-on-surface)';

  const bewertungen: Kpi[] = [
    { key: 'saldo', label: `Saldo ${jahr}`, icon: 'payments', value: saldoValue, color: saldoColor, onClick: () => navigate('/finances/bewertungen') },
    { key: 'refunds', label: 'Offene Refunds', icon: 'currency_exchange', value: refundsValue, color: refundsColor, onClick: () => navigate('/finances/bewertungen') },
    { key: 'verkaufsbereit', label: 'Verkaufsbereit', icon: 'sell', value: reviews ? verkaufsbereitCount : '–', color: 'var(--color-secondary)', onClick: () => navigate('/finances/bewertungen') },
  ];

  const steuerKpi: Kpi = {
    key: 'steuer', label: 'erledigt', icon: 'checklist',
    value: steuer ? `${steuerDone} / ${steuerTotal}` : '0 / 0',
    color: 'var(--color-primary)', onClick: () => navigate('/finances/steuer-checkliste'),
  };
  const haushaltKpi: Kpi = {
    key: 'haushalt', label: haushaltRichtung, icon: 'family_restroom',
    value: haushaltValue, color: haushaltColor, onClick: () => navigate('/haushalt'),
  };
  const aufgabenKpi: Kpi = {
    key: 'aufgaben', label: 'offen', icon: 'task_alt',
    value: financeTasks ? financeTasks.length : '–',
    color: 'var(--color-on-surface)', onClick: () => navigate('/tasks'),
  };

  const einzelGruppen = [
    { key: 'g-steuer', label: 'Steuer', kpi: steuerKpi },
    { key: 'g-haushalt', label: 'Haushalt', kpi: haushaltKpi },
    { key: 'g-aufgaben', label: 'Aufgaben', kpi: aufgabenKpi },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '1.75rem' }}>
      {/* ── Bewertungen (3 Kacheln) ───────────────────────── */}
      <div>
        <GroupHeader label="Bewertungen" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.625rem' }}>
          {bewertungen.map((kpi) => (
            <KpiTile key={kpi.key} kpi={kpi} />
          ))}
        </div>
      </div>

      {/* ── Steuer · Haushalt · Aufgaben (je 1 Kachel) ─────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
        {einzelGruppen.map((g) => (
          <div key={g.key}>
            <GroupHeader label={g.label} />
            <KpiTile kpi={g.kpi} />
          </div>
        ))}
      </div>
    </div>
  );
}
