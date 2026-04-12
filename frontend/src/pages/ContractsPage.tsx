import { useState, useEffect, useCallback } from 'react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { fetchContracts, archiveContract, createContract, updateContract, type Contract } from '../api/contracts.api';
import { ContractSlideOver } from '../components/contracts/ContractSlideOver';

// ---------------------------------------------------------------------------
// Konstanten
// ---------------------------------------------------------------------------

const ITEM_TYPE_ICONS: Record<string, string> = {
  Vertrag: 'description',
  Dokument: 'article',
  Frist: 'timer',
  Versicherung: 'security',
  Mitgliedschaft: 'group',
  Garantie: 'verified',
  Sonstiges: 'more_horiz',
};

const AREA_COLORS: Record<string, string> = {
  DJ: '#cc97ff',
  Amazon: '#ff9900',
  Cashback: '#4ade80',
  Finanzen: '#60a5fa',
  Privat: '#f472b6',
  Sonstiges: 'rgba(255,255,255,0.2)',
};

const PRIORITY_COLORS: Record<string, string> = {
  niedrig: '#6b7280',
  mittel: '#60a5fa',
  hoch: '#fb923c',
  kritisch: '#f87171',
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  aktiv: { bg: 'rgba(74,222,128,0.15)', color: '#4ade80' },
  in_pruefung: { bg: 'rgba(251,146,60,0.15)', color: '#fb923c' },
  gekuendigt: { bg: 'rgba(248,113,113,0.15)', color: '#f87171' },
  abgelaufen: { bg: 'rgba(107,114,128,0.15)', color: '#6b7280' },
  archiviert: { bg: 'rgba(55,65,81,0.15)', color: '#374151' },
};

const STATUS_LABELS: Record<string, string> = {
  aktiv: 'Aktiv',
  in_pruefung: 'In Prüfung',
  gekuendigt: 'Gekündigt',
  abgelaufen: 'Abgelaufen',
  archiviert: 'Archiviert',
};

const EMPTY_STATE_MESSAGES: Record<string, string> = {
  all: 'Noch keine Einträge vorhanden',
  soon: 'Keine Einträge in den nächsten 30 Tagen fällig',
  overdue: 'Keine überfälligen Einträge',
  cancellable: 'Keine kündbaren Einträge',
  archive: 'Archiv ist leer',
};

// ---------------------------------------------------------------------------
// CSV-Export
// ---------------------------------------------------------------------------

function escapeCSV(value: string | number | null | undefined): string {
  const s = (value ?? '').toString();
  if (/[;"'\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function exportContractsCsv(contracts: Contract[]) {
  const header = [
    'Titel', 'Eintragstyp', 'Bereich', 'Status', 'Priorität', 'Anbieter', 'Referenznummer',
    'Startdatum', 'Ablaufdatum', 'Kündigungsdatum', 'Erinnerungsdatum',
    'Kostenbetrag', 'Währung', 'Zahlungsintervall', 'Wiederholungstyp',
    'Beschreibung', 'Notizen',
  ];
  const lines = [header.join(';')];
  for (const c of contracts) {
    lines.push([
      escapeCSV(c.title),
      escapeCSV(c.item_type),
      escapeCSV(c.area),
      escapeCSV(c.status),
      escapeCSV(c.priority),
      escapeCSV(c.provider_name),
      escapeCSV(c.reference_number),
      escapeCSV(c.start_date),
      escapeCSV(c.expiration_date),
      escapeCSV(c.cancellation_date),
      escapeCSV(c.reminder_date),
      escapeCSV(c.cost_amount),
      escapeCSV(c.currency),
      escapeCSV(c.cost_interval),
      escapeCSV(c.recurrence_type),
      escapeCSV(c.description),
      escapeCSV(c.notes),
    ].join(';'));
  }
  const csv = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vertraege-fristen_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function getDaysUntil(isoDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(isoDate);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function ExpirationBadge({ expiration_date }: { expiration_date: string | null }) {
  if (!expiration_date) return null;
  const days = getDaysUntil(expiration_date);

  let color = '#4ade80';
  let text = `in ${days} Tagen`;
  let bold = false;

  if (days < 0) {
    color = '#f87171';
    text = `${Math.abs(days)} Tage überfällig`;
    bold = true;
  } else if (days === 0) {
    color = '#f87171';
    text = 'Heute';
  } else if (days <= 6) {
    color = '#f87171';
    text = `in ${days} Tagen`;
  } else if (days <= 30) {
    color = '#fb923c';
    text = `in ${days} Tagen`;
  }

  return (
    <span style={{
      fontSize: '0.72rem',
      color,
      fontWeight: bold ? 700 : 400,
      fontFamily: 'var(--font-body)',
    }}>
      {text}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Kostenübersicht
// ---------------------------------------------------------------------------

const AREA_CHART_COLORS: Record<string, string> = {
  Privat: '#f472b6',
  DJ: '#cc97ff',
  Amazon: '#fb923c',
  Cashback: '#4ade80',
  Finanzen: '#60a5fa',
  Sonstiges: '#6b7280',
};

function toMonthly(amount: number, interval: string | null): number {
  switch (interval) {
    case 'monatlich': return amount;
    case 'quartalsweise': return amount / 3;
    case 'jaehrlich': return amount / 12;
    default: return 0; // einmalig oder leer
  }
}

function toYearly(amount: number, interval: string | null): number {
  switch (interval) {
    case 'monatlich': return amount * 12;
    case 'quartalsweise': return amount * 4;
    case 'jaehrlich': return amount;
    default: return 0;
  }
}

function KostenUebersicht({ contracts }: { contracts: Contract[] }) {
  const aktiv = contracts.filter(c => c.status === 'aktiv' && (c.cost_amount ?? 0) > 0);
  if (aktiv.length === 0) return null;

  // Summen pro Bereich
  const byAreaMonthly: Record<string, number> = {};
  const byAreaYearly: Record<string, number> = {};
  let totalMonthly = 0;
  let totalYearly = 0;

  for (const c of aktiv) {
    const area = c.area || 'Sonstiges';
    const m = toMonthly(c.cost_amount!, c.cost_interval);
    const y = toYearly(c.cost_amount!, c.cost_interval);
    byAreaMonthly[area] = (byAreaMonthly[area] ?? 0) + m;
    byAreaYearly[area] = (byAreaYearly[area] ?? 0) + y;
    totalMonthly += m;
    totalYearly += y;
  }

  if (totalMonthly === 0 && totalYearly === 0) return null;

  const cardStyle: React.CSSProperties = {
    background: 'var(--color-surface-container)',
    border: '1px solid var(--color-surface-container-high)',
    borderRadius: '0.875rem',
    padding: '1.25rem',
    flex: 1,
    minWidth: 0,
  };

  function BarChart({ byArea, total }: { byArea: Record<string, number>; total: number }) {
    const areas = Object.entries(byArea).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    return (
      <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {areas.map(([area, val]) => {
          const pct = total > 0 ? (val / total) * 100 : 0;
          const color = AREA_CHART_COLORS[area] ?? AREA_CHART_COLORS.Sonstiges;
          return (
            <div key={area}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.15rem' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)' }}>{area}</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)' }}>
                  {val.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </span>
              </div>
              <div style={{ height: '6px', borderRadius: '9999px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', borderRadius: '9999px', background: color, transition: 'width 400ms ease' }} />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <p style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.75rem',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--color-outline)',
        marginBottom: '0.75rem',
      }}>Kostenübersicht</p>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        {/* Monatlich */}
        <div style={cardStyle}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-outline)', marginBottom: '0.25rem' }}>Monatlich</p>
          <p style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1.5rem', color: 'var(--color-on-surface)' }}>
            € {totalMonthly.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--color-outline)', marginLeft: '0.25rem' }}>/ Monat</span>
          </p>
          <BarChart byArea={byAreaMonthly} total={totalMonthly} />
        </div>
        {/* Jährlich */}
        <div style={cardStyle}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-outline)', marginBottom: '0.25rem' }}>Jährlich</p>
          <p style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1.5rem', color: 'var(--color-on-surface)' }}>
            € {totalYearly.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--color-outline)', marginLeft: '0.25rem' }}>/ Jahr</span>
          </p>
          <BarChart byArea={byAreaYearly} total={totalYearly} />
        </div>
      </div>
    </div>
  );
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  background: 'var(--color-surface-container-low)',
  border: '1px solid var(--color-outline-variant)',
  borderRadius: '0.5rem',
  color: 'var(--color-on-surface)',
  fontFamily: 'var(--font-body)',
  fontSize: '0.875rem',
  padding: '0.5rem 0.75rem',
  outline: 'none',
  boxSizing: 'border-box',
};

type Segment = 'all' | 'soon' | 'overdue' | 'cancellable' | 'archive';

interface ContractsPageProps {
  onEdit?: (contract: Contract) => void;
}

// ---------------------------------------------------------------------------
// ContractsPage
// ---------------------------------------------------------------------------

export function ContractsPage({ onEdit }: ContractsPageProps = {}) {
  const [segment, setSegment] = useState<Segment>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterArea, setFilterArea] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);

  // SlideOver state (verdrahtet in Task 4, hier als Platzhalter)
  const [isSlideOverOpen, setIsSlideOverOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);

  const LIMIT = 50;

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset offset wenn Filter wechseln
  useEffect(() => {
    setOffset(0);
    setContracts([]);
  }, [segment, debouncedSearch, filterType, filterArea, filterStatus]);

  const loadContracts = useCallback(async (currentOffset: number, append = false) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        segment,
        limit: LIMIT,
        offset: currentOffset,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (filterType) params.item_type = filterType;
      if (filterArea) params.area = filterArea;
      if (filterStatus) params.status = filterStatus;

      const result = await fetchContracts(params);
      setContracts(prev => append ? [...prev, ...result.data] : result.data);
      setTotal(result.total);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [segment, debouncedSearch, filterType, filterArea, filterStatus]);

  useEffect(() => {
    loadContracts(0, false);
  }, [loadContracts]);

  async function handleArchive(id: number) {
    try {
      await archiveContract(id);
      loadContracts(0, false);
    } catch {
      // ignore
    }
  }

  function handleLoadMore() {
    const newOffset = offset + LIMIT;
    setOffset(newOffset);
    loadContracts(newOffset, true);
  }

  function handleNewEntry() {
    setEditingContract(null);
    setIsSlideOverOpen(true);
  }

  function handleEditEntry(contract: Contract) {
    setEditingContract(contract);
    setIsSlideOverOpen(true);
    if (onEdit) onEdit(contract);
  }

  const segments: { key: Segment; label: string }[] = [
    { key: 'all', label: 'Alle' },
    { key: 'soon', label: 'Bald fällig' },
    { key: 'overdue', label: 'Überfällig' },
    { key: 'cancellable', label: 'Kündbar' },
    { key: 'archive', label: 'Archiv' },
  ];

  return (
    <PageWrapper>
      {/* Seitentitel */}
      <h1 style={{
        fontFamily: 'var(--font-headline)',
        fontWeight: 700,
        fontSize: '1.5rem',
        color: 'var(--color-on-surface)',
        marginBottom: '1.25rem',
      }}>
        Verträge & Fristen
      </h1>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <button
          onClick={() => exportContractsCsv(contracts)}
          disabled={contracts.length === 0}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
            padding: '0.45rem 1.1rem',
            borderRadius: '9999px',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid var(--color-outline-variant)',
            color: 'var(--color-on-surface-variant)',
            cursor: contracts.length === 0 ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
            fontSize: '0.8rem',
            letterSpacing: '0.03em',
            opacity: contracts.length === 0 ? 0.5 : 1,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>download</span>
          CSV-Export
        </button>
        <button
          onClick={handleNewEntry}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
            padding: '0.45rem 1.1rem',
            borderRadius: '9999px',
            background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
            color: '#000',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-body)',
            fontWeight: 700,
            fontSize: '0.8rem',
            letterSpacing: '0.03em',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>add</span>
          Neuer Eintrag
        </button>
      </div>

      {/* Segment-Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {segments.map(seg => (
          <button
            key={seg.key}
            onClick={() => setSegment(seg.key)}
            style={{
              borderRadius: '9999px',
              padding: '0.4rem 1rem',
              fontSize: '0.8rem',
              fontFamily: 'var(--font-body)',
              border: segment === seg.key ? 'none' : '1px solid var(--color-outline-variant)',
              background: segment === seg.key
                ? 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))'
                : 'rgba(255,255,255,0.04)',
              color: segment === seg.key ? '#000' : 'var(--color-on-surface-variant)',
              fontWeight: segment === seg.key ? 700 : 400,
              cursor: 'pointer',
              transition: 'background 150ms ease',
            }}
          >
            {seg.label}
          </button>
        ))}
      </div>

      {/* Filter-Zeile */}
      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          style={{ ...INPUT_STYLE, flex: '1', minWidth: '160px' }}
          type="text"
          placeholder="Suchen..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          style={{ ...INPUT_STYLE, minWidth: '130px', width: 'auto' }}
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
        >
          <option value="">Alle Typen</option>
          {['Vertrag', 'Dokument', 'Frist', 'Versicherung', 'Mitgliedschaft', 'Garantie', 'Sonstiges'].map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          style={{ ...INPUT_STYLE, minWidth: '130px', width: 'auto' }}
          value={filterArea}
          onChange={e => setFilterArea(e.target.value)}
        >
          <option value="">Alle Bereiche</option>
          {['Privat', 'DJ', 'Amazon', 'Cashback', 'Finanzen', 'Sonstiges'].map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select
          style={{ ...INPUT_STYLE, minWidth: '130px', width: 'auto' }}
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="">Alle Status</option>
          <option value="aktiv">Aktiv</option>
          <option value="in_pruefung">In Prüfung</option>
          <option value="gekuendigt">Gekündigt</option>
          <option value="abgelaufen">Abgelaufen</option>
          <option value="archiviert">Archiviert</option>
        </select>
      </div>

      {/* Listenkarten */}
      <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {!loading && contracts.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '3rem 1rem',
            color: 'var(--color-on-surface-variant)',
            fontFamily: 'var(--font-body)',
            fontSize: '0.875rem',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: 'var(--color-outline)', display: 'block', marginBottom: '0.75rem' }}>
              inbox
            </span>
            {EMPTY_STATE_MESSAGES[segment]}
          </div>
        )}

        {contracts.map(contract => {
          const areaColor = AREA_COLORS[contract.area] || AREA_COLORS.Sonstiges;
          const statusStyle = STATUS_COLORS[contract.status] || { bg: 'rgba(107,114,128,0.15)', color: '#6b7280' };
          const icon = ITEM_TYPE_ICONS[contract.item_type] || 'more_horiz';

          return (
            <div
              key={contract.id}
              style={{
                background: 'var(--color-surface-container)',
                border: '1px solid var(--color-surface-container-high)',
                borderRadius: '0.875rem',
                padding: '1rem 1.25rem',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
              }}
            >
              {/* Icon */}
              <div style={{ flexShrink: 0 }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1.5rem', color: 'var(--color-primary)' }}>
                  {icon}
                </span>
              </div>

              {/* Mitte */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontFamily: 'var(--font-headline)',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  color: 'var(--color-on-surface)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  marginBottom: '0.25rem',
                }}>
                  {contract.title}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {contract.provider_name && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)' }}>
                      {contract.provider_name}
                    </span>
                  )}
                  {/* Status-Chip */}
                  <span style={{
                    display: 'inline-block',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '9999px',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    fontFamily: 'var(--font-body)',
                    background: statusStyle.bg,
                    color: statusStyle.color,
                  }}>
                    {STATUS_LABELS[contract.status] || contract.status}
                  </span>
                  {/* Bereich-Badge */}
                  <span style={{
                    display: 'inline-block',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '9999px',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    fontFamily: 'var(--font-body)',
                    background: areaColor === 'rgba(255,255,255,0.2)' ? areaColor : `${areaColor}26`,
                    color: areaColor,
                  }}>
                    {contract.area}
                  </span>
                  {/* Priorität-Dot */}
                  <span style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    display: 'inline-block',
                    flexShrink: 0,
                    background: PRIORITY_COLORS[contract.priority] || '#6b7280',
                  }} title={contract.priority} />
                </div>
              </div>

              {/* Rechts: Datum + Fälligkeit + Kosten */}
              <div style={{ flexShrink: 0, textAlign: 'right' }}>
                {contract.expiration_date && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-on-surface)', fontFamily: 'var(--font-body)', marginBottom: '0.15rem' }}>
                    {formatDate(contract.expiration_date)}
                  </p>
                )}
                <ExpirationBadge expiration_date={contract.expiration_date} />
                {contract.cost_amount != null && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', marginTop: '0.15rem' }}>
                    {contract.cost_amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {contract.currency}
                    {contract.cost_interval ? `/${contract.cost_interval}` : ''}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div style={{ flexShrink: 0, display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  onClick={() => handleEditEntry(contract)}
                  title="Bearbeiten"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-outline)',
                    padding: '0.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'color 150ms ease',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-primary)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-outline)')}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>edit</span>
                </button>
                <button
                  onClick={() => handleArchive(contract.id)}
                  title={contract.is_archived ? 'Wiederherstellen' : 'Archivieren'}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-outline)',
                    padding: '0.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'color 150ms ease',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-primary)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-outline)')}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                    {contract.is_archived ? 'unarchive' : 'archive'}
                  </span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Mehr laden */}
      {total > contracts.length && (
        <div style={{ marginTop: '1rem', textAlign: 'center' }}>
          <button
            onClick={handleLoadMore}
            disabled={loading}
            style={{
              padding: '0.5rem 1.5rem',
              borderRadius: '9999px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--color-outline-variant)',
              color: 'var(--color-on-surface-variant)',
              fontFamily: 'var(--font-body)',
              fontSize: '0.8rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Wird geladen...' : `Mehr laden (${contracts.length} von ${total})`}
          </button>
        </div>
      )}

      {/* Kostenübersicht */}
      <KostenUebersicht contracts={contracts} />

      {/* SlideOver */}
      <ContractSlideOver
        isOpen={isSlideOverOpen}
        onClose={() => setIsSlideOverOpen(false)}
        contract={editingContract}
        onSave={async (data) => {
          if (editingContract) {
            await updateContract(editingContract.id, data);
          } else {
            await createContract(data);
          }
          await loadContracts(0, false);
          setOffset(0);
        }}
      />
    </PageWrapper>
  );
}
