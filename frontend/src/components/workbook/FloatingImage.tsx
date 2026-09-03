import { useEffect, useRef, useState } from 'react';
import { getAttachmentDataUrl, type PageImage } from '../../api/workbook.api';
import type { Bounds, SnapOpts } from './alignGuides';

interface Props {
  image: PageImage;
  selected: boolean;
  zoom?: number;
  onSelect: (additive?: boolean) => void;
  onCommit: (patch: Partial<Pick<PageImage, 'x' | 'y' | 'width' | 'height' | 'rotation'>>) => void;
  onDelete: () => void;
  onSnap?: (b: Bounds, opts?: SnapOpts) => { dx: number; dy: number };
  onSnapEnd?: () => void;
}

type DragState =
  | { mode: 'move'; px: number; py: number; ox: number; oy: number }
  | { mode: 'resize'; px: number; ow: number; oh: number; ratio: number }
  | { mode: 'rotate'; cx: number; cy: number; startRot: number; startAng: number }
  | null;

export function FloatingImage({ image, selected, zoom = 1, onSelect, onCommit, onDelete, onSnap, onSnapEnd }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [pos, setPos] = useState({ x: image.x, y: image.y, width: image.width, height: image.height });
  const [rot, setRot] = useState(image.rotation ?? 0);
  const drag = useRef<DragState>(null);

  // Bild mit Auth als Data-URL laden — stabil für Anzeige UND Export.
  useEffect(() => {
    let active = true;
    getAttachmentDataUrl(image.attachment_id)
      .then((u) => { if (active) setUrl(u); })
      .catch(() => {});
    return () => { active = false; };
  }, [image.attachment_id]);

  // Bei externer Änderung (z.B. Neuladen) übernehmen — außer während Drag.
  useEffect(() => {
    if (!drag.current) setPos({ x: image.x, y: image.y, width: image.width, height: image.height });
  }, [image.x, image.y, image.width, image.height]);
  useEffect(() => { if (!drag.current) setRot(image.rotation ?? 0); }, [image.rotation]);

  function onMovePointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    if (e.shiftKey || e.metaKey || e.ctrlKey) { onSelect(true); e.preventDefault(); e.stopPropagation(); return; } // zur Mehrfachauswahl hinzufügen/entfernen
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
  function onRotatePointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelect();
    const box = (e.currentTarget as HTMLElement).closest('[data-floating-image]') as HTMLElement;
    const r = box.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const startAng = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
    drag.current = { mode: 'rotate', cx, cy, startRot: rot, startAng };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const z = zoom || 1;
    if (d.mode === 'move') {
      let nx = Math.max(0, d.ox + (e.clientX - d.px) / z);
      let ny = Math.max(0, d.oy + (e.clientY - d.py) / z);
      if (onSnap) { const s = onSnap({ left: nx, top: ny, right: nx + pos.width, bottom: ny + pos.height }); nx = Math.max(0, nx + s.dx); ny = Math.max(0, ny + s.dy); }
      setPos((p) => ({ ...p, x: nx, y: ny }));
    } else if (d.mode === 'resize') {
      let w = Math.max(40, d.ow + (e.clientX - d.px) / z);
      if (onSnap) { const s = onSnap({ left: pos.x, top: pos.y, right: pos.x + w, bottom: pos.y + Math.round(w * d.ratio) }, { xEdges: ['right'], yEdges: [] }); w = Math.max(40, w + s.dx); }
      setPos((p) => ({ ...p, width: w, height: Math.max(40, Math.round(w * d.ratio)) }));
    } else {
      const ang = Math.atan2(e.clientY - d.cy, e.clientX - d.cx) * 180 / Math.PI;
      let nr = ((d.startRot + (ang - d.startAng)) % 360 + 360) % 360;
      const snap15 = (Math.round(nr / 15) * 15) % 360; // sanft auf 15°-Schritte einrasten
      if (Math.abs(nr - snap15) < 6) nr = snap15;
      setRot(nr);
    }
  }
  function onPointerUp(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    drag.current = null;
    onSnapEnd?.();
    if (d.mode === 'move') onCommit({ x: Math.round(pos.x), y: Math.round(pos.y) });
    else if (d.mode === 'resize') onCommit({ width: Math.round(pos.width), height: Math.round(pos.height) });
    else onCommit({ rotation: Math.round(rot) });
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
        transform: `rotate(${rot}deg)`, transformOrigin: 'center center',
        cursor: 'move', touchAction: 'none', userSelect: 'none',
        outline: selected ? '2px solid var(--color-primary)' : '1px solid rgba(127,127,127,0.25)',
        outlineOffset: '1px', borderRadius: '0.4rem', overflow: 'visible',
        zIndex: selected ? 30 : 10,
        // Bild als background-image (kein <img>) — Data-URL-Hintergründe kommen im
        // Export zuverlässig; transparent -> kein schwarzer Rahmen/Letterbox.
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
          {/* Drehen-Griff (oben mittig) */}
          <div
            onPointerDown={onRotatePointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            title="Drehen"
            style={{
              position: 'absolute', top: -30, left: '50%', transform: 'translateX(-50%)',
              width: 18, height: 18, borderRadius: '50%', cursor: 'grab', touchAction: 'none',
              background: 'var(--color-primary)', border: '2px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 12, color: '#fff', lineHeight: 1 }}>rotate_right</span>
          </div>
          {/* Verbindungslinie zum Dreh-Griff */}
          <div style={{ position: 'absolute', top: -12, left: '50%', width: 1, height: 12, background: 'var(--color-primary)', transform: 'translateX(-50%)', pointerEvents: 'none' }} />
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
