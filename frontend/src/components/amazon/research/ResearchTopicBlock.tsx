import { useRef, useState } from 'react';
import { type ResearchTopic } from '../../../api/amazon.api';
import { useUpdateTopic, useDeleteTopic, useCreateCard, useReorderCards } from '../../../hooks/amazon/useResearch';
import { ResearchCard } from './ResearchCard';

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)',
};

export function ResearchTopicBlock({ productId, topic }: { productId: number; topic: ResearchTopic }) {
  const update = useUpdateTopic(productId);
  const del = useDeleteTopic(productId);
  const createCard = useCreateCard(productId);
  const reorder = useReorderCards(productId);
  const [title, setTitle] = useState(topic.title);
  const expanded = topic.is_expanded === 1;

  // Karten-Drag-and-drop (setPointerCapture-Muster wie UspPointList)
  const [order, setOrder] = useState<number[] | null>(null);
  const dragIndex = useRef<number | null>(null);
  const ids = order ?? topic.cards.map(c => c.id);
  const byId = new Map(topic.cards.map(c => [c.id, c]));
  const ordered = ids.map(id => byId.get(id)).filter(Boolean) as ResearchTopic['cards'];

  function down(idx: number, e: React.PointerEvent<HTMLDivElement>) {
    dragIndex.current = idx; (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (!order) setOrder(topic.cards.map(c => c.id));
  }
  function enter(idx: number) {
    if (dragIndex.current === null || dragIndex.current === idx) return;
    setOrder(prev => {
      const arr = [...(prev ?? topic.cards.map(c => c.id))];
      const [m] = arr.splice(dragIndex.current as number, 1); arr.splice(idx, 0, m);
      dragIndex.current = idx; return arr;
    });
  }
  function up() {
    if (dragIndex.current !== null && order) reorder.mutate({ topicId: topic.id, order }, { onSettled: () => setOrder(null) });
    dragIndex.current = null;
  }

  function saveTitle() {
    const t = title.trim();
    if (!t || t === topic.title) { setTitle(topic.title); return; }
    update.mutate({ topicId: topic.id, patch: { title: t } });
  }

  return (
    <div className="rounded-lg" style={{ background: 'var(--color-surface-container)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-2 p-3">
        <button type="button" onClick={() => update.mutate({ topicId: topic.id, patch: { is_expanded: expanded ? 0 : 1 } })}
          aria-label={expanded ? 'Zuklappen' : 'Aufklappen'} style={{ color: 'var(--color-on-surface-variant)' }}>
          <span className="material-symbols-outlined">{expanded ? 'expand_less' : 'expand_more'}</span>
        </button>
        <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle}
          placeholder="Thema benennen …" autoComplete="off"
          className="flex-1 px-2 py-1 rounded text-sm font-semibold" style={INPUT_STYLE} />
        <span className="text-xs tabular-nums px-2 py-0.5 rounded-full"
          style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface-variant)' }}>
          {topic.cards.length}
        </span>
        <button type="button" onClick={() => { if (confirm(`Thema „${topic.title || 'ohne Titel'}" mit ${topic.cards.length} Karten wirklich löschen?`)) del.mutate(topic.id); }}
          aria-label="Thema löschen" className="p-1 rounded hover:bg-white/5" style={{ color: '#fca5a5' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 flex flex-col gap-2">
          {ordered.map((c, idx) => (
            <ResearchCard key={c.id} productId={productId} card={c}
              dragHandleProps={{ onPointerDown: (e) => down(idx, e), onPointerEnter: () => enter(idx), onPointerUp: up }} />
          ))}
          <button type="button" onClick={() => createCard.mutate(topic.id)}
            className="self-start px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5"
            style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span> Karte
          </button>
        </div>
      )}
    </div>
  );
}
