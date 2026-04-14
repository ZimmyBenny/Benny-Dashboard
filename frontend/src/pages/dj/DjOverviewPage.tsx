import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { formatCurrency, formatDate } from '../../lib/format';
import {
  fetchDjOverview,
  fetchDjEvents,
  type DjOverview,
  type DjEvent,
} from '../../api/dj.api';

// ── Main Component ─────────────────────────────────────────────────────────────

export function DjOverviewPage() {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);

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
                DJ ÜBERSICHT
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
              {/* Jahres-Filter */}
              <select
                value={selectedYear}
                onChange={e => setSelectedYear(Number(e.target.value))}
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
                {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              {/* + Neue Anfrage */}
              <button
                onClick={() => navigate('/dj/events')}
                style={{
                  background: 'var(--color-primary-container)',
                  color: 'var(--color-on-primary-container)',
                  border: 'none',
                  borderRadius: '0.75rem',
                  padding: '0.625rem 1.25rem',
                  fontSize: '0.875rem',
                  fontFamily: 'var(--font-body)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
                Neue Anfrage
              </button>
            </div>
          </div>

          {/* ── Reihe 1: 3 kompakte KPI-Kacheln ─────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1rem' }}>

            {/* Termine gesamt */}
            <div style={{ background: 'var(--color-surface-container)', borderRadius: '0.75rem', padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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

            {/* Offene Anfragen */}
            <div style={{ background: 'var(--color-surface-container)', borderRadius: '0.75rem', padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
            <div style={{ background: 'var(--color-surface-container)', borderRadius: '0.75rem', padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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

          </div>

          {/* ── Reihe 2: 3 größere Widgets ───────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1rem' }}>

            {/* Offene Vorgespräche */}
            <div style={{ background: 'var(--color-surface-container-high)', borderRadius: '0.75rem', padding: '1.5rem', minHeight: '160px' }}>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)', margin: 0, marginBottom: '0.75rem' }}>
                Offene Vorgespräche
              </p>
              <p style={{ fontFamily: 'var(--font-headline)', fontSize: '2.5rem', fontWeight: 700, color: 'var(--color-on-surface)', lineHeight: 1, margin: 0, marginBottom: '0.5rem' }}>
                {overviewLoading ? '–' : (overview?.confirmed_events ?? 0)}
              </p>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', margin: 0 }}>
                Bestätigte Events in Planung
              </p>
            </div>

            {/* Gespielte Veranstaltungen YYYY */}
            <div style={{ background: 'var(--color-surface-container)', borderRadius: '0.75rem', padding: '1.5rem', minHeight: '160px' }}>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)', margin: 0, marginBottom: '0.75rem' }}>
                Gespielte Veranstaltungen {selectedYear}
              </p>
              <p style={{ fontFamily: 'var(--font-headline)', fontSize: '2rem', fontWeight: 700, color: 'var(--color-on-surface)', lineHeight: 1, margin: 0, marginBottom: '0.875rem' }}>
                {overviewLoading ? '–' : (overview?.completed_events ?? 0)}
              </p>
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
            <div style={{ background: 'var(--color-surface-container-high)', borderRadius: '0.75rem', padding: '1.5rem', minHeight: '160px' }}>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)', margin: 0, marginBottom: '0.75rem' }}>
                Umsatz {selectedYear}
              </p>
              <p style={{ fontFamily: 'var(--font-headline)', fontSize: '2rem', fontWeight: 700, color: 'var(--color-secondary)', lineHeight: 1, margin: 0, marginBottom: '0.75rem' }}>
                {overviewLoading ? '–' : formatCurrency(overview?.revenue_year ?? 0)}
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-on-surface-variant)' }}>
                  Erwarteter Umsatz
                </span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-on-surface)', fontWeight: 500 }}>
                  {overviewLoading ? '–' : formatCurrency(overview?.confirmed_revenue ?? 0)}
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
                background: 'var(--color-surface-container)',
                borderRadius: '0.75rem',
                padding: '1.5rem',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--color-surface-container-high)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--color-surface-container)'; }}
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
            <div style={{ background: 'var(--color-surface-container)', borderRadius: '0.75rem', padding: '1.5rem' }}>
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
          <div style={{ background: 'var(--color-surface-container)', borderRadius: '0.75rem', padding: '1.5rem' }}>
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
            <div style={{ background: 'var(--color-surface-container-highest)', borderRadius: '9999px', height: '6px', overflow: 'hidden', marginBottom: '0.5rem' }}>
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
    </PageWrapper>
  );
}
