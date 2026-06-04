import { useEffect, useRef, useState, type ReactNode } from 'react';

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
//
// Wichtig: setPointerCapture wird NICHT verwendet. Capture wuerde den Click
// auf den Wrapper umlenken und damit den Toggle-Click des SectionHeaders
// blockieren. Stattdessen wird auf pointerdown ein Window-Listener fuer
// pointermove/up registriert. Sobald die Bewegung > THRESHOLD ist, geht das
// Element in den Drag-Modus; ein anschliessender Click wird einmalig
// unterdrueckt.
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

  function findHitId(clientY: number): Id | null {
    for (const [id, el] of itemRefs.current.entries()) {
      const rect = el.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) return id;
    }
    return null;
  }

  // Globale Listener nur waehrend einer aktiven pointerdown-Sequenz.
  useEffect(() => {
    function onMove(ev: PointerEvent) {
      if (!startRef.current) return;
      const dx = ev.clientX - startRef.current.x;
      const dy = ev.clientY - startRef.current.y;
      if (!movedRef.current) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        movedRef.current = true;
        setDraggingId(startRef.current.id);
      }
      setDropTargetId(findHitId(ev.clientY));
    }
    function onUp(_ev: PointerEvent) {
      const wasDragging = movedRef.current;
      const from = startRef.current?.id ?? null;
      const to = dropTargetId;

      if (wasDragging && from && to && from !== to) {
        onReorder(from, to);
        const suppress = (clickEv: Event) => { clickEv.stopPropagation(); clickEv.preventDefault(); };
        window.addEventListener('click', suppress, { capture: true, once: true });
      }

      startRef.current = null;
      movedRef.current = false;
      setDraggingId(null);
      setDropTargetId(null);

      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    }
    function onDownCapture(ev: PointerEvent) {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      if (!startsOnHeader(ev.target)) return;
      // Welche Section war der Ursprung?
      let foundId: Id | null = null;
      for (const [id, el] of itemRefs.current.entries()) {
        if (el.contains(ev.target as Node)) { foundId = id; break; }
      }
      if (!foundId) return;
      startRef.current = { x: ev.clientX, y: ev.clientY, id: foundId };
      movedRef.current = false;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    }
    // capture: false, damit React-Handler vor uns laufen koennen (z.B. button clicks)
    window.addEventListener('pointerdown', onDownCapture);
    return () => {
      window.removeEventListener('pointerdown', onDownCapture);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dropTargetId, onReorder]);

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
            style={{
              opacity: isDragging ? 0.45 : 1,
              outline: isDropTarget ? '2px solid var(--color-primary)' : 'none',
              outlineOffset: '2px',
              borderRadius: '12px',
              transition: 'opacity 0.12s, outline-color 0.12s',
            }}
          >
            {item.render()}
          </div>
        );
      })}
    </div>
  );
}
