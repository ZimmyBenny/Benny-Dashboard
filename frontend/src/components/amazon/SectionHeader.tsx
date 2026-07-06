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
      // Einzelklick togglet NICHT mehr (würde Drag/rightSlot-Bedienung stören) —
      // Toggle nur per Doppelklick auf die Kopfzeile bzw. Einzelklick auf den Pfeil-Button.
      onDoubleClick={onToggleExpand}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggleExpand();
        }
      }}
      className="flex items-center gap-3 px-5 py-4 cursor-default select-none"
      style={{ background: 'transparent' }}
    >
      <span className="material-symbols-outlined" style={{ color: accent }}>{icon}</span>
      <h2 className="flex-1 font-semibold" style={{ color: accent }}>{title}</h2>
      {rightSlot}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
        aria-label={expanded ? 'Einklappen' : 'Aufklappen'}
        className="flex items-center justify-center rounded-md"
        style={{ background: 'transparent', color: 'var(--color-on-surface-variant)' }}
      >
        <span
          className="material-symbols-outlined transition-transform"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          expand_more
        </span>
      </button>
    </header>
  );
}
