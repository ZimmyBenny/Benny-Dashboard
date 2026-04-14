import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageWrapper } from '../components/layout/PageWrapper';
import {
  fetchEintraege,
  fetchSaldo,
  fetchAbrechnungen,
  fetchAbrechnungEintraege,
  fetchMieteEintraege,
  deleteEintrag,
  deleteAbrechnung,
  type HaushaltEintrag,
  type HaushaltSaldo,
  type HaushaltAbrechnung,
} from '../api/haushalt.api';
import { HaushaltSlideOver } from '../components/haushalt/HaushaltSlideOver';
import { AbrechnungsModal } from '../components/haushalt/AbrechnungsModal';
import { useAuthStore } from '../store/authStore';

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function formatDatum(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function formatBetrag(betrag: number): string {
  return betrag.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const KATEGORIE_COLORS: Record<string, string> = {
  'Einkäufe': 'rgba(96,165,250,0.2)',
  'Kind': 'rgba(244,114,182,0.2)',
  'Haushalt': 'rgba(74,222,128,0.2)',
  'Freizeit': 'rgba(251,146,60,0.2)',
  'Urlaub': 'rgba(167,139,250,0.2)',
  'Nebenkosten': 'rgba(248,113,113,0.2)',
  'Miete': 'rgba(45,212,191,0.2)',
  'Sonstiges': 'rgba(156,163,175,0.2)',
};

const KATEGORIE_TEXT: Record<string, string> = {
  'Einkäufe': '#60a5fa',
  'Kind': '#f472b6',
  'Haushalt': '#4ade80',
  'Freizeit': '#fb923c',
  'Urlaub': '#a78bfa',
  'Nebenkosten': '#f87171',
  'Miete': '#2dd4bf',
  'Sonstiges': '#9ca3af',
};


// ---------------------------------------------------------------------------
// Segment-Tabs
// ---------------------------------------------------------------------------

type Tab = 'offen' | 'abrechnungen' | 'miete';

const TABS: { key: Tab; label: string }[] = [
  { key: 'offen', label: 'Offen' },
  { key: 'abrechnungen', label: 'Abrechnungen' },
  { key: 'miete', label: 'Miete bezahlt' },
];

// ---------------------------------------------------------------------------
// EintragZeile
// ---------------------------------------------------------------------------

function EintragZeile({
  eintrag,
  showActions,
  onEdit,
  onDelete,
}: {
  eintrag: HaushaltEintrag;
  showActions: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const istGeldubergabe = eintrag.eintrag_typ === 'geldübergabe';
  const andereAufteilung = eintrag.aufteilung_prozent !== 50;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.75rem 1rem',
        borderRadius: '0.5rem',
        background: 'var(--color-surface-container)',
        border: '1px solid var(--color-outline-variant)',
      }}
    >
      {/* Icon */}
      <span
        className="material-symbols-outlined"
        style={{
          fontSize: '1.25rem',
          color: istGeldubergabe ? 'var(--color-secondary)' : 'var(--color-outline)',
          flexShrink: 0,
        }}
      >
        {istGeldubergabe ? 'swap_horiz' : 'receipt'}
      </span>

      {/* Infos */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.875rem', color: 'var(--color-on-surface)', fontWeight: 500 }}>
            {eintrag.beschreibung}
          </span>
          {/* Kategorie-Badge */}
          <span style={{
            fontSize: '0.7rem',
            padding: '0.1rem 0.4rem',
            borderRadius: '9999px',
            background: KATEGORIE_COLORS[eintrag.kategorie] ?? 'rgba(156,163,175,0.2)',
            color: KATEGORIE_TEXT[eintrag.kategorie] ?? '#9ca3af',
          }}>
            {eintrag.kategorie}
          </span>
          {/* Bezahlt-von Badge */}
          <span style={{
            fontSize: '0.7rem',
            padding: '0.1rem 0.4rem',
            borderRadius: '9999px',
            background: eintrag.bezahlt_von === 'benny' ? 'rgba(var(--color-primary-rgb,100,255,218),0.15)' : 'rgba(167,139,250,0.15)',
            color: eintrag.bezahlt_von === 'benny' ? 'var(--color-primary)' : '#a78bfa',
            border: `1px solid ${eintrag.bezahlt_von === 'benny' ? 'var(--color-primary)' : '#a78bfa'}`,
          }}>
            {eintrag.bezahlt_von === 'benny' ? 'Benny' : 'Julia'}
          </span>
          {/* Aufteilung */}
          {andereAufteilung && (
            <span style={{ fontSize: '0.7rem', color: 'var(--color-outline)' }}>
              {eintrag.aufteilung_prozent}/{100 - eintrag.aufteilung_prozent}
            </span>
          )}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--color-outline)', marginTop: '0.2rem' }}>
          {formatDatum(eintrag.datum)}
          {eintrag.zahlungsart && ` · ${eintrag.zahlungsart}`}
          {eintrag.zeitraum_von && ` · ${formatDatum(eintrag.zeitraum_von)}–${formatDatum(eintrag.zeitraum_bis ?? '')}`}
        </div>
      </div>

      {/* Betrag + Einzelbeträge */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{
          fontSize: '0.9rem',
          fontWeight: 700,
          color: istGeldubergabe ? 'var(--color-secondary)' : 'var(--color-on-surface)',
        }}>
          {formatBetrag(eintrag.betrag)} EUR
        </div>
        {eintrag.einzelbetraege && (() => {
          try {
            const betraege: number[] = JSON.parse(eintrag.einzelbetraege!);
            if (betraege.length > 1) {
              return (
                <div style={{ fontSize: '0.7rem', color: 'var(--color-outline)', marginTop: '0.1rem' }}>
                  {betraege.map(b => b.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })).join(' + ')}
                </div>
              );
            }
          } catch { return null; }
          return null;
        })()}
      </div>

      {/* Aktions-Buttons */}
      {showActions && (
        <div style={{ display: 'flex', gap: '0.125rem', flexShrink: 0 }}>
          {onEdit && (
            <button
              onClick={e => { e.stopPropagation(); onEdit(); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-outline)', padding: '0.25rem', display: 'flex', alignItems: 'center' }}
              title="Eintrag bearbeiten"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>edit</span>
            </button>
          )}
          {onDelete && (
            <button
              onClick={e => { e.stopPropagation(); onDelete(); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-outline)', padding: '0.25rem', display: 'flex', alignItems: 'center' }}
              title="Eintrag löschen"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>delete</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HaushaltPage
// ---------------------------------------------------------------------------

export function HaushaltPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('offen');

  // Offene Eintraege
  const [eintraege, setEintraege] = useState<HaushaltEintrag[]>([]);
  const [saldo, setSaldo] = useState<HaushaltSaldo>({ saldo: 0, julia_schuldet: 0, benny_schuldet: 0, offene_eintraege: 0 });
  const [loadingEintraege, setLoadingEintraege] = useState(false);

  // Abrechnungen
  const [abrechnungen, setAbrechnungen] = useState<HaushaltAbrechnung[]>([]);
  const [loadingAbrechnungen, setLoadingAbrechnungen] = useState(false);
  const [expandedAbrechnung, setExpandedAbrechnung] = useState<number | null>(null);
  const [abrechnungEintraege, setAbrechnungEintraege] = useState<Record<number, HaushaltEintrag[]>>({});

  // Miete-Tab
  const [mieteEintraege, setMieteEintraege] = useState<HaushaltEintrag[]>([]);
  const [loadingMiete, setLoadingMiete] = useState(false);

  // CSV-Export
  const [exportOpen, setExportOpen] = useState(false);
  const token = useAuthStore(s => s.token);

  async function csvExport(scope: 'all' | 'offen' | 'abrechnungen' | 'miete') {
    setExportOpen(false);
    try {
      const res = await fetch(`/api/haushalt/export/csv?scope=${scope}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers.get('content-disposition') ?? '';
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match ? match[1] : `haushalt_${scope}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('CSV-Export Fehler:', err);
    }
  }

  // Modals
  const [slideOverOpen, setSlideOverOpen] = useState(false);
  const [editEintrag, setEditEintrag] = useState<HaushaltEintrag | undefined>();
  const [abrechnungsModalOpen, setAbrechnungsModalOpen] = useState(false);

  // Auto-öffnen wenn vom Dashboard per state: { openNew: true } navigiert
  // State sofort löschen damit Refresh nicht erneut öffnet
  useEffect(() => {
    if ((location.state as { openNew?: boolean } | null)?.openNew) {
      setEditEintrag(undefined);
      setSlideOverOpen(true);
      navigate('.', { replace: true, state: {} });
    }
  }, [location.state, navigate]);

  // ---------------------------------------------------------------------------
  // Datenladen
  // ---------------------------------------------------------------------------

  const ladeOffeneDaten = useCallback(async () => {
    setLoadingEintraege(true);
    try {
      const [eintraegeData, saldoData] = await Promise.all([fetchEintraege(), fetchSaldo()]);
      setEintraege(eintraegeData);
      setSaldo(saldoData);
    } catch (err) {
      console.error('Fehler beim Laden der Einträge:', err);
    } finally {
      setLoadingEintraege(false);
    }
  }, []);

  const ladeAbrechnungen = useCallback(async () => {
    setLoadingAbrechnungen(true);
    try {
      const data = await fetchAbrechnungen();
      setAbrechnungen(data);
    } catch (err) {
      console.error('Fehler beim Laden der Abrechnungen:', err);
    } finally {
      setLoadingAbrechnungen(false);
    }
  }, []);

  useEffect(() => {
    ladeOffeneDaten();
  }, [ladeOffeneDaten]);

  useEffect(() => {
    if (activeTab === 'abrechnungen') {
      ladeAbrechnungen();
    }
  }, [activeTab, ladeAbrechnungen]);

  const ladeMiete = useCallback(async () => {
    setLoadingMiete(true);
    try {
      const data = await fetchMieteEintraege();
      setMieteEintraege(data);
    } catch (err) {
      console.error('Fehler beim Laden der Miete-Einträge:', err);
    } finally {
      setLoadingMiete(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'miete') {
      ladeMiete();
    }
  }, [activeTab, ladeMiete]);

  // ---------------------------------------------------------------------------
  // Abrechnung aufklappen → Eintraege laden
  // ---------------------------------------------------------------------------

  async function toggleAbrechnung(id: number) {
    if (expandedAbrechnung === id) {
      setExpandedAbrechnung(null);
      return;
    }
    setExpandedAbrechnung(id);
    if (!abrechnungEintraege[id]) {
      try {
        const data = await fetchAbrechnungEintraege(id);
        setAbrechnungEintraege(prev => ({ ...prev, [id]: data }));
      } catch (err) {
        console.error('Fehler beim Laden der Abrechnungs-Einträge:', err);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Eintrag löschen
  // ---------------------------------------------------------------------------

  async function handleDelete(eintrag: HaushaltEintrag) {
    if (!window.confirm(`Eintrag "${eintrag.beschreibung}" wirklich löschen?`)) return;
    try {
      await deleteEintrag(eintrag.id);
      await ladeOffeneDaten();
    } catch (err) {
      console.error('Fehler beim Löschen:', err);
    }
  }

  async function handleDeleteAbrechnung(ab: { id: number; titel: string }) {
    if (!window.confirm(`Abrechnung "${ab.titel}" wirklich löschen? Die Einträge werden wieder als offen markiert.`)) return;
    try {
      await deleteAbrechnung(ab.id);
      await Promise.all([ladeAbrechnungen(), ladeOffeneDaten()]);
      setExpandedAbrechnung(null);
    } catch (err) {
      console.error('Fehler beim Löschen der Abrechnung:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Saldo-Banner
  // ---------------------------------------------------------------------------

  function SaldoBanner() {
    const neutral = saldo.saldo === 0;
    // saldo > 0 → Julia schuldet Benny (Julia → Benny)
    // saldo < 0 → Benny schuldet Julia (Benny → Julia)
    const juliaSculdet = saldo.saldo > 0;

    let bg: string;
    let color: string;
    let hauptzeile: string;
    let richtung: string | null;

    if (neutral) {
      bg = 'var(--color-surface-container)';
      color = 'var(--color-outline)';
      hauptzeile = 'Ausgeglichen';
      richtung = null;
    } else if (juliaSculdet) {
      bg = 'rgba(100,255,218,0.08)';
      color = 'var(--color-primary)';
      hauptzeile = `${formatBetrag(Math.abs(saldo.saldo))} € offen`;
      richtung = 'Julia → Benny';
    } else {
      bg = 'rgba(251,146,60,0.1)';
      color = '#fb923c';
      hauptzeile = `${formatBetrag(Math.abs(saldo.saldo))} € offen`;
      richtung = 'Benny → Julia';
    }

    return (
      <div style={{
        background: bg,
        border: `1px solid ${color}`,
        borderRadius: '0.75rem',
        padding: '1rem 1.25rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.875rem',
        marginBottom: '1rem',
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: '1.75rem', color }}>
          {neutral ? 'balance' : juliaSculdet ? 'account_balance_wallet' : 'payments'}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, color, fontFamily: 'var(--font-display)' }}>
            {hauptzeile}
            {richtung && (
              <span style={{ marginLeft: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>
                — {richtung}
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-outline)', marginTop: '0.15rem' }}>
            {saldo.offene_eintraege} offene {saldo.offene_eintraege === 1 ? 'Eintrag' : 'Einträge'}
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <PageWrapper>
      {/* Seitentitel */}
      <h1 className="gradient-text" style={{
        fontFamily: 'var(--font-headline)',
        fontSize: '1.5rem',
        fontWeight: 800,
        marginBottom: '1.25rem',
        letterSpacing: '-0.01em',
      }}>
        Haushalt
      </h1>

      {/* Segment-Tabs + Export */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--color-surface-container)', borderRadius: '0.5rem', padding: '0.25rem' }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '0.4rem 1rem',
                borderRadius: '0.375rem',
                border: 'none',
                background: activeTab === tab.key ? 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dim) 100%)' : 'transparent',
                color: activeTab === tab.key ? 'var(--color-on-primary)' : 'var(--color-outline)',
                fontFamily: 'var(--font-body)',
                fontSize: '0.875rem',
                fontWeight: activeTab === tab.key ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* CSV-Export Dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setExportOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.375rem',
              padding: '0.4rem 0.75rem', borderRadius: '0.5rem',
              border: '1px solid var(--color-outline-variant)',
              background: 'var(--color-surface-container)',
              color: 'var(--color-outline)',
              fontFamily: 'var(--font-body)', fontSize: '0.8rem', cursor: 'pointer',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }}>download</span>
            CSV
          </button>
          {exportOpen && (
            <>
              <div onClick={() => setExportOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
              <div style={{
                position: 'absolute', top: 'calc(100% + 0.375rem)', left: 0,
                zIndex: 20, minWidth: '160px',
                background: 'var(--color-surface-container-high)',
                border: '1px solid var(--color-outline-variant)',
                borderRadius: '0.5rem', overflow: 'hidden',
                boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              }}>
                {([
                  { scope: 'all', label: 'Alles exportieren' },
                  { scope: 'offen', label: 'Nur Offen' },
                  { scope: 'abrechnungen', label: 'Abrechnungen' },
                  { scope: 'miete', label: 'Miete' },
                ] as const).map(opt => (
                  <button
                    key={opt.scope}
                    onClick={() => csvExport(opt.scope)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '0.6rem 1rem', border: 'none',
                      background: 'none', color: 'var(--color-on-surface)',
                      fontFamily: 'var(--font-body)', fontSize: '0.85rem', cursor: 'pointer',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-container)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Tab: Offen ── */}
      {activeTab === 'offen' && (
        <div>
          <SaldoBanner />

          {/* Button-Leiste */}
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
            <button
              onClick={() => { setEditEintrag(undefined); setSlideOverOpen(true); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                padding: '0.5rem 1rem',
                borderRadius: '0.5rem',
                border: 'none',
                background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dim) 100%)',
                color: 'var(--color-on-primary)',
                fontFamily: 'var(--font-body)',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>add</span>
              Eintrag
            </button>

            {saldo.offene_eintraege > 0 && (
              <button
                onClick={() => setAbrechnungsModalOpen(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  padding: '0.5rem 1rem',
                  borderRadius: '0.5rem',
                  border: '1px solid var(--color-outline-variant)',
                  background: 'var(--color-surface-container)',
                  color: 'var(--color-on-surface)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>receipt_long</span>
                Abrechnung erstellen
              </button>
            )}
          </div>

          {/* Eintraege-Liste */}
          {loadingEintraege ? (
            <div style={{ color: 'var(--color-outline)', fontSize: '0.875rem', padding: '2rem 0', textAlign: 'center' }}>
              Wird geladen…
            </div>
          ) : eintraege.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '3rem 1rem',
              color: 'var(--color-outline)',
              fontSize: '0.875rem',
              background: 'var(--color-surface-container)',
              borderRadius: '0.75rem',
              border: '1px solid var(--color-outline-variant)',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem', opacity: 0.5 }}>receipt</span>
              Noch keine Einträge vorhanden
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {eintraege.map(e => (
                <EintragZeile
                  key={e.id}
                  eintrag={e}
                  showActions={true}
                  onEdit={() => { setEditEintrag(e); setSlideOverOpen(true); }}
                  onDelete={() => handleDelete(e)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Abrechnungen ── */}
      {activeTab === 'abrechnungen' && (
        <div>
          {loadingAbrechnungen ? (
            <div style={{ color: 'var(--color-outline)', fontSize: '0.875rem', padding: '2rem 0', textAlign: 'center' }}>
              Wird geladen…
            </div>
          ) : abrechnungen.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '3rem 1rem',
              color: 'var(--color-outline)',
              fontSize: '0.875rem',
              background: 'var(--color-surface-container)',
              borderRadius: '0.75rem',
              border: '1px solid var(--color-outline-variant)',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem', opacity: 0.5 }}>receipt_long</span>
              Noch keine Abrechnungen vorhanden
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {abrechnungen.map(ab => {
                const expanded = expandedAbrechnung === ab.id;
                const saldoPositiv = ab.ausgleich_betrag > 0;
                const saldoNeutral = ab.ausgleich_betrag === 0;

                return (
                  <div
                    key={ab.id}
                    style={{
                      background: 'var(--color-surface-container)',
                      border: '1px solid var(--color-outline-variant)',
                      borderRadius: '0.75rem',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Abrechnung-Header */}
                    <div
                      onClick={() => toggleAbrechnung(ab.id)}
                      style={{
                        padding: '0.875rem 1rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        userSelect: 'none',
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ color: 'var(--color-outline)', fontSize: '1.25rem', flexShrink: 0 }}>
                        receipt_long
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-on-surface)' }}>
                          {ab.titel}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-outline)', marginTop: '0.15rem' }}>
                          {formatDatum(ab.datum)} · {ab.eintraege_count} {ab.eintraege_count === 1 ? 'Eintrag' : 'Einträge'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{
                          fontSize: '0.875rem',
                          fontWeight: 700,
                          color: saldoNeutral
                            ? 'var(--color-outline)'
                            : saldoPositiv
                            ? 'var(--color-primary)'
                            : '#fb923c',
                        }}>
                          {saldoPositiv ? '+' : ''}{formatBetrag(ab.ausgleich_betrag)} EUR
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-outline)' }}>
                          {saldoNeutral ? 'Ausgeglichen' : saldoPositiv ? 'Julia → Benny' : 'Benny → Julia'}
                        </div>
                      </div>
                      <span className="material-symbols-outlined" style={{ color: 'var(--color-outline)', fontSize: '1rem' }}>
                        {expanded ? 'expand_less' : 'expand_more'}
                      </span>
                      <button
                        onClick={e => { e.stopPropagation(); handleDeleteAbrechnung(ab); }}
                        title="Abrechnung löschen"
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--color-outline)',
                          padding: '0.25rem',
                          display: 'flex',
                          alignItems: 'center',
                          flexShrink: 0,
                          marginLeft: '0.25rem',
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>delete</span>
                      </button>
                    </div>

                    {/* Expandiert: Eintraege */}
                    {expanded && (
                      <div style={{ borderTop: '1px solid var(--color-outline-variant)', padding: '0.75rem' }}>
                        {ab.notiz && (
                          <p style={{ fontSize: '0.8rem', color: 'var(--color-outline)', marginBottom: '0.75rem', fontStyle: 'italic' }}>
                            {ab.notiz}
                          </p>
                        )}
                        {!abrechnungEintraege[ab.id] ? (
                          <div style={{ fontSize: '0.8rem', color: 'var(--color-outline)', textAlign: 'center', padding: '1rem' }}>
                            Wird geladen…
                          </div>
                        ) : abrechnungEintraege[ab.id].length === 0 ? (
                          <div style={{ fontSize: '0.8rem', color: 'var(--color-outline)', textAlign: 'center', padding: '1rem' }}>
                            Keine Einträge
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            {abrechnungEintraege[ab.id].map(e => (
                              <EintragZeile
                                key={e.id}
                                eintrag={e}
                                showActions={false}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Miete bezahlt ── */}
      {activeTab === 'miete' && (
        <div>
          {loadingMiete ? (
            <div style={{ color: 'var(--color-outline)', fontSize: '0.875rem', padding: '2rem 0', textAlign: 'center' }}>
              Wird geladen…
            </div>
          ) : mieteEintraege.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '3rem 1rem',
              color: 'var(--color-outline)',
              fontSize: '0.875rem',
              background: 'var(--color-surface-container)',
              borderRadius: '0.75rem',
              border: '1px solid var(--color-outline-variant)',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem', opacity: 0.5 }}>home</span>
              Noch keine Mietzahlungen eingetragen
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {mieteEintraege.map(e => (
                <div
                  key={e.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.75rem 1rem',
                    borderRadius: '0.5rem',
                    background: 'rgba(45,212,191,0.06)',
                    border: '1px solid #2dd4bf',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', color: '#2dd4bf', flexShrink: 0 }}>
                    check_circle
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#2dd4bf' }}>
                      {e.beschreibung}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-outline)', marginTop: '0.1rem' }}>
                      Eingetragen: {formatDatum(e.datum)}
                    </div>
                  </div>
                  <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#2dd4bf', flexShrink: 0 }}>
                    {formatBetrag(e.betrag)} EUR
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Neuen Miete-Eintrag direkt erfassen */}
          <div style={{ marginTop: '1.25rem' }}>
            <button
              onClick={() => { setEditEintrag(undefined); setSlideOverOpen(true); }}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.375rem',
                padding: '0.5rem 1rem', borderRadius: '0.5rem', border: 'none',
                background: '#2dd4bf', color: '#0f172a',
                fontFamily: 'var(--font-body)', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>add</span>
              Miete eintragen
            </button>
          </div>
        </div>
      )}

      {/* SlideOver */}
      <HaushaltSlideOver
        open={slideOverOpen}
        onClose={() => setSlideOverOpen(false)}
        onSaved={() => { ladeOffeneDaten(); ladeMiete(); }}
        eintrag={editEintrag}
      />

      {/* AbrechnungsModal */}
      <AbrechnungsModal
        open={abrechnungsModalOpen}
        onClose={() => setAbrechnungsModalOpen(false)}
        onCreated={async () => { await ladeOffeneDaten(); await ladeAbrechnungen(); }}
        saldo={saldo}
        eintraege={eintraege}
      />
    </PageWrapper>
  );
}
