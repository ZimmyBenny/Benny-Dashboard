import { useRef, useState } from 'react';
import { type UspKaufgrund } from '../../../api/amazon.api';
import { useCreateUspKaufgrund, useReorderUspKaufgruende } from '../../../hooks/amazon/useUsp';
import { UspKaufgrundRow } from './UspKaufgrundRow';

export function UspKaufgruende({ productId, kaufgruende }: { productId: number; kaufgruende: UspKaufgrund[] }) {
  const create = useCreateUspKaufgrund(productId);
  const reorder = useReorderUspKaufgruende(productId);
  const [order, setOrder] = useState<number[] | null>(null);
  const dragIndex = useRef<number | null>(null);
  const ids = order ?? kaufgruende.map(k => k.id);
  const byId = new Map(kaufgruende.map(k => [k.id, k]));
  const ordered = ids.map(id => byId.get(id)).filter(Boolean) as UspKaufgrund[];
  function down(idx: number, e: React.PointerEvent<HTMLDivElement>) {
    dragIndex.current = idx; (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (!order) setOrder(kaufgruende.map(k => k.id));
  }
  function enter(idx: number) {
    if (dragIndex.current === null || dragIndex.current === idx) return;
    setOrder(prev => { const arr = [...(prev ?? kaufgruende.map(k => k.id))]; const [m] = arr.splice(dragIndex.current as number, 1); arr.splice(idx, 0, m); dragIndex.current = idx; return arr; });
  }
  function up() { if (dragIndex.current !== null && order) reorder.mutate(order); dragIndex.current = null; }
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-on-surface-variant)' }}>Finale Kaufgründe</span>
      <div className="flex flex-col gap-1.5">
        {ordered.map((k, idx) => (
          <UspKaufgrundRow key={k.id} productId={productId} index={idx} kaufgrund={k}
            dragHandleProps={{ onPointerDown: (e) => down(idx, e), onPointerEnter: () => enter(idx), onPointerUp: up }} />
        ))}
      </div>
      <button type="button" onClick={() => create.mutate(undefined)} className="self-start px-2.5 py-1 rounded-md text-xs flex items-center gap-1.5"
        style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>Kaufgrund
      </button>
    </div>
  );
}
