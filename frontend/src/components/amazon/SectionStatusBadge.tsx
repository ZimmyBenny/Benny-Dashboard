import { useEffect, useRef, useState } from 'react';
import { type SourcingStatus } from '../../api/amazon.api';

const LABEL: Record<SourcingStatus, string> = {
  offen:           'Offen',
  in_bearbeitung:  'In Bearbeitung',
  erledigt:        'Erledigt',
};
const COLOR: Record<SourcingStatus, string> = {
  offen:           '#9ca3af',
  in_bearbeitung:  '#60a5fa',
  erledigt:        '#34d399',
};
const ORDER: SourcingStatus[] = ['offen', 'in_bearbeitung', 'erledigt'];

interface Props {
  status: SourcingStatus;
  onChange: (next: SourcingStatus) => void;
  isPending?: boolean;
}

export function SectionStatusBadge({ status, onChange, isPending }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const color = COLOR[status];

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className="px-2.5 py-1 rounded-full text-xs flex items-center gap-1"
        style={{ background: `${color}33`, color }}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={isPending}
      >
        {LABEL[status]}
        <span className="material-symbols-outlined text-base" style={{ fontSize: '14px' }}>expand_more</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 rounded-lg shadow-lg overflow-hidden z-20 min-w-[160px]"
          style={{ background: 'var(--color-surface-container-high)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {ORDER.map((s) => {
            const isCurrent = s === status;
            const c = COLOR[s];
            return (
              <button
                key={s}
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  if (s !== status) onChange(s);
                  setOpen(false);
                }}
                className="w-full px-3 py-2 text-sm flex items-center gap-2 text-left"
                style={{
                  background: isCurrent ? `${c}22` : 'transparent',
                  color: 'var(--color-on-surface)',
                }}
                onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = `${c}11`; }}
                onMouseLeave={(e) => { if (!isCurrent) e.currentTarget.style.background = 'transparent'; }}
              >
                <span
                  className="material-symbols-outlined text-base"
                  style={{ color: isCurrent ? c : 'var(--color-on-surface-variant)' }}
                >
                  {isCurrent ? 'check' : 'circle'}
                </span>
                <span className="flex-1">{LABEL[s]}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
