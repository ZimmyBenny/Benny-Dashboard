import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { KPICard } from '../../components/dj/KPICard';
import { formatCurrency, formatDate } from '../../lib/format';
import {
  fetchDjOverview,
  fetchDjEvents,
  fetchDjQuotes,
  fetchDjInvoices,
  type DjOverview,
  type DjEvent,
  type DjQuote,
  type DjInvoice,
} from '../../api/dj.api';

// ── Quicklinks ─────────────────────────────────────────────────────────────────

const quicklinks = [
  { path: '/dj/events',     label: 'Events & Anfragen',  icon: 'event' },
  { path: '/dj/quotes',     label: 'Angebote',            icon: 'description' },
  { path: '/dj/invoices',   label: 'Rechnungen',          icon: 'receipt_long' },
  { path: '/dj/customers',  label: 'Kunden',              icon: 'group' },
  { path: '/dj/services',   label: 'Leistungen & Pakete', icon: 'inventory_2' },
  { path: '/dj/trips',      label: 'Fahrten',             icon: 'directions_car' },
  { path: '/dj/accounting', label: 'Buchhaltung',         icon: 'account_balance' },
  { path: '/dj/settings',   label: 'Einstellungen',       icon: 'tune' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    neu: 'Neu',
    vorgespraech_vereinbart: 'Vorgespräch',
    angebot_gesendet: 'Angebot gesendet',
    bestaetigt: 'Bestätigt',
    abgeschlossen: 'Abgeschlossen',
    abgesagt: 'Abgesagt',
    entwurf: 'Entwurf',
    gesendet: 'Gesendet',
    angenommen: 'Angenommen',
    abgelehnt: 'Abgelehnt',
    abgelaufen: 'Abgelaufen',
    offen: 'Offen',
    teilbezahlt: 'Teilbezahlt',
    bezahlt: 'Bezahlt',
    ueberfaellig: 'Überfällig',
    storniert: 'Storniert',
  };
  return map[status] ?? status;
}

// ── Kurzlisten-Karte ───────────────────────────────────────────────────────────

function ShortListCard({
  title,
  icon,
  navPath,
  isLoading,
  isEmpty,
  children,
}: {
  title: string;
  icon: string;
  navPath: string;
  isLoading: boolean;
  isEmpty: boolean;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();

  return (
    <div style={{ background: 'var(--color-surface-container)', borderRadius: '0.75rem', padding: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'var(--color-primary)' }}>{icon}</span>
        <h3 style={{ fontFamily: 'var(--font-headline)', fontSize: '1rem', fontWeight: 600, color: 'var(--color-on-surface)', margin: 0 }}>{title}</h3>
      </div>

      {isLoading ? (
        <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }}>Lade...</p>
      ) : isEmpty ? (
        <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }}>Keine Einträge</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {children}
        </div>
      )}

      <button
        onClick={() => navigate(navPath)}
        style={{
          marginTop: '1rem',
          background: 'none',
          border: 'none',
          padding: 0,
          color: 'var(--color-primary)',
          fontSize: '0.875rem',
          cursor: 'pointer',
          fontFamily: 'var(--font-body)',
        }}
      >
        Alle anzeigen →
      </button>
    </div>
  );
}

function ListRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--color-surface-container-low)',
      borderRadius: '0.5rem',
      padding: '0.75rem 1rem',
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      fontSize: '0.8125rem',
      color: 'var(--color-on-surface)',
    }}>
      {children}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function DjOverviewPage() {
  const navigate = useNavigate();

  const { data: overview, isLoading: overviewLoading, isError: overviewError } =
    useQuery<DjOverview>({ queryKey: ['dj-overview'], queryFn: () => fetchDjOverview() });

  const { data: events, isLoading: eventsLoading } =
    useQuery<DjEvent[]>({ queryKey: ['dj-events-all'], queryFn: () => fetchDjEvents() });

  const { data: quotes, isLoading: quotesLoading } =
    useQuery<DjQuote[]>({ queryKey: ['dj-quotes-all'], queryFn: () => fetchDjQuotes() });

  const { data: openInvoices, isLoading: invoicesLoading } =
    useQuery<DjInvoice[]>({ queryKey: ['dj-invoices-open'], queryFn: () => fetchDjInvoices({ status: 'offen' }) });

  // Upcoming confirmed events
  const today = new Date().toISOString().split('T')[0];
  const upcomingEvents = (events ?? [])
    .filter(e => e.event_date >= today && e.status === 'bestaetigt')
    .sort((a, b) => a.event_date.localeCompare(b.event_date))
    .slice(0, 3);

  // Latest quotes (sorted descending by quote_date)
  const latestQuotes = (quotes ?? [])
    .sort((a, b) => b.quote_date.localeCompare(a.quote_date))
    .slice(0, 3);

  // Open invoices
  const topOpenInvoices = (openInvoices ?? []).slice(0, 3);

  return (
    <PageWrapper>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2.5rem 2rem' }}>

        {/* Page Header */}
        <div style={{ marginBottom: '2.5rem' }}>
          <h1 style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1.75rem', color: 'var(--color-on-surface)', marginBottom: '0.25rem' }}>
            DJ Übersicht
          </h1>
          <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }}>
            Dein persönliches DJ-Business auf einen Blick
          </p>
        </div>

        {/* KPI Cards */}
        {overviewError ? (
          <p style={{ color: 'var(--color-error)', marginBottom: '2rem' }}>Fehler beim Laden der KPI-Daten.</p>
        ) : overviewLoading || !overview ? (
          <p style={{ color: 'var(--color-on-surface-variant)', marginBottom: '2rem' }}>Lade Daten...</p>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '1rem',
            marginBottom: '2rem',
          }}
          className="kpi-grid"
          >
            <KPICard
              label={`Umsatz ${overview.year}`}
              value={formatCurrency(overview.revenue_year)}
              icon="euro"
              accentColor="primary"
            />
            <KPICard
              label="Offene Rechnungen"
              value={formatCurrency(overview.unpaid_total)}
              sublabel={`${overview.unpaid_count} Rechnungen`}
              icon="receipt_long"
              accentColor={overview.unpaid_count > 0 ? 'error' : 'primary'}
            />
            <KPICard
              label="Bestätigte Events"
              value={overview.confirmed_events}
              icon="event"
              accentColor="secondary"
            />
            <KPICard
              label="Angebote ausstehend"
              value={overview.pending_quotes}
              icon="description"
              accentColor="tertiary"
            />
          </div>
        )}

        {/* Kurzlisten */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '1rem',
          marginBottom: '2rem',
        }}>
          {/* Nächste Events */}
          <ShortListCard
            title="Nächste Events"
            icon="event"
            navPath="/dj/events"
            isLoading={eventsLoading}
            isEmpty={upcomingEvents.length === 0}
          >
            {upcomingEvents.map(ev => (
              <ListRow key={ev.id}>
                <span style={{ color: 'var(--color-on-surface-variant)', whiteSpace: 'nowrap' }}>{formatDate(ev.event_date)}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ev.title ?? ev.event_type}
                </span>
                <span style={{
                  background: 'var(--color-secondary-container)',
                  color: 'var(--color-on-secondary-container)',
                  borderRadius: '0.25rem',
                  padding: '0.125rem 0.375rem',
                  fontSize: '0.75rem',
                  whiteSpace: 'nowrap',
                }}>
                  {statusLabel(ev.status)}
                </span>
              </ListRow>
            ))}
          </ShortListCard>

          {/* Letzte Angebote */}
          <ShortListCard
            title="Letzte Angebote"
            icon="description"
            navPath="/dj/quotes"
            isLoading={quotesLoading}
            isEmpty={latestQuotes.length === 0}
          >
            {latestQuotes.map(q => (
              <ListRow key={q.id}>
                <span style={{ color: 'var(--color-on-surface-variant)', whiteSpace: 'nowrap' }}>{q.number ?? '–'}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {q.customer_name ?? q.customer_org ?? '–'}
                </span>
                <span style={{ whiteSpace: 'nowrap' }}>{formatCurrency(q.total_gross)}</span>
                <span style={{
                  background: 'var(--color-tertiary-container)',
                  color: 'var(--color-on-tertiary-container)',
                  borderRadius: '0.25rem',
                  padding: '0.125rem 0.375rem',
                  fontSize: '0.75rem',
                  whiteSpace: 'nowrap',
                }}>
                  {statusLabel(q.status)}
                </span>
              </ListRow>
            ))}
          </ShortListCard>

          {/* Offene Rechnungen */}
          <ShortListCard
            title="Offene Rechnungen"
            icon="receipt_long"
            navPath="/dj/invoices"
            isLoading={invoicesLoading}
            isEmpty={topOpenInvoices.length === 0}
          >
            {topOpenInvoices.map(inv => (
              <ListRow key={inv.id}>
                <span style={{ color: 'var(--color-on-surface-variant)', whiteSpace: 'nowrap' }}>{inv.number ?? '–'}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {inv.customer_name ?? inv.customer_org ?? '–'}
                </span>
                <span style={{ color: 'var(--color-error)', whiteSpace: 'nowrap' }}>
                  {formatCurrency(inv.total_gross - inv.paid_amount)}
                </span>
                <span style={{ color: 'var(--color-on-surface-variant)', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                  {formatDate(inv.due_date)}
                </span>
              </ListRow>
            ))}
          </ShortListCard>
        </div>

        {/* Quicklinks */}
        <div style={{ marginBottom: '0.75rem' }}>
          <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '1.125rem', fontWeight: 600, color: 'var(--color-on-surface)', marginBottom: '1rem' }}>
            Bereiche
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '0.75rem',
          }}>
            {quicklinks.map(link => (
              <button
                key={link.path}
                onClick={() => navigate(link.path)}
                style={{
                  background: 'var(--color-surface-container)',
                  border: 'none',
                  borderRadius: '0.75rem',
                  padding: '1.25rem',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.5rem',
                  transition: 'background 0.15s',
                  textAlign: 'center',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-container-high)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-container)'; }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '28px', color: 'var(--color-primary)' }}>
                  {link.icon}
                </span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-on-surface)' }}>
                  {link.label}
                </span>
              </button>
            ))}
          </div>
        </div>

      </div>
    </PageWrapper>
  );
}
