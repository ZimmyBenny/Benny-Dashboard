import { useEffect, useState } from 'react';
import { type UspPoint, type UspManufacturer, type UspFeasibility, type UspFeasibilityStatus } from '../../../api/amazon.api';
import { useSetUspFeasibility } from '../../../hooks/amazon/useUsp';

const STATUSES: { value: Exclude<UspFeasibilityStatus, 'offen'>; label: string; color: string }[] = [
  { value: 'umsetzbar', label: '✓', color: '#34d399' },
  { value: 'teilweise', label: '~', color: '#fdba74' },
  { value: 'nicht', label: '✗', color: '#fca5a5' },
];

function key(pointId: number, mId: number) { return `${pointId}:${mId}`; }

function Cell({ productId, pointId, mId, current, note }: { productId: number; pointId: number; mId: number; current: UspFeasibilityStatus; note: string }) {
  const set = useSetUspFeasibility(productId);
  const [n, setN] = useState(note);
  useEffect(() => { setN(note); }, [note]);
  return (
    <div className="flex flex-col gap-1 p-1" style={{ minWidth: 120 }}>
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
      <input value={n} onChange={(e) => setN(e.target.value)}
        onBlur={() => { if (n !== note) set.mutate({ point_id: pointId, manufacturer_id: mId, note: n }); }}
        placeholder="Notiz" className="px-1.5 py-0.5 rounded text-xs"
        style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface-variant)', border: '1px solid rgba(255,255,255,0.06)' }} />
    </div>
  );
}

export function UspMatrix({ productId, points, manufacturers, feasibility }: {
  productId: number; points: UspPoint[]; manufacturers: UspManufacturer[]; feasibility: UspFeasibility[];
}) {
  if (points.length === 0 || manufacturers.length === 0) return null;
  const map = new Map<string, UspFeasibility>();
  for (const f of feasibility) map.set(key(f.point_id, f.manufacturer_id), f);
  return (
    <div className="mb-4">
      <span className="text-xs uppercase tracking-wide block mb-2" style={{ color: 'var(--color-on-surface-variant)' }}>Vergleich</span>
      <div className="overflow-x-auto">
        <table style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th className="text-left px-2 py-1 text-xs" style={{ color: 'var(--color-on-surface-variant)', position: 'sticky', left: 0, background: 'var(--color-surface-container-low)' }}>Punkt</th>
              {manufacturers.map(m => (
                <th key={m.id} className="px-2 py-1 text-xs" style={{ color: 'var(--color-on-surface)' }}>
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
                <td className="px-2 py-1 text-sm" style={{ color: 'var(--color-on-surface)', position: 'sticky', left: 0, background: 'var(--color-surface-container-low)', maxWidth: 200 }}>
                  {idx + 1}. {p.title || '—'}
                </td>
                {manufacturers.map(m => {
                  const f = map.get(key(p.id, m.id));
                  return (
                    <td key={m.id} style={{ verticalAlign: 'top' }}>
                      <Cell productId={productId} pointId={p.id} mId={m.id} current={f?.status ?? 'offen'} note={f?.note ?? ''} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
