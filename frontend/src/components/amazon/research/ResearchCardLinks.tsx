import { useState } from 'react';
import { type ResearchLink } from '../../../api/amazon.api';
import { useCreateLink, useDeleteLink } from '../../../hooks/amazon/useResearch';

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)',
};

export function ResearchCardLinks({ productId, cardId, links }: { productId: number; cardId: number; links: ResearchLink[] }) {
  const create = useCreateLink(productId);
  const del = useDeleteLink(productId);
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');

  function add() {
    const u = url.trim();
    if (!u) return;
    create.mutate({ cardId, url: u, label: label.trim() || null }, { onSuccess: () => { setUrl(''); setLabel(''); } });
  }

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {links.map(l => (
        <div key={l.id} className="flex items-center gap-2 text-sm group">
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--color-on-surface-variant)' }}>link</span>
          <a href={l.url} target="_blank" rel="noopener noreferrer" className="truncate"
            style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>
            {l.label || l.url}
          </a>
          <button type="button" onClick={() => del.mutate(l.id)} aria-label="Link entfernen"
            className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#fca5a5' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…"
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          className="flex-1 px-2 py-1 rounded text-sm" style={INPUT_STYLE} autoComplete="off" />
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Beschriftung (optional)"
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          className="px-2 py-1 rounded text-sm" style={{ ...INPUT_STYLE, width: 180 }} autoComplete="off" />
        <button type="button" onClick={add} className="px-2 py-1 rounded text-sm"
          style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}>
          + Link
        </button>
      </div>
    </div>
  );
}
