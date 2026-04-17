import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import {
  fetchDjQuotes,
  deleteDjQuote,
  finalizeDjQuote,
  type DjQuote,
  type QuoteStatus,
} from '../../api/dj.api';
import { formatDate, formatCurrency } from '../../lib/format';

// ── Status-Konfiguration ───────────────────────────────────────────────────────

const STATUS_STYLES: Record<QuoteStatus, { bg: string; color: string; label: string }> = {
  entwurf:    { bg: 'rgba(148,170,255,0.15)', color: 'var(--color-primary)',          label: 'Entwurf' },
  gesendet:   { bg: 'rgba(251,191,36,0.15)',  color: '#fbbf24',                       label: 'Versendet' },
  angenommen: { bg: 'rgba(92,253,128,0.15)',  color: 'var(--color-secondary)',         label: 'Angenommen' },
  abgelehnt:  { bg: 'rgba(239,68,68,0.15)',   color: 'var(--color-error)',             label: 'Abgelehnt' },
  abgelaufen: { bg: 'rgba(239,68,68,0.15)',   color: 'var(--color-error)',             label: 'Abgelaufen' },
};

const FILTER_TABS: { label: string; value: QuoteStatus | '' }[] = [
  { label: 'Alle',       value: '' },
  { label: 'Entwurf',    value: 'entwurf' },
  { label: 'Versendet',  value: 'gesendet' },
  { label: 'Angenommen', value: 'angenommen' },
  { label: 'Abgelehnt',  value: 'abgelehnt' },
  { label: 'Abgelaufen', value: 'abgelaufen' },
];

// ── Icon-Button-Style ──────────────────────────────────────────────────────────

const iconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--color-on-surface-variant)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0.25rem',
  borderRadius: '0.375rem',
};

// ── QuoteRow ───────────────────────────────────────────────────────────────────

function QuoteRow({
  quote: q,
  isFirst,
  onNavigate,
  onDelete,
  onFinalize,
}: {
  quote: DjQuote;
  isFirst: boolean;
  onNavigate: () => void;
  onDelete: () => void;
  onFinalize: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isFinalized = q.finalized_at !== null;

  const entwurfChipStyle: React.CSSProperties = {
    display: 'inline-block',
    padding: '0.15rem 0.5rem',
    borderRadius: '0.25rem',
    fontSize: '0.7rem',
    fontWeight: 500,
    fontFamily: 'var(--font-body)',
    background: 'rgba(255,255,255,0.05)',
    color: 'var(--color-on-surface-variant)',
    whiteSpace: 'nowrap',
  };

  const statusStyle = STATUS_STYLES[q.status];

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
        gridTemplateColumns: '110px 90px 1fr 1fr 110px 110px 110px 100px',
        gap: '0.75rem',
        padding: '0.75rem 1.25rem',
        borderTop: isFirst ? 'none' : '1px solid rgba(148,170,255,0.15)',
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
      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-on-surface)', fontWeight: 500, whiteSpace: 'nowrap' }}>
        {q.number ?? <span style={entwurfChipStyle}>Entwurf</span>}
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
        {q.valid_until ? formatDate(q.valid_until) : '—'}
      </span>

      {/* Netto */}
      <span style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.875rem',
        fontWeight: 500,
        color: 'var(--color-on-surface)',
        textAlign: 'right',
        whiteSpace: 'nowrap',
      }}>
        {formatCurrency(q.subtotal_net)}
      </span>

      {/* Status */}
      <span style={{
        display: 'inline-block',
        padding: '0.2rem 0.625rem',
        borderRadius: '999px',
        fontSize: '0.75rem',
        fontWeight: 600,
        fontFamily: 'var(--font-body)',
        background: statusStyle.bg,
        color: statusStyle.color,
        whiteSpace: 'nowrap',
      }}>
        {statusStyle.label}
      </span>

      {/* Aktionen */}
      <div
        style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}
        onClick={ev => ev.stopPropagation()}
      >
        {isFinalized ? (
          /* Finalisierte: nur Lock-Icon anzeigen */
          <button type="button" style={iconBtnStyle} title="Anzeigen" onClick={ev => { ev.stopPropagation(); onNavigate(); }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>lock</span>
          </button>
        ) : (
          <>
            {/* Bearbeiten */}
            <button
              type="button"
              style={iconBtnStyle}
              title="Bearbeiten"
              onClick={ev => { ev.stopPropagation(); onNavigate(); }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>edit</span>
            </button>

            {/* Finalisieren */}
            <button
              type="button"
              style={iconBtnStyle}
              title="Finalisieren"
              onClick={ev => { ev.stopPropagation(); onFinalize(); }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>check_circle</span>
            </button>

            {/* Löschen */}
            <button
              type="button"
              style={iconBtnStyle}
              title="Löschen"
              onMouseEnter={ev => { (ev.currentTarget as HTMLButtonElement).style.color = 'var(--color-error)'; }}
              onMouseLeave={ev => { (ev.currentTarget as HTMLButtonElement).style.color = 'var(--color-on-surface-variant)'; }}
              onClick={ev => { ev.stopPropagation(); onDelete(); }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>delete</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── DjQuotesPage ───────────────────────────────────────────────────────────────

export function DjQuotesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();

  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | ''>('');

  // Datenladen
  const { data: allQuotes = [], isLoading } = useQuery<DjQuote[]>({
    queryKey: ['dj-quotes', selectedYear],
    queryFn: () => fetchDjQuotes({ year: selectedYear }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteDjQuote(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dj-quotes'] }),
  });

  const finalizeMut = useMutation({
    mutationFn: (id: number) => finalizeDjQuote(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dj-quotes'] }),
  });

  // Client-seitige Filterung
  const filtered = useMemo(
    () => statusFilter ? allQuotes.filter(q => q.status === statusFilter) : allQuotes,
    [allQuotes, statusFilter],
  );

  // KPI-Werte (aus allQuotes, nicht filtered)
  const kpiEntwurf    = allQuotes.filter(q => q.status === 'entwurf').length;
  const kpiGesendet   = allQuotes.filter(q => q.status === 'gesendet').length;
  const kpiAngenommen = allQuotes.filter(q => q.status === 'angenommen').length;
  const kpiAbgelaufen = allQuotes.filter(q => q.status === 'abgelaufen').length;

  // Jahres-Optionen
  const yearOptions = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

  return (
    <PageWrapper>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2.5rem 2rem', position: 'relative' }}>

        {/* Ambient Glow oben rechts (blau) */}
        <div style={{
          position: 'absolute',
          top: '-100px',
          right: '-100px',
          width: '600px',
          height: '600px',
          background: 'radial-gradient(circle, rgba(148,170,255,0.06) 0%, transparent 60%)',
          pointerEvents: 'none',
          zIndex: 0,
        }} />

        {/* Ambient Glow unten links (grün) */}
        <div style={{
          position: 'absolute',
          bottom: '-80px',
          left: '-80px',
          width: '400px',
          height: '400px',
          background: 'radial-gradient(circle, rgba(92,253,128,0.04) 0%, transparent 60%)',
          pointerEvents: 'none',
          zIndex: 0,
        }} />

        {/* Content über den Glows */}
        <div style={{ position: 'relative', zIndex: 1 }}>

          {/* ── Page Header ──────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '2.5rem' }}>
            <div>
              <h1 style={{
                fontFamily: 'var(--font-headline)',
                fontWeight: 800,
                fontSize: '3rem',
                letterSpacing: '-0.02em',
                color: 'var(--color-on-surface)',
                margin: 0,
                lineHeight: 1.1,
              }}>
                ANGEBOTE
              </h1>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
              {/* Jahr-Dropdown */}
              <select
                value={selectedYear}
                onChange={ev => setSelectedYear(Number(ev.target.value))}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  color: 'var(--color-on-surface)',
                  border: 'none',
                  borderRadius: '0.5rem',
                  padding: '0.5rem 0.875rem',
                  fontSize: '0.875rem',
                  fontFamily: 'var(--font-body)',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                {yearOptions.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>

              {/* + Neues Angebot */}
              <button
                onClick={() => navigate('/dj/quotes/new')}
                style={{
                  background: 'linear-gradient(135deg, #94aaff 0%, #5cfd80 100%)',
                  color: '#060e20',
                  border: 'none',
                  borderRadius: '0.75rem',
                  padding: '0.625rem 1.25rem',
                  fontSize: '0.875rem',
                  fontFamily: 'Manrope, sans-serif',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  boxShadow: '0 0 16px rgba(148,170,255,0.3)',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
                Neues Angebot
              </button>
            </div>
          </div>

          {/* ── KPI-Kacheln ──────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>

            {/* Entwurf */}
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem', padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)', margin: 0, marginBottom: '0.375rem' }}>
                  Entwurf
                </p>
                <p style={{ fontFamily: 'var(--font-headline)', fontSize: '2rem', fontWeight: 700, color: 'var(--color-primary)', lineHeight: 1, margin: 0 }}>
                  {isLoading ? '–' : kpiEntwurf}
                </p>
              </div>
              <span className="material-symbols-outlined" style={{ fontSize: '28px', color: 'var(--color-primary)', opacity: 0.7 }}>edit_note</span>
            </div>

            {/* Versendet */}
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem', padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)', margin: 0, marginBottom: '0.375rem' }}>
                  Versendet
                </p>
                <p style={{ fontFamily: 'var(--font-headline)', fontSize: '2rem', fontWeight: 700, color: 'var(--color-tertiary)', lineHeight: 1, margin: 0 }}>
                  {isLoading ? '–' : kpiGesendet}
                </p>
              </div>
              <span className="material-symbols-outlined" style={{ fontSize: '28px', color: 'var(--color-tertiary)', opacity: 0.7 }}>send</span>
            </div>

            {/* Angenommen */}
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem', padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)', margin: 0, marginBottom: '0.375rem' }}>
                  Angenommen
                </p>
                <p style={{ fontFamily: 'var(--font-headline)', fontSize: '2rem', fontWeight: 700, color: 'var(--color-secondary)', lineHeight: 1, margin: 0 }}>
                  {isLoading ? '–' : kpiAngenommen}
                </p>
              </div>
              <span className="material-symbols-outlined" style={{ fontSize: '28px', color: 'var(--color-secondary)', opacity: 0.7 }}>check_circle</span>
            </div>

            {/* Abgelaufen */}
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem', padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)', margin: 0, marginBottom: '0.375rem' }}>
                  Abgelaufen
                </p>
                <p style={{ fontFamily: 'var(--font-headline)', fontSize: '2rem', fontWeight: 700, color: 'var(--color-error)', lineHeight: 1, margin: 0 }}>
                  {isLoading ? '–' : kpiAbgelaufen}
                </p>
              </div>
              <span className="material-symbols-outlined" style={{ fontSize: '28px', color: 'var(--color-error)', opacity: 0.7 }}>schedule</span>
            </div>

          </div>

          {/* ── Status-Filter-Pillen ──────────────────────────────── */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            {FILTER_TABS.map(tab => {
              const active = statusFilter === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setStatusFilter(tab.value)}
                  style={{
                    background: active ? 'rgba(148,170,255,0.15)' : 'rgba(255,255,255,0.03)',
                    border: active ? '1px solid var(--color-primary)' : '1px solid rgba(148,170,255,0.15)',
                    borderRadius: '999px',
                    color: active ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
                    padding: '0.375rem 1rem',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.8rem',
                    fontWeight: active ? 600 : 500,
                    transition: 'all 120ms',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* ── Angebots-Liste ────────────────────────────────────── */}
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.9rem' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem', opacity: 0.4 }}>hourglass_empty</span>
              Lade...
            </div>
          ) : (
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem', overflow: 'hidden' }}>

              {/* Header-Zeile */}
              {filtered.length > 0 && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '110px 90px 1fr 1fr 110px 110px 110px 100px',
                  gap: '0.75rem',
                  padding: '0.75rem 1.25rem',
                  borderBottom: '1px solid rgba(148,170,255,0.15)',
                  background: 'rgba(255,255,255,0.03)',
                }}>
                  {['Datum', 'Nr.', 'Betreff', 'Kunde', 'Gültig bis', 'Netto', 'Status', ''].map((col, i) => (
                    <span key={i} style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      color: 'var(--color-on-surface-variant)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}>
                      {col}
                    </span>
                  ))}
                </div>
              )}

              {/* Leerer Zustand */}
              {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 2rem', color: 'var(--color-on-surface-variant)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '3rem', marginBottom: '1rem', display: 'block', opacity: 0.4 }}>description_off</span>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', margin: 0 }}>
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
                    onDelete={() => {
                      if (window.confirm('Angebot wirklich löschen?')) {
                        deleteMut.mutate(q.id);
                      }
                    }}
                    onFinalize={() => {
                      if (window.confirm('Angebot finalisieren? Es kann danach nicht mehr bearbeitet werden.')) {
                        finalizeMut.mutate(q.id);
                      }
                    }}
                  />
                ))
              )}

            </div>
          )}

        </div>{/* /content-wrapper */}
      </div>
    </PageWrapper>
  );
}
