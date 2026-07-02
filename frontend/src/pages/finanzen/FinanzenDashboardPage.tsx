import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { FinanzenStatusKpis } from '../../components/finanzen/FinanzenStatusKpis';
import { FinanzenOpenTasks } from '../../components/finanzen/FinanzenOpenTasks';
import { FinanzenNavTiles } from '../../components/finanzen/FinanzenNavTiles';
import { SharpGridBackground } from '../../components/layout/SharpGridBackground';

function SectionDivider({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '2.5rem', marginBottom: '1.25rem' }}>
      <p style={{
        fontFamily: 'var(--font-body)', fontSize: '0.65rem', letterSpacing: '0.22em',
        textTransform: 'uppercase', color: 'var(--color-outline)', whiteSpace: 'nowrap',
      }}>
        {label}
      </p>
      <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, var(--color-outline-variant) 0%, transparent 100%)' }} />
    </div>
  );
}

export function FinanzenDashboardPage() {
  const navigate = useNavigate();

  return (
    <PageWrapper>
      <div style={{ position: 'relative' }}>
        <SharpGridBackground />
        <div style={{ position: 'relative', zIndex: 1 }}>
      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', minWidth: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: '2rem', color: 'var(--color-primary)', flexShrink: 0 }}>account_balance_wallet</span>
          <div style={{ minWidth: 0 }}>
            <h1 className="display-text" style={{ fontSize: 'clamp(1.4rem, 2.5vw, 2rem)', color: 'var(--color-on-surface)', margin: 0, lineHeight: 1.1 }}>
              Finanzen-Dashboard
            </h1>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', margin: 0, marginTop: '0.2rem' }}>
              Dein Finanz-Überblick
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate('/finances/bewertungen')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0,
            padding: '0.55rem 1rem', borderRadius: '9999px',
            background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
            color: '#000', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.02em',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
          Neue Bewertung
        </button>
      </div>

      {/* ── Offene Aufgaben (Hero-Panel ganz oben) ─────────── */}
      <div style={{ marginBottom: '2rem' }}>
        <FinanzenOpenTasks />
      </div>

      {/* ── Kennzahlen ─────────────────────────────────────── */}
      <SectionDivider label="Kennzahlen" />
      <FinanzenStatusKpis />

      {/* ── Bereiche ───────────────────────────────────────── */}
      <SectionDivider label="Bereiche" />
      <FinanzenNavTiles />
        </div>
      </div>
    </PageWrapper>
  );
}
