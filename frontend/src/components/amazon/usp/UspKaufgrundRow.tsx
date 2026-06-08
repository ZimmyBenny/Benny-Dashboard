import { useEffect, useState } from 'react';
import { type UspKaufgrund } from '../../../api/amazon.api';
import { useUpdateUspKaufgrund, useDeleteUspKaufgrund } from '../../../hooks/amazon/useUsp';

interface Props {
  productId: number; index: number; kaufgrund: UspKaufgrund;
  dragHandleProps: React.HTMLAttributes<HTMLDivElement>;
}
export function UspKaufgrundRow({ productId, index, kaufgrund, dragHandleProps }: Props) {
  const update = useUpdateUspKaufgrund(productId);
  const del = useDeleteUspKaufgrund(productId);
  const [text, setText] = useState(kaufgrund.text);
  useEffect(() => { setText(kaufgrund.text); }, [kaufgrund.text]);
  return (
    <div className="flex items-center gap-2">
      <div {...dragHandleProps} className="flex items-center justify-center rounded-md cursor-grab select-none flex-shrink-0"
        style={{ width: 24, height: 24, background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface-variant)' }} title="Zum Sortieren ziehen">
        <span style={{ fontSize: 11, fontWeight: 700 }}>{index + 1}</span>
      </div>
      <input value={text} onChange={(e) => setText(e.target.value)}
        onBlur={() => { if (text !== kaufgrund.text) update.mutate({ kId: kaufgrund.id, text }); }}
        placeholder="Kaufgrund …" className="flex-1 px-2 py-1 rounded-md text-sm"
        style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }} />
      <button type="button" onClick={() => del.mutate(kaufgrund.id)} className="p-1 rounded-md" style={{ color: '#fca5a5' }} aria-label="Kaufgrund löschen">
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
      </button>
    </div>
  );
}
