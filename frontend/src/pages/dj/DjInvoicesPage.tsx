import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import {
  fetchDjInvoices,
  finalizeDjInvoice,
  payDjInvoice,
  type DjInvoice,
  type InvoiceStatus,
} from '../../api/dj.api';
import { formatDate, formatCurrency } from '../../lib/format';

const STATUS_STYLES: Record<InvoiceStatus, { bg: string; color: string; label: string }> = {
  entwurf:      { bg: 'rgba(148,170,255,0.15)', color: 'var(--color-primary)',    label: 'Entwurf' },
  offen:        { bg: 'rgba(251,191,36,0.15)',  color: '#fbbf24',                 label: 'Offen' },
  teilbezahlt:  { bg: 'rgba(251,191,36,0.15)',  color: '#fbbf24',                 label: 'Teilbezahlt' },
  bezahlt:      { bg: 'rgba(92,253,128,0.15)',  color: 'var(--color-secondary)',   label: 'Bezahlt' },
  ueberfaellig: { bg: 'rgba(239,68,68,0.15)',   color: 'var(--color-error)',       label: 'Überfällig' },
  storniert:    { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8',                 label: 'Storniert' },
};

const FILTER_TABS: { label: string; value: InvoiceStatus | '' }[] = [
  { label: 'Alle',        value: '' },
  { label: 'Entwurf',     value: 'entwurf' },
  { label: 'Offen',       value: 'offen' },
  { label: 'Teilbezahlt', value: 'teilbezahlt' },
  { label: 'Bezahlt',     value: 'bezahlt' },
  { label: 'Überfällig',  value: 'ueberfaellig' },
  { label: 'Storniert',   value: 'storniert' },
];

const iconBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--color-on-surface-variant)', display: 'flex',
  alignItems: 'center', justifyContent: 'center',
  padding: '0.25rem', borderRadius: '0.375rem',
};

function InvoiceRow({ invoice: i, isFirst, today, onNavigate, onFinalize, onMarkPaid }: {
  invoice: DjInvoice; isFirst: boolean; today: string;
  onNavigate: () => void; onFinalize: () => void; onMarkPaid: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const entwurfChipStyle: React.CSSProperties = {
    display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '0.25rem',
    fontSize: '0.7rem', fontWeight: 500, fontFamily: 'var(--font-body)',
    background: 'rgba(255,255,255,0.05)', color: 'var(--color-on-surface-variant)', whiteSpace: 'nowrap',
  };
  const isOverdue = !!(i.due_date && i.due_date < today && i.paid_amount < i.total_gross && i.status !== 'storniert');
  const isDraft = i.finalized_at === null;
  const isUnpaid = i.finalized_at !== null && (i.status === 'offen' || i.status === 'teilbezahlt');
  const isPaidOrCancelled = i.finalized_at !== null && !isUnpaid;
  const statusStyle = STATUS_STYLES[i.status];

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
        gridTemplateColumns: '110px 90px 1fr 1fr 120px 110px 110px 120px',
        gap: '0.75rem',
        padding: '0.75rem 1.25rem',
        borderTop: isFirst ? 'none' : '1px solid rgba(148,170,255,0.15)',
        cursor: 'pointer',
        background: hovered ? 'rgba(255,255,255,0.05)' : 'transparent',
        alignItems: 'center',
        transition: 'background 120ms',
      }}
    >
      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', whiteSpace: 'nowrap' }}>
        {formatDate(i.invoice_date)}
      </span>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-on-surface)', fontWeight: 500, whiteSpace: 'nowrap' }}>
        {i.number ?? <span style={entwurfChipStyle}>Entwurf</span>}
      </span>
      <span style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '0.9rem', color: 'var(--color-on-surface)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {i.subject || '(Kein Betreff)'}
      </span>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {(i as DjInvoice & { customer_name?: string; customer_org?: string }).customer_name ||
         (i as DjInvoice & { customer_name?: string; customer_org?: string }).customer_org || '—'}
      </span>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: isOverdue ? 'var(--color-error)' : 'var(--color-on-surface-variant)', whiteSpace: 'nowrap' }}>
        {i.due_date ? formatDate(i.due_date) : '—'}
      </span>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-on-surface)', textAlign: 'right', whiteSpace: 'nowrap' }}>
        {formatCurrency(i.total_gross)}
      </span>
      <span style={{ display: 'inline-block', padding: '0.2rem 0.625rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600, fontFamily: 'var(--font-body)', background: statusStyle.bg, color: statusStyle.color, whiteSpace: 'nowrap' }}>
        {statusStyle.label}
      </span>
      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }} onClick={ev => ev.stopPropagation()}>
        {isDraft && (
          <>
            <button type="button" style={iconBtnStyle} title="Bearbeiten" onClick={ev => { ev.stopPropagation(); onNavigate(); }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>edit</span>
            </button>
            <button type="button" style={iconBtnStyle} title="Finalisieren" onClick={ev => { ev.stopPropagation(); onFinalize(); }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>check_circle</span>
            </button>
          </>
        )}
        {isUnpaid && (
          <>
            <button type="button" style={iconBtnStyle} title="Anzeigen" onClick={ev => { ev.stopPropagation(); onNavigate(); }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>visibility</span>
            </button>
            <button type="button" style={{ ...iconBtnStyle, color: 'var(--color-secondary)' }} title="Als bezahlt markieren" onClick={ev => { ev.stopPropagation(); onMarkPaid(); }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>payments</span>
            </button>
          </>
        )}
        {isPaidOrCancelled && (
          <button type="button" style={iconBtnStyle} title="Anzeigen" onClick={ev => { ev.stopPropagation(); onNavigate(); }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>lock</span>
          </button>
        )}
      </div>
    </div>
  );
}

export function DjInvoicesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number | 0>(currentYear);
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | ''>('');
  const today = new Date().toISOString().slice(0, 10);

  const { data: allInvoices = [], isLoading } = useQuery<DjInvoice[]>({
    queryKey: ['dj-invoices', selectedYear],
    queryFn: () => fetchDjInvoices(selectedYear === 0 ? {} : { year: selectedYear }),
  });

  const finalizeMut = useMutation({
    mutationFn: (id: number) => finalizeDjInvoice(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dj-invoices'] }),
  });

  const payMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { payment_date: string; amount: number } }) =>
      payDjInvoice(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dj-invoices'] }),
  });

  const filtered = useMemo(() => {
    if (statusFilter === 'ueberfaellig') {
      return allInvoices.filter(i =>
        i.due_date && i.due_date < today && i.paid_amount < i.total_gross && i.status !== 'storniert'
      );
    }
    if (statusFilter) return allInvoices.filter(i => i.status === statusFilter);
    return allInvoices;
  }, [allInvoices, statusFilter, today]);

  const kpiOffen        = allInvoices.filter(i => i.status === 'offen' || i.status === 'teilbezahlt').length;
  const kpiBezahlt      = allInvoices.filter(i => i.status === 'bezahlt').length;
  const kpiUeberfaellig = allInvoices.filter(i =>
    i.due_date && i.due_date < today && i.paid_amount < i.total_gross &&
    i.status !== 'storniert' && i.status !== 'bezahlt'
  ).length;
  const kpiStorniert    = allInvoices.filter(i => i.status === 'storniert').length;
  const yearOptions     = [0, currentYear - 3, currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

  const activeInvoices  = allInvoices.filter(i => i.status !== 'storniert');
  const umsatzNetto     = activeInvoices.reduce((s, i) => s + (i.subtotal_net ?? 0), 0);
  const mwstTotal       = activeInvoices.reduce((s, i) => s + (i.tax_total ?? 0), 0);
  const umsatzBrutto    = activeInvoices.reduce((s, i) => s + i.total_gross, 0);
  const showMwst        = selectedYear === 0 || selectedYear >= 2026;

  return (
    <PageWrapper>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2.5rem 2rem', position: 'relative' }}>
        {/* Ambient glows */}
        <div aria-hidden style={{ position: 'absolute', top: 0, right: 0, width: '600px', height: '600px', background: 'radial-gradient(circle at top right, rgba(148,170,255,0.06) 0%, transparent 60%)', pointerEvents: 'none', zIndex: 0 }} />
        <div aria-hidden style={{ position: 'absolute', bottom: 0, left: '30%', width: '500px', height: '400px', background: 'radial-gradient(circle at bottom left, rgba(92,253,128,0.04) 0%, transparent 60%)', pointerEvents: 'none', zIndex: 0 }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '2.5rem' }}>
            <div>
              <h1 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: '3rem', letterSpacing: '-0.02em', color: 'var(--color-primary)', margin: 0, lineHeight: 1.1, textTransform: 'uppercase' }}>
                RECHNUNGEN
              </h1>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
              <select
                value={selectedYear}
                onChange={ev => setSelectedYear(Number(ev.target.value))}
                style={{ background: 'var(--color-surface-variant)', color: 'var(--color-on-surface)', border: 'none', borderRadius: '0.5rem', padding: '0.5rem 0.875rem', fontSize: '0.875rem', fontFamily: 'var(--font-body)', cursor: 'pointer', outline: 'none' }}
              >
                {yearOptions.map(y => <option key={y} value={y}>{y === 0 ? 'Alle Jahre' : y}</option>)}
              </select>
              <button
                onClick={() => navigate('/dj/invoices/new')}
                style={{ background: 'linear-gradient(135deg, #94aaff 0%, #5cfd80 100%)', color: '#060e20', border: 'none', borderRadius: '0.75rem', padding: '0.625rem 1.25rem', fontSize: '0.875rem', fontFamily: 'Manrope, sans-serif', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.375rem', boxShadow: '0 0 16px rgba(148,170,255,0.3)' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
                Neue Rechnung
              </button>
            </div>
          </div>

          {/* KPI tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            {[
              { label: 'Offen', value: kpiOffen, icon: 'schedule', color: 'var(--color-primary)' },
              { label: 'Bezahlt', value: kpiBezahlt, icon: 'check_circle', color: 'var(--color-secondary)' },
              { label: 'Überfällig', value: kpiUeberfaellig, icon: 'warning', color: 'var(--color-error)' },
              { label: 'Storniert', value: kpiStorniert, icon: 'block', color: '#94a3b8' },
            ].map(kpi => (
              <div key={kpi.label} style={{ background: 'var(--color-surface-variant)', borderRadius: '0.75rem', padding: '1rem 1.25rem', position: 'relative' }}>
                <span className="material-symbols-outlined" style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', fontSize: '28px', color: kpi.color, opacity: 0.7 }}>
                  {kpi.icon}
                </span>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)', margin: 0, marginBottom: '0.375rem' }}>
                  {kpi.label}
                </p>
                <p style={{ fontFamily: 'Manrope, sans-serif', fontSize: '2rem', fontWeight: 700, color: kpi.color, lineHeight: 1, margin: 0 }}>
                  {isLoading ? '–' : kpi.value}
                </p>
              </div>
            ))}
          </div>

          {/* Umsatz-Zusammenfassung */}
          {!isLoading && allInvoices.length > 0 && (
            <div style={{ background: 'var(--color-surface-variant)', borderRadius: '0.75rem', padding: '1rem 1.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '2.5rem', flexWrap: 'wrap' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'var(--color-secondary)', opacity: 0.8 }}>payments</span>
              <div>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)', margin: 0, marginBottom: '0.2rem' }}>Netto</p>
                <p style={{ fontFamily: 'Manrope, sans-serif', fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: 0 }}>{formatCurrency(umsatzNetto)}</p>
              </div>
              {showMwst && (
                <>
                  <div style={{ color: 'var(--color-on-surface-variant)', fontSize: '1.2rem', opacity: 0.4 }}>+</div>
                  <div>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)', margin: 0, marginBottom: '0.2rem' }}>MwSt</p>
                    <p style={{ fontFamily: 'Manrope, sans-serif', fontSize: '1.25rem', fontWeight: 700, color: '#fbbf24', margin: 0 }}>{formatCurrency(mwstTotal)}</p>
                  </div>
                  <div style={{ color: 'var(--color-on-surface-variant)', fontSize: '1.2rem', opacity: 0.4 }}>=</div>
                </>
              )}
              <div>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)', margin: 0, marginBottom: '0.2rem' }}>Brutto</p>
                <p style={{ fontFamily: 'Manrope, sans-serif', fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-secondary)', margin: 0 }}>{formatCurrency(umsatzBrutto)}</p>
              </div>
              {selectedYear === 0 && (
                <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', opacity: 0.7 }}>
                  Alle Jahre · ohne Storno
                </div>
              )}
            </div>
          )}

          {/* Filter pills */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            {FILTER_TABS.map(tab => {
              const active = statusFilter === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setStatusFilter(tab.value)}
                  style={{
                    background: active ? 'var(--color-primary)' : 'var(--color-surface-variant)',
                    border: 'none',
                    borderRadius: '999px',
                    color: active ? 'var(--color-on-primary)' : 'var(--color-on-surface-variant)',
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

          {/* List */}
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.9rem' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem', opacity: 0.4 }}>hourglass_empty</span>
              Lade...
            </div>
          ) : (
            <div style={{ background: 'var(--color-surface-variant)', borderRadius: '0.75rem', overflow: 'hidden' }}>
              {filtered.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '110px 90px 1fr 1fr 120px 110px 110px 120px', gap: '0.75rem', padding: '0.75rem 1.25rem', borderBottom: '1px solid rgba(148,170,255,0.15)', background: 'rgba(255,255,255,0.03)' }}>
                  {['Datum', 'Nr.', 'Betreff', 'Kunde', 'Fällig am', 'Brutto', 'Status', ''].map((col, idx) => (
                    <span key={idx} style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {col}
                    </span>
                  ))}
                </div>
              )}
              {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 2rem', color: 'var(--color-on-surface-variant)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '3rem', marginBottom: '1rem', display: 'block', opacity: 0.4 }}>receipt_long</span>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', margin: 0 }}>Keine Rechnungen gefunden.</p>
                </div>
              ) : (
                filtered.map((inv, idx) => (
                  <InvoiceRow
                    key={inv.id}
                    invoice={inv}
                    isFirst={idx === 0}
                    today={today}
                    onNavigate={() => navigate(`/dj/invoices/${inv.id}`)}
                    onFinalize={() => {
                      if (window.confirm('Rechnung finalisieren? Sie kann danach nicht mehr bearbeitet oder gelöscht werden.')) {
                        finalizeMut.mutate(inv.id);
                      }
                    }}
                    onMarkPaid={() => {
                      const rest = inv.total_gross - inv.paid_amount;
                      if (window.confirm(`Restbetrag von ${formatCurrency(rest)} als bezahlt markieren?`)) {
                        payMut.mutate({ id: inv.id, data: { payment_date: new Date().toISOString().slice(0, 10), amount: rest } });
                      }
                    }}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </PageWrapper>
  );
}
