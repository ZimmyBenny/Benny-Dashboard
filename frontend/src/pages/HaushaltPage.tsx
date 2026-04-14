import { useState, useEffect, useCallback } from 'react';
import { PageWrapper } from '../components/layout/PageWrapper';
import {
  fetchEintraege,
  fetchSaldo,
  fetchAbrechnungen,
  fetchAbrechnungEintraege,
  deleteEintrag,
  type HaushaltEintrag,
  type HaushaltSaldo,
  type HaushaltAbrechnung,
} from '../api/haushalt.api';
import { HaushaltSlideOver } from '../components/haushalt/HaushaltSlideOver';
import { AbrechnungsModal } from '../components/haushalt/AbrechnungsModal';

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

type Tab = 'offen' | 'abrechnungen';

const TABS: { key: Tab; label: string }[] = [
  { key: 'offen', label: 'Offen' },
  { key: 'abrechnungen', label: 'Abrechnungen' },
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
      onClick={showActions && onEdit ? onEdit : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.75rem 1rem',
        borderRadius: '0.5rem',
        background: 'var(--color-surface-container)',
        border: '1px solid var(--color-outline-variant)',
        cursor: showActions && onEdit ? 'pointer' : 'default',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { if (showActions && onEdit) (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-container-high)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-container)'; }}
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

      {/* Betrag */}
      <span style={{
        fontSize: '0.9rem',
        fontWeight: 700,
        color: istGeldubergabe ? 'var(--color-secondary)' : 'var(--color-on-surface)',
        flexShrink: 0,
      }}>
        {formatBetrag(eintrag.betrag)} EUR
      </span>

      {/* Lösch-Button */}
      {showActions && onDelete && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-outline)',
            padding: '0.25rem',
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
          }}
          title="Eintrag löschen"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>delete</span>
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HaushaltPage
// ---------------------------------------------------------------------------

export function HaushaltPage() {
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

  // Modals
  const [slideOverOpen, setSlideOverOpen] = useState(false);
  const [editEintrag, setEditEintrag] = useState<HaushaltEintrag | undefined>();
  const [abrechnungsModalOpen, setAbrechnungsModalOpen] = useState(false);

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

  // ---------------------------------------------------------------------------
  // Saldo-Banner
  // ---------------------------------------------------------------------------

  function SaldoBanner() {
    const positiv = saldo.saldo > 0;
    const neutral = saldo.saldo === 0;

    let bg: string;
    let color: string;
    let text: string;
    let icon: string;

    if (neutral) {
      bg = 'var(--color-surface-container)';
      color = 'var(--color-outline)';
      text = 'Ausgeglichen';
      icon = 'balance';
    } else if (positiv) {
      bg = 'rgba(var(--color-primary-rgb,100,255,218),0.12)';
      color = 'var(--color-primary)';
      text = `Du bekommst ${formatBetrag(Math.abs(saldo.saldo))} EUR`;
      icon = 'account_balance_wallet';
    } else {
      bg = 'rgba(251,146,60,0.12)';
      color = '#fb923c';
      text = `Du schuldest Julia ${formatBetrag(Math.abs(saldo.saldo))} EUR`;
      icon = 'payments';
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
          {icon}
        </span>
        <div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color, fontFamily: 'var(--font-display)' }}>
            {text}
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
      {/* Segment-Tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--color-surface-container)', borderRadius: '0.5rem', padding: '0.25rem', marginBottom: '1.25rem', width: 'fit-content' }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '0.4rem 1rem',
              borderRadius: '0.375rem',
              border: 'none',
              background: activeTab === tab.key ? 'var(--color-primary)' : 'transparent',
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
                background: 'var(--color-primary)',
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

      {/* SlideOver */}
      <HaushaltSlideOver
        open={slideOverOpen}
        onClose={() => setSlideOverOpen(false)}
        onSaved={ladeOffeneDaten}
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
