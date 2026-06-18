import { useEffect, useRef, useState } from 'react';
import { type UspPoint, type UspManufacturer, type UspFeasibility, type UspFeasibilityStatus } from '../../../api/amazon.api';
import { useSetUspFeasibility } from '../../../hooks/amazon/useUsp';

const STATUSES: { value: Exclude<UspFeasibilityStatus, 'offen'>; label: string; color: string }[] = [
  { value: 'umsetzbar', label: '✓', color: '#34d399' },
  { value: 'teilweise', label: '~', color: '#fdba74' },
  { value: 'nicht', label: '✗', color: '#fca5a5' },
];

function key(pointId: number, mId: number) { return `${pointId}:${mId}`; }

function Cell({ productId, pointId, mId, current, note, includeInPdf }: { productId: number; pointId: number; mId: number; current: UspFeasibilityStatus; note: string; includeInPdf: boolean }) {
  const set = useSetUspFeasibility(productId);
  const [n, setN] = useState(note);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => { setN(note); }, [note]);
  useEffect(() => {
    const ta = taRef.current;
    if (ta) { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight}px`; }
  }, [n]);
  return (
    <div className="flex flex-col gap-1 p-1" style={{ minWidth: 150, opacity: includeInPdf ? 1 : 0.6 }}>
      {!includeInPdf && (
        <div className="flex items-center gap-1" style={{ fontSize: 10, fontWeight: 700, color: '#fca5a5' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>block</span>
          Nicht im PDF
        </div>
      )}
      <div className="flex gap-1">
        {STATUSES.map(s => {
          const active = current === s.value;
          return (
            <button key={s.value} type="button"
              onClick={() => set.mutate({ point_id: pointId, manufacturer_id: mId, status: active ? 'offen' : s.value })}
              className="flex-1 rounded text-xs py-0.5"
              style={{ background: active ? s.color : 'var(--color-surface-container-low)', color: active ? '#08131f' : 'var(--color-on-surface-variant)', border: '1px solid rgba(255,255,255,0.08)', fontWeight: 700 }}>
              {s.label}
            </button>
          );
        })}
      </div>
      <textarea ref={taRef} value={n} rows={1} onChange={(e) => setN(e.target.value)}
        onBlur={() => { if (n !== note) set.mutate({ point_id: pointId, manufacturer_id: mId, note: n }); }}
        placeholder="Notiz" className="px-1.5 py-0.5 rounded text-xs"
        style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface-variant)', border: '1px solid rgba(255,255,255,0.06)', resize: 'none', overflow: 'hidden', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} />
    </div>
  );
}

export function UspMatrix({ productId, points, manufacturers, feasibility }: {
  productId: number; points: UspPoint[]; manufacturers: UspManufacturer[]; feasibility: UspFeasibility[];
}) {
  if (points.length === 0 || manufacturers.length === 0) return null;
  const map = new Map<string, UspFeasibility>();
  for (const f of feasibility) map.set(key(f.point_id, f.manufacturer_id), f);
  const total = points.length;
  function counts(mId: number) {
    let umsetzbar = 0, teilweise = 0, nicht = 0;
    for (const p of points) {
      const s = map.get(key(p.id, mId))?.status ?? 'offen';
      if (s === 'umsetzbar') umsetzbar++;
      else if (s === 'teilweise') teilweise++;
      else if (s === 'nicht') nicht++;
    }
    return { umsetzbar, teilweise, nicht, offen: total - umsetzbar - teilweise - nicht };
  }
  return (
    <div className="mb-4">
      <span className="text-xs uppercase tracking-wide block mb-2" style={{ color: 'var(--color-on-surface-variant)' }}>Vergleich</span>
      <div className="overflow-x-auto">
        <table style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th className="text-left px-2 py-1 text-xs" style={{ color: 'var(--color-on-surface-variant)', position: 'sticky', left: 0, background: 'var(--color-surface-container-low)' }}>Punkt</th>
              {manufacturers.map(m => (
                <th key={m.id} className="px-3 py-1 text-xs" style={{ color: 'var(--color-on-surface)', borderLeft: '2px solid rgba(255,255,255,0.14)' }}>
                  <div>{m.name || 'Hersteller'}</div>
                  {m.ansprechpartner && (
                    <div style={{ color: 'var(--color-on-surface-variant)', fontWeight: 400 }}>{m.ansprechpartner}</div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {points.map((p, idx) => (
              <tr key={p.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <td className="px-2 py-1 text-sm" style={{ position: 'sticky', left: 0, background: 'var(--color-surface-container-low)', maxWidth: 200 }}>
                  <button
                    type="button"
                    onClick={() => document.getElementById(`usp-point-${p.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                    className="text-left hover:underline"
                    style={{ color: 'var(--color-on-surface)', cursor: 'pointer', background: 'transparent', border: 'none', padding: 0 }}
                    title="Zum Punkt springen"
                  >
                    {idx + 1}. {p.title || '—'}
                  </button>
                </td>
                {manufacturers.map(m => {
                  const f = map.get(key(p.id, m.id));
                  return (
                    <td key={m.id} style={{ verticalAlign: 'top', borderLeft: '2px solid rgba(255,255,255,0.14)' }}>
                      <Cell productId={productId} pointId={p.id} mId={m.id} current={f?.status ?? 'offen'} note={f?.note ?? ''} includeInPdf={(f?.include_in_pdf ?? 1) !== 0} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid rgba(255,255,255,0.18)' }}>
              <td className="px-2 py-2 text-xs font-semibold uppercase tracking-wide" style={{ position: 'sticky', left: 0, background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface-variant)', verticalAlign: 'top' }}>Übersicht</td>
              {manufacturers.map(m => {
                const c = counts(m.id);
                const canAll = c.umsetzbar === total;
                return (
                  <td key={m.id} style={{ verticalAlign: 'top', borderLeft: '2px solid rgba(255,255,255,0.14)' }}>
                    <div className="flex flex-col gap-0.5 p-1.5 text-xs" style={{ minWidth: 150 }}>
                      <span style={{ color: '#34d399', fontWeight: 700 }}>{c.umsetzbar} umsetzbar</span>
                      <span style={{ color: '#fdba74' }}>{c.teilweise} teilweise</span>
                      <span style={{ color: '#fca5a5' }}>{c.nicht} nicht</span>
                      <span style={{ color: 'var(--color-on-surface-variant)' }}>{c.offen} offen / {total}</span>
                      {canAll && <span style={{ color: '#34d399', fontWeight: 700 }}>kann alles ✓</span>}
                    </div>
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
