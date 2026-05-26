import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createReview } from '../../../api/reviews.api';
import { useDraggableModal } from '../../../hooks/useDraggableModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function AddReviewModal({ isOpen, onClose }: Props) {
  const queryClient = useQueryClient();
  // Hook gibt zurueck: { onMouseDown, modalStyle, headerStyle, pos } — keine refs, keine dragHandlers
  const { onMouseDown, modalStyle, headerStyle } = useDraggableModal();

  const [productName, setProductName] = useState('');
  const [productUrl, setProductUrl] = useState('');
  const [priceEur, setPriceEur] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: createReview,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      queryClient.invalidateQueries({ queryKey: ['reviews-stats'] });
      setProductName('');
      setProductUrl('');
      setPriceEur('');
      setError(null);
      onClose();
    },
    onError: () => setError('Speichern fehlgeschlagen. Bitte erneut versuchen.'),
  });

  // Esc to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = productName.trim();
    if (!name) { setError('Produktname ist Pflicht.'); return; }
    const eur = parseFloat(priceEur.replace(',', '.'));
    if (!Number.isFinite(eur) || eur <= 0) { setError('Kaufpreis muss größer als 0 sein.'); return; }
    const url = productUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      setError('Produkt-Link muss mit http:// oder https:// beginnen.');
      return;
    }
    setError(null);
    createMut.mutate({
      product_name: name,
      product_url: url || null,
      purchase_price_cents: Math.round(eur * 100),
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
      {/* Modal-Container — data-draggable-modal ist Pflicht (Hook nutzt closest()) + modalStyle gespreizt */}
      <div
        data-draggable-modal
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(440px, 92vw)',
          background: 'var(--color-surface-container)',
          borderRadius: '1rem',
          padding: 0,
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          position: 'relative',
          ...modalStyle,
        }}
      >
        {/* Drag-Handle = Header: onMouseDown + headerStyle */}
        <div
          onMouseDown={onMouseDown}
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--color-surface-container-high)',
            fontFamily: 'var(--font-headline)',
            fontWeight: 800,
            fontSize: '1.125rem',
            color: 'var(--color-on-surface)',
            ...headerStyle,
          }}
        >
          Neue Bewertung
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-on-surface-variant)', marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Produktname *
            </label>
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              placeholder="z.B. Anker USB-C Hub"
              autoFocus
              style={{
                width: '100%', background: 'var(--color-surface)',
                border: '1px solid var(--color-outline)',
                color: 'var(--color-on-surface)',
                borderRadius: '0.5rem', padding: '0.625rem 0.75rem',
                fontSize: '0.875rem', fontFamily: 'var(--font-body)',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-on-surface-variant)', marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Kaufpreis (EUR) *
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={priceEur}
              onChange={(e) => setPriceEur(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              placeholder="29,90"
              style={{
                width: '100%', background: 'var(--color-surface)',
                border: '1px solid var(--color-outline)',
                color: 'var(--color-on-surface)',
                borderRadius: '0.5rem', padding: '0.625rem 0.75rem',
                fontSize: '0.875rem', fontFamily: 'var(--font-body)',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-on-surface-variant)', marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Produkt-Link
            </label>
            <input
              type="url"
              inputMode="url"
              value={productUrl}
              onChange={(e) => setProductUrl(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              placeholder="https://www.amazon.de/..."
              style={{
                width: '100%', background: 'var(--color-surface)',
                border: '1px solid var(--color-outline)',
                color: 'var(--color-on-surface)',
                borderRadius: '0.5rem', padding: '0.625rem 0.75rem',
                fontSize: '0.875rem', fontFamily: 'var(--font-body)',
              }}
            />
          </div>

          <p style={{ fontSize: '0.7rem', color: 'var(--color-on-surface-variant)' }}>
            Weitere Felder kannst du im Detail später ergänzen.
          </p>

          {error && (
            <p style={{ fontSize: '0.8rem', color: 'var(--color-error)' }}>{error}</p>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent', color: 'var(--color-on-surface-variant)',
                border: '1px solid var(--color-outline)',
                borderRadius: '0.5rem', padding: '0.5rem 1rem',
                fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
              }}
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={createMut.isPending}
              style={{
                background: 'linear-gradient(135deg, #cc97ff 0%, #9c48ea 100%)',
                color: '#fff', border: 'none',
                borderRadius: '0.5rem', padding: '0.5rem 1.25rem',
                fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer',
                opacity: createMut.isPending ? 0.6 : 1,
              }}
            >
              {createMut.isPending ? 'Speichere…' : 'Bewertung anlegen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
