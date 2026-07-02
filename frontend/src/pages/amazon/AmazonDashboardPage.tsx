import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useAmazonDashboard } from '../../hooks/amazon/useAmazonDashboard';
import { NewProductDialog } from '../../components/amazon/NewProductDialog';
import { AmazonStatusKpis } from '../../components/amazon/AmazonStatusKpis';
import { AmazonActiveProducts } from '../../components/amazon/AmazonActiveProducts';
import { AmazonOpenTasks } from '../../components/amazon/AmazonOpenTasks';
import { AmazonNavTiles } from '../../components/amazon/AmazonNavTiles';

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

export function AmazonDashboardPage() {
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data, isLoading, isError } = useAmazonDashboard();

  return (
    <PageWrapper>
      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', minWidth: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: '2rem', color: 'var(--color-primary)', flexShrink: 0 }}>shopping_cart</span>
          <div style={{ minWidth: 0 }}>
            <h1 className="display-text" style={{ fontSize: 'clamp(1.4rem, 2.5vw, 2rem)', color: 'var(--color-on-surface)', margin: 0, lineHeight: 1.1 }}>
              Amazon-Dashboard
            </h1>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', margin: 0, marginTop: '0.2rem' }}>
              Dein Produktentwicklungs-Überblick
            </p>
          </div>
        </div>

        <button
          onClick={() => setDialogOpen(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0,
            padding: '0.55rem 1rem', borderRadius: '9999px',
            background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
            color: '#000', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.02em',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
          Produkt direkt entwickeln
        </button>
      </div>

      {/* ── Status-KPIs ────────────────────────────────────── */}
      {isLoading && (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-outline)', marginBottom: '1.75rem' }}>
          Lade…
        </p>
      )}
      {isError && !isLoading && (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-error)', marginBottom: '1.75rem' }}>
          Dashboard-Daten konnten nicht geladen werden.
        </p>
      )}
      {data && (
        <AmazonStatusKpis counts={data.counts} onNavigate={() => navigate('/amazon/entwicklung')} />
      )}

      {/* ── Aktive Produkte ────────────────────────────────── */}
      {data && (
        <>
          <SectionDivider label="Aktive Produkte" />
          <AmazonActiveProducts products={data.active} />
        </>
      )}

      {/* ── Offene Aufgaben ────────────────────────────────── */}
      <SectionDivider label="Offene Amazon-Aufgaben" />
      <AmazonOpenTasks />

      {/* ── Navigation ─────────────────────────────────────── */}
      <SectionDivider label="Bereiche" />
      <AmazonNavTiles />

      <NewProductDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </PageWrapper>
  );
}
