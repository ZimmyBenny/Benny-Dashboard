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

// ── Konstanten ──────────────────────────────────────────────────────────────────

const DISCLAIMER =
  'Diese Auflistung dient ausschließlich als Orientierungshilfe für die eigene Buchhaltung und ersetzt keine Steuerberatung. Vor Einreichung beim Finanzamt bitte mit dem Steuerberater abstimmen.';

const YEARS = [2024, 2025, 2026];
const CATEGORIES = [
  'fahrt',
  'equipment',
  'marketing',
  'software',
  'sonstiges',
  'verpflegung',
] as const;
type Category = (typeof CATEGORIES)[number];

// ── Formular ────────────────────────────────────────────────────────────────────

interface ExpenseForm {
  expense_date: string;
  category: Category;
  description: string;
  amount_gross: string;
  tax_rate: string;
}

const EMPTY_FORM: ExpenseForm = {
  expense_date: '',
  category: 'sonstiges',
  description: '',
  amount_gross: '',
  tax_rate: '19',
};

// ── Styles ──────────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: 'var(--color-surface-container-high)',
  border: '1px solid var(--color-outline-variant)',
  borderRadius: '0.5rem',
  padding: '0.5rem 0.75rem',
  fontFamily: 'var(--font-body)',
  fontSize: '0.875rem',
  color: 'var(--color-on-surface)',
  width: '100%',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.75rem',
  fontWeight: 600,
  color: 'var(--color-on-surface-variant)',
  marginBottom: '0.375rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const thStyle: React.CSSProperties = {
  padding: '0.75rem 1rem',
  textAlign: 'left',
  fontWeight: 600,
  fontSize: '0.75rem',
  color: 'var(--color-on-surface-variant)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '0.75rem 1rem',
  fontSize: '0.875rem',
  color: 'var(--color-on-surface)',
  borderTop: '1px solid var(--color-outline-variant)',
};

// ── Komponente ──────────────────────────────────────────────────────────────────

type Tab = 'uebersicht' | 'einnahmen' | 'ausgaben';

export function DjAccountingPage() {
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [tab, setTab] = useState<Tab>('uebersicht');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ExpenseForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<DjExpense | null>(null);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  const { onMouseDown, modalStyle, headerStyle } = useDraggableModal();
  const queryClient = useQueryClient();

  // ── Queries ──────────────────────────────────────────────────────────────────

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

  // ── Mutations ────────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: createDjExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dj-expenses'] });
      queryClient.invalidateQueries({ queryKey: ['dj-accounting-summary'] });
      setOpen(false);
      setForm(EMPTY_FORM);
      setFormError('');
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

  // ── Escape-Handler ───────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setForm(EMPTY_FORM);
        setFormError('');
      }
    };
    if (open) window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  // ── Submit ───────────────────────────────────────────────────────────────────

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.expense_date || !form.description || !form.amount_gross) {
      setFormError('Bitte alle Pflichtfelder ausfüllen.');
      return;
    }
    const amount = parseFloat(form.amount_gross);
    if (isNaN(amount) || amount <= 0) {
      setFormError('Bruttobetrag muss größer als 0 sein.');
      return;
    }
    setFormError('');
    createMutation.mutate({
      expense_date: form.expense_date,
      category: form.category,
      description: form.description,
      amount_gross: amount,
      tax_rate: parseFloat(form.tax_rate),
    });
  }

  // ── Tabs-Konfiguration ───────────────────────────────────────────────────────

  const tabs: { key: Tab; label: string }[] = [
    { key: 'uebersicht', label: 'Übersicht' },
    { key: 'einnahmen', label: 'Einnahmen' },
    { key: 'ausgaben', label: 'Ausgaben' },
  ];

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <PageWrapper>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2.5rem 2rem' }}>

        {/* Seitenheader */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1.75rem', color: 'var(--color-on-surface)', marginBottom: '0.25rem', margin: '0 0 0.25rem' }}>
              Buchhaltung
            </h1>
            <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.875rem', margin: 0 }}>
              Einnahmen, Ausgaben, MwSt-Übersicht und EÜR-Vorbereitung
            </p>
          </div>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            style={{
              ...inputStyle,
              width: 'auto',
              padding: '0.5rem 2rem 0.5rem 0.75rem',
              appearance: 'none',
              backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\' viewBox=\'0 0 24 24\' fill=\'%23888\'%3E%3Cpath d=\'M7 10l5 5 5-5z\'/%3E%3C/svg%3E")',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 0.5rem center',
              cursor: 'pointer',
            }}
          >
            {YEARS.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {/* Disclaimer-Banner */}
        <div style={{ background: 'rgba(148,170,255,0.08)', borderRadius: '0.75rem', padding: '0.875rem 1rem', marginBottom: '2rem', display: 'flex', gap: '0.625rem', alignItems: 'flex-start' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--color-primary)', flexShrink: 0, marginTop: '0.1rem' }}>info</span>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: 0 }}>{DISCLAIMER}</p>
        </div>

        {/* KPI-Karten */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          {/* Einnahmen */}
          <div style={{ background: 'var(--color-surface-container)', borderRadius: '0.75rem', padding: '1.25rem' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', margin: '0 0 0.375rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Einnahmen</p>
            <p style={{ fontFamily: 'var(--font-headline)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-primary)', margin: 0 }}>
              {summaryLoading ? '…' : formatCurrency(summary?.revenue ?? 0)}
            </p>
          </div>
          {/* Ausgaben */}
          <div style={{ background: 'var(--color-surface-container)', borderRadius: '0.75rem', padding: '1.25rem' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', margin: '0 0 0.375rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Ausgaben</p>
            <p style={{ fontFamily: 'var(--font-headline)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-error)', margin: 0 }}>
              {summaryLoading ? '…' : formatCurrency(summary?.expenses ?? 0)}
            </p>
          </div>
          {/* Gewinn */}
          <div style={{ background: 'var(--color-surface-container)', borderRadius: '0.75rem', padding: '1.25rem' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', margin: '0 0 0.375rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Gewinn</p>
            <p style={{
              fontFamily: 'var(--font-headline)', fontSize: '1.5rem', fontWeight: 700,
              color: (summary?.profit ?? 0) >= 0 ? 'var(--color-primary)' : 'var(--color-error)',
              margin: 0,
            }}>
              {summaryLoading ? '…' : formatCurrency(summary?.profit ?? 0)}
            </p>
          </div>
          {/* Offene Forderungen */}
          <div style={{ background: 'var(--color-surface-container)', borderRadius: '0.75rem', padding: '1.25rem' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', margin: '0 0 0.375rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Offene Forderungen</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <p style={{ fontFamily: 'var(--font-headline)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-secondary)', margin: 0 }}>
                {summaryLoading ? '…' : formatCurrency(summary?.unpaid_total ?? 0)}
              </p>
              {!summaryLoading && (summary?.unpaid_count ?? 0) > 0 && (
                <span style={{
                  background: 'rgba(148,170,255,0.18)',
                  color: 'var(--color-secondary)',
                  borderRadius: '1rem',
                  padding: '0.125rem 0.5rem',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}>
                  {summary.unpaid_count}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tab-Bar */}
        <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--color-outline-variant)' }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: tab === t.key ? '2px solid var(--color-primary)' : '2px solid transparent',
                padding: '0.625rem 1rem',
                fontFamily: 'var(--font-body)',
                fontSize: '0.875rem',
                fontWeight: tab === t.key ? 600 : 400,
                color: tab === t.key ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
                cursor: 'pointer',
                marginBottom: '-1px',
                transition: 'color 0.15s, border-color 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab-Inhalt */}
        {tab === 'uebersicht' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
            {/* Jahres-Summary-Karte */}
            <div style={{ background: 'var(--color-surface-container)', borderRadius: '0.75rem', padding: '1.5rem' }}>
              <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '1rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: '0 0 1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'var(--color-primary)' }}>bar_chart</span>
                Jahres-Übersicht {year}
              </h2>
              {summaryLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px', animation: 'spin 1s linear infinite' }}>hourglass_empty</span>
                  Lade…
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                  {[
                    { label: 'Einnahmen', value: summary?.revenue ?? 0, color: 'var(--color-primary)' },
                    { label: 'Ausgaben', value: summary?.expenses ?? 0, color: 'var(--color-error)' },
                    { label: 'Gewinn', value: summary?.profit ?? 0, color: (summary?.profit ?? 0) >= 0 ? 'var(--color-primary)' : 'var(--color-error)' },
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-outline-variant)', paddingBottom: '0.875rem' }}>
                      <span style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>{row.label}</span>
                      <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, color: row.color, fontSize: '1rem' }}>{formatCurrency(row.value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* MwSt-Karte */}
            <div style={{ background: 'var(--color-surface-container)', borderRadius: '0.75rem', padding: '1.5rem' }}>
              <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '1rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: '0 0 1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'var(--color-secondary)' }}>receipt</span>
                Umsatzsteuer {year}
              </h2>
              {summaryLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>hourglass_empty</span>
                  Lade…
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                  {[
                    { label: 'Eingenommene MwSt', value: summary?.vat_collected ?? 0, color: 'var(--color-on-surface)' },
                    { label: 'Vorsteuer (Ausgaben)', value: summary?.vat_input ?? 0, color: 'var(--color-on-surface)' },
                    { label: 'MwSt-Zahllast', value: summary?.vat_liability ?? 0, color: (summary?.vat_liability ?? 0) >= 0 ? 'var(--color-error)' : 'var(--color-primary)' },
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-outline-variant)', paddingBottom: '0.875rem' }}>
                      <span style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>{row.label}</span>
                      <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, color: row.color, fontSize: '1rem' }}>{formatCurrency(row.value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'einnahmen' && (
          <div>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', marginBottom: '1rem' }}>
              {paymentsLoading ? 'Lade…' : `${payments.length} bezahlte Rechnungen`}
            </p>
            {paymentsLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-on-surface-variant)', fontSize: '0.875rem', padding: '2rem', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>hourglass_empty</span>
                Lade Einnahmen…
              </div>
            ) : payments.length === 0 ? (
              <div style={{ background: 'var(--color-surface-container)', borderRadius: '0.75rem', padding: '3rem', textAlign: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '0.75rem' }}>payments</span>
                <p style={{ color: 'var(--color-on-surface-variant)', margin: 0 }}>Keine Einnahmen für {year}.</p>
              </div>
            ) : (
              <div style={{ background: 'var(--color-surface-container)', borderRadius: '0.75rem', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: 'var(--color-surface-container-high)' }}>
                    <tr>
                      <th style={thStyle}>Datum</th>
                      <th style={thStyle}>Rechnungs-Nr.</th>
                      <th style={thStyle}>Kunde</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Betrag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(payments as DjPayment[]).map(p => (
                      <tr
                        key={p.id}
                        onMouseEnter={() => setHoveredRow(p.id)}
                        onMouseLeave={() => setHoveredRow(null)}
                        style={{ background: hoveredRow === p.id ? 'var(--color-surface-variant)' : 'transparent', transition: 'background 0.1s' }}
                      >
                        <td style={tdStyle}>{formatDate(p.payment_date)}</td>
                        <td style={{ ...tdStyle, fontFamily: 'var(--font-mono, monospace)', fontSize: '0.8125rem' }}>{p.invoice_number ?? '–'}</td>
                        <td style={tdStyle}>{p.customer_name ?? p.customer_org ?? '–'}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: 'var(--color-primary)' }}>{formatCurrency(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'ausgaben' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', margin: 0 }}>
                {expensesLoading ? 'Lade…' : `${expenses.length} Ausgaben`}
              </p>
              <button
                onClick={() => { setForm(EMPTY_FORM); setFormError(''); setOpen(true); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.375rem',
                  background: 'var(--color-primary)', color: 'var(--color-on-primary)',
                  border: 'none', borderRadius: '0.5rem', padding: '0.5rem 1rem',
                  fontFamily: 'var(--font-body)', fontSize: '0.875rem', fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
                Neue Ausgabe
              </button>
            </div>

            {expensesLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-on-surface-variant)', fontSize: '0.875rem', padding: '2rem', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>hourglass_empty</span>
                Lade Ausgaben…
              </div>
            ) : expenses.length === 0 ? (
              <div style={{ background: 'var(--color-surface-container)', borderRadius: '0.75rem', padding: '3rem', textAlign: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '0.75rem' }}>receipt_long</span>
                <p style={{ color: 'var(--color-on-surface-variant)', margin: 0 }}>Keine Ausgaben für {year}.</p>
              </div>
            ) : (
              <div style={{ background: 'var(--color-surface-container)', borderRadius: '0.75rem', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: 'var(--color-surface-container-high)' }}>
                    <tr>
                      <th style={thStyle}>Datum</th>
                      <th style={thStyle}>Kategorie</th>
                      <th style={thStyle}>Beschreibung</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Brutto</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>MwSt</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Netto</th>
                      <th style={{ ...thStyle, textAlign: 'center' }}>Aktionen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(expenses as DjExpense[]).map(e => (
                      <tr
                        key={e.id}
                        onMouseEnter={() => setHoveredRow(e.id)}
                        onMouseLeave={() => setHoveredRow(null)}
                        style={{ background: hoveredRow === e.id ? 'var(--color-surface-variant)' : 'transparent', transition: 'background 0.1s' }}
                      >
                        <td style={tdStyle}>{formatDate(e.expense_date)}</td>
                        <td style={tdStyle}>
                          <span style={{
                            background: 'rgba(148,170,255,0.12)',
                            color: 'var(--color-primary)',
                            borderRadius: '0.25rem',
                            padding: '0.125rem 0.5rem',
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            textTransform: 'capitalize',
                          }}>
                            {e.category}
                          </span>
                        </td>
                        <td style={tdStyle}>{e.description}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{formatCurrency(e.amount_gross)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--color-on-surface-variant)' }}>{e.tax_rate} %</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{e.amount_net != null ? formatCurrency(e.amount_net) : '–'}</td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <button
                            onClick={() => setDeleteTarget(e)}
                            title="Ausgabe löschen"
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              color: 'var(--color-error)', padding: '0.25rem', borderRadius: '0.25rem',
                              display: 'inline-flex', alignItems: 'center',
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>
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

      {/* ── Slide-Over: Neue Ausgabe ──────────────────────────────────────────── */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => { setOpen(false); setForm(EMPTY_FORM); setFormError(''); }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40 }}
          />
          {/* Modal */}
          <div
            data-draggable-modal
            style={{
              position: 'fixed', top: 80, right: 32, width: '420px',
              background: 'var(--color-surface-container)',
              borderRadius: '0.75rem',
              boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
              zIndex: 50,
              ...modalStyle,
            }}
          >
            {/* Header */}
            <div
              onMouseDown={onMouseDown}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '1rem 1.25rem',
                borderBottom: '1px solid var(--color-outline-variant)',
                borderRadius: '0.75rem 0.75rem 0 0',
                ...headerStyle,
              }}
            >
              <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1rem', color: 'var(--color-on-surface)' }}>
                Neue Ausgabe
              </span>
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={() => { setOpen(false); setForm(EMPTY_FORM); setFormError(''); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-on-surface-variant)', padding: '0.25rem', display: 'flex', alignItems: 'center', borderRadius: '0.25rem' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
              </button>
            </div>

            {/* Formular */}
            <form onSubmit={handleSubmit} style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Datum */}
              <div>
                <label style={labelStyle}>Datum *</label>
                <input
                  type="date"
                  value={form.expense_date}
                  onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))}
                  style={inputStyle}
                  required
                />
              </div>

              {/* Kategorie */}
              <div>
                <label style={labelStyle}>Kategorie *</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value as Category }))}
                  style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat} style={{ textTransform: 'capitalize' }}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Beschreibung */}
              <div>
                <label style={labelStyle}>Beschreibung *</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="z. B. Software-Lizenz"
                  style={inputStyle}
                  required
                />
              </div>

              {/* Bruttobetrag */}
              <div>
                <label style={labelStyle}>Bruttobetrag (€) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.amount_gross}
                  onChange={e => setForm(f => ({ ...f, amount_gross: e.target.value }))}
                  placeholder="0,00"
                  style={inputStyle}
                  required
                />
              </div>

              {/* MwSt-Satz */}
              <div>
                <label style={labelStyle}>MwSt-Satz</label>
                <select
                  value={form.tax_rate}
                  onChange={e => setForm(f => ({ ...f, tax_rate: e.target.value }))}
                  style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
                >
                  <option value="0">0 %</option>
                  <option value="7">7 %</option>
                  <option value="19">19 %</option>
                </select>
              </div>

              {/* Fehleranzeige */}
              {formError && (
                <p style={{ color: 'var(--color-error)', fontSize: '0.8125rem', margin: 0 }}>{formError}</p>
              )}

              {/* Footer */}
              <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => { setOpen(false); setForm(EMPTY_FORM); setFormError(''); }}
                  style={{
                    flex: 1, background: 'var(--color-surface-container-high)',
                    color: 'var(--color-on-surface)', border: '1px solid var(--color-outline-variant)',
                    borderRadius: '0.5rem', padding: '0.625rem 1rem',
                    fontFamily: 'var(--font-body)', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer',
                  }}
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  style={{
                    flex: 1, background: 'var(--color-primary)', color: 'var(--color-on-primary)',
                    border: 'none', borderRadius: '0.5rem', padding: '0.625rem 1rem',
                    fontFamily: 'var(--font-body)', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
                    opacity: createMutation.isPending ? 0.7 : 1,
                  }}
                >
                  {createMutation.isPending ? 'Speichere…' : 'Speichern'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* ── Confirm-Dialog: Ausgabe löschen ──────────────────────────────────── */}
      {deleteTarget && (
        <>
          <div
            onClick={() => setDeleteTarget(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60 }}
          />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'var(--color-surface-container)',
            borderRadius: '0.75rem',
            boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
            padding: '1.5rem',
            width: '360px',
            maxWidth: '90vw',
            zIndex: 70,
          }}>
            <h3 style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1.125rem', color: 'var(--color-on-surface)', margin: '0 0 0.75rem' }}>
              Ausgabe löschen?
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', margin: '0 0 0.375rem' }}>
              {formatDate(deleteTarget.expense_date)} — {formatCurrency(deleteTarget.amount_gross)}
            </p>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface)', fontWeight: 500, margin: '0 0 1.5rem' }}>
              {deleteTarget.description}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => setDeleteTarget(null)}
                style={{
                  flex: 1, background: 'var(--color-surface-container-high)',
                  color: 'var(--color-on-surface)', border: '1px solid var(--color-outline-variant)',
                  borderRadius: '0.5rem', padding: '0.625rem 1rem',
                  fontFamily: 'var(--font-body)', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer',
                }}
              >
                Abbrechen
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                style={{
                  flex: 1, background: 'var(--color-error)', color: 'var(--color-on-error)',
                  border: 'none', borderRadius: '0.5rem', padding: '0.625rem 1rem',
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
