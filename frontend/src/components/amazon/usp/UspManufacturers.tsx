import { useEffect, useState } from 'react';
import { type UspManufacturer } from '../../../api/amazon.api';
import { useCreateUspManufacturer, useUpdateUspManufacturer, useDeleteUspManufacturer, useUebernehmeUspManufacturer } from '../../../hooks/amazon/useUsp';
import { DeleteUspManufacturerDialog } from './DeleteUspManufacturerDialog';

function ManufacturerCard({ productId, m }: { productId: number; m: UspManufacturer }) {
  const update = useUpdateUspManufacturer(productId);
  const del = useDeleteUspManufacturer(productId);
  const uebernehmen = useUebernehmeUspManufacturer(productId);
  const [name, setName] = useState(m.name);
  const [ansprechpartner, setAnsprechpartner] = useState(m.ansprechpartner ?? '');
  const [datum, setDatum] = useState(m.datum ?? '');
  const [pendingDelete, setPendingDelete] = useState(false);
  useEffect(() => { setName(m.name); }, [m.name]);
  useEffect(() => { setAnsprechpartner(m.ansprechpartner ?? ''); }, [m.ansprechpartner]);
  useEffect(() => { setDatum(m.datum ?? ''); }, [m.datum]);

  const nameEmpty = m.name.trim() === '';
  const isUebernommen = m.manufacturer_id != null;

  return (
    <div className="rounded-lg p-2 flex flex-col gap-1.5" style={{ minWidth: 160, background: 'var(--color-surface-container)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-1">
        <input value={name} onChange={(e) => setName(e.target.value)}
          onBlur={() => { if (name !== m.name) update.mutate({ mId: m.id, patch: { name } }); }}
          placeholder="Hersteller" className="flex-1 px-2 py-1 rounded-md text-sm"
          style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }} />
        <button type="button" onClick={() => setPendingDelete(true)} className="p-1 rounded-md" style={{ color: '#fca5a5' }} aria-label="Hersteller löschen">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
        </button>
      </div>
      <input value={ansprechpartner} onChange={(e) => setAnsprechpartner(e.target.value)}
        onBlur={() => { if (ansprechpartner !== (m.ansprechpartner ?? '')) update.mutate({ mId: m.id, patch: { ansprechpartner } }); }}
        placeholder="Ansprechpartner" className="px-2 py-1 rounded-md text-xs"
        style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface-variant)', border: '1px solid rgba(255,255,255,0.08)' }} />
      <input value={datum} onChange={(e) => setDatum(e.target.value)}
        onBlur={() => { if (datum !== (m.datum ?? '')) update.mutate({ mId: m.id, patch: { datum } }); }}
        placeholder="Datum" className="px-2 py-1 rounded-md text-xs"
        style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface-variant)', border: '1px solid rgba(255,255,255,0.08)' }} />
      {isUebernommen ? (
        <button type="button" disabled className="px-2 py-1 rounded-md text-xs flex items-center gap-1 cursor-default"
          style={{ background: '#34d399', color: '#052e16', border: '1px solid #34d399', opacity: 0.85 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>check_circle</span>
          übernommen
        </button>
      ) : (
        <button
          type="button"
          disabled={nameEmpty || uebernehmen.isPending}
          title={nameEmpty ? 'erst Namen eingeben' : undefined}
          onClick={() => uebernehmen.mutate(m.id)}
          className="px-2 py-1 rounded-md text-xs flex items-center gap-1"
          style={{
            background: nameEmpty ? 'var(--color-surface-container-high)' : '#60a5fa',
            color: nameEmpty ? 'var(--color-on-surface-variant)' : '#08131f',
            border: nameEmpty ? '1px solid rgba(255,255,255,0.08)' : '1px solid #60a5fa',
            opacity: nameEmpty ? 0.5 : 1,
            cursor: nameEmpty ? 'not-allowed' : 'pointer',
          }}>
          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>factory</span>
          In Hersteller übernehmen
        </button>
      )}
      {pendingDelete && (
        <DeleteUspManufacturerDialog manufacturerName={m.name} onConfirm={() => del.mutate(m.id)} onClose={() => setPendingDelete(false)} />
      )}
    </div>
  );
}

export function UspManufacturers({ productId, manufacturers }: { productId: number; manufacturers: UspManufacturer[] }) {
  const create = useCreateUspManufacturer(productId);
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-on-surface-variant)' }}>Hersteller</span>
        <button type="button" onClick={() => create.mutate(undefined)} className="px-2.5 py-1 rounded-md text-xs flex items-center gap-1"
          style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>Hersteller
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {manufacturers.map(m => <ManufacturerCard key={m.id} productId={productId} m={m} />)}
      </div>
    </div>
  );
}
