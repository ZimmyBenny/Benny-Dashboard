import { useEffect, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { getAttachmentObjectUrl } from '../../api/workbook.api';

// Rendert ein Inline-Bild: lädt den Anhang mit Auth als Object-URL (ein reines
// <img src="/api/…"> würde am JWT-Header scheitern). Content speichert nur die attachmentId.
export function ImageNodeView({ node, selected }: NodeViewProps) {
  const attachmentId = node.attrs.attachmentId as number | null;
  const alt = (node.attrs.alt as string) || '';
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    let objUrl: string | null = null;
    setError(false);
    setUrl(null);
    if (attachmentId == null) { setError(true); return; }
    getAttachmentObjectUrl(attachmentId)
      .then((u) => { if (active) { objUrl = u; setUrl(u); } else URL.revokeObjectURL(u); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [attachmentId]);

  return (
    <NodeViewWrapper as="div" style={{ margin: '0.5rem 0' }}>
      {url ? (
        <img
          src={url}
          alt={alt}
          draggable={false}
          style={{
            maxWidth: '100%',
            borderRadius: '0.5rem',
            display: 'block',
            outline: selected ? '2px solid var(--color-primary)' : 'none',
            outlineOffset: '2px',
          }}
        />
      ) : error ? (
        <div style={{ padding: '0.5rem 0.75rem', border: '1px dashed var(--color-outline-variant)', borderRadius: '0.5rem', color: 'var(--color-on-surface-variant)', fontSize: '0.85rem' }}>
          Bild konnte nicht geladen werden
        </div>
      ) : (
        <div style={{ padding: '0.5rem 0.75rem', color: 'var(--color-on-surface-variant)', fontSize: '0.85rem' }}>
          Bild wird geladen…
        </div>
      )}
    </NodeViewWrapper>
  );
}
