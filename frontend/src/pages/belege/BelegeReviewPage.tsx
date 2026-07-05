/**
 * BelegeReviewPage — /belege/zu-pruefen (Phase 04 Plan 08).
 *
 * Zeigt ALLE noch nicht freigegebenen, nicht beiseitegelegten Belege
 * (pending-Modus: freigegeben_at IS NULL AND status NOT IN
 * archiviert/nicht_relevant/storniert) — unabhaengig vom Zahl-Status.
 * OCR-pending-Belege sind darin enthalten (freigegeben_at ist NULL), es wird
 * nur solange gepollt, wie welche in Verarbeitung sind.
 */
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { fetchReceipts, type ReceiptListItem } from '../../api/belege.api';
import { ReceiptsTable } from './BelegeListPage';

export function BelegeReviewPage() {
  const navigate = useNavigate();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['belege', 'review', 'pending'],
    queryFn: () => fetchReceipts({ pending: '1' }),
    // Poll nur solange OCR laeuft (Belege mit status 'ocr_pending' in der Menge)
    refetchInterval: (query) => {
      const data = query.state.data as ReceiptListItem[] | undefined;
      return data && data.some((r) => r.status === 'ocr_pending') ? 3000 : false;
    },
  });

  const ocrPendingCount = items.filter((r) => r.status === 'ocr_pending').length;

  return (
    <PageWrapper>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2.5rem 2rem', position: 'relative' }}>
        {/* Ambient glow */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '600px',
            height: '600px',
            background: 'radial-gradient(circle at top right, rgba(255,200,80,0.06) 0%, transparent 60%)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Header */}
          <div style={{ marginBottom: '2rem' }}>
            <h1
              style={{
                fontFamily: 'Manrope, sans-serif',
                fontWeight: 800,
                fontSize: '3rem',
                letterSpacing: '-0.02em',
                color: 'var(--color-on-surface)',
                margin: 0,
                lineHeight: 1.1,
              }}
            >
              Zu prüfen
            </h1>
            <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.9rem', margin: '0.5rem 0 0', fontFamily: 'var(--font-body)' }}>
              {isLoading ? (
                'Lädt …'
              ) : (
                <>
                  <strong style={{ color: 'var(--color-on-surface)' }}>{items.length}</strong>{' '}
                  {items.length === 1 ? 'Beleg' : 'Belege'} noch zu prüfen — noch nicht freigegeben, unabhängig vom Zahl-Status.
                </>
              )}
              {ocrPendingCount > 0 && ` ${ocrPendingCount} Beleg(e) werden gerade per OCR ausgewertet.`}
            </p>
          </div>

          <ReceiptsTable
            items={items}
            isLoading={isLoading}
            onClick={(r) => navigate(`/belege/${r.id}`)}
          />
        </div>
      </div>
    </PageWrapper>
  );
}
