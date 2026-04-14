import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { deleteSection, updateSection, reorderSections, type Section } from '../../api/workbook.api';

interface SectionListProps {
  sections: Section[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onReload: () => void;
}

export function SectionList({ sections, activeId, onSelect, onNew, onReload }: SectionListProps) {
  const [items, setItems] = useState<Section[]>(sections);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
  const [ghostLabel, setGhostLabel] = useState('');

  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const sectionsRef = useRef<Section[]>(sections);
  const itemsRef = useRef<Section[]>(items);

  useEffect(() => { setItems(sections); sectionsRef.current = sections; }, [sections]);
  useEffect(() => { itemsRef.current = items; }, [items]);

  async function handleDelete(e: React.MouseEvent, id: number, name: string) {
    e.stopPropagation();
    if (!window.confirm(`Bereich "${name}" und alle Seiten darin wirklich löschen?`)) return;
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

  function startDrag(nativeEvent: PointerEvent, el: HTMLDivElement, section: Section) {
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
        setDragId(section.id);
        setGhostLabel(section.name);
      }

      setGhostPos({ x: ev.clientX + 14, y: ev.clientY - 10 });

      let found: number | null = null;
      for (const [itemId, rowEl] of itemRefs.current) {
        if (itemId === section.id) continue;
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

      if (!started || currentDragOver === null || currentDragOver === section.id) return;

      const cur = itemsRef.current;
      const fromIdx = cur.findIndex((s) => s.id === section.id);
      const toIdx = cur.findIndex((s) => s.id === currentDragOver);
      if (fromIdx === -1 || toIdx === -1) return;

      const next = [...cur];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      setItems(next);
      reorderSections(next.map((s) => s.id)).catch(() => setItems(sectionsRef.current));
    }

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
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
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          whiteSpace: 'nowrap',
        }}>
          {ghostLabel}
        </div>,
        document.body
      )}

      <div style={{
        width: '240px',
        background: 'var(--color-surface-container)',
        borderRight: '1px solid var(--color-outline-variant)',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{
          padding: '0.75rem 1rem',
          borderBottom: '1px solid var(--color-outline-variant)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <button
            onClick={onNew}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.25rem',
              padding: '0.3rem 0.6rem',
              background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dim) 100%)', color: 'var(--color-on-primary)',
              border: 'none', borderRadius: '0.35rem', cursor: 'pointer',
              fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: 600,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>add</span>
            Neuer Bereich
          </button>
        </div>

        <div style={{ flex: 1, paddingTop: '0.5rem' }}>
          {items.map((section) => (
            <div
              key={section.id}
              ref={(el) => {
                if (el) itemRefs.current.set(section.id, el);
                else itemRefs.current.delete(section.id);
              }}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                if ((e.target as HTMLElement).closest('button')) return;
                startDrag(e.nativeEvent, e.currentTarget, section);
              }}
              onClick={() => {
                if (dragId === null) onSelect(section.id);
              }}
              style={{
                width: '100%',
                display: 'flex', alignItems: 'center', gap: '0.6rem',
                padding: '0.55rem 1rem',
                background: activeId === section.id
                  ? 'rgba(204,151,255,0.08)'
                  : dragOverId === section.id
                  ? 'rgba(204,151,255,0.18)'
                  : 'transparent',
                borderLeft: activeId === section.id
                  ? '3px solid var(--color-primary)'
                  : dragOverId === section.id
                  ? '3px solid var(--color-primary)'
                  : '3px solid transparent',
                cursor: dragId !== null ? 'grabbing' : 'grab',
                color: 'var(--color-on-surface)',
                fontFamily: 'var(--font-body)', fontSize: '0.9rem',
                transition: 'background 0.1s',
                position: 'relative',
                opacity: dragId === section.id ? 0.35 : 1,
                userSelect: 'none',
                touchAction: 'none',
              }}
              onMouseEnter={(e) => {
                if (activeId !== section.id) {
                  (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)';
                }
                e.currentTarget.querySelectorAll<HTMLElement>('.section-action-btn').forEach((b) => (b.style.opacity = '1'));
              }}
              onMouseLeave={(e) => {
                if (activeId !== section.id && dragOverId !== section.id) {
                  (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                }
                e.currentTarget.querySelectorAll<HTMLElement>('.section-action-btn').forEach((b) => (b.style.opacity = '0'));
              }}
            >
              <span
                className="section-action-btn material-symbols-outlined"
                style={{
                  fontSize: '0.9rem', color: 'var(--color-outline)',
                  opacity: 0, cursor: 'grab', transition: 'opacity 0.15s',
                  flexShrink: 0, pointerEvents: 'none',
                }}
              >
                drag_indicator
              </span>
              <span className="material-symbols-outlined" style={{
                fontSize: '1.1rem', color: 'var(--color-on-surface-variant)',
                lineHeight: 1, marginTop: '2px', pointerEvents: 'none',
              }}>
                {section.icon || 'folder'}
              </span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
                {section.name}
              </span>
              <button
                className="section-action-btn"
                onClick={(e) => handleRename(e, section)}
                style={{
                  opacity: 0, background: 'transparent', border: 'none',
                  cursor: 'pointer', padding: '0.1rem', display: 'flex',
                  alignItems: 'center', color: 'var(--color-on-surface-variant)',
                  transition: 'opacity 0.15s', flexShrink: 0,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>edit</span>
              </button>
              <button
                className="section-action-btn"
                onClick={(e) => handleDelete(e, section.id, section.name)}
                style={{
                  opacity: 0, background: 'transparent', border: 'none',
                  cursor: 'pointer', padding: '0.1rem', display: 'flex',
                  alignItems: 'center', color: 'var(--color-error)',
                  transition: 'opacity 0.15s', flexShrink: 0,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>delete</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
