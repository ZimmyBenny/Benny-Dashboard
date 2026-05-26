import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { patchReview, deleteReview, type Review, type ReviewStatus } from '../../../api/reviews.api';
import { calcProfit } from '../../../lib/profitCalc';
import { formatCurrencyFromCents } from '../../../lib/format';
import { ALL_STATUSES, STATUS_CONFIG } from './reviewStatus';
import { useDraggableModal } from '../../../hooks/useDraggableModal';

interface Props {
  review: Review | null;
  isOpen: boolean;
  onClose: () => void;
}

function centsToEurStr(cents: number | null): string {
  if (cents == null) return '';
  return (cents / 100).toFixed(2);
}
function eurStrToCents(str: string): number | null {
  const trimmed = str.trim();
  if (!trimmed) return null;
  const v = parseFloat(trimmed.replace(',', '.'));
  if (!Number.isFinite(v)) return null;
  return Math.round(v * 100);
}

export function ReviewDetailModal({ review, isOpen, onClose }: Props) {
  const queryClient = useQueryClient();
  // Korrekte Hook-API (Revision Iteration 1): destructure { onMouseDown, modalStyle, headerStyle }
  const { onMouseDown, modalStyle, headerStyle } = useDraggableModal();

  const [productName, setProductName] = useState('');
  const [productUrl, setProductUrl] = useState('');
  const [priceEur, setPriceEur] = useState('');
  const [status, setStatus] = useState<ReviewStatus>('vorgemerkt');
  const [orderDate, setOrderDate] = useState('');
  const [receivedDate, setReceivedDate] = useState('');
  const [reviewDeadline, setReviewDeadline] = useState('');
  const [refundCode, setRefundCode] = useState('');
  const [refundEur, setRefundEur] = useState('');
  const [saleEur, setSaleEur] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!review) return;
    setProductName(review.product_name);
    setProductUrl(review.product_url ?? '');
    setPriceEur(centsToEurStr(review.purchase_price_cents));
    setStatus(review.status);
    setOrderDate(review.order_date ?? '');
    setReceivedDate(review.received_date ?? '');
    setReviewDeadline(review.review_deadline ?? '');
    setRefundCode(review.refund_code ?? '');
    setRefundEur(centsToEurStr(review.refund_amount_cents));
    setSaleEur(centsToEurStr(review.sale_amount_cents));
    setNotes(review.notes ?? '');
    setError(null);
  }, [review]);

  const patchMut = useMutation({
    mutationFn: (data: Partial<Review>) => patchReview(review!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      queryClient.invalidateQueries({ queryKey: ['reviews-stats'] });
      onClose();
    },
    onError: () => setError('Speichern fehlgeschlagen. Bitte erneut versuchen.'),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteReview(review!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      queryClient.invalidateQueries({ queryKey: ['reviews-stats'] });
      onClose();
    },
  });

  // Esc to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen || !review) return null;

  // Profit-Anzeige (User-Decision 2026-05-25: negativ rot, 0 neutral, >0 gruen)
  const profitCents = calcProfit({
    status,
    purchase_price_cents: eurStrToCents(priceEur) ?? 0,
    refund_amount_cents: eurStrToCents(refundEur),
    sale_amount_cents: eurStrToCents(saleEur),
  });
  const profitColor = profitCents > 0 ? '#4ade80'
                    : profitCents < 0 ? 'var(--color-error)'
                    : 'var(--color-on-surface-variant)';

  function handleSave() {
    const name = productName.trim();
    if (!name) { setError('Produktname ist Pflicht.'); return; }
    const priceCents = eurStrToCents(priceEur);
    if (priceCents == null || priceCents <= 0) { setError('Kaufpreis muss größer als 0 sein.'); return; }
    const url = productUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      setError('Produkt-Link muss mit http:// oder https:// beginnen.');
      return;
    }
    setError(null);
    patchMut.mutate({
      product_name: name,
      product_url: url || null,
      purchase_price_cents: priceCents,
      status,
      order_date: orderDate || null,
      received_date: receivedDate || null,
      review_deadline: reviewDeadline || null,
      refund_code: refundCode.trim() || null,
      refund_amount_cents: eurStrToCents(refundEur),
      sale_amount_cents: eurStrToCents(saleEur),
      notes: notes.trim() || null,
    });
  }

  function handleDelete() {
    if (!window.confirm(`Bewertung "${review!.product_name}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`)) return;
    deleteMut.mutate();
  }

  const sectionHeader: React.CSSProperties = {
    fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '0.8rem',
    textTransform: 'uppercase', letterSpacing: '0.08em',
    color: 'var(--color-on-surface-variant)', margin: '0 0 0.5rem',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.7rem', fontWeight: 600,
    color: 'var(--color-on-surface-variant)', marginBottom: '0.25rem',
    textTransform: 'uppercase', letterSpacing: '0.04em',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--color-surface)',
    border: '1px solid var(--color-outline)', color: 'var(--color-on-surface)',
    borderRadius: '0.5rem', padding: '0.5rem 0.625rem',
    fontSize: '0.875rem', fontFamily: 'var(--font-body)',
  };
  const sectionStyle: React.CSSProperties = { marginBottom: '1.25rem' };

  return (
    // Backdrop — KEIN onClick=onClose (Memory-Lesson Phase 4)
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', zIndex: 1000 }}>
      {/* Modal-Container — data-draggable-modal + ...modalStyle */}
      <div
        data-draggable-modal
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(640px, 95vw)', maxHeight: '92vh',
          background: 'var(--color-surface-container)', borderRadius: '1rem',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          display: 'flex', flexDirection: 'column',
          ...modalStyle,
        }}
      >
        {/* Drag-Handle = Header: onMouseDown + ...headerStyle */}
        <div
          onMouseDown={onMouseDown}
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--color-surface-container-high)',
            fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '1.125rem',
            color: 'var(--color-on-surface)',
            ...headerStyle,
          }}
        >
          Bewertung bearbeiten
        </div>

        <div style={{ padding: '1.5rem', overflowY: 'auto' }}>
          <section style={sectionStyle}>
            <h3 style={sectionHeader}>Produkt</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={labelStyle}>Produktname *</label>
                <input type="text" value={productName} onChange={(e) => setProductName(e.target.value)} onMouseDown={(e) => e.stopPropagation()} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Kaufpreis (EUR) *</label>
                <input type="number" step="0.01" min="0" value={priceEur} onChange={(e) => setPriceEur(e.target.value)} onMouseDown={(e) => e.stopPropagation()} style={inputStyle} />
              </div>
            </div>
            <div style={{ marginTop: '0.75rem' }}>
              <label style={labelStyle}>Produkt-Link</label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch' }}>
                <input
                  type="url"
                  inputMode="url"
                  value={productUrl}
                  onChange={(e) => setProductUrl(e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                  placeholder="https://www.amazon.de/..."
                  style={{ ...inputStyle, flex: 1 }}
                />
                {productUrl.trim() && /^https?:\/\//i.test(productUrl.trim()) && (
                  <a
                    href={productUrl.trim()}
                    target="_blank"
                    rel="noopener noreferrer"
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: '2.5rem',
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-outline)',
                      borderRadius: '0.5rem',
                      color: 'var(--color-primary)',
                      textDecoration: 'none',
                    }}
                    title="Link in neuem Tab öffnen"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>open_in_new</span>
                  </a>
                )}
              </div>
            </div>
          </section>

          <section style={sectionStyle}>
            <h3 style={sectionHeader}>Bestellung & Frist</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={labelStyle}>Bestelldatum</label>
                <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} onMouseDown={(e) => e.stopPropagation()} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Erhalten am</label>
                <input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} onMouseDown={(e) => e.stopPropagation()} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Bewertungsfrist</label>
                <input type="date" value={reviewDeadline} onChange={(e) => setReviewDeadline(e.target.value)} onMouseDown={(e) => e.stopPropagation()} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Refund-Code</label>
                <input type="text" value={refundCode} onChange={(e) => setRefundCode(e.target.value)} onMouseDown={(e) => e.stopPropagation()} style={inputStyle} />
              </div>
            </div>
          </section>

          <section style={sectionStyle}>
            <h3 style={sectionHeader}>Geld</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={labelStyle}>Refund (EUR)</label>
                <input type="number" step="0.01" value={refundEur} onChange={(e) => setRefundEur(e.target.value)} onMouseDown={(e) => e.stopPropagation()} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Verkaufserlös (EUR)</label>
                <input type="number" step="0.01" value={saleEur} onChange={(e) => setSaleEur(e.target.value)} onMouseDown={(e) => e.stopPropagation()} style={inputStyle} />
              </div>
            </div>
          </section>

          <section style={sectionStyle}>
            <h3 style={sectionHeader}>Status</h3>
            <select value={status} onChange={(e) => setStatus(e.target.value as ReviewStatus)} onMouseDown={(e) => e.stopPropagation()} style={inputStyle}>
              {ALL_STATUSES.map(s => (
                <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
              ))}
            </select>
          </section>

          <section style={sectionStyle}>
            <h3 style={sectionHeader}>Notiz</h3>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onMouseDown={(e) => e.stopPropagation()} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </section>

          {/* Profit-Read-Only — User-Decision 2026-05-25: negativ rot, 0 neutral, >0 gruen */}
          <div style={{
            background: 'var(--color-surface)', borderRadius: '0.5rem',
            padding: '0.75rem 1rem', marginBottom: '1rem',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Profit
            </span>
            <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1.25rem', color: profitColor }}>
              {formatCurrencyFromCents(profitCents)}
            </span>
          </div>

          {error && <p style={{ fontSize: '0.8rem', color: 'var(--color-error)', marginBottom: '1rem' }}>{error}</p>}
        </div>

        <div style={{
          padding: '1rem 1.5rem', borderTop: '1px solid var(--color-surface-container-high)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <button
            onClick={handleDelete}
            disabled={deleteMut.isPending}
            style={{
              background: 'transparent', border: '1px solid var(--color-error)',
              color: 'var(--color-error)', borderRadius: '0.5rem',
              padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 600,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
            Löschen
          </button>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={onClose}
              style={{
                background: 'transparent', color: 'var(--color-on-surface-variant)',
                border: '1px solid var(--color-outline)', borderRadius: '0.5rem',
                padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
              }}
            >
              Abbrechen
            </button>
            <button
              onClick={handleSave}
              disabled={patchMut.isPending}
              style={{
                background: 'linear-gradient(135deg, #cc97ff 0%, #9c48ea 100%)',
                color: '#fff', border: 'none', borderRadius: '0.5rem',
                padding: '0.5rem 1.25rem', fontSize: '0.875rem', fontWeight: 700,
                cursor: 'pointer', opacity: patchMut.isPending ? 0.6 : 1,
              }}
            >
              {patchMut.isPending ? 'Speichere…' : 'Änderungen speichern'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
