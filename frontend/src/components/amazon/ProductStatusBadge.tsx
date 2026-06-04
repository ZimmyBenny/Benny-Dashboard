import { useEffect, useRef, useState } from 'react';
import { type AmazonProductStatus } from '../../api/amazon.api';
import { useUpdateAmazonProductStatus } from '../../hooks/amazon/useAmazonProducts';

const LABEL: Record<AmazonProductStatus, string> = {
  interessant: 'Interessant',
  aktiv:       'Aktiv',
  bestehend:   'Bestehend',
  verworfen:   'Verworfen',
};
const ICON: Record<AmazonProductStatus, string> = {
  interessant: 'star',
  aktiv:       'settings',
  bestehend:   'check_circle',
  verworfen:   'archive',
};
const COLOR: Record<AmazonProductStatus, string> = {
  interessant: '#60a5fa',
  aktiv:       '#60a5fa',
  bestehend:   '#34d399',
  verworfen:   '#fdba74',
};
const ORDER: AmazonProductStatus[] = ['interessant', 'aktiv', 'bestehend', 'verworfen'];

export function ProductStatusBadge({
  productId, status, align = 'left',
}: {
  productId: number;
  status: AmazonProductStatus;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const update = useUpdateAmazonProductStatus();

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
    <div
      ref={ref}
      className="relative"
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
      onMouseDown={(e) => { e.stopPropagation(); }}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(o => !o); }}
        className="px-2.5 py-1 rounded-full text-xs flex items-center gap-1 backdrop-blur-sm cursor-pointer"
        style={{ background: `${color}33`, color }}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="material-symbols-outlined text-base">{ICON[status]}</span>
        {LABEL[status]}
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} mt-1 rounded-lg shadow-lg overflow-hidden z-20 w-max min-w-[180px]`}
          style={{ background: 'var(--color-surface-container-high)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {ORDER.map((s) => {
            const isCurrent = s === status;
            const c = COLOR[s];
            const isPending = update.isPending && update.variables?.status === s;
            return (
              <button
                key={s}
                type="button"
                role="menuitem"
                disabled={update.isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  if (s === status) { setOpen(false); return; }
                  update.mutate({ id: productId, status: s }, { onSuccess: () => setOpen(false) });
                }}
                className="w-full px-3 py-2 text-sm flex items-center gap-2 text-left whitespace-nowrap"
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
                  {isCurrent ? 'check' : ICON[s]}
                </span>
                <span className="flex-1">{LABEL[s]}</span>
                {isPending && (
                  <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
