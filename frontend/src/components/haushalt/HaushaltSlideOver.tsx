import { useState } from 'react';
import type { HaushaltEintrag } from '../../api/haushalt.api';
import { createEintrag, updateEintrag } from '../../api/haushalt.api';
import { useDraggableModal } from '../../hooks/useDraggableModal';

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Wizard-Schritte & FormState
// ---------------------------------------------------------------------------

type WizardStep = 'typ' | 'datum' | 'betrag' | 'kategorie' | 'monat' | 'wer_bezahlt' | 'aufteilung';

const SCHRITTE_AUSGABE: WizardStep[] = ['typ', 'datum', 'betrag', 'kategorie', 'wer_bezahlt', 'aufteilung'];
const SCHRITTE_MIETE_TYP: WizardStep[] = ['typ', 'monat'];
const SCHRITTE_GELDÜBERGABE: WizardStep[] = ['typ', 'datum', 'betrag', 'wer_bezahlt'];

function currentMonthIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatMietmonat(monat: string): string {
  if (!monat) return 'Miete';
  const [year, month] = monat.split('-');
  const monthNames = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  return `Miete ${monthNames[parseInt(month, 10) - 1]} ${year}`;
}

const KATEGORIEN = ['Einkäufe', 'Kind', 'Haushalt', 'Freizeit', 'Urlaub', 'Nebenkosten', 'Sonstiges'];

const KAT_FARBEN: Record<string, string> = {
  'Einkäufe': '#60a5fa',
  'Kind': '#f472b6',
  'Haushalt': '#4ade80',
  'Freizeit': '#fb923c',
  'Urlaub': '#a78bfa',
  'Nebenkosten': '#f87171',
  'Miete': '#2dd4bf',
  'Sonstiges': '#9ca3af',
};

type AufteilungModus = '50_50' | 'benny_alles' | 'julia_alles' | 'andere';

interface FormState {
  datum: string;
  betrag: string;
  kategorie: string;
  sonstigesText: string; // Freitext wenn Kategorie = "Sonstiges"
  mietmonat: string;     // ISO "YYYY-MM" wenn Kategorie = "Miete"
  bezahlt_von: 'benny' | 'julia';
  eintrag_typ: 'ausgabe' | 'geldübergabe';
  aufteilung_modus: AufteilungModus;
  aufteilung_prozent: number; // Bennys Anteil
}

function eintragToForm(eintrag?: HaushaltEintrag): FormState {
  if (!eintrag) {
    return {
      datum: todayIso(),
      betrag: '',
      kategorie: 'Haushalt',
      sonstigesText: '',
      mietmonat: currentMonthIso(),
      bezahlt_von: 'benny',
      eintrag_typ: 'ausgabe',
      aufteilung_modus: '50_50',
      aufteilung_prozent: 50,
    };
  }
  let aufteilung_modus: AufteilungModus = '50_50';
  if (eintrag.aufteilung_prozent === 100) aufteilung_modus = 'benny_alles';
  else if (eintrag.aufteilung_prozent === 0) aufteilung_modus = 'julia_alles';
  else if (eintrag.aufteilung_prozent !== 50) aufteilung_modus = 'andere';

  return {
    datum: eintrag.datum,
    betrag: String(eintrag.betrag),
    kategorie: eintrag.kategorie,
    sonstigesText: eintrag.kategorie === 'Sonstiges' ? eintrag.beschreibung : '',
    mietmonat: currentMonthIso(),
    bezahlt_von: eintrag.bezahlt_von,
    eintrag_typ: eintrag.eintrag_typ,
    aufteilung_modus,
    aufteilung_prozent: eintrag.aufteilung_prozent,
  };
}

function aufteilungZuProzent(modus: AufteilungModus, custom: number): number {
  if (modus === '50_50') return 50;
  if (modus === 'benny_alles') return 100;
  if (modus === 'julia_alles') return 0;
  return custom;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HaushaltSlideOverProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  eintrag?: HaushaltEintrag;
}

// ---------------------------------------------------------------------------
// ModalContent — wird nur bei open=true gemountet (setzt Drag-State zurück)
// ---------------------------------------------------------------------------

function ModalContent({
  onClose,
  onSaved,
  eintrag,
}: Omit<HaushaltSlideOverProps, 'open'>) {
  const isEditMode = !!eintrag;
  const [form, setForm] = useState<FormState>(() => eintragToForm(eintrag));
  const [schritt, setSchritt] = useState<WizardStep>('typ');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Set<string>>(new Set());

  const { onMouseDown, modalStyle, headerStyle } = useDraggableModal();

  const isMieteTyp = form.eintrag_typ === 'geldübergabe' && form.kategorie === 'Miete';
  const schritte = isMieteTyp
    ? SCHRITTE_MIETE_TYP
    : form.eintrag_typ === 'geldübergabe'
    ? SCHRITTE_GELDÜBERGABE
    : SCHRITTE_AUSGABE;
  const schrittIdx = schritte.indexOf(schritt);
  const istLetzterSchritt = schrittIdx === schritte.length - 1;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function validateSchritt(): boolean {
    const errs = new Set<string>();
    if (schritt === 'datum' && !form.datum) errs.add('datum');
    if (schritt === 'betrag') {
      if (!form.betrag || isNaN(parseFloat(form.betrag)) || parseFloat(form.betrag) <= 0) errs.add('betrag');
    }
    if (schritt === 'kategorie' && form.kategorie === 'Sonstiges' && !form.sonstigesText.trim()) {
      errs.add('sonstiges');
    }
    setErrors(errs);
    return errs.size === 0;
  }

  function weiter() {
    if (!validateSchritt()) return;
    const nextIdx = schrittIdx + 1;
    if (nextIdx < schritte.length) setSchritt(schritte[nextIdx]);
  }

  function zurueck() {
    const prevIdx = schrittIdx - 1;
    if (prevIdx >= 0) {
      setSchritt(schritte[prevIdx]);
      setErrors(new Set());
    }
  }

  async function handleSave() {
    if (!validateSchritt()) return;
    setSaving(true);
    try {
      const prozent = aufteilungZuProzent(form.aufteilung_modus, form.aufteilung_prozent);
      const beschreibung = isMieteTyp
        ? formatMietmonat(form.mietmonat)
        : form.eintrag_typ === 'geldübergabe'
        ? 'Geldübergabe'
        : form.kategorie === 'Sonstiges'
        ? form.sonstigesText.trim()
        : form.kategorie;
      const payload: Partial<HaushaltEintrag> = {
        datum: isMieteTyp ? todayIso() : form.datum,
        betrag: isMieteTyp ? 100 : parseFloat(form.betrag),
        beschreibung,
        kategorie: (isMieteTyp ? 'Miete' : form.eintrag_typ === 'geldübergabe' ? 'Sonstiges' : form.kategorie) as HaushaltEintrag['kategorie'],
        bezahlt_von: isMieteTyp ? 'benny' : form.bezahlt_von,
        eintrag_typ: form.eintrag_typ,
        aufteilung_prozent: form.eintrag_typ === 'geldübergabe' ? 100 : prozent,
        zahlungsart: null,
        zeitraum_von: null,
        zeitraum_bis: null,
      };
      if (eintrag) {
        await updateEintrag(eintrag.id, payload);
      } else {
        await createEintrag(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      console.error('Fehler beim Speichern:', err);
    } finally {
      setSaving(false);
    }
  }

  const betragNum = parseFloat(form.betrag);
  const prozent = aufteilungZuProzent(form.aufteilung_modus, form.aufteilung_prozent);
  const bennyAnteil = isNaN(betragNum) ? 0 : (betragNum * prozent) / 100;
  const juliaAnteil = isNaN(betragNum) ? 0 : betragNum - bennyAnteil;

  const BTN: React.CSSProperties = {
    fontFamily: 'var(--font-body)',
    fontSize: '0.875rem',
    borderRadius: '0.625rem',
    cursor: 'pointer',
    transition: 'all 0.15s',
  };

  return (
    <div
      data-draggable-modal
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '400px',
        maxWidth: 'calc(100vw - 2rem)',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-outline-variant)',
        borderRadius: '1rem',
        zIndex: 50,
        boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
        overflow: 'hidden',
        ...modalStyle,
      }}
    >
      {/* Header (verschiebbar) */}
      <div
        onMouseDown={onMouseDown}
        style={{
          padding: '0.875rem 1.25rem',
          borderBottom: '1px solid var(--color-outline-variant)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--color-surface-container)',
          ...headerStyle,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '0.95rem', fontFamily: 'var(--font-display)', color: 'var(--color-on-surface)' }}>
            {isEditMode ? 'Eintrag bearbeiten' : 'Neuer Eintrag'}
          </h2>
          {/* Schritt-Fortschrittsbalken */}
          <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.375rem' }}>
            {schritte.map((s, i) => (
              <div
                key={s}
                style={{
                  width: '1.25rem',
                  height: '3px',
                  borderRadius: '9999px',
                  background: i <= schrittIdx ? 'var(--color-primary)' : 'var(--color-outline-variant)',
                  transition: 'background 0.2s',
                }}
              />
            ))}
          </div>
        </div>
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-outline)',
            cursor: 'pointer',
            padding: '0.25rem',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '1.25rem' }}>close</span>
        </button>
      </div>

      {/* Schritt-Inhalt */}
      <div style={{ padding: '1.5rem 1.25rem', minHeight: '220px' }}>

        {/* ── Schritt 1: Typ ── */}
        {schritt === 'typ' && (
          <div>
            <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-outline)', marginBottom: '1rem', marginTop: 0 }}>
              Was möchtest du eintragen?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {/* Ausgabe */}
              {(() => {
                const aktiv = form.eintrag_typ === 'ausgabe';
                const farbe = 'var(--color-primary)';
                return (
                  <button
                    onClick={() => setForm(prev => ({ ...prev, eintrag_typ: 'ausgabe', kategorie: prev.kategorie === 'Miete' ? 'Haushalt' : prev.kategorie }))}
                    style={{ ...BTN, padding: '1.1rem 1rem', border: `2px solid ${aktiv ? farbe : 'var(--color-outline-variant)'}`, background: aktiv ? 'rgba(100,255,218,0.08)' : 'var(--color-surface-container)', color: 'var(--color-on-surface)', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '1rem' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '1.5rem', color: aktiv ? farbe : 'var(--color-outline)', flexShrink: 0 }}>receipt</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Ausgabe</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-outline)', marginTop: '0.15rem' }}>Einkauf, Rechnung, geteilte Kosten</div>
                    </div>
                  </button>
                );
              })()}

              {/* Geldübergabe */}
              {(() => {
                const aktiv = form.eintrag_typ === 'geldübergabe' && form.kategorie !== 'Miete';
                const farbe = 'var(--color-secondary)';
                return (
                  <button
                    onClick={() => setForm(prev => ({ ...prev, eintrag_typ: 'geldübergabe', kategorie: prev.kategorie === 'Miete' ? 'Haushalt' : prev.kategorie }))}
                    style={{ ...BTN, padding: '1.1rem 1rem', border: `2px solid ${aktiv ? farbe : 'var(--color-outline-variant)'}`, background: aktiv ? 'rgba(130,170,255,0.08)' : 'var(--color-surface-container)', color: 'var(--color-on-surface)', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '1rem' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '1.5rem', color: aktiv ? farbe : 'var(--color-outline)', flexShrink: 0 }}>swap_horiz</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Geldübergabe</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-outline)', marginTop: '0.15rem' }}>Ausgleich, direkte Zahlung</div>
                    </div>
                  </button>
                );
              })()}

              {/* Miete */}
              {(() => {
                const aktiv = form.kategorie === 'Miete';
                const farbe = '#2dd4bf';
                return (
                  <button
                    onClick={() => setForm(prev => ({ ...prev, eintrag_typ: 'geldübergabe', kategorie: 'Miete', bezahlt_von: 'benny' }))}
                    style={{ ...BTN, padding: '1.1rem 1rem', border: `2px solid ${aktiv ? farbe : 'var(--color-outline-variant)'}`, background: aktiv ? 'rgba(45,212,191,0.08)' : 'var(--color-surface-container)', color: 'var(--color-on-surface)', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '1rem' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '1.5rem', color: aktiv ? farbe : 'var(--color-outline)', flexShrink: 0 }}>home</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Miete</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-outline)', marginTop: '0.15rem' }}>100 € · Benny → Julia</div>
                    </div>
                  </button>
                );
              })()}
            </div>
          </div>
        )}

        {/* ── Schritt 2: Datum ── */}
        {schritt === 'datum' && (
          <div>
            <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-outline)', marginBottom: '1rem', marginTop: 0 }}>
              Wann?
            </p>
            <input
              type="date"
              value={form.datum}
              onChange={e => set('datum', e.target.value)}
              autoFocus
              style={{
                width: '100%',
                background: 'var(--color-surface-container-low)',
                border: `1px solid ${errors.has('datum') ? 'var(--color-error)' : 'var(--color-outline-variant)'}`,
                borderRadius: '0.5rem',
                color: 'var(--color-on-surface)',
                fontFamily: 'var(--font-body)',
                fontSize: '1rem',
                padding: '0.75rem',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {errors.has('datum') && (
              <p style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: '0.25rem' }}>Datum ist erforderlich</p>
            )}
          </div>
        )}

        {/* ── Schritt 3: Betrag ── */}
        {schritt === 'betrag' && (
          <div>
            <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-outline)', marginBottom: '0.625rem', marginTop: 0 }}>
              Betrag (EUR)
            </p>
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0,00"
              value={form.betrag}
              onChange={e => set('betrag', e.target.value)}
              autoFocus
              style={{
                width: '100%',
                background: 'var(--color-surface-container-low)',
                border: `1px solid ${errors.has('betrag') ? 'var(--color-error)' : 'var(--color-outline-variant)'}`,
                borderRadius: '0.5rem',
                color: 'var(--color-on-surface)',
                fontFamily: 'var(--font-display)',
                fontSize: '1.5rem',
                padding: '0.625rem 0.75rem',
                outline: 'none',
                boxSizing: 'border-box',
                textAlign: 'right',
              }}
            />
            {errors.has('betrag') && (
              <p style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: '0.25rem' }}>Gültiger Betrag erforderlich</p>
            )}
          </div>
        )}

        {/* ── Schritt 4: Kategorie ── */}
        {schritt === 'kategorie' && (
          <div>
            <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-outline)', marginBottom: '1rem', marginTop: 0 }}>
              Kategorie
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
              {KATEGORIEN.map(kat => {
                const farbe = KAT_FARBEN[kat] ?? '#9ca3af';
                const aktiv = form.kategorie === kat;
                return (
                  <button
                    key={kat}
                    onClick={() => {
                      set('kategorie', kat);
                      if (kat === 'Miete') set('bezahlt_von', 'benny');
                    }}
                    style={{
                      ...BTN,
                      padding: '0.75rem 0.5rem',
                      border: `2px solid ${aktiv ? farbe : 'var(--color-outline-variant)'}`,
                      background: aktiv ? `${farbe}18` : 'var(--color-surface-container)',
                      color: aktiv ? farbe : 'var(--color-on-surface)',
                      fontWeight: aktiv ? 600 : 400,
                    }}
                  >
                    {kat}
                  </button>
                );
              })}
            </div>
            {/* Freitext bei "Sonstiges" */}
            {form.kategorie === 'Sonstiges' && (
              <div style={{ marginTop: '0.875rem' }}>
                <input
                  type="text"
                  placeholder="Was wurde bezahlt?"
                  value={form.sonstigesText}
                  onChange={e => set('sonstigesText', e.target.value)}
                  autoFocus
                  style={{
                    width: '100%',
                    background: 'var(--color-surface-container-low)',
                    border: `1px solid ${errors.has('sonstiges') ? 'var(--color-error)' : 'var(--color-outline-variant)'}`,
                    borderRadius: '0.5rem',
                    color: 'var(--color-on-surface)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.875rem',
                    padding: '0.625rem 0.75rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                {errors.has('sonstiges') && (
                  <p style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: '0.25rem' }}>Bitte kurz beschreiben</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Schritt Monat (nur bei Miete) ── */}
        {schritt === 'monat' && (
          <div>
            <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-outline)', marginBottom: '1rem', marginTop: 0 }}>
              Für welchen Monat?
            </p>
            <input
              type="month"
              value={form.mietmonat}
              onChange={e => set('mietmonat', e.target.value)}
              autoFocus
              style={{
                width: '100%',
                background: 'var(--color-surface-container-low)',
                border: '1px solid var(--color-outline-variant)',
                borderRadius: '0.5rem',
                color: 'var(--color-on-surface)',
                fontFamily: 'var(--font-body)',
                fontSize: '1rem',
                padding: '0.75rem',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {form.mietmonat && (
              <p style={{ fontSize: '0.8rem', color: 'var(--color-primary)', marginTop: '0.625rem', fontWeight: 600 }}>
                {formatMietmonat(form.mietmonat)}
              </p>
            )}
          </div>
        )}

        {/* ── Schritt 5: Wer hat bezahlt ── */}
        {schritt === 'wer_bezahlt' && (
          <div>
            <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-outline)', marginBottom: '1rem', marginTop: 0 }}>
              {form.eintrag_typ === 'geldübergabe' ? 'Wer hat übergeben?' : 'Wer hat bezahlt?'}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              {([
                ['benny', 'Benny', 'var(--color-primary)', 'rgba(100,255,218,0.08)'],
                ['julia', 'Julia', '#a78bfa', 'rgba(167,139,250,0.08)'],
              ] as const).map(([val, label, farbe, bg]) => (
                <button
                  key={val}
                  onClick={() => set('bezahlt_von', val)}
                  style={{
                    ...BTN,
                    flex: 1,
                    padding: '1.25rem 0.75rem',
                    border: `2px solid ${form.bezahlt_von === val ? farbe : 'var(--color-outline-variant)'}`,
                    background: form.bezahlt_von === val ? bg : 'var(--color-surface-container)',
                    color: form.bezahlt_von === val ? farbe : 'var(--color-on-surface)',
                    fontWeight: 600,
                    fontSize: '1rem',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Schritt 6: Aufteilung ── */}
        {schritt === 'aufteilung' && (
          <div>
            <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-outline)', marginBottom: '1rem', marginTop: 0 }}>
              Aufteilung
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {([
                ['50_50', '50 / 50', 'Zu gleichen Teilen'],
                ['benny_alles', 'Benny trägt alles', '100 % Benny'],
                ['julia_alles', 'Julia trägt alles', '100 % Julia'],
                ['andere', 'Andere Aufteilung', 'Prozentsatz wählen'],
              ] as const).map(([modus, label, sub]) => (
                <button
                  key={modus}
                  onClick={() => set('aufteilung_modus', modus)}
                  style={{
                    ...BTN,
                    padding: '0.875rem 1rem',
                    border: `2px solid ${form.aufteilung_modus === modus ? 'var(--color-primary)' : 'var(--color-outline-variant)'}`,
                    background: form.aufteilung_modus === modus ? 'rgba(100,255,218,0.08)' : 'var(--color-surface-container)',
                    color: 'var(--color-on-surface)',
                    textAlign: 'left',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontWeight: form.aufteilung_modus === modus ? 600 : 400, fontSize: '0.9rem' }}>{label}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-outline)' }}>{sub}</span>
                </button>
              ))}

              {/* Eigener Prozentsatz */}
              {form.aufteilung_modus === 'andere' && (
                <div style={{ marginTop: '0.25rem', padding: '0.875rem', background: 'var(--color-surface-container-low)', borderRadius: '0.5rem', border: '1px solid var(--color-outline-variant)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-outline)' }}>Bennys Anteil</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-primary)', fontWeight: 600 }}>{form.aufteilung_prozent} %</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={form.aufteilung_prozent}
                    onChange={e => set('aufteilung_prozent', Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--color-primary)', margin: '0.25rem 0' }}
                  />
                  {!isNaN(betragNum) && betragNum > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-primary)' }}>
                        Benny: {bennyAnteil.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#a78bfa' }}>
                        Julia: {juliaAnteil.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer: Navigation */}
      <div style={{
        padding: '0.875rem 1.25rem',
        borderTop: '1px solid var(--color-outline-variant)',
        display: 'flex',
        gap: '0.75rem',
        background: 'var(--color-surface-container)',
      }}>
        <button
          onClick={schrittIdx > 0 ? zurueck : onClose}
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.875rem',
            padding: '0.625rem 1rem',
            borderRadius: '0.5rem',
            border: '1px solid var(--color-outline-variant)',
            background: 'transparent',
            color: 'var(--color-on-surface)',
            cursor: 'pointer',
          }}
        >
          {schrittIdx > 0 ? 'Zurück' : 'Abbrechen'}
        </button>

        <button
          onClick={istLetzterSchritt ? handleSave : weiter}
          disabled={saving}
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.875rem',
            fontWeight: 600,
            flex: 1,
            padding: '0.625rem',
            borderRadius: '0.5rem',
            border: 'none',
            background: saving ? 'var(--color-outline)' : 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dim) 100%)',
            color: 'var(--color-on-primary)',
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving
            ? 'Wird gespeichert…'
            : istLetzterSchritt
            ? (isEditMode ? 'Änderungen speichern' : 'Eintrag erstellen')
            : 'Weiter'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HaushaltSlideOver (Public API — unverändert für HaushaltPage)
// ---------------------------------------------------------------------------

export function HaushaltSlideOver({ open, onClose, onSaved, eintrag }: HaushaltSlideOverProps) {
  if (!open) return null;
  return (
    <>
      {/* Halbtransparenter Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 40,
        }}
      />
      <ModalContent onClose={onClose} onSaved={onSaved} eintrag={eintrag} />
    </>
  );
}
