import { type ReactNode } from 'react';

interface Props {
  icon: string;
  title: string;
  accent: string;       // CSS color (z.B. '#a78bfa')
  expanded: boolean;
  onToggleExpand: () => void;
  rightSlot?: ReactNode; // i.d.R. das SectionStatusBadge
}

export function SectionHeader({ icon, title, accent, expanded, onToggleExpand, rightSlot }: Props) {
  return (
    <header
      role="button"
      tabIndex={0}
      onClick={onToggleExpand}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggleExpand();
        }
      }}
      className="flex items-center gap-3 px-5 py-4 cursor-pointer select-none"
      style={{ background: 'transparent' }}
    >
      <span className="material-symbols-outlined" style={{ color: accent }}>{icon}</span>
      <h2 className="flex-1 font-semibold" style={{ color: accent }}>{title}</h2>
      {rightSlot}
      <span
        className="material-symbols-outlined transition-transform"
        style={{
          color: 'var(--color-on-surface-variant)',
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
        }}
      >
        expand_more
      </span>
    </header>
  );
}
