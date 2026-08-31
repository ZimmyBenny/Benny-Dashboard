import { useEffect, useRef, useState } from 'react';
import type { PageAnnotation, AnnotationPatch } from '../../api/workbook.api';

export const ANNO_PALETTE = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#ffffff', '#111827'];

interface Props {
  anno: PageAnnotation;
  selected: boolean;
  onSelect: () => void;
  onCommit: (patch: AnnotationPatch) => void;
  onDelete: () => void;
}

// Kompakte Steuerleiste (Farben, optional Schriftgröße, Löschen) über dem Element.
function Controls({ anno, left, top, onCommit, onDelete }: { anno: PageAnnotation; left: number; top: number; onCommit: Props['onCommit']; onDelete: () => void }) {
  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute', left, top: top - 34, zIndex: 60,
        display: 'flex', alignItems: 'center', gap: 4, padding: '3px 5px', borderRadius: 8,
        background: 'var(--color-surface-container-high)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
      }}
    >
      {ANNO_PALETTE.map((c) => (
        <button key={c} type="button" title={c} onClick={() => onCommit({ color: c })}
          style={{ width: 16, height: 16, borderRadius: '50%', background: c, cursor: 'pointer', border: anno.color === c ? '2px solid var(--color-primary)' : '1px solid rgba(255,255,255,0.3)' }} />
      ))}
      {anno.kind === 'text' ? (
        <>
          <button type="button" title="Kleiner" onClick={() => onCommit({ size: Math.max(10, anno.size - 2) })} style={ctrlBtn}>A−</button>
          <button type="button" title="Größer" onClick={() => onCommit({ size: Math.min(72, anno.size + 2) })} style={ctrlBtn}>A+</button>
        </>
      ) : (
        <>
          <button type="button" title="Dünner" onClick={() => onCommit({ size: Math.max(1, anno.size - 1) })} style={ctrlBtn}>–</button>
          <span style={{ fontSize: 11, color: 'var(--color-on-surface-variant)', minWidth: 22, textAlign: 'center' }}>{anno.size}px</span>
          <button type="button" title="Dicker" onClick={() => onCommit({ size: Math.min(16, anno.size + 1) })} style={ctrlBtn}>+</button>
        </>
      )}
      <button type="button" title="Löschen" onClick={onDelete} style={{ ...ctrlBtn, color: '#f87171' }}>✕</button>
    </div>
  );
}
const ctrlBtn: React.CSSProperties = { background: 'none', border: 'none', color: 'var(--color-on-surface)', cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: '0 3px' };

export function ArrowAnnotation({ anno, selected, onSelect, onCommit, onDelete }: Props) {
  const [p, setP] = useState({ x1: anno.x1, y1: anno.y1, x2: anno.x2, y2: anno.y2 });
  const drag = useRef<{ mode: 'move' | 'p1' | 'p2'; px: number; py: number; o: typeof p } | null>(null);
  useEffect(() => { if (!drag.current) setP({ x1: anno.x1, y1: anno.y1, x2: anno.x2, y2: anno.y2 }); }, [anno.x1, anno.y1, anno.x2, anno.y2]);

  const pad = 18;
  const bx = Math.min(p.x1, p.x2) - pad, by = Math.min(p.y1, p.y2) - pad;
  const w = Math.abs(p.x2 - p.x1) + 2 * pad, h = Math.abs(p.y2 - p.y1) + 2 * pad;
  const sx = p.x1 - bx, sy = p.y1 - by, ex = p.x2 - bx, ey = p.y2 - by;
  const ang = Math.atan2(ey - sy, ex - sx);
  const headLen = 9 + anno.size * 2.4, headW = 5 + anno.size * 1.6;
  const bxp = ex - headLen * Math.cos(ang), byp = ey - headLen * Math.sin(ang);
  const perpx = -Math.sin(ang), perpy = Math.cos(ang);
  const head = `${ex},${ey} ${bxp + headW * perpx},${byp + headW * perpy} ${bxp - headW * perpx},${byp - headW * perpy}`;

  function start(mode: 'move' | 'p1' | 'p2', e: React.PointerEvent) {
    e.stopPropagation(); onSelect();
    drag.current = { mode, px: e.clientX, py: e.clientY, o: { ...p } };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); e.preventDefault();
  }
  function move(e: React.PointerEvent) {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.px, dy = e.clientY - d.py;
    if (d.mode === 'move') setP({ x1: d.o.x1 + dx, y1: d.o.y1 + dy, x2: d.o.x2 + dx, y2: d.o.y2 + dy });
    else if (d.mode === 'p1') setP((q) => ({ ...q, x1: Math.max(0, d.o.x1 + dx), y1: Math.max(0, d.o.y1 + dy) }));
    else setP((q) => ({ ...q, x2: Math.max(0, d.o.x2 + dx), y2: Math.max(0, d.o.y2 + dy) }));
  }
  function up(e: React.PointerEvent) {
    if (!drag.current) return;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    drag.current = null;
    onCommit({ x1: Math.round(p.x1), y1: Math.round(p.y1), x2: Math.round(p.x2), y2: Math.round(p.y2) });
  }

  return (
    <>
      <svg style={{ position: 'absolute', left: bx, top: by, width: w, height: h, overflow: 'visible', pointerEvents: 'none', zIndex: selected ? 50 : 20 }}>
        <line x1={sx} y1={sy} x2={bxp} y2={byp} stroke={anno.color} strokeWidth={anno.size} strokeLinecap="round" />
        <polygon points={head} fill={anno.color} />
        {/* Trefferlinie */}
        <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="transparent" strokeWidth={Math.max(16, anno.size + 12)} style={{ pointerEvents: 'stroke', cursor: 'move' }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => start('move', e)} onPointerMove={move} onPointerUp={up} />
        {selected && (['p1', 'p2'] as const).map((k) => {
          const cx = k === 'p1' ? sx : ex, cy = k === 'p1' ? sy : ey;
          return <circle key={k} cx={cx} cy={cy} r={7} fill="var(--color-primary)" stroke="#fff" strokeWidth={1.5} style={{ pointerEvents: 'auto', cursor: 'grab' }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => start(k, e)} onPointerMove={move} onPointerUp={up} />;
        })}
      </svg>
      {selected && <Controls anno={anno} left={bx} top={by} onCommit={onCommit} onDelete={onDelete} />}
    </>
  );
}

export function TextAnnotation({ anno, selected, onSelect, onCommit, onDelete }: Props) {
  const [pos, setPos] = useState({ x: anno.x1, y: anno.y1 });
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!drag.current) setPos({ x: anno.x1, y: anno.y1 }); }, [anno.x1, anno.y1]);
  // Neu angelegte leere Textbox direkt fokussieren.
  useEffect(() => { if (anno.text === '' && bodyRef.current) { bodyRef.current.focus(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function gripDown(e: React.PointerEvent) {
    e.stopPropagation(); onSelect();
    drag.current = { px: e.clientX, py: e.clientY, ox: pos.x, oy: pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); e.preventDefault();
  }
  function gripMove(e: React.PointerEvent) {
    const d = drag.current; if (!d) return;
    setPos({ x: Math.max(0, d.ox + (e.clientX - d.px)), y: Math.max(0, d.oy + (e.clientY - d.py)) });
  }
  function gripUp(e: React.PointerEvent) {
    if (!drag.current) return;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId); drag.current = null;
    onCommit({ x1: Math.round(pos.x), y1: Math.round(pos.y) });
  }

  return (
    <>
      <div style={{ position: 'absolute', left: pos.x, top: pos.y, zIndex: selected ? 50 : 20, pointerEvents: 'auto' }}>
        {selected && (
          <div onPointerDown={gripDown} onPointerMove={gripMove} onPointerUp={gripUp}
            onClick={(e) => e.stopPropagation()}
            title="Verschieben"
            style={{ position: 'absolute', left: -18, top: 0, width: 16, height: 16, borderRadius: 4, background: 'var(--color-primary)', cursor: 'move', touchAction: 'none' }} />
        )}
        <div
          ref={bodyRef}
          contentEditable suppressContentEditableWarning
          onFocus={onSelect}
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
          onBlur={(e) => { const t = e.currentTarget.innerText; if (t !== anno.text) onCommit({ text: t }); }}
          style={{
            minWidth: 24, minHeight: '1em', outline: selected ? '1px dashed var(--color-primary)' : 'none',
            color: anno.color, fontSize: anno.size, fontWeight: 600, lineHeight: 1.25, whiteSpace: 'pre-wrap',
            padding: '1px 3px', cursor: 'text', fontFamily: 'var(--font-body)',
          }}
        >{anno.text}</div>
      </div>
      {selected && <Controls anno={anno} left={pos.x} top={pos.y} onCommit={onCommit} onDelete={onDelete} />}
    </>
  );
}
