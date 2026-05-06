/**
 * BelegeOverviewPage — /belege Landing Page (Phase 04 Plan 07).
 *
 * Layout-Stil: orientiert sich am DJ-Dashboard (DjOverviewPage) — Glassmorphism,
 * Ambient Glows, Purple/Blue Accents, KPICard fuer einheitliche Metric-Cards.
 *
 * Inhalte:
 *  - Page-Header mit "BELEGE" Titel und "Neuer Beleg"-Button
 *  - 6 KPICards in einem responsive Grid (Conditional fuer Steuerzahllast)
 *  - 2 Listen nebeneinander: Letzte 10 Belege + Naechste 10 Faelligkeiten
 *
 * KPICards:
 *   1. Neue Belege 7d           (primary)   → /belege/alle?from=...
 *   2. Zu pruefen               (tertiary)  → /belege/zu-pruefen
 *   3. Offene Zahlungen         (primary)   → /belege/offen
 *   4. Ueberfaellig             (error)     → /belege/offen?ueberfaellig=1
 *   5. Steuerzahllast Zeitraum  (secondary) → /belege/steuer
 *      [conditional: nur wenn ustva_zeitraum != 'keine']
 *   6. Steuerrelevant Jahr      (secondary)
 */
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { KPICard } from '../../components/dj/KPICard';
import { StatusBadge } from '../../components/dj/StatusBadge';
import {
  fetchOverviewKpis,
  fetchReceipts,
  type ReceiptListItem,
} from '../../api/belege.api';
import { formatCurrencyFromCents, formatDate } from '../../lib/format';

export function BelegeOverviewPage() {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();

  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ['belege', 'overview-kpis'],
    queryFn: fetchOverviewKpis,
  });

  // Letzte 10 Belege (sortiert nach receipt_date DESC durch Backend)
  const { data: latest = [] } = useQuery({
    queryKey: ['belege', 'latest-10'],
    queryFn: () => fetchReceipts({}).then((rs) => rs.slice(0, 10)),
  });

  // Naechste 10 Faelligkeiten — offene Zahlungen mit due_date sortiert
  const { data: upcoming = [] } = useQuery({
    queryKey: ['belege', 'upcoming-10'],
    queryFn: () =>
      fetchReceipts({ status: 'offen' }).then((rs) =>
        [...rs]
          .filter((r) => r.due_date)
          .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
          .slice(0, 10),
      ),
  });

  // Berechne 7-Tage-Filter-Datum (lokal)
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  return (
    <PageWrapper>
      <div
        style={{
          maxWidth: '1400px',
          margin: '0 auto',
          padding: '2.5rem 2rem',
          position: 'relative',
        }}
      >
        {/* Ambient Glow oben rechts (blau) */}
        <div
          style={{
            position: 'absolute',
            top: '-100px',
            right: '-100px',
            width: '600px',
            height: '600px',
            background: 'radial-gradient(circle, rgba(148,170,255,0.06) 0%, transparent 60%)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />

        {/* Ambient Glow unten links (gruen) */}
        <div
          style={{
            position: 'absolute',
            bottom: '-80px',
            left: '-80px',
            width: '400px',
            height: '400px',
            background: 'radial-gradient(circle, rgba(92,253,128,0.04) 0%, transparent 60%)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />

        {/* Content ueber den Glows */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* ── Page Header ──────────────────────────────── */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              marginBottom: '2.5rem',
            }}
          >
            <div>
              <h1
                style={{
                  fontFamily: 'var(--font-headline)',
                  fontWeight: 800,
                  fontSize: '3rem',
                  letterSpacing: '-0.02em',
                  color: 'var(--color-on-surface)',
                  margin: 0,
                  lineHeight: 1.1,
                }}
              >
                BELEGE
              </h1>
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.875rem',
                  color: 'var(--color-on-surface-variant)',
                  marginTop: '0.5rem',
                }}
              >
                Übersicht über alle Belege, Eingangsrechnungen und steuerrelevante Vorgänge
              </p>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                marginTop: '0.5rem',
              }}
            >
              <button
                onClick={() => navigate('/belege/neu')}
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
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                  add
                </span>
                Neuer Beleg
              </button>
            </div>
          </div>

          {/* ── KPI-Grid ────────────────────────────────── */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1rem',
              marginBottom: '2.5rem',
            }}
          >
            <KPICard
              label="Neue Belege 7d"
              value={kpisLoading ? '–' : (kpis?.neueBelege7d ?? 0)}
              icon="add_box"
              accentColor="primary"
              onClick={() => navigate(`/belege/alle?from=${sevenDaysAgo}`)}
            />
            <KPICard
              label="Zu prüfen"
              value={kpisLoading ? '–' : (kpis?.zuPruefen ?? 0)}
              icon="rule"
              accentColor="tertiary"
              onClick={() => navigate('/belege/zu-pruefen')}
            />
            <KPICard
              label="Offene Zahlungen"
              value={kpisLoading ? '–' : (kpis?.offeneZahlungen ?? 0)}
              sublabel={
                kpisLoading
                  ? undefined
                  : formatCurrencyFromCents(kpis?.offeneZahlungenSumCents)
              }
              icon="schedule"
              accentColor="primary"
              onClick={() => navigate('/belege/offen')}
            />
            <KPICard
              label="Überfällig"
              value={kpisLoading ? '–' : (kpis?.ueberfaellig ?? 0)}
              icon="warning"
              accentColor="error"
              onClick={() => navigate('/belege/offen?ueberfaellig=1')}
            />
            {kpis?.ustvaZeitraum !== 'keine' && (
              <KPICard
                label="Steuerzahllast aktueller Zeitraum"
                value={
                  kpisLoading
                    ? '–'
                    : formatCurrencyFromCents(kpis?.steuerzahllastCurrentPeriodCents)
                }
                icon="account_balance"
                accentColor="secondary"
                onClick={() => navigate('/belege/steuer')}
              />
            )}
            <KPICard
              label={`Steuerrelevant ${currentYear}`}
              value={
                kpisLoading
                  ? '–'
                  : formatCurrencyFromCents(kpis?.steuerrelevantThisYearCents)
              }
              icon="receipt_long"
              accentColor="secondary"
              onClick={() => navigate('/belege/steuer')}
            />
          </div>

          {/* ── Listen-Bereich (2 Spalten) ──────────────── */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
              gap: '1.5rem',
            }}
          >
            <ReceiptSection
              title="Letzte 10 Belege"
              icon="history"
              items={latest}
              emptyText="Noch keine Belege erfasst."
              onClick={(r) => navigate(`/belege/${r.id}`)}
              showDueDate={false}
            />
            <ReceiptSection
              title="Nächste 10 Fälligkeiten"
              icon="event_upcoming"
              items={upcoming}
              emptyText="Keine offenen Fälligkeiten."
              onClick={(r) => navigate(`/belege/${r.id}`)}
              showDueDate={true}
            />
          </div>
        </div>
        {/* /content-wrapper */}
      </div>
    </PageWrapper>
  );
}

// ── Sub-Components ───────────────────────────────────────────────────────

interface ReceiptSectionProps {
  title: string;
  icon: string;
  items: ReceiptListItem[];
  emptyText: string;
  onClick: (r: ReceiptListItem) => void;
  showDueDate: boolean;
}

function ReceiptSection({
  title,
  icon,
  items,
  emptyText,
  onClick,
  showDueDate,
}: ReceiptSectionProps) {
  return (
    <section
      style={{
        borderRadius: '1rem',
        overflow: 'hidden',
        border: '1px solid rgba(148,170,255,0.15)',
        background:
          'linear-gradient(135deg, rgba(148,170,255,0.04) 0%, rgba(6,14,32,0.6) 60%)',
        boxShadow: '0 0 24px rgba(148,170,255,0.04)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.625rem',
          padding: '1rem 1.5rem',
          borderBottom: '1px solid rgba(148,170,255,0.12)',
          background: 'rgba(148,170,255,0.03)',
        }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '0.5rem',
            background: 'rgba(148,170,255,0.12)',
            border: '1px solid rgba(148,170,255,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '1.1rem', color: 'var(--color-primary)' }}
          >
            {icon}
          </span>
        </div>
        <div
          style={{
            fontFamily: 'var(--font-headline)',
            fontSize: '1.125rem',
            fontWeight: 700,
            letterSpacing: '-0.01em',
            color: 'var(--color-on-surface)',
          }}
        >
          {title}
        </div>
      </div>

      {/* Body */}
      {items.length === 0 ? (
        <div
          style={{
            padding: '3rem 1.5rem',
            textAlign: 'center',
            color: 'var(--color-on-surface-variant)',
            fontFamily: 'var(--font-body)',
            fontSize: '0.875rem',
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: '2.5rem',
              display: 'block',
              marginBottom: '0.75rem',
              opacity: 0.3,
              color: 'var(--color-primary)',
            }}
          >
            inbox
          </span>
          {emptyText}
        </div>
      ) : (
        <div>
          {items.map((r, i) => (
            <ReceiptRow
              key={r.id}
              receipt={r}
              isFirst={i === 0}
              showDueDate={showDueDate}
              onClick={() => onClick(r)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ReceiptRow({
  receipt: r,
  isFirst,
  showDueDate,
  onClick,
}: {
  receipt: ReceiptListItem;
  isFirst: boolean;
  showDueDate: boolean;
  onClick: () => void;
}) {
  const isOverdue =
    showDueDate &&
    r.due_date &&
    new Date(r.due_date) < new Date(new Date().toDateString());

  return (
    <div
      onClick={onClick}
      style={{
        padding: '0.875rem 1.25rem',
        display: 'grid',
        gridTemplateColumns: '1fr auto auto',
        gap: '0.875rem',
        alignItems: 'center',
        cursor: 'pointer',
        borderTop: isFirst ? 'none' : '1px solid rgba(148,170,255,0.06)',
        transition: 'background 0.15s',
        background: isOverdue ? 'rgba(255,110,132,0.04)' : 'transparent',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = 'rgba(148,170,255,0.05)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = isOverdue
          ? 'rgba(255,110,132,0.04)'
          : 'transparent';
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.9rem',
            fontWeight: 600,
            color: 'var(--color-on-surface)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {r.supplier_name || r.title || '–'}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.72rem',
            color: 'var(--color-on-surface-variant)',
            marginTop: '0.15rem',
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'center',
          }}
        >
          <span>{formatDate(r.receipt_date)}</span>
          {showDueDate && r.due_date && (
            <span
              style={{
                color: isOverdue ? 'var(--color-error)' : 'var(--color-on-surface-variant)',
                fontWeight: isOverdue ? 700 : 400,
              }}
            >
              · fällig {formatDate(r.due_date)}
            </span>
          )}
          {r.supplier_invoice_number && (
            <span style={{ opacity: 0.6 }}>· {r.supplier_invoice_number}</span>
          )}
        </div>
      </div>
      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.95rem',
          fontWeight: 700,
          color:
            r.amount_gross_cents < 0 ? 'var(--color-error)' : 'var(--color-on-surface)',
          whiteSpace: 'nowrap',
        }}
      >
        {formatCurrencyFromCents(r.amount_gross_cents)}
      </div>
      <StatusBadge status={r.status as never} />
    </div>
  );
}
