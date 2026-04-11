import { useState } from 'react';
import { deletePage, type Page } from '../../api/workbook.api';

interface PageListProps {
  pages: Page[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onReload: () => void;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    });
  } catch {
    return '';
  }
}

export function PageList({ pages, activeId, onSelect, onNew, onReload }: PageListProps) {
  const [showPinned, setShowPinned] = useState(false);

  async function handleDelete(e: React.MouseEvent, id: number, title: string) {
    e.stopPropagation();
    if (!window.confirm(`Seite "${title || 'Unbenannte Seite'}" wirklich löschen?`)) return;
    await deletePage(id);
    onReload();
  }

  const filtered = showPinned ? pages.filter((p) => p.is_pinned === 1) : pages;
  const sorted = [...filtered].sort((a, b) => {
    if (b.is_pinned !== a.is_pinned) return b.is_pinned - a.is_pinned;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  return (
    <div
      style={{
        width: '280px',
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
          gap: '0.5rem',
        }}
      >
        <button
          onClick={onNew}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.35rem 0.75rem',
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
          Neue Seite
        </button>

        {/* Pinned filter */}
        <button
          onClick={() => setShowPinned((v) => !v)}
          title={showPinned ? 'Alle anzeigen' : 'Nur Gepinnte'}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0.35rem',
            background: showPinned ? 'rgba(204,151,255,0.15)' : 'transparent',
            border: '1px solid var(--color-outline-variant)',
            borderRadius: '0.35rem',
            cursor: 'pointer',
            color: showPinned ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>push_pin</span>
        </button>
      </div>

      {/* Page list */}
      <div style={{ flex: 1 }}>
        {sorted.length === 0 && (
          <div
            style={{
              padding: '2rem 1rem',
              textAlign: 'center',
              color: 'var(--color-on-surface-variant)',
              fontFamily: 'var(--font-body)',
              fontSize: '0.85rem',
            }}
          >
            Noch keine Seiten.
          </div>
        )}
        {sorted.map((page) => (
          <div
            key={page.id}
            onClick={() => onSelect(page.id)}
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              background: activeId === page.id ? 'rgba(204,151,255,0.08)' : 'transparent',
              borderLeft: activeId === page.id ? '3px solid var(--color-primary)' : '3px solid transparent',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.15s',
              boxSizing: 'border-box',
              position: 'relative',
            }}
            onMouseEnter={(e) => {
              if (activeId !== page.id) {
                (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)';
              }
              const btn = e.currentTarget.querySelector<HTMLButtonElement>('.page-delete-btn');
              if (btn) btn.style.opacity = '1';
            }}
            onMouseLeave={(e) => {
              if (activeId !== page.id) {
                (e.currentTarget as HTMLDivElement).style.background = 'transparent';
              }
              const btn = e.currentTarget.querySelector<HTMLButtonElement>('.page-delete-btn');
              if (btn) btn.style.opacity = '0';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  color: 'var(--color-on-surface)',
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  flex: 1,
                }}
              >
                {page.title || 'Unbenannte Seite'}
              </span>
              {page.is_pinned === 1 && (
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '0.85rem', color: 'var(--color-primary)', marginLeft: '0.35rem', flexShrink: 0 }}
                >
                  push_pin
                </span>
              )}
              <button
                className="page-delete-btn"
                onClick={(e) => handleDelete(e, page.id, page.title)}
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
                  marginLeft: '0.25rem',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>delete</span>
              </button>
            </div>
            {page.excerpt && (
              <div
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.78rem',
                  color: 'var(--color-on-surface-variant)',
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  marginBottom: '0.25rem',
                }}
              >
                {page.excerpt}
              </div>
            )}
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.72rem',
                color: 'var(--color-outline)',
              }}
            >
              {formatDate(page.updated_at)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
