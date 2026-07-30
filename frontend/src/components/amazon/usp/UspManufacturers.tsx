import { useEffect, useState } from 'react';
import { type UspManufacturer } from '../../../api/amazon.api';
import { useUpdateUspManufacturer } from '../../../hooks/amazon/useUsp';

/**
 * Spiegelt die Hersteller-Sektion (amazon_manufacturers): Name + Ansprechpartner
 * kommen von dort (nur Anzeige) — gepflegt wird ausschliesslich in der
 * Hersteller-Sektion. Nur das USP-eigene Datum (Prüfnotiz) bleibt hier editierbar.
 */
function ManufacturerCard({ productId, m }: { productId: number; m: UspManufacturer }) {
  const update = useUpdateUspManufacturer(productId);
  const [datum, setDatum] = useState(m.datum ?? '');
  useEffect(() => { setDatum(m.datum ?? ''); }, [m.datum]);

  const displayName = m.name.trim() || 'Hersteller';

  return (
    <div className="rounded-lg p-2 flex flex-col gap-1.5" style={{ minWidth: 160, background: 'var(--color-surface-container)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="px-2 py-1 rounded-md text-sm font-medium" style={{ color: 'var(--color-on-surface)' }} title={displayName}>
        {displayName}
      </div>
      {m.ansprechpartner && m.ansprechpartner.trim() !== '' && (
        <div className="px-2 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
          {m.ansprechpartner}
        </div>
      )}
      <input value={datum} onChange={(e) => setDatum(e.target.value)}
        onBlur={() => { if (datum !== (m.datum ?? '')) update.mutate({ mId: m.id, patch: { datum } }); }}
        placeholder="Datum" className="px-2 py-1 rounded-md text-xs"
        style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface-variant)', border: '1px solid rgba(255,255,255,0.08)' }} />
    </div>
  );
}

export function UspManufacturers({ productId, manufacturers }: { productId: number; manufacturers: UspManufacturer[] }) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-on-surface-variant)' }}>Hersteller</span>
        <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)', opacity: 0.7 }}>
          Verwaltung im Hersteller-Bereich
        </span>
      </div>
      {manufacturers.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
          Noch keine Hersteller — im Hersteller-Bereich anlegen.
        </p>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {manufacturers.map(m => <ManufacturerCard key={m.id} productId={productId} m={m} />)}
        </div>
      )}
    </div>
  );
}
