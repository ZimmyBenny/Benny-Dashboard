import { deleteSection, updateSection, type Section } from '../../api/workbook.api';

interface SectionListProps {
  sections: Section[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onReload: () => void;
}

export function SectionList({ sections, activeId, onSelect, onNew, onReload }: SectionListProps) {
  async function handleDelete(e: React.MouseEvent, id: number, name: string) {
    e.stopPropagation();
    if (!window.confirm(`Sektion "${name}" wirklich löschen?`)) return;
    await deleteSection(id);
    onReload();
  }

  async function handleRename(e: React.MouseEvent, section: Section) {
    e.stopPropagation();
    const newName = window.prompt('Neuer Name:', section.name);
    if (!newName || newName.trim() === section.name) return;
    await updateSection(section.id, { name: newName.trim(), icon: section.icon });
    onReload();
  }
  return (
    <div
      style={{
        width: '240px',
        background: 'var(--color-surface-container)',
        borderRight: '1px solid var(--color-outline-variant)',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '0.75rem 1rem',
          borderBottom: '1px solid var(--color-outline-variant)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <button
          onClick={onNew}
          title="Neuer Bereich"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '0.3rem 0.6rem',
            background: 'var(--color-primary)',
            color: 'var(--color-on-primary)',
            border: 'none',
            borderRadius: '0.35rem',
            cursor: 'pointer',
            fontFamily: 'var(--font-body)',
            fontSize: '0.8rem',
            fontWeight: 600,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>add</span>
          Neuer Bereich
        </button>
      </div>

      <div style={{ flex: 1, paddingTop: '0.5rem' }}>
        {sections.map((section) => (
          <div
            key={section.id}
            className="workbook-section-row"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.55rem 1rem',
              background: activeId === section.id ? 'rgba(204,151,255,0.08)' : 'transparent',
              borderLeft: activeId === section.id
                ? '3px solid var(--color-primary)'
                : '3px solid transparent',
              cursor: 'pointer',
              color: 'var(--color-on-surface)',
              fontFamily: 'var(--font-body)',
              fontSize: '0.9rem',
              transition: 'background 0.15s',
              position: 'relative',
            }}
            onClick={() => onSelect(section.id)}
            onMouseEnter={(e) => {
              if (activeId !== section.id) {
                (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)';
              }
              e.currentTarget.querySelectorAll<HTMLButtonElement>('.section-action-btn').forEach((b) => (b.style.opacity = '1'));
            }}
            onMouseLeave={(e) => {
              if (activeId !== section.id) {
                (e.currentTarget as HTMLDivElement).style.background = 'transparent';
              }
              e.currentTarget.querySelectorAll<HTMLButtonElement>('.section-action-btn').forEach((b) => (b.style.opacity = '0'));
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', color: 'var(--color-on-surface-variant)', lineHeight: 1, marginTop: '2px' }}>
              {section.icon || 'folder'}
            </span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {section.name}
            </span>
            <button
              className="section-action-btn"
              onClick={(e) => handleRename(e, section)}
              style={{
                opacity: 0,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '0.1rem',
                display: 'flex',
                alignItems: 'center',
                color: 'var(--color-on-surface-variant)',
                transition: 'opacity 0.15s',
                flexShrink: 0,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>edit</span>
            </button>
            <button
              className="section-action-btn"
              onClick={(e) => handleDelete(e, section.id, section.name)}
              style={{
                opacity: 0,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '0.1rem',
                display: 'flex',
                alignItems: 'center',
                color: 'var(--color-error)',
                transition: 'opacity 0.15s',
                flexShrink: 0,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>delete</span>
            </button>
          </div>
        ))}
      </div>

    </div>
  );
}
