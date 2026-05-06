/**
 * BelegeOpenPaymentsPage — /belege/offen (Phase 04 Plan 08).
 *
 * Listet offene + teilbezahlte Belege, sortiert ASC nach due_date.
 * Ueberfaellige Belege (due_date < heute) werden rot eingefaerbt.
 * Belege ohne due_date erscheinen am Ende.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { fetchReceipts, type ReceiptListItem } from '../../api/belege.api';
import { ReceiptsTable } from './BelegeListPage';
import { formatCurrencyFromCents } from '../../lib/format';

export function BelegeOpenPaymentsPage() {
  const navigate = useNavigate();

  // Fuer "offene Zahlungen" laden wir status=offen UND status=teilbezahlt — zwei Calls,
  // weil das Backend nur einen status-Param akzeptiert. Bei Anpassung des Backends
  // (status=offen,teilbezahlt) kann das auf einen Call reduziert werden.
  const { data: offen = [], isLoading: l1 } = useQuery({
    queryKey: ['belege', 'open-payments', 'offen'],
    queryFn: () => fetchReceipts({ status: 'offen' }),
  });
  const { data: teil = [], isLoading: l2 } = useQuery({
    queryKey: ['belege', 'open-payments', 'teilbezahlt'],
    queryFn: () => fetchReceipts({ status: 'teilbezahlt' }),
  });
  const isLoading = l1 || l2;

  const today = new Date().toISOString().slice(0, 10);

  const sorted: ReceiptListItem[] = useMemo(() => {
    const all = [...offen, ...teil];
    return all.sort((a, b) => {
      const ad = a.due_date ?? '9999-99-99';
      const bd = b.due_date ?? '9999-99-99';
      return ad.localeCompare(bd);
    });
  }, [offen, teil]);

  const overdueCount = sorted.filter(
    (r) => r.due_date && r.due_date < today,
  ).length;
  const totalCents = sorted.reduce((s, r) => s + (r.amount_gross_cents ?? 0), 0);

  return (
    <PageWrapper>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2.5rem 2rem', position: 'relative' }}>
        {/* Ambient glows (DJ-Stil) */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '600px',
            height: '600px',
            background: 'radial-gradient(circle at top right, rgba(255,110,132,0.08) 0%, transparent 60%)',
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
              OFFENE ZAHLUNGEN
            </h1>
            <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.9rem', margin: '0.5rem 0 0', fontFamily: 'var(--font-body)' }}>
              Sortiert nach Fälligkeit. Überfällige Belege werden rot markiert.
            </p>
          </div>

          {/* Mini-KPIs */}
          {!isLoading && sorted.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '1rem',
                marginBottom: '1.5rem',
              }}
            >
              <div style={kpiBoxStyle}>
                <p style={kpiLabelStyle}>Anzahl offen</p>
                <p style={{ ...kpiValueStyle, color: 'var(--color-primary)' }}>{sorted.length}</p>
              </div>
              <div style={kpiBoxStyle}>
                <p style={kpiLabelStyle}>Davon überfällig</p>
                <p style={{ ...kpiValueStyle, color: overdueCount > 0 ? 'var(--color-error)' : 'var(--color-on-surface)' }}>
                  {overdueCount}
                </p>
              </div>
              <div style={kpiBoxStyle}>
                <p style={kpiLabelStyle}>Summe Brutto</p>
                <p style={{ ...kpiValueStyle, color: 'var(--color-secondary)' }}>{formatCurrencyFromCents(totalCents)}</p>
              </div>
            </div>
          )}

          {/* Tabelle */}
          <ReceiptsTable
            items={sorted}
            isLoading={isLoading}
            variant="open-payments"
            onClick={(r) => navigate(`/belege/${r.id}`)}
          />
        </div>
      </div>
    </PageWrapper>
  );
}

const kpiBoxStyle: React.CSSProperties = {
  background: 'var(--color-surface-variant)',
  borderRadius: '0.75rem',
  padding: '1rem 1.25rem',
};

const kpiLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '0.7rem',
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-on-surface-variant)',
  margin: 0,
  marginBottom: '0.375rem',
};

const kpiValueStyle: React.CSSProperties = {
  fontFamily: 'Manrope, sans-serif',
  fontSize: '2rem',
  fontWeight: 700,
  lineHeight: 1,
  margin: 0,
};
