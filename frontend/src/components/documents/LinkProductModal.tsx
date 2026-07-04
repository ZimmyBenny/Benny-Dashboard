/**
 * LinkProductModal — Produkt-Picker-Modal fuer die Ordner↔Amazon-Produkt-Verknuepfung.
 *
 * Draggable am Header (useDraggableModal-Hook, Memory-Regel feedback_draggable_modals).
 * Backdrop-Klick schliesst NICHT — nur X/Abbrechen/Esc (Projektregel), analog MoveModal.tsx.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDraggableModal } from '../../hooks/useDraggableModal';
import { fetchAmazonProducts } from '../../api/amazon.api';

interface LinkProductModalProps {
  open: boolean;
  onSelect: (productId: number) => void;
  onClose: () => void;
}

export function LinkProductModal({ open, onSelect, onClose }: LinkProductModalProps) {
  const { onMouseDown, modalStyle, headerStyle } = useDraggableModal();
  const [search, setSearch] = useState('');

  const { data: products = [] } = useQuery({
    queryKey: ['amazon', 'products', false],
    queryFn: () => fetchAmazonProducts(false),
    enabled: open,
  });

  useEffect(() => {
    if (!open) setSearch('');
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

  const filtered = search.trim()
    ? products.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
    : products;

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
            Mit Produkt verknüpfen
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

        <div style={{ padding: '0.75rem 1rem 0.25rem 1rem' }}>
          <input
            autoFocus
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Produkt suchen…"
            className="w-full px-3 py-2 rounded-md text-sm outline-hidden"
            style={{
              background: 'var(--color-surface-container-low)',
              color: 'var(--color-on-surface)',
              border: '1px solid var(--color-outline-variant)',
            }}
          />
        </div>

        <div style={{ overflowY: 'auto', padding: '0.5rem 1rem 0.75rem 1rem', flex: 1, minHeight: 0 }}>
          {filtered.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', padding: '0.5rem' }}>
              Keine Produkte gefunden.
            </p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {filtered.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => onSelect(product.id)}
                  className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md text-sm"
                  style={{ color: 'var(--color-on-surface)', cursor: 'pointer', background: 'transparent' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--color-primary)' }}>
                    inventory_2
                  </span>
                  <span className="truncate">{product.name}</span>
                </button>
              ))}
            </div>
          )}
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
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-sm"
            style={{ background: 'var(--color-surface-container)', color: 'var(--color-on-surface)' }}
          >
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}
