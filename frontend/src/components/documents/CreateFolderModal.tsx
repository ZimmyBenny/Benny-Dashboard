/**
 * CreateFolderModal — draggables Neuer-Ordner-Modal fuer das Dokumente-Modul.
 *
 * Draggable am Header (useDraggableModal-Hook, Memory-Regel feedback_draggable_modals).
 * Backdrop-Klick schliesst NICHT — nur X/Esc (Projektregel).
 * Auf der virtuellen Wurzel (requireAreaPick) erzwingt ein Pflicht-Dropdown eine Bereichs-Wurzel als Parent.
 */
import { useEffect, useState } from 'react';
import { useDraggableModal } from '../../hooks/useDraggableModal';

interface AreaOption {
  id: number;
  name: string;
}

interface CreateFolderModalProps {
  open: boolean;
  /** true = virtuelle Wurzel → Bereich-Dropdown pflichtig; false = Parent steht fest */
  requireAreaPick: boolean;
  /** Bereichs-Wurzeln fuer das Dropdown (nur bei requireAreaPick genutzt) */
  areaOptions: AreaOption[];
  /** Fester Parent-Ordner (nur relevant wenn !requireAreaPick) */
  fixedParentId: number | null;
  /** parentId = gewaehlte Bereichs-Wurzel (bei requireAreaPick) ODER aktueller Ordner */
  onCreate: (parentId: number, name: string) => void;
  onClose: () => void;
}

export function CreateFolderModal({
  open,
  requireAreaPick,
  areaOptions,
  fixedParentId,
  onCreate,
  onClose,
}: CreateFolderModalProps) {
  const { onMouseDown, modalStyle, headerStyle } = useDraggableModal();
  const [name, setName] = useState('');
  const [selectedAreaId, setSelectedAreaId] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!open) {
      setName('');
      setSelectedAreaId(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const canSubmit = name.trim() !== '' && (!requireAreaPick || selectedAreaId !== null);

  function submit() {
    if (!canSubmit) return;
    const parentId = requireAreaPick ? selectedAreaId! : fixedParentId!;
    onCreate(parentId, name.trim());
    onClose();
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        data-draggable-modal
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(440px, 92vw)',
          background: 'var(--color-surface-container-high)',
          border: '1px solid var(--color-outline-variant)',
          borderRadius: '1rem',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          ...modalStyle,
        }}
      >
        <div
          onMouseDown={onMouseDown}
          style={{
            padding: '1.1rem 1.5rem',
            borderBottom: '1px solid var(--color-outline-variant)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            ...headerStyle,
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--font-headline)',
              fontSize: '1rem',
              fontWeight: 700,
              color: 'var(--color-on-surface)',
              margin: 0,
            }}
          >
            Neuen Ordner erstellen
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 9999,
              background: 'var(--color-surface-container)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-on-surface-variant)',
            }}
            aria-label="Schließen"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>

        <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {requireAreaPick && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--color-on-surface-variant)' }}>Bereich</label>
              <select
                value={selectedAreaId ?? ''}
                onChange={(e) => setSelectedAreaId(e.target.value === '' ? null : Number(e.target.value))}
                style={{
                  background: 'var(--color-surface-container-low)',
                  border: '1px solid var(--color-outline-variant)',
                  borderRadius: '0.5rem',
                  padding: '0.5rem 0.75rem',
                  color: 'var(--color-on-surface)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="" disabled>Bereich wählen</option>
                {areaOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--color-on-surface-variant)' }}>Ordnername</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                } else if (e.key === 'Escape') {
                  onClose();
                }
              }}
              placeholder="Ordnername eingeben"
              className="px-3 py-2 rounded-md text-sm"
              style={{
                background: 'var(--color-surface-container-low)',
                color: 'var(--color-on-surface)',
                border: focused ? '1px solid var(--color-primary)' : '1px solid var(--color-outline-variant)',
                boxShadow: focused ? '0 0 0 3px color-mix(in srgb, var(--color-primary) 25%, transparent)' : 'none',
                outline: 'none',
              }}
            />
          </div>
        </div>

        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--color-outline-variant)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            disabled={!canSubmit}
            onClick={submit}
            className="px-3 py-1.5 rounded-md text-sm"
            style={{
              background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
              color: 'var(--color-on-primary)',
              fontWeight: 700,
              opacity: canSubmit ? 1 : 0.5,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
            }}
          >
            Ordner erstellen
          </button>
        </div>
      </div>
    </div>
  );
}
