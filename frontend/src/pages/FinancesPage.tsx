import { useState } from 'react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { BewertungenTab } from '../components/finance/reviews/BewertungenTab';

type Tab = 'bewertungen';

export function FinancesPage() {
  const [activeTab, setActiveTab] = useState<Tab>('bewertungen');
  const [addOpen, setAddOpen] = useState(false);

  return (
    <PageWrapper>
      <div style={{
        maxWidth: 1400,
        margin: '0 auto',
        padding: '2.5rem 2rem',
        position: 'relative',
      }}>
        {/* Ambient Glows */}
        <div style={{
          position: 'absolute', top: -100, right: -100,
          width: 600, height: 600,
          background: 'radial-gradient(circle, rgba(204,151,255,0.06) 0%, rgba(204,151,255,0) 70%)',
          pointerEvents: 'none', zIndex: 0,
        }} />
        <div style={{
          position: 'absolute', bottom: -80, left: -80,
          width: 400, height: 400,
          background: 'radial-gradient(circle, rgba(52,181,250,0.04) 0%, rgba(52,181,250,0) 70%)',
          pointerEvents: 'none', zIndex: 0,
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Page-Header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
            marginBottom: '2.5rem',
          }}>
            <h1 style={{
              fontFamily: 'var(--font-headline)',
              fontWeight: 800,
              fontSize: '3rem',
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              color: 'var(--color-on-surface)',
              margin: 0,
              textTransform: 'uppercase',
            }}>
              FINANZEN
            </h1>
            <button
              onClick={() => setAddOpen(true)}
              style={{
                background: 'linear-gradient(135deg, #cc97ff 0%, #9c48ea 100%)',
                color: '#fff', border: 'none',
                borderRadius: '0.75rem',
                padding: '0.625rem 1.25rem',
                fontSize: '0.875rem', fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                fontFamily: 'var(--font-body)',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
              Neue Bewertung hinzufügen
            </button>
          </div>

          {/* Tab-Bar — aktuell genau EIN Tab (D-03) */}
          <div style={{
            display: 'flex', gap: '0.25rem',
            marginBottom: '1.25rem',
            borderBottom: '1px solid var(--color-outline-variant)',
          }}>
            <button
              onClick={() => setActiveTab('bewertungen')}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === 'bewertungen' ? '2px solid var(--color-primary)' : '2px solid transparent',
                color: activeTab === 'bewertungen' ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
                padding: '0.625rem 1rem',
                fontSize: '0.875rem',
                fontWeight: activeTab === 'bewertungen' ? 600 : 400,
                fontFamily: 'var(--font-body)',
                cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                marginBottom: '-1px',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>reviews</span>
              Bewertungen
            </button>
          </div>

          {activeTab === 'bewertungen' && (
            <BewertungenTab addOpen={addOpen} onAddClose={() => setAddOpen(false)} />
          )}
        </div>
      </div>
    </PageWrapper>
  );
}
