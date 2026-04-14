import { PageWrapper } from '../../components/layout/PageWrapper';
import { useNavigate } from 'react-router-dom';

export function DjEventsPage() {
  const navigate = useNavigate();
  return (
    <PageWrapper>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2.5rem 2rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '2.5rem' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1.75rem', color: 'var(--color-on-surface)', marginBottom: '0.25rem' }}>
              Events & Anfragen
            </h1>
            <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }}>
              Anfragen, Vorgespräche und gebuchte Veranstaltungen
            </p>
          </div>
          <button
            onClick={() => navigate('/dj/events/new')}
            style={{
              background: 'var(--color-primary-container)', color: 'var(--color-on-primary-container)',
              border: 'none', borderRadius: '0.75rem', padding: '0.625rem 1.25rem',
              fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '0.375rem',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
            Neue Anfrage
          </button>
        </div>
        <div style={{ background: 'var(--color-surface-container)', borderRadius: '0.75rem', padding: '3rem', textAlign: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: 'var(--color-primary)', display: 'block', marginBottom: '1rem' }}>event</span>
          <p style={{ color: 'var(--color-on-surface-variant)' }}>Tabelle und Kanban-Ansicht folgen in Phase 2.</p>
        </div>
      </div>
    </PageWrapper>
  );
}
