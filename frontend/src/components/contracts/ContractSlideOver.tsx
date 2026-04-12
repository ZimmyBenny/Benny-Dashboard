import { useState, useEffect, useRef } from 'react';
import type { Contract, ContractAttachment } from '../../api/contracts.api';
import {
  fetchContractAttachments,
  uploadContractAttachment,
  deleteContractAttachment,
  downloadContractAttachment,
} from '../../api/contracts.api';

// ---------------------------------------------------------------------------
// Styles — exakt wie TaskSlideOver
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
  boxSizing: 'border-box',
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
// FormData
// ---------------------------------------------------------------------------

interface FormData {
  title: string;
  item_type: string;
  area: string;
  status: string;
  priority: string;
  provider_name: string;
  reference_number: string;
  start_date: string;
  expiration_date: string;
  cancellation_date: string;
  reminder_date: string;
  cost_amount: string;
  currency: string;
  cost_interval: string;
  recurrence_type: string;
  description: string;
  notes: string;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function contractToForm(contract: Contract | null): FormData {
  if (!contract) {
    return {
      title: '',
      item_type: 'Vertrag',
      area: 'Privat',
      status: 'aktiv',
      priority: 'mittel',
      provider_name: '',
      reference_number: '',
      start_date: '',
      expiration_date: '',
      cancellation_date: '',
      reminder_date: '',
      cost_amount: '',
      currency: 'EUR',
      cost_interval: '',
      recurrence_type: 'keine',
      description: '',
      notes: '',
    };
  }
  return {
    title: contract.title,
    item_type: contract.item_type,
    area: contract.area,
    status: contract.status,
    priority: contract.priority,
    provider_name: contract.provider_name ?? '',
    reference_number: contract.reference_number ?? '',
    start_date: contract.start_date ?? '',
    expiration_date: contract.expiration_date ?? '',
    cancellation_date: contract.cancellation_date ?? '',
    reminder_date: contract.reminder_date ?? '',
    cost_amount: contract.cost_amount != null ? String(contract.cost_amount) : '',
    currency: contract.currency || 'EUR',
    cost_interval: contract.cost_interval ?? '',
    recurrence_type: contract.recurrence_type || 'keine',
    description: contract.description ?? '',
    notes: contract.notes ?? '',
  };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ContractSlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  contract: Contract | null;
  onSave: (data: Partial<Contract>) => Promise<void>;
}

// ---------------------------------------------------------------------------
// ContractSlideOver
// ---------------------------------------------------------------------------

export function ContractSlideOver({ isOpen, onClose, contract, onSave }: ContractSlideOverProps) {
  const [form, setForm] = useState<FormData>(() => contractToForm(contract));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Set<string>>(new Set());

  // Anhänge
  const [attachments, setAttachments] = useState<ContractAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag-to-move
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });

  // Form zurücksetzen wenn contract oder isOpen wechselt
  useEffect(() => {
    setForm(contractToForm(contract));
    setErrors(new Set());
  }, [contract, isOpen]);

  // Anhänge laden
  useEffect(() => {
    if (isOpen && contract?.id) {
      fetchContractAttachments(contract.id).then(setAttachments).catch(() => setAttachments([]));
    } else {
      setAttachments([]);
    }
  }, [contract?.id, isOpen]);

  // Pos zurücksetzen beim Schließen
  useEffect(() => {
    if (!isOpen) setPos(null);
  }, [isOpen]);

  // Globale Drag-Listener
  useEffect(() => {
    if (!isOpen) return;
    function onMouseMove(e: MouseEvent) {
      if (!isDragging.current) return;
      setPos({
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y,
      });
    }
    function onMouseUp() {
      isDragging.current = false;
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isOpen]);

  // Escape-Taste
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !contract) return;
    setUploading(true);
    try {
      await uploadContractAttachment(contract.id, file);
      const updated = await fetchContractAttachments(contract.id);
      setAttachments(updated);
    } catch {
      // ignore
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDeleteAttachment(attId: number, attName: string) {
    if (!contract) return;
    if (!confirm(`Anhang "${attName}" wirklich löschen?`)) return;
    try {
      await deleteContractAttachment(contract.id, attId);
      const updated = await fetchContractAttachments(contract.id);
      setAttachments(updated);
    } catch {
      // ignore
    }
  }

  function handleChange(field: keyof FormData, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors.has(field)) {
      setErrors(prev => { const next = new Set(prev); next.delete(field); return next; });
    }
  }

  async function handleSave() {
    const required = ['title', 'item_type', 'area', 'status'];
    const newErrors = new Set<string>();
    for (const field of required) {
      if (!form[field as keyof FormData]?.trim()) newErrors.add(field);
    }
    if (newErrors.size > 0) { setErrors(newErrors); return; }

    setSaving(true);
    try {
      await onSave({
        title: form.title.trim(),
        item_type: form.item_type,
        area: form.area,
        status: form.status,
        priority: form.priority,
        provider_name: form.provider_name || null,
        reference_number: form.reference_number || null,
        start_date: form.start_date || null,
        expiration_date: form.expiration_date || null,
        cancellation_date: form.cancellation_date || null,
        reminder_date: form.reminder_date || null,
        cost_amount: form.cost_amount ? parseFloat(form.cost_amount) : null,
        currency: form.currency || 'EUR',
        cost_interval: form.cost_interval || null,
        recurrence_type: form.recurrence_type || 'keine',
        description: form.description || null,
        notes: form.notes || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const errorBorder = '1px solid var(--color-error)';

  const focusStyle = `
    .contract-input:focus {
      border-color: var(--color-primary);
      box-shadow: 0 0 0 2px rgba(204,151,255,0.15);
    }
  `;

  return (
    <>
      <style>{focusStyle}</style>
      <div style={{ position: 'fixed', inset: 0, zIndex: 50, pointerEvents: isOpen ? 'auto' : 'none' }}>
        {/* Overlay */}
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            opacity: isOpen ? 1 : 0,
            transition: 'opacity 300ms ease',
            pointerEvents: isOpen ? 'auto' : 'none',
          }}
        />

        {/* Panel — zentriertes Floating Modal (draggable) */}
        <div
          data-modal-panel
          style={{
            position: 'fixed',
            ...(pos === null
              ? { top: '50%', left: '50%', transform: isOpen ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -50%) scale(0.96)' }
              : { top: pos.y + 'px', left: pos.x + 'px', transform: 'none' }
            ),
            width: '560px',
            maxWidth: '95vw',
            maxHeight: '90vh',
            background: 'var(--color-surface-container)',
            border: '1px solid var(--color-surface-container-high)',
            borderRadius: '1.25rem',
            boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
            zIndex: 51,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            opacity: isOpen ? 1 : 0,
            transition: pos === null ? 'opacity 200ms ease, transform 200ms ease' : 'opacity 200ms ease',
            pointerEvents: isOpen ? 'auto' : 'none',
          }}
        >
          {/* Header (drag handle) */}
          <div
            onMouseDown={(e) => {
              isDragging.current = true;
              const rect = (e.currentTarget.closest('[data-modal-panel]') as HTMLElement | null)?.getBoundingClientRect();
              dragStart.current = {
                x: e.clientX - (rect?.left ?? e.clientX),
                y: e.clientY - (rect?.top ?? e.clientY),
                px: rect?.left ?? 0,
                py: rect?.top ?? 0,
              };
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--color-outline-variant)',
              flexShrink: 0,
              cursor: 'grab',
              userSelect: 'none',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'var(--color-primary)' }}>
                {contract ? 'edit' : 'add_circle'}
              </span>
              <h2 style={{
                fontFamily: 'var(--font-headline)',
                fontWeight: 700,
                fontSize: '1rem',
                letterSpacing: '0.04em',
                color: 'var(--color-on-surface)',
              }}>
                {contract ? 'Eintrag bearbeiten' : 'Neuer Eintrag'}
              </h2>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-on-surface-variant)',
                padding: '0.25rem',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
            </button>
          </div>

          {/* Formular */}
          <div style={{
            flex: 1,
            padding: '1.5rem',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1rem',
            alignContent: 'start',
          }}>

            {/* Titel (full width) */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={LABEL_STYLE}>Titel *</label>
              <input
                className="contract-input"
                style={{ ...INPUT_STYLE, border: errors.has('title') ? errorBorder : INPUT_STYLE.border }}
                type="text"
                value={form.title}
                onChange={e => handleChange('title', e.target.value)}
                placeholder="Eintragsbezeichnung..."
                autoFocus
              />
            </div>

            {/* Eintragstyp + Bereich */}
            <div>
              <label style={LABEL_STYLE}>Eintragstyp *</label>
              <select
                className="contract-input"
                style={{ ...INPUT_STYLE, border: errors.has('item_type') ? errorBorder : INPUT_STYLE.border }}
                value={form.item_type}
                onChange={e => handleChange('item_type', e.target.value)}
              >
                {['Vertrag', 'Dokument', 'Frist', 'Versicherung', 'Mitgliedschaft', 'Garantie', 'Sonstiges'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={LABEL_STYLE}>Bereich *</label>
              <select
                className="contract-input"
                style={{ ...INPUT_STYLE, border: errors.has('area') ? errorBorder : INPUT_STYLE.border }}
                value={form.area}
                onChange={e => handleChange('area', e.target.value)}
              >
                {['Privat', 'DJ', 'Amazon', 'Cashback', 'Finanzen', 'Sonstiges'].map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            {/* Status + Priorität */}
            <div>
              <label style={LABEL_STYLE}>Status *</label>
              <select
                className="contract-input"
                style={{ ...INPUT_STYLE, border: errors.has('status') ? errorBorder : INPUT_STYLE.border }}
                value={form.status}
                onChange={e => handleChange('status', e.target.value)}
              >
                <option value="aktiv">Aktiv</option>
                <option value="in_pruefung">In Prüfung</option>
                <option value="gekuendigt">Gekündigt</option>
                <option value="abgelaufen">Abgelaufen</option>
                <option value="archiviert">Archiviert</option>
              </select>
            </div>
            <div>
              <label style={LABEL_STYLE}>Priorität</label>
              <select
                className="contract-input"
                style={INPUT_STYLE}
                value={form.priority}
                onChange={e => handleChange('priority', e.target.value)}
              >
                <option value="niedrig">Niedrig</option>
                <option value="mittel">Mittel</option>
                <option value="hoch">Hoch</option>
                <option value="kritisch">Kritisch</option>
              </select>
            </div>

            {/* Anbieter + Referenznummer */}
            <div>
              <label style={LABEL_STYLE}>Anbieter / Bezug</label>
              <input
                className="contract-input"
                style={INPUT_STYLE}
                type="text"
                value={form.provider_name}
                onChange={e => handleChange('provider_name', e.target.value)}
                placeholder="z.B. Telekom, Allianz..."
              />
            </div>
            <div>
              <label style={LABEL_STYLE}>Referenznummer</label>
              <input
                className="contract-input"
                style={INPUT_STYLE}
                type="text"
                value={form.reference_number}
                onChange={e => handleChange('reference_number', e.target.value)}
                placeholder="Vertragsnummer..."
              />
            </div>

            {/* Startdatum + Ablaufdatum */}
            <div>
              <label style={LABEL_STYLE}>Startdatum</label>
              <input
                className="contract-input"
                style={INPUT_STYLE}
                type="date"
                value={form.start_date}
                onChange={e => handleChange('start_date', e.target.value)}
              />
            </div>
            <div>
              <label style={LABEL_STYLE}>Ablaufdatum</label>
              <input
                className="contract-input"
                style={INPUT_STYLE}
                type="date"
                value={form.expiration_date}
                onChange={e => handleChange('expiration_date', e.target.value)}
              />
            </div>

            {/* Kündigungsdatum + Erinnerungsdatum */}
            <div>
              <label style={LABEL_STYLE}>Kündigungsdatum</label>
              <input
                className="contract-input"
                style={INPUT_STYLE}
                type="date"
                value={form.cancellation_date}
                onChange={e => handleChange('cancellation_date', e.target.value)}
              />
            </div>
            <div>
              <label style={LABEL_STYLE}>Erinnerungsdatum</label>
              <input
                className="contract-input"
                style={INPUT_STYLE}
                type="date"
                value={form.reminder_date}
                onChange={e => handleChange('reminder_date', e.target.value)}
              />
            </div>

            {/* Kostenbetrag + Währung + Zahlungsintervall */}
            <div>
              <label style={LABEL_STYLE}>Kostenbetrag</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  className="contract-input"
                  style={{ ...INPUT_STYLE, flex: 1 }}
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.cost_amount}
                  onChange={e => handleChange('cost_amount', e.target.value)}
                  placeholder="0,00"
                />
                <select
                  className="contract-input"
                  style={{ ...INPUT_STYLE, width: '80px', flexShrink: 0 }}
                  value={form.currency}
                  onChange={e => handleChange('currency', e.target.value)}
                >
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                  <option value="CHF">CHF</option>
                </select>
              </div>
            </div>
            <div>
              <label style={LABEL_STYLE}>Zahlungsintervall</label>
              <select
                className="contract-input"
                style={INPUT_STYLE}
                value={form.cost_interval}
                onChange={e => handleChange('cost_interval', e.target.value)}
              >
                <option value="">— kein Intervall —</option>
                <option value="einmalig">Einmalig</option>
                <option value="monatlich">Monatlich</option>
                <option value="quartalsweise">Quartalsweise</option>
                <option value="jaehrlich">Jährlich</option>
              </select>
            </div>

            {/* Wiederholungstyp (full width) */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={LABEL_STYLE}>Wiederholungstyp</label>
              <select
                className="contract-input"
                style={INPUT_STYLE}
                value={form.recurrence_type}
                onChange={e => handleChange('recurrence_type', e.target.value)}
              >
                <option value="keine">Keine</option>
                <option value="monatlich">Monatlich</option>
                <option value="jaehrlich">Jährlich</option>
                <option value="custom">Benutzerdefiniert</option>
              </select>
            </div>

            {/* Beschreibung (full width) */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={LABEL_STYLE}>Beschreibung</label>
              <textarea
                className="contract-input"
                style={{ ...INPUT_STYLE, resize: 'vertical', minHeight: '72px' }}
                value={form.description}
                onChange={e => handleChange('description', e.target.value)}
                rows={3}
                placeholder="Optionale Beschreibung..."
              />
            </div>

            {/* Notizen (full width) */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={LABEL_STYLE}>Notizen</label>
              <textarea
                className="contract-input"
                style={{ ...INPUT_STYLE, resize: 'vertical', minHeight: '72px' }}
                value={form.notes}
                onChange={e => handleChange('notes', e.target.value)}
                rows={3}
                placeholder="Interne Notizen..."
              />
            </div>

            {/* Dokumente & Anhänge (full width) */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={LABEL_STYLE}>Dokumente & Anhänge</label>

              {/* Hidden file input */}
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept="*/*"
                onChange={handleFileSelect}
              />

              {/* Upload-Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || !contract}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  padding: '0.35rem 0.9rem',
                  borderRadius: '9999px',
                  background: 'transparent',
                  border: '1px solid var(--color-outline-variant)',
                  color: uploading || !contract ? 'var(--color-outline)' : 'var(--color-on-surface-variant)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.78rem',
                  cursor: uploading || !contract ? 'not-allowed' : 'pointer',
                  opacity: uploading || !contract ? 0.6 : 1,
                  marginBottom: '0.5rem',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>attach_file</span>
                {uploading ? 'Wird hochgeladen...' : 'Datei hinzufügen'}
              </button>

              {/* Hinweis bei neuem Eintrag */}
              {!contract && (
                <p style={{ fontSize: '0.75rem', color: 'var(--color-outline)', fontFamily: 'var(--font-body)', marginTop: '0.25rem' }}>
                  Erst speichern, dann Anhänge hinzufügen.
                </p>
              )}

              {/* Anhänge-Liste */}
              {attachments.map(att => (
                <div key={att.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.4rem 0',
                  borderBottom: '1px solid var(--color-outline-variant)',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--color-primary)', flexShrink: 0 }}>description</span>
                  <span style={{
                    flex: 1,
                    fontSize: '0.8rem',
                    color: 'var(--color-on-surface)',
                    fontFamily: 'var(--font-body)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>{att.file_name}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-outline)', fontFamily: 'var(--font-body)', flexShrink: 0 }}>
                    {formatFileSize(att.file_size)}
                  </span>
                  <button
                    type="button"
                    onClick={() => downloadContractAttachment(contract!.id, att.id)}
                    title="Herunterladen"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-outline)', padding: '0.15rem', display: 'flex', alignItems: 'center' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-primary)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-outline)')}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>download</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteAttachment(att.id, att.file_name)}
                    title="Löschen"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-outline)', padding: '0.15rem', display: 'flex', alignItems: 'center' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-outline)')}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
                  </button>
                </div>
              ))}
            </div>

          </div>

          {/* Footer */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--color-outline-variant)',
            flexShrink: 0,
            gap: '0.75rem',
          }}>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: '1px solid var(--color-outline-variant)',
                borderRadius: '9999px',
                padding: '0.5rem 1.25rem',
                color: 'var(--color-on-surface-variant)',
                fontFamily: 'var(--font-body)',
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              Abbrechen
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                background: saving
                  ? 'rgba(255,255,255,0.08)'
                  : 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
                border: 'none',
                borderRadius: '9999px',
                padding: '0.5rem 1.25rem',
                color: saving ? 'var(--color-on-surface-variant)' : '#000',
                fontFamily: 'var(--font-body)',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>save</span>
              {saving ? 'Wird gespeichert...' : 'Speichern'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
