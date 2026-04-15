import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { fetchDjEvents, deleteDjEvent, updateDjEvent, type DjEvent, type EventStatus } from '../../api/dj.api';
import { StatusBadge, EVENT_TYPE_LABELS } from '../../components/dj/StatusBadge';
import { formatDate } from '../../lib/format';
import { NeueAnfrageModal } from '../../components/dj/NeueAnfrageModal';

// ── Filter-Konfiguration ───────────────────────────────────────────────────────

const FILTER_TABS: { label: string; value: string }[] = [
  { label: 'Alle', value: '' },
  { label: 'Anfrage', value: 'anfrage' },
  { label: 'Vorgespräch', value: 'vorgespraech_vereinbart' },
  { label: 'Angebot', value: 'angebot_gesendet' },
  { label: 'Bestätigt', value: 'bestaetigt' },
  { label: 'Abgeschlossen', value: 'abgeschlossen' },
  { label: 'Abgesagt', value: 'abgesagt' },
];

const STATUS_OPTIONS: EventStatus[] = [
  'anfrage',
  'neu',
  'vorgespraech_vereinbart',
  'angebot_gesendet',
  'bestaetigt',
  'abgeschlossen',
  'abgesagt',
];

// ── DjEventsPage ───────────────────────────────────────────────────────────────

export function DjEventsPage() {
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();

  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [statusFilter, setStatusFilter] = useState('');
  const [showNeueAnfrage, setShowNeueAnfrage] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [statusPickerId, setStatusPickerId] = useState<number | null>(null);
  const [statusPickerPos, setStatusPickerPos] = useState<{ top: number; left: number } | null>(null);

  // Datenladen
  const { data: allEvents = [], isLoading } = useQuery<DjEvent[]>({
    queryKey: ['dj-events', selectedYear],
    queryFn: () => fetchDjEvents({ year: selectedYear }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteDjEvent(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dj-events'] }),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: EventStatus }) => updateDjEvent(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dj-events'] });
      setStatusPickerId(null);
      setStatusPickerPos(null);
    },
  });

  // Klick außerhalb schließt Status-Dropdown
  useEffect(() => {
    if (statusPickerId === null) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-status-picker]')) { setStatusPickerId(null); setStatusPickerPos(null); }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [statusPickerId]);

  // Client-seitige Filterung nach Status
  const filtered = useMemo(() => {
    if (!statusFilter) return allEvents;
    return allEvents.filter(e => e.status === statusFilter);
  }, [allEvents, statusFilter]);

  // Volltextsuche über gefilterte Events
  const searchFiltered = useMemo(() => {
    if (!search.trim()) return filtered;
    const q = search.trim().toLowerCase();
    return filtered.filter(e =>
      (e.title?.toLowerCase().includes(q)) ||
      (e.customer_name?.toLowerCase().includes(q)) ||
      (e.customer_org?.toLowerCase().includes(q)) ||
      (e.location_name?.toLowerCase().includes(q)) ||
      (e.venue_name?.toLowerCase().includes(q)) ||
      (EVENT_TYPE_LABELS[e.event_type]?.toLowerCase().includes(q))
    );
  }, [filtered, search]);

  // Zähler für alle Filter-Pillen
  const tabCounts = useMemo(() => {
    return {
      '': allEvents.length,
      anfrage: allEvents.filter(e => e.status === 'anfrage').length,
      vorgespraech_vereinbart: allEvents.filter(e => e.status === 'vorgespraech_vereinbart').length,
      angebot_gesendet: allEvents.filter(e => e.status === 'angebot_gesendet').length,
      bestaetigt: allEvents.filter(e => e.status === 'bestaetigt').length,
      abgeschlossen: allEvents.filter(e => e.status === 'abgeschlossen').length,
      abgesagt: allEvents.filter(e => e.status === 'abgesagt').length,
    } as Record<string, number>;
  }, [allEvents]);

  // KPI-Berechnungen (aus allEvents, nicht filtered)
  const kpiOffene = allEvents.filter(e => ['anfrage', 'neu', 'vorgespraech_vereinbart', 'angebot_gesendet'].includes(e.status)).length;
  const kpiBestaetigt = allEvents.filter(e => e.status === 'bestaetigt').length;
  const kpiAbgeschlossen = allEvents.filter(e => e.status === 'abgeschlossen').length;

  // Jahres-Optionen: aktuelles Jahr - 2 bis + 2
  const yearOptions = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

  return (
    <PageWrapper>
      <style>{`
        .dj-events-table tbody tr:hover td {
          background: rgba(255,255,255,0.03);
        }
        .dj-events-table tbody tr td {
          transition: background 120ms;
        }
        .dj-edit-btn:hover {
          background: rgba(255,255,255,0.1) !important;
        }
        .dj-status-option:hover {
          background: rgba(255,255,255,0.05) !important;
        }
      `}</style>

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
                ANFRAGEN & EVENTS
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
              {/* + Neue Anfrage */}
              <button
                onClick={() => setShowNeueAnfrage(true)}
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
                Neue Anfrage
              </button>
            </div>
          </div>

          {/* ── KPI-Kacheln ──────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>

            {/* Offene Anfragen */}
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem', padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem', padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem', padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                  <span style={{
                    marginLeft: '0.375rem',
                    background: active ? 'rgba(148,170,255,0.3)' : 'rgba(148,170,255,0.12)',
                    borderRadius: '999px',
                    padding: '0.05rem 0.45rem',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    color: active ? '#94aaff' : 'var(--color-on-surface-variant)',
                  }}>
                    {tabCounts[tab.value] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ── Suchfeld ─────────────────────────────────────────── */}
          {!isLoading && (
            <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
              <span
                className="material-symbols-outlined"
                style={{
                  position: 'absolute',
                  left: '0.875rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '1.1rem',
                  color: 'rgba(148,170,255,0.4)',
                  pointerEvents: 'none',
                }}
              >
                search
              </span>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Suchen nach Titel, Kunde, Location..."
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(148,170,255,0.15)',
                  borderRadius: '0.5rem',
                  padding: '0.625rem 1rem',
                  paddingLeft: '2.5rem',
                  color: 'var(--color-on-surface)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.875rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}

          {/* ── Event-Tabelle ─────────────────────────────────────── */}
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.9rem' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem', opacity: 0.4 }}>hourglass_empty</span>
              Lade...
            </div>
          ) : (
            <div style={{ overflowX: 'auto', background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem' }}>
              <table className="dj-events-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Eventdatum', 'Kunde', 'Typ', 'Location', 'Status', 'Eingang', ''].map((col, i) => (
                      <th
                        key={i}
                        style={{
                          fontSize: '0.7rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.07em',
                          color: 'rgba(148,170,255,0.5)',
                          padding: '0.75rem 1rem',
                          textAlign: 'left',
                          borderBottom: '1px solid rgba(148,170,255,0.15)',
                          fontFamily: 'var(--font-body)',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {searchFiltered.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '3rem 2rem', color: 'var(--color-on-surface-variant)' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '3rem', marginBottom: '1rem', display: 'block', opacity: 0.4 }}>event_busy</span>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', margin: 0 }}>
                          Keine Veranstaltungen für diesen Filter.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    searchFiltered.map(e => {
                      const tdStyle: React.CSSProperties = {
                        padding: '0.875rem 1rem',
                        borderBottom: '1px solid rgba(148,170,255,0.08)',
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.875rem',
                        color: 'var(--color-on-surface)',
                      };

                      // Eventdatum + optionale Uhrzeit
                      const eventDateStr = formatDate(e.event_date) +
                        (e.time_start ? ' / ' + e.time_start.substring(0, 5) : '');

                      return (
                        <tr key={e.id}>
                          {/* Spalte 1: Eventdatum */}
                          <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                            {eventDateStr}
                          </td>

                          {/* Spalte 2: Kunde */}
                          <td style={tdStyle}>
                            {e.customer_name || e.customer_org || '—'}
                          </td>

                          {/* Spalte 3: Typ */}
                          <td style={tdStyle}>
                            <span style={{
                              background: 'rgba(255,255,255,0.05)',
                              borderRadius: '0.25rem',
                              padding: '0.2rem 0.5rem',
                              fontSize: '0.75rem',
                              fontWeight: 500,
                              color: 'var(--color-on-surface-variant)',
                              whiteSpace: 'nowrap',
                            }}>
                              {EVENT_TYPE_LABELS[e.event_type] || e.event_type}
                            </span>
                          </td>

                          {/* Spalte 4: Location */}
                          <td style={{ ...tdStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                            {e.venue_name || e.location_name || '—'}
                          </td>

                          {/* Spalte 5: Status (klickbar mit Inline-Dropdown) */}
                          <td style={{ ...tdStyle }}>
                            <div
                              data-status-picker={statusPickerId === e.id ? 'open' : undefined}
                              style={{ display: 'inline-block' }}
                            >
                              <div
                                onClick={(evt) => {
                                  if (statusPickerId === e.id) {
                                    setStatusPickerId(null);
                                    setStatusPickerPos(null);
                                  } else {
                                    const rect = (evt.currentTarget as HTMLElement).getBoundingClientRect();
                                    setStatusPickerPos({ top: rect.bottom + 6, left: rect.left });
                                    setStatusPickerId(e.id);
                                  }
                                }}
                                style={{ cursor: 'pointer' }}
                              >
                                <StatusBadge status={e.status} />
                              </div>

                              {statusPickerId === e.id && statusPickerPos && (
                                <div
                                  data-status-picker="dropdown"
                                  style={{
                                    position: 'fixed',
                                    top: statusPickerPos.top,
                                    left: statusPickerPos.left,
                                    zIndex: 9999,
                                    background: '#0d1526',
                                    border: '1px solid rgba(148,170,255,0.2)',
                                    borderRadius: '0.5rem',
                                    padding: '0.375rem',
                                    minWidth: '220px',
                                    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                                  }}
                                >
                                  {STATUS_OPTIONS.map(option => (
                                    <button
                                      key={option}
                                      type="button"
                                      className="dj-status-option"
                                      onClick={() => statusMut.mutate({ id: e.id, status: option })}
                                      style={{
                                        display: 'flex',
                                        width: '100%',
                                        padding: '0.5rem 0.75rem',
                                        border: 'none',
                                        background: option === e.status ? 'rgba(255,255,255,0.06)' : 'transparent',
                                        cursor: 'pointer',
                                        borderRadius: '0.375rem',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                      }}
                                    >
                                      <StatusBadge status={option} />
                                      {option === e.status && (
                                        <span className="material-symbols-outlined" style={{ fontSize: '0.875rem', color: 'var(--color-primary)', marginLeft: 'auto' }}>
                                          check
                                        </span>
                                      )}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Spalte 6: Eingang */}
                          <td
                            style={{ ...tdStyle, whiteSpace: 'nowrap' }}
                            title={new Date(e.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                          >
                            {formatDate(e.created_at)}
                          </td>

                          {/* Spalte 7: Aktionen */}
                          <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                            <button
                              type="button"
                              className="dj-edit-btn"
                              title="Bearbeiten"
                              onClick={() => setSelectedEventId(e.id)}
                              style={{
                                background: 'rgba(255,255,255,0.06)',
                                border: '1px solid rgba(148,170,255,0.15)',
                                borderRadius: '0.375rem',
                                padding: '0.375rem',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--color-primary)' }}>
                                edit_note
                              </span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

        </div>{/* /content-wrapper */}
      </div>

      {showNeueAnfrage && !selectedEventId && (
        <NeueAnfrageModal
          key="create"
          onClose={() => setShowNeueAnfrage(false)}
          onCreated={() => {
            setShowNeueAnfrage(false);
            queryClient.invalidateQueries({ queryKey: ['dj-events'] });
          }}
        />
      )}

      {selectedEventId != null && (
        <NeueAnfrageModal
          key={`edit-${selectedEventId}`}
          eventId={selectedEventId}
          onClose={() => setSelectedEventId(null)}
          onCreated={() => setSelectedEventId(null)}
          onUpdated={() => {
            setSelectedEventId(null);
            queryClient.invalidateQueries({ queryKey: ['dj-events'] });
          }}
        />
      )}
    </PageWrapper>
  );
}
