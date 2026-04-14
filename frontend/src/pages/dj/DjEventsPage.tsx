import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { fetchDjEvents, deleteDjEvent, type DjEvent } from '../../api/dj.api';
import { StatusBadge, EVENT_TYPE_LABELS } from '../../components/dj/StatusBadge';
import { formatDate } from '../../lib/format';

// ── Filter-Konfiguration ───────────────────────────────────────────────────────

const FILTER_TABS: { label: string; value: string }[] = [
  { label: 'Alle', value: '' },
  { label: 'Neu', value: 'neu' },
  { label: 'Vorgespräch', value: 'vorgespraech_vereinbart' },
  { label: 'Angebot', value: 'angebot_gesendet' },
  { label: 'Bestätigt', value: 'bestaetigt' },
  { label: 'Abgeschlossen', value: 'abgeschlossen' },
  { label: 'Abgesagt', value: 'abgesagt' },
];

// ── EventRow ───────────────────────────────────────────────────────────────────

function EventRow({
  event: e,
  isFirst,
  onNavigate,
  onDelete,
}: {
  event: DjEvent;
  isFirst: boolean;
  onNavigate: () => void;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  const typeBadgeStyle: React.CSSProperties = {
    display: 'inline-block',
    background: 'var(--color-surface-container-high)',
    borderRadius: '0.25rem',
    padding: '0.2rem 0.5rem',
    fontSize: '0.75rem',
    fontWeight: 500,
    fontFamily: 'var(--font-body)',
    color: 'var(--color-on-surface-variant)',
    whiteSpace: 'nowrap',
  };

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
        gridTemplateColumns: '110px 1fr 120px 150px 150px 100px 120px 72px',
        gap: '0.75rem',
        padding: '0.75rem 1.25rem',
        borderTop: isFirst ? 'none' : '1px solid var(--color-outline-variant)',
        cursor: 'pointer',
        background: hovered ? 'rgba(255,255,255,0.05)' : 'transparent',
        alignItems: 'center',
        transition: 'background 120ms',
      }}
    >
      {/* Datum */}
      <div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', whiteSpace: 'nowrap' }}>
          {formatDate(e.event_date)}
        </div>
        {e.time_start && (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', opacity: 0.7, marginTop: '0.125rem' }}>
            {e.time_start}
          </div>
        )}
      </div>

      {/* Event-Titel */}
      <span style={{
        fontFamily: 'var(--font-body)',
        fontWeight: 500,
        fontSize: '0.9rem',
        color: 'var(--color-on-surface)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {e.title || '(Kein Titel)'}
      </span>

      {/* Typ */}
      <span style={typeBadgeStyle}>
        {EVENT_TYPE_LABELS[e.event_type] || e.event_type}
      </span>

      {/* Location */}
      <div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {e.location_name || '—'}
        </div>
        {e.location_city && (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', opacity: 0.7, marginTop: '0.125rem' }}>
            {e.location_city}
          </div>
        )}
      </div>

      {/* Kunde */}
      <span style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.85rem',
        color: 'var(--color-on-surface-variant)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {e.customer_name || e.customer_org || '—'}
      </span>

      {/* Gage */}
      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
        —
      </span>

      {/* Status */}
      <div>
        <StatusBadge status={e.status} />
      </div>

      {/* Aktionen */}
      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }} onClick={ev => ev.stopPropagation()}>
        <button
          type="button"
          style={iconBtnStyle}
          title="Bearbeiten"
          onClick={ev => { ev.stopPropagation(); onNavigate(); }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>edit</span>
        </button>
        <button
          type="button"
          style={iconBtnStyle}
          title="Löschen"
          onMouseEnter={ev => { (ev.currentTarget as HTMLButtonElement).style.color = 'var(--color-error)'; }}
          onMouseLeave={ev => { (ev.currentTarget as HTMLButtonElement).style.color = 'var(--color-on-surface-variant)'; }}
          onClick={ev => {
            ev.stopPropagation();
            onDelete();
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>delete</span>
        </button>
      </div>
    </div>
  );
}

// ── DjEventsPage ───────────────────────────────────────────────────────────────

export function DjEventsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();

  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [statusFilter, setStatusFilter] = useState('');

  // Datenladen
  const { data: allEvents = [], isLoading } = useQuery<DjEvent[]>({
    queryKey: ['dj-events', selectedYear],
    queryFn: () => fetchDjEvents({ year: selectedYear }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteDjEvent(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dj-events'] }),
  });

  // Client-seitige Filterung
  const filtered = useMemo(
    () => statusFilter ? allEvents.filter(e => e.status === statusFilter) : allEvents,
    [allEvents, statusFilter],
  );

  // KPI-Berechnungen (aus allEvents, nicht filtered)
  const kpiOffene = allEvents.filter(e => ['neu', 'vorgespraech_vereinbart', 'angebot_gesendet'].includes(e.status)).length;
  const kpiBestaetigt = allEvents.filter(e => e.status === 'bestaetigt').length;
  const kpiAbgeschlossen = allEvents.filter(e => e.status === 'abgeschlossen').length;

  // Jahres-Optionen: aktuelles Jahr - 2 bis + 2
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
                VERANSTALTUNGEN
              </h1>
              <p style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 500,
                fontSize: '0.7rem',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: 'var(--color-on-surface-variant)',
                marginTop: '0.375rem',
                marginBottom: 0,
              }}>
                SYNTHETIC CONDUCTOR
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
              {/* Jahr-Dropdown */}
              <select
                value={selectedYear}
                onChange={ev => setSelectedYear(Number(ev.target.value))}
                style={{
                  background: 'var(--color-surface-container-high)',
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
              {/* + Neue Veranstaltung */}
              <button
                onClick={() => navigate('/dj/events/new')}
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
                Neue Veranstaltung
              </button>
            </div>
          </div>

          {/* ── KPI-Kacheln ──────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>

            {/* Offene Anfragen */}
            <div style={{ background: 'var(--color-surface-container)', borderRadius: '0.75rem', padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)', margin: 0, marginBottom: '0.375rem' }}>
                  Offene Anfragen
                </p>
                <p style={{ fontFamily: 'var(--font-headline)', fontSize: '2rem', fontWeight: 700, color: 'var(--color-tertiary)', lineHeight: 1, margin: 0 }}>
                  {isLoading ? '–' : kpiOffene}
                </p>
              </div>
              <span className="material-symbols-outlined" style={{ fontSize: '28px', color: 'var(--color-tertiary)', opacity: 0.7 }}>
                mark_email_unread
              </span>
            </div>

            {/* Bestätigt */}
            <div style={{ background: 'var(--color-surface-container)', borderRadius: '0.75rem', padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)', margin: 0, marginBottom: '0.375rem' }}>
                  Bestätigt
                </p>
                <p style={{ fontFamily: 'var(--font-headline)', fontSize: '2rem', fontWeight: 700, color: 'var(--color-primary)', lineHeight: 1, margin: 0 }}>
                  {isLoading ? '–' : kpiBestaetigt}
                </p>
              </div>
              <span className="material-symbols-outlined" style={{ fontSize: '28px', color: 'var(--color-primary)', opacity: 0.7 }}>
                check_circle
              </span>
            </div>

            {/* Abgeschlossen */}
            <div style={{ background: 'var(--color-surface-container)', borderRadius: '0.75rem', padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)', margin: 0, marginBottom: '0.375rem' }}>
                  Abgeschlossen
                </p>
                <p style={{ fontFamily: 'var(--font-headline)', fontSize: '2rem', fontWeight: 700, color: 'var(--color-secondary)', lineHeight: 1, margin: 0 }}>
                  {isLoading ? '–' : kpiAbgeschlossen}
                </p>
              </div>
              <span className="material-symbols-outlined" style={{ fontSize: '28px', color: 'var(--color-secondary)', opacity: 0.7 }}>
                task_alt
              </span>
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
                    background: active ? 'rgba(148,170,255,0.15)' : 'var(--color-surface-container)',
                    border: active ? '1px solid var(--color-primary)' : '1px solid var(--color-outline-variant)',
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

          {/* ── Event-Liste ───────────────────────────────────────── */}
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.9rem' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem', opacity: 0.4 }}>hourglass_empty</span>
              Lade...
            </div>
          ) : (
            <div style={{ background: 'var(--color-surface-container)', borderRadius: '0.75rem', overflow: 'hidden' }}>

              {/* Header-Zeile */}
              {filtered.length > 0 && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '110px 1fr 120px 150px 150px 100px 120px 72px',
                  gap: '0.75rem',
                  padding: '0.75rem 1.25rem',
                  borderBottom: '1px solid var(--color-outline-variant)',
                  background: 'rgba(255,255,255,0.03)',
                }}>
                  {['Datum', 'Event', 'Typ', 'Location', 'Kunde', 'Gage', 'Status', ''].map((col, i) => (
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
                  <span className="material-symbols-outlined" style={{ fontSize: '3rem', marginBottom: '1rem', display: 'block', opacity: 0.4 }}>event_busy</span>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', margin: 0 }}>
                    Keine Veranstaltungen für diesen Filter.
                  </p>
                </div>
              ) : (
                filtered.map((e, idx) => (
                  <EventRow
                    key={e.id}
                    event={e}
                    isFirst={idx === 0}
                    onNavigate={() => navigate(`/dj/events/${e.id}`)}
                    onDelete={() => {
                      if (window.confirm('Veranstaltung wirklich löschen?')) {
                        deleteMut.mutate(e.id);
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
