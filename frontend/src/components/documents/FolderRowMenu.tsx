/**
 * FolderRowMenu — ⋮-Kontextmenue an Ordner-Zeilen (ersetzt die drei Hover-Icons).
 *
 * Schliesst bei Klick ausserhalb und bei Escape. Wird NICHT an Bereichs-Wurzeln
 * gerendert (dort ist kein Menue vorgesehen, siehe DocumentsPage).
 */
import { useEffect, useRef, useState } from 'react';
import type { DocFolder } from '../../api/documents.api';

interface FolderRowMenuProps {
  folder: DocFolder;
  onRename: () => void;
  onLinkProduct: () => void;
  onUnlinkProduct: () => void;
  onMove: () => void;
  onDelete: () => void;
}

export function FolderRowMenu({
  folder,
  onRename,
  onLinkProduct,
  onUnlinkProduct,
  onMove,
  onDelete,
}: FolderRowMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const isLinked = folder.product_id != null;

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        title="Menü"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="p-1 rounded hover:bg-white/5 opacity-60 hover:opacity-100 transition-opacity"
        style={{ color: 'var(--color-on-surface-variant)', opacity: open ? 1 : undefined }}
        aria-label="Ordner-Menü öffnen"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>more_vert</span>
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="flex flex-col py-1 rounded-md text-sm"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            minWidth: 200,
            zIndex: 50,
            background: 'var(--color-surface-container-high)',
            border: '1px solid var(--color-outline-variant)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onRename();
            }}
            className="text-left px-3 py-2 hover:bg-white/5"
            style={{ color: 'var(--color-on-surface)' }}
          >
            Umbenennen
          </button>
          {isLinked ? (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onUnlinkProduct();
              }}
              className="text-left px-3 py-2 hover:bg-white/5"
              style={{ color: 'var(--color-on-surface)' }}
            >
              Verknüpfung entfernen
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onLinkProduct();
              }}
              className="text-left px-3 py-2 hover:bg-white/5"
              style={{ color: 'var(--color-on-surface)' }}
            >
              Mit Produkt verknüpfen
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onMove();
            }}
            className="text-left px-3 py-2 hover:bg-white/5"
            style={{ color: 'var(--color-on-surface)' }}
          >
            Verschieben
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="text-left px-3 py-2 hover:bg-white/5"
            style={{ color: 'var(--color-error)' }}
          >
            Löschen
          </button>
        </div>
      )}
    </div>
  );
}
