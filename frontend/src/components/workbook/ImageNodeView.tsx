import { useEffect, useRef, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { getAttachmentObjectUrl } from '../../api/workbook.api';

// Rendert ein Inline-Bild: lädt den Anhang mit Auth als Object-URL (ein reines
// <img src="/api/…"> würde am JWT-Header scheitern). Content speichert nur attachmentId + width.
export function ImageNodeView({ node, selected, deleteNode, updateAttributes }: NodeViewProps) {
  const attachmentId = node.attrs.attachmentId as number | null;
  const alt = (node.attrs.alt as string) || '';
  const attrWidth = node.attrs.width as number | null;
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [w, setW] = useState<number | null>(attrWidth);
  const imgRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => { if (!drag.current) setW(attrWidth); }, [attrWidth]);

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

  function onResizeDown(e: React.PointerEvent) {
    e.preventDefault(); e.stopPropagation();
    const img = imgRef.current; if (!img) return;
    drag.current = { startX: e.clientX, startW: attrWidth ?? img.offsetWidth };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onResizeMove(e: React.PointerEvent) {
    const d = drag.current, img = imgRef.current; if (!d || !img) return;
    const rect = img.getBoundingClientRect();
    const zoom = img.offsetWidth > 0 ? rect.width / img.offsetWidth : 1; // CSS-Zoom herausrechnen
    const nw = Math.max(60, Math.round(d.startW + (e.clientX - d.startX) / (zoom || 1)));
    setW(nw);
  }
  function onResizeUp(e: React.PointerEvent) {
    if (!drag.current) return;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    drag.current = null;
    if (w != null) updateAttributes({ width: w });
  }

  return (
    <NodeViewWrapper as="div" style={{ margin: '0.5rem 0' }}>
      {url ? (
        <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
          <img
            ref={imgRef}
            src={url}
            alt={alt}
            draggable={false}
            style={{
              width: w != null ? `${w}px` : undefined,
              maxWidth: '100%',
              borderRadius: '0.5rem',
              display: 'block',
              outline: selected ? '2px solid var(--color-primary)' : 'none',
              outlineOffset: '2px',
            }}
          />
          {selected && (
            <div
              onPointerDown={onResizeDown}
              onPointerMove={onResizeMove}
              onPointerUp={onResizeUp}
              title="Größe ändern"
              style={{
                position: 'absolute', right: -6, bottom: -6, width: 16, height: 16,
                background: 'var(--color-primary)', border: '2px solid #fff', borderRadius: 3,
                cursor: 'nwse-resize', touchAction: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
              }}
            />
          )}
        </div>
      ) : error ? (
        <div style={{ padding: '0.4rem 0.6rem', border: '1px dashed var(--color-outline-variant)', borderRadius: '0.5rem', color: 'var(--color-on-surface-variant)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ flex: 1 }}>Bild nicht mehr verfügbar (Anhang gelöscht)</span>
          <button
            type="button"
            onClick={() => deleteNode()}
            title="Diesen Platzhalter entfernen"
            style={{ border: 'none', background: 'rgba(248,113,113,0.15)', color: '#f87171', borderRadius: '0.35rem', padding: '0.15rem 0.5rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
          >Entfernen</button>
        </div>
      ) : (
        <div style={{ padding: '0.5rem 0.75rem', color: 'var(--color-on-surface-variant)', fontSize: '0.85rem' }}>
          Bild wird geladen…
        </div>
      )}
    </NodeViewWrapper>
  );
}
