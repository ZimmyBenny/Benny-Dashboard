import { type Manufacturer } from '../../../api/amazon.api';
import { eurPreis, parsePreis } from '../../../hooks/amazon/useManufacturers';

interface Props {
  manufacturers: Manufacturer[];
  rate: number | null;
}

export function ManufacturerComparison({ manufacturers, rate }: Props) {
  const rows: { herstellerName: string; offer: (typeof manufacturers)[0]['offers'][0]; machbarkeit: Manufacturer['machbarkeit'] }[] = [];
  for (const m of manufacturers) {
    for (const o of m.offers) {
      rows.push({ herstellerName: m.name, offer: o, machbarkeit: m.machbarkeit });
    }
  }

  if (rows.length === 0) {
    return (
      <div className="mt-4 rounded-xl p-4" style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>Noch keine Angebote erfasst.</p>
      </div>
    );
  }

  const eurOf = (o: { preis: string | null; currency: 'USD' | 'EUR' }) => eurPreis(o, rate);
  const sorted = [...rows].sort((a, b) => {
    const pa = eurOf(a.offer); const pb = eurOf(b.offer);
    if (pa !== null && pb !== null) return pa - pb;
    if (pa !== null) return -1;
    if (pb !== null) return 1;
    return 0;
  });
  const cheapestId = (() => { for (const r of sorted) if (eurOf(r.offer) !== null) return r.offer.id; return null; })();
  const fmtEur = (n: number | null) => n === null ? '—' : n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  // Gesamtinvest = EUR-Stückpreis × MOQ (Mindestbestellmenge)
  const investOf = (o: { preis: string | null; currency: 'USD' | 'EUR'; moq: string | null }) => {
    const p = eurOf(o); const q = parsePreis(o.moq);
    return p !== null && q !== null ? p * q : null;
  };

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
              <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: 'var(--color-on-surface-variant)' }}>EUR-Preis</th>
              <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: 'var(--color-on-surface-variant)' }}>MOQ</th>
              <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: 'var(--color-on-surface-variant)' }}>Gesamtinvest (€)</th>
              <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: 'var(--color-on-surface-variant)' }}>Lieferzeit</th>
              <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: 'var(--color-on-surface-variant)' }}>Datum</th>
              <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: 'var(--color-on-surface-variant)' }}>Machbarkeit</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ herstellerName, offer, machbarkeit }) => {
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
                  <td className="px-3 py-2 text-xs" style={{ color: 'var(--color-on-surface)' }}>{herstellerName}{offer.is_latest ? <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px]" style={{ background: '#fbbf24', color: '#08131f' }}>Aktuell</span> : null}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>{offer.menge_variante || '—'}</td>
                  <td className="px-3 py-2 text-xs font-medium" style={{ color: isCheapest ? '#34d399' : 'var(--color-on-surface)' }}>{offer.preis ? `${offer.preis} ${offer.currency}` : '—'}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: isCheapest ? '#34d399' : 'var(--color-on-surface)' }}>{fmtEur(eurOf(offer))}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>{offer.moq || '—'}</td>
                  <td className="px-3 py-2 text-xs font-medium" style={{ color: isCheapest ? '#34d399' : 'var(--color-on-surface)' }}>{fmtEur(investOf(offer))}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>{offer.lieferzeit || '—'}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>{offer.datum || '—'}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                    {machbarkeit
                      ? `${machbarkeit.umsetzbar} umsetzbar · ${machbarkeit.teilweise} teilweise · ${machbarkeit.nicht} nicht · ${machbarkeit.offen} offen`
                      : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
