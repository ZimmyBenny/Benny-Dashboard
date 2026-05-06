/**
 * BelegeReviewPage — /belege/zu-pruefen (Phase 04 Plan 08).
 *
 * Listet Belege mit status='zu_pruefen' (fehlende Pflichtfelder, OCR-Review,
 * Lieferant unklar etc.). Zeigt zusaetzlich Belege mit status='ocr_pending',
 * damit der User OCR-Lauf-Status verfolgen kann.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { fetchReceipts, type ReceiptListItem } from '../../api/belege.api';
import { ReceiptsTable } from './BelegeListPage';

export function BelegeReviewPage() {
  const navigate = useNavigate();

  const { data: zuPruefen = [], isLoading: l1 } = useQuery({
    queryKey: ['belege', 'review', 'zu_pruefen'],
    queryFn: () => fetchReceipts({ status: 'zu_pruefen' }),
  });
  const { data: ocrPending = [], isLoading: l2 } = useQuery({
    queryKey: ['belege', 'review', 'ocr_pending'],
    queryFn: () => fetchReceipts({ status: 'ocr_pending' }),
    // OCR laeuft im Hintergrund — kurzes Refetch-Intervall, solange welche da sind
    refetchInterval: (query) => {
      const data = query.state.data as ReceiptListItem[] | undefined;
      return data && data.length > 0 ? 3000 : false;
    },
  });
  const isLoading = l1 || l2;

  const items: ReceiptListItem[] = useMemo(() => {
    // OCR-pending zuerst (User sieht laufende Verarbeitung), dann zu_pruefen
    return [...ocrPending, ...zuPruefen];
  }, [zuPruefen, ocrPending]);

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
                color: 'var(--color-primary)',
                margin: 0,
                lineHeight: 1.1,
                textTransform: 'uppercase',
              }}
            >
              ZU PRÜFEN
            </h1>
            <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.9rem', margin: '0.5rem 0 0', fontFamily: 'var(--font-body)' }}>
              Belege mit fehlenden Pflichtfeldern oder OCR-Ergebnis zur Review.
              {ocrPending.length > 0 && ` ${ocrPending.length} Beleg(e) werden gerade per OCR ausgewertet.`}
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
