/**
 * MoveModal — Verschieben-Modal mit Ordnerbaum-Picker fuer das Dokumente-Modul.
 *
 * Draggable am Header (useDraggableModal-Hook, Memory-Regel feedback_draggable_modals).
 * Backdrop-Klick schliesst NICHT — nur X/Abbrechen/Esc (Projektregel).
 */
import { useEffect, useState } from 'react';
import { useDraggableModal } from '../../hooks/useDraggableModal';
import type { DocFolder } from '../../api/documents.api';

interface MoveModalProps {
  open: boolean;
  tree: DocFolder[];
  /** Der zu verschiebende Knoten (Ordner) + seine Nachfahren duerfen nicht Ziel sein. Bei Datei-Verschieben: null. */
  excludeId: number | null;
  /** Optionaler Titel-Override (z. B. "3 Dateien verschieben" beim Bulk-Verschieben). Default: "Verschieben nach…" */
  title?: string;
  onSelect: (targetFolderId: number) => void;
  onClose: () => void;
}

export function MoveModal({ open, tree, excludeId, title, onSelect, onClose }: MoveModalProps) {
  const { onMouseDown, modalStyle, headerStyle } = useDraggableModal();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) setSelectedId(null);
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

  // Nachfahren des auszuschliessenden Knotens ermitteln (fuer Ordner-Verschieben)
  const excludedIds = new Set<number>();
  if (excludeId !== null) {
    excludedIds.add(excludeId);
    let changed = true;
    while (changed) {
      changed = false;
      for (const f of tree) {
        if (f.parent_id !== null && excludedIds.has(f.parent_id) && !excludedIds.has(f.id)) {
          excludedIds.add(f.id);
          changed = true;
        }
      }
    }
  }

  const rootFolders = tree.filter((f) => f.parent_id === null && !excludedIds.has(f.id));

  function renderNode(folder: DocFolder, depth: number) {
    const children = tree.filter((f) => f.parent_id === folder.id && !excludedIds.has(f.id));
    const isSelected = selectedId === folder.id;
    return (
      <div key={folder.id}>
        <button
          type="button"
          onClick={() => setSelectedId(folder.id)}
          className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md text-sm"
          style={{
            paddingLeft: `${0.5 + depth * 1.25}rem`,
            background: isSelected ? 'rgba(148,170,255,0.14)' : 'transparent',
            border: isSelected ? '1px solid var(--color-primary)' : '1px solid transparent',
            color: 'var(--color-on-surface)',
            cursor: 'pointer',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--color-primary)' }}>
            folder
          </span>
          <span className="truncate">{folder.name}</span>
        </button>
        {children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
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
          width: 'min(480px, 92vw)',
          maxHeight: '75vh',
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
            {title ?? 'Verschieben nach…'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-on-surface-variant)',
            }}
            aria-label="Schließen"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '0.75rem 1rem', flex: 1, minHeight: 0 }}>
          {rootFolders.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', padding: '0.5rem' }}>
              Keine Ziel-Ordner verfügbar.
            </p>
          ) : (
            rootFolders.map((f) => renderNode(f, 0))
          )}
        </div>

        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--color-outline-variant)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-sm"
            style={{ background: 'var(--color-surface-container)', color: 'var(--color-on-surface)' }}
          >
            Abbrechen
          </button>
          <button
            type="button"
            disabled={selectedId === null}
            onClick={() => {
              if (selectedId !== null) onSelect(selectedId);
            }}
            className="px-3 py-1.5 rounded-md text-sm font-semibold"
            style={{
              background: selectedId === null ? 'var(--color-surface-container)' : 'var(--color-primary)',
              color: selectedId === null ? 'var(--color-on-surface-variant)' : 'var(--color-on-primary)',
              cursor: selectedId === null ? 'not-allowed' : 'pointer',
              opacity: selectedId === null ? 0.6 : 1,
            }}
          >
            Verschieben
          </button>
        </div>
      </div>
    </div>
  );
}
