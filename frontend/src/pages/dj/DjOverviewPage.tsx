import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { formatCurrency, formatDate } from '../../lib/format';
import {
  fetchDjOverview,
  fetchDjEvents,
  type DjOverview,
  type DjEvent,
} from '../../api/dj.api';
import { NeueAnfrageModal } from '../../components/dj/NeueAnfrageModal';
import { StatusBadge, EVENT_TYPE_LABELS } from '../../components/dj/StatusBadge';

// ── Main Component ─────────────────────────────────────────────────────────────

export function DjOverviewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  const selectedYear = currentYear;
  const [showNeueAnfrage, setShowNeueAnfrage] = useState(false);

  const { data: overview, isLoading: overviewLoading } =
    useQuery<DjOverview>({
      queryKey: ['dj-overview', selectedYear],
      queryFn: () => fetchDjOverview(selectedYear),
    });

  const { data: events } =
    useQuery<DjEvent[]>({
      queryKey: ['dj-events-all'],
      queryFn: () => fetchDjEvents(),
    });

  // Nächste Events Widget
  const [upcomingWeeks, setUpcomingWeeks] = useState<2 | 4>(2);
  const upcomingEvents = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(today.getDate() + upcomingWeeks * 7);
    return (events ?? [])
      .filter(e => {
        if (e.status === 'abgesagt') return false;
        const d = new Date(e.event_date + 'T00:00:00');
        return d >= today && d <= end;
      })
      .sort((a, b) => a.event_date.localeCompare(b.event_date));
  }, [events, upcomingWeeks]);

  // Auslastung: bestätigte Events Fr/Sa in den nächsten 365 Tagen
  const weekendStats = useMemo(() => {
    const today = new Date();
    const end = new Date(today);
    end.setDate(today.getDate() + 365);

    const bookedWeekends = new Set<string>();
    (events ?? []).forEach(ev => {
      if (ev.status !== 'bestaetigt') return;
      const d = new Date(ev.event_date);
      if (d < today || d > end) return;
      const dow = d.getDay(); // 5=Fr, 6=Sa
      if (dow === 5 || dow === 6) {
        // Wochenende-Schlüssel: Montag der Woche
        const monday = new Date(d);
        monday.setDate(d.getDate() - ((dow + 1) % 7));
        bookedWeekends.add(monday.toISOString().split('T')[0]);
      }
    });
    const booked = bookedWeekends.size;
    const total = 52;
    const free = total - booked;
    const pct = Math.round((booked / total) * 100);
    return { booked, free, total, pct };
  }, [events]);

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

          {/* ── Page Header ──────────────────────────────────── */}
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
                DJ DASHBOARD
              </h1>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
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
                Neues Event
              </button>
            </div>
          </div>

          {/* ── Nächste Veranstaltungen ───────────────────────── */}
          <div style={{
            marginBottom: '2rem',
            borderRadius: '1rem',
            overflow: 'hidden',
            border: '1px solid rgba(148,170,255,0.25)',
            boxShadow: '0 0 40px rgba(148,170,255,0.08), 0 0 0 1px rgba(148,170,255,0.05) inset',
            background: 'linear-gradient(135deg, rgba(148,170,255,0.06) 0%, rgba(6,14,32,0.8) 60%)',
          }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1.125rem 1.5rem',
              borderBottom: '1px solid rgba(148,170,255,0.15)',
              background: 'rgba(148,170,255,0.04)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                <div style={{
                  width: '32px', height: '32px', borderRadius: '0.5rem',
                  background: 'rgba(148,170,255,0.12)',
                  border: '1px solid rgba(148,170,255,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', color: 'var(--color-primary)' }}>upcoming</span>
                </div>
                <div>
                  <div style={{
                    fontFamily: 'var(--font-headline)',
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    letterSpacing: '-0.02em',
                    background: 'linear-gradient(135deg, #94aaff 0%, #5cfd80 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}>
                    Nächste Veranstaltungen
                  </div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'rgba(148,170,255,0.6)', marginTop: '0.1rem' }}>
                    {upcomingEvents.length === 0 ? 'Keine Events im Zeitraum' : `${upcomingEvents.length} Event${upcomingEvents.length !== 1 ? 's' : ''} im Zeitraum`}
                  </div>
                </div>
              </div>
              {/* Toggle */}
              <div style={{ display: 'flex', gap: '0.375rem', background: 'rgba(0,0,0,0.2)', padding: '0.25rem', borderRadius: '999px' }}>
                {([2, 4] as const).map(w => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setUpcomingWeeks(w)}
                    style={{
                      background: upcomingWeeks === w ? 'linear-gradient(135deg, rgba(148,170,255,0.25), rgba(148,170,255,0.1))' : 'transparent',
                      border: upcomingWeeks === w ? '1px solid rgba(148,170,255,0.4)' : '1px solid transparent',
                      borderRadius: '999px',
                      color: upcomingWeeks === w ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
                      padding: '0.3rem 0.875rem',
                      fontSize: '0.75rem',
                      fontFamily: 'var(--font-body)',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      boxShadow: upcomingWeeks === w ? '0 0 12px rgba(148,170,255,0.2)' : 'none',
                    }}
                  >
                    {w} Wochen
                  </button>
                ))}
              </div>
            </div>

            {/* Tabelle */}
            {upcomingEvents.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.875rem' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.75rem', opacity: 0.3, color: 'var(--color-primary)' }}>event_available</span>
                Keine Veranstaltungen in den nächsten {upcomingWeeks} Wochen.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(0,0,0,0.15)' }}>
                    {['Datum', 'Kunde', 'Typ', 'Event-Typ', 'Location', 'Status'].map((col, i) => (
                      <th key={i} style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.09em', color: 'rgba(148,170,255,0.45)', padding: '0.6rem 1.25rem', textAlign: 'left', fontFamily: 'var(--font-body)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {upcomingEvents.map((e, idx) => {
                    const isFirst = idx === 0;
                    const tdStyle: React.CSSProperties = {
                      padding: '0.875rem 1.25rem',
                      borderTop: '1px solid rgba(148,170,255,0.08)',
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.875rem',
                      color: 'var(--color-on-surface)',
                    };
                    const dateStr = formatDate(e.event_date) + (e.time_start ? ' · ' + e.time_start.substring(0, 5) : '');
                    // Countdown berechnen
                    const today = new Date(); today.setHours(0, 0, 0, 0);
                    const evDay = new Date(e.event_date); evDay.setHours(0, 0, 0, 0);
                    const diffDays = Math.round((evDay.getTime() - today.getTime()) / 86400000);
                    const countdownLabel = diffDays === 0 ? 'Heute' : diffDays === 1 ? 'Morgen' : `${diffDays} Tage`;
                    const countdownUrgent = diffDays <= 3;
                    return (
                      <tr
                        key={e.id}
                        style={{
                          background: isFirst
                            ? 'rgba(148,170,255,0.06)'
                            : e.status === 'bestaetigt'
                              ? 'rgba(92,253,128,0.03)'
                              : 'transparent',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={ev => { (ev.currentTarget as HTMLTableRowElement).style.background = 'rgba(148,170,255,0.07)'; }}
                        onMouseLeave={ev => {
                          (ev.currentTarget as HTMLTableRowElement).style.background = isFirst
                            ? 'rgba(148,170,255,0.06)'
                            : e.status === 'bestaetigt' ? 'rgba(92,253,128,0.03)' : 'transparent';
                        }}
                      >
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {isFirst && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-primary)', boxShadow: '0 0 6px var(--color-primary)', flexShrink: 0 }} />}
                            <div>
                              <span style={{ fontWeight: isFirst ? 700 : 500, color: isFirst ? 'var(--color-primary)' : 'var(--color-on-surface)', fontSize: isFirst ? '0.9rem' : '0.875rem' }}>
                                {dateStr}
                              </span>
                              <span style={{
                                marginLeft: '0.5rem',
                                display: 'inline-block',
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                padding: '0.15rem 0.5rem',
                                borderRadius: '999px',
                                background: countdownUrgent
                                  ? 'rgba(255,100,100,0.15)'
                                  : isFirst
                                    ? 'rgba(148,170,255,0.15)'
                                    : 'rgba(255,255,255,0.06)',
                                border: countdownUrgent
                                  ? '1px solid rgba(255,100,100,0.4)'
                                  : isFirst
                                    ? '1px solid rgba(148,170,255,0.3)'
                                    : '1px solid rgba(255,255,255,0.1)',
                                color: countdownUrgent
                                  ? '#ff6464'
                                  : isFirst
                                    ? 'var(--color-primary)'
                                    : 'var(--color-on-surface-variant)',
                                letterSpacing: '0.02em',
                              }}>
                                {countdownLabel}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td style={{ ...tdStyle, fontWeight: isFirst ? 600 : 400 }}>{e.customer_name || e.customer_org || '—'}</td>
                        <td style={tdStyle}>
                          <span style={{ background: 'rgba(148,170,255,0.08)', border: '1px solid rgba(148,170,255,0.15)', borderRadius: '0.375rem', padding: '0.2rem 0.6rem', fontSize: '0.72rem', color: 'rgba(148,170,255,0.8)', whiteSpace: 'nowrap', fontWeight: 600, letterSpacing: '0.02em' }}>
                            {EVENT_TYPE_LABELS[e.event_type] || e.event_type}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, color: 'var(--color-on-surface-variant)', fontSize: '0.82rem' }}>{e.title || '—'}</td>
                        <td style={{ ...tdStyle, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-on-surface-variant)' }}>{e.venue_name || e.location_name || '—'}</td>
                        <td style={tdStyle}><StatusBadge status={e.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Reihe 1: 3 kompakte KPI-Kacheln ─────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1rem' }}>

            {/* Offene Anfragen */}
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem', padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)', margin: 0, marginBottom: '0.375rem' }}>
                  Offene Anfragen
                </p>
                <p style={{ fontFamily: 'var(--font-headline)', fontSize: '2rem', fontWeight: 700, color: 'var(--color-tertiary)', lineHeight: 1, margin: 0 }}>
                  {overviewLoading ? '–' : (overview?.open_requests ?? 0)}
                </p>
              </div>
              <span className="material-symbols-outlined" style={{ fontSize: '28px', color: 'var(--color-tertiary)', opacity: 0.7 }}>
                mark_email_unread
              </span>
            </div>

            {/* Angebote ausstehend */}
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem', padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)', margin: 0, marginBottom: '0.375rem' }}>
                  Angebote ausstehend
                </p>
                <p style={{ fontFamily: 'var(--font-headline)', fontSize: '2rem', fontWeight: 700, color: 'var(--color-tertiary)', lineHeight: 1, margin: 0 }}>
                  {overviewLoading ? '–' : (overview?.pending_quotes ?? 0)}
                </p>
              </div>
              <span className="material-symbols-outlined" style={{ fontSize: '28px', color: 'var(--color-tertiary)', opacity: 0.7 }}>
                description
              </span>
            </div>

            {/* Termine gesamt */}
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem', padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)', margin: 0, marginBottom: '0.375rem' }}>
                  Termine gesamt
                </p>
                <p style={{ fontFamily: 'var(--font-headline)', fontSize: '2rem', fontWeight: 700, color: 'var(--color-on-surface)', lineHeight: 1, margin: 0 }}>
                  {overviewLoading ? '–' : (overview?.total_events ?? 0)}
                </p>
              </div>
              <span className="material-symbols-outlined" style={{ fontSize: '28px', color: 'var(--color-primary)', opacity: 0.7 }}>
                calendar_month
              </span>
            </div>

          </div>

          {/* ── Reihe 2: 3 größere Widgets ───────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1rem' }}>

            {/* Offene Vorgespräche */}
            <div
              onClick={() => navigate('/dj/events?filter=_vorgespraeche')}
              style={{ background: 'rgba(255,196,87,0.07)', borderRadius: '0.75rem', padding: '1.5rem', minHeight: '160px', cursor: 'pointer', border: '1px solid rgba(255,196,87,0.15)', transition: 'background 150ms' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,196,87,0.12)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,196,87,0.07)')}
            >
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,196,87,0.7)', margin: 0, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>forum</span>
                Offene Vorgespräche
              </p>
              <p style={{ fontFamily: 'var(--font-headline)', fontSize: '2.5rem', fontWeight: 700, color: '#ffc457', lineHeight: 1, margin: 0, marginBottom: '0.5rem' }}>
                {overviewLoading ? '–' : (overview?.open_vorgespraeche ?? 0)}
              </p>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'rgba(255,196,87,0.6)', margin: 0 }}>
                → Zu den Events
              </p>
            </div>

            {/* Gespielte Veranstaltungen YYYY */}
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem', padding: '1.5rem', minHeight: '160px' }}>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)', margin: 0, marginBottom: '0.75rem' }}>
                Gespielte Veranstaltungen {selectedYear}
              </p>
              <p style={{ fontFamily: 'var(--font-headline)', fontSize: '2rem', fontWeight: 700, color: 'var(--color-on-surface)', lineHeight: 1, margin: 0, marginBottom: '0.5rem' }}>
                {overviewLoading ? '–' : (overview?.completed_events ?? 0)}
              </p>
              {!overviewLoading && (overview?.completed_events ?? 0) > 0 && (
                <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.68rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)', margin: 0, marginBottom: '0.3rem' }}>
                    Ø Gage
                  </p>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--color-on-surface-variant)', margin: 0, marginBottom: '0.1rem' }}>
                    Brutto{' '}
                    <span style={{ color: '#4ade80', fontWeight: 600 }}>
                      {formatCurrency((overview!.revenue_year ?? 0) / overview!.completed_events)}
                    </span>
                  </p>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--color-on-surface-variant)', margin: 0 }}>
                    Netto{' '}
                    <span style={{ color: '#4ade80', fontWeight: 600 }}>
                      {formatCurrency((overview!.revenue_year_net ?? 0) / overview!.completed_events)}
                    </span>
                  </p>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {(overview?.recent_completed ?? []).slice(0, 3).map(ev => (
                  <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', whiteSpace: 'nowrap' }}>
                      {formatDate(ev.event_date)}
                    </span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-on-surface)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ev.title ?? ev.event_type}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Umsatz YYYY */}
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '0.75rem', padding: '1.5rem', minHeight: '160px' }}>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)', margin: 0, marginBottom: '0.75rem' }}>
                Umsatz {selectedYear}
              </p>
              <p style={{ fontFamily: 'var(--font-headline)', fontSize: '2rem', fontWeight: 700, color: 'var(--color-secondary)', lineHeight: 1, margin: 0, marginBottom: '0.75rem' }}>
                {overviewLoading ? '–' : formatCurrency(overview?.revenue_year ?? 0)}
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-on-surface-variant)' }}>Netto</span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-on-surface)', fontWeight: 500 }}>
                  {overviewLoading ? '–' : formatCurrency(overview?.revenue_year_net ?? 0)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-on-surface-variant)' }}>MwSt</span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: '#fbbf24', fontWeight: 500 }}>
                  {overviewLoading ? '–' : formatCurrency(overview?.revenue_year_tax ?? 0)}
                </span>
              </div>
            </div>

          </div>

          {/* ── Reihe 3: 2 breite Karten ─────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>

            {/* Unbezahlte Rechnungen */}
            <div
              onClick={() => navigate('/dj/invoices')}
              style={{
                background: 'rgba(255,255,255,0.03)',
                borderRadius: '0.75rem',
                padding: '1.5rem',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.05)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)', margin: 0 }}>
                  Unbezahlte Rechnungen → Finanzen
                </p>
                <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'var(--color-error)' }}>
                  receipt_long
                </span>
              </div>
              <p style={{ fontFamily: 'var(--font-headline)', fontSize: '1.875rem', fontWeight: 700, color: 'var(--color-error)', lineHeight: 1, margin: 0, marginBottom: '0.5rem' }}>
                {overviewLoading ? '–' : formatCurrency(overview?.unpaid_total ?? 0)}
              </p>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', margin: 0 }}>
                {overviewLoading
                  ? ''
                  : (overview?.unpaid_count ?? 0) === 0
                    ? 'Keine offenen Rechnungen'
                    : `${overview!.unpaid_count} offene Rechnung${overview!.unpaid_count > 1 ? 'en' : ''}`
                }
              </p>
            </div>

            {/* Bestätigte zukünftige Einnahmen */}
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem', padding: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)', margin: 0 }}>
                  Bestätigte zukünftige Einnahmen
                </p>
                <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'var(--color-tertiary)' }}>
                  trending_up
                </span>
              </div>
              <p style={{ fontFamily: 'var(--font-headline)', fontSize: '1.875rem', fontWeight: 700, color: 'var(--color-tertiary)', lineHeight: 1, margin: 0, marginBottom: '0.5rem' }}>
                {overviewLoading ? '–' : formatCurrency(overview?.confirmed_revenue ?? 0)}
              </p>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', margin: 0 }}>
                Bestätigte Events mit noch offener Zahlung
              </p>
            </div>

          </div>

          {/* ── Auslastung Wochenenden (volle Breite) ────────── */}
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem', padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
              <div>
                <p style={{ fontFamily: 'var(--font-headline)', fontSize: '1rem', fontWeight: 600, color: 'var(--color-on-surface)', margin: 0, marginBottom: '0.25rem' }}>
                  Auslastung Wochenenden
                </p>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', margin: 0 }}>
                  Bestätigte Events (Fr/Sa) — nächste 365 Tage
                </p>
              </div>
              {/* Dots: X gebucht · Y frei */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-secondary)' }} />
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-on-surface)' }}>
                    {weekendStats.booked} gebucht
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-outline)' }} />
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-on-surface-variant)' }}>
                    {weekendStats.free} frei
                  </span>
                </div>
              </div>
            </div>
            {/* Progress-Bar */}
            <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '9999px', height: '6px', overflow: 'hidden', marginBottom: '0.5rem' }}>
              <div style={{
                background: 'var(--color-secondary)',
                height: '100%',
                borderRadius: '9999px',
                width: `${weekendStats.pct}%`,
                transition: 'width 0.4s ease',
              }} />
            </div>
            {/* Labels */}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-on-surface-variant)' }}>0</span>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-on-surface-variant)' }}>
                {weekendStats.total} Wochenenden gesamt
              </span>
            </div>
          </div>

        </div>{/* /content-wrapper */}
      </div>
      {showNeueAnfrage && (
        <NeueAnfrageModal
          onClose={() => setShowNeueAnfrage(false)}
          onCreated={() => {
            setShowNeueAnfrage(false);
            queryClient.invalidateQueries({ queryKey: ['dj-overview'] });
            queryClient.invalidateQueries({ queryKey: ['dj-events'] });
          }}
        />
      )}
    </PageWrapper>
  );
}
