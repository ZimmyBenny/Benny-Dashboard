import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useDraggableModal } from '../../hooks/useDraggableModal';
import {
  fetchDjAccountingSummary,
  fetchDjAccountingPayments,
  fetchDjExpenses,
  createDjExpense,
  deleteDjExpense,
  DjExpense,
  DjPayment,
} from '../../api/dj.api';
import { formatCurrency, formatDate } from '../../lib/format';

const DISCLAIMER =
  'Diese Auflistung dient ausschließlich als Orientierungshilfe für die eigene Buchhaltung und ersetzt keine Steuerberatung. Vor Einreichung beim Finanzamt bitte mit dem Steuerberater abstimmen.';

const YEARS = [2024, 2025, 2026];
const CATEGORIES = ['fahrt', 'equipment', 'marketing', 'software', 'sonstiges', 'verpflegung'] as const;
type Category = (typeof CATEGORIES)[number];

interface ExpenseForm {
  expense_date: string;
  category: Category;
  description: string;
  amount_gross: string;
  tax_rate: string;
}

const EMPTY_FORM: ExpenseForm = { expense_date: '', category: 'sonstiges', description: '', amount_gross: '', tax_rate: '19' };

type Tab = 'uebersicht' | 'einnahmen' | 'ausgaben';

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(148,170,255,0.2)',
  borderRadius: '0.5rem',
  padding: '0.5rem 0.75rem',
  fontFamily: 'var(--font-body)',
  fontSize: '0.875rem',
  color: 'var(--color-on-surface)',
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
};

const gradientBtn: React.CSSProperties = {
  background: 'linear-gradient(135deg, #94aaff 0%, #5cfd80 100%)',
  color: '#060e20',
  border: 'none',
  borderRadius: '0.5rem',
  padding: '0.5rem 1.25rem',
  fontFamily: 'var(--font-body)',
  fontWeight: 700,
  fontSize: '0.875rem',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '0.375rem',
  boxShadow: '0 0 16px rgba(148,170,255,0.3)',
};

export function DjAccountingPage() {
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [tab, setTab] = useState<Tab>('uebersicht');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ExpenseForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<DjExpense | null>(null);

  const { onMouseDown, modalStyle, headerStyle } = useDraggableModal();
  const queryClient = useQueryClient();

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['dj-accounting-summary', year],
    queryFn: () => fetchDjAccountingSummary(year),
  });

  const { data: payments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ['dj-accounting-payments', year],
    queryFn: () => fetchDjAccountingPayments(year),
    enabled: tab === 'einnahmen',
  });

  const { data: expenses = [], isLoading: expensesLoading } = useQuery({
    queryKey: ['dj-expenses', year],
    queryFn: () => fetchDjExpenses({ year }),
    enabled: tab === 'ausgaben',
  });

  const createMutation = useMutation({
    mutationFn: createDjExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dj-expenses'] });
      queryClient.invalidateQueries({ queryKey: ['dj-accounting-summary'] });
      setOpen(false); setForm(EMPTY_FORM); setFormError('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteDjExpense(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dj-expenses'] });
      queryClient.invalidateQueries({ queryKey: ['dj-accounting-summary'] });
      setDeleteTarget(null);
    },
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setForm(EMPTY_FORM); setFormError(''); } };
    if (open) window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.expense_date || !form.description || !form.amount_gross) {
      setFormError('Bitte alle Pflichtfelder ausfüllen.'); return;
    }
    const amount = parseFloat(form.amount_gross);
    if (isNaN(amount) || amount <= 0) { setFormError('Bruttobetrag muss größer als 0 sein.'); return; }
    setFormError('');
    createMutation.mutate({ expense_date: form.expense_date, category: form.category, description: form.description, amount_gross: amount, tax_rate: parseFloat(form.tax_rate) });
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'uebersicht', label: 'Übersicht' },
    { key: 'einnahmen', label: 'Einnahmen' },
    { key: 'ausgaben', label: 'Ausgaben' },
  ];

  return (
    <PageWrapper>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2.5rem 2rem', position: 'relative' }}>

        {/* Ambient Glow */}
        <div style={{
          position: 'absolute', top: '-80px', right: '5%',
          width: '500px', height: '500px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(92,253,128,0.05) 0%, transparent 70%)',
          pointerEvents: 'none', zIndex: 0,
        }} />
        <div style={{
          position: 'absolute', top: '100px', left: '-80px',
          width: '400px', height: '400px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(148,170,255,0.05) 0%, transparent 70%)',
          pointerEvents: 'none', zIndex: 0,
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>

          {/* Page Header */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <p style={{
                fontFamily: 'var(--font-body)', fontSize: '0.6875rem', fontWeight: 600,
                color: '#5cfd80', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 0.375rem',
              }}>
                FINANCIAL CONDUIT
              </p>
              <h1 style={{
                fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '2.25rem',
                color: 'var(--color-on-surface)', margin: 0, letterSpacing: '-0.02em', lineHeight: 1,
              }}>
                Buchhaltung
              </h1>
              <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.875rem', margin: '0.5rem 0 0' }}>
                Einnahmen, Ausgaben, MwSt-Übersicht und EÜR-Vorbereitung
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <select
                value={year}
                onChange={e => setYear(Number(e.target.value))}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  color: 'var(--color-on-surface)',
                  border: '1px solid rgba(148,170,255,0.2)',
                  borderRadius: '0.5rem',
                  padding: '0.5rem 0.75rem',
                  fontFamily: 'var(--font-body)', fontSize: '0.875rem', cursor: 'pointer',
                }}
              >
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              {tab === 'ausgaben' && (
                <button onClick={() => { setForm(EMPTY_FORM); setFormError(''); setOpen(true); }} style={gradientBtn}>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
                  Neue Ausgabe
                </button>
              )}
            </div>
          </div>

          {/* KPI Tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            <KpiTile label="EINNAHMEN" value={summaryLoading ? '…' : formatCurrency(summary?.revenue ?? 0)} accent="#94aaff" icon="trending_up" />
            <KpiTile label="AUSGABEN" value={summaryLoading ? '…' : formatCurrency(summary?.expenses ?? 0)} accent="var(--color-error)" icon="trending_down" />
            <KpiTile
              label="GEWINN"
              value={summaryLoading ? '…' : formatCurrency(summary?.profit ?? 0)}
              accent={(summary?.profit ?? 0) >= 0 ? '#5cfd80' : 'var(--color-error)'}
              icon="account_balance"
            />
            <KpiTile
              label="OFFENE FORDERUNGEN"
              value={summaryLoading ? '…' : formatCurrency(summary?.unpaid_total ?? 0)}
              accent="#b794f4"
              icon="hourglass_top"
              sub={!summaryLoading && (summary?.unpaid_count ?? 0) > 0 ? `${summary.unpaid_count} Rechnungen` : undefined}
            />
          </div>

          {/* Disclaimer */}
          <div style={{
            background: 'rgba(148,170,255,0.06)', border: '1px solid rgba(148,170,255,0.12)',
            borderRadius: '0.75rem', padding: '0.75rem 1rem', marginBottom: '1.5rem',
            display: 'flex', gap: '0.625rem', alignItems: 'flex-start',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--color-primary)', flexShrink: 0, marginTop: '0.1rem' }}>info</span>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.775rem', color: 'var(--color-on-surface-variant)', margin: 0 }}>{DISCLAIMER}</p>
          </div>

          {/* Tab Bar */}
          <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  background: 'none', border: 'none',
                  borderBottom: tab === t.key ? '2px solid #94aaff' : '2px solid transparent',
                  padding: '0.625rem 1.25rem',
                  fontFamily: 'var(--font-body)', fontSize: '0.875rem',
                  fontWeight: tab === t.key ? 700 : 400,
                  color: tab === t.key ? '#94aaff' : 'var(--color-on-surface-variant)',
                  cursor: 'pointer', marginBottom: '-1px',
                  transition: 'color 0.15s, border-color 0.15s',
                  letterSpacing: tab === t.key ? '0.01em' : 0,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Übersicht Tab */}
          {tab === 'uebersicht' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
              {/* Jahres-Summary */}
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem', padding: '1.5rem' }}>
                <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '1rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: '0 0 1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#94aaff' }}>bar_chart</span>
                  Jahres-Übersicht {year}
                </h2>
                {summaryLoading ? (
                  <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }}>Lade…</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                    {[
                      { label: 'Einnahmen', value: summary?.revenue ?? 0, color: '#94aaff' },
                      { label: 'Ausgaben', value: summary?.expenses ?? 0, color: 'var(--color-error)' },
                      { label: 'Gewinn', value: summary?.profit ?? 0, color: (summary?.profit ?? 0) >= 0 ? '#5cfd80' : 'var(--color-error)' },
                    ].map(row => (
                      <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.875rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>{row.label}</span>
                        <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, color: row.color, fontSize: '1.1rem' }}>{formatCurrency(row.value)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* MwSt */}
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem', padding: '1.5rem' }}>
                <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '1rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: '0 0 1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#b794f4' }}>receipt</span>
                  Umsatzsteuer {year}
                </h2>
                {summaryLoading ? (
                  <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }}>Lade…</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                    {[
                      { label: 'Eingenommene MwSt', value: summary?.vat_collected ?? 0, color: 'var(--color-on-surface)' },
                      { label: 'Vorsteuer (Ausgaben)', value: summary?.vat_input ?? 0, color: 'var(--color-on-surface)' },
                      { label: 'MwSt-Zahllast', value: summary?.vat_liability ?? 0, color: (summary?.vat_liability ?? 0) >= 0 ? 'var(--color-error)' : '#5cfd80' },
                    ].map(row => (
                      <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.875rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>{row.label}</span>
                        <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, color: row.color, fontSize: '1.1rem' }}>{formatCurrency(row.value)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Einnahmen Tab */}
          {tab === 'einnahmen' && (
            <div>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginBottom: '1rem' }}>
                {paymentsLoading ? 'Lade…' : `${payments.length} bezahlte Rechnungen`}
              </p>
              {paymentsLoading ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-on-surface-variant)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>hourglass_empty</span>
                  Lade Einnahmen…
                </div>
              ) : payments.length === 0 ? (
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem', padding: '4rem', textAlign: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: '#94aaff', display: 'block', marginBottom: '0.75rem', opacity: 0.4 }}>payments</span>
                  <p style={{ color: 'var(--color-on-surface-variant)', margin: 0 }}>Keine Einnahmen für {year}.</p>
                </div>
              ) : (
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                        {['Datum', 'Rechnungs-Nr.', 'Kunde', 'Betrag'].map((h, i) => (
                          <th key={h} style={{
                            padding: '0.75rem 1rem', textAlign: i === 3 ? 'right' : 'left',
                            fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.7rem',
                            color: 'var(--color-on-surface-variant)', letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(payments as DjPayment[]).map((p, i) => (
                        <tr
                          key={p.id}
                          style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none', transition: 'background 0.15s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(148,170,255,0.04)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-on-surface)' }}>{formatDate(p.payment_date)}</td>
                          <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{p.invoice_number ?? '–'}</td>
                          <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-on-surface)' }}>{p.customer_name ?? p.customer_org ?? '–'}</td>
                          <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: '#5cfd80', fontWeight: 700, textAlign: 'right' }}>{formatCurrency(p.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Ausgaben Tab */}
          {tab === 'ausgaben' && (
            <div>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginBottom: '1rem' }}>
                {expensesLoading ? 'Lade…' : `${expenses.length} Ausgaben`}
              </p>
              {expensesLoading ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-on-surface-variant)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>hourglass_empty</span>
                  Lade Ausgaben…
                </div>
              ) : expenses.length === 0 ? (
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem', padding: '4rem', textAlign: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: '#94aaff', display: 'block', marginBottom: '0.75rem', opacity: 0.4 }}>receipt_long</span>
                  <p style={{ color: 'var(--color-on-surface-variant)', margin: 0 }}>Keine Ausgaben für {year}.</p>
                </div>
              ) : (
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                        {['Datum', 'Kategorie', 'Beschreibung', 'Brutto', 'MwSt', 'Netto', ''].map((h, i) => (
                          <th key={i} style={{
                            padding: '0.75rem 1rem', textAlign: [3, 4, 5].includes(i) ? 'right' : i === 6 ? 'center' : 'left',
                            fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.7rem',
                            color: 'var(--color-on-surface-variant)', letterSpacing: '0.08em', textTransform: 'uppercase',
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(expenses as DjExpense[]).map((e, i) => (
                        <tr
                          key={e.id}
                          style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none', transition: 'background 0.15s' }}
                          onMouseEnter={ev => (ev.currentTarget.style.background = 'rgba(148,170,255,0.04)')}
                          onMouseLeave={ev => (ev.currentTarget.style.background = 'transparent')}
                        >
                          <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-on-surface)', whiteSpace: 'nowrap' }}>{formatDate(e.expense_date)}</td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <span style={{
                              background: 'rgba(148,170,255,0.12)', color: '#94aaff',
                              borderRadius: '0.375rem', padding: '0.125rem 0.5rem',
                              fontSize: '0.7rem', fontWeight: 600, textTransform: 'capitalize',
                            }}>{e.category}</span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-on-surface)' }}>{e.description}</td>
                          <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-on-surface)', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatCurrency(e.amount_gross)}</td>
                          <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', textAlign: 'right' }}>{e.tax_rate} %</td>
                          <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-on-surface)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {e.amount_net != null ? formatCurrency(e.amount_net) : '–'}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                            <button
                              onClick={() => setDeleteTarget(e)}
                              title="Ausgabe löschen"
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: 'var(--color-error)', padding: '0.25rem', borderRadius: '0.25rem',
                                display: 'inline-flex', alignItems: 'center',
                                opacity: 0.6, transition: 'opacity 0.15s',
                              }}
                              onMouseEnter={ev => ((ev.currentTarget as HTMLElement).style.opacity = '1')}
                              onMouseLeave={ev => ((ev.currentTarget as HTMLElement).style.opacity = '0.6')}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>delete</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Modal: Neue Ausgabe */}
      {open && (
        <>
          <div
            onClick={() => { setOpen(false); setForm(EMPTY_FORM); setFormError(''); }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40 }}
          />
          <div
            data-draggable-modal
            style={{
              position: 'fixed', top: 80, right: 32, width: '420px',
              background: 'var(--color-surface-container)',
              border: '1px solid rgba(148,170,255,0.15)',
              borderRadius: '0.75rem',
              boxShadow: '0 8px 40px rgba(0,0,0,0.5), 0 0 60px rgba(148,170,255,0.05)',
              zIndex: 50, ...modalStyle,
            }}
          >
            <div
              onMouseDown={onMouseDown}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '1rem 1.25rem', borderBottom: '1px solid rgba(148,170,255,0.12)',
                borderRadius: '0.75rem 0.75rem 0 0', ...headerStyle,
              }}
            >
              <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1rem', color: 'var(--color-on-surface)' }}>Neue Ausgabe</span>
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={() => { setOpen(false); setForm(EMPTY_FORM); setFormError(''); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-on-surface-variant)', padding: '0.25rem', display: 'flex', alignItems: 'center' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <FormField label="Datum *">
                <input type="date" value={form.expense_date} onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))} style={inputStyle} required />
              </FormField>
              <FormField label="Kategorie *">
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as Category }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                  {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>)}
                </select>
              </FormField>
              <FormField label="Beschreibung *">
                <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="z. B. Software-Lizenz" style={inputStyle} required />
              </FormField>
              <FormField label="Bruttobetrag (€) *">
                <input type="number" step="0.01" min="0" value={form.amount_gross} onChange={e => setForm(f => ({ ...f, amount_gross: e.target.value }))} placeholder="0,00" style={inputStyle} required />
              </FormField>
              <FormField label="MwSt-Satz">
                <select value={form.tax_rate} onChange={e => setForm(f => ({ ...f, tax_rate: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="0">0 %</option>
                  <option value="7">7 %</option>
                  <option value="19">19 %</option>
                </select>
              </FormField>

              {formError && <p style={{ color: 'var(--color-error)', fontSize: '0.8125rem', margin: 0 }}>{formError}</p>}

              <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.25rem' }}>
                <button
                  type="button"
                  onClick={() => { setOpen(false); setForm(EMPTY_FORM); setFormError(''); }}
                  style={{
                    flex: 1, background: 'none', border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '0.5rem', padding: '0.5rem 1rem',
                    fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-on-surface)', cursor: 'pointer',
                  }}
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  style={{ ...gradientBtn, flex: 1, justifyContent: 'center', opacity: createMutation.isPending ? 0.7 : 1 }}
                >
                  {createMutation.isPending ? 'Speichere…' : 'Speichern'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Confirm-Dialog Löschen */}
      {deleteTarget && (
        <>
          <div onClick={() => setDeleteTarget(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 60 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'var(--color-surface-container)',
            border: '1px solid rgba(255,80,80,0.2)',
            borderRadius: '0.75rem', padding: '1.5rem', width: '360px', maxWidth: '90vw',
            zIndex: 70, boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
          }}>
            <h3 style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1.125rem', color: 'var(--color-on-surface)', margin: '0 0 0.75rem' }}>
              Ausgabe löschen?
            </h3>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', margin: '0 0 0.375rem' }}>
              {formatDate(deleteTarget.expense_date)} — {formatCurrency(deleteTarget.amount_gross)}
            </p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-on-surface)', fontWeight: 500, margin: '0 0 1.5rem' }}>
              {deleteTarget.description}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => setDeleteTarget(null)}
                style={{
                  flex: 1, background: 'none', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '0.5rem', padding: '0.625rem 1rem',
                  fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-on-surface)', cursor: 'pointer',
                }}
              >
                Abbrechen
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                style={{
                  flex: 1, background: 'var(--color-error)', color: '#fff', border: 'none',
                  borderRadius: '0.5rem', padding: '0.625rem 1rem',
                  fontFamily: 'var(--font-body)', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
                  opacity: deleteMutation.isPending ? 0.7 : 1,
                }}
              >
                {deleteMutation.isPending ? 'Lösche…' : 'Löschen'}
              </button>
            </div>
          </div>
        </>
      )}
    </PageWrapper>
  );
}

// ── Helper Components ──────────────────────────────────────────────────────────

function KpiTile({ label, value, accent, icon, sub }: { label: string; value: string; accent?: string; icon?: string; sub?: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem', padding: '1.25rem 1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.5rem' }}>
        {icon && <span className="material-symbols-outlined" style={{ fontSize: '15px', color: accent ?? 'var(--color-on-surface-variant)' }}>{icon}</span>}
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: '0.65rem', fontWeight: 700,
          color: 'var(--color-on-surface-variant)', letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0,
        }}>{label}</p>
      </div>
      <p style={{ fontFamily: 'var(--font-headline)', fontSize: '1.875rem', fontWeight: 800, color: accent ?? 'var(--color-on-surface)', margin: 0, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', margin: '0.375rem 0 0' }}>{sub}</p>}
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', fontWeight: 500 }}>{label}</span>
      {children}
    </label>
  );
}
