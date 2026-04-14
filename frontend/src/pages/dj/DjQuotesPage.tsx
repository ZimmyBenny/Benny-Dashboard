import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { fetchDjQuotes, type DjQuote, type QuoteStatus } from '../../api/dj.api';
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
// DjQuotesPage
// ---------------------------------------------------------------------------
export function DjQuotesPage() {
  const navigate = useNavigate();

  const [quotes, setQuotes] = useState<DjQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | ''>('');

  // ---------------------------------------------------------------------------
  // Laden
  // ---------------------------------------------------------------------------
  async function loadQuotes() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDjQuotes();
      setQuotes(data);
    } catch {
      setError('Fehler beim Laden der Angebote');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadQuotes(); }, []);

  // ---------------------------------------------------------------------------
  // Gefilterte Liste
  // ---------------------------------------------------------------------------
  const filtered = statusFilter ? quotes.filter(q => q.status === statusFilter) : quotes;

  // ---------------------------------------------------------------------------
  // KPI-Werte
  // ---------------------------------------------------------------------------
  const kpiGesamt = quotes.length;
  const kpiEntwuerfe = quotes.filter(q => q.status === 'entwurf').length;
  const kpiGesendet = quotes.filter(q => q.status === 'gesendet').length;
  const kpiAngenommen = quotes.filter(q => q.status === 'angenommen').length;

  // ---------------------------------------------------------------------------
  // Filter-Tabs
  // ---------------------------------------------------------------------------
  const filterTabs: { label: string; value: QuoteStatus | '' }[] = [
    { label: 'Alle', value: '' },
    { label: 'Entwurf', value: 'entwurf' },
    { label: 'Gesendet', value: 'gesendet' },
    { label: 'Angenommen', value: 'angenommen' },
    { label: 'Abgelehnt', value: 'abgelehnt' },
    { label: 'Abgelaufen', value: 'abgelaufen' },
  ];

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
          <span className="material-symbols-outlined" style={{ fontSize: '1.5rem', color: 'var(--color-primary)' }}>description</span>
          <div>
            <h1 style={{
              fontFamily: 'var(--font-headline)',
              fontWeight: 800,
              fontSize: 'clamp(1.5rem, 3vw, 2rem)',
              letterSpacing: '-0.02em',
              color: 'var(--color-on-surface)',
              margin: 0,
            }}>
              Angebote
            </h1>
            <p style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.875rem', margin: '0.125rem 0 0' }}>
              Freibleibende Angebote für DJ-Events
            </p>
          </div>
        </div>
        <button style={btnPrimary} onClick={() => navigate('/dj/quotes/new')}>
          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>add</span>
          Neues Angebot
        </button>
      </div>

      {/* KPI-Karten */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.75rem' }}>
        <KpiCard label="Gesamt" value={kpiGesamt} icon="description" />
        <KpiCard label="Entwürfe" value={kpiEntwuerfe} icon="edit_note" />
        <KpiCard label="Gesendet" value={kpiGesendet} icon="send" />
        <KpiCard label="Akzeptiert" value={kpiAngenommen} icon="check_circle" />
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
              gridTemplateColumns: '120px 80px 1fr 1fr 120px 100px 64px',
              gap: '1rem',
              padding: '0.625rem 1.25rem',
              borderBottom: '1px solid var(--color-outline-variant)',
              background: 'rgba(255,255,255,0.03)',
            }}>
              {['Datum', 'Nr.', 'Betreff', 'Kunde', 'Gültig bis', 'Netto', ''].map((col, i) => (
                <span key={i} style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--color-on-surface-variant)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  textAlign: col === 'Netto' ? 'right' : 'left',
                }}>
                  {col}
                </span>
              ))}
            </div>
          )}

          {filtered.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '1rem' }}>
                description_off
              </span>
              <p style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.9rem' }}>
                Keine Angebote für diesen Filter.
              </p>
            </div>
          ) : (
            filtered.map((q, idx) => (
              <QuoteRow
                key={q.id}
                quote={q}
                isFirst={idx === 0}
                onNavigate={() => navigate(`/dj/quotes/${q.id}`)}
              />
            ))
          )}
        </div>
      )}
    </PageWrapper>
  );
}

// ---------------------------------------------------------------------------
// QuoteRow
// ---------------------------------------------------------------------------
function QuoteRow({
  quote: q,
  isFirst,
  onNavigate,
}: {
  quote: DjQuote;
  isFirst: boolean;
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
        gridTemplateColumns: '120px 80px 1fr 1fr 120px 100px 64px',
        gap: '1rem',
        padding: '0.875rem 1.25rem',
        borderTop: isFirst ? 'none' : '1px solid var(--color-outline-variant)',
        cursor: 'pointer',
        background: hovered ? 'rgba(255,255,255,0.05)' : 'transparent',
        alignItems: 'center',
        transition: 'background 120ms',
      }}
    >
      {/* Datum */}
      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', whiteSpace: 'nowrap' }}>
        {formatDate(q.quote_date)}
      </span>

      {/* Nr. */}
      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-on-surface)', whiteSpace: 'nowrap' }}>
        {q.number ? (
          <StatusBadge status={q.status} />
        ) : (
          <span style={entwurfChipStyle}>Entwurf</span>
        )}
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
        {q.subject || '(Kein Betreff)'}
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
        {q.customer_name || q.customer_org || '—'}
      </span>

      {/* Gültig bis */}
      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', whiteSpace: 'nowrap' }}>
        {formatDate(q.valid_until)}
      </span>

      {/* Netto */}
      <span style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.875rem',
        color: 'var(--color-on-surface)',
        fontWeight: 500,
        textAlign: 'right',
        whiteSpace: 'nowrap',
      }}>
        {formatCurrency(q.subtotal_net)}
      </span>

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
