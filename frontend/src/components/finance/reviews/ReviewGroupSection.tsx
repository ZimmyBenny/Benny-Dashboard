import { useState } from 'react';
import type { Review, ReviewStatus } from '../../../api/reviews.api';
import type { StatusGroup } from './reviewStatus';
import { ReviewColumn } from './ReviewColumn';

interface Props {
  group: StatusGroup;
  byStatus: Record<ReviewStatus, Review[]>;
  onCardClick: (r: Review) => void;
  onForward: (id: number) => void;
  /** Initial-Zustand des Aufklapp-Toggles (true = aufgeklappt). */
  defaultOpen?: boolean;
}

export function ReviewGroupSection({ group, byStatus, onCardClick, onForward, defaultOpen = true }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  const totalItems = group.statuses.reduce((sum, s) => sum + byStatus[s].length, 0);

  return (
    <div style={{
      borderRadius: '1rem',
      overflow: 'hidden',
      border: '1px solid rgba(148,170,255,0.15)',
      background: 'linear-gradient(135deg, rgba(148,170,255,0.04) 0%, rgba(6,14,32,0.5) 60%)',
    }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.875rem 1.25rem',
          borderBottom: open ? '1px solid rgba(148,170,255,0.12)' : 'none',
          background: 'rgba(148,170,255,0.03)',
          border: 'none',
          color: 'inherit',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <div style={{
            width: '30px', height: '30px', borderRadius: '0.5rem',
            background: 'rgba(148,170,255,0.1)',
            border: '1px solid rgba(148,170,255,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: group.accent }}>{group.icon}</span>
          </div>
          <div style={{
            fontFamily: 'var(--font-headline)',
            fontSize: '0.9rem',
            fontWeight: 800,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: group.accent,
          }}>
            {group.label}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <span style={{
            background: 'rgba(255,255,255,0.06)',
            color: 'var(--color-on-surface-variant)',
            fontSize: '0.7rem',
            fontWeight: 600,
            padding: '0.15rem 0.625rem',
            borderRadius: '9999px',
          }}>
            {totalItems} {totalItems === 1 ? 'Eintrag' : 'Eintraege'}
          </span>
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: '1.1rem',
              color: 'var(--color-on-surface-variant)',
              transition: 'transform 0.2s',
              transform: open ? 'rotate(180deg)' : 'none',
            }}
          >
            expand_more
          </span>
        </div>
      </button>

      {open && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${group.statuses.length}, minmax(0, 1fr))`,
          gap: '0.625rem',
          padding: '0.875rem',
        }}>
          {group.statuses.map(status => (
            <ReviewColumn
              key={status}
              status={status}
              reviews={byStatus[status]}
              onCardClick={onCardClick}
              onForward={onForward}
              compact
            />
          ))}
        </div>
      )}
    </div>
  );
}
