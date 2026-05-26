import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Review, ReviewStatus } from '../../../api/reviews.api';
import { STATUS_CONFIG, TERMINAL } from './reviewStatus';
import { ReviewCard } from './ReviewCard';

interface Props {
  status: ReviewStatus;
  reviews: Review[];
  onCardClick: (r: Review) => void;
  onForward: (id: number) => void;
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

export function ReviewColumn({ status, reviews, onCardClick, onForward }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const cfg = STATUS_CONFIG[status];
  const isTerminal = TERMINAL.includes(status);
  const empty = EMPTY[status];

  const isEmpty = reviews.length === 0;

  return (
    <div
      ref={setNodeRef}
      style={{
        width: '100%',
        background: isOver ? 'rgba(148,170,255,0.06)' : (isTerminal ? 'rgba(25,37,64,0.30)' : 'rgba(25,37,64,0.40)'),
        borderRadius: '0.875rem',
        padding: isEmpty ? '0.5rem 0.875rem' : '0.75rem 0.875rem 0.875rem',
        transition: 'background 150ms ease',
        opacity: isEmpty ? 0.55 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isEmpty ? 0 : '0.625rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: cfg.accent }}>{cfg.icon}</span>
          <span style={{ fontFamily: 'var(--font-headline)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: cfg.accent }}>
            {cfg.label}
          </span>
          {isEmpty && (
            <span style={{ fontSize: '0.7rem', color: 'var(--color-on-surface-variant)', marginLeft: '0.25rem', fontStyle: 'italic' }}>
              {empty.heading}
            </span>
          )}
        </div>
        <span style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--color-on-surface-variant)', fontSize: '0.7rem', fontWeight: 600, padding: '0.1rem 0.5rem', borderRadius: '9999px' }}>
          {reviews.length}
        </span>
      </div>

      {!isEmpty && (
        <SortableContext items={reviews.map(r => r.id)} strategy={verticalListSortingStrategy}>
          <ul style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: '0.5rem',
          }}>
            {reviews.map(r => <ReviewCard key={r.id} review={r} onCardClick={onCardClick} onForward={onForward} />)}
          </ul>
        </SortableContext>
      )}
    </div>
  );
}
