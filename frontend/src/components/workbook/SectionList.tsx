import type { Section } from '../../api/workbook.api';

interface SectionListProps {
  sections: Section[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onReload: () => void;
}

export function SectionList({ sections, activeId, onSelect, onNew }: SectionListProps) {
  return (
    <div
      style={{
        width: '240px',
        background: 'var(--color-surface-container)',
        borderRight: '1px solid var(--color-outline-variant)',
        overflowY: 'auto',
        padding: '1rem 0',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-headline)',
          fontSize: '0.65rem',
          letterSpacing: '0.22em',
          color: 'var(--color-outline)',
          margin: '0 1rem 1rem',
          textTransform: 'uppercase',
        }}
      >
        Arbeitsmappe
      </div>

      <div style={{ flex: 1 }}>
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => onSelect(section.id)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.55rem 1rem',
              background: activeId === section.id ? 'rgba(204,151,255,0.08)' : 'transparent',
              borderTop: 'none',
              borderRight: 'none',
              borderBottom: 'none',
              borderLeft: activeId === section.id
                ? '3px solid var(--color-primary)'
                : '3px solid transparent',
              cursor: 'pointer',
              textAlign: 'left',
              color: 'var(--color-on-surface)',
              fontFamily: 'var(--font-body)',
              fontSize: '0.9rem',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => {
              if (activeId !== section.id) {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)';
              }
            }}
            onMouseLeave={(e) => {
              if (activeId !== section.id) {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', color: 'var(--color-on-surface-variant)' }}>
              {section.icon || 'folder'}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {section.name}
            </span>
          </button>
        ))}
      </div>

      <button
        onClick={onNew}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.6rem 1rem',
          margin: '0.5rem 0.75rem 0',
          background: 'transparent',
          border: '1px dashed var(--color-outline-variant)',
          borderRadius: '0.4rem',
          cursor: 'pointer',
          color: 'var(--color-on-surface-variant)',
          fontFamily: 'var(--font-body)',
          fontSize: '0.85rem',
          transition: 'background 0.15s, color 0.15s',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(204,151,255,0.06)';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-primary)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-on-surface-variant)';
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>add</span>
        Neue Sektion
      </button>
    </div>
  );
}
