import { useState, useEffect } from 'react';
import type { HaushaltEintrag } from '../../api/haushalt.api';
import { createEintrag, updateEintrag } from '../../api/haushalt.api';

// ---------------------------------------------------------------------------
// Styles (gleiche Muster wie ContractSlideOver)
// ---------------------------------------------------------------------------

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
  boxSizing: 'border-box' as const,
};

const LABEL_STYLE: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-body)',
  fontSize: '0.75rem',
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  color: 'var(--color-outline)',
  marginBottom: '0.375rem',
};

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// FormState
// ---------------------------------------------------------------------------

interface FormState {
  datum: string;
  betrag: string;
  beschreibung: string;
  kategorie: string;
  bezahlt_von: 'benny' | 'julia';
  eintrag_typ: 'ausgabe' | 'geldübergabe';
  andereProzent: boolean;
  aufteilung_prozent: number;
  zahlungsart: string;
  zeitraumAktiv: boolean;
  zeitraum_von: string;
  zeitraum_bis: string;
}

function eintragToForm(eintrag?: HaushaltEintrag): FormState {
  if (!eintrag) {
    return {
      datum: todayIso(),
      betrag: '',
      beschreibung: '',
      kategorie: 'Haushalt',
      bezahlt_von: 'benny',
      eintrag_typ: 'ausgabe',
      andereProzent: false,
      aufteilung_prozent: 50,
      zahlungsart: '',
      zeitraumAktiv: false,
      zeitraum_von: '',
      zeitraum_bis: '',
    };
  }
  return {
    datum: eintrag.datum,
    betrag: String(eintrag.betrag),
    beschreibung: eintrag.beschreibung,
    kategorie: eintrag.kategorie,
    bezahlt_von: eintrag.bezahlt_von,
    eintrag_typ: eintrag.eintrag_typ,
    andereProzent: eintrag.aufteilung_prozent !== 50,
    aufteilung_prozent: eintrag.aufteilung_prozent,
    zahlungsart: eintrag.zahlungsart ?? '',
    zeitraumAktiv: !!(eintrag.zeitraum_von || eintrag.zeitraum_bis),
    zeitraum_von: eintrag.zeitraum_von ?? '',
    zeitraum_bis: eintrag.zeitraum_bis ?? '',
  };
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
// HaushaltSlideOver
// ---------------------------------------------------------------------------

export function HaushaltSlideOver({ open, onClose, onSaved, eintrag }: HaushaltSlideOverProps) {
  const [form, setForm] = useState<FormState>(() => eintragToForm(eintrag));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Set<string>>(new Set());

  useEffect(() => {
    setForm(eintragToForm(eintrag));
    setErrors(new Set());
  }, [eintrag, open]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  const betragNum = parseFloat(form.betrag);
  const juliaAnteil = form.andereProzent
    ? (isNaN(betragNum) ? 0 : betragNum * (100 - form.aufteilung_prozent) / 100)
    : (isNaN(betragNum) ? 0 : betragNum * 0.5);
  const bennyAnteil = isNaN(betragNum) ? 0 : betragNum - juliaAnteil;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = new Set<string>();
    if (!form.datum) errs.add('datum');
    if (!form.betrag || isNaN(parseFloat(form.betrag)) || parseFloat(form.betrag) <= 0) errs.add('betrag');
    if (!form.beschreibung.trim()) errs.add('beschreibung');
    if (errs.size > 0) { setErrors(errs); return; }

    setSaving(true);
    try {
      const payload: Partial<HaushaltEintrag> = {
        datum: form.datum,
        betrag: parseFloat(form.betrag),
        beschreibung: form.beschreibung.trim(),
        kategorie: form.kategorie as HaushaltEintrag['kategorie'],
        bezahlt_von: form.bezahlt_von,
        eintrag_typ: form.eintrag_typ,
        aufteilung_prozent: form.andereProzent ? form.aufteilung_prozent : 50,
        zahlungsart: form.zahlungsart || null,
        zeitraum_von: form.zeitraumAktiv && form.zeitraum_von ? form.zeitraum_von : null,
        zeitraum_bis: form.zeitraumAktiv && form.zeitraum_bis ? form.zeitraum_bis : null,
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

  const isEditMode = !!eintrag;

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 40,
          }}
        />
      )}

      {/* SlideOver Panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '420px',
          maxWidth: '100vw',
          background: 'var(--color-surface)',
          borderLeft: '1px solid var(--color-outline-variant)',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.25s ease',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--color-outline-variant)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--color-surface-container)',
            flexShrink: 0,
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1rem', fontFamily: 'var(--font-display)', color: 'var(--color-on-surface)' }}>
            {isEditMode ? 'Eintrag bearbeiten' : 'Neuer Eintrag'}
          </h2>
          <button
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

        {/* Formular */}
        <form onSubmit={handleSubmit} style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>

          {/* Datum */}
          <div>
            <label style={LABEL_STYLE}>Datum</label>
            <input
              type="date"
              value={form.datum}
              onChange={e => set('datum', e.target.value)}
              style={{ ...INPUT_STYLE, borderColor: errors.has('datum') ? 'var(--color-error)' : undefined }}
            />
            {errors.has('datum') && <p style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: '0.25rem' }}>Datum ist erforderlich</p>}
          </div>

          {/* Betrag */}
          <div>
            <label style={LABEL_STYLE}>Betrag (EUR)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0,00"
              value={form.betrag}
              onChange={e => set('betrag', e.target.value)}
              style={{ ...INPUT_STYLE, borderColor: errors.has('betrag') ? 'var(--color-error)' : undefined }}
            />
            {errors.has('betrag') && <p style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: '0.25rem' }}>Gültiger Betrag erforderlich</p>}
          </div>

          {/* Beschreibung */}
          <div>
            <label style={LABEL_STYLE}>Beschreibung</label>
            <input
              type="text"
              placeholder="Was wurde bezahlt?"
              value={form.beschreibung}
              onChange={e => set('beschreibung', e.target.value)}
              style={{ ...INPUT_STYLE, borderColor: errors.has('beschreibung') ? 'var(--color-error)' : undefined }}
            />
            {errors.has('beschreibung') && <p style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: '0.25rem' }}>Beschreibung ist erforderlich</p>}
          </div>

          {/* Kategorie */}
          <div>
            <label style={LABEL_STYLE}>Kategorie</label>
            <select
              value={form.kategorie}
              onChange={e => set('kategorie', e.target.value)}
              style={INPUT_STYLE}
            >
              {['Einkäufe', 'Kind', 'Haushalt', 'Freizeit', 'Urlaub', 'Nebenkosten', 'Miete', 'Sonstiges'].map(k => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>

          {/* Wer hat bezahlt */}
          <div>
            <label style={LABEL_STYLE}>Wer hat bezahlt?</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {(['benny', 'julia'] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => set('bezahlt_von', p)}
                  style={{
                    flex: 1,
                    padding: '0.5rem',
                    borderRadius: '0.5rem',
                    border: '1px solid',
                    borderColor: form.bezahlt_von === p ? 'var(--color-primary)' : 'var(--color-outline-variant)',
                    background: form.bezahlt_von === p ? 'var(--color-primary)' : 'var(--color-surface-container-low)',
                    color: form.bezahlt_von === p ? 'var(--color-on-primary)' : 'var(--color-on-surface)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {p === 'benny' ? 'Benny' : 'Julia'}
                </button>
              ))}
            </div>
          </div>

          {/* Typ */}
          <div>
            <label style={LABEL_STYLE}>Typ</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {([['ausgabe', 'Ausgabe'], ['geldübergabe', 'Geldübergabe']] as const).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => set('eintrag_typ', val)}
                  style={{
                    flex: 1,
                    padding: '0.5rem',
                    borderRadius: '0.5rem',
                    border: '1px solid',
                    borderColor: form.eintrag_typ === val ? 'var(--color-secondary)' : 'var(--color-outline-variant)',
                    background: form.eintrag_typ === val ? 'var(--color-secondary-container)' : 'var(--color-surface-container-low)',
                    color: form.eintrag_typ === val ? 'var(--color-on-secondary-container)' : 'var(--color-on-surface)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Aufteilung */}
          <div>
            <label style={{ ...LABEL_STYLE, display: 'flex', alignItems: 'center', gap: '0.5rem', textTransform: 'none', fontSize: '0.875rem', cursor: 'pointer', marginBottom: 0 }}>
              <input
                type="checkbox"
                checked={form.andereProzent}
                onChange={e => set('andereProzent', e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Andere Aufteilung (Standard: 50/50)
            </label>
            {form.andereProzent && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-outline)' }}>Bennys Anteil</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-primary)', fontWeight: 600 }}>{form.aufteilung_prozent}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={form.aufteilung_prozent}
                  onChange={e => set('aufteilung_prozent', Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--color-primary)' }}
                />
                {!isNaN(betragNum) && betragNum > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.375rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-primary)' }}>
                      Benny: {bennyAnteil.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-secondary)' }}>
                      Julia: {juliaAnteil.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Zahlungsart */}
          <div>
            <label style={LABEL_STYLE}>Zahlungsart (optional)</label>
            <select
              value={form.zahlungsart}
              onChange={e => set('zahlungsart', e.target.value)}
              style={INPUT_STYLE}
            >
              <option value="">— keine Angabe —</option>
              <option value="cash">Cash</option>
              <option value="überweisung">Überweisung</option>
              <option value="offen">Offen</option>
            </select>
          </div>

          {/* Zeitraum */}
          <div>
            <label style={{ ...LABEL_STYLE, display: 'flex', alignItems: 'center', gap: '0.5rem', textTransform: 'none', fontSize: '0.875rem', cursor: 'pointer', marginBottom: 0 }}>
              <input
                type="checkbox"
                checked={form.zeitraumAktiv}
                onChange={e => set('zeitraumAktiv', e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Zeitraum angeben
            </label>
            {form.zeitraumAktiv && (
              <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.75rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={LABEL_STYLE}>Von</label>
                  <input
                    type="date"
                    value={form.zeitraum_von}
                    onChange={e => set('zeitraum_von', e.target.value)}
                    style={INPUT_STYLE}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={LABEL_STYLE}>Bis</label>
                  <input
                    type="date"
                    value={form.zeitraum_bis}
                    onChange={e => set('zeitraum_bis', e.target.value)}
                    style={INPUT_STYLE}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Aktions-Buttons */}
          <div style={{ marginTop: 'auto', display: 'flex', gap: '0.75rem', paddingTop: '1rem' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '0.625rem',
                borderRadius: '0.5rem',
                border: '1px solid var(--color-outline-variant)',
                background: 'transparent',
                color: 'var(--color-on-surface)',
                fontFamily: 'var(--font-body)',
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                flex: 2,
                padding: '0.625rem',
                borderRadius: '0.5rem',
                border: 'none',
                background: saving ? 'var(--color-outline)' : 'var(--color-primary)',
                color: 'var(--color-on-primary)',
                fontFamily: 'var(--font-body)',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Wird gespeichert…' : (isEditMode ? 'Änderungen speichern' : 'Eintrag erstellen')}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
