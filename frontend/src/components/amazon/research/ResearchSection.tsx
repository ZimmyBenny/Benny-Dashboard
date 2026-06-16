import { useState } from 'react';
import { useResearchTopics, useCreateTopic } from '../../../hooks/amazon/useResearch';
import { ResearchTopicBlock } from './ResearchTopicBlock';
import { SectionHeader } from '../SectionHeader';

const ACCENT = '#38bdf8'; // sky — eigene Akzentfarbe für Recherche

export function ResearchSection({ productId }: { productId: number }) {
  const { data: topics, isLoading, isError, refetch } = useResearchTopics(productId);
  const createTopic = useCreateTopic(productId);
  const [expanded, setExpanded] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  function addTopic() {
    const t = newTitle.trim();
    if (!t) return;
    createTopic.mutate(t, { onSuccess: () => setNewTitle('') });
  }

  return (
    <section className="rounded-xl" style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <SectionHeader
        icon="lightbulb"
        title="Recherche & Wissen"
        accent={ACCENT}
        expanded={expanded}
        onToggleExpand={() => setExpanded(v => !v)}
        rightSlot={
          <span className="text-xs tabular-nums px-2 py-0.5 rounded-full"
            style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface-variant)' }}>
            {topics?.length ?? 0}
          </span>
        }
      />
      {expanded && (
        <div className="p-4 pt-0 flex flex-col gap-3">
          {isLoading && <p style={{ color: 'var(--color-on-surface-variant)' }}>Lade …</p>}
          {isError && (
            <button type="button" onClick={() => refetch()} className="self-start px-3 py-1.5 rounded-md text-sm"
              style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}>Erneut laden</button>
          )}
          {topics?.map(t => <ResearchTopicBlock key={t.id} productId={productId} topic={t} />)}
          <div className="flex items-center gap-2">
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Neues Thema (z.B. Patente, Zertifikate, Keywords) …"
              onKeyDown={(e) => { if (e.key === 'Enter') addTopic(); }} autoComplete="off"
              className="flex-1 px-3 py-2 rounded-md text-sm"
              style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }} />
            <button type="button" onClick={addTopic} className="px-3 py-2 rounded-md text-sm flex items-center gap-1.5"
              style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span> Thema
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
