// Chevron-Knopf im Spalten-Header: klappt die Spalte nach unten zu bzw. wieder auf.
// Der Spalten-Kopf bleibt sichtbar, nur die Einträge werden aus-/eingeblendet.
export function CollapseButton({ collapsed, onClick }: { collapsed: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? 'Spalte aufklappen' : 'Spalte einklappen'}
      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', color: 'var(--color-outline)', transition: 'color 150ms ease' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-primary)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-outline)'; }}
    >
      <span
        className="material-symbols-outlined"
        style={{ fontSize: '18px', transition: 'transform 150ms ease', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
      >
        expand_more
      </span>
    </button>
  );
}
