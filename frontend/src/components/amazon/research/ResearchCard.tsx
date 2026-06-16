import { useEffect, useState } from 'react';
import { type ResearchCard as Card } from '../../../api/amazon.api';
import { useUpdateCard, useDeleteCard } from '../../../hooks/amazon/useResearch';
import { ResearchCardLinks } from './ResearchCardLinks';
import { ResearchCardAttachments } from './ResearchCardAttachments';

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)',
};

export function ResearchCard({ productId, card, dragHandleProps }: {
  productId: number; card: Card; dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}) {
  const update = useUpdateCard(productId);
  const del = useDeleteCard(productId);
  const [title, setTitle] = useState(card.title ?? '');
  const [body, setBody] = useState(card.body);
  useEffect(() => { setTitle(card.title ?? ''); }, [card.title]);
  useEffect(() => { setBody(card.body); }, [card.body]);

  function saveTitle() {
    const t = title.trim();
    if (t === (card.title ?? '')) return;
    update.mutate({ cardId: card.id, patch: { title: t.length ? t : null } });
  }
  function saveBody() {
    if (body === card.body) return;
    update.mutate({ cardId: card.id, patch: { body } });
  }

  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-start gap-2">
        <div {...dragHandleProps} className="cursor-grab pt-1" title="Karte verschieben" style={{ color: 'var(--color-on-surface-variant)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>drag_indicator</span>
        </div>
        <div className="flex-1 min-w-0">
          <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle}
            placeholder="Titel (optional)" autoComplete="off"
            className="w-full px-2 py-1 rounded text-sm font-semibold mb-1.5" style={INPUT_STYLE} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} onBlur={saveBody}
            placeholder={'Notiz, Bulletpoints, Keywords …\n• …'} rows={3}
            className="w-full px-2 py-1 rounded text-sm resize-y" style={INPUT_STYLE} />
          <ResearchCardLinks productId={productId} cardId={card.id} links={card.links} />
          <ResearchCardAttachments productId={productId} cardId={card.id} attachments={card.images} />
        </div>
        <button type="button" onClick={() => { if (confirm('Diese Karte wirklich löschen?')) del.mutate(card.id); }}
          aria-label="Karte löschen" className="p-1 rounded hover:bg-white/5" style={{ color: '#fca5a5' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
        </button>
      </div>
    </div>
  );
}
