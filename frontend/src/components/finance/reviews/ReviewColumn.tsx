import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Review, ReviewStatus } from '../../../api/reviews.api';
import { STATUS_CONFIG } from './reviewStatus';
import { ReviewCard } from './ReviewCard';

interface Props {
  status: ReviewStatus;
  reviews: Review[];
  onCardClick: (r: Review) => void;
  onForward: (id: number) => void;
  /** Kompakt-Modus fuer Verwendung innerhalb einer ReviewGroupSection (vertikales Items-Stacking). */
  compact?: boolean;
}

const EMPTY: Record<ReviewStatus, { heading: string; body?: string; icon: string }> = {
  vorgemerkt:     { heading: 'Nichts vorgemerkt',         body: 'Neue Bewertungen tauchen hier zuerst auf', icon: 'bookmark' },
  bestellt:       { heading: 'Keine offenen Bestellungen', icon: 'local_shipping' },
  erhalten:       { heading: 'Nichts auf dem Tisch',       icon: 'inbox' },
  bewertet:       { heading: 'Keine wartenden Refunds',    icon: 'rate_review' },
  geld_erhalten:  { heading: 'Keine neuen Refunds',        icon: 'account_balance_wallet' },
  bereit_verkauf: { heading: 'Nichts auf Lager',           icon: 'sell' },
  behalten:       { heading: 'Noch leer',                  icon: 'home' },
  verkauft:       { heading: 'Noch leer',                  icon: 'paid' },
  verschenkt:     { heading: 'Noch leer',                  icon: 'redeem' },
  entsorgt:       { heading: 'Noch leer',                  icon: 'delete' },
};

export function ReviewColumn({ status, reviews, onCardClick, onForward, compact = false }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const cfg = STATUS_CONFIG[status];
  const empty = EMPTY[status];

  const isEmpty = reviews.length === 0;

  return (
    <div
      ref={setNodeRef}
      style={{
        width: '100%',
        minHeight: compact ? 120 : undefined,
        background: isOver ? 'rgba(148,170,255,0.06)' : 'var(--color-surface-container)',
        borderRadius: '0.75rem',
        padding: compact ? '0.625rem' : (isEmpty ? '0.5rem 0.875rem' : '0.75rem 0.875rem 0.875rem'),
        transition: 'background 150ms ease',
        opacity: isEmpty ? 0.55 : 1,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: compact ? '0.5rem' : (isEmpty ? 0 : '0.625rem'),
        gap: '0.25rem',
        minWidth: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', minWidth: 0, flex: 1 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: cfg.accent, flexShrink: 0 }}>{cfg.icon}</span>
          <span style={{
            fontFamily: 'var(--font-headline)',
            fontSize: compact ? '0.7rem' : '0.8rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: cfg.accent,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {cfg.label}
          </span>
          {!compact && isEmpty && (
            <span style={{ fontSize: '0.7rem', color: 'var(--color-on-surface-variant)', marginLeft: '0.25rem', fontStyle: 'italic' }}>
              {empty.heading}
            </span>
          )}
        </div>
        <span style={{
          background: 'rgba(255,255,255,0.06)',
          color: 'var(--color-on-surface-variant)',
          fontSize: '0.7rem',
          fontWeight: 600,
          padding: '0.1rem 0.5rem',
          borderRadius: '9999px',
          flexShrink: 0,
        }}>
          {reviews.length}
        </span>
      </div>

      {isEmpty && compact && (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-on-surface-variant)',
          opacity: 0.6,
          padding: '0.25rem',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, opacity: 0.5 }}>{empty.icon}</span>
          <span style={{ fontSize: '0.65rem', fontStyle: 'italic', marginTop: '0.25rem', textAlign: 'center' }}>
            {empty.heading}
          </span>
        </div>
      )}

      {!isEmpty && (
        <SortableContext items={reviews.map(r => r.id)} strategy={verticalListSortingStrategy}>
          <ul style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: compact ? 'flex' : 'grid',
            flexDirection: compact ? 'column' : undefined,
            gridTemplateColumns: compact ? undefined : 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: '0.5rem',
          }}>
            {reviews.map(r => <ReviewCard key={r.id} review={r} onCardClick={onCardClick} onForward={onForward} />)}
          </ul>
        </SortableContext>
      )}
    </div>
  );
}
