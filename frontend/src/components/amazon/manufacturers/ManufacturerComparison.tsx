import { type Manufacturer } from '../../../api/amazon.api';
import { parsePreis } from '../../../hooks/amazon/useManufacturers';

interface Props {
  manufacturers: Manufacturer[];
}

export function ManufacturerComparison({ manufacturers }: Props) {
  const rows: { herstellerName: string; offer: (typeof manufacturers)[0]['offers'][0] }[] = [];
  for (const m of manufacturers) {
    for (const o of m.offers) {
      rows.push({ herstellerName: m.name, offer: o });
    }
  }

  if (rows.length === 0) {
    return (
      <div className="mt-4 rounded-xl p-4" style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>Noch keine Angebote erfasst.</p>
      </div>
    );
  }

  // Sort by parsed price ascending; unparseable prices go to end
  const sorted = [...rows].sort((a, b) => {
    const pa = parsePreis(a.offer.preis);
    const pb = parsePreis(b.offer.preis);
    if (pa !== null && pb !== null) return pa - pb;
    if (pa !== null) return -1;
    if (pb !== null) return 1;
    return 0;
  });

  // Find cheapest parseable price (the first row after sorting that has a parsed price)
  const cheapestId = (() => {
    for (const row of sorted) {
      if (parsePreis(row.offer.preis) !== null) return row.offer.id;
    }
    return null;
  })();

  return (
    <div className="mt-4 rounded-xl overflow-hidden" style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="px-4 pt-3 pb-2 flex items-center gap-2">
        <span className="material-symbols-outlined text-sm" style={{ color: '#34d399', fontSize: 18 }}>compare_arrows</span>
        <span className="text-xs uppercase tracking-wide font-semibold" style={{ color: '#34d399' }}>Angebotsvergleich</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr style={{ background: 'var(--color-surface-container)' }}>
              <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: 'var(--color-on-surface-variant)' }}>Hersteller</th>
              <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: 'var(--color-on-surface-variant)' }}>Menge/Variante</th>
              <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: 'var(--color-on-surface-variant)' }}>Preis</th>
              <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: 'var(--color-on-surface-variant)' }}>MOQ</th>
              <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: 'var(--color-on-surface-variant)' }}>Lieferzeit</th>
              <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: 'var(--color-on-surface-variant)' }}>Datum</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ herstellerName, offer }) => {
              const isCheapest = cheapestId !== null && offer.id === cheapestId;
              return (
                <tr
                  key={offer.id}
                  style={
                    isCheapest
                      ? { background: 'rgba(52,211,153,0.18)', borderLeft: '3px solid #34d399' }
                      : { borderLeft: '3px solid transparent' }
                  }
                >
                  <td className="px-3 py-2 text-xs" style={{ color: 'var(--color-on-surface)' }}>{herstellerName}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>{offer.menge_variante || '—'}</td>
                  <td className="px-3 py-2 text-xs font-medium" style={{ color: isCheapest ? '#34d399' : 'var(--color-on-surface)' }}>{offer.preis || '—'}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>{offer.moq || '—'}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>{offer.lieferzeit || '—'}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>{offer.datum || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
