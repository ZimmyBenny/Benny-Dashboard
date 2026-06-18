import { useEffect, useRef, useState } from 'react';
import { getSamplePhotoObjectUrl, type ManufacturerSample, type SamplePhoto } from '../../../api/amazon.api';
import {
  useCreateSampleM, useUpdateSampleM, useDeleteSampleM,
  useUploadSamplePhoto, useDeleteSamplePhoto, parsePreis,
} from '../../../hooks/amazon/useManufacturers';

function formatBetrag(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)',
};
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 20 * 1024 * 1024;
const STATUS_OPTS: ManufacturerSample['status'][] = ['angefragt', 'bestellt', 'erhalten', 'abgelehnt'];

function PhotoThumb({ productId, mId, sId, photo, onDelete }: { productId: number; mId: number; sId: number; photo: SamplePhoto; onDelete: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let revoked = false; let url: string | null = null;
    getSamplePhotoObjectUrl(productId, mId, sId, photo.id).then(u => { if (revoked) { URL.revokeObjectURL(u); return; } url = u; setSrc(u); }).catch(() => setSrc(null));
    return () => { revoked = true; if (url) URL.revokeObjectURL(url); };
  }, [productId, mId, sId, photo.id]);
  return (
    <div className="relative group" style={{ width: 88, height: 88 }}>
      {src ? <a href={src} target="_blank" rel="noopener noreferrer"><img src={src} alt="" className="w-full h-full object-cover rounded-md" /></a>
           : <div className="w-full h-full rounded-md" style={{ background: 'var(--color-surface-container-low)' }} />}
      <button type="button" onClick={onDelete}
        className="absolute top-1 right-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity px-1"
        style={{ background: 'rgba(0,0,0,0.6)', color: '#fca5a5' }} aria-label="Foto entfernen">
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
      </button>
    </div>
  );
}

function SampleBlock({ productId, mId, sample, rate }: { productId: number; mId: number; sample: ManufacturerSample; rate: number | null }) {
  const update = useUpdateSampleM(productId);
  const del = useDeleteSampleM(productId);
  const upload = useUploadSamplePhoto(productId);
  const delPhoto = useDeleteSamplePhoto(productId);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [bez, setBez] = useState(sample.bezeichnung);
  const [datum, setDatum] = useState(sample.received_date ?? '');
  const [notizen, setNotizen] = useState(sample.notizen ?? '');
  const [maengel, setMaengel] = useState(sample.maengel ?? '');
  const [kosten, setKosten] = useState(sample.kosten ?? '');
  const [sendung, setSendung] = useState(sample.sendungsnummer ?? '');
  const [link, setLink] = useState(sample.link_url ?? '');
  useEffect(() => { setBez(sample.bezeichnung); }, [sample.bezeichnung]);
  useEffect(() => { setDatum(sample.received_date ?? ''); }, [sample.received_date]);
  useEffect(() => { setNotizen(sample.notizen ?? ''); }, [sample.notizen]);
  useEffect(() => { setMaengel(sample.maengel ?? ''); }, [sample.maengel]);
  useEffect(() => { setKosten(sample.kosten ?? ''); }, [sample.kosten]);
  useEffect(() => { setSendung(sample.sendungsnummer ?? ''); }, [sample.sendungsnummer]);
  useEffect(() => { setLink(sample.link_url ?? ''); }, [sample.link_url]);

  function save(patch: Parameters<typeof update.mutate>[0]['patch']) { update.mutate({ mId, sId: sample.id, patch }); }

  function pick(f: File | undefined | null) {
    if (!f) return;
    if (!ALLOWED.includes(f.type)) { setErr('Nur JPG, PNG oder WEBP.'); return; }
    if (f.size > MAX_BYTES) { setErr('Bild größer als 20 MB.'); return; }
    setErr(null);
    upload.mutate({ mId, sId: sample.id, file: f });
  }
  function pickMany(files: FileList | null | undefined) {
    if (!files) return;
    Array.from(files).forEach(pick);
  }
  function onPaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items; if (!items) return;
    let handled = false;
    for (const it of items) if (it.kind === 'file') {
      const f = it.getAsFile();
      if (f && ALLOWED.includes(f.type) && f.size <= MAX_BYTES) { upload.mutate({ mId, sId: sample.id, file: f }); handled = true; }
    }
    if (handled) { e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }
  }

  return (
    <div className="rounded-lg p-3" onPaste={onPaste} data-card-paste
      style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => save({ is_favorite: sample.is_favorite ? 0 : 1 })}
          style={{ color: sample.is_favorite ? '#fbbf24' : 'var(--color-on-surface-variant)' }} title="Favorit/Gewinner">
          <span className="material-symbols-outlined" style={{ fontSize: 18, fontVariationSettings: sample.is_favorite ? "'FILL' 1" : "'FILL' 0" }}>star</span>
        </button>
        <input value={bez} onChange={(e) => setBez(e.target.value)} onBlur={() => { if (bez !== sample.bezeichnung) save({ bezeichnung: bez }); }}
          placeholder="Bezeichnung (z.B. Charge A)" className="flex-1 min-w-[160px] px-2 py-1 rounded text-sm font-semibold" style={INPUT_STYLE} />
        <div className="flex items-center">
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} type="button" onClick={() => save({ rating: sample.rating === n ? 0 : n })} aria-label={`${n} Sterne`}
              style={{ color: n <= sample.rating ? '#fbbf24' : 'var(--color-on-surface-variant)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, fontVariationSettings: n <= sample.rating ? "'FILL' 1" : "'FILL' 0" }}>star</span>
            </button>
          ))}
        </div>
        <select value={sample.status} onChange={(e) => save({ status: e.target.value as ManufacturerSample['status'] })}
          className="px-2 py-1 rounded text-xs" style={INPUT_STYLE}>
          {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button type="button" onClick={() => { if (confirm(`Sample „${sample.bezeichnung || 'ohne Namen'}" wirklich löschen?`)) del.mutate({ mId, sId: sample.id }); }}
          aria-label="Sample löschen" className="p-1 rounded hover:bg-white/5" style={{ color: '#fca5a5' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
        </button>
      </div>

      <div className="flex flex-wrap gap-2 items-center mt-2">
        {sample.photos.map(p => <PhotoThumb key={p.id} productId={productId} mId={mId} sId={sample.id} photo={p} onDelete={() => delPhoto.mutate({ mId, sId: sample.id, photoId: p.id })} />)}
        <button type="button" onClick={() => fileInput.current?.click()}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pickMany(e.dataTransfer.files); }}
          className="flex items-center justify-center rounded-md"
          style={{ width: 88, height: 88, border: '1px dashed rgba(255,255,255,0.2)', color: 'var(--color-on-surface-variant)' }}
          aria-label="Fotos hinzufügen" title="Klick (Mehrfachauswahl), Drag&Drop oder Cmd+V — AirDrop-Datei reinziehen">
          <span className="material-symbols-outlined">add_photo_alternate</span>
        </button>
      </div>
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden"
        onChange={(e) => { pickMany(e.target.files); e.target.value = ''; }} />
      {err && <p className="text-xs mt-1" style={{ color: '#fca5a5' }}>{err}</p>}

      <div className="flex flex-col gap-2 mt-2">
        <textarea value={notizen} onChange={(e) => setNotizen(e.target.value)} onBlur={() => { if (notizen !== (sample.notizen ?? '')) save({ notizen }); }}
          placeholder="Notizen zur Charge …" rows={2} className="w-full px-2 py-1 rounded text-sm resize-y" style={INPUT_STYLE} />
        <textarea value={maengel} onChange={(e) => setMaengel(e.target.value)} onBlur={() => { if (maengel !== (sample.maengel ?? '')) save({ maengel }); }}
          placeholder="Mängel / Verbesserungspunkte …" rows={2} className="w-full px-2 py-1 rounded text-sm resize-y" style={INPUT_STYLE} />
        <div className="flex items-center gap-2">
          <span className="text-xs w-24 flex-shrink-0" style={{ color: 'var(--color-on-surface-variant)' }}>Erhalten am</span>
          <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} onBlur={() => { if (datum !== (sample.received_date ?? '')) save({ received_date: datum }); }}
            className="px-2 py-1 rounded text-sm" style={INPUT_STYLE} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs w-24 flex-shrink-0" style={{ color: 'var(--color-on-surface-variant)' }}>Sendungsnr.</span>
          <input value={sendung} onChange={(e) => setSendung(e.target.value)} onBlur={() => { if (sendung !== (sample.sendungsnummer ?? '')) save({ sendungsnummer: sendung }); }}
            placeholder="Tracking-Nummer …" className="flex-1 px-2 py-1 rounded text-sm" style={INPUT_STYLE} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs w-24 flex-shrink-0" style={{ color: 'var(--color-on-surface-variant)' }}>Link</span>
          <input value={link} onChange={(e) => setLink(e.target.value)} onBlur={() => { if (link !== (sample.link_url ?? '')) save({ link_url: link }); }}
            placeholder="https://… (z.B. Tracking- oder Produkt-Link)" className="flex-1 px-2 py-1 rounded text-sm" style={INPUT_STYLE} />
          {sample.link_url && (
            <a href={sample.link_url} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-white/5 flex-shrink-0" title="Link öffnen" style={{ color: 'var(--color-primary)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>open_in_new</span>
            </a>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input value={kosten} onChange={(e) => setKosten(e.target.value)} onBlur={() => { if (kosten !== (sample.kosten ?? '')) save({ kosten }); }}
            placeholder="Kosten" className="px-2 py-1 rounded text-sm w-32" style={INPUT_STYLE} />
          <select value={sample.currency} onChange={(e) => save({ currency: e.target.value as 'USD' | 'EUR' })}
            className="px-2 py-1 rounded text-sm" style={INPUT_STYLE}>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
          {(() => {
            const amount = parsePreis(kosten);
            if (amount === null || !rate || rate <= 0) return null;
            const conv = sample.currency === 'USD'
              ? `≈ ${formatBetrag(amount / rate)} €`
              : `≈ ${formatBetrag(amount * rate)} $`;
            return <span className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }} title={`Kurs: 1 € = ${formatBetrag(rate)} $ (aus Angeboten)`}>{conv}</span>;
          })()}
        </div>
      </div>
    </div>
  );
}

export function ManufacturerSamples({ productId, mId, samples, rate = null }: { productId: number; mId: number; samples?: ManufacturerSample[]; rate?: number | null }) {
  const create = useCreateSampleM(productId);
  const list = samples ?? [];
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold tracking-wider" style={{ color: 'var(--color-on-surface-variant)' }}>SAMPLES</p>
      {list.map(s => <SampleBlock key={s.id} productId={productId} mId={mId} sample={s} rate={rate} />)}
      <button type="button" onClick={() => create.mutate(mId)}
        className="self-start px-2 py-1 rounded-md text-xs flex items-center gap-1"
        style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span> Sample hinzufügen
      </button>
    </div>
  );
}
