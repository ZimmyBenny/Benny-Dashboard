import { useEffect, useState } from 'react';
import { type Manufacturer } from '../../../api/amazon.api';
import { useUpdateManufacturer } from '../../../hooks/amazon/useManufacturers';
import { ManufacturerOffers } from './ManufacturerOffers';

interface Props {
  productId: number;
  manufacturer: Manufacturer;
  index: number;
  dragHandleProps: React.HTMLAttributes<HTMLDivElement>;
  onRequestDelete: (m: Manufacturer) => void;
}

export function ManufacturerCard({ productId, manufacturer, index, dragHandleProps, onRequestDelete }: Props) {
  const update = useUpdateManufacturer(productId);

  const [name, setName] = useState(manufacturer.name);
  const [ansprechpartner, setAnsprechpartner] = useState(manufacturer.ansprechpartner ?? '');
  const [adresse, setAdresse] = useState(manufacturer.adresse ?? '');
  const [email, setEmail] = useState(manufacturer.email ?? '');
  const [webseite, setWebseite] = useState(manufacturer.webseite ?? '');
  const [notizen, setNotizen] = useState(manufacturer.notizen ?? '');

  useEffect(() => { setName(manufacturer.name); }, [manufacturer.name]);
  useEffect(() => { setAnsprechpartner(manufacturer.ansprechpartner ?? ''); }, [manufacturer.ansprechpartner]);
  useEffect(() => { setAdresse(manufacturer.adresse ?? ''); }, [manufacturer.adresse]);
  useEffect(() => { setEmail(manufacturer.email ?? ''); }, [manufacturer.email]);
  useEffect(() => { setWebseite(manufacturer.webseite ?? ''); }, [manufacturer.webseite]);
  useEffect(() => { setNotizen(manufacturer.notizen ?? ''); }, [manufacturer.notizen]);

  const inputStyle = {
    background: 'var(--color-surface-container-low)',
    color: 'var(--color-on-surface)',
    border: '1px solid rgba(255,255,255,0.08)',
  };
  const inputStyleVariant = {
    background: 'var(--color-surface-container-low)',
    color: 'var(--color-on-surface-variant)',
    border: '1px solid rgba(255,255,255,0.08)',
  };

  return (
    <div
      className="rounded-lg p-4"
      style={{
        background: 'var(--color-surface-container)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderLeft: '3px solid #34d399',
        boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
      }}
    >
      {/* Header row: drag handle + name + delete */}
      <div className="flex items-center gap-2 mb-3">
        <div
          {...dragHandleProps}
          className="flex items-center justify-center rounded-md cursor-grab select-none flex-shrink-0"
          style={{ width: 26, height: 26, background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface-variant)' }}
          title="Zum Sortieren ziehen"
        >
          <span style={{ fontSize: 12, fontWeight: 700 }}>{index + 1}</span>
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { if (name !== manufacturer.name) update.mutate({ mId: manufacturer.id, patch: { name } }); }}
          placeholder="Herstellername"
          className="flex-1 px-2 py-1.5 rounded-md text-sm font-semibold"
          style={inputStyle}
        />
        <button
          type="button"
          onClick={() => onRequestDelete(manufacturer)}
          className="p-1.5 rounded-md flex-shrink-0"
          style={{ color: '#fca5a5' }}
          aria-label="Hersteller löschen"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
        </button>
      </div>

      {/* Stammdaten */}
      <div className="flex flex-col gap-2">
        <input
          value={ansprechpartner}
          onChange={(e) => setAnsprechpartner(e.target.value)}
          onBlur={() => { if (ansprechpartner !== (manufacturer.ansprechpartner ?? '')) update.mutate({ mId: manufacturer.id, patch: { ansprechpartner } }); }}
          placeholder="Ansprechpartner"
          className="w-full px-2 py-1.5 rounded-md text-sm"
          style={inputStyleVariant}
        />
        <textarea
          value={adresse}
          onChange={(e) => setAdresse(e.target.value)}
          onBlur={() => { if (adresse !== (manufacturer.adresse ?? '')) update.mutate({ mId: manufacturer.id, patch: { adresse } }); }}
          placeholder="Adresse"
          rows={2}
          className="w-full px-2 py-1.5 rounded-md text-sm"
          style={{ ...inputStyleVariant, resize: 'vertical' }}
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => { if (email !== (manufacturer.email ?? '')) update.mutate({ mId: manufacturer.id, patch: { email } }); }}
          placeholder="E-Mail"
          className="w-full px-2 py-1.5 rounded-md text-sm"
          style={inputStyleVariant}
        />
        <input
          value={webseite}
          onChange={(e) => setWebseite(e.target.value)}
          onBlur={() => { if (webseite !== (manufacturer.webseite ?? '')) update.mutate({ mId: manufacturer.id, patch: { webseite } }); }}
          placeholder="Webseite"
          className="w-full px-2 py-1.5 rounded-md text-sm"
          style={inputStyleVariant}
        />
        <div>
          <span className="text-xs uppercase tracking-wide block mb-1" style={{ color: 'var(--color-on-surface-variant)' }}>Notizen</span>
          <textarea
            value={notizen}
            onChange={(e) => setNotizen(e.target.value)}
            onBlur={() => { if (notizen !== (manufacturer.notizen ?? '')) update.mutate({ mId: manufacturer.id, patch: { notizen } }); }}
            placeholder="Notizen zum Hersteller …"
            rows={3}
            className="w-full px-2 py-1.5 rounded-md text-sm"
            style={{ ...inputStyleVariant, resize: 'vertical' }}
          />
        </div>
      </div>

      {/* Angebote */}
      <ManufacturerOffers productId={productId} mId={manufacturer.id} offers={manufacturer.offers} />
    </div>
  );
}
