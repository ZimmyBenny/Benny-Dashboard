import { PageWrapper } from '../../components/layout/PageWrapper';
import { useParams, useNavigate } from 'react-router-dom';

export function DjEventDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  return (
    <PageWrapper>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2.5rem 2rem' }}>
        <button
          onClick={() => navigate('/dj/events')}
          style={{ background: 'transparent', border: 'none', color: 'var(--color-on-surface-variant)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '1.5rem', fontFamily: 'var(--font-body)', fontSize: '0.875rem' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_back</span>
          Zurück zu Events
        </button>
        <h1 style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1.75rem', color: 'var(--color-on-surface)', marginBottom: '2rem' }}>
          Event #{id}
        </h1>
        <div style={{ background: 'var(--color-surface-container)', borderRadius: '0.75rem', padding: '3rem', textAlign: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: 'var(--color-primary)', display: 'block', marginBottom: '1rem' }}>event</span>
          <p style={{ color: 'var(--color-on-surface-variant)' }}>Detailansicht mit Location-Map, Timeline und Dokumenten folgt in Phase 2.</p>
        </div>
      </div>
    </PageWrapper>
  );
}
