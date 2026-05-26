import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Review } from '../../../api/reviews.api';
import { formatCurrencyFromCents, formatDate } from '../../../lib/format';
import { todayLocal, parseLocalDate } from '../../../lib/dates';
import { calcProfit } from '../../../lib/profitCalc';
import { nextPipelineStatus } from './reviewStatus';

interface Props {
  review: Review;
  onCardClick: (r: Review) => void;
  onForward: (id: number) => void;
}

interface BadgeStyle { bg: string; text: string; border: string }

function getFristBadgeStyle(deadline: string): BadgeStyle {
  const today = parseLocalDate(todayLocal()).getTime();
  const dl = parseLocalDate(deadline).getTime();
  const diffDays = Math.floor((dl - today) / 86_400_000);
  if (diffDays < 0)  return { bg: 'rgba(167,1,56,0.40)',    text: '#ffb2b9',                          border: '#ff6e84' };
  if (diffDays <= 3) return { bg: 'rgba(255,110,132,0.18)', text: '#ff6464',                          border: 'rgba(255,110,132,0.40)' };
  if (diffDays <= 7) return { bg: 'rgba(255,196,87,0.15)',  text: '#ffc457',                          border: 'rgba(255,196,87,0.40)' };
  return                   { bg: 'rgba(255,255,255,0.06)',  text: 'var(--color-on-surface-variant)',  border: 'rgba(255,255,255,0.10)' };
}

// Rueckgabe-Reminder (User-Decision 2026-05-26): zeigt Badge wenn order_date >= 21 Tage zurueck
// UND Status noch vor 'Geld erhalten' (danach ist Refund schon da, Rueckgabe nicht mehr sinnvoll).
function getReturnReminderDays(orderDate: string | null, status: Review['status']): number | null {
  if (!orderDate) return null;
  if (!['bestellt', 'erhalten', 'bewertet'].includes(status)) return null;
  const today = parseLocalDate(todayLocal()).getTime();
  const od = parseLocalDate(orderDate).getTime();
  const days = Math.floor((today - od) / 86_400_000);
  return days >= 21 ? days : null;
}

export function ReviewCard({ review, onCardClick, onForward }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: review.id });
  const [isHover, setIsHover] = useState(false);

  const nextStatus = nextPipelineStatus(review.status);
  const showForward = nextStatus !== null;
  const badge = review.review_deadline ? getFristBadgeStyle(review.review_deadline) : null;
  const returnDays = getReturnReminderDays(review.order_date, review.status);
  // Saldo-Pill (User-Decision 2026-05-26): zeigt aktuellen Geldfluss pro Item.
  // Vorgemerkt = 0 (kein Pill). Bestellt ohne Refund = negativ. Geld erhalten = ausgeglichen.
  const cardProfit = calcProfit(review);
  const showSaldoPill = review.status !== 'vorgemerkt';
  const saldoPillStyle = cardProfit > 0
    ? { bg: 'rgba(92,253,128,0.12)',  text: '#5cfd80',          border: 'rgba(92,253,128,0.35)' }
    : cardProfit < 0
    ? { bg: 'rgba(255,110,132,0.15)', text: '#ff6464',          border: 'rgba(255,110,132,0.4)' }
    : { bg: 'rgba(255,255,255,0.06)', text: 'var(--color-on-surface-variant)', border: 'rgba(255,255,255,0.15)' };
  const saldoLabel = cardProfit > 0
    ? '+' + formatCurrencyFromCents(cardProfit)
    : cardProfit < 0
    ? '−' + formatCurrencyFromCents(-cardProfit)
    : '±0,00 €';

  // SINGLE style-Objekt — alle Properties zusammengefuehrt, kein doppeltes style-Prop, kein Spread-Trick
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: `border-color 150ms ease${transition ? ', ' + transition : ''}`,
    opacity: isDragging ? 0.5 : 1,
    boxShadow: isDragging ? 'var(--glow-primary)' : 'none',
    background: 'var(--color-surface-container)',
    borderRadius: '0.75rem',
    padding: '1rem',
    // Hover-Border via useState (re-render-safe; nicht via e.currentTarget.style — Revision Iteration 1)
    border: `1px solid ${isHover ? 'rgba(148,170,255,0.3)' : 'var(--color-surface-container-high)'}`,
    cursor: 'pointer',
    listStyle: 'none',
  };

  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={style}
      onClick={() => onCardClick(review)}
      onMouseEnter={() => setIsHover(true)}
      onMouseLeave={() => setIsHover(false)}
    >
      {/* Title — wenn product_url existiert, ist der Name ein externer Link */}
      <div
        style={{
          fontFamily: 'var(--font-headline)',
          fontSize: '0.875rem',
          fontWeight: 700,
          lineHeight: 1.4,
          wordBreak: 'break-word',
          color: 'var(--color-on-surface)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
        }}
      >
        {review.product_url ? (
          <a
            href={review.product_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              color: 'inherit',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              borderBottom: '1px dashed rgba(148,170,255,0.35)',
            }}
            title="Produkt-Link öffnen"
          >
            <span>{review.product_name}</span>
            <span className="material-symbols-outlined" style={{ fontSize: '14px', color: '#94aaff' }}>open_in_new</span>
          </a>
        ) : (
          review.product_name
        )}
      </div>

      {/* Meta-Row: Kaufpreis-Pill + optionaler Frist-Badge */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginTop: '0.5rem' }}>
        <span
          style={{
            background: 'rgba(148,170,255,0.08)',
            color: '#94aaff',
            fontSize: '0.7rem',
            fontWeight: 600,
            padding: '0.15rem 0.5rem',
            borderRadius: '9999px',
          }}
          title="Kaufpreis"
        >
          {formatCurrencyFromCents(review.purchase_price_cents)}
        </span>
        {showSaldoPill && (
          <span
            title={cardProfit < 0 ? 'Noch ausstehend' : cardProfit > 0 ? 'Gewinn realisiert' : 'Ausgeglichen'}
            style={{
              background: saldoPillStyle.bg,
              color: saldoPillStyle.text,
              border: `1px solid ${saldoPillStyle.border}`,
              fontSize: '0.7rem',
              fontWeight: 700,
              padding: '0.15rem 0.5rem',
              borderRadius: '9999px',
            }}
          >
            {saldoLabel}
          </span>
        )}
        {badge && review.review_deadline && (
          <span
            style={{
              background: badge.bg,
              color: badge.text,
              border: `1px solid ${badge.border}`,
              fontSize: '0.7rem',
              fontWeight: 600,
              padding: '0.15rem 0.5rem',
              borderRadius: '9999px',
            }}
          >
            {formatDate(review.review_deadline)}
          </span>
        )}
        {returnDays !== null && (
          <span
            title={`${returnDays} Tage seit Bestellung — Rückgabe noch möglich?`}
            style={{
              background: 'rgba(255,140,0,0.15)',
              color: '#ffb84d',
              border: '1px solid rgba(255,140,0,0.4)',
              fontSize: '0.7rem',
              fontWeight: 600,
              padding: '0.15rem 0.5rem',
              borderRadius: '9999px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.2rem',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>assignment_return</span>
            Rückgabe?
          </span>
        )}
      </div>

      {/* Forward-Button (nur sichtbar wenn Pipeline-Status mit Nachfolger) */}
      {showForward && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button
            onClick={(e) => { e.stopPropagation(); onForward(review.id); }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              background: 'transparent',
              border: '1px solid rgba(148,170,255,0.2)',
              color: '#94aaff',
              borderRadius: '0.5rem',
              padding: '0.25rem 0.625rem',
              fontSize: '0.7rem',
              fontWeight: 600,
              fontFamily: 'var(--font-body)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(148,170,255,0.12)';
              e.currentTarget.style.borderColor = 'rgba(148,170,255,0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = 'rgba(148,170,255,0.2)';
            }}
          >
            Weiter
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>arrow_forward</span>
          </button>
        </div>
      )}
    </li>
  );
}
