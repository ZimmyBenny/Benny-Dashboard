import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { fetchDjEvents, type DjEvent } from '../../api/dj.api';
import { StatusBadge, EVENT_TYPE_LABELS } from '../../components/dj/StatusBadge';
import { formatDate } from '../../lib/format';

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
// DjEventsPage
// ---------------------------------------------------------------------------
export function DjEventsPage() {
  const navigate = useNavigate();

  const [events, setEvents] = useState<DjEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  // ---------------------------------------------------------------------------
  // Laden
  // ---------------------------------------------------------------------------
  async function loadEvents() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDjEvents();
      setEvents(data);
    } catch {
      setError('Fehler beim Laden der Events');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadEvents(); }, []);

  // ---------------------------------------------------------------------------
  // Gefilterte Liste
  // ---------------------------------------------------------------------------
  const filtered = statusFilter ? events.filter(e => e.status === statusFilter) : events;

  // ---------------------------------------------------------------------------
  // KPI-Werte
  // ---------------------------------------------------------------------------
  const kpiGesamt = events.length;
  const kpiAnfragen = events.filter(e => ['neu', 'vorgespraech_vereinbart', 'angebot_gesendet'].includes(e.status)).length;
  const kpiBestaetigt = events.filter(e => e.status === 'bestaetigt').length;
  const kpiAbgeschlossen = events.filter(e => e.status === 'abgeschlossen').length;

  // ---------------------------------------------------------------------------
  // Filter-Tabs
  // ---------------------------------------------------------------------------
  const filterTabs: { label: string; value: string }[] = [
    { label: 'Alle', value: '' },
    { label: 'Neu', value: 'neu' },
    { label: 'Vorgespräch', value: 'vorgespraech_vereinbart' },
    { label: 'Angebot gesendet', value: 'angebot_gesendet' },
    { label: 'Bestätigt', value: 'bestaetigt' },
    { label: 'Abgeschlossen', value: 'abgeschlossen' },
    { label: 'Abgesagt', value: 'abgesagt' },
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

  const badgeStyle: React.CSSProperties = {
    display: 'inline-block',
    padding: '0.2rem 0.5rem',
    borderRadius: '0.25rem',
    fontSize: '0.75rem',
    fontWeight: 500,
    fontFamily: 'var(--font-body)',
    background: 'var(--color-surface-container-high)',
    color: 'var(--color-on-surface-variant)',
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
          <span className="material-symbols-outlined" style={{ fontSize: '1.5rem', color: 'var(--color-primary)' }}>event</span>
          <div>
            <h1 style={{
              fontFamily: 'var(--font-headline)',
              fontWeight: 800,
              fontSize: 'clamp(1.5rem, 3vw, 2rem)',
              letterSpacing: '-0.02em',
              color: 'var(--color-on-surface)',
              margin: 0,
            }}>
              Events & Anfragen
            </h1>
            <p style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.875rem', margin: '0.125rem 0 0' }}>
              Anfragen, Vorgespräche und gebuchte Veranstaltungen
            </p>
          </div>
        </div>
        <button style={btnPrimary} onClick={() => navigate('/dj/events/new')}>
          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>add</span>
          Neue Anfrage
        </button>
      </div>

      {/* KPI-Karten */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.75rem' }}>
        <KpiCard label="Gesamt" value={kpiGesamt} icon="calendar_month" />
        <KpiCard label="Anfragen" value={kpiAnfragen} icon="mail" />
        <KpiCard label="Bestätigt" value={kpiBestaetigt} icon="check_circle" />
        <KpiCard label="Abgeschlossen" value={kpiAbgeschlossen} icon="task_alt" />
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
              gridTemplateColumns: '120px 1fr 140px 160px 140px 64px',
              gap: '1rem',
              padding: '0.625rem 1.25rem',
              borderBottom: '1px solid var(--color-outline-variant)',
              background: 'rgba(255,255,255,0.03)',
            }}>
              {['Datum', 'Event', 'Typ', 'Kunde', 'Status', ''].map((col, i) => (
                <span key={i} style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.75rem',
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

          {filtered.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '1rem' }}>
                event_busy
              </span>
              <p style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.9rem' }}>
                Keine Events für diesen Filter.
              </p>
            </div>
          ) : (
            filtered.map((e, idx) => (
              <EventRow
                key={e.id}
                event={e}
                isFirst={idx === 0}
                badgeStyle={badgeStyle}
                onNavigate={() => navigate(`/dj/events/${e.id}`)}
              />
            ))
          )}
        </div>
      )}
    </PageWrapper>
  );
}

// ---------------------------------------------------------------------------
// EventRow
// ---------------------------------------------------------------------------
function EventRow({
  event: e,
  isFirst,
  badgeStyle,
  onNavigate,
}: {
  event: DjEvent;
  isFirst: boolean;
  badgeStyle: React.CSSProperties;
  onNavigate: () => void;
}) {
  const [hovered, setHovered] = useState(false);

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
        gridTemplateColumns: '120px 1fr 140px 160px 140px 64px',
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
        {formatDate(e.event_date)}
      </span>

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

      {/* Typ-Badge */}
      <span style={badgeStyle}>
        {EVENT_TYPE_LABELS[e.event_type] || e.event_type}
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
        {e.customer_name || e.customer_org || '—'}
      </span>

      {/* Status */}
      <div>
        <StatusBadge status={e.status} />
      </div>

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
