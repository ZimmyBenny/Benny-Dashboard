interface Props {
  active: boolean;
  count: number;
  onToggle: () => void;
}

export function DiscardedToggleButton({ active, count, onToggle }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="px-3 py-1.5 rounded-md text-sm flex items-center gap-2"
      style={{
        background: 'var(--color-surface-container-high)',
        color: 'var(--color-on-surface)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <span className="material-symbols-outlined text-base">archive</span>
      {active ? 'Verworfene ausblenden' : 'Verworfene einblenden'}
      <span
        className="px-2 py-0.5 rounded-full text-xs"
        style={{ background: '#fdba7433', color: '#fdba74' }}
      >
        {count}
      </span>
    </button>
  );
}
