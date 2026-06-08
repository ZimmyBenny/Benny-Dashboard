import { useEffect, useRef, useState } from 'react';
import { type SteuerCategory } from '../../api/steuer.api';
import {
  useUpdateSteuerCategory,
  useCreateSteuerItem,
  useReorderSteuerItems,
} from '../../hooks/finanzen/useSteuer';
import { SteuerItemRow } from './SteuerItemRow';

interface Props {
  jahr: number;
  category: SteuerCategory;
  index: number;
  dragHandleProps: React.HTMLAttributes<HTMLDivElement>;
  onRequestDelete: (c: SteuerCategory) => void;
}

export function SteuerCategoryBlock({ jahr, category, index, dragHandleProps, onRequestDelete }: Props) {
  const updateCat = useUpdateSteuerCategory(jahr);
  const createItem = useCreateSteuerItem(jahr);
  const reorderItems = useReorderSteuerItems(jahr);

  const [name, setName] = useState(category.name);
  const [itemOrder, setItemOrder] = useState<number[] | null>(null);
  const dragItemIndex = useRef<number | null>(null);

  useEffect(() => { setName(category.name); }, [category.name]);

  const itemIds = itemOrder ?? category.items.map(i => i.id);
  const byId = new Map(category.items.map(i => [i.id, i]));
  const orderedItems = itemIds.map(id => byId.get(id)).filter(Boolean) as SteuerCategory['items'];

  function itemDown(idx: number, e: React.PointerEvent<HTMLDivElement>) {
    dragItemIndex.current = idx;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (!itemOrder) setItemOrder(category.items.map(i => i.id));
  }
  function itemEnter(idx: number) {
    if (dragItemIndex.current === null || dragItemIndex.current === idx) return;
    setItemOrder(prev => {
      const arr = [...(prev ?? category.items.map(i => i.id))];
      const [moved] = arr.splice(dragItemIndex.current as number, 1);
      arr.splice(idx, 0, moved);
      dragItemIndex.current = idx;
      return arr;
    });
  }
  function itemUp() {
    if (dragItemIndex.current !== null && itemOrder) {
      reorderItems.mutate({ categoryId: category.id, order: itemOrder }, { onSettled: () => setItemOrder(null) });
    }
    dragItemIndex.current = null;
  }

  const inputStyle = {
    background: 'var(--color-surface-container-low)',
    color: 'var(--color-on-surface)',
    border: '1px solid rgba(255,255,255,0.08)',
  };

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.08)', borderLeft: '3px solid #60a5fa' }}
    >
      {/* Kategorie-Header */}
      <div className="flex items-center gap-2">
        <div
          {...dragHandleProps}
          className="flex items-center justify-center rounded-md cursor-grab select-none flex-shrink-0"
          style={{ width: 26, height: 26, background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface-variant)' }}
          title="Zum Sortieren ziehen"
        >
          <span style={{ fontSize: 12, fontWeight: 700 }}>{index + 1}</span>
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { if (name !== category.name) updateCat.mutate({ id: category.id, name }); }}
          placeholder="Überbegriff …"
          className="flex-1 px-2 py-1.5 rounded-md text-sm font-semibold"
          style={inputStyle}
        />
        <button
          type="button"
          onClick={() => onRequestDelete(category)}
          className="p-1.5 rounded-md flex-shrink-0"
          style={{ color: '#fca5a5' }}
          aria-label="Überbegriff löschen"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
        </button>
      </div>

      {/* Punkte */}
      <div className="flex flex-col gap-2">
        {orderedItems.map((item, idx) => (
          <div key={item.id} className="flex items-start gap-2">
            {/* Item drag handle */}
            <div
              onPointerDown={(e) => itemDown(idx, e)}
              onPointerEnter={() => itemEnter(idx)}
              onPointerUp={itemUp}
              className="flex items-center justify-center rounded-md cursor-grab select-none flex-shrink-0 mt-2"
              style={{ width: 22, height: 22, background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface-variant)' }}
              title="Zum Sortieren ziehen"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>drag_indicator</span>
            </div>
            <div className="flex-1 min-w-0">
              <SteuerItemRow jahr={jahr} item={item} />
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => createItem.mutate(category.id)}
        className="self-start px-2.5 py-1 rounded-md text-xs flex items-center gap-1.5"
        style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>Punkt hinzufügen
      </button>
    </div>
  );
}
