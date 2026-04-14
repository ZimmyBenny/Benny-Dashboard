import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { fetchDjInvoices, type DjInvoice, type InvoiceStatus } from '../../api/dj.api';
import { StatusBadge } from '../../components/dj/StatusBadge';
import { formatDate, formatCurrency } from '../../lib/format';

// ---------------------------------------------------------------------------
// KPI-Karte
// ---------------------------------------------------------------------------
function KpiCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div style={{
      background: 'var(--color-surface-container)',
      borderRadius: '0.75rem',
      padding: '1.25rem 1.5rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.25rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
        <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', color: 'var(--color-primary)' }}>{icon}</span>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-on-surface-variant)' }}>{label}</span>
      </div>
      <span style={{ fontFamily: 'var(--font-headline)', fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-primary)', lineHeight: 1 }}>
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DjInvoicesPage
// ---------------------------------------------------------------------------
export function DjInvoicesPage() {
  const navigate = useNavigate();

  const [invoices, setInvoices] = useState<DjInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | ''>('');

  // ---------------------------------------------------------------------------
  // Laden
  // ---------------------------------------------------------------------------
  async function loadInvoices() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDjInvoices();
      setInvoices(data);
    } catch {
      setError('Fehler beim Laden der Rechnungen');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadInvoices(); }, []);

  // ---------------------------------------------------------------------------
  // KPI-Werte (auf gesamtem invoices-Array, nicht gefiltert)
  // ---------------------------------------------------------------------------
  const today = new Date().toISOString().slice(0, 10);
  const kpiGesamt = invoices.length;
  const kpiOffen = invoices.filter(i => i.paid_amount < i.total_gross && i.status !== 'storniert' && i.finalized_at !== null).length;
  const kpiUeberfaellig = invoices.filter(i => i.due_date && i.due_date < today && i.paid_amount < i.total_gross && i.status !== 'storniert').length;
  const kpiBezahlt = invoices.filter(i => i.paid_amount >= i.total_gross).length;

  // ---------------------------------------------------------------------------
  // Filter-Tabs
  // ---------------------------------------------------------------------------
  const filterTabs: { label: string; value: InvoiceStatus | '' }[] = [
    { label: 'Alle', value: '' },
    { label: 'Entwurf', value: 'entwurf' },
    { label: 'Offen', value: 'offen' },
    { label: 'Teilbezahlt', value: 'teilbezahlt' },
    { label: 'Bezahlt', value: 'bezahlt' },
    { label: 'Überfällig', value: 'ueberfaellig' },
    { label: 'Storniert', value: 'storniert' },
  ];

  // ---------------------------------------------------------------------------
  // Gefilterte Liste
  // ---------------------------------------------------------------------------
  const filtered = statusFilter === 'ueberfaellig'
    ? invoices.filter(i => i.due_date && i.due_date < today && i.paid_amount < i.total_gross && i.status !== 'storniert')
    : statusFilter
      ? invoices.filter(i => i.status === statusFilter)
      : invoices;

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------
  const btnPrimary: React.CSSProperties = {
    background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
    border: 'none',
    borderRadius: '0.5rem',
    color: '#000',
    padding: '0.5rem 1.25rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
    fontSize: '0.875rem',
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    whiteSpace: 'nowrap',
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <PageWrapper>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.5rem', color: 'var(--color-primary)' }}>receipt_long</span>
          <div>
            <h1 style={{
              fontFamily: 'var(--font-headline)',
              fontWeight: 800,
              fontSize: 'clamp(1.5rem, 3vw, 2rem)',
              letterSpacing: '-0.02em',
              color: 'var(--color-on-surface)',
              margin: 0,
            }}>
              Rechnungen
            </h1>
            <p style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.875rem', margin: '0.125rem 0 0' }}>
              GoBD-konforme Rechnungsstellung
            </p>
          </div>
        </div>
        <button style={btnPrimary} onClick={() => navigate('/dj/invoices/new')}>
          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>add</span>
          Neue Rechnung
        </button>
      </div>

      {/* KPI-Karten */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.75rem' }}>
        <KpiCard label="Gesamt" value={kpiGesamt} icon="receipt_long" />
        <KpiCard label="Offen" value={kpiOffen} icon="schedule" />
        <KpiCard label="Überfällig" value={kpiUeberfaellig} icon="warning" />
        <KpiCard label="Bezahlt" value={kpiBezahlt} icon="check_circle" />
      </div>

      {/* Status-Filter-Tabs */}
      <div style={{
        display: 'flex',
        gap: 0,
        borderBottom: '1px solid var(--color-outline-variant)',
        marginBottom: '1.25rem',
        overflowX: 'auto',
        flexWrap: 'nowrap',
      }}>
        {filterTabs.map(tab => {
          const active = statusFilter === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent',
                color: active ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
                padding: '0.625rem 1rem',
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                fontSize: '0.875rem',
                fontWeight: active ? 600 : 400,
                whiteSpace: 'nowrap',
                transition: 'color 120ms, border-color 120ms',
                marginBottom: '-1px',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Hauptinhalt */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)' }}>
          Lade...
        </div>
      )}

      {!loading && error && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)' }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        <div style={{ background: 'var(--color-surface-container)', borderRadius: '0.75rem', overflow: 'hidden' }}>
          {/* Tabellen-Header */}
          {filtered.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '130px 140px 120px 1fr 1fr 130px 120px 64px',
              gap: '1rem',
              padding: '0.625rem 1.25rem',
              borderBottom: '1px solid var(--color-outline-variant)',
              background: 'rgba(255,255,255,0.03)',
            }}>
              {['Rechnungsnr.', 'Datum', 'Fälligkeit', 'Betreff', 'Kunde', 'Brutto', 'Status', ''].map((col, i) => (
                <span key={i} style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--color-on-surface-variant)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  textAlign: col === 'Brutto' ? 'right' : 'left',
                }}>
                  {col}
                </span>
              ))}
            </div>
          )}

          {filtered.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '1rem' }}>
                receipt_long_off
              </span>
              <p style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.9rem' }}>
                Keine Rechnungen für diesen Filter.
              </p>
            </div>
          ) : (
            filtered.map((inv, idx) => (
              <InvoiceRow
                key={inv.id}
                invoice={inv}
                isFirst={idx === 0}
                today={today}
                onNavigate={() => navigate(`/dj/invoices/${inv.id}`)}
              />
            ))
          )}
        </div>
      )}
    </PageWrapper>
  );
}

// ---------------------------------------------------------------------------
// InvoiceRow
// ---------------------------------------------------------------------------
function InvoiceRow({
  invoice: i,
  isFirst,
  today,
  onNavigate,
}: {
  invoice: DjInvoice;
  isFirst: boolean;
  today: string;
  onNavigate: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  const entwurfChipStyle: React.CSSProperties = {
    display: 'inline-block',
    padding: '0.15rem 0.5rem',
    borderRadius: '0.25rem',
    fontSize: '0.7rem',
    fontWeight: 500,
    fontFamily: 'var(--font-body)',
    background: 'var(--color-surface-container-high)',
    color: 'var(--color-on-surface-variant)',
    whiteSpace: 'nowrap',
  };

  const isOverdue = i.due_date && i.due_date < today && i.paid_amount < i.total_gross && i.status !== 'storniert';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onNavigate}
      onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') onNavigate(); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: '130px 140px 120px 1fr 1fr 130px 120px 64px',
        gap: '1rem',
        padding: '0.875rem 1.25rem',
        borderTop: isFirst ? 'none' : '1px solid var(--color-outline-variant)',
        cursor: 'pointer',
        background: hovered ? 'rgba(255,255,255,0.05)' : 'transparent',
        alignItems: 'center',
        transition: 'background 120ms',
      }}
    >
      {/* Rechnungsnr. */}
      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-on-surface)', whiteSpace: 'nowrap' }}>
        {i.number ? i.number : <span style={entwurfChipStyle}>Entwurf</span>}
      </span>

      {/* Datum */}
      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', whiteSpace: 'nowrap' }}>
        {formatDate(i.invoice_date)}
      </span>

      {/* Fälligkeit */}
      <span style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.85rem',
        color: isOverdue ? 'var(--color-error)' : 'var(--color-on-surface-variant)',
        whiteSpace: 'nowrap',
      }}>
        {formatDate(i.due_date)}
      </span>

      {/* Betreff */}
      <span style={{
        fontFamily: 'var(--font-body)',
        fontWeight: 500,
        fontSize: '0.9rem',
        color: 'var(--color-on-surface)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {i.subject || '(Kein Betreff)'}
      </span>

      {/* Kunde */}
      <span style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.85rem',
        color: 'var(--color-on-surface-variant)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {i.customer_name || i.customer_org || '—'}
      </span>

      {/* Brutto */}
      <span style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.875rem',
        color: 'var(--color-on-surface)',
        fontWeight: 500,
        textAlign: 'right',
        whiteSpace: 'nowrap',
      }}>
        {formatCurrency(i.total_gross)}
      </span>

      {/* Status */}
      <StatusBadge status={i.status} />

      {/* Aktion */}
      <button
        type="button"
        onClick={ev => { ev.stopPropagation(); onNavigate(); }}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--color-on-surface-variant)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0.25rem',
          borderRadius: '0.375rem',
        }}
        title="Bearbeiten"
      >
        <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>edit</span>
      </button>
    </div>
  );
}
