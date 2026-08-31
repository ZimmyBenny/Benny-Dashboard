// Smart-Guides für frei platzierte Elemente (Bilder & Annotationen).
// Beim Ziehen wird geprüft, ob eine Kante oder die Mitte des bewegten Elements
// mit einer Kante/Mitte eines anderen Elements fluchtet. Ist der Abstand klein
// genug, rastet das Element ein (dx/dy) und es wird eine Hilfslinie gezeichnet.

export interface Bounds { left: number; top: number; right: number; bottom: number }
export interface Guide { axis: 'v' | 'h'; pos: number; start: number; end: number }
export type XEdge = 'left' | 'cx' | 'right';
export type YEdge = 'top' | 'cy' | 'bottom';
export interface SnapOpts { xEdges?: XEdge[]; yEdges?: YEdge[] }

const SNAP = 6; // Einrast-Abstand in px

export function snapBounds(
  moving: Bounds,
  targets: Bounds[],
  opts: SnapOpts = {},
): { dx: number; dy: number; guides: Guide[] } {
  const xEdges = opts.xEdges ?? ['left', 'cx', 'right'];
  const yEdges = opts.yEdges ?? ['top', 'cy', 'bottom'];
  const mx: Record<XEdge, number> = { left: moving.left, cx: (moving.left + moving.right) / 2, right: moving.right };
  const my: Record<YEdge, number> = { top: moving.top, cy: (moving.top + moving.bottom) / 2, bottom: moving.bottom };

  let bestX: { d: number; pos: number } | null = null;
  let bestY: { d: number; pos: number } | null = null;

  for (const t of targets) {
    const tx = [t.left, (t.left + t.right) / 2, t.right];
    const ty = [t.top, (t.top + t.bottom) / 2, t.bottom];
    for (const e of xEdges) {
      for (const tp of tx) {
        const d = tp - mx[e];
        if (Math.abs(d) <= SNAP && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, pos: tp };
      }
    }
    for (const e of yEdges) {
      for (const tp of ty) {
        const d = tp - my[e];
        if (Math.abs(d) <= SNAP && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, pos: tp };
      }
    }
  }

  const dx = bestX ? bestX.d : 0;
  const dy = bestY ? bestY.d : 0;
  const snapped: Bounds = { left: moving.left + dx, top: moving.top + dy, right: moving.right + dx, bottom: moving.bottom + dy };
  const guides: Guide[] = [];

  if (bestX) {
    let start = snapped.top, end = snapped.bottom;
    for (const t of targets) {
      if (near(t.left, bestX.pos) || near((t.left + t.right) / 2, bestX.pos) || near(t.right, bestX.pos)) {
        start = Math.min(start, t.top); end = Math.max(end, t.bottom);
      }
    }
    guides.push({ axis: 'v', pos: bestX.pos, start, end });
  }
  if (bestY) {
    let start = snapped.left, end = snapped.right;
    for (const t of targets) {
      if (near(t.top, bestY.pos) || near((t.top + t.bottom) / 2, bestY.pos) || near(t.bottom, bestY.pos)) {
        start = Math.min(start, t.left); end = Math.max(end, t.right);
      }
    }
    guides.push({ axis: 'h', pos: bestY.pos, start, end });
  }
  return { dx, dy, guides };
}

function near(a: number, b: number): boolean { return Math.abs(a - b) < 0.5; }
