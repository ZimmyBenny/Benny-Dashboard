import { useState } from 'react';
import { deletePage, fetchPages, updatePage, type Page } from '../../api/workbook.api';

interface PageListProps {
  pages: Page[];
  activeId: number | null;
  onSelect: (id: number | null) => void;
  onNew: () => void;
  onNewChild: (parentId: number) => void;
  onReload: () => void;
}


export function PageList({ pages, activeId, onSelect, onNew, onNewChild, onReload }: PageListProps) {
  const [showPinned, setShowPinned] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [childrenMap, setChildrenMap] = useState<Record<number, Page[]>>({});
  const [loadingChildren, setLoadingChildren] = useState<Set<number>>(new Set());

  async function handleToggleExpand(e: React.MouseEvent, pageId: number) {
    e.stopPropagation();
    if (expandedIds.has(pageId)) {
      setExpandedIds((prev) => { const s = new Set(prev); s.delete(pageId); return s; });
      return;
    }
    // Kinder immer frisch laden beim Aufklappen (damit neue Unterseiten erscheinen)
    setLoadingChildren((prev) => new Set(prev).add(pageId));
    try {
      const children = await fetchPages({ parent_id: pageId });
      setChildrenMap((prev) => ({ ...prev, [pageId]: children }));
    } finally {
      setLoadingChildren((prev) => { const s = new Set(prev); s.delete(pageId); return s; });
    }
    setExpandedIds((prev) => new Set(prev).add(pageId));
  }

  async function handleDelete(e: React.MouseEvent, id: number, title: string) {
    e.stopPropagation();
    if (!window.confirm(`Seite "${title || 'Unbenannte Seite'}" wirklich löschen?`)) return;
    await deletePage(id);
    if (activeId === id) onSelect(null);
    // childrenMap bereinigen falls es eine Unterseite war
    setChildrenMap((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        next[Number(key)] = next[Number(key)].filter((p) => p.id !== id);
      }
      return next;
    });
    onReload();
  }

  async function handleRename(e: React.MouseEvent, page: Page) {
    e.stopPropagation();
    const newTitle = window.prompt('Neuer Titel:', page.title || '');
    if (newTitle === null || newTitle.trim() === page.title) return;
    await updatePage(page.id, { title: newTitle.trim() });
    onReload();
  }

  function handleAddChild(e: React.MouseEvent, parentId: number) {
    e.stopPropagation();
    onNewChild(parentId);
  }

  const filtered = showPinned ? pages.filter((p) => p.is_pinned === 1) : pages;
  const sorted = [...filtered].sort((a, b) => {
    if (b.is_pinned !== a.is_pinned) return b.is_pinned - a.is_pinned;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  function renderPage(page: Page, isChild = false) {
    const isActive = activeId === page.id;
    return (
      <div key={page.id}>
        <div
          onClick={() => onSelect(page.id)}
          style={{
            width: '100%',
            padding: isChild ? '0.55rem 0.75rem 0.55rem 0.75rem' : '0.75rem 1rem',
            background: isActive ? 'rgba(204,151,255,0.08)' : 'transparent',
            borderLeft: isActive ? '3px solid var(--color-primary)' : '3px solid transparent',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'background 0.15s',
            boxSizing: 'border-box',
            position: 'relative',
          }}
          onMouseEnter={(e) => {
            if (!isActive) {
              (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)';
            }
            e.currentTarget.querySelectorAll<HTMLButtonElement>('.page-action-btn').forEach((b) => (b.style.opacity = '1'));
          }}
          onMouseLeave={(e) => {
            if (!isActive) {
              (e.currentTarget as HTMLDivElement).style.background = 'transparent';
            }
            e.currentTarget.querySelectorAll<HTMLButtonElement>('.page-action-btn').forEach((b) => (b.style.opacity = '0'));
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: page.excerpt && !isChild ? '0.25rem' : 0 }}>
            {/* Chevron für Top-Level */}
            {!isChild && (
              <button
                className="page-action-btn-expand"
                onClick={(e) => handleToggleExpand(e, page.id)}
                title={expandedIds.has(page.id) ? 'Einklappen' : 'Unterseiten anzeigen'}
                style={{
                  opacity: 0.4,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0.1rem',
                  display: 'flex',
                  alignItems: 'center',
                  color: 'var(--color-on-surface-variant)',
                  transition: 'opacity 0.15s, transform 0.15s',
                  transform: expandedIds.has(page.id) ? 'rotate(90deg)' : 'rotate(0deg)',
                  flexShrink: 0,
                  marginRight: '0.25rem',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '0.85rem' }}>chevron_right</span>
              </button>
            )}

            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: isChild ? '0.82rem' : '0.88rem',
                fontWeight: isChild ? 400 : 600,
                color: isChild ? 'var(--color-on-surface-variant)' : 'var(--color-on-surface)',
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
              className="page-action-btn"
              onClick={(e) => handleRename(e, page)}
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
                marginLeft: '0.25rem',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>edit</span>
            </button>

            {/* "+" Button: Unterseite erstellen — nur bei Top-Level */}
            {!isChild && (
              <button
                className="page-action-btn"
                onClick={(e) => handleAddChild(e, page.id)}
                title="Unterseite erstellen"
                style={{
                  opacity: 0,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0.1rem',
                  display: 'flex',
                  alignItems: 'center',
                  color: 'var(--color-primary)',
                  transition: 'opacity 0.15s',
                  flexShrink: 0,
                  marginLeft: '0.25rem',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>add</span>
              </button>
            )}

            <button
              className="page-action-btn"
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

          {/* Excerpt nur bei Top-Level */}
          {page.excerpt && !isChild && (
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
        </div>

        {/* Kinder anzeigen wenn expanded (nur Top-Level hat Kinder) */}
        {!isChild && expandedIds.has(page.id) && (
          <div style={{
            marginLeft: '1rem',
            borderLeft: '2px solid rgba(204,151,255,0.25)',
            background: 'rgba(0,0,0,0.08)',
          }}>
            {loadingChildren.has(page.id) ? (
              <div style={{ padding: '0.5rem 1rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.78rem' }}>
                Lädt...
              </div>
            ) : (childrenMap[page.id] ?? []).length === 0 ? (
              <div style={{ padding: '0.4rem 0.75rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.78rem', fontStyle: 'italic' }}>
                Keine Unterseiten
              </div>
            ) : (
              (childrenMap[page.id] ?? []).map((child) => renderPage(child, true))
            )}
          </div>
        )}
      </div>
    );
  }

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
        {sorted.map((page) => renderPage(page, false))}
      </div>
    </div>
  );
}
