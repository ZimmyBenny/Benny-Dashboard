import { useRef, useState, type ReactNode } from 'react';

interface DraggableItem<Id extends string> {
  id: Id;
  render: () => ReactNode;
}

interface Props<Id extends string> {
  items: DraggableItem<Id>[];
  onReorder: (fromId: Id, toId: Id) => void;
}

const DRAG_THRESHOLD_PX = 6;

// Wrapper-Liste mit Drag-and-Drop am Section-Header.
// - pointerdown auf einer Header-Region (role="button" + nicht innerhalb interaktiver Kinder)
//   startet die Drag-Detection.
// - Sobald Bewegung > THRESHOLD: Drag-Modus aktiv, Click wird nach pointerup unterdrueckt,
//   damit der Toggle-Click des SectionHeaders nicht ausgeloest wird.
// - Drop bei pointerup: schiebt die Quell-Section vor die Section unter dem Cursor.
export function DraggableSectionList<Id extends string>({ items, onReorder }: Props<Id>) {
  const [draggingId, setDraggingId] = useState<Id | null>(null);
  const [dropTargetId, setDropTargetId] = useState<Id | null>(null);
  const startRef = useRef<{ x: number; y: number; id: Id } | null>(null);
  const movedRef = useRef(false);
  const itemRefs = useRef<Map<Id, HTMLDivElement>>(new Map());

  function startsOnHeader(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    if (el.closest('button, input, textarea, select, a')) return false;
    return el.closest('header[role="button"]') !== null;
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>, id: Id) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!startsOnHeader(e.target)) return;

    startRef.current = { x: e.clientX, y: e.clientY, id };
    movedRef.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!startRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (!movedRef.current) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      movedRef.current = true;
      setDraggingId(startRef.current.id);
    }
    let hit: Id | null = null;
    for (const [id, el] of itemRefs.current.entries()) {
      const rect = el.getBoundingClientRect();
      if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
        hit = id;
        break;
      }
    }
    setDropTargetId(hit);
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const wasDragging = movedRef.current;
    const from = draggingId ?? startRef.current?.id ?? null;
    const to = dropTargetId;

    if (wasDragging && from && to && from !== to) {
      onReorder(from, to);
      // verhindert dass der pending click den Section-Header-Toggle ausloest
      const suppress = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener('click', suppress, { capture: true, once: true });
    }

    startRef.current = null;
    movedRef.current = false;
    setDraggingId(null);
    setDropTargetId(null);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  }

  return (
    <div className="flex flex-col gap-4">
      {items.map(item => {
        const isDragging = draggingId === item.id;
        const isDropTarget = dropTargetId === item.id && draggingId !== null && draggingId !== item.id;
        return (
          <div
            key={item.id}
            ref={(el) => {
              if (el) itemRefs.current.set(item.id, el);
              else itemRefs.current.delete(item.id);
            }}
            onPointerDown={(e) => onPointerDown(e, item.id)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{
              opacity: isDragging ? 0.45 : 1,
              outline: isDropTarget ? '2px solid var(--color-primary)' : 'none',
              outlineOffset: '2px',
              borderRadius: '12px',
              transition: 'opacity 0.12s, outline-color 0.12s',
              touchAction: 'pan-y',
            }}
          >
            {item.render()}
          </div>
        );
      })}
    </div>
  );
}
