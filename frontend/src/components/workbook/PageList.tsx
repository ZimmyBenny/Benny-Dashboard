import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { deletePage, fetchPages, updatePage, reorderPages, type Page } from '../../api/workbook.api';

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
  const [localPages, setLocalPages] = useState<Page[]>(pages);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
  const [ghostLabel, setGhostLabel] = useState('');

  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const pagesRef = useRef<Page[]>(pages);
  const localPagesRef = useRef<Page[]>(localPages);

  useEffect(() => { setLocalPages(pages); pagesRef.current = pages; }, [pages]);
  useEffect(() => { localPagesRef.current = localPages; }, [localPages]);

  async function handleToggleExpand(e: React.MouseEvent, pageId: number) {
    e.stopPropagation();
    if (expandedIds.has(pageId)) {
      setExpandedIds((prev) => { const s = new Set(prev); s.delete(pageId); return s; });
      return;
    }
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

  function startDrag(nativeEvent: PointerEvent, el: HTMLDivElement, page: Page) {
    const startX = nativeEvent.clientX;
    const startY = nativeEvent.clientY;
    let started = false;
    let currentDragOver: number | null = null;

    el.setPointerCapture(nativeEvent.pointerId);

    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;

      if (!started) {
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
        started = true;
        setDragId(page.id);
        setGhostLabel(page.title || 'Unbenannte Seite');
      }

      setGhostPos({ x: ev.clientX + 14, y: ev.clientY - 10 });

      let found: number | null = null;
      for (const [itemId, rowEl] of itemRefs.current) {
        if (itemId === page.id) continue;
        const rect = rowEl.getBoundingClientRect();
        if (ev.clientY >= rect.top && ev.clientY <= rect.bottom) {
          found = itemId;
          break;
        }
      }
      currentDragOver = found;
      setDragOverId(found);
    }

    function onUp() {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);

      setDragId(null);
      setDragOverId(null);
      setGhostPos(null);

      if (!started || currentDragOver === null || currentDragOver === page.id) return;

      const topLevel = localPagesRef.current.filter((p) => !p.parent_id);
      const fromIdx = topLevel.findIndex((p) => p.id === page.id);
      const toIdx = topLevel.findIndex((p) => p.id === currentDragOver);
      if (fromIdx === -1 || toIdx === -1) return;

      const next = [...topLevel];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      // sort_order aktualisieren damit die visuelle Reihenfolge stimmt
      const withOrder = next.map((p, i) => ({ ...p, sort_order: i + 1 }));
      setLocalPages(withOrder);
      reorderPages(next.map((p) => p.id)).catch(() => setLocalPages(pagesRef.current));
    }

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  }

  const filtered = showPinned ? localPages.filter((p) => p.is_pinned === 1) : localPages;
  const sorted = [...filtered].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    if (b.is_pinned !== a.is_pinned) return b.is_pinned - a.is_pinned;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  function renderPage(page: Page, isChild = false) {
    const isActive = activeId === page.id;
    const isDragging = dragId === page.id;
    const isDropTarget = dragOverId === page.id;

    return (
      <div key={page.id}>
        <div
          ref={!isChild ? (el) => {
            if (el) itemRefs.current.set(page.id, el);
            else itemRefs.current.delete(page.id);
          } : undefined}
          onPointerDown={!isChild ? (e) => {
            if (e.button !== 0) return;
            if ((e.target as HTMLElement).closest('button')) return;
            startDrag(e.nativeEvent, e.currentTarget, page);
          } : undefined}
          onClick={() => {
            if (dragId === null) onSelect(page.id);
          }}
          style={{
            width: '100%',
            padding: isChild ? '0.55rem 0.75rem' : '0.75rem 1rem',
            background: isActive
              ? 'rgba(204,151,255,0.08)'
              : isDropTarget
              ? 'rgba(204,151,255,0.18)'
              : 'transparent',
            borderLeft: isActive
              ? '3px solid var(--color-primary)'
              : isDropTarget
              ? '3px solid var(--color-primary)'
              : '3px solid transparent',
            opacity: isDragging ? 0.35 : 1,
            cursor: isChild ? 'pointer' : dragId !== null ? 'grabbing' : 'grab',
            textAlign: 'left',
            transition: 'background 0.1s',
            boxSizing: 'border-box',
            position: 'relative',
            userSelect: 'none',
            touchAction: !isChild ? 'none' : undefined,
          }}
          onMouseEnter={(e) => {
            if (!isActive && !isDragging) {
              (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)';
            }
            e.currentTarget.querySelectorAll<HTMLButtonElement>('.page-action-btn').forEach((b) => (b.style.opacity = '1'));
            if (!isChild) e.currentTarget.querySelectorAll<HTMLElement>('.page-drag-handle').forEach((b) => (b.style.opacity = '1'));
          }}
          onMouseLeave={(e) => {
            if (!isActive && !isDropTarget) {
              (e.currentTarget as HTMLDivElement).style.background = 'transparent';
            }
            e.currentTarget.querySelectorAll<HTMLButtonElement>('.page-action-btn').forEach((b) => (b.style.opacity = '0'));
            if (!isChild) e.currentTarget.querySelectorAll<HTMLElement>('.page-drag-handle').forEach((b) => (b.style.opacity = '0'));
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {!isChild && (
              <span
                className="page-drag-handle material-symbols-outlined"
                style={{
                  fontSize: '0.85rem', cursor: 'grab', color: 'var(--color-outline)',
                  opacity: 0, transition: 'opacity 0.15s', flexShrink: 0,
                  marginRight: '0.1rem', pointerEvents: 'none',
                }}
              >
                drag_indicator
              </span>
            )}

            {!isChild && (
              <button
                onClick={(e) => handleToggleExpand(e, page.id)}
                title={expandedIds.has(page.id) ? 'Einklappen' : 'Unterseiten anzeigen'}
                style={{
                  opacity: 0.4, background: 'transparent', border: 'none',
                  cursor: 'pointer', padding: '0.1rem', display: 'flex',
                  alignItems: 'center', color: 'var(--color-on-surface-variant)',
                  transition: 'opacity 0.15s, transform 0.15s',
                  transform: expandedIds.has(page.id) ? 'rotate(90deg)' : 'rotate(0deg)',
                  flexShrink: 0, marginRight: '0.25rem',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '0.85rem' }}>chevron_right</span>
              </button>
            )}

            <span style={{
              fontFamily: 'var(--font-body)',
              fontSize: isChild ? '0.82rem' : '0.88rem',
              fontWeight: isChild ? 400 : 600,
              color: isChild ? 'var(--color-on-surface-variant)' : 'var(--color-on-surface)',
              overflow: 'hidden', display: '-webkit-box',
              WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
              flex: 1, pointerEvents: 'none',
            }}>
              {page.title || 'Unbenannte Seite'}
            </span>

            {page.is_pinned === 1 && (
              <span className="material-symbols-outlined" style={{
                fontSize: '0.85rem', color: 'var(--color-primary)',
                marginLeft: '0.35rem', flexShrink: 0, pointerEvents: 'none',
              }}>
                push_pin
              </span>
            )}

            <button
              className="page-action-btn"
              onClick={(e) => handleRename(e, page)}
              style={{
                opacity: 0, background: 'transparent', border: 'none',
                cursor: 'pointer', padding: '0.1rem', display: 'flex',
                alignItems: 'center', color: 'var(--color-on-surface-variant)',
                transition: 'opacity 0.15s', flexShrink: 0, marginLeft: '0.25rem',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>edit</span>
            </button>

            {!isChild && (
              <button
                className="page-action-btn"
                onClick={(e) => handleAddChild(e, page.id)}
                title="Unterseite erstellen"
                style={{
                  opacity: 0, background: 'transparent', border: 'none',
                  cursor: 'pointer', padding: '0.1rem', display: 'flex',
                  alignItems: 'center', color: 'var(--color-primary)',
                  transition: 'opacity 0.15s', flexShrink: 0, marginLeft: '0.25rem',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>add</span>
              </button>
            )}

            <button
              className="page-action-btn"
              onClick={(e) => handleDelete(e, page.id, page.title)}
              style={{
                opacity: 0, background: 'transparent', border: 'none',
                cursor: 'pointer', padding: '0.1rem', display: 'flex',
                alignItems: 'center', color: 'var(--color-error)',
                transition: 'opacity 0.15s', flexShrink: 0, marginLeft: '0.25rem',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>delete</span>
            </button>
          </div>

        </div>

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
    <>
      {ghostPos && createPortal(
        <div style={{
          position: 'fixed',
          left: ghostPos.x,
          top: ghostPos.y,
          pointerEvents: 'none',
          zIndex: 9999,
          padding: '0.3rem 0.75rem',
          background: 'var(--color-surface-container)',
          border: '1px solid var(--color-primary)',
          borderRadius: '0.35rem',
          color: 'var(--color-on-surface)',
          fontFamily: 'var(--font-body)',
          fontSize: '0.85rem',
          fontWeight: 600,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          whiteSpace: 'nowrap',
        }}>
          {ghostLabel}
        </div>,
        document.body
      )}

      <div style={{
        width: '280px',
        background: 'var(--color-surface-container)',
        borderRight: '1px solid var(--color-outline-variant)',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{
          padding: '0.75rem 1rem',
          borderBottom: '1px solid var(--color-outline-variant)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem',
        }}>
          <button
            onClick={onNew}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.35rem',
              padding: '0.35rem 0.75rem',
              background: 'var(--color-primary)', color: 'var(--color-on-primary)',
              border: 'none', borderRadius: '0.35rem', cursor: 'pointer',
              fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: 600,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>add</span>
            Neue Seite
          </button>
          <button
            onClick={() => setShowPinned((v) => !v)}
            title={showPinned ? 'Alle anzeigen' : 'Nur Gepinnte'}
            style={{
              display: 'flex', alignItems: 'center', padding: '0.35rem',
              background: showPinned ? 'rgba(204,151,255,0.15)' : 'transparent',
              border: '1px solid var(--color-outline-variant)', borderRadius: '0.35rem',
              cursor: 'pointer',
              color: showPinned ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>push_pin</span>
          </button>
        </div>

        <div style={{ flex: 1 }}>
          {sorted.length === 0 && (
            <div style={{
              padding: '2rem 1rem', textAlign: 'center',
              color: 'var(--color-on-surface-variant)',
              fontFamily: 'var(--font-body)', fontSize: '0.85rem',
            }}>
              Noch keine Seiten.
            </div>
          )}
          {sorted.map((page) => renderPage(page, false))}
        </div>
      </div>
    </>
  );
}
