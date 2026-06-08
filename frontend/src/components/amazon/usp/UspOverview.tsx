import { type UspPoint, type UspManufacturer, type UspFeasibility } from '../../../api/amazon.api';

function key(pointId: number, mId: number) { return `${pointId}:${mId}`; }

export function UspOverview({ points, manufacturers, feasibility }: {
  points: UspPoint[]; manufacturers: UspManufacturer[]; feasibility: UspFeasibility[];
}) {
  if (points.length === 0 || manufacturers.length === 0) return null;
  const map = new Map<string, string>();
  for (const f of feasibility) map.set(key(f.point_id, f.manufacturer_id), f.status);
  const total = points.length;
  const rows = manufacturers.map(m => {
    let umsetzbar = 0, teilweise = 0, nicht = 0;
    for (const p of points) {
      const s = map.get(key(p.id, m.id)) ?? 'offen';
      if (s === 'umsetzbar') umsetzbar++; else if (s === 'teilweise') teilweise++; else if (s === 'nicht') nicht++;
    }
    return { m, umsetzbar, teilweise, nicht, offen: total - umsetzbar - teilweise - nicht, canAll: umsetzbar === total };
  }).sort((a, b) => b.umsetzbar - a.umsetzbar);

  return (
    <div className="mb-4">
      <span className="text-xs uppercase tracking-wide block mb-2" style={{ color: 'var(--color-on-surface-variant)' }}>Übersicht</span>
      <div className="flex flex-col gap-1">
        {rows.map(r => (
          <div key={r.m.id} className="flex items-center gap-3 rounded-md px-2 py-1 text-sm"
            style={{ background: 'var(--color-surface-container)', border: r.canAll ? '1px solid #34d399' : '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ color: 'var(--color-on-surface)', minWidth: 120 }}>{r.m.name || 'Hersteller'}</span>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
              background: r.m.gesendet ? 'rgba(52,211,153,0.15)' : 'var(--color-surface-container-low)',
              color: r.m.gesendet ? '#34d399' : 'var(--color-on-surface-variant)' }}>
              {r.m.gesendet ? 'Gesendet' : 'Nicht gesendet'}
            </span>
            <span style={{ color: '#34d399' }}>{r.umsetzbar} umsetzbar</span>
            <span style={{ color: '#fdba74' }}>{r.teilweise} teilweise</span>
            <span style={{ color: '#fca5a5' }}>{r.nicht} nicht</span>
            <span style={{ color: 'var(--color-on-surface-variant)' }}>{r.offen} offen</span>
            <span style={{ color: 'var(--color-on-surface-variant)', marginLeft: 'auto' }}>von {total}</span>
            {r.canAll && <span style={{ color: '#34d399', fontWeight: 700 }}>kann alles</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
