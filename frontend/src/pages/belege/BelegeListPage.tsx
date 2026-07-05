/**
 * BelegeListPage — /belege/alle (Phase 04 Plan 08).
 *
 * Sortier-/filterbare Tabelle mit:
 *  - Suchfeld (Lieferant, Belegnummer, Title, Notes — Backend matcht via LIKE)
 *  - Status-Filter-Pills (alle, zu_pruefen, freigegeben, archiviert, ocr_pending, nicht_relevant)
 *  - Bereich-Filter (DJ, Privat, …) als Dropdown
 *  - Type-Filter (eingangsrechnung, ausgangsrechnung, fahrt, quittung, …)
 *  - Datums-Range (from/to)
 *  - Tabelle mit Datum / Lieferant / Belegnr / Brutto / USt / Status / Bereich
 *
 * Filter werden ueber URL-Search-Params persistiert (browser-history-friendly).
 *
 * Exportiert ReceiptsTable als wiederverwendbare Sub-Komponente fuer
 * BelegeOpenPaymentsPage und BelegeReviewPage.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { StatusBadge } from '../../components/dj/StatusBadge';
import {
  fetchReceipts,
  updateReceipt,
  type ReceiptListItem,
  type ReceiptFilter,
} from '../../api/belege.api';
import { formatCurrencyFromCents, formatDate } from '../../lib/format';
import { todayLocal } from '../../lib/dates';

type StatusValue = '' | 'zu_pruefen' | 'freigegeben' | 'archiviert' | 'ocr_pending' | 'nicht_relevant';
type TypeValue = '' | 'eingangsrechnung' | 'ausgangsrechnung' | 'quittung' | 'fahrt' | 'sonstige';

const STATUS_TABS: { label: string; value: StatusValue }[] = [
  { label: 'Alle',          value: '' },
  { label: 'Zu prüfen',     value: 'zu_pruefen' },
  { label: 'Freigegeben',   value: 'freigegeben' },
  { label: 'Archiviert',    value: 'archiviert' },
  { label: 'Nicht relevant', value: 'nicht_relevant' },
];

const TYPE_OPTIONS: { label: string; value: TypeValue }[] = [
  { label: 'Alle Typen',          value: '' },
  { label: 'Eingangsrechnung',    value: 'eingangsrechnung' },
  { label: 'Ausgangsrechnung',    value: 'ausgangsrechnung' },
  { label: 'Quittung',            value: 'quittung' },
  { label: 'Fahrt',               value: 'fahrt' },
  { label: 'Sonstige',            value: 'sonstige' },
];

const AREA_OPTIONS: { label: string; value: string }[] = [
  { label: 'Alle Bereiche', value: '' },
  { label: 'DJ',            value: 'DJ' },
  { label: 'Privat',        value: 'Privat' },
  { label: 'Amazon',        value: 'Amazon' },
  { label: 'Haushalt',      value: 'Haushalt' },
];

export function BelegeListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Lokaler State fuer das Suchfeld (wird beim Submit in die URL geschrieben)
  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '');
  // Lokaler State fuer die Datumsfelder: das native type=date-Feld darf beim
  // Jahr-Tippen NICHT bei jedem Tastendruck ueber die URL neu gerendert werden
  // (sonst wird das Jahr-Segment staendig zurueckgesetzt -> "2026" wird zu "0006").
  // Deshalb lokal tippen, erst onBlur in die URL committen.
  const [fromInput, setFromInput] = useState(searchParams.get('from') ?? '');
  const [toInput, setToInput] = useState(searchParams.get('to') ?? '');
  // Summenleiste: Brutto/Netto-Umschalter (Default Brutto)
  const [amountMode, setAmountMode] = useState<'brutto' | 'netto'>('brutto');

  useEffect(() => {
    setSearchInput(searchParams.get('search') ?? '');
    setFromInput(searchParams.get('from') ?? '');
    setToInput(searchParams.get('to') ?? '');
  }, [searchParams]);

  // „Zu prüfen"-Modus (pending) schließt status aus — dann keinen status mitschicken.
  const pendingActive = searchParams.get('pending') === '1';
  const filter: ReceiptFilter = {
    area:   searchParams.get('area')   || undefined,
    status: pendingActive ? undefined : (searchParams.get('status') || undefined),
    type:   searchParams.get('type')   || undefined,
    from:   searchParams.get('from')   || undefined,
    to:     searchParams.get('to')     || undefined,
    search: searchParams.get('search') || undefined,
    steuerrelevant: searchParams.get('steuerrelevant') || undefined,
    pending: pendingActive ? '1' : undefined,
  };

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['belege', 'list', filter],
    queryFn: () => fetchReceipts(filter),
  });

  // Summen client-seitig aus dem bereits gefilterten items-Array berechnen.
  // Signiert: negative Storno-Betraege rechnen automatisch gegen (kein Math.abs).
  const totals = useMemo(() => {
    const pick = (i: ReceiptListItem) =>
      (amountMode === 'brutto' ? i.amount_gross_cents : i.amount_net_cents) ?? 0;
    let einnahmen = 0;
    let ausgaben = 0;
    let fahrten = 0;
    for (const i of items) {
      if (i.type === 'ausgangsrechnung') einnahmen += pick(i);
      else if (i.type === 'eingangsrechnung') ausgaben += pick(i);
      else if (i.type === 'fahrt') fahrten += pick(i);
    }
    const saldo = einnahmen - ausgaben - fahrten;
    return { einnahmen, ausgaben, fahrten, saldo };
  }, [items, amountMode]);
  const isCapped = items.length >= 500;

  const qc = useQueryClient();
  const markPaidMut = useMutation({
    mutationFn: (id: number) =>
      updateReceipt(id, {
        status: 'bezahlt' as never,
        payment_date: todayLocal(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['belege'] });
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      window.alert(e?.response?.data?.error ?? e?.message ?? 'Status-Änderung fehlgeschlagen');
    },
  });

  function setParam(key: string, value: string | undefined) {
    const next = new URLSearchParams(searchParams);
    if (value && value.length > 0) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  }

  function submitSearch() {
    setParam('search', searchInput.trim() || undefined);
  }

  function clearAll() {
    setSearchInput('');
    setSearchParams(new URLSearchParams(), { replace: true });
  }

  // Jahresauswahl: setzt Datum von/bis auf das ganze Jahr in EINEM Aufruf
  // (setParam liest den State pro Aufruf frisch → zwei Aufrufe wuerden sich
  // gegenseitig ueberschreiben).
  function selectYear(year: string) {
    const next = new URLSearchParams(searchParams);
    if (year) {
      next.set('from', `${year}-01-01`);
      next.set('to', `${year}-12-31`);
      setFromInput(`${year}-01-01`);
      setToInput(`${year}-12-31`);
    } else {
      next.delete('from');
      next.delete('to');
      setFromInput('');
      setToInput('');
    }
    setSearchParams(next, { replace: true });
  }

  const status = (searchParams.get('status') as StatusValue) ?? '';
  const type   = (searchParams.get('type')   as TypeValue)   ?? '';
  const area   = searchParams.get('area') ?? '';
  const from   = searchParams.get('from') ?? '';
  const to     = searchParams.get('to') ?? '';
  const nurSteuerrelevant = searchParams.get('steuerrelevant') === '1';

  const hasActiveFilters = !!(area || status || type || from || to || searchInput || nurSteuerrelevant);

  // Jahr ist "gewaehlt", wenn von=YYYY-01-01 UND bis=YYYY-12-31 desselben Jahres.
  const selectedYear =
    from.endsWith('-01-01') && to.endsWith('-12-31') && from.slice(0, 4) === to.slice(0, 4)
      ? from.slice(0, 4)
      : '';
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 6 }, (_, i) => String(currentYear - i));

  return (
    <PageWrapper>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2.5rem 2rem', position: 'relative' }}>
        {/* Ambient glows (DJ-Stil) */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '600px',
            height: '600px',
            background: 'radial-gradient(circle at top right, rgba(148,170,255,0.06) 0%, transparent 60%)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            bottom: 0,
            left: '30%',
            width: '500px',
            height: '400px',
            background: 'radial-gradient(circle at bottom left, rgba(92,253,128,0.04) 0%, transparent 60%)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
            <div>
              <h1
                style={{
                  fontFamily: 'Manrope, sans-serif',
                  fontWeight: 800,
                  fontSize: '3rem',
                  letterSpacing: '-0.02em',
                  color: 'var(--color-on-surface)',
                  margin: 0,
                  lineHeight: 1.1,
                }}
              >
                Alle Belege
              </h1>
              <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.9rem', margin: '0.5rem 0 0', fontFamily: 'var(--font-body)' }}>
                {isLoading ? 'Lade…' : `${items.length} ${items.length === 1 ? 'Beleg' : 'Belege'} gefunden`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/belege/neu')}
              style={{
                background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
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
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>upload</span>
              Neuer Beleg
            </button>
          </div>

          {/* Filterleiste */}
          <div
            style={{
              background: 'var(--color-surface-variant)',
              borderRadius: '0.75rem',
              padding: '1rem 1.25rem',
              marginBottom: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            {/* Suchfeld + Datums-Range + Reset */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: '240px', display: 'flex', gap: '0.5rem' }}>
                <input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitSearch();
                  }}
                  placeholder="Suche Lieferant, Belegnummer, Titel oder Notiz…"
                  style={{
                    flex: 1,
                    padding: '0.5rem 0.75rem',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(148,170,255,0.15)',
                    borderRadius: '0.5rem',
                    color: 'var(--color-on-surface)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.875rem',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={submitSearch}
                  style={{
                    padding: '0.5rem 1rem',
                    background: 'var(--color-primary)',
                    border: 'none',
                    borderRadius: '0.5rem',
                    color: 'var(--color-on-primary)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Suchen
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Jahr
                </span>
                <select
                  value={selectedYear}
                  onChange={(e) => selectYear(e.target.value)}
                  aria-label="Jahr wählen"
                  style={{
                    padding: '0.5rem 0.75rem',
                    background: selectedYear ? 'rgba(148,170,255,0.12)' : 'rgba(255,255,255,0.05)',
                    border: selectedYear ? '1px solid rgba(148,170,255,0.4)' : '1px solid rgba(148,170,255,0.15)',
                    borderRadius: '0.5rem',
                    color: 'var(--color-on-surface)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                  }}
                >
                  <option value="">Jahr wählen …</option>
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Datum von
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <input
                    type="date"
                    value={fromInput}
                    onChange={(e) => setFromInput(e.target.value)}
                    onBlur={() => setParam('from', fromInput || undefined)}
                    aria-label="Datum von"
                    style={{
                      padding: '0.5rem 0.75rem',
                      background: fromInput ? 'rgba(148,170,255,0.12)' : 'rgba(255,255,255,0.05)',
                      border: fromInput ? '1px solid rgba(148,170,255,0.4)' : '1px solid rgba(148,170,255,0.15)',
                      borderRadius: '0.5rem',
                      color: 'var(--color-on-surface)',
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.875rem',
                    }}
                  />
                  {fromInput && (
                    <button
                      type="button"
                      onClick={() => { setFromInput(''); setParam('from', undefined); }}
                      title="Von-Datum entfernen"
                      aria-label="Von-Datum entfernen"
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: 'var(--color-on-surface-variant)', fontSize: '1rem', padding: '0 0.25rem',
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Datum bis
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <input
                    type="date"
                    value={toInput}
                    onChange={(e) => setToInput(e.target.value)}
                    onBlur={() => setParam('to', toInput || undefined)}
                    aria-label="Datum bis"
                    style={{
                      padding: '0.5rem 0.75rem',
                      background: toInput ? 'rgba(148,170,255,0.12)' : 'rgba(255,255,255,0.05)',
                      border: toInput ? '1px solid rgba(148,170,255,0.4)' : '1px solid rgba(148,170,255,0.15)',
                      borderRadius: '0.5rem',
                      color: 'var(--color-on-surface)',
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.875rem',
                    }}
                  />
                  {toInput && (
                    <button
                      type="button"
                      onClick={() => { setToInput(''); setParam('to', undefined); }}
                      title="Bis-Datum entfernen"
                      aria-label="Bis-Datum entfernen"
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: 'var(--color-on-surface-variant)', fontSize: '1rem', padding: '0 0.25rem',
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAll}
                  style={{
                    padding: '0.5rem 0.875rem',
                    background: 'transparent',
                    border: '1px solid rgba(148,170,255,0.2)',
                    borderRadius: '0.5rem',
                    color: 'var(--color-on-surface-variant)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                  }}
                >
                  Filter zurücksetzen
                </button>
              )}
            </div>

            {/* Bereich + Type Dropdowns */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                value={area}
                onChange={(e) => setParam('area', e.target.value || undefined)}
                aria-label="Bereich"
                style={selectStyle}
              >
                {AREA_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <select
                value={type}
                onChange={(e) => setParam('type', e.target.value || undefined)}
                aria-label="Belegtyp"
                style={selectStyle}
              >
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setParam('steuerrelevant', nurSteuerrelevant ? undefined : '1')}
                aria-pressed={nurSteuerrelevant}
                title="Nur steuerrelevante Belege anzeigen (fürs Finanzamt)"
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  background: nurSteuerrelevant ? 'var(--color-primary)' : 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(148,170,255,0.15)',
                  borderRadius: '999px',
                  color: nurSteuerrelevant ? 'var(--color-on-primary)' : 'var(--color-on-surface-variant)',
                  padding: '0.5rem 1rem',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>account_balance</span>
                Nur steuerrelevant
              </button>
            </div>

            {/* Status-Pills */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {STATUS_TABS.map((tab) => {
                // „Zu prüfen" ist jetzt der pending-Modus (freigegeben_at IS NULL …),
                // nicht mehr status='zu_pruefen'. Die anderen Chips bleiben status-basiert.
                const isPendingTab = tab.value === 'zu_pruefen';
                const active = isPendingTab
                  ? pendingActive
                  : (!pendingActive && status === tab.value);
                return (
                  <button
                    key={tab.value || 'all'}
                    type="button"
                    onClick={() => {
                      const next = new URLSearchParams(searchParams);
                      if (isPendingTab) {
                        next.set('pending', '1');
                        next.delete('status'); // pending und status schließen sich aus
                      } else {
                        next.delete('pending'); // andere Chips verlassen den pending-Modus
                        if (tab.value) next.set('status', tab.value);
                        else next.delete('status');
                      }
                      setSearchParams(next, { replace: true });
                    }}
                    style={{
                      background: active ? 'var(--color-primary)' : 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(148,170,255,0.15)',
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
          </div>

          {/* Summenleiste — filter-abhaengig aus dem geladenen items-Array */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div
              style={{
                display: 'flex',
                gap: '0.75rem',
                flexWrap: 'wrap',
                alignItems: 'stretch',
              }}
            >
              <SummenChip
                label="Einnahmen"
                value={totals.einnahmen}
                color="var(--color-secondary)"
              />
              <SummenChip
                label="Ausgaben"
                value={totals.ausgaben}
                color="var(--color-error)"
              />
              <SummenChip
                label="Fahrten"
                value={totals.fahrten}
                color="var(--color-on-surface-variant)"
              />
              <SummenChip
                label="Saldo"
                value={totals.saldo}
                color={totals.saldo >= 0 ? 'var(--color-secondary)' : 'var(--color-error)'}
                highlighted
              />

              {/* Brutto/Netto-Toggle rechtsbuendig */}
              <div
                style={{
                  marginLeft: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                {(['brutto', 'netto'] as const).map((mode) => {
                  const active = amountMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setAmountMode(mode)}
                      aria-pressed={active}
                      style={{
                        background: active ? 'var(--color-primary)' : 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(148,170,255,0.15)',
                        borderRadius: '999px',
                        color: active ? 'var(--color-on-primary)' : 'var(--color-on-surface-variant)',
                        padding: '0.4rem 1rem',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.8rem',
                        fontWeight: active ? 600 : 500,
                        transition: 'all 120ms',
                      }}
                    >
                      {mode === 'brutto' ? 'Brutto' : 'Netto'}
                    </button>
                  );
                })}
              </div>
            </div>

            <p
              style={{
                fontSize: '0.7rem',
                color: 'var(--color-on-surface-variant)',
                fontFamily: 'var(--font-body)',
                marginTop: '0.35rem',
                marginBottom: 0,
              }}
            >
              Abwesenheitspauschalen zählen nicht als Beleg — sie stehen auf der Fahrten-Seite und im CSV-Export.
            </p>
            {isCapped && (
              <p
                style={{
                  fontSize: '0.7rem',
                  color: 'var(--color-on-surface-variant)',
                  fontFamily: 'var(--font-body)',
                  marginTop: '0.2rem',
                  marginBottom: 0,
                }}
              >
                Summe evtl. gedeckelt (500 Treffer).
              </p>
            )}
          </div>

          {/* Tabelle */}
          <ReceiptsTable
            items={items}
            isLoading={isLoading}
            onClick={(r) => navigate(`/belege/${r.id}`)}
            onMarkPaid={(id) => markPaidMut.mutate(id)}
            markPaidPending={markPaidMut.isPending ? markPaidMut.variables ?? null : null}
          />
        </div>
      </div>
    </PageWrapper>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(148,170,255,0.15)',
  borderRadius: '0.5rem',
  color: 'var(--color-on-surface)',
  fontFamily: 'var(--font-body)',
  fontSize: '0.875rem',
  cursor: 'pointer',
  outline: 'none',
};

/** Kachel der Summenleiste im Stil der Filterleiste (Graphit/Electric-Noir). */
function SummenChip({
  label,
  value,
  color,
  highlighted = false,
}: {
  label: string;
  value: number;
  color: string;
  highlighted?: boolean;
}) {
  return (
    <div
      style={{
        background: 'var(--color-surface-variant)',
        borderRadius: '0.75rem',
        padding: '0.75rem 1.1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
        minWidth: '120px',
        border: highlighted
          ? '1px solid color-mix(in srgb, var(--color-primary) 30%, transparent)'
          : '1px solid transparent',
      }}
    >
      <span
        style={{
          fontSize: '0.65rem',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: 'var(--color-on-surface-variant)',
          fontFamily: 'var(--font-body)',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: 'Manrope',
          fontWeight: 700,
          fontSize: '1.05rem',
          color,
        }}
      >
        {formatCurrencyFromCents(value)}
      </span>
    </div>
  );
}

interface ReceiptsTableProps {
  items: ReceiptListItem[];
  onClick: (r: ReceiptListItem) => void;
  isLoading?: boolean;
  /** Spalten-Override fuer Open-Payments-Sicht (with due_date instead of vat_rate). */
  variant?: 'default' | 'open-payments';
  /** Optional: Quick-Action zum Setzen status='bezahlt' (mit payment_date=heute). */
  onMarkPaid?: (id: number) => void;
  /** Optional: id deren mark-paid gerade pending ist (zum Disablen). */
  markPaidPending?: number | null;
}

export function ReceiptsTable({
  items,
  onClick,
  isLoading = false,
  variant = 'default',
  onMarkPaid,
  markPaidPending = null,
}: ReceiptsTableProps) {
  const showDueDate = variant === 'open-payments';
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div
      style={{
        background: 'var(--color-surface-variant)',
        borderRadius: '0.75rem',
        overflow: 'hidden',
      }}
    >
      {/* Header-Row */}
      {!isLoading && items.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '110px 1fr 140px 100px 120px 100px 130px',
            gap: '0.75rem',
            padding: '0.75rem 1.25rem',
            borderBottom: '1px solid rgba(148,170,255,0.15)',
            background: 'rgba(255,255,255,0.03)',
          }}
        >
          {[
            'Datum',
            'Lieferant',
            'Belegnr',
            'Bereich',
            showDueDate ? 'Fällig' : 'Brutto',
            showDueDate ? 'Brutto' : 'USt',
            'Status',
          ].map((col) => (
            <span
              key={col}
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.7rem',
                fontWeight: 600,
                color: 'var(--color-on-surface-variant)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {col}
            </span>
          ))}
        </div>
      )}

      {isLoading && (
        <div
          style={{
            textAlign: 'center',
            padding: '3rem',
            color: 'var(--color-on-surface-variant)',
            fontFamily: 'var(--font-body)',
            fontSize: '0.9rem',
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem', opacity: 0.4 }}
          >
            hourglass_empty
          </span>
          Lade…
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '3rem 2rem',
            color: 'var(--color-on-surface-variant)',
            fontFamily: 'var(--font-body)',
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem', opacity: 0.4 }}
          >
            receipt_long
          </span>
          Keine Belege gefunden.
        </div>
      )}

      {!isLoading &&
        items.map((r, idx) => {
          const isOverdue =
            showDueDate &&
            r.due_date != null &&
            r.due_date < today &&
            r.status !== 'bezahlt' &&
            r.status !== 'storniert';
          return (
            <ReceiptRow
              key={r.id}
              receipt={r}
              isFirst={idx === 0}
              isOverdue={isOverdue}
              showDueDate={showDueDate}
              onClick={() => onClick(r)}
              onMarkPaid={onMarkPaid ? () => onMarkPaid(r.id) : undefined}
              markPaidPending={markPaidPending === r.id}
            />
          );
        })}
    </div>
  );
}

function ReceiptRow({
  receipt: r,
  isFirst,
  isOverdue,
  showDueDate,
  onClick,
  onMarkPaid,
  markPaidPending = false,
}: {
  receipt: ReceiptListItem;
  isFirst: boolean;
  isOverdue: boolean;
  onMarkPaid?: () => void;
  markPaidPending?: boolean;
  showDueDate: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isStorno = (r.amount_gross_cents ?? 0) < 0;
  const amountColor = isStorno ? 'var(--color-error)' : 'var(--color-on-surface)';
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: '110px 1fr 140px 100px 120px 100px 130px',
        gap: '0.75rem',
        padding: '0.75rem 1.25rem',
        borderTop: isFirst ? 'none' : '1px solid rgba(148,170,255,0.08)',
        cursor: 'pointer',
        background: isOverdue
          ? 'rgba(255,110,132,0.06)'
          : hovered
          ? 'rgba(255,255,255,0.04)'
          : 'transparent',
        alignItems: 'center',
        transition: 'background 120ms',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.85rem',
          color: 'var(--color-on-surface-variant)',
          whiteSpace: 'nowrap',
        }}
      >
        {formatDate(r.receipt_date)}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.9rem',
          color: 'var(--color-on-surface)',
          fontWeight: 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={r.supplier_name ?? r.title ?? ''}
      >
        {r.supplier_name || r.title || '–'}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.85rem',
          color: 'var(--color-on-surface-variant)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {r.supplier_invoice_number || r.receipt_number || '–'}
      </span>
      <span>
        {r.primary_area ? (
          <span
            style={{
              display: 'inline-block',
              fontFamily: 'var(--font-body)',
              fontSize: '0.72rem',
              fontWeight: 600,
              color: 'var(--color-primary)',
              background: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-primary) 30%, transparent)',
              borderRadius: '999px',
              padding: '0.15rem 0.6rem',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '100%',
            }}
            title={r.primary_area}
          >
            {r.primary_area}
          </span>
        ) : (
          <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.85rem' }}>–</span>
        )}
      </span>
      {showDueDate ? (
        <>
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.85rem',
              color: isOverdue ? 'var(--color-error)' : 'var(--color-on-surface)',
              fontWeight: isOverdue ? 600 : 500,
              whiteSpace: 'nowrap',
            }}
          >
            {r.due_date ? formatDate(r.due_date) : '–'}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: amountColor,
              textAlign: 'right',
              whiteSpace: 'nowrap',
            }}
          >
            {formatCurrencyFromCents(r.amount_gross_cents)}
          </span>
        </>
      ) : (
        <>
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: amountColor,
              textAlign: 'right',
              whiteSpace: 'nowrap',
            }}
          >
            {formatCurrencyFromCents(r.amount_gross_cents)}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.85rem',
              color: 'var(--color-on-surface-variant)',
              whiteSpace: 'nowrap',
            }}
          >
            {r.vat_rate}%
          </span>
        </>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', justifyContent: 'flex-end' }}>
        <StatusBadge status={r.status as never} />
        {onMarkPaid &&
          (r.status === 'offen' || r.status === 'teilbezahlt' || r.status === 'ueberfaellig') && (
            <button
              type="button"
              onClick={(ev) => {
                ev.stopPropagation();
                onMarkPaid();
              }}
              disabled={markPaidPending}
              title="Als bezahlt markieren"
              aria-label="Als bezahlt markieren"
              style={{
                background: 'transparent',
                border: '1px solid rgba(92,253,128,0.35)',
                borderRadius: '0.375rem',
                color: '#5cfd80',
                cursor: markPaidPending ? 'wait' : 'pointer',
                padding: '0.2rem 0.4rem',
                display: 'inline-flex',
                alignItems: 'center',
                opacity: markPaidPending ? 0.5 : 1,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1.05rem' }}>
                paid
              </span>
            </button>
          )}
      </div>
    </div>
  );
}
