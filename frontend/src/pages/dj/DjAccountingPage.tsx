import { PageWrapper } from '../../components/layout/PageWrapper';

const DISCLAIMER = 'Diese Auflistung dient ausschließlich als Orientierungshilfe für die eigene Buchhaltung und ersetzt keine Steuerberatung. Vor Einreichung beim Finanzamt bitte mit dem Steuerberater abstimmen.';

export function DjAccountingPage() {
  return (
    <PageWrapper>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2.5rem 2rem' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1.75rem', color: 'var(--color-on-surface)', marginBottom: '0.25rem' }}>Buchhaltung</h1>
          <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }}>Einnahmen, Ausgaben, MwSt-Übersicht und EÜR-Vorbereitung</p>
        </div>

        {/* Disclaimer-Banner */}
        <div style={{ background: 'rgba(148,170,255,0.08)', borderRadius: '0.75rem', padding: '0.875rem 1rem', marginBottom: '2rem', display: 'flex', gap: '0.625rem', alignItems: 'flex-start' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--color-primary)', flexShrink: 0, marginTop: '0.1rem' }}>info</span>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: 0 }}>{DISCLAIMER}</p>
        </div>

        <div style={{ background: 'var(--color-surface-container)', borderRadius: '0.75rem', padding: '3rem', textAlign: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: 'var(--color-secondary)', display: 'block', marginBottom: '1rem' }}>account_balance</span>
          <p style={{ color: 'var(--color-on-surface-variant)' }}>Einnahmen, Ausgaben, MwSt-Tabs und CSV-Export folgen in Phase 2.</p>
        </div>
      </div>
    </PageWrapper>
  );
}
