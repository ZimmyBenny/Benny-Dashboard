import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { type Manufacturer } from '../../api/amazon.api';
import { useManufacturers, useUpdateManufacturer, useDeleteManufacturer } from '../../hooks/amazon/useManufacturers';
import { ManufacturerOffers } from '../../components/amazon/manufacturers/ManufacturerOffers';

const ACCENT = '#34d399';

function DeleteDialog({ name, onConfirm, onClose }: { name: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="rounded-xl p-5 w-[90%] max-w-sm" style={{ background: 'var(--color-surface-container-high)', border: '1px solid rgba(255,255,255,0.08)' }} onClick={(e) => e.stopPropagation()}>
        <p className="mb-4" style={{ color: 'var(--color-on-surface)' }}>Hersteller „{name || 'Hersteller'}" wird dauerhaft gelöscht.</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md text-sm" style={{ background: 'var(--color-surface-container)', color: 'var(--color-on-surface)' }}>Abbrechen</button>
          <button type="button" onClick={() => { onConfirm(); onClose(); }} className="px-3 py-1.5 rounded-md text-sm" style={{ background: '#7f1d1d', color: '#fecaca' }}>Löschen</button>
        </div>
      </div>
    </div>
  );
}

function Stammdaten({ productId, manufacturer }: { productId: number; manufacturer: Manufacturer }) {
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
  const s = { background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface-variant)', border: '1px solid rgba(255,255,255,0.08)' };
  const mId = manufacturer.id;
  return (
    <div className="flex flex-col gap-2">
      <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => { if (name !== manufacturer.name) update.mutate({ mId, patch: { name } }); }} placeholder="Herstellername" className="w-full px-2 py-1.5 rounded-md text-sm font-semibold" style={{ ...s, color: 'var(--color-on-surface)' }} />
      <input value={ansprechpartner} onChange={(e) => setAnsprechpartner(e.target.value)} onBlur={() => { if (ansprechpartner !== (manufacturer.ansprechpartner ?? '')) update.mutate({ mId, patch: { ansprechpartner } }); }} placeholder="Ansprechpartner" className="w-full px-2 py-1.5 rounded-md text-sm" style={s} />
      <textarea value={adresse} onChange={(e) => setAdresse(e.target.value)} onBlur={() => { if (adresse !== (manufacturer.adresse ?? '')) update.mutate({ mId, patch: { adresse } }); }} placeholder="Adresse" rows={2} className="w-full px-2 py-1.5 rounded-md text-sm" style={{ ...s, resize: 'vertical' }} />
      <input value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => { if (email !== (manufacturer.email ?? '')) update.mutate({ mId, patch: { email } }); }} placeholder="E-Mail" className="w-full px-2 py-1.5 rounded-md text-sm" style={s} />
      <input value={webseite} onChange={(e) => setWebseite(e.target.value)} onBlur={() => { if (webseite !== (manufacturer.webseite ?? '')) update.mutate({ mId, patch: { webseite } }); }} placeholder="Webseite" className="w-full px-2 py-1.5 rounded-md text-sm" style={s} />
      <div>
        <span className="text-xs uppercase tracking-wide block mb-1" style={{ color: 'var(--color-on-surface-variant)' }}>Notizen</span>
        <textarea value={notizen} onChange={(e) => setNotizen(e.target.value)} onBlur={() => { if (notizen !== (manufacturer.notizen ?? '')) update.mutate({ mId, patch: { notizen } }); }} placeholder="Notizen zum Hersteller …" rows={3} className="w-full px-2 py-1.5 rounded-md text-sm" style={{ ...s, resize: 'vertical' }} />
      </div>
    </div>
  );
}

export function ManufacturerDetailPage() {
  const { id: idParam, mId: mIdParam } = useParams<{ id: string; mId: string }>();
  const navigate = useNavigate();
  const productId = Number(idParam);
  const mId = Number(mIdParam);
  const { data, isLoading } = useManufacturers(productId);
  const del = useDeleteManufacturer(productId);
  const [pendingDelete, setPendingDelete] = useState(false);
  const backTo = `/amazon/entwicklung/products/${productId}`;

  if (!Number.isInteger(productId) || !Number.isInteger(mId)) {
    return (<PageWrapper><p style={{ color: 'var(--color-on-surface-variant)' }}>Ungueltige Adresse.</p></PageWrapper>);
  }
  if (isLoading || !data) {
    return (<PageWrapper><p style={{ color: 'var(--color-on-surface-variant)' }}>Lade Hersteller …</p></PageWrapper>);
  }
  const manufacturer = data.manufacturers.find(m => m.id === mId);
  if (!manufacturer) {
    return (
      <PageWrapper>
        <div className="flex flex-col gap-3">
          <p style={{ color: 'var(--color-on-surface)' }}>Hersteller nicht gefunden.</p>
          <Link to={backTo} className="px-3 py-1.5 rounded-md text-sm self-start" style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}>Zurück zum Produkt</Link>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <header className="flex items-center gap-4 mb-6">
        <button type="button" onClick={() => navigate(backTo)} aria-label="Zurück" className="p-2 rounded-md" style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}>
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--color-surface-container)' }}>
          <span className="material-symbols-outlined" style={{ color: ACCENT }}>factory</span>
        </div>
        <h1 className="flex-1 min-w-0 text-2xl font-bold truncate" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>{manufacturer.name || 'Hersteller'}</h1>
        <button type="button" onClick={() => setPendingDelete(true)} className="p-2 rounded-md flex-shrink-0" style={{ color: '#fca5a5' }} aria-label="Hersteller löschen">
          <span className="material-symbols-outlined">delete</span>
        </button>
      </header>

      <div className="rounded-xl p-5 flex flex-col gap-5" style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)', borderLeft: `3px solid ${ACCENT}` }}>
        <Stammdaten productId={productId} manufacturer={manufacturer} />
        <ManufacturerOffers productId={productId} mId={manufacturer.id} offers={manufacturer.offers} />
      </div>

      {pendingDelete && (
        <DeleteDialog name={manufacturer.name} onConfirm={() => { del.mutate(manufacturer.id); navigate(backTo); }} onClose={() => setPendingDelete(false)} />
      )}
    </PageWrapper>
  );
}
