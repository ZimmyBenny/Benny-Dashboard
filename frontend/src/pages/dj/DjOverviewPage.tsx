import { PageWrapper } from '../../components/layout/PageWrapper';

export function DjOverviewPage() {
  return (
    <PageWrapper>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2.5rem 2rem' }}>
        <div style={{ marginBottom: '2.5rem' }}>
          <h1 style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1.75rem', color: 'var(--color-on-surface)', marginBottom: '0.25rem' }}>
            DJ Übersicht
          </h1>
          <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }}>
            Dein persönliches DJ-Business auf einen Blick
          </p>
        </div>
        <div style={{ background: 'var(--color-surface-container)', borderRadius: '0.75rem', padding: '3rem', textAlign: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: 'var(--color-primary)', display: 'block', marginBottom: '1rem' }}>dashboard</span>
          <p style={{ color: 'var(--color-on-surface-variant)' }}>KPI-Kacheln, Kalender-Heatmap und Umsatz-Vorschau folgen in Phase 2.</p>
        </div>
      </div>
    </PageWrapper>
  );
}
