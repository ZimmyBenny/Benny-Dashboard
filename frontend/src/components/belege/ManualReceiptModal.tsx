/**
 * ManualReceiptModal — verschiebbares Formular zum Anlegen eines Belegs OHNE Datei
 * (Eigenbeleg / Bar-Quittung / verlorener Beleg), Plan quick-260705-tot.
 *
 * Muster analog AddReviewModal:
 *  - useDraggableModal (Header = Drag-Handle, data-draggable-modal Pflicht)
 *  - Backdrop schliesst NICHT (Memory-Lesson Phase 4)
 *  - Esc schliesst
 *
 * Netto/USt werden client-seitig nur zur Anzeige aus Brutto+Satz berechnet;
 * verbindlich rechnet das Backend (receiptService.recomputeAmounts).
 */
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useDraggableModal } from '../../hooks/useDraggableModal';
import {
  createManualReceipt,
  type ManualReceiptInput,
  type Area,
  type ReceiptListItem,
} from '../../api/belege.api';
import { formatCurrencyFromCents } from '../../lib/format';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  areas: Area[];
  onCreated: (r: ReceiptListItem) => void;
}

// UI-Wert 'sonstige' → Backend-type 'sonstiges'. Alle anderen 1:1.
type UiType = 'eingangsrechnung' | 'ausgangsrechnung' | 'quittung' | 'sonstige';

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.75rem',
  fontWeight: 600,
  color: 'var(--color-on-surface-variant)',
  marginBottom: '0.375rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const fieldStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-outline)',
  color: 'var(--color-on-surface)',
  borderRadius: '0.5rem',
  padding: '0.625rem 0.75rem',
  fontSize: '0.875rem',
  fontFamily: 'var(--font-body)',
};

export function ManualReceiptModal({ isOpen, onClose, areas, onCreated }: Props) {
  const queryClient = useQueryClient();
  const { onMouseDown, modalStyle, headerStyle } = useDraggableModal();

  const [type, setType] = useState<UiType>('quittung');
  const [receiptDate, setReceiptDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [supplierName, setSupplierName] = useState('');
  const [supplierInvNr, setSupplierInvNr] = useState('');
  const [grossEur, setGrossEur] = useState('');
  const [vatRate, setVatRate] = useState('19');
  const [areaId, setAreaId] = useState<number | null>(null);
  const [steuerrelevant, setSteuerrelevant] = useState(true);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: (data: ManualReceiptInput) => createManualReceipt(data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['belege'] });
      // Felder zuruecksetzen
      setType('quittung');
      setReceiptDate(new Date().toISOString().slice(0, 10));
      setSupplierName('');
      setSupplierInvNr('');
      setGrossEur('');
      setVatRate('19');
      setAreaId(null);
      setSteuerrelevant(true);
      setNotes('');
      setError(null);
      onCreated(created);
      onClose();
    },
    onError: () => setError('Speichern fehlgeschlagen. Bitte erneut versuchen.'),
  });

  // Esc schliesst
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Brutto parsen (Komma + Tausenderpunkt-tolerant) → Cents. NaN wenn leer/ungueltig.
  const grossNum = parseFloat(grossEur.replace(/\./g, '').replace(',', '.'));
  const grossCents = Number.isFinite(grossNum) ? Math.round(grossNum * 100) : NaN;
  const rate = Number(vatRate);
  const validGross = Number.isFinite(grossCents) && grossCents >= 0;
  const validDate = receiptDate.trim().length > 0;

  // Live-Netto/USt nur Anzeige.
  const nettoCents = validGross ? Math.round(grossCents / (1 + rate / 100)) : NaN;
  const ustCents = validGross ? grossCents - nettoCents : NaN;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validDate) {
      setError('Datum ist Pflicht.');
      return;
    }
    if (!validGross) {
      setError('Bitte einen gültigen Brutto-Betrag eingeben.');
      return;
    }
    setError(null);
    const backendType: ManualReceiptInput['type'] =
      type === 'sonstige' ? 'sonstiges' : type;
    createMut.mutate({
      type: backendType,
      receipt_date: receiptDate,
      supplier_name: supplierName.trim() || null,
      supplier_invoice_number: supplierInvNr.trim() || null,
      amount_gross_cents: grossCents,
      vat_rate: rate,
      area_id: areaId,
      steuerrelevant,
      notes: notes.trim() || null,
    });
  }

  return (
    // Backdrop — KEIN onClick=onClose (Memory-Lesson Phase 4: Backdrop schliesst NICHT)
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
        zIndex: 1000,
      }}
    >
      <div
        data-draggable-modal
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(480px, 94vw)',
          maxHeight: '92vh',
          overflowY: 'auto',
          background: 'var(--color-surface-container)',
          borderRadius: '1rem',
          padding: 0,
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          position: 'relative',
          ...modalStyle,
        }}
      >
        {/* Drag-Handle = Header */}
        <div
          onMouseDown={onMouseDown}
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--color-surface-container-high)',
            fontFamily: 'var(--font-headline)',
            fontWeight: 800,
            fontSize: '1.125rem',
            color: 'var(--color-on-surface)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            ...headerStyle,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '1.25rem' }}>
            edit_note
          </span>
          Beleg manuell erfassen
        </div>

        <form
          onSubmit={handleSubmit}
          style={{
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          <div>
            <label style={labelStyle}>Belegtyp</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as UiType)}
              onMouseDown={(e) => e.stopPropagation()}
              style={fieldStyle}
            >
              <option value="eingangsrechnung">Eingangsrechnung</option>
              <option value="ausgangsrechnung">Ausgangsrechnung</option>
              <option value="quittung">Quittung</option>
              <option value="sonstige">Sonstige</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Datum *</label>
            <input
              type="date"
              value={receiptDate}
              onChange={(e) => setReceiptDate(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              style={fieldStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Lieferant/Kunde</label>
            <input
              type="text"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              placeholder="z.B. Bäckerei Müller"
              style={fieldStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Belegnummer (optional)</label>
            <input
              type="text"
              value={supplierInvNr}
              onChange={(e) => setSupplierInvNr(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              placeholder="z.B. RE-2026-0042"
              style={fieldStyle}
            />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1rem',
            }}
          >
            <div>
              <label style={labelStyle}>Brutto in EUR *</label>
              <input
                type="text"
                inputMode="decimal"
                value={grossEur}
                onChange={(e) => setGrossEur(e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                placeholder="11,90"
                style={fieldStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Steuersatz</label>
              <select
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                style={fieldStyle}
              >
                <option value="0">0 %</option>
                <option value="7">7 %</option>
                <option value="19">19 %</option>
              </select>
            </div>
          </div>

          <p
            style={{
              fontSize: '0.8rem',
              color: 'var(--color-on-surface-variant)',
              margin: '-0.5rem 0 0',
            }}
          >
            Netto: {validGross ? formatCurrencyFromCents(nettoCents) : '—'} · USt:{' '}
            {validGross ? formatCurrencyFromCents(ustCents) : '—'}
          </p>

          <div>
            <label style={labelStyle}>Bereich</label>
            <select
              value={areaId ?? ''}
              onChange={(e) =>
                setAreaId(e.target.value ? Number(e.target.value) : null)
              }
              onMouseDown={(e) => e.stopPropagation()}
              style={fieldStyle}
            >
              <option value="">– bitte wählen –</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem',
              color: 'var(--color-on-surface)',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={steuerrelevant}
              onChange={(e) => setSteuerrelevant(e.target.checked)}
              onMouseDown={(e) => e.stopPropagation()}
            />
            steuerrelevant
          </label>

          <div>
            <label style={labelStyle}>Notiz (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              rows={2}
              placeholder="z.B. Bar bezahlt, kein Beleg vorhanden"
              style={{ ...fieldStyle, resize: 'vertical' }}
            />
          </div>

          {error && (
            <p style={{ fontSize: '0.8rem', color: 'var(--color-error)' }}>{error}</p>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.5rem',
              marginTop: '0.5rem',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                color: 'var(--color-on-surface-variant)',
                border: '1px solid var(--color-outline)',
                borderRadius: '0.5rem',
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={createMut.isPending || !validGross || !validDate}
              style={{
                background: 'linear-gradient(135deg, #94aaff 0%, #5cfd80 100%)',
                color: '#060e20',
                border: 'none',
                borderRadius: '0.5rem',
                padding: '0.5rem 1.25rem',
                fontSize: '0.875rem',
                fontWeight: 700,
                cursor:
                  createMut.isPending || !validGross || !validDate
                    ? 'not-allowed'
                    : 'pointer',
                opacity:
                  createMut.isPending || !validGross || !validDate ? 0.5 : 1,
                boxShadow: '0 0 16px rgba(148,170,255,0.3)',
              }}
            >
              {createMut.isPending ? 'Speichere…' : 'Speichern'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
