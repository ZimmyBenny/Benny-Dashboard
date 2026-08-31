import { useEffect, useRef, useState } from 'react';
import { getAttachmentDataUrl, type PageImage } from '../../api/workbook.api';
import type { Bounds, SnapOpts } from './alignGuides';

interface Props {
  image: PageImage;
  selected: boolean;
  onSelect: () => void;
  onCommit: (patch: Partial<Pick<PageImage, 'x' | 'y' | 'width' | 'height'>>) => void;
  onDelete: () => void;
  onSnap?: (b: Bounds, opts?: SnapOpts) => { dx: number; dy: number };
  onSnapEnd?: () => void;
}

type DragState =
  | { mode: 'move'; px: number; py: number; ox: number; oy: number }
  | { mode: 'resize'; px: number; ow: number; oh: number; ratio: number }
  | null;

export function FloatingImage({ image, selected, onSelect, onCommit, onDelete, onSnap, onSnapEnd }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [pos, setPos] = useState({ x: image.x, y: image.y, width: image.width, height: image.height });
  const drag = useRef<DragState>(null);

  // Bild mit Auth als Data-URL laden — stabil für Anzeige UND html-to-image-Export
  // (Blob-URLs werden von html-to-image nicht zuverlässig eingebettet -> leerer Kasten).
  useEffect(() => {
    let active = true;
    getAttachmentDataUrl(image.attachment_id)
      .then((u) => { if (active) setUrl(u); })
      .catch(() => {});
    return () => { active = false; };
  }, [image.attachment_id]);

  // Bei externer Änderung (z.B. Neuladen) Position übernehmen — außer während Drag.
  useEffect(() => {
    if (!drag.current) setPos({ x: image.x, y: image.y, width: image.width, height: image.height });
  }, [image.x, image.y, image.width, image.height]);

  function onMovePointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    onSelect();
    drag.current = { mode: 'move', px: e.clientX, py: e.clientY, ox: pos.x, oy: pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function onResizePointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelect();
    drag.current = { mode: 'resize', px: e.clientX, ow: pos.width, oh: pos.height, ratio: pos.height / pos.width || 0.66 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (d.mode === 'move') {
      let nx = Math.max(0, d.ox + (e.clientX - d.px));
      let ny = Math.max(0, d.oy + (e.clientY - d.py));
      if (onSnap) { const s = onSnap({ left: nx, top: ny, right: nx + pos.width, bottom: ny + pos.height }); nx = Math.max(0, nx + s.dx); ny = Math.max(0, ny + s.dy); }
      setPos((p) => ({ ...p, x: nx, y: ny }));
    } else {
      let w = Math.max(40, d.ow + (e.clientX - d.px));
      if (onSnap) { const s = onSnap({ left: pos.x, top: pos.y, right: pos.x + w, bottom: pos.y + Math.round(w * d.ratio) }, { xEdges: ['right'], yEdges: [] }); w = Math.max(40, w + s.dx); }
      setPos((p) => ({ ...p, width: w, height: Math.max(40, Math.round(w * d.ratio)) }));
    }
  }
  function onPointerUp(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    drag.current = null;
    onSnapEnd?.();
    if (d.mode === 'move') onCommit({ x: Math.round(pos.x), y: Math.round(pos.y) });
    else onCommit({ width: Math.round(pos.width), height: Math.round(pos.height) });
  }

  return (
    <div
      data-floating-image=""
      onPointerDown={onMovePointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: pos.x, top: pos.y, width: pos.width, height: pos.height,
        cursor: 'move', touchAction: 'none', userSelect: 'none',
        outline: selected ? '2px solid var(--color-primary)' : '1px solid rgba(127,127,127,0.25)',
        outlineOffset: '1px', borderRadius: '0.4rem', overflow: 'hidden',
        zIndex: selected ? 30 : 10,
        // Bild als background-image (kein <img>): html-to-image bettet Data-URL-
        // Hintergründe zuverlässig ein (<img object-fit> kam im Export schwarz raus).
        // Hintergrund transparent -> kein schwarzer Rahmen/Letterbox mehr.
        background: url ? `transparent center / contain no-repeat url("${url}")` : 'transparent',
      }}
    >

      {selected && (
        <>
          {/* Löschen */}
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); if (window.confirm('Bild löschen?')) onDelete(); }}
            title="Bild löschen"
            style={{
              position: 'absolute', top: 2, right: 2, width: 22, height: 22, borderRadius: '50%',
              border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, lineHeight: 1,
            }}
          >×</button>
          {/* Resize-Griff */}
          <div
            onPointerDown={onResizePointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            title="Größe ändern"
            style={{
              position: 'absolute', bottom: 0, right: 0, width: 16, height: 16, cursor: 'nwse-resize',
              background: 'var(--color-primary)', borderTopLeftRadius: '0.3rem', touchAction: 'none',
            }}
          />
        </>
      )}
    </div>
  );
}
