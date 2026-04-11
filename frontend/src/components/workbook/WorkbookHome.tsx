interface WorkbookHomeProps {
  onOpenPage: (id: number) => void;
}

export function WorkbookHome({ }: WorkbookHomeProps) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '1rem',
        background: 'var(--color-surface)',
        color: 'var(--color-on-surface-variant)',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: 'var(--color-outline)' }}>
        menu_book
      </span>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', textAlign: 'center' }}>
        Seite aus der Liste auswählen oder eine neue anlegen.
      </p>
    </div>
  );
}
