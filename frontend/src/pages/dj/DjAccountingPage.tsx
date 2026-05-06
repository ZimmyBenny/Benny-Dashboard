import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import {
  fetchDjAccountingSummary,
  fetchDjAccountingPayments,
  DjPayment,
} from '../../api/dj.api';
import { formatCurrency, formatDate } from '../../lib/format';

const DISCLAIMER =
  'Diese Auflistung dient ausschließlich als Orientierungshilfe für die eigene Buchhaltung und ersetzt keine Steuerberatung. Vor Einreichung beim Finanzamt bitte mit dem Steuerberater abstimmen.';

const YEARS = [2024, 2025, 2026];

type Tab = 'uebersicht' | 'einnahmen' | 'ausgaben';

export function DjAccountingPage() {
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [tab, setTab] = useState<Tab>('uebersicht');
  const navigate = useNavigate();

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['dj-accounting-summary', year],
    queryFn: () => fetchDjAccountingSummary(year),
  });

  const { data: payments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ['dj-accounting-payments', year],
    queryFn: () => fetchDjAccountingPayments(year),
    enabled: tab === 'einnahmen',
  });

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
              <h1 style={{
                fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '2.25rem',
                color: 'var(--color-on-surface)', margin: 0, letterSpacing: '-0.02em', lineHeight: 1,
              }}>
                Buchhaltung
              </h1>
              <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.875rem', margin: '0.5rem 0 0' }}>
                Read-Only-Sicht aus dem Belege-Modul · gefiltert auf Bereich DJ
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

          {/* Ausgaben Tab — Read-Only-Banner: alle Ausgaben werden im Belege-Modul erfasst */}
          {tab === 'ausgaben' && (
            <div style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(148,170,255,0.12)',
              borderRadius: '0.75rem',
              padding: '3rem 2rem',
              textAlign: 'center',
            }}>
              <span className="material-symbols-outlined" style={{
                fontSize: '3.5rem',
                color: '#94aaff',
                display: 'block',
                marginBottom: '1rem',
              }}>receipt_long</span>
              <h3 style={{
                fontFamily: 'var(--font-headline)',
                fontSize: '1.25rem',
                fontWeight: 700,
                color: 'var(--color-on-surface)',
                margin: '0 0 0.75rem',
              }}>
                Ausgaben werden im Belege-Modul erfasst
              </h3>
              <p style={{
                color: 'var(--color-on-surface-variant)',
                fontSize: '0.875rem',
                margin: '0 auto 1.5rem',
                maxWidth: '480px',
                lineHeight: 1.5,
              }}>
                Alle DJ-bezogenen Belege findest du gefiltert unter{' '}
                <strong style={{ color: 'var(--color-on-surface)' }}>/belege?area=DJ</strong>.
                Die Buchhaltungs-Übersicht hier zieht ihre Zahlen automatisch aus dem Belege-Modul.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={() => navigate('/belege/neu?area=DJ')}
                  style={{
                    padding: '0.625rem 1.5rem',
                    background: 'linear-gradient(135deg, #94aaff 0%, #5cfd80 100%)',
                    color: '#060e20',
                    border: 'none',
                    borderRadius: '0.5rem',
                    fontFamily: 'var(--font-body)',
                    fontWeight: 700,
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    boxShadow: '0 0 16px rgba(148,170,255,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
                  Neuen Beleg erfassen
                </button>
                <button
                  onClick={() => navigate('/belege?area=DJ')}
                  style={{
                    padding: '0.625rem 1.5rem',
                    background: 'transparent',
                    border: '1px solid rgba(148,170,255,0.25)',
                    borderRadius: '0.5rem',
                    color: 'var(--color-on-surface)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>list</span>
                  Alle DJ-Belege ansehen
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
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
