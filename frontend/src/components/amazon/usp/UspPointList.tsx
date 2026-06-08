import { useRef, useState } from 'react';
import { type UspPoint, type UspFeasibility } from '../../../api/amazon.api';
import { useReorderUspPoints, useSetUspFeasibility } from '../../../hooks/amazon/useUsp';
import { UspPointRow } from './UspPointRow';

export function UspPointList({ productId, points, manufacturerId, feasibility, onRequestDelete }: {
  productId: number; points: UspPoint[]; manufacturerId: number | null; feasibility: UspFeasibility[]; onRequestDelete: (p: UspPoint) => void;
}) {
  const reorder = useReorderUspPoints(productId);
  const setFeas = useSetUspFeasibility(productId);
  // include_in_pdf je Punkt fuer den aktuell gewaehlten Hersteller (fehlend = 1 = im PDF)
  const includeMap = new Map<number, number>();
  if (manufacturerId != null) for (const f of feasibility) if (f.manufacturer_id === manufacturerId) includeMap.set(f.point_id, f.include_in_pdf);
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
  function up() { if (dragIndex.current !== null && order) reorder.mutate(order, { onSettled: () => setOrder(null) }); dragIndex.current = null; }
  return (
    <div className="flex flex-col gap-4">
      {ordered.map((p, idx) => {
        const included = manufacturerId == null ? true : (includeMap.get(p.id) ?? 1) !== 0;
        return (
          <UspPointRow key={p.id} productId={productId} index={idx} point={p} onRequestDelete={onRequestDelete}
            hasManufacturer={manufacturerId != null}
            includeInPdf={included}
            onToggleInclude={() => { if (manufacturerId != null) setFeas.mutate({ point_id: p.id, manufacturer_id: manufacturerId, include_in_pdf: included ? 0 : 1 }); }}
            dragHandleProps={{ onPointerDown: (e) => down(idx, e), onPointerEnter: () => enter(idx), onPointerUp: up }} />
        );
      })}
    </div>
  );
}
