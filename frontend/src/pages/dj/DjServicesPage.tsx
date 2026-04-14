import { PageWrapper } from '../../components/layout/PageWrapper';

export function DjServicesPage() {
  return (
    <PageWrapper>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2.5rem 2rem' }}>
        <div style={{ marginBottom: '2.5rem' }}>
          <h1 style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1.75rem', color: 'var(--color-on-surface)', marginBottom: '0.25rem' }}>Leistungen & Pakete</h1>
          <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }}>Leistungskatalog und Buchungspakete</p>
        </div>
        <div style={{ background: 'var(--color-surface-container)', borderRadius: '0.75rem', padding: '3rem', textAlign: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: 'var(--color-primary)', display: 'block', marginBottom: '1rem' }}>inventory_2</span>
          <p style={{ color: 'var(--color-on-surface-variant)' }}>
            Paket-Karten und Leistungskatalog (4 Pakete und 25 Leistungen bereits geseedet) folgen in Phase 2.
          </p>
        </div>
      </div>
    </PageWrapper>
  );
}
