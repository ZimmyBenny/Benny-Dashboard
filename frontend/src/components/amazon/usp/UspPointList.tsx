import { useRef, useState } from 'react';
import { type UspPoint } from '../../../api/amazon.api';
import { useReorderUspPoints } from '../../../hooks/amazon/useUsp';
import { UspPointRow } from './UspPointRow';

export function UspPointList({ productId, points, onRequestDelete }: { productId: number; points: UspPoint[]; onRequestDelete: (p: UspPoint) => void; }) {
  const reorder = useReorderUspPoints(productId);
  const [order, setOrder] = useState<number[] | null>(null);
  const dragIndex = useRef<number | null>(null);
  const ids = order ?? points.map(p => p.id);
  const byId = new Map(points.map(p => [p.id, p]));
  const ordered = ids.map(id => byId.get(id)).filter(Boolean) as UspPoint[];
  function down(idx: number, e: React.PointerEvent<HTMLDivElement>) {
    dragIndex.current = idx; (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (!order) setOrder(points.map(p => p.id));
  }
  function enter(idx: number) {
    if (dragIndex.current === null || dragIndex.current === idx) return;
    setOrder(prev => {
      const arr = [...(prev ?? points.map(p => p.id))];
      const [m] = arr.splice(dragIndex.current as number, 1); arr.splice(idx, 0, m);
      dragIndex.current = idx; return arr;
    });
  }
  function up() { if (dragIndex.current !== null && order) reorder.mutate(order); dragIndex.current = null; }
  return (
    <div className="flex flex-col gap-2">
      {ordered.map((p, idx) => (
        <UspPointRow key={p.id} productId={productId} index={idx} point={p} onRequestDelete={onRequestDelete}
          dragHandleProps={{ onPointerDown: (e) => down(idx, e), onPointerEnter: () => enter(idx), onPointerUp: up }} />
      ))}
    </div>
  );
}
